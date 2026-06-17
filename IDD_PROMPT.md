# IDD Prompt — Smart Crowd Counter Migration

This prompt was used to migrate the Smart Crowd Counter app from Streamlit-in-Snowflake to a Snowflake App Runtime (React/Next.js) application using [Intent-Driven Development](https://blogs.kameshs.dev/intent-driven-development-the-shift-developers-cant-ignore-ef434f94d56c).

Paste it into [Cortex Code](https://docs.snowflake.com/en/user-guide/cortex-code/cortex-code) on the `main` branch to reproduce the full migration.

---

## Goal

Migrate the Smart Crowd Counter app from Streamlit-in-Snowflake to a
Snowflake App Runtime application (Next.js 15 / React 19 / TypeScript)
on a new branch called `feat/react-app`. The resulting app must be fully
self-contained: if the Snowflake database, schema, stage, or view do not
exist, the app creates them automatically on first run.

## Requirements

- Scaffold a Next.js 15 project with App Router, TypeScript, Tailwind CSS,
  and a `src/` directory structure
- Create a Snowflake data access layer (`src/lib/snowflake.ts`) that:
  - In deployed mode, reads the OAuth token from /snowflake/session/token
  - In local dev mode, parses ~/.snowflake/config.toml (or connections.toml)
    using SNOWFLAKE_DEFAULT_CONNECTION_NAME from .env.local — supports
    SNOWFLAKE_JWT (key-pair) and EXTERNALBROWSER authenticators
  - No passwords in .env files — leverage existing Snowflake CLI config
- Create an auto-setup module (`src/lib/setup.ts`) that:
  - Runs once on the first API request (cached after success)
  - Checks each object exists (via SHOW) before attempting creation —
    so roles without CREATE privileges skip already-existing objects
  - Creates the database, schema, stage (SSE + directory table),
    IMAGE_METADATA table, and the SMART_CROWD_COUNTER view
  - The view is always recreated (CREATE OR REPLACE) to pick up
    schema changes
  - Reads all object names and AI model from environment variables
- IMAGE_METADATA table stores EXIF + geocoded data extracted at upload:
  file_name (PK), latitude, longitude, altitude, taken_at,
  camera_make, camera_model, location_name, uploaded_at
- The upload pipeline:
  1. Extracts EXIF metadata from original buffer (skip PNGs, verify JPEG
     magic bytes, use exif-parser)
  2. If GPS coordinates present, reverse geocode via OpenStreetMap Nominatim
     to get a human-readable location name (city, state, country)
  3. Resize images >3MB using sharp (max 2048px, JPEG quality 80) before
     upload — keeps files within AI model input size limits while preserving
     EXIF from the original
  4. PUT resized buffer to Snowflake stage
  5. MERGE EXIF + location_name into IMAGE_METADATA (non-fatal — a MERGE
     failure must not fail the upload or prevent stage refresh)
  6. ALTER STAGE REFRESH to update directory listing
- The AI prompt extracts additional fields beyond crowd counting:
  session_type (keynote/workshop/networking/booth/other),
  venue_description, location_clues
- The view uses REGEXP_SUBSTR(ai_result, '\\{[\\s\\S]*\\}') to extract
  JSON from AI responses (handles markdown code fences AND nested braces
  in string values — NOT REGEXP_REPLACE which breaks on nested braces)
- The view LEFT JOINs IMAGE_METADATA to combine EXIF + geocoded location
  - AI analysis data
- Implement four API routes:
  - GET /api/images — queries the SMART_CROWD_COUNTER view
  - GET /api/file-count — cheap directory table count (no AI) for
    detecting external changes to the stage
  - POST /api/upload — the full pipeline described above
  - GET /api/presigned-url — generates a presigned URL using server-side
    config (client only passes the relative path, not the stage name)
- Each API route calls ensureSnowflakeObjects() before doing its work
- Build five React components:
  - FileUploader (drag-and-drop, multi-file, jpg/png/jpeg validation,
    disabled until initial data loads)
  - DataTable (sortable, single-row selection, shows session type and
    location columns — prefer location_name over location_clues over
    "GPS" fallback)
  - MetricsCards (Total Attendees, Raised Hands, Conversion Rate)
  - DonutChart (Recharts PieChart showing attendees vs raised hands)
  - ImageViewer (presigned URL image, AI scene context: session type,
    venue description, location clues; geocoded location with pin icon;
    EXIF details in a collapsible section: GPS with Google Maps link,
    camera make/model, taken-at timestamp)
- Compose the dashboard page with reactive data fetching:
  - Use SWR with keepPreviousData: true (no table flash on refetch)
  - After upload, poll every 5s until new rows appear (Cortex AI
    processing time), then stop automatically
  - Poll GET /api/file-count every 10s to detect external stage changes
    (e.g., files deleted via CLI); trigger full refetch only when count
    diverges from current row count — avoids expensive AI re-queries
  - Show "Processing N new images..." indicator during polling
  - Disable upload until initial data load completes
  - No manual refresh button — data updates reactively
- Include app.yml manifest for Snowflake App Runtime
- Extend Taskfile.yml with app:dev, app:build, app:reset (clear stage
  for demo scenarios) tasks

## Constraints

- Do NOT modify files on the main branch; create and work only on
  feat/react-app
- Do NOT push to remote or deploy — local testing only (npm run dev)
- Do NOT add a database/schema selector UI — use environment config
- Do NOT pass Snowflake config to the client — all SQL execution and
  stage references stay server-side in API routes
- The app must be self-contained: a fresh clone + .env.local + npm run dev
  should create all Snowflake objects automatically
- Do NOT use REGEXP_REPLACE for stripping AI markdown fences — it breaks
  on nested braces in AI output (e.g., venue descriptions containing {}).
  Use REGEXP_SUBSTR(ai_result, '\\{[\\s\\S]*\\}') which greedily extracts
  from first { to last }
- MERGE failures in metadata upsert must be non-fatal — log a warning but
  still mark the upload as successful and refresh the stage
- Minimize dependencies: next, react, react-dom, snowflake-sdk,
  recharts, swr, sharp, exif-parser
- Use Tailwind CSS for styling — no additional UI component libraries
- This is a React app, not Streamlit — no full-page rerenders, no
  manual refresh buttons, no clearing the table on data refetch

## Output

- A working Next.js app on branch feat/react-app that starts with
  `npm run dev` and auto-creates Snowflake objects on first request
- All features functional: upload with EXIF + geocoding, table with
  location names, row selection, image preview with AI context, chart
- Updated .env.example documenting required environment variables
  (SNOWFLAKE_DEFAULT_CONNECTION_NAME + object overrides only)
- Updated Taskfile.yml with app:dev, app:build, app:reset tasks
- README.md with a "Built with IDD" section containing the prompt
  and ICR score breakdown
- Report: list each file created/modified and confirm the app runs
  without errors on first launch against an empty Snowflake account
