import { beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("@/lib/snowflake", () => ({ querySnowflake: vi.fn(), querySnowflakeLongRunning: vi.fn(), getSecret: () => ({ password: "test-only" }), SecretType: { PASSWORD: "PASSWORD" } }))
vi.mock("@/lib/locations", () => ({ mergeLocations: vi.fn(), saveLocation: vi.fn(), clearLocations: vi.fn() }))
import { mergeLocations, clearLocations } from "@/lib/locations"
import { querySnowflake, querySnowflakeLongRunning } from "@/lib/snowflake"
import { GET as images } from "@/app/api/images/route"
import { POST as reset } from "@/app/api/reset/route"
import { POST as upload } from "@/app/api/upload/route"
import { GET as stageImage } from "@/app/api/stage-image/route"

beforeEach(() => { vi.resetAllMocks(); vi.mocked(mergeLocations).mockImplementation(async photos => ({ photos: photos.map(photo => ({ ...photo, latitude: null, longitude: null })), locationWarning: null })) })
describe("crowd API", () => {
    it("uses long-running analysis with nullable estimates", async () => {
        vi.mocked(querySnowflakeLongRunning).mockResolvedValue([{ RELATIVE_PATH: "photo.JPG", TOTAL_ATTENDEES: null }])
        const response = await images()
        expect(response.status).toBe(200)
        expect((await response.json()).photos[0].attendees).toBeNull()
        expect(querySnowflakeLongRunning).toHaveBeenCalledOnce()
        expect(querySnowflake).not.toHaveBeenCalled()
    })
    it("requires explicit reset confirmation", async () => {
        expect((await reset(new Request("http://localhost/api/reset", { method: "POST" }))).status).toBe(403)
        expect((await reset(new Request("http://localhost/api/reset", { method: "POST", headers: { "x-crowd-action": "1" }, body: "{}" }))).status).toBe(400)
        expect(querySnowflake).not.toHaveBeenCalled()
        vi.mocked(querySnowflake).mockResolvedValue([])
        const request = new Request("http://localhost/api/reset", { method: "POST", headers: { "x-crowd-action": "1" }, body: JSON.stringify({ confirm: "CLEAR ALL PHOTOS" }) })
        expect((await reset(request)).status).toBe(200)
        expect(querySnowflake).toHaveBeenNthCalledWith(1, expect.stringContaining("SELECT RELATIVE_PATH"))
        expect(querySnowflake).toHaveBeenNthCalledWith(2, "ALTER STAGE CROWD_COUNTER_DB.CONFERENCES.SNAPS REFRESH")
        expect(clearLocations).toHaveBeenCalledOnce()
    })
    it("rejects cross-site uploads and invalid image paths", async () => {
        const request = new Request("http://localhost/api/upload", { method: "POST", headers: { "x-crowd-action": "1", "sec-fetch-site": "cross-site" } })
        expect((await upload(request)).status).toBe(403)
        expect((await stageImage(new Request("http://localhost/api/stage-image?path=..%2Fprivate.jpg"))).status).toBe(400)
        expect(querySnowflake).not.toHaveBeenCalled()
    })
})