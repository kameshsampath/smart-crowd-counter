# Smart Crowd Counter

AI-powered conference attendee counting and engagement analytics built on **Snowflake App Runtime** (Next.js / React / TypeScript).

Upload conference session photos and Snowflake Cortex AI analyzes them to count total attendees, detect raised hands, classify session types, and enrich with EXIF metadata + reverse geocoding.

## Features

- **Multi-file upload** — Drag-and-drop JPG/PNG photos from conference sessions
- **AI image analysis** — Cortex AI (`claude-4-sonnet`) counts people, raised hands, infers session type and venue context
- **EXIF metadata extraction** — GPS coordinates, camera make/model, timestamp from JPEG files
- **Reverse geocoding** — Resolves GPS lat/lon to human-readable location names (e.g., "Bengaluru, Karnataka, India")
- **Smart image resizing** — Images >3 MB auto-resized before upload to stay within AI model input limits
- **Reactive dashboard** — SWR-based polling, no manual refresh, auto-detects external stage changes
- **Image preview** — Click any row to see photo + AI scene context + location + EXIF details
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
├── Frontend: Dashboard with SWR reactive data fetching
├── API Routes:
│   ├── GET  /api/images        → Query SMART_CROWD_COUNTER view
│   ├── GET  /api/file-count    → Cheap directory count for sync detection
│   ├── POST /api/upload        → EXIF extract → resize → PUT → geocode → MERGE
│   └── GET  /api/presigned-url → Generate image display URLs
└── Snowflake Layer:
    ├── Auto-setup (SHOW + CREATE IF NOT EXISTS for all objects)
    ├── Internal stage with directory table
    ├── IMAGE_METADATA table (EXIF + reverse-geocoded location)
    └── View: AI_COMPLETE + REGEXP_SUBSTR + LEFT JOIN metadata
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

The full prompt used to generate this application is in **[IDD_PROMPT.md](./IDD_PROMPT.md)**.

It demonstrates a complete Streamlit-to-React migration expressed as structured intent following the [Goal][Requirements][Constraints][Output] pattern. Paste it into [Cortex Code](https://docs.snowflake.com/en/user-guide/cortex-code/cortex-code) on the `main` branch to reproduce the full migration.

### ICR Score Breakdown

**ICR (Intent Compression Ratio)** measures how much work a single intent expression produces:

```
ICR = Total Required Operations / Intent Expressions
```

| # | Intent Expression | Operations Generated | Count |
|---|---|---|---|
| 1 | Scaffold Next.js project | create-next-app, tsconfig, tailwind, postcss, app.yml, .env.example, .gitignore, package.json, layout.tsx, next.config (standalone) | 10 |
| 2 | Snowflake data access layer | snowflake.ts (TOML parser, dual-mode auth, getConnection, querySnowflake, uploadToStage, getConfig) | 6 |
| 3 | Auto-setup module | setup.ts (existence checks, conditional CREATE for DB/SCHEMA/STAGE/TABLE/VIEW, REGEXP_SUBSTR JSON extraction, LEFT JOIN metadata, caching) | 11 |
| 4 | Four API routes + upload pipeline | images/route.ts, file-count/route.ts, upload/route.ts (EXIF extract + JPEG validation + reverse geocode + sharp resize + MERGE + non-fatal error handling), presigned-url/route.ts, type declarations | 14 |
| 5 | Five UI components | FileUploader (disabled state), DataTable (session type + location_name fallback chain), MetricsCards, DonutChart, ImageViewer (AI context + geocoded pin + collapsible EXIF + map link) | 15 |
| 6 | Reactive page composition | page.tsx (SWR + keepPreviousData, upload polling, file-count sync, divergence detection, upload-disabled, responsive grid) | 10 |
| 7 | Taskfile + demo workflow | app:dev, app:build, app:deploy, app:open, app:reset (stage clear for demos) | 5 |
| | **Total** | | **71 ops / 7 intents** |

### **ICR = 10.1**

On the ICR scale:

- **ICR 1** = Command relay (one intent, one action)
- **ICR 4-8** = Automation wrapper
- **ICR 9+** = Architectural partner

This prompt scores **10.1** — in the architectural partner range. A single structured intent produces a complete system with an image processing pipeline (EXIF extraction, reverse geocoding, AI-safe resizing), Cortex AI-enriched views with robust JSON parsing, reactive sync, and a metadata storage layer. With Glass Box observability (Output report requirement) and Codified Wisdom (Constraints encoding production lessons like the REGEXP_SUBSTR fix and non-fatal MERGE), this is the target design point for IDD app migrations.

---

## License

Apache License 2.0
