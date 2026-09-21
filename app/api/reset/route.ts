import { querySnowflake } from "@/lib/snowflake"
import { IMAGE_FILTER, safeStagePath, STAGE } from "@/lib/crowd"
import { apiError, mutationAllowed } from "@/lib/api"
import { clearLocations } from "@/lib/locations"
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
                paths: (await querySnowflake(`SELECT RELATIVE_PATH FROM DIRECTORY('${STAGE}') WHERE ${IMAGE_FILTER}`)).map(row => String(row.RELATIVE_PATH)),
                cutoff: new Date().toISOString(), stage: STAGE,
            }
            if (!snapshot.paths.every(safeStagePath)) throw new Error("Unsupported path in reset snapshot")
            const retryToken = signReset(snapshot)
            try {
                for (const path of snapshot.paths) await querySnowflake(`REMOVE '${STAGE}/${path}' PATTERN='.*${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\/g, "\\\\")}$'`)
                await querySnowflake(`ALTER STAGE ${STAGE.slice(1)} REFRESH`)
            } catch (_error) {
                return Response.json({ cleared: false, retryToken, warning: "Some photos could not be cleared. Retry this cleanup before starting a new reset." })
            }
            try { await clearLocations(snapshot.cutoff) }
            catch (_error) { return Response.json({ cleared: false, photosCleared: true, retryToken, warning: "Photos cleared; location cleanup is pending. Retry cleanup to finish." }) }
            return Response.json({ cleared: true, photosCleared: true })
        } catch (error) { return apiError(error, "Clear photos") }
    })
}