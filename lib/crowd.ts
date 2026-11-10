export const MAX_IMAGE_BYTES = 3_750_000
export const MAX_DIMENSION = 8000
export const MAX_FILES = 4

export const PROMPT_PATTERN = `POST /analyze  (ADK agent service)
{
  "path": "session-1-<uuid>.jpg"
}

-- 1. Photo is uploaded to the 'snaps' bucket with EXIF GPS in S3 object metadata & tags.
-- 2. The ADK agent fetches the photo directly from 'snaps', downscales an in-memory copy
--    (<=1280px) to fit Ollama's context window, and prompts the vision model for JSON:
--    { total_attendees, raised_hands, percentage_with_hands_up, caption }
-- 3. Results are stamped onto the photo's AIStor S3 metadata/tags and cached in 'analysis'
--    so analyzed photos are never sent to the model again.`

export type Photo = {
    latitude?: number | null
    longitude?: number | null
    path: string
    size: number
    modified: string | null
    attendees: number | null
    hands: number | null
    percentage: number | null
    caption: string | null
}

export function exceedsMaxDimension(width: number, height: number): boolean {
    return width > MAX_DIMENSION || height > MAX_DIMENSION
}

export function imageExtension(name: string): string | null {
    const extension = name.slice(name.lastIndexOf(".") + 1).toLowerCase()
    return ["jpg", "jpeg", "png"].includes(extension) ? extension : null
}

export function safeImagePath(value: string): boolean {
    return value.length > 0 && value.length <= 250 && /^[A-Za-z0-9_. -]+$/.test(value)
        && !value.includes("..") && !value.startsWith(".") && imageExtension(value) !== null
}

export function normalizeAnalysis(analysis: unknown): Pick<Photo, "attendees" | "hands" | "caption"> {
    const count = (value: unknown) => {
        if (value === null || value === undefined || value === "" || typeof value === "boolean") return null
        const numeric = Number(value)
        return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : null
    }
    if (!analysis || typeof analysis !== "object") return { attendees: null, hands: null, caption: null }
    const { total_attendees, raised_hands, caption } = analysis as Record<string, unknown>
    const attendees = count(total_attendees)
    let hands = count(raised_hands)
    if (hands !== null && attendees !== null && hands > attendees) hands = null
    return {
        attendees,
        hands,
        caption: typeof caption === "string" && caption.trim() ? caption.trim() : null,
    }
}

export function percentageOf(attendees: number | null, hands: number | null): number | null {
    return attendees !== null && attendees > 0 && hands !== null ? Math.round(hands / attendees * 1000) / 10 : null
}

export function sumKnown(photos: Photo[], key: "attendees" | "hands"): number | null {
    const values = photos.map(photo => photo[key]).filter(value => value !== null)
    return values.length ? values.reduce((total, value) => total + value, 0) : null
}
