import { describe, it, expect, vi } from "vitest"
vi.mock("exifr", () => ({ default: { gps: vi.fn() } }))
import exifr from "exifr"
import { coordinates, extractGps } from "@/lib/gps"
describe("GPS parsing", () => {
    it("accepts zero and boundary coordinates", () => {
        expect(coordinates({ latitude: 0, longitude: 0 })).toEqual({ latitude: 0, longitude: 0 })
        expect(coordinates({ latitude: -90, longitude: 180 })).toEqual({ latitude: -90, longitude: 180 })
    })
    it("rejects missing malformed nonfinite and out-of-range pairs", async () => {
        for (const value of [null, {}, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: Infinity }, { latitude: "1", longitude: 2 }]) expect(coordinates(value)).toEqual({ latitude: null, longitude: null })
        vi.mocked(exifr.gps).mockRejectedValue(new Error("malformed"))
        expect(await extractGps(Buffer.from("valid image with malformed EXIF"))).toEqual({ latitude: null, longitude: null })
    })
})