import { querySnowflake, getConfig } from "./snowflake";

let initialized = false;

async function objectExists(
    type: "DATABASE" | "SCHEMA" | "STAGE" | "VIEW",
    name: string
): Promise<boolean> {
    try {
        const rows = await querySnowflake(
            `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.${type === "DATABASE" ? "DATABASES" : type + "S"} WHERE ${type}_NAME = '${name.split(".").pop()}'`
        );
        return (rows[0]?.CNT as number) > 0;
    } catch {
        // Fallback: try SHOW and see if it errors
        try {
            await querySnowflake(`SHOW ${type}S LIKE '${name.split(".").pop()}' IN ${type === "DATABASE" ? "ACCOUNT" : type === "SCHEMA" ? "DATABASE " + name.split(".")[0] : "SCHEMA " + name.split(".").slice(0, 2).join(".")}`);
            return true;
        } catch {
            return false;
        }
    }
}

export async function ensureSnowflakeObjects(): Promise<void> {
    if (initialized) return;

    const { database, schema, stage, aiModel } = getConfig();

    console.log(
        `[setup] Ensuring Snowflake objects exist: ${database}.${schema}`
    );

    // Check each object and only create if missing
    const setupSteps: { check: () => Promise<boolean>; sql: string; label: string }[] = [
        {
            label: "database",
            check: async () => {
                try {
                    const rows = await querySnowflake(
                        `SHOW DATABASES LIKE '${database}'`
                    );
                    return rows.length > 0;
                } catch {
                    return false;
                }
            },
            sql: `CREATE DATABASE IF NOT EXISTS ${database}`,
        },
        {
            label: "schema",
            check: async () => {
                try {
                    const rows = await querySnowflake(
                        `SHOW SCHEMAS LIKE '${schema}' IN DATABASE ${database}`
                    );
                    return rows.length > 0;
                } catch {
                    return false;
                }
            },
            sql: `CREATE SCHEMA IF NOT EXISTS ${database}.${schema}`,
        },
        {
            label: "stage",
            check: async () => {
                try {
                    const rows = await querySnowflake(
                        `SHOW STAGES LIKE '${stage}' IN SCHEMA ${database}.${schema}`
                    );
                    return rows.length > 0;
                } catch {
                    return false;
                }
            },
            sql: `CREATE STAGE IF NOT EXISTS ${database}.${schema}.${stage}
       ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE')
       DIRECTORY = (ENABLE = TRUE, AUTO_REFRESH = TRUE)
       COMMENT = 'Stage for conference session photos'`,
        },
        {
            label: "view",
            check: async () => {
                try {
                    const rows = await querySnowflake(
                        `SHOW VIEWS LIKE 'SMART_CROWD_COUNTER' IN SCHEMA ${database}.${schema}`
                    );
                    return rows.length > 0;
                } catch {
                    return false;
                }
            },
            sql: `CREATE OR REPLACE VIEW ${database}.${schema}.SMART_CROWD_COUNTER AS
     WITH image_files AS (
       SELECT
         relative_path AS name,
         TO_FILE(CONCAT('@${database}.${schema}.${stage}/', relative_path)) AS file,
         last_modified
       FROM DIRECTORY('@${database}.${schema}.${stage}')
       WHERE LOWER(relative_path) LIKE '%.jpg'
          OR LOWER(relative_path) LIKE '%.jpeg'
          OR LOWER(relative_path) LIKE '%.png'
     ),
     processed_images AS (
       SELECT
         name,
         file,
         last_modified,
         AI_COMPLETE(
           '${aiModel}',
           'Analyze this image and count people and raised hands. '
           || 'Return JSON only with this exact structure: '
           || '{"total_attendees": N, "raised_hands": N, "percentage_with_hands_up": N.NN}. '
           || 'Calculate percentage as (raised_hands/total_attendees)*100, rounded to 2 decimals. '
           || 'If no people are visible, return zeros.',
           file
         ) AS attendees_count
       FROM image_files
     )
     SELECT
       name,
       file AS file_name,
       AI_COMPLETE(
         '${aiModel}',
         'Create a brief caption for a conference photo with filename: ' || name || '. '
         || 'Context: NS=Northstar, SWT=Snowflake World Tour. '
         || 'Location codes like PUNE, DELHI, MEL indicate cities. '
         || 'Format: Event Name - Location - Session. '
         || 'Add "Workshop" if filename suggests hands-on session. '
         || 'Keep it under 10 words.'
       ) AS caption,
       attendees_count AS raw,
       TRY_PARSE_JSON(attendees_count):total_attendees::INTEGER AS total_attendees,
       TRY_PARSE_JSON(attendees_count):raised_hands::INTEGER AS raised_hands,
       TRY_PARSE_JSON(attendees_count):percentage_with_hands_up::FLOAT AS percentage_with_hands_up
     FROM processed_images
     ORDER BY name`,
        },
    ];

    for (const step of setupSteps) {
        const exists = await step.check();
        if (exists) {
            console.log(`[setup] ${step.label} already exists, skipping`);
        } else {
            console.log(`[setup] Creating ${step.label}...`);
            try {
                await querySnowflake(step.sql);
            } catch (error) {
                console.error(
                    `[setup] Failed to create ${step.label}: ${error instanceof Error ? error.message : error}`
                );
                throw error;
            }
        }
    }

    console.log("[setup] All Snowflake objects verified/created successfully");
    initialized = true;
}
