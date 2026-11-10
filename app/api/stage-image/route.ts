import { getPhoto } from "@/lib/storage"
import { safeImagePath } from "@/lib/crowd"
import { apiError } from "@/lib/api"
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
    const path = new URL(request.url).searchParams.get("path") ?? ""
    if (!safeImagePath(path)) return Response.json({ error: "Invalid image path." }, { status: 400 })
    try {
        const photo = await getPhoto(path)
        return new Response(new Uint8Array(photo.bytes), {
            headers: {
                "Content-Type": photo.contentType,
                "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
            }
        })
    } catch (_error) {
        return Response.json({ error: "Photo not found." }, { status: 404, headers: { "Cache-Control": "no-store" } })
    }
}
