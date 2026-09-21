export function mutationAllowed(request: Request) {
    return request.headers.get("x-crowd-action") === "1"
        && request.headers.get("sec-fetch-site") !== "cross-site"
}

export function apiError(error: unknown, action: string) {
    console.error(`[crowd] ${action}`, error)
    return Response.json({ error: `${action} failed. Please retry or contact the app owner.` },
        { status: 500, headers: { "Cache-Control": "no-store" } })
}

export async function limitedFormData(request: Request, limit: number) {
    if (Number(request.headers.get("content-length")) > limit) throw new Error("Upload too large")
    if (!request.body) throw new Error("Missing upload body")
    const reader = request.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > limit) {
            await reader.cancel()
            throw new Error("Upload too large")
        }
        chunks.push(value)
    }
    return new Response(Buffer.concat(chunks), {
        headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData()
}