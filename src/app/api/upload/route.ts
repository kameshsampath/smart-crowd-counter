import { NextRequest, NextResponse } from "next/server";
import { uploadToStage, querySnowflake, getConfig } from "@/lib/snowflake";
import { ensureSnowflakeObjects } from "@/lib/setup";

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
                const buffer = Buffer.from(await file.arrayBuffer());
                await uploadToStage(buffer, file.name, stagePath);
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
