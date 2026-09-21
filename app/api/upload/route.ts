import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { querySnowflake } from "@/lib/snowflake"
import { MAX_FILES, MAX_IMAGE_BYTES, STAGE } from "@/lib/crowd"
import { apiError, limitedFormData, mutationAllowed } from "@/lib/api"
import { validateImage } from "@/lib/validate-image"
import { extractGps, Coordinates } from "@/lib/gps"
import { saveLocation } from "@/lib/locations"
import { withLibraryLock } from "@/lib/library-lock"
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
    return withLibraryLock(() => upload(request))
}
async function upload(request: Request) {
    if (!mutationAllowed(request)) return Response.json({ error: "Invalid request." }, { status: 403 })
    let files: File[]
    try {
        const form = await limitedFormData(request, MAX_FILES * MAX_IMAGE_BYTES + 100_000)
        const entries = form.getAll("files")
        if (!entries.length || entries.length > MAX_FILES || entries.some(entry => typeof entry === "string")) throw new Error("Choose 1 to 4 photos per upload.")
        files = entries as File[]
    } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Invalid upload." }, { status: 400 })
    }
    const images: { bytes: Buffer; filename: string; gps: Coordinates }[] = []
    try {
        for (const file of files) {
            const bytes = Buffer.from(await file.arrayBuffer())
            const extension = await validateImage(file.name, bytes)
            const stem = file.name.slice(0, file.name.lastIndexOf(".")).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80) || "photo"
            images.push({ bytes, filename: `${stem}-${randomUUID()}.${extension}`, gps: await extractGps(bytes) })
        }
    } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Invalid image." }, { status: 400 })
    }
    const directory = await mkdtemp(join(tmpdir(), "crowd-upload-"))
    const uploaded: string[] = []
    try {
        for (const image of images) {
            const localPath = join(directory, image.filename)
            await writeFile(localPath, image.bytes)
            const rows = await querySnowflake(`PUT 'file://${localPath}' ${STAGE} AUTO_COMPRESS=FALSE OVERWRITE=FALSE`)
            if (!rows.length || rows.some(row => String(row.status ?? row.STATUS).toUpperCase() !== "UPLOADED")) throw new Error("Stage transfer did not complete")
            uploaded.push(image.filename)
        }
        await querySnowflake(`ALTER STAGE ${STAGE.slice(1)} REFRESH`)
        const uploadedAt = new Date().toISOString()
        const locationFailures: string[] = []
        for (const image of images) {
            try { await saveLocation(image.filename, image.gps, uploadedAt) }
            catch (_error) {
                try { await saveLocation(image.filename, image.gps, uploadedAt) }
                catch (_retryError) { locationFailures.push(image.filename) }
            }
        }
        return Response.json({ uploaded, locationWarning: locationFailures.length ? "Photos uploaded, but location metadata could not be saved for some photos. Do not re-upload just to retry analysis." : null })
    } catch (error) {
        for (const path of uploaded) {
            try { await querySnowflake(`REMOVE '${STAGE}/${path}'`) } catch (cleanupError) { console.error("Upload rollback", cleanupError) }
        }
        try { await querySnowflake(`ALTER STAGE ${STAGE.slice(1)} REFRESH`) } catch (refreshError) { console.error("Stage refresh", refreshError) }
        return apiError(error, "Upload")
    } finally { await rm(directory, { recursive: true, force: true }) }
}