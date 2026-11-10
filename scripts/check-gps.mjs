// Prints the EXIF tags (GPS, camera, date) found in an image file.
// Usage: node scripts/check-gps.mjs <photo.jpg>

import { readFile } from "node:fs/promises"

import exifr from "exifr"

const file = process.argv[2]
if (!file) {
    console.error("Usage: node scripts/check-gps.mjs <image-file>")
    process.exit(1)
}

const buffer = await readFile(file)
const all = await exifr.parse(buffer)
const gps = await exifr.gps(buffer)

console.log(JSON.stringify({
    file,
    hasExif: Boolean(all),
    gps: gps ?? null,
    camera: all ? { make: all.Make ?? null, model: all.Model ?? null, date: all.DateTimeOriginal ?? all.CreateDate ?? null } : null,
}, null, 2))
