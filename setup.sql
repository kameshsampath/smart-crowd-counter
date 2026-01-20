--!jinja
-- Copyright 2026 Kamesh Sampath
--
-- Licensed under the Apache License, Version 2.0 (the "License");
-- you may not use this file except in compliance with the License.
-- You may obtain a copy of the License at
--
--     http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing, software
-- distributed under the License is distributed on an "AS IS" BASIS,
-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
-- See the License for the specific language governing permissions and
-- limitations under the License.

-- ============================================================================
-- Smart Crowd Counter - Database Setup
-- ============================================================================
-- This script uses Jinja2 templating for variable substitution.
-- 
-- Prerequisites:
--   - Snowflake account with Cortex AISQL enabled
--   - Appropriate privileges to create databases, schemas, and stages
--
-- Usage with Snowflake CLI:
--   snow sql -f setup.sql --templating=ALL \
--     -D database=CROWD_COUNTER_DB \
--     -D schema=CONFERENCES \
--     -D stage=SNAPS \
--     -D ai_model=claude-4-sonnet
--
-- Or with EXECUTE IMMEDIATE FROM:
--   EXECUTE IMMEDIATE FROM @my_stage/setup.sql
--     USING (database => 'CROWD_COUNTER_DB', schema => 'CONFERENCES', 
--            stage => 'SNAPS', ai_model => 'claude-4-sonnet');
--
-- Reference: https://docs.snowflake.com/en/sql-reference/sql/execute-immediate-from#jinja2-templating
-- ============================================================================

{#- Set default values for variables if not provided -#}
{%- set db = database | default('CROWD_COUNTER_DB') -%}
{%- set sch = schema | default('CONFERENCES') -%}
{%- set stg = stage | default('SNAPS') -%}
{%- set model = ai_model | default('claude-4-sonnet') -%}

-- Use role with sufficient privileges
USE ROLE ACCOUNTADMIN;

-- ============================================================================
-- Database and Schema
-- ============================================================================

CREATE DATABASE IF NOT EXISTS {{ db }};

USE DATABASE {{ db }};

CREATE SCHEMA IF NOT EXISTS {{ sch }};

USE SCHEMA {{ sch }};

-- ============================================================================
-- Stage for Image Storage
-- ============================================================================
-- Directory table enables listing files and metadata queries
-- Reference: https://docs.snowflake.com/en/sql-reference/sql/create-stage

CREATE STAGE IF NOT EXISTS {{ stg }}
    ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE')
    DIRECTORY = (ENABLE = TRUE, AUTO_REFRESH = TRUE)
    COMMENT = 'Stage for conference session photos';

-- ============================================================================
-- AI-Powered View for Image Analysis
-- ============================================================================
-- This view processes images using Cortex AISQL to:
--   1. Count total attendees in each photo
--   2. Detect raised hands
--   3. Generate descriptive captions
--
-- Reference: https://docs.snowflake.com/en/user-guide/snowflake-cortex/aisql

CREATE OR REPLACE VIEW SMART_CROWD_COUNTER AS
WITH image_files AS (
    -- Get all supported images from the stage directory
    SELECT 
        relative_path AS name,
        TO_FILE(CONCAT('@{{ db }}.{{ sch }}.{{ stg }}/', relative_path)) AS file,
        last_modified
    FROM DIRECTORY('@{{ db }}.{{ sch }}.{{ stg }}')
    WHERE LOWER(relative_path) LIKE '%.jpg' 
       OR LOWER(relative_path) LIKE '%.jpeg'
       OR LOWER(relative_path) LIKE '%.png'
),
processed_images AS (
    -- Analyze each image for attendee count and raised hands
    SELECT 
        name,
        file,
        last_modified,
        AI_COMPLETE(
            '{{ model }}',
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
    -- Generate caption based on filename patterns
    AI_COMPLETE(
        '{{ model }}',
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
ORDER BY name;

-- ============================================================================
-- Verify Setup
-- ============================================================================

SHOW STAGES LIKE '{{ stg }}' IN SCHEMA {{ db }}.{{ sch }};
SHOW VIEWS LIKE 'SMART_CROWD_COUNTER' IN SCHEMA {{ db }}.{{ sch }};

SELECT 'Setup complete! Upload images to stage: @{{ db }}.{{ sch }}.{{ stg }}' AS status;
