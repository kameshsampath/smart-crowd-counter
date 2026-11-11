# Running the Demo

## Upload and analyze

Open <http://localhost:3000> and upload JPG, JPEG, or PNG photos — up to 4 at a
time, 3.75 MB and 8000 x 8000 px each. Oversized photos are rejected in the
browser before upload.

!!! tip "First analysis is slow"
    The first analysis of a photo can take tens of seconds on local hardware;
    afterwards results come from the cache and repeat views are free.

The dashboard shows per-photo attendee and raised-hand estimates and captions,
a hands-up donut chart, and light and dark themes. The session map plots GPS
pins from EXIF and links each pin back to its source photo.

## GPS and the session map

Map pins come from EXIF GPS in the photo.

!!! warning "Location can be stripped"
    Converting HEIC to JPG often drops the location. Many converters strip
    EXIF, and iPhone Share > Options > Location: off removes it on purpose.

Check a file directly:

```sh
node scripts/check-gps.mjs path/to/photo.jpg
```

If `gps` is `null`, re-export the photo with location included.

!!! note "Missing pins are never silent"
    Uploads return a warning ("N of M photos had no GPS location...") whenever
    a photo has no GPS.

## Resetting the library

!!! warning "Shared demo library"
    All app users see the same photo library, and a confirmed reset
    (`CLEAR ALL PHOTOS`) deletes it for everyone. Restrict access before use.

A retry token protects cleanup against partial failures — if a reset fails
partway, retry with the returned `retryToken` before starting a new one.

## Verify

```sh
npm test
npm run build
```

After `docker compose up` or `scripts/dev.*`, check that the homepage,
`/api/file-count`, and a static asset return HTTP 200. Then upload and analyze
a real conference photo.

## Extending it

The same loop — photos into object storage, governed agent analyzes — powers
field-inspection, claims, and smart-city use cases. See
[What's Next](whats-next.md) for the use-case list and roadmap ideas.
