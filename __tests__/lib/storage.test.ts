import { beforeEach, describe, expect, it, vi } from "vitest"

const statObject = vi.hoisted(() => vi.fn())
const getObject = vi.hoisted(() => vi.fn())
vi.mock("server-only", () => ({}))
vi.mock("minio", () => ({
    Client: class {
        statObject = statObject
        getObject = getObject
    },
}))

import { getCachedResult, parseEndpoint, photoMeta } from "@/lib/storage"

beforeEach(() => vi.clearAllMocks())

describe("S3 storage helpers", () => {
    it("returns null GPS coordinates when object metadata is empty or missing", async () => {
        statObject.mockResolvedValueOnce({ metaData: { latitude: "", longitude: "" } })
        expect(await photoMeta("photo.jpg")).toEqual({ latitude: null, longitude: null })

        statObject.mockResolvedValueOnce({ metaData: {} })
        expect(await photoMeta("photo.jpg")).toEqual({ latitude: null, longitude: null })
    })

    it("parses valid GPS object metadata and rejects partial or out-of-range coordinates", async () => {
        statObject.mockResolvedValueOnce({ metaData: { latitude: "37.7749", longitude: "-122.4194" } })
        expect(await photoMeta("photo.jpg")).toEqual({ latitude: 37.7749, longitude: -122.4194 })

        statObject.mockResolvedValueOnce({ metaData: { latitude: "0", longitude: "0" } })
        expect(await photoMeta("photo.jpg")).toEqual({ latitude: 0, longitude: 0 })

        statObject.mockResolvedValueOnce({ metaData: { latitude: "95", longitude: "0" } })
        expect(await photoMeta("photo.jpg")).toEqual({ latitude: null, longitude: null })

        statObject.mockResolvedValueOnce({ metaData: { latitude: "37.7749", longitude: "" } })
        expect(await photoMeta("photo.jpg")).toEqual({ latitude: null, longitude: null })
    })

    it("reads cached analysis directly from AIStor S3 photo metadata when analyzed=true", async () => {
        statObject.mockResolvedValueOnce({
            metaData: {
                analyzed: "true",
                total_attendees: "40",
                raised_hands: "10",
                caption: encodeURIComponent("Keynote audience with raised hands."),
            },
        })
        expect(await getCachedResult("photo.jpg")).toEqual({
            total_attendees: 40,
            raised_hands: 10,
            percentage_with_hands_up: 25,
            caption: "Keynote audience with raised hands.",
        })
        expect(getObject).not.toHaveBeenCalled()
    })

    it("parses host:port and URL endpoints for AIStor and S3", () => {
        expect(parseEndpoint("aistor:9000", "false")).toEqual({ endPoint: "aistor", port: 9000, useSSL: false })
        expect(parseEndpoint("http://localhost:9000/", undefined)).toEqual({ endPoint: "localhost", port: 9000, useSSL: false })
        expect(parseEndpoint("https://s3.example.com", undefined)).toEqual({ endPoint: "s3.example.com", port: 443, useSSL: true })
    })
})
