import { NextRequest, NextResponse } from "next/server";
import { uploadToStage, querySnowflake, getConfig } from "@/lib/snowflake";
import { ensureSnowflakeObjects } from "@/lib/setup";
import exifParser from "exif-parser";
import sharp from "sharp";

const MAX_IMAGE_DIMENSION = 2048;
const MAX_FILE_SIZE_BYTES = 3 * 1024 * 1024; // 3MB target for AI processing

interface ExifMetadata {
    latitude: number | null;
    longitude: number | null;
    altitude: number | null;
    takenAt: Date | null;
    cameraMake: string | null;
    cameraModel: string | null;
    locationName: string | null;
}

function extractExif(buffer: Buffer, fileName: string): ExifMetadata {
    const ext = fileName.toLowerCase().split(".").pop();
    if (ext === "png") {
        console.log(`[exif] ${fileName}: PNG files don't contain JPEG EXIF data, skipping`);
        return { latitude: null, longitude: null, altitude: null, takenAt: null, cameraMake: null, cameraModel: null, locationName: null };
    }

    try {
        // Verify JPEG magic bytes (FF D8)
        if (buffer[0] !== 0xFF || buffer[1] !== 0xD8) {
            console.warn(`[exif] ${fileName}: not a valid JPEG (magic: ${buffer.slice(0, 2).toString("hex")})`);
            return { latitude: null, longitude: null, altitude: null, takenAt: null, cameraMake: null, cameraModel: null, locationName: null };
        }

        const parser = exifParser.create(buffer);
        const result = parser.parse();
        const tags = result.tags;

        const meta = {
            latitude: tags.GPSLatitude ?? null,
            longitude: tags.GPSLongitude ?? null,
            altitude: tags.GPSAltitude ?? null,
            takenAt: tags.DateTimeOriginal
                ? new Date(tags.DateTimeOriginal * 1000)
                : null,
            cameraMake: tags.Make ?? null,
            cameraModel: tags.Model ?? null,
            locationName: null,
        };
        console.log(`[exif] ${fileName}: lat=${meta.latitude}, lon=${meta.longitude}, make=${meta.cameraMake}, model=${meta.cameraModel}, takenAt=${meta.takenAt}`);
        return meta;
    } catch (e) {
        console.warn(`[exif] ${fileName}: extraction failed -`, e instanceof Error ? e.message : e);
        return {
            latitude: null,
            longitude: null,
            altitude: null,
            takenAt: null,
            cameraMake: null,
            cameraModel: null,
            locationName: null,
        };
    }
}

async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=14`,
            { headers: { "User-Agent": "SmartCrowdCounter/1.0" } }
        );
        if (!res.ok) return null;
        const data = await res.json();
        // Build a concise location: city/town, state, country
        const addr = data.address || {};
        const parts = [
            addr.city || addr.town || addr.village || addr.suburb,
            addr.state,
            addr.country,
        ].filter(Boolean);
        const location = parts.join(", ") || data.display_name || null;
        console.log(`[geocode] ${lat},${lon} → ${location}`);
        return location;
    } catch (e) {
        console.warn(`[geocode] failed:`, e instanceof Error ? e.message : e);
        return null;
    }
}

async function upsertMetadata(
    fileName: string,
    meta: ExifMetadata,
    database: string,
    schema: string
): Promise<void> {
    const takenAtStr = meta.takenAt
        ? `'${meta.takenAt.toISOString().replace("T", " ").slice(0, 19)}'`
        : "NULL";
    const lat = meta.latitude ?? "NULL";
    const lon = meta.longitude ?? "NULL";
    const alt = meta.altitude ?? "NULL";
    const make = meta.cameraMake ? `'${meta.cameraMake.replace(/'/g, "''")}'` : "NULL";
    const model = meta.cameraModel ? `'${meta.cameraModel.replace(/'/g, "''")}'` : "NULL";
    const location = meta.locationName ? `'${meta.locationName.replace(/'/g, "''")}'` : "NULL";

    const sql = `MERGE INTO ${database}.${schema}.IMAGE_METADATA t
    USING (SELECT '${fileName.replace(/'/g, "''")}' AS file_name) s
    ON t.file_name = s.file_name
    WHEN MATCHED THEN UPDATE SET
      latitude = ${lat}, longitude = ${lon}, altitude = ${alt},
      taken_at = ${takenAtStr}, camera_make = ${make}, camera_model = ${model},
      location_name = ${location}
    WHEN NOT MATCHED THEN INSERT (file_name, latitude, longitude, altitude, taken_at, camera_make, camera_model, location_name)
      VALUES (s.file_name, ${lat}, ${lon}, ${alt}, ${takenAtStr}, ${make}, ${model}, ${location})`;

    await querySnowflake(sql);
}

export async function POST(request: NextRequest) {
    try {
        await ensureSnowflakeObjects();

        const { database, schema, stage } = getConfig();
        const stagePath = `@${database}.${schema}.${stage}`;

        const formData = await request.formData();
        const files = formData.getAll("files") as File[];

        if (!files.length) {
            return NextResponse.json({ error: "No files provided" }, { status: 400 });
        }

        const results: { name: string; success: boolean; error?: string }[] = [];

        for (const file of files) {
            const ext = file.name.toLowerCase().split(".").pop();
            if (!["jpg", "jpeg", "png"].includes(ext || "")) {
                results.push({
                    name: file.name,
                    success: false,
                    error: "Invalid file type. Only JPG, JPEG, PNG allowed.",
                });
                continue;
            }

            try {
                const originalBuffer = Buffer.from(await file.arrayBuffer());

                // Extract EXIF metadata from original (before resize)
                const meta = extractExif(originalBuffer, file.name);

                // Reverse geocode if GPS coordinates available
                if (meta.latitude && meta.longitude) {
                    meta.locationName = await reverseGeocode(meta.latitude, meta.longitude);
                }

                // Resize if too large for AI processing
                let uploadBuffer: Buffer = originalBuffer;
                if (originalBuffer.length > MAX_FILE_SIZE_BYTES) {
                    console.log(`[upload] ${file.name}: ${(originalBuffer.length / 1024 / 1024).toFixed(1)}MB exceeds limit, resizing...`);
                    uploadBuffer = await sharp(originalBuffer)
                        .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, { fit: "inside", withoutEnlargement: true })
                        .jpeg({ quality: 80 })
                        .toBuffer() as Buffer;
                    console.log(`[upload] ${file.name}: resized to ${(uploadBuffer.length / 1024 / 1024).toFixed(1)}MB`);
                }

                // Upload to stage
                await uploadToStage(uploadBuffer, file.name, stagePath);

                // Store EXIF metadata (non-fatal — don't fail upload if MERGE fails)
                try {
                    await upsertMetadata(file.name, meta, database, schema);
                } catch (metaErr) {
                    console.warn(`[upload] EXIF metadata upsert failed for ${file.name}:`, metaErr instanceof Error ? metaErr.message : metaErr);
                }

                results.push({ name: file.name, success: true });
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : "Upload failed";
                results.push({ name: file.name, success: false, error: message });
            }
        }

        // Refresh stage directory after all uploads
        const successCount = results.filter((r) => r.success).length;
        if (successCount > 0) {
            await querySnowflake(
                `ALTER STAGE ${database}.${schema}.${stage} REFRESH`
            );
        }

        return NextResponse.json({
            results,
            uploaded: successCount,
            total: files.length,
        });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unknown error occurred";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
