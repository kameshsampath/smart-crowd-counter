# Storage and Data Model

## Buckets

| Bucket | Contents |
|---|---|
| `snaps` (configurable via `S3_PHOTOS_BUCKET`) | Uploaded photos. EXIF GPS is stored as S3 object metadata at upload time — no sidecar database. |
| `analysis` (configurable via `S3_RESULTS_BUCKET`) | Cached analysis JSON per photo, keyed by photo path (`<photo>.json`). |

!!! note "GPS lives in object metadata"
    EXIF GPS is stored as S3 object metadata at upload time — there is no
    sidecar database.

## Access control

In Docker Compose, the `aistor-init` job provisions both buckets and a scoped
`crowd-counter` service user whose policy allows `s3:*` only on those two
buckets. The web app and the agent authenticate with
`S3_APP_USER`/`S3_APP_SECRET`; the root credentials
(`S3_ACCESS_KEY`/`S3_SECRET_KEY`) are used only for console login and
bootstrap.

## Inspecting stored objects

Sign in to the AIStor console at <http://localhost:9001> with the root
credentials (`minioadmin` by default). Open the `snaps` bucket, select a
photo, and use the Metadata and Tags panels. From the CLI, `mc stat
local/snaps/<photo>` prints the same:

- `latitude`, `longitude` — GPS from EXIF
- `analyzed`, `total_attendees`, `raised_hands`, `caption` — stamped after analysis

## Reset semantics

Reset removes both the photo from `snaps` and its cached `<photo>.json` from
`analysis`.

!!! note "Orphan cache entries"
    The analysis-cache removal is best-effort, so a failed delete can leave an
    orphan JSON in `analysis`. The app never shows it, because the photo list
    comes from `snaps`.
