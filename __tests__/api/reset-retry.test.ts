import { beforeEach, describe, expect, it, vi } from "vitest"

const storage = vi.hoisted(() => ({
    listPhotos: vi.fn(),
    deletePhoto: vi.fn(),
}))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/storage", () => ({ ...storage, PHOTOS_BUCKET: "snaps", RESULTS_BUCKET: "analysis" }))

import { POST } from "@/app/api/reset/route"
import { readReset } from "@//lib/reset-token"

function request(retryToken?: string) {
    return new Request("http://localhost/api/reset", { method: "POST", headers: { "x-crowd-action": "1" }, body: JSON.stringify({ confirm: "CLEAR ALL PHOTOS", retryToken }) })
}

beforeEach(() => vi.clearAllMocks())

describe("reset recovery", () => {
    it("retries only the original snapshot after a partial failure", async () => {
        storage.listPhotos.mockResolvedValue([{ path: "original.jpg", size: 1, modified: new Date() }])
        storage.deletePhoto.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined)
        const first = await (await POST(request())).json()
        expect(first.cleared).toBe(false)
        expect(first.retryToken).toBeTruthy()
        expect(readReset(first.retryToken).paths).toEqual(["original.jpg"])
        storage.listPhotos.mockClear()
        const retry = await (await POST(request(first.retryToken))).json()
        expect(retry.cleared).toBe(true)
        expect(storage.listPhotos).not.toHaveBeenCalled()
        expect(storage.deletePhoto).toHaveBeenCalledTimes(2)
        expect(storage.deletePhoto).toHaveBeenNthCalledWith(2, "original.jpg")
    })
    it("returns a retry token when nothing was deleted", async () => {
        storage.listPhotos.mockResolvedValue([{ path: "old.jpg", size: 1, modified: new Date() }])
        storage.deletePhoto.mockRejectedValue(new Error("offline"))
        const result = await (await POST(request())).json()
        expect(result.cleared).toBe(false)
        expect(result.retryToken).toBeTruthy()
    })
    it("rejects tampered reset snapshots", () => {
        expect(() => readReset("e30.invalid")).toThrow()
    })
})
