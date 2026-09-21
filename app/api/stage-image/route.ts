import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { querySnowflake } from "@/lib/snowflake"
import { imageExtension, safeStagePath, STAGE } from "@/lib/crowd"
import { apiError } from "@/lib/api"
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
    const path = new URL(request.url).searchParams.get("path") ?? ""
    if (!safeStagePath(path)) return Response.json({ error: "Invalid image path." }, { status: 400 })
    const directory = await mkdtemp(join(tmpdir(), "crowd-image-"))
    try {
        const files = await querySnowflake(`SELECT RELATIVE_PATH FROM DIRECTORY('${STAGE}') WHERE RELATIVE_PATH = ?`, { binds: [path] })
        if (!files.length) return Response.json({ error: "Photo not found." }, { status: 404, headers: { "Cache-Control": "no-store" } })
        await querySnowflake(`GET '${STAGE}/${path}' 'file://${directory}/'`)
        const bytes = await readFile(join(directory, path))
        return new Response(bytes, {
            headers: {
                "Content-Type": imageExtension(path) === "png" ? "image/png" : "image/jpeg",
                "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
            }
        })
    } catch (error) { return apiError(error, "Photo download") }
    finally { await rm(directory, { recursive: true, force: true }) }
}