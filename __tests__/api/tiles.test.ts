import { afterEach, describe, expect, it, vi } from "vitest"
import { GET } from "@/app/api/tiles/route"
import { tileCoordinates } from "@/lib/tiles"
afterEach(() => vi.unstubAllGlobals())
describe("tile proxy", () => {
    it("accepts valid tile coordinates only", () => {
        expect(tileCoordinates("http://localhost?z=0&x=0&y=0")).toEqual([0, 0, 0])
        for (const query of ["z=20&x=0&y=0", "z=1&x=2&y=0", "z=0&x=-1&y=0", "z=0&y=0"]) expect(tileCoordinates("http://localhost?" + query)).toBeNull()
    })
    it("uses a fixed upstream and does not forward private headers", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1]), { headers: { "content-type": "image/png", "cache-control": "public, max-age=700000", etag: "tile-v1" } }))
        vi.stubGlobal("fetch", fetchMock)
        const response = await GET(new Request("http://localhost/api/tiles?z=0&x=0&y=0&photo=private", { headers: { cookie: "private", authorization: "private" } }))
        expect(response.status).toBe(200)
        expect(response.headers.get("cache-control")).toContain("700000")
        expect(fetchMock.mock.calls[0][0]).toBe("https://tile.openstreetmap.org/0/0/0.png")
        expect(JSON.stringify(fetchMock.mock.calls[0][1])).not.toContain("private")
        expect(fetchMock.mock.calls[0][1].headers["User-Agent"]).toContain("SmartCrowdCounter")
    })
    it("never caches upstream errors", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("blocked", { status: 403 })))
        const response = await GET(new Request("http://localhost/api/tiles?z=0&x=0&y=0"))
        expect(response.status).toBe(502)
        expect(response.headers.get("cache-control")).toBe("no-store")
    })
})