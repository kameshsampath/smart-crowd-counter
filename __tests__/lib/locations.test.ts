import { describe, it, expect, vi, beforeEach } from "vitest"
vi.mock("server-only", () => ({}))
const mocks = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock("pg", () => ({ Pool: class { query = mocks.query; on() { } } }))
vi.mock("@/lib/snowflake", () => ({ getSecret: () => ({ username: "test", password: "test" }), SecretType: { PASSWORD: "PASSWORD", GENERIC_STRING: "GENERIC_STRING" } }))
import { mergeLocations, saveLocation, clearLocations, STAGE_FQN } from "@/lib/locations"
import { normalizePhoto } from "@/lib/crowd"
beforeEach(() => vi.clearAllMocks())
describe("GPS metadata", () => {
    it("keeps every photo and accepts zero coordinates", async () => {
        mocks.query.mockResolvedValue({ rows: [{ relative_path: "one.jpg", latitude: 0, longitude: 0 }] })
        const result = await mergeLocations([normalizePhoto({ RELATIVE_PATH: "one.jpg" }), normalizePhoto({ RELATIVE_PATH: "two.jpg" })])
        expect(result.photos).toHaveLength(2)
        expect(result.photos[0].latitude).toBe(0)
        expect(result.photos[1].latitude).toBeNull()
        expect(result.locationWarning).toBeNull()
    })
    it("retains analysis during metadata outage", async () => {
        mocks.query.mockRejectedValue(new Error("offline"))
        const result = await mergeLocations([normalizePhoto({ RELATIVE_PATH: "one.jpg", TOTAL_ATTENDEES: 8 })])
        expect(result.photos[0].attendees).toBe(8)
        expect(result.locationWarning).toContain("temporarily unavailable")
    })
    it("upserts by exact generated path and scopes cleanup", async () => {
        mocks.query.mockResolvedValue({ rows: [] })
        await saveLocation("same-uuid.jpg", { latitude: 0, longitude: 1 }, "2026-09-21T00:00:00Z")
        expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("ON CONFLICT"), [STAGE_FQN, "same-uuid.jpg", 0, 1, "2026-09-21T00:00:00Z"])
        await clearLocations("2026-09-21T00:00:00Z")
        expect(mocks.query).toHaveBeenLastCalledWith(expect.stringContaining("stage_fqn=$1 AND uploaded_at <="), [STAGE_FQN, "2026-09-21T00:00:00Z"])
    })
})