import { querySnowflake } from "@/lib/snowflake"
import { IMAGE_FILTER, STAGE } from "@/lib/crowd"
import { apiError } from "@/lib/api"
export const dynamic = "force-dynamic"

export async function GET() {
    try {
        const rows = await querySnowflake(`SELECT COUNT(*) AS COUNT FROM DIRECTORY('${STAGE}') WHERE ${IMAGE_FILTER}`)
        return Response.json({ count: Number(rows[0].COUNT) }, { headers: { "Cache-Control": "no-store" } })
    } catch (error) { return apiError(error, "Photo count") }
}