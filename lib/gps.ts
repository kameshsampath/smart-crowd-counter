import exifr from "exifr"
export type Coordinates = { latitude: number | null; longitude: number | null }
export function coordinates(value: unknown): Coordinates {
    const empty = { latitude: null, longitude: null }
    if (!value || typeof value !== "object") return empty
    const { latitude, longitude } = value as Coordinates
    return typeof latitude === "number" && typeof longitude === "number"
        && Number.isFinite(latitude) && Number.isFinite(longitude)
        && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
        ? { latitude, longitude } : empty
}
export async function extractGps(buffer: Buffer): Promise<Coordinates> {
    try { return coordinates(await exifr.gps(buffer)) }
    catch (_error) { return coordinates(null) }
}