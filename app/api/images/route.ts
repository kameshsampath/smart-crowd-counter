import { querySnowflakeLongRunning } from "@/lib/snowflake"
import { ANALYSIS_SQL, normalizePhoto, SQL_PATTERN } from "@/lib/crowd"
import { apiError } from "@/lib/api"
import { mergeLocations } from "@/lib/locations"
export const dynamic = "force-dynamic"
export const maxDuration = 600

export async function GET() {
    try {
        const rows = await querySnowflakeLongRunning(ANALYSIS_SQL, { maxWaitMs: 540_000 })
        return Response.json({ ...await mergeLocations(rows.map(normalizePhoto)), sql: SQL_PATTERN },
            { headers: { "Cache-Control": "no-store" } })
    } catch (error) { return apiError(error, "Photo analysis") }
}