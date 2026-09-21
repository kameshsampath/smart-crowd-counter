import { beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("@/lib/snowflake", () => ({ querySnowflake: vi.fn(), getSecret: () => ({ password: "test-only" }), SecretType: { PASSWORD: "PASSWORD" } }))
vi.mock("@/lib/locations", () => ({ clearLocations: vi.fn() }))
import { querySnowflake } from "@/lib/snowflake"
import { clearLocations } from "@/lib/locations"
import { POST } from "@/app/api/reset/route"
import { readReset } from "@/lib/reset-token"
function request(retryToken?: string) {
    return new Request("http://localhost/api/reset", { method: "POST", headers: { "x-crowd-action": "1" }, body: JSON.stringify({ confirm: "CLEAR ALL PHOTOS", retryToken }) })
}
beforeEach(() => vi.clearAllMocks())
describe("reset recovery", () => {
    it("retries only the original snapshot after metadata failure", async () => {
        vi.mocked(querySnowflake).mockResolvedValue([]).mockResolvedValueOnce([{ RELATIVE_PATH: "original.jpg" }])
        vi.mocked(clearLocations).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined)
        const first = await (await POST(request())).json()
        expect(first.photosCleared).toBe(true)
        expect(first.cleared).toBe(false)
        expect(readReset(first.retryToken).paths).toEqual(["original.jpg"])
        const cutoff = vi.mocked(clearLocations).mock.calls[0][0]
        vi.mocked(querySnowflake).mockClear()
        const retry = await (await POST(request(first.retryToken))).json()
        expect(retry.cleared).toBe(true)
        expect(querySnowflake).toHaveBeenCalledTimes(2)
        expect(querySnowflake).toHaveBeenNthCalledWith(1, expect.stringContaining("original.jpg"))
        expect(clearLocations).toHaveBeenLastCalledWith(cutoff)
    })
    it("does not erase metadata when stage removal fails", async () => {
        vi.mocked(querySnowflake).mockResolvedValueOnce([{ RELATIVE_PATH: "old.jpg" }]).mockRejectedValueOnce(new Error("offline"))
        const result = await (await POST(request())).json()
        expect(result.cleared).toBe(false)
        expect(result.retryToken).toBeTruthy()
        expect(clearLocations).not.toHaveBeenCalled()
    })
    it("rejects tampered reset snapshots", () => {
        expect(() => readReset("e30.invalid")).toThrow()
    })
})