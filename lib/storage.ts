import "server-only"
import * as Minio from "minio"
import { normalizeAnalysis, percentageOf } from "./crowd"
import { coordinates } from "./gps"

export const PHOTOS_BUCKET = process.env.S3_PHOTOS_BUCKET ?? "snaps"
export const RESULTS_BUCKET = process.env.S3_RESULTS_BUCKET ?? "analysis"

let client: Minio.Client

export function parseEndpoint(raw = process.env.S3_ENDPOINT ?? "localhost:9000", useTlsEnv = process.env.S3_USE_TLS) {
    const trimmed = raw.trim().replace(/\/+$/, "")
    const schemeMatch = trimmed.match(/^(https?):\/\//i)
    const hostPort = schemeMatch ? trimmed.slice(schemeMatch[0].length) : trimmed
    const match = hostPort.match(/^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/)
    if (!match) throw new Error(`Invalid S3_ENDPOINT: ${raw}`)
    const [, endPoint, port] = match
    const useSSL = useTlsEnv !== undefined ? useTlsEnv !== "false" : schemeMatch ? schemeMatch[1].toLowerCase() === "https" : true
    return {
        endPoint: endPoint.replace(/^\[|\]$/g, ""),
        port: port ? Number(port) : useSSL ? 443 : 80,
        useSSL,
    }
}

export function storage() {
    if (!client) {
        const { endPoint, port, useSSL } = parseEndpoint()
        client = new Minio.Client({
            endPoint,
            port,
            useSSL,
            accessKey: process.env.S3_ACCESS_KEY ?? "",
            secretKey: process.env.S3_SECRET_KEY ?? "",
        })
    }
    return client
}

let bucketsReady: Promise<void> | undefined
export function ensureBuckets() {
    if (!bucketsReady) {
        const s3 = storage()
        bucketsReady = (async () => {
            for (const bucket of [PHOTOS_BUCKET, RESULTS_BUCKET]) {
                if (!(await s3.bucketExists(bucket))) await s3.makeBucket(bucket)
            }
        })()
    }
    return bucketsReady
}

export type StoredObject = { path: string; size: number; modified: Date }

export async function listPhotos(): Promise<StoredObject[]> {
    const s3 = storage()
    await ensureBuckets()
    const objects: StoredObject[] = []
    const stream = s3.listObjects(PHOTOS_BUCKET, "", true)
    await new Promise<void>((resolve, reject) => {
        stream.on("data", object => { if (object.name && isImagePath(object.name)) objects.push({ path: object.name, size: object.size ?? 0, modified: object.lastModified ?? new Date(0) }) })
        stream.on("error", reject)
        stream.on("end", resolve)
    })
    return objects.sort((a, b) => b.modified.getTime() - a.modified.getTime() || a.path.localeCompare(b.path))
}

export function isImagePath(path: string) {
    return /\.(jpe?g|png)$/i.test(path)
}

export type PhotoMeta = { latitude: number | null; longitude: number | null }

function metaField(meta: Record<string, unknown> | undefined, key: string): string {
    if (!meta) return ""
    const val = meta[key] ?? meta[key.replace(/_/g, "-")] ?? meta[`x-amz-meta-${key}`] ?? meta[`x-amz-meta-${key.replace(/_/g, "-")}`]
    return typeof val === "string" ? val.trim() : ""
}

export async function putPhoto(path: string, bytes: Buffer, gps: PhotoMeta) {
    const s3 = storage()
    await ensureBuckets()
    const hasGps = gps.latitude !== null && gps.longitude !== null
    await s3.putObject(PHOTOS_BUCKET, path, bytes, bytes.length, {
        "Content-Type": path.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
        latitude: hasGps ? String(gps.latitude) : "",
        longitude: hasGps ? String(gps.longitude) : "",
        analyzed: "false",
    })
    try {
        await s3.setObjectTagging(PHOTOS_BUCKET, path, {
            analyzed: "false",
            has_gps: hasGps ? "true" : "false",
        })
    } catch (_error) {
        /* tagging is best-effort on S3 stores */
    }
}

export async function getPhoto(path: string): Promise<{ bytes: Buffer; contentType: string }> {
    const s3 = storage()
    const stream = await s3.getObject(PHOTOS_BUCKET, path)
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    return { bytes: Buffer.concat(chunks), contentType: path.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg" }
}

export async function photoMeta(path: string): Promise<PhotoMeta> {
    const s3 = storage()
    const stat = await s3.statObject(PHOTOS_BUCKET, path)
    const rawLat = metaField(stat.metaData, "latitude")
    const rawLon = metaField(stat.metaData, "longitude")
    if (!rawLat || !rawLon) return { latitude: null, longitude: null }
    return coordinates({ latitude: Number(rawLat), longitude: Number(rawLon) })
}

export async function deletePhoto(path: string) {
    const s3 = storage()
    await s3.removeObject(PHOTOS_BUCKET, path)
    try { await s3.removeObject(RESULTS_BUCKET, resultKey(path)) } catch (_error) { /* cached analysis is best-effort */ }
}

export function resultKey(path: string) {
    return `${path}.json`
}

export async function getCachedResult(path: string): Promise<unknown | null> {
    const s3 = storage()
    try {
        const stat = await s3.statObject(PHOTOS_BUCKET, path)
        if (metaField(stat.metaData, "analyzed") === "true") {
            const rawAttendees = metaField(stat.metaData, "total_attendees")
            const rawHands = metaField(stat.metaData, "raised_hands")
            const rawCaption = metaField(stat.metaData, "caption")
            const attendees = rawAttendees !== "" ? Number(rawAttendees) : null
            const hands = rawHands !== "" ? Number(rawHands) : null
            let caption: string | null = null
            if (rawCaption) {
                try { caption = decodeURIComponent(rawCaption) } catch (_error) { caption = rawCaption }
            }
            return {
                total_attendees: attendees,
                raised_hands: hands,
                percentage_with_hands_up: percentageOf(attendees, hands),
                caption,
            }
        }
    } catch (_error) {
        /* fall back to results bucket */
    }
    try {
        const stream = await s3.getObject(RESULTS_BUCKET, resultKey(path))
        const chunks: Buffer[] = []
        for await (const chunk of stream) chunks.push(chunk as Buffer)
        return JSON.parse(Buffer.concat(chunks).toString("utf8"))
    } catch (_error) {
        return null
    }
}

export async function putCachedResult(path: string, analysis: unknown) {
    const s3 = storage()
    await ensureBuckets()
    const bytes = Buffer.from(JSON.stringify(analysis), "utf8")
    await s3.putObject(RESULTS_BUCKET, resultKey(path), bytes, bytes.length, { "Content-Type": "application/json" })

    try {
        const gps = await photoMeta(path)
        const hasGps = gps.latitude !== null && gps.longitude !== null
        const { attendees, hands, caption } = normalizeAnalysis(analysis)
        const percentage = percentageOf(attendees, hands)
        if (typeof s3.copyObject === "function" && Minio.CopySourceOptions && Minio.CopyDestinationOptions) {
            await s3.copyObject(
                new Minio.CopySourceOptions({ Bucket: PHOTOS_BUCKET, Object: path }),
                new Minio.CopyDestinationOptions({
                    Bucket: PHOTOS_BUCKET,
                    Object: path,
                    MetadataDirective: "REPLACE",
                    Headers: { "Content-Type": path.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg" },
                    UserMetadata: {
                        latitude: hasGps ? String(gps.latitude) : "",
                        longitude: hasGps ? String(gps.longitude) : "",
                        analyzed: "true",
                        total_attendees: attendees === null ? "" : String(attendees),
                        raised_hands: hands === null ? "" : String(hands),
                        percentage_with_hands_up: percentage === null ? "" : String(percentage),
                        caption: caption ? encodeURIComponent(caption) : "",
                    },
                    UserTags: {
                        analyzed: "true",
                        has_gps: hasGps ? "true" : "false",
                        ...(attendees !== null ? { attendees: String(attendees) } : {}),
                        ...(hands !== null ? { hands: String(hands) } : {}),
                    },
                }),
            )
        }
    } catch (_error) {
        /* stamping photo object metadata is best-effort alongside RESULTS_BUCKET cache */
    }
}
