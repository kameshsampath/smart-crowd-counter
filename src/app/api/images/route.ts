import { NextResponse } from "next/server";
import { querySnowflake, getConfig } from "@/lib/snowflake";
import { ensureSnowflakeObjects } from "@/lib/setup";

export async function GET() {
    try {
        await ensureSnowflakeObjects();

        const { database, schema } = getConfig();
        const sql = `SELECT * FROM ${database}.${schema}.SMART_CROWD_COUNTER`;
        const rows = await querySnowflake(sql);

        return NextResponse.json({ data: rows });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unknown error occurred";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
