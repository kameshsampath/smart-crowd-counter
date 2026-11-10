import { listPhotos, photoMeta, getCachedResult, putCachedResult } from "@/lib/storage"
import { normalizeAnalysis, percentageOf, PROMPT_PATTERN, type Photo } from "@/lib/crowd"
import { analyzePhoto } from "@/lib/analysis"
import { apiError } from "@/lib/api"
export const dynamic = "force-dynamic"
export const maxDuration = 600

export async function GET() {
    try {
        const stored = await listPhotos()
        let analysisWarning: string | null = null
        const photos: Photo[] = []
        for (const object of stored) {
            const meta = await photoMeta(object.path)
            let analysis = await getCachedResult(object.path)
            if (!analysis) {
                try {
                    analysis = await analyzePhoto(object.path)
                    await putCachedResult(object.path, analysis)
                } catch (_error) {
                    analysisWarning = "Some photos could not be analyzed. The local inference server may be busy or offline — retry shortly."
                }
            }
            const { attendees, hands, caption } = normalizeAnalysis(analysis)
            photos.push({
                path: object.path, size: object.size, modified: object.modified.toISOString(),
                attendees, hands, caption, percentage: percentageOf(attendees, hands),
                latitude: meta.latitude, longitude: meta.longitude,
            })
        }
        return Response.json({ photos, prompt: PROMPT_PATTERN, analysisWarning },
            { headers: { "Cache-Control": "no-store" } })
    } catch (error) { return apiError(error, "Photo analysis") }
}
