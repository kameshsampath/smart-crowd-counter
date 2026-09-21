import { querySnowflake } from "@/lib/snowflake"
import { STAGE, IMAGE_FILTER, normalizePhoto } from "@/lib/crowd"
import { mergeLocations } from "@/lib/locations"
import { apiError } from "@/lib/api"
export const dynamic = "force-dynamic"
export async function GET() {
    try {
        const rows = await querySnowflake(`SELECT RELATIVE_PATH FROM DIRECTORY('${STAGE}') WHERE ${IMAGE_FILTER}`)
        const result = await mergeLocations(rows.map(normalizePhoto))
        return Response.json({ locations: result.photos.map(({ path, latitude, longitude }) => ({ path, latitude, longitude })), locationWarning: result.locationWarning }, { headers: { "Cache-Control": "no-store" } })
    } catch (error) { return apiError(error, "Locations") }
}