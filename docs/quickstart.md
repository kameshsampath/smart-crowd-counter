# Quickstart

The launcher scripts run the full stack locally without Docker. They suit
machines with less RAM than Docker needs, because no VM runs.

## Prerequisites

- A free single-node AIStor license saved as `minio.license` in the repo root. Get it from the [MinIO pricing page](https://min.io/pricing) (free tier).
- [Ollama](https://ollama.com/) installed, with one vision model pulled:

  ```sh
  ollama pull qwen2.5vl:7b   # ~5 GB. Use qwen2.5vl:3b on low-RAM machines (~3.5 GB)
  ```

- [uv](https://docs.astral.sh/uv/) and Node.js 24 LTS (v24.14.1, pinned in `.nvmrc`; `package.json` enforces `>=24.14.1`).

## Run

```powershell
# Windows PowerShell (lowest RAM, no VM overhead)
.\scripts\dev.ps1
```

```bash
# WSL2, Linux, macOS
chmod +x scripts/dev.sh
./scripts/dev.sh
```

Both scripts read `.env` (created from `.env.example` on first run), download
the MinIO server and client into `.bin/`, create the `snaps` and `analysis`
buckets, create the scoped `crowd-counter` service user, and start the ADK
agent and the Next.js app.

!!! note "First run"
    On the first run the launcher copies `.env.example` to `.env` — edit
    `.env` afterwards to change any setting. See
    [Environment Setup](setup.md#configuration) for every variable.

Open http://localhost:3000 and upload a photo.

!!! tip "Sandboxed agent (optional)"
    To run the agent inside an NVIDIA OpenShell sandbox instead
    (policy-as-code, placeholder credentials, deny evidence), use the
    additive governed path: `AGENT_MODEL=qwen2.5vl:3b scripts/dev-governed.sh`.
    See [Governed mode](architecture.md#governed-mode-openshell) and the
    [demo walkthrough](governed-agent.md).

## Verify

```sh
npm test
npm run build
```

After the stack is up, check that the homepage, `/api/file-count`, and a static
asset return HTTP 200. Then upload and analyze a real conference photo.

!!! tip "First analysis is slow"
    The first analysis of a photo can take tens of seconds on local hardware —
    inference is local. Results are cached, so repeat views are free.

| Service | URL |
|---|---|
| Web app | http://localhost:3000 |
| Agent health | http://localhost:8000/health |
| AIStor console | http://localhost:9001 (`minioadmin` / `minioadmin`) |
