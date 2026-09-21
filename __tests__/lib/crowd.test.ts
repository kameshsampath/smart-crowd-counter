import { describe, expect, it } from "vitest"
import sharp from "sharp"
import { imageExtension, normalizePhoto, safeStagePath, sumKnown, MAX_IMAGE_BYTES } from "@/lib/crowd"
import { validateImage } from "@/lib/validate-image"

describe("photo estimates", () => {
    it("distinguishes unavailable estimates from zero", () => {
        const unknown = normalizePhoto({ TOTAL_ATTENDEES: null, RAISED_HANDS: null })
        const empty = normalizePhoto({ TOTAL_ATTENDEES: 0, RAISED_HANDS: 0 })
        expect(unknown.attendees).toBeNull()
        expect(sumKnown([unknown], "attendees")).toBeNull()
        expect(sumKnown([empty], "attendees")).toBe(0)
        expect(empty.percentage).toBeNull()
    })
    it("computes a safe percentage and serializes timestamps", () => {
        const photo = normalizePhoto({ TOTAL_ATTENDEES: "30", RAISED_HANDS: "10", LAST_MODIFIED: new Date("2026-09-21T00:00:00Z") })
        expect(photo.percentage).toBe(33.3)
        expect(photo.modified).toBe("2026-09-21T00:00:00.000Z")
        expect(normalizePhoto({ TOTAL_ATTENDEES: 3, RAISED_HANDS: 5 }).hands).toBeNull()
        expect(normalizePhoto({ TOTAL_ATTENDEES: -1 }).attendees).toBeNull()
    })
})

describe("image validation", () => {
    it("accepts uppercase extensions but rejects unsafe stage paths", () => {
        expect(imageExtension("photo.JPEG")).toBe("jpeg")
        expect(safeStagePath("Session 1.PNG")).toBe(true)
        for (const path of ["../x.jpg", "x'.jpg", "*.png", "x/y.jpg"]) expect(safeStagePath(path)).toBe(false)
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