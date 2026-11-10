import { createHmac, timingSafeEqual } from "node:crypto"
import { safeImagePath } from "./crowd"
import { PHOTOS_BUCKET } from "./storage"

export type ResetSnapshot = { paths: string[]; cutoff: string; bucket: string }

function secret() {
    return process.env.RESET_SECRET ?? "local-dev-reset-secret"
}

function signature(payload: string) {
    return createHmac("sha256", secret()).update("reset:" + payload).digest("hex")
}

export function signReset(snapshot: ResetSnapshot) {
    const payload = Buffer.from(JSON.stringify(snapshot)).toString("base64url")
    return `${payload}.${signature(payload)}`
}

export function readReset(token: string): ResetSnapshot {
    if (token.length > 2_000_000) throw new Error("Invalid reset token")
    const [payload, signed] = token.split(".")
    const expected = signature(payload)
    if (!signed || signed.length !== expected.length || !timingSafeEqual(Buffer.from(signed), Buffer.from(expected))) throw new Error("Invalid reset token")
    const snapshot = JSON.parse(Buffer.from(payload, "base64url").toString())
    if (snapshot.bucket !== PHOTOS_BUCKET || !Array.isArray(snapshot.paths) || !snapshot.paths.every((path: unknown) => typeof path === "string" && safeImagePath(path)) || !Number.isFinite(Date.parse(snapshot.cutoff))) throw new Error("Invalid reset snapshot")
    return snapshot
}
