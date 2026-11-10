import { beforeEach, describe, expect, it, vi } from "vitest"

import sharp from "sharp"

const storage = vi.hoisted(() => ({
    listPhotos: vi.fn(),
    photoMeta: vi.fn(),
    getCachedResult: vi.fn(),
    putCachedResult: vi.fn(),
    getPhoto: vi.fn(),
    putPhoto: vi.fn(),
    deletePhoto: vi.fn(),
}))
const analyzePhoto = vi.hoisted(() => vi.fn())
vi.mock("server-only", () => ({}))
vi.mock("@/lib/storage", () => storage)
vi.mock("@/lib/analysis", () => ({ analyzePhoto, AGENT_URL: "http://agent:8000", AGENT_TIMEOUT_MS: 1000 }))

import { GET as images } from "@/app/api/images/route"
import { POST as reset } from "@/app/api/reset/route"
import { POST as upload } from "@//app/api/upload/route"
import { GET as stageImage } from "@//app/api/stage-image/route"

beforeEach(() => {
    vi.clearAllMocks()
    storage.photoMeta.mockResolvedValue({ latitude: null, longitude: null })
})

describe("crowd API", () => {
    it("serves cached analysis without calling the agent and only analyzes new photos by bucket path", async () => {
        storage.listPhotos.mockResolvedValue([
            { path: "cached.JPG", size: 10, modified: new Date("2026-09-21T00:00:00Z") },
            { path: "new.JPG", size: 20, modified: new Date("2026-09-22T00:00:00Z") },
        ])
        storage.getCachedResult.mockImplementation(async (path: string) =>
            path === "cached.JPG" ? { total_attendees: 12, raised_hands: 3, caption: "Cached" } : null
        )
        analyzePhoto.mockResolvedValueOnce({ total_attendees: 30, raised_hands: 6, caption: "Fresh" })
        const response = await images()
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.photos[0].attendees).toBe(12)
        expect(body.photos[1].attendees).toBe(30)
        expect(body.prompt).toContain("ADK agent")
        expect(analyzePhoto).toHaveBeenCalledTimes(1)
        expect(analyzePhoto).toHaveBeenCalledWith("new.JPG")
        expect(storage.putCachedResult).toHaveBeenCalledWith("new.JPG", { total_attendees: 30, raised_hands: 6, caption: "Fresh" })
        expect(storage.getPhoto).not.toHaveBeenCalled()
    })
    it("requires explicit reset confirmation", async () => {
        expect((await reset(new Request("http://localhost/api/reset", { method: "POST" }))).status).toBe(403)
        expect((await reset(new Request("http://localhost/api/reset", { method: "POST", headers: { "x-crowd-action": "1" }, body: "{}" }))).status).toBe(400)
        expect(storage.deletePhoto).not.toHaveBeenCalled()
        storage.listPhotos.mockResolvedValue([])
        const request = new Request("http://localhost/api/reset", { method: "POST", headers: { "x-crowd-action": "1" }, body: JSON.stringify({ confirm: "CLEAR ALL PHOTOS" }) })
        expect((await reset(request)).status).toBe(200)
        expect(storage.deletePhoto).not.toHaveBeenCalled()
    })
    it("warns when uploaded photos have no GPS location", async () => {
        const bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: "white" } }).png().toBuffer()
        const form = new FormData()
        form.append("files", new File([bytes], "session 1.png", { type: "image/png" }))
        const request = new Request("http://localhost/api/upload", { method: "POST", headers: { "x-crowd-action": "1" }, body: form })
        const response = await upload(request)
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.uploaded).toHaveLength(1)
        expect(body.locationWarning).toContain("1 of 1 photo had no GPS location")
        expect(storage.putPhoto).toHaveBeenCalledTimes(1)
    })
    it("rejects cross-site uploads and invalid image paths", async () => {
        const request = new Request("http://localhost/api/upload", { method: "POST", headers: { "x-crowd-action": "1", "sec-fetch-site": "cross-site" } })
        expect((await upload(request)).status).toBe(403)
        expect((await stageImage(new Request("http://localhost/api/stage-image?path=..%2Fprivate.jpg"))).status).toBe(400)
        expect(storage.putPhoto).not.toHaveBeenCalled()
    })
})
