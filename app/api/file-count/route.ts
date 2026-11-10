import { listPhotos } from "@/lib/storage"
import { apiError } from "@/lib/api"
export const dynamic = "force-dynamic"

export async function GET() {
    try {
        return Response.json({ count: (await listPhotos()).length }, { headers: { "Cache-Control": "no-store" } })
    } catch (error) { return apiError(error, "Photo count") }
}
