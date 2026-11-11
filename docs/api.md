# API Reference

## Web app (Next.js, http://localhost:3000)

| Route | Purpose |
|---|---|
| `POST /api/upload` | Validated multipart upload to the `snaps` bucket (GPS stored as object metadata). Form field `files`, 1–4 files. Returns the uploaded paths plus a `locationWarning` when photos have no GPS. |
| `GET /api/images` | Lists photos and runs crowd and hands-up analysis via the ADK agent (long-running, cached). Response: `{ photos: Photo[], prompt, analysisWarning }`. |
| `GET /api/file-count` | Photo count, no model calls. |
| `GET /api/stage-image?path=` | Same-origin image proxy from object storage. |
| `POST /api/reset` | Clears the shared photo library. Body `{ "confirm": "CLEAR ALL PHOTOS", "retryToken?": "..." }`; returns `{ cleared: true, photosCleared: true }`, or `{ cleared: false, retryToken, warning }` on partial failure. |
| `GET /api/locations` | GPS-only refresh, no model calls. |
| `GET /api/tiles?z=&x=&y=` | Same-origin OpenStreetMap tile proxy. |

### Photo shape

```json
{
  "path": "session-1-<uuid>.jpg",
  "size": 123456,
  "modified": "2026-11-11T15:00:00.000Z",
  "attendees": 42,
  "hands": 7,
  "percentage": 16.7,
  "caption": "A crowded keynote hall during the opening talk.",
  "latitude": 37.422,
  "longitude": -122.084
}
```

`attendees`, `hands`, `percentage`, and `caption` are `null` until the photo
has been analyzed. `latitude`/`longitude` are `null` when the photo has no
EXIF GPS.

## Agent (FastAPI, http://localhost:8000)

| Route | Purpose |
|---|---|
| `GET /health` | Returns `{ "status": "ok", "model": ..., "ollama": ... }`. |
| `POST /analyze` | Accepts `{ "path": "photo.jpg" }` (optionally `"image_base64"`). Returns `{ "total_attendees", "raised_hands", "percentage_with_hands_up", "caption" }`. |

The web app calls `POST /analyze` only for photos without a cached result in
the `analysis` bucket.
