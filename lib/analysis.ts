import "server-only"

export const AGENT_URL = process.env.AGENT_URL ?? "http://localhost:8000"
export const AGENT_TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS ?? 300_000)

export type RawAnalysis = {
    total_attendees?: unknown
    raised_hands?: unknown
    percentage_with_hands_up?: unknown
    caption?: unknown
}

export async function analyzePhoto(path: string, bytes?: Buffer): Promise<RawAnalysis> {
    const payload: { path: string; image_base64?: string } = { path }
    if (bytes) payload.image_base64 = bytes.toString("base64")
    const response = await fetch(`${AGENT_URL}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`Agent analysis failed with status ${response.status}`)
    const body = await response.json()
    if (!body || typeof body !== "object") throw new Error("Agent returned an invalid analysis")
    return body as RawAnalysis
}
