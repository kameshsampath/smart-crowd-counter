import { NextResponse } from "next/server";
import { querySnowflake, getConfig } from "@/lib/snowflake";

export async function GET() {
    try {
        const { database, schema, stage } = getConfig();
        const sql = `SELECT COUNT(*) AS cnt FROM DIRECTORY('@${database}.${schema}.${stage}') WHERE LOWER(relative_path) LIKE '%.jpg' OR LOWER(relative_path) LIKE '%.jpeg' OR LOWER(relative_path) LIKE '%.png'`;
        const rows = await querySnowflake(sql);
        const count = (rows[0]?.CNT as number) ?? 0;
        return NextResponse.json({ count });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
