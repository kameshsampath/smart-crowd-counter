# Smart Crowd Counter

[![License](https://img.shields.io/badge/license-Apache--2.0-blue?logo=apache)](LICENSE)
![Node](https://img.shields.io/badge/node-%3E%3D24.14.1-339933?logo=node.js)
![Python](https://img.shields.io/badge/python-%3E%3D3.12-3776AB?logo=python)
![Next.js](https://img.shields.io/badge/Next.js-16-00000?logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
[![Docker](https://img.shields.io/badge/docker-compose-2496ED?logo=docker)](docker-compose.yml)

Upload conference session photos and get estimates of attendee count, raised
hands, and a caption for each photo. Everything runs on your own machine: a
Google ADK agent calls a local Ollama vision model, and photos are stored in
MinIO AIStor. An optional map shows where each photo was taken, using EXIF GPS.

Counts are AI estimates, not attendance records — treat them as rough.

## Quickstart

Prerequisites: a free single-node AIStor license at `./minio.license`
([pricing page](https://min.io/pricing)), [Ollama](https://ollama.com/) with
`ollama pull qwen2.5vl:7b`, [uv](https://docs.astral.sh/uv/), and Node.js 24 LTS.

```powershell
# Windows PowerShell (lowest RAM, no VM overhead)
.\scripts\dev.ps1
```

```bash
# WSL2, Linux, macOS
chmod +x scripts/dev.sh
./scripts/dev.sh
```

Open http://localhost:3000 and upload a photo. With Docker (needs 16 GB RAM for
the VM): `docker compose up --build -d`, then
`docker compose exec ollama ollama pull qwen2.5vl:7b`.

## Documentation

Full docs are built with [MkDocs Material](https://squidfunk.github.io/mkdocs-material/)
from `mkdocs.yaml` and `docs/`:

```sh
uv sync --project docs
uv run --project docs mkdocs serve -a 127.0.0.1:8080   # http://127.0.0.1:8080
```

| Topic | Page |
|---|---|
| Quickstart (launcher scripts, verify) | [docs/quickstart.md](docs/quickstart.md) |
| Tools, prerequisites, environment variables | [docs/setup.md](docs/setup.md) |
| Run with Docker | [docs/docker.md](docs/docker.md) |
| Architecture and data flow | [docs/architecture.md](docs/architecture.md) |
| Running the demo (upload, dashboard, GPS map) | [docs/demo.md](docs/demo.md) |
| HTTP API (web app + agent) | [docs/api.md](docs/api.md) |
| Buckets, object metadata, analysis cache | [docs/storage.md](docs/storage.md) |
| Governed agent with NVIDIA OpenShell | [docs/openshell.md](docs/openshell.md), [docs/governed-agent.md](docs/governed-agent.md) |
| Troubleshooting, costs and limits | [docs/troubleshooting.md](docs/troubleshooting.md) |

## Verify

```sh
npm test
npm run build
```

## License

Apache-2.0. Copyright 2026 Kamesh Sampath. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
