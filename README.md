# Smart Crowd Counter

AI-powered conference attendee counting and engagement analytics built on **Snowflake App Runtime** (Next.js / React / TypeScript).

Upload conference session photos and Snowflake Cortex AI analyzes them to count total attendees, detect raised hands, and calculate engagement conversion rates.

## Features

- **Multi-file upload** — Drag-and-drop JPG/PNG photos from conference sessions
- **AI image analysis** — Cortex AI (`claude-4-sonnet`) counts people and raised hands
- **Real-time dashboard** — Sortable table, metrics cards, donut chart
- **Image preview** — Click any row to see the photo with presigned URL
- **Self-contained** — Auto-creates all Snowflake objects on first run

## Quick Start

```bash
# 1. Clone and checkout
git clone <repo-url>
cd smart-crowd-counter
git checkout feat/react-app

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env.local
# Edit .env.local with your Snowflake credentials

# 4. Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). On first request, the app automatically creates the database, schema, stage, and view in Snowflake.

## Architecture

```
Next.js App (React 19 + TypeScript)
├── Frontend: Dashboard with SWR data fetching
├── API Routes:
│   ├── GET  /api/images        → Query SMART_CROWD_COUNTER view
│   ├── POST /api/upload        → PUT files to Snowflake stage
│   └── GET  /api/presigned-url → Generate image display URLs
└── Snowflake Layer:
    ├── Auto-setup (CREATE IF NOT EXISTS for all objects)
    ├── Internal stage with directory table
    └── View calling Cortex AI_COMPLETE for image analysis
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SNOWFLAKE_DEFAULT_CONNECTION_NAME` | Connection name from `~/.snowflake/connections.toml` | `default` |
| `SNOWFLAKE_DATABASE` | Database name | `CROWD_COUNTER_DB` |
| `SNOWFLAKE_SCHEMA` | Schema name | `CONFERENCES` |
| `SNOWFLAKE_STAGE` | Stage name | `SNAPS` |
| `AI_MODEL` | Cortex AI model | `claude-4-sonnet` |

For local development, the app reads credentials from your existing `~/.snowflake/connections.toml` — no passwords in `.env.local` needed.

## Deploy to Snowflake

```bash
snow app setup --app-name smart_crowd_counter
snow app deploy
snow app open
```

---

## Built with Intent-Driven Development (IDD)

This application was built using **Intent-Driven Development** — a methodology where intent is the source of truth and code is the output artifact. Instead of writing code line-by-line, the developer expresses structured intent and an AI coding agent generates the complete system.

Learn more about IDD:

- [Intent-Driven Development: The Shift Developers Can't Ignore](https://blogs.kameshs.dev/intent-driven-development-the-shift-developers-cant-ignore-ef434f94d56c)
- [Intent Compression Ratio: Measuring the Power of Intent](https://blogs.kameshs.dev/intent-compression-ratio-measuring-the-power-of-intent-ceb6faf2e2f9)
- [ICR and Token Economics](https://blogs.kameshs.dev/icr-and-token-economics-9a014a75b399)
- [Infrastructure-as-Intent: The Field Velocity Blueprint](https://blogs.kameshs.dev/infrastructure-as-intent-the-field-velocity-blueprint-e6217ef30f14)
- [The Ghost in the Machine: Why AI Needs the Spirit of UML](https://blogs.kameshs.dev/the-ghost-in-the-machine-why-ai-needs-the-spirit-of-uml-0d8864e583e2)

### The IDD Prompt

The following prompt was used to generate this entire application. You can reproduce the migration by pasting it into [Cortex Code](https://docs.snowflake.com/en/user-guide/cortex-code/cortex-code) on the `main` branch:

```markdown
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
  - Creates the database, schema, stage (SSE + directory table), and
    the SMART_CROWD_COUNTER view only if they don't exist
  - Uses the same Cortex AI SQL logic from the existing setup.sql
  - Reads all object names and AI model from environment variables
