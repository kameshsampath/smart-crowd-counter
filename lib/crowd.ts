export const MAX_IMAGE_BYTES = 3_750_000
export const MAX_DIMENSION = 8000
export const MAX_FILES = 4
export const IMAGE_FILTER = "(LOWER(RELATIVE_PATH) LIKE '%.jpg' OR LOWER(RELATIVE_PATH) LIKE '%.jpeg' OR LOWER(RELATIVE_PATH) LIKE '%.png')"
export const STAGE = "@CROWD_COUNTER_DB.CONFERENCES.SNAPS"
export const ANALYSIS_SQL = `SELECT RELATIVE_PATH, SIZE, LAST_MODIFIED, TOTAL_ATTENDEES,
  RAISED_HANDS, PERCENTAGE_WITH_HANDS_UP, CAPTION
FROM CROWD_COUNTER_DB.CONFERENCES.SMART_CROWD_COUNTER
ORDER BY LAST_MODIFIED DESC, RELATIVE_PATH`
export const SQL_PATTERN = `SELECT AI_COMPLETE(
  'claude-4-sonnet',
  'Estimate attendees and raised hands. Return bare JSON with
   total_attendees, raised_hands, percentage_with_hands_up.
   Unknown counts and undefined percentages must be null.',
  TO_FILE('@CROWD_COUNTER_DB.CONFERENCES.SNAPS', RELATIVE_PATH)
) AS analysis
FROM DIRECTORY('@CROWD_COUNTER_DB.CONFERENCES.SNAPS');

-- The view uses TRY_PARSE_JSON, retries only an enclosing
-- Markdown fence, validates counts, and computes a safe ratio.
-- A second AI_COMPLETE call produces the caption.`

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

export function imageExtension(name: string): string | null {
    const extension = name.slice(name.lastIndexOf(".") + 1).toLowerCase()
    return ["jpg", "jpeg", "png"].includes(extension) ? extension : null
}

export function safeStagePath(value: string): boolean {
    return value.length > 0 && value.length <= 250 && /^[A-Za-z0-9_. -]+$/.test(value)
        && !value.includes("..") && !value.startsWith(".") && imageExtension(value) !== null
}

export function normalizePhoto(row: Record<string, unknown>): Photo {
    const count = (value: unknown) => {
        if (value === null || value === undefined || value === "" || typeof value === "boolean") return null
        const numeric = Number(value)
        return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : null
    }
    const attendees = count(row.TOTAL_ATTENDEES)
    let hands = count(row.RAISED_HANDS)
    if (hands !== null && attendees !== null && hands > attendees) hands = null
    const modified = row.LAST_MODIFIED instanceof Date ? row.LAST_MODIFIED.toISOString() : typeof row.LAST_MODIFIED === "string" ? row.LAST_MODIFIED : null
    return {
        path: String(row.RELATIVE_PATH), size: Number(row.SIZE), modified, attendees, hands,
        percentage: attendees !== null && attendees > 0 && hands !== null ? Math.round(hands / attendees * 1000) / 10 : null,
        caption: typeof row.CAPTION === "string" && row.CAPTION.trim() ? row.CAPTION : null,
    }
}

export function sumKnown(photos: Photo[], key: "attendees" | "hands"): number | null {
    const values = photos.map(photo => photo[key]).filter(value => value !== null)
    return values.length ? values.reduce((total, value) => total + value, 0) : null
}