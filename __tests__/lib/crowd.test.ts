import { describe, expect, it } from "vitest"
import sharp from "sharp"
import { exceedsMaxDimension, imageExtension, normalizeAnalysis, percentageOf, safeImagePath, sumKnown, MAX_DIMENSION, MAX_IMAGE_BYTES } from "@/lib/crowd"
import { validateImage } from "@/lib/validate-image"

describe("photo estimates", () => {
    it("distinguishes unavailable estimates from zero", () => {
        const unknown = normalizeAnalysis({ total_attendees: null, raised_hands: null })
        const empty = normalizeAnalysis({ total_attendees: 0, raised_hands: 0 })
        expect(unknown.attendees).toBeNull()
        expect(sumKnown([unknown as never], "attendees")).toBeNull()
        expect(sumKnown([empty as never], "attendees")).toBe(0)
        expect(percentageOf(empty.attendees, empty.hands)).toBeNull()
    })
    it("computes a safe percentage and rejects impossible counts", () => {
        const photo = normalizeAnalysis({ total_attendees: "30", raised_hands: "10", caption: " Keynote " })
        expect(percentageOf(photo.attendees, photo.hands)).toBe(33.3)
        expect(photo.caption).toBe("Keynote")
        expect(normalizeAnalysis({ total_attendees: 3, raised_hands: 5 }).hands).toBeNull()
        expect(normalizeAnalysis({ total_attendees: -1 }).attendees).toBeNull()
        expect(normalizeAnalysis(null)).toEqual({ attendees: null, hands: null, caption: null })
    })
})

describe("image validation", () => {
    it("accepts uppercase extensions but rejects unsafe object paths", () => {
        expect(imageExtension("photo.JPEG")).toBe("jpeg")
        expect(safeImagePath("Session 1.PNG")).toBe(true)
        for (const path of ["../x.jpg", "x'.jpg", "*.png", "x/y.jpg"]) expect(safeImagePath(path)).toBe(false)
    })
    it("flags oversized dimensions client-side before upload", () => {
        expect(MAX_DIMENSION).toBe(8000)
        expect(exceedsMaxDimension(8000, 8000)).toBe(false)
        expect(exceedsMaxDimension(8001, 100)).toBe(true)
        expect(exceedsMaxDimension(100, 9000)).toBe(true)
    })
    it("checks contents, size and dimensions", async () => {
        const bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: "white" } }).png().toBuffer()
        expect(await validateImage("photo.PNG", bytes)).toBe("png")
        await expect(validateImage("photo.jpg", bytes)).rejects.toThrow()
        await expect(validateImage("photo.png", Buffer.from("not an image"))).rejects.toThrow()
        await expect(validateImage("photo.jpg", Buffer.alloc(MAX_IMAGE_BYTES + 1))).rejects.toThrow("3.75 MB")
        const wide = await sharp({ create: { width: 8001, height: 1, channels: 3, background: "white" } }).png().toBuffer()
        await expect(validateImage("photo.png", wide)).rejects.toThrow("8000")
    })
})
