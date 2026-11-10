import { listPhotos, deletePhoto } from "@/lib/storage"
import { safeImagePath } from "@/lib/crowd"
import { apiError, mutationAllowed } from "@/lib/api"
import { withLibraryLock } from "@/lib/library-lock"
import { readReset, signReset } from "@/lib/reset-token"
export const dynamic = "force-dynamic"
export async function POST(request: Request) {
    if (!mutationAllowed(request)) return Response.json({ error: "Invalid request." }, { status: 403 })
    let body
    try { body = await request.json() } catch (_error) { return Response.json({ error: "Confirmation required." }, { status: 400 }) }
    if (body?.confirm !== "CLEAR ALL PHOTOS") return Response.json({ error: "Confirmation required." }, { status: 400 })
    return withLibraryLock(async () => {
        try {
            const snapshot = body.retryToken ? readReset(body.retryToken) : {
                paths: (await listPhotos()).map(photo => photo.path),
                cutoff: new Date().toISOString(),
                bucket: process.env.S3_PHOTOS_BUCKET ?? "snaps",
            }
            if (!snapshot.paths.every(safeImagePath)) throw new Error("Unsupported path in reset snapshot")
            const retryToken = signReset(snapshot)
            try {
                for (const path of snapshot.paths) await deletePhoto(path)
            } catch (_error) {
                return Response.json({ cleared: false, retryToken, warning: "Some photos could not be cleared. Retry this cleanup before starting a new reset." })
            }
            return Response.json({ cleared: true, photosCleared: true })
        } catch (error) { return apiError(error, "Clear photos") }
    })
}
