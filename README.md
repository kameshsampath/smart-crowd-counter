# Smart Crowd Counter

Generated from `../PROMPT-v1.md` and extended with `../PROMPT-v2-postgres-map.md` in a disposable subfolder. The parent repository stays prompt-driven; do not commit this generated app.

## Run Locally

```sh
npm ci
SNOWFLAKE_CONNECTION_NAME=devrel-ent SNOWFLAKE_DATABASE=CROWD_COUNTER_DB SNOWFLAKE_SCHEMA=CONFERENCES npm run dev
```

Use the URL printed by Next.js. Local credentials stay in the Snowflake connection configuration. Deployed queries use the Snowflake service identity.

For v2, use `scripts/run-local.py --skill-dir <absolute Snowflake Postgres skill directory>` after building. It reads the saved `smart_crowd_counter_runtime` service profile and injects credentials and its CA certificate into the child process without writing a credential file in this repo. PostgreSQL administration uses `psql "service=smart_crowd_counter_pg connect_timeout=10" -X -v ON_ERROR_STOP=1 -f scripts/setup-locations.sql`. The runtime profile must include `sslrootcert`; never disable TLS certificate checks to work around DNS or network failures.

## Data And Limits

Run `snow sql --connection devrel-ent --filename scripts/setup.sql` to create the data objects. The script preserves existing objects. The data lives in `CROWD_COUNTER_DB.CONFERENCES`, separate from deployment storage.

Photos are shared by all app users. Confirmed reset permanently deletes the shared stage contents. Restrict app access to intended demo users. Uploads accept four JPG/JPEG/PNG images, each at most 3,750,000 bytes and 8000 pixels per dimension. File contents, dimensions and decoding are checked server-side.

The view uses two Claude 4 Sonnet calls per photo: JSON estimates and a caption. It safely parses JSON, retries enclosing Markdown fences, validates counts, and calculates percentages with null for unknown counts or zero denominators. Totals across photos are not unique attendees.

Analysis incurs Cortex charges. New page loads, uploads and explicit re-analysis can rerun it; window focus and reconnect do not. There is no persistent results cache in v1.

## API

- `POST /api/upload`: validated multipart files transferred using callback-based PUT.
- `GET /api/images`: long-running analysis query.
- `GET /api/file-count`: directory count without AI calls.
- `GET /api/stage-image?path=`: decrypted same-origin GET proxy.
- `POST /api/reset`: requires mutation header and explicit confirmation.
- `GET /api/locations`: GPS-only refresh without Cortex calls.
- `GET /api/tiles?z=&x=&y=`: constrained same-origin OpenStreetMap tile proxy.

## V2 Location Storage

`SMART_CROWD_COUNTER_PG` is a dedicated STANDARD_M, 10 GB, Postgres 18 instance with HA off. `crowd_counter.session_locations` stores only GPS plus operational photo keys/timestamps, keyed by fully qualified stage and exact generated PUT filename. The `crowd_counter_runtime` role has only schema usage and table SELECT/INSERT/UPDATE/DELETE, with a stage-scoped row policy. Existing photos are not backfilled. Postgres never stores AI results or joins the Cortex query.

Malformed/missing GPS is nonfatal. Successful PUTs are retained if metadata writes fail; the UI reports that separately. Location lookups preserve every analysis row on failure. Refreshing locations and interacting with the map never runs AI. Colocated markers have a selectable popup list and a keyboard-accessible list below the map.

Confirmed reset removes a signed snapshot of generated photo paths and clears metadata up to its cutoff for this stage only. Partial failures return a retry token; Retry cleanup uses the original snapshot, not newer photos. The token is held by the current page, so finish retries before navigating away. The manifest pins one replica and a process mutex serializes upload/reset. Do not scale this implementation to multiple replicas or mutate the stage externally during cleanup without adding distributed coordination. Secret rotation invalidates old reset tokens. Unsupported manually staged paths require administrator cleanup.

## Connectivity And Costs

The manifest mounts `SMART_CROWD_COUNTER_PG_SECRET` and `SMART_CROWD_COUNTER_PG_CA` from `CROWD_COUNTER_DB.CONFERENCES`. Postgres TLS verifies certificates and hostname. The dedicated `SMART_CROWD_COUNTER_PG_EAI` permits only its hostname on 5432. `SMART_CROWD_COUNTER_TILES_EAI` separately permits only `tile.openstreetmap.org:443`. Following explicit approval, this app uses OSM's current canonical hostname rather than the older parent-repository subdomain guidance. The proxy sends stable identification and an app-origin Referer, forwards no cookies/authorization/photo payloads, honors cache headers, and never caches errors. Visible attribution is retained; no prefetch or offline-download feature is provided.

Postgres ingress permits administrative `64.124.17.42/32` and Snowflake regional egress ranges `153.45.58.0/24`, `153.45.68.0/24`. The latter are shared regional infrastructure, not app-exclusive. Their reported expiry is December 20, 2026; recheck `SYSTEM$GET_SNOWFLAKE_EGRESS_IP_RANGES()` and approve scoped policy updates before expiry. Do not widen to `0.0.0.0/0`. EAI egress does not replace Postgres ingress.

Compute and storage are billable. With explicit approval, suspend the dedicated Postgres instance when not in use to stop compute charges; storage charges continue. Suspending it leaves photo analysis usable but locations unavailable. Resume it before expecting GPS writes. Do not automatically drop the instance, policies, secrets, staged photos or shared data during teardown.

## Verify And Deploy

```sh
npm test
npm run build
snow app validate --connection devrel-ent
snow app deploy --connection devrel-ent
```

The manifest deploys `SNOWFLAKE_APPS.PUBLIC.SMART_CROWD_COUNTER` using `KAMESH_DEMOS_S`. Its runtime environment explicitly points to the data database/schema. Deployment is declarative: omitted service settings reset to defaults.

Smoke checks: homepage, `/api/file-count`, and a static chunk must return HTTP 200. Photo upload, analysis and proxy retrieval should be checked with an approved conference photo.

The SDK's transitive `toml@3` dependency has outstanding high-severity audit findings, also attributed to `snowflake-sdk`. It processes trusted local configuration, not HTTP requests or uploaded photos. Review upstream fixes before production use; do not force an incompatible SDK downgrade.