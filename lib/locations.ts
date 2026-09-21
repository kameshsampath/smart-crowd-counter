import "server-only"
import { Pool } from "pg"
import { getSecret, SecretType } from "./snowflake"
import { STAGE, Photo } from "./crowd"
import { coordinates, Coordinates } from "./gps"
let pool: Pool | undefined
export const STAGE_FQN = STAGE.slice(1)
export function locationPool() {
    if (!pool) {
        const credentials = getSecret("PG_CREDENTIALS", SecretType.PASSWORD)
        pool = new Pool({
            host: process.env.PGHOST, port: 5432, database: "postgres",
            user: credentials.username, password: credentials.password,
            ssl: { ca: getSecret("PG_CA", SecretType.GENERIC_STRING), rejectUnauthorized: true },
            max: 4, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000,
            statement_timeout: 10_000, query_timeout: 12_000,
        })
        pool.on("error", () => console.error("Postgres idle connection failed"))
    }
    return pool
}
export async function saveLocation(path: string, gps: Coordinates, uploadedAt: string) {
    await locationPool().query(`INSERT INTO crowd_counter.session_locations
    (stage_fqn,relative_path,latitude,longitude,uploaded_at) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(stage_fqn,relative_path) DO UPDATE SET latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude`,
        [STAGE_FQN, path, gps.latitude, gps.longitude, uploadedAt])
}
export async function mergeLocations(photos: Photo[]) {
    try {
        const result = await locationPool().query(`SELECT relative_path,latitude,longitude
      FROM crowd_counter.session_locations WHERE stage_fqn=$1 AND relative_path=ANY($2::text[])`,
            [STAGE_FQN, photos.map(photo => photo.path)])
        const locations = new Map(result.rows.map(row => [row.relative_path, coordinates(row)]))
        return { photos: photos.map(photo => ({ ...photo, ...locations.get(photo.path) ?? coordinates(null) })), locationWarning: null }
    } catch (_error) {
        return { photos: photos.map(photo => ({ ...photo, ...coordinates(null) })), locationWarning: "Locations are temporarily unavailable. Photo analysis is still available." }
    }
}
export async function clearLocations(cutoff: string) {
    await locationPool().query("DELETE FROM crowd_counter.session_locations WHERE stage_fqn=$1 AND uploaded_at <= $2::timestamptz", [STAGE_FQN, cutoff])
}