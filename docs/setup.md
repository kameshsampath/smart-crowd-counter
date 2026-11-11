# Environment Setup

## Tools

| Tool | Version | Purpose |
|---|---|---|
| Node.js | >= 24.14.1 (pinned in `.nvmrc`) | Next.js web app; `package.json` enforces the minimum in `engines` |
| [uv](https://docs.astral.sh/uv/) | latest | Python package manager for the ADK agent (`agent/`, Python 3.12) |
| [Ollama](https://ollama.com/) | latest | Local inference runtime for the vision model |
| MinIO AIStor license | free single-node tier | Saved as `minio.license` in the repo root ([pricing page](https://min.io/pricing)) |
| MinIO client `mc` | latest | Bucket and user provisioning; the launcher scripts download it into `.bin/` automatically |
| Docker Desktop | optional | Only for the [compose path](docker.md); needs 16 GB RAM for the VM |

## Ollama model

```sh
ollama pull qwen2.5vl:7b   # default (AGENT_MODEL), ~5 GB
ollama pull qwen2.5vl:3b   # low-RAM fallback, ~3.5 GB
```

!!! note "Where the GPU matters"
    AIStor does not use a GPU. Object storage is CPU and I/O bound, so a GPU
    machine gains nothing there. The GPU matters for Ollama. When Ollama runs
    on the host (the launcher scripts), its native Windows, Linux, and macOS
    builds use an NVIDIA GPU (CUDA) or Apple Metal automatically; run
    `ollama ps` to see the GPU share. In Docker, enable GPU access in Docker
    Desktop (WSL2 backend) and uncomment the `deploy.resources.reservations`
    block on the `ollama` service in `docker-compose.yml`.

## Configuration

!!! note "Environment variables only"
    Configuration comes from plain environment variables; the app never reads
    credential files. On first run the launcher scripts copy `.env.example`
    to `.env` — edit `.env` to change anything.

| Variable | Default | Purpose |
|---|---|---|
| `S3_ENDPOINT` | `localhost:9000` | AIStor / S3-compatible endpoint (host:port) |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | `minioadmin` / `minioadmin` | Root credentials: AIStor console login and bootstrap only |
| `S3_APP_USER` / `S3_APP_SECRET` | `crowd-counter` / `crowd-counter-dev-secret` | Scoped service user used by the web app and the agent |
| `S3_USE_TLS` | `false` | Set `true` for TLS-enabled stores |
| `S3_PHOTOS_BUCKET` | `snaps` | Photo bucket |
| `S3_RESULTS_BUCKET` | `analysis` | Analysis cache bucket (one JSON per photo) |
| `AGENT_URL` | `http://localhost:8000` | Agent service URL used by the web app |
| `AGENT_MODEL` | `qwen2.5vl:7b` | Ollama vision model, called as `ollama_chat/<AGENT_MODEL>` via LiteLLM |
| `AGENT_TIMEOUT_MS` | `300000` | Web app timeout for agent calls |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama endpoint used by the agent |
| `OLLAMA_NUM_CTX` | `8192` | Ollama context window |
| `MAX_INFERENCE_DIMENSION` | `1280` | Max image edge (px) sent to the vision model |
| `COMPOSE_OLLAMA_URL` | unset | Docker Compose only: use Ollama on the host, e.g. `http://host.docker.internal:11434` |
| `RESET_SECRET` | `local-dev-reset-secret` | HMAC secret for library reset retry tokens |

## Manual local setup

If you prefer to start each service yourself instead of using the launchers:

```sh
# 1. AIStor — S3 API on :9000, console on :9001
MINIO_ROOT_USER=minioadmin MINIO_ROOT_PASSWORD=minioadmin \
  minio server .minio-data --license minio.license --console-address ":9001"

# 2. Buckets + scoped service user via mc — create the crowd-counter policy
#    and user exactly as scripts/dev.sh does
mc alias set local http://localhost:9000 minioadmin minioadmin
mc mb --ignore-existing local/snaps local/analysis

# 3. ADK agent on :8000 (OLLAMA_BASE_URL / AGENT_MODEL also in .env)
cd agent && uv sync
uv run smart-crowd-counter-agent

# 4. Web app on :3000 (S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY / AGENT_URL in .env)
npm ci && npm run dev
```

!!! tip "No AIStor license?"
    Point `S3_ENDPOINT` at any S3-compatible store, for example community
    MinIO. The app only uses the S3 API.
