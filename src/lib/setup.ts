import { querySnowflake, getConfig } from "./snowflake";

let initialized = false;

export async function ensureSnowflakeObjects(): Promise<void> {
    if (initialized) return;

    const { database, schema, stage, aiModel } = getConfig();

    console.log(
        `[setup] Ensuring Snowflake objects exist: ${database}.${schema}`
    );

    const setupSteps: {
        check: () => Promise<boolean>;
        sql: string;
        label: string;
    }[] = [
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
                label: "metadata table",
                check: async () => {
                    try {
                        const rows = await querySnowflake(
                            `SHOW TABLES LIKE 'IMAGE_METADATA' IN SCHEMA ${database}.${schema}`
                        );
                        return rows.length > 0;
                    } catch {
                        return false;
                    }
                },
                sql: `CREATE TABLE IF NOT EXISTS ${database}.${schema}.IMAGE_METADATA (
        file_name VARCHAR PRIMARY KEY,
        latitude FLOAT,
        longitude FLOAT,
        altitude FLOAT,
        taken_at TIMESTAMP_NTZ,
        camera_make VARCHAR,
        camera_model VARCHAR,
        location_name VARCHAR,
        uploaded_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
      )`,
            },
            {
                label: "view",
                check: async () => {
                    // Always recreate the view to pick up schema changes
                    return false;
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
           'Analyze this conference/event image. Return JSON only with this exact structure: '
           || '{"total_attendees": N, "raised_hands": N, "percentage_with_hands_up": N.NN, '
           || '"session_type": "keynote|workshop|networking|booth|other", '
           || '"venue_description": "brief description of the room/space", '
           || '"location_clues": "any visible signs, city names, or landmarks"}'
           || '. Calculate percentage as (raised_hands/total_attendees)*100, rounded to 2 decimals. '
           || 'If no people are visible, return zeros for counts. '
           || 'For session_type, infer from the setting (stage=keynote, small tables=workshop, etc.).',
           file
         ) AS ai_result
       FROM image_files
     ),
     parsed_results AS (
       SELECT
         name,
         file,
         last_modified,
         ai_result,
         TRY_PARSE_JSON(
           REGEXP_SUBSTR(ai_result, '\\\\{[\\\\s\\\\S]*\\\\}')
         ) AS parsed
       FROM processed_images
     )
     SELECT
       p.name,
       p.file AS file_name,
       AI_COMPLETE(
         '${aiModel}',
         'Create a brief caption for a conference photo with filename: ' || p.name || '. '
         || 'Context: NS=Northstar, SWT=Snowflake World Tour. '
         || 'Location codes like PUNE, DELHI, MEL indicate cities. '
         || 'Format: Event Name - Location - Session. '
         || 'Add "Workshop" if filename suggests hands-on session. '
         || 'Keep it under 10 words.'
       ) AS caption,
       p.ai_result AS raw,
       p.parsed:total_attendees::INTEGER AS total_attendees,
       p.parsed:raised_hands::INTEGER AS raised_hands,
       p.parsed:percentage_with_hands_up::FLOAT AS percentage_with_hands_up,
       p.parsed:session_type::VARCHAR AS session_type,
       p.parsed:venue_description::VARCHAR AS venue_description,
       p.parsed:location_clues::VARCHAR AS location_clues,
       m.latitude,
       m.longitude,
       m.altitude,
       m.taken_at,
       m.camera_make,
       m.camera_model,
       m.location_name
     FROM parsed_results p
     LEFT JOIN ${database}.${schema}.IMAGE_METADATA m ON m.file_name = p.name
     ORDER BY p.name`,
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
