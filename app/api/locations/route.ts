import { listPhotos, photoMeta } from "@/lib/storage"
import { apiError } from "@/lib/api"
export const dynamic = "force-dynamic"

export async function GET() {
    try {
        const photos = await listPhotos()
        const locations = await Promise.all(photos.map(async photo => ({ path: photo.path, ...(await photoMeta(photo.path)) })))
        return Response.json({ locations }, { headers: { "Cache-Control": "no-store" } })
    } catch (error) { return apiError(error, "Locations") }
}
