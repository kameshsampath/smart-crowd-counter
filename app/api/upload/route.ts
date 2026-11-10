import { randomUUID } from "node:crypto"
import { MAX_FILES, MAX_IMAGE_BYTES } from "@/lib/crowd"
import { apiError, limitedFormData, mutationAllowed } from "@/lib/api"
import { validateImage } from "@/lib/validate-image"
import { extractGps, Coordinates } from "@/lib/gps"
import { putPhoto, deletePhoto } from "@/lib/storage"
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
    const uploaded: string[] = []
    try {
        for (const image of images) {
            await putPhoto(image.filename, image.bytes, image.gps)
            uploaded.push(image.filename)
        }
        const missingGps = images.filter(image => image.gps.latitude === null || image.gps.longitude === null).length
        const locationWarning = missingGps
            ? `${missingGps} of ${images.length} photo${images.length === 1 ? "" : "s"} had no GPS location — it is often removed when converting HEIC or sharing photos.`
            : null
        return Response.json({ uploaded, locationWarning })
    } catch (error) {
        for (const path of uploaded) {
            try { await deletePhoto(path) } catch (cleanupError) { console.error("Upload rollback", cleanupError) }
        }
        return apiError(error, "Upload")
    }
}
