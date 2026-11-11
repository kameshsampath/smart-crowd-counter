# Smart Crowd Counter

Upload conference session photos and get estimates of attendee count, raised
hands, and a caption for each photo. Everything runs on your own machine: a
Google ADK agent calls a local Ollama vision model, and photos are stored in
MinIO AIStor (any S3-compatible store works through the same S3 API). An
optional map shows where each photo was taken, using EXIF GPS.

> Counts are AI estimates, not attendance records. Totals across photos are
> not unique attendees, and the hands-up percentage is not a general
> engagement metric. Local vision models are rough at crowd counting.

## Features

- Upload JPG, JPEG, or PNG photos, up to 4 at a time, 3.75 MB and 8000 x 8000 px each. Oversized photos are rejected in the browser before upload.
- Per-photo attendee and raised-hand estimates and a caption, from one vision-model call per photo. Results are cached, so repeat views are free.
- Dashboard with a hands-up donut chart and light and dark themes.
- Session map with GPS pins from EXIF, linked back to the source photo.
- Shared photo library with a confirmed reset flow. A retry token protects cleanup against partial failures.

## Documentation map

| Topic | Page |
|---|---|
| Fastest path to a running app | [Quickstart](quickstart.md) |
| Tools, prerequisites, and every environment variable | [Environment Setup](setup.md) |
| Full stack in Docker | [Run with Docker](docker.md) |
| Components, data flow, governed mode | [Architecture](architecture.md) |
| Upload photos, dashboard, map, verification | [Running the Demo](demo.md) |
| HTTP API of the web app and the agent | [API Reference](api.md) |
| Buckets, object metadata, analysis cache | [Storage and Data Model](storage.md) |
| Sandboxing the agent with NVIDIA OpenShell | [Governed Agent](openshell.md) |
| Common problems, costs and limits | [Troubleshooting](troubleshooting.md) |

## Services at a glance

| Service | URL |
|---|---|
| Web app | http://localhost:3000 |
| Agent health | http://localhost:8000/health |
| AIStor console | http://localhost:9001 (`minioadmin` / `minioadmin`) |

## References

- [Google ADK documentation](https://google.github.io/adk-docs/) — the agent framework
- [Ollama](https://ollama.com/) — local model runtime
- [MinIO AIStor](https://min.io/product/aistor) — object storage (free single-node license at the [pricing page](https://min.io/pricing))
- [MinIO client (mc)](https://min.io/docs/minio/linux/reference/minio-mc.html) — CLI used to provision buckets and users
- [uv](https://docs.astral.sh/uv/) — Python package and project manager for the agent and these docs
- [Next.js](https://nextjs.org/docs) — web framework
- [exifr](https://github.com/MikeKovarik/exifr) — EXIF and GPS parsing
- [sharp](https://sharp.pixelplumbing.com/) — image validation
- [Leaflet](https://leafletjs.com/) and [OpenStreetMap](https://www.openstreetmap.org/) — session map and tiles
- [smart-crowd-counter-demo](https://github.com/kameshsampath/smart-crowd-counter-demo) — the prompt-driven parent repo
- [NVIDIA OpenShell](https://github.com/NVIDIA/OpenShell) and its [docs](https://docs.nvidia.com/openshell/latest/) — the sandbox runtime used in governed mode
- [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0) — license text
