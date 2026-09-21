# Smart Crowd Counter

An AI-powered conference photo app: upload session photos and get instant crowd size estimates, raised-hand counts, and captions using [Snowflake Cortex AI](https://docs.snowflake.com/en/guides-overview-ai-features), deployed as a [Snowflake App](https://docs.snowflake.com/en/developer-guide/snowflake-apps/about-snowflake-apps).

This repo is the generated, deployable app. It's built from the prompts and agent rules in the parent demo repo — **[kameshsampath/smart-crowd-counter-demo](https://github.com/kameshsampath/smart-crowd-counter-demo)** — which includes this repo as a git submodule for quick-check deploys. Start there if you want to regenerate this app yourself with [Cortex Code](https://docs.snowflake.com/en/user-guide/cortex-code/cortex-code); come here to run or deploy it as-is.

## Features

- Photo upload with validation (JPG/JPEG/PNG, size and dimension limits)
- AI-estimated attendee counts and raised-hand percentage per photo, via two Claude 4 Sonnet calls (`AI_COMPLETE`) per image
- Auto-generated captions
- A photo-first dashboard with a hands-up donut chart, light/dark themes, and an "Under the hood" drawer showing the SQL and result JSON behind each estimate
- Optional session map: GPS pins extracted from photo EXIF, linked back to the source photo (this variant stores GPS metadata in Snowflake Postgres — see [V2 Location Storage](#v2-location-storage))
- Shared-photo-library reset flow, safe against partial failures (retry token, snapshot-scoped cleanup)

## Quick Start

```sh
git clone https://github.com/kameshsampath/smart-crowd-counter.git
cd smart-crowd-counter
npm ci
SNOWFLAKE_CONNECTION_NAME=YOUR_CONNECTION SNOWFLAKE_DATABASE=CROWD_COUNTER_DB SNOWFLAKE_SCHEMA=CONFERENCES npm run dev
```

Use the URL printed by Next.js. Local credentials come from your named Snowflake connection; deployed queries use the app's service identity instead.

### Data setup

```sh
snow sql --connection YOUR_CONNECTION --filename scripts/setup.sql
```

This creates `CROWD_COUNTER_DB.CONFERENCES` objects (stage, directory table, analysis view) if missing, and never touches existing ones. Data storage is intentionally separate from wherever the app itself is deployed.

### Verify and deploy

```sh
npm test
npm run build
snow app validate --connection YOUR_CONNECTION
snow app deploy --connection YOUR_CONNECTION
```

Review [`app.yml`](app.yml) before deploying — it ships with example/placeholder values (database, warehouse, and for the Postgres variant, `PGHOST`) that must match your own Snowflake account's resources.

Smoke-check after deploy: the homepage, `/api/file-count`, and a static asset should all return HTTP 200. Then upload and analyze a real conference photo.

## API Routes

| Route | Purpose |
|---|---|
| `POST /api/upload` | Validated multipart upload to the stage |
| `GET /api/images` | Runs crowd/hands-up analysis (long-running) |
| `GET /api/file-count` | Directory count, no AI calls |
| `GET /api/stage-image?path=` | Decrypted, same-origin image proxy |
| `POST /api/reset` | Clears the shared photo library (requires confirmation) |
| `GET /api/locations` | GPS-only refresh, no Cortex calls |
| `GET /api/tiles?z=&x=&y=` | Same-origin OpenStreetMap tile proxy |

## V2 Location Storage

This variant keeps GPS metadata in a dedicated Snowflake Postgres instance (`crowd_counter.session_locations`), keyed by fully-qualified stage + generated photo path, while photos and analysis stay entirely in Snowflake — Postgres never stores AI results. Malformed or missing GPS degrades gracefully; a failed metadata write never rolls back a successful photo upload.

Networking for this variant uses two dedicated external access integrations — one scoped to the Postgres instance's hostname on port 5432, one scoped to `tile.openstreetmap.org:443` for the session map. TLS certificate and hostname verification is enforced on the Postgres connection; configure your own instance's ingress and egress ranges rather than reusing another deployment's.

For local Postgres access:

```sh
psql "service=smart_crowd_counter_pg connect_timeout=10" -X -v ON_ERROR_STOP=1 -f scripts/setup-locations.sql
python scripts/run-local.py --skill-dir <your-snowflake-postgres-skill-dir>
```

`run-local.py` reads your saved Postgres service profile and injects credentials/CA into the child process without writing a credential file to disk.

## Costs and Limits

- Each photo analysis costs Cortex credits (two Claude 4 Sonnet calls) and can take tens of seconds — there's no persistent results cache.
- This is a shared demo: all app users see the same photo library, and a confirmed reset deletes it for everyone. Restrict access before use.
- Counts are AI estimates, not attendance records — totals across photos aren't unique attendees, and hands-up percentage isn't a general engagement metric.
- Compute and storage for the dedicated Postgres instance (v2) are billable; suspend it when idle to stop compute charges (storage charges continue).

## Related

- [smart-crowd-counter-demo](https://github.com/kameshsampath/smart-crowd-counter-demo) — the prompt-driven parent repo this app is generated from
- [Snowflake App Runtime](https://docs.snowflake.com/en/developer-guide/snowflake-apps/about-snowflake-apps)
- [Snowflake Cortex AI](https://docs.snowflake.com/en/guides-overview-ai-features)
- [Cortex Code](https://docs.snowflake.com/en/user-guide/cortex-code/cortex-code)

## License

[Apache License 2.0](LICENSE)
