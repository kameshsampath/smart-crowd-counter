import { NextRequest, NextResponse } from "next/server";
import { querySnowflake, getConfig } from "@/lib/snowflake";

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const filePath = searchParams.get("path");

        if (!filePath) {
            return NextResponse.json(
                { error: "Missing 'path' query parameter" },
                { status: 400 }
            );
        }

        const { database, schema, stage } = getConfig();
        const stageFqn = `@${database}.${schema}.${stage}`;

        const sql = `SELECT GET_PRESIGNED_URL('${stageFqn}', '${filePath}', 604800) AS url`;
        const rows = await querySnowflake(sql);

        if (rows.length > 0) {
            return NextResponse.json({ url: rows[0]["URL"] });
        }

        return NextResponse.json(
            { error: "Could not generate presigned URL" },
            { status: 404 }
        );
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unknown error occurred";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