- Implement four API routes:
  - GET /api/images — queries the SMART_CROWD_COUNTER view
  - GET /api/file-count — cheap directory table count (no AI) for
    detecting external changes to the stage
  - POST /api/upload — accepts multipart files, PUTs them to the
    Snowflake stage, refreshes the stage directory
  - GET /api/presigned-url — generates a presigned URL using server-side
    config (client only passes the relative path, not the stage name)
- Each API route calls ensureSnowflakeObjects() before doing its work
- Build five React components:
  - FileUploader (drag-and-drop, multi-file, jpg/png/jpeg validation,
    disabled until initial data loads)
  - DataTable (sortable, single-row selection, hides internal columns)
  - MetricsCards (Total Attendees, Raised Hands, Conversion Rate)
  - DonutChart (Recharts PieChart showing attendees vs raised hands)
  - ImageViewer (displays image via presigned URL with file metadata)
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
- Keep the SMART_CROWD_COUNTER view SQL logic identical to setup.sql
  (same AI prompts, same column structure)
- Minimize dependencies: next, react, react-dom, snowflake-sdk,
  recharts, swr
- Use Tailwind CSS for styling — no additional UI component libraries
- This is a React app, not Streamlit — no full-page rerenders, no
  manual refresh buttons, no clearing the table on data refetch

## Output

- A working Next.js app on branch feat/react-app that starts with
  `npm run dev` and auto-creates Snowflake objects on first request
- All five UI features functional: upload, table, row selection,
  image preview, chart
- Updated .env.example documenting required environment variables
  (SNOWFLAKE_DEFAULT_CONNECTION_NAME + object overrides only)
- Updated Taskfile.yml with app:dev, app:build, app:reset tasks
- README.md with a "Built with IDD" section containing the prompt
  and ICR score breakdown
- Report: list each file created/modified and confirm the app runs
  without errors on first launch against an empty Snowflake account
```

### ICR Score Breakdown

**ICR (Intent Compression Ratio)** measures how much work a single intent expression produces:

```
ICR = Total Required Operations / Intent Expressions
```

| # | Intent Expression | Operations Generated | Count |
|---|---|---|---|
| 1 | Scaffold Next.js project | create-next-app, tsconfig, tailwind, postcss, app.yml, .env.example, .gitignore, package.json, layout.tsx, next.config (standalone) | 10 |
| 2 | Snowflake data access layer | snowflake.ts (TOML parser, dual-mode auth, getConnection, querySnowflake, uploadToStage, getConfig) | 6 |
| 3 | Auto-setup module | setup.ts (existence checks via SHOW, conditional CREATE for DB/SCHEMA/STAGE/VIEW, caching, error handling) | 8 |
| 4 | Four API routes | images/route.ts, file-count/route.ts, upload/route.ts, presigned-url/route.ts (server-side config, validation, error handling) | 8 |
| 5 | Five UI components | FileUploader (disabled state, drag-and-drop), DataTable, MetricsCards, DonutChart, ImageViewer (each with props, state, styling) | 12 |
| 6 | Reactive page composition | page.tsx (SWR + keepPreviousData, upload polling with auto-stop, file-count sync polling, divergence detection, upload-disabled-until-ready, status indicators, responsive grid) | 10 |
| 7 | Taskfile + demo workflow | app:dev, app:build, app:deploy, app:open, app:reset (stage clear for demos) | 5 |
| | **Total** | | **59 ops / 7 intents** |

### **ICR = 8.4**

On the ICR scale:

- **ICR 1** = Command relay (one intent, one action)
- **ICR 4-8** = Automation wrapper
- **ICR 9+** = Architectural partner

This prompt scores **8.4** — at the boundary of architectural partner. With the Output section requiring a report (Glass Box observability) and the Constraints encoding production lessons (no full-page rerenders, server-side config only, reactive sync via cheap polling, avoid expensive AI re-queries), this qualifies as **Glass Box Compression**: high ICR + full observability + codified wisdom.

---

## License

Apache License 2.0
