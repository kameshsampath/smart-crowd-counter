# Smart Crowd Counter

Upload a photo of a crowd — get back an estimate of attendees, raised hands,
and a one-line caption, computed entirely on your own machine by a local
vision model. No cloud account, nothing leaves your disk: a
[Google ADK](https://google.github.io/adk-docs/) agent calls
[Ollama](https://ollama.com/), photos live in
[MinIO AIStor](https://min.io/product/aistor), and a map plots the
[EXIF](https://www.exif.org/) GPS of each shot.

!!! warning "Estimates, not records"
    Counts are AI estimates, not attendance records. Totals across photos are
    not unique attendees, and the hands-up percentage is not a general
    engagement metric. Local vision models are rough at crowd counting.

## Features

- Upload JPG, JPEG, or PNG photos, up to 4 at a time, 3.75 MB and 8000 x 8000 px each. Oversized photos are rejected in the browser before upload.
- Per-photo attendee and raised-hand estimates and a caption, from one vision-model call per photo. Results are cached, so repeat views are free.
- Dashboard with a hands-up donut chart and light and dark themes.
- Session map with GPS pins from EXIF, linked back to the source photo.
- Shared photo library with a confirmed reset flow. A retry token protects cleanup against partial failures.

## Tech stack

| Layer | Technology |
|---|---|
| Web app | [Next.js](https://nextjs.org/docs) 16 + [React](https://react.dev/) 19, TypeScript, Tailwind CSS 4 |
| Images | [sharp](https://sharp.pixelplumbing.com/) (validation), [exifr](https://github.com/MikeKovarik/exifr) (EXIF GPS) |
| Storage | [MinIO AIStor](https://min.io/product/aistor) over the S3 API (`minio` JS SDK) |
| Map | [Leaflet](https://leafletjs.com/) + [OpenStreetMap](https://www.openstreetmap.org/) tiles |
| Agent | [Google ADK](https://google.github.io/adk-docs/) on Python 3.12, [FastAPI](https://fastapi.tiangolo.com/), via [LiteLLM](https://docs.litellm.ai/) |
| Inference | [Ollama](https://ollama.com/) running `qwen2.5vl` (7b default, 3b on low-RAM machines) |
| Governed mode | [NVIDIA OpenShell](https://github.com/NVIDIA/OpenShell) sandbox |
| Tooling | Node.js 24, [uv](https://docs.astral.sh/uv/), Docker Compose |

## Table of Contents

| Topic | Page |
|---|---|
| Fastest path to a running app | [Quickstart](quickstart.md) |
| Tools, prerequisites, and every environment variable | [Environment Setup](setup.md) |
| Components, data flow, governed mode | [Architecture](architecture.md) |
| Upload photos, dashboard, map, verification | [Running the Demo](demo.md) |
| Buckets, object metadata, analysis cache | [Storage and Data Model](storage.md) |
| HTTP API of the web app and the agent | [API Reference](api.md) |
| Sandboxing the agent with NVIDIA OpenShell | [Governed Agent](openshell.md) |
| Use cases and roadmap ideas | [What's Next](whats-next.md) |
| Common problems, costs and limits | [Troubleshooting](troubleshooting.md) |
| Full stack in Docker | [Run with Docker](docker.md) |
| Terms used across the docs | [Glossary](glossary.md) |
| All external links and project references | [References](references.md) |

## Services at a glance

| Service | URL |
|---|---|
| Web app | <http://localhost:3000> |
| Agent health | <http://localhost:8000/health> |
| AIStor console | <http://localhost:9001> (`minioadmin` / `minioadmin`) |
