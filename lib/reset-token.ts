import { createHmac, timingSafeEqual } from "node:crypto"
import { getSecret, SecretType } from "./snowflake"
import { safeStagePath, STAGE } from "./crowd"
export type ResetSnapshot = { paths: string[]; cutoff: string; stage: string }
function signature(payload: string) {
    return createHmac("sha256", getSecret("PG_CREDENTIALS", SecretType.PASSWORD).password).update("reset:" + payload).digest("hex")
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
    if (snapshot.stage !== STAGE || !Array.isArray(snapshot.paths) || !snapshot.paths.every((path: unknown) => typeof path === "string" && safeStagePath(path)) || !Number.isFinite(Date.parse(snapshot.cutoff))) throw new Error("Invalid reset snapshot")
    return snapshot
}