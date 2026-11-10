import { tileCoordinates } from "@/lib/tiles"
export const dynamic = "force-dynamic"
export async function GET(request: Request) {
    const tile = tileCoordinates(request.url)
    if (!tile) return new Response("Invalid tile", { status: 400, headers: { "Cache-Control": "no-store" } })
    try {
        const upstream = await fetch(`https://tile.openstreetmap.org/${tile.join("/")}.png`, {
            headers: {
                "User-Agent": "SmartCrowdCounter/3.0 (local self-hosted demo)",
                ...(request.headers.get("if-none-match") ? { "If-None-Match": request.headers.get("if-none-match")! } : {}),
                ...(request.headers.get("if-modified-since") ? { "If-Modified-Since": request.headers.get("if-modified-since")! } : {}),
            }, signal: AbortSignal.timeout(10_000), redirect: "error",
        })
        if (upstream.status === 304) return new Response(null, { status: 304, headers: { "Cache-Control": upstream.headers.get("cache-control") ?? "public, max-age=604800" } })
        if (!upstream.ok || !upstream.headers.get("content-type")?.includes("image/png")) throw new Error("Tile unavailable")
        const headers = new Headers({ "Content-Type": "image/png", "Cache-Control": upstream.headers.get("cache-control") ?? "public, max-age=604800" })
        for (const name of ["etag", "last-modified", "expires"]) { const value = upstream.headers.get(name); if (value) headers.set(name, value) }
        return new Response(await upstream.arrayBuffer(), { headers })
    } catch (_error) { return new Response("Map tiles temporarily unavailable", { status: 502, headers: { "Cache-Control": "no-store" } }) }
}