# Smart Crowd Counter

A local, self-contained AI app: Next.js frontend/API, MinIO AIStor (Free tier, single-node) object storage, a Google ADK Python agent, and Ollama for local inference. No cloud account required; any S3-compatible store works via the same S3 API.

## Commands

| Command | Description |
|---------|-------------|
| `npm ci` | Install dependencies |
| `npm run dev` | Run Next.js dev server |
| `npm test` | Run vitest tests |
| `npm run build` | Production build |
| `docker compose up --build -d` | Full stack: web, agent, AIStor, Ollama (requires `./minio.license`) |
| `docker compose exec ollama ollama pull qwen2.5vl:7b` | Pull the default vision model |
| `.\scripts\dev.ps1` / `./scripts/dev.sh` | Run full stack locally without Docker (Windows PowerShell / WSL2 & POSIX) |
| `uv sync --project docs` | Install the docs toolchain (uv project in `docs/`, MkDocs Material) |
| `uv run --project docs mkdocs serve` / `mkdocs build` | Preview / build the docs site (`mkdocs.yaml`, pages in `docs/`) |

## Project Structure

- `app/` — Next.js App Router pages and API routes
- `lib/` — server modules: `storage.ts` (MinIO S3 client), `analysis.ts` (agent HTTP client), `crowd.ts` (types, validation, prompt pattern), `reset-token.ts` (HMAC retry tokens)
- `agent/` — Google ADK agent (`src/smart_crowd_counter/`), FastAPI service exposing `POST /analyze` and `GET /health`
- `docker/mc.Dockerfile` — builds the `mc` client image used by the `aistor-init` compose job
- `scripts/` — `dev.ps1` (Windows PowerShell) and `dev.sh` (WSL2/Linux/macOS) one-command local stack launchers
- `components/` — React UI components
- `__tests__/` — vitest suites for API routes and lib modules
- `docs/` — MkDocs documentation site (config in `mkdocs.yaml` at the repo root); also holds the OpenShell design notes and walkthrough

## Conventions

- Configuration comes from plain environment variables (see `.env.example`); the app never reads credential files.
- Photos live in the `snaps` bucket; analysis results are cached as JSON in the `analysis` bucket keyed by photo path.
- GPS is stored as MinIO object metadata at upload time — no sidecar database.
- The ADK agent talks to Ollama via LiteLLM (`ollama_chat/<model>`); the model is set by `AGENT_MODEL`.
- Storage code must only use the S3 API so community MinIO and AIStor are interchangeable.
- In docker compose, `aistor-init` provisions the `snaps`/`analysis` buckets and a scoped service user; the web app authenticates with `S3_APP_USER`/`S3_APP_SECRET`, never the root credentials.

## Notes

- `next.config.mjs` pins `turbopack.root` and `outputFileTracingRoot` to the app directory; do not remove these pins when changing config.
- Local vision models are rough at crowd counting; keep the "estimates, not attendance records" framing in user-facing copy.
