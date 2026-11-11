# Quickstart

The launcher scripts run the full stack locally without Docker. They suit
machines with less RAM than Docker needs, because no VM runs.

## Prerequisites

- A free single-node AIStor license saved as `minio.license` in the repo root. Get it from the [MinIO pricing page](https://min.io/pricing) (free tier).
- [Ollama](https://ollama.com/) installed and running, with one vision model pulled (commands below).
- [uv](https://docs.astral.sh/uv/) and Node.js 24 LTS (v24.14.1, pinned in `.nvmrc`; `package.json` enforces `>=24.14.1`).

=== "Bash"

    ```sh
    ollama ps                               # is the service up? (start it with `ollama serve` if not)
    ollama pull qwen2.5vl:7b                # ~5 GB. Use qwen2.5vl:3b on low-RAM machines (~3.5 GB)
    curl -s http://localhost:11434/api/tags # lists the pulled models
    ```

=== "PowerShell"

    ```powershell
    ollama ps                               # is the service up? (start it with `ollama serve` if not)
    ollama pull qwen2.5vl:7b                # ~5 GB. Use qwen2.5vl:3b on low-RAM machines (~3.5 GB)
    curl.exe -s http://localhost:11434/api/tags   # in PS, `curl` aliases Invoke-WebRequest; use curl.exe
    ```

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

Open <http://localhost:3000> and upload a photo.

!!! tip "Sandboxed agent (optional)"
    To run the agent inside an NVIDIA OpenShell sandbox instead
    (policy-as-code, placeholder credentials, deny evidence), use the
    additive governed path:

    ```sh
    AGENT_MODEL=qwen2.5vl:3b scripts/dev-governed.sh
    ```

    See [Governed mode](architecture.md#governed-mode-openshell) and the
    [demo walkthrough](governed-agent.md).

## Verify

Build and unit-test commands (`npm test`, `npm run build`, …) are listed in the
README under "Develop locally". Smoke-check the running stack — each of these
should print HTTP 200 or JSON:

=== "Bash"

    ```sh
    curl -s -o /dev/null -w "web    %{http_code}\n" http://localhost:3000
    curl -s http://localhost:3000/api/file-count                          # photo count JSON
    curl -s http://localhost:8000/health                                  # agent: {"status":"ok",...}
    curl -s -o /dev/null -w "aistor %{http_code}\n" http://localhost:9000/minio/health/live
    curl -s http://localhost:11434/api/tags                               # ollama: model list
    ```

=== "PowerShell"

    ```powershell
    curl.exe -s -o $null -w "web    %{http_code}`n" http://localhost:3000
    curl.exe -s http://localhost:3000/api/file-count
    curl.exe -s http://localhost:8000/health
    curl.exe -s -o $null -w "aistor %{http_code}`n" http://localhost:9000/minio/health/live
    curl.exe -s http://localhost:11434/api/tags
    ```

!!! note "curl on Windows"
    In PowerShell, `curl` is an alias for `Invoke-WebRequest` — use `curl.exe`
    (ships with Windows 10/11) for the real curl.

Then upload and analyze a real conference photo.

!!! tip "First analysis is slow"
    The first analysis of a photo can take tens of seconds on local hardware —
    inference is local. Results are cached, so repeat views are free.

| Service | URL |
|---|---|
| Web app | <http://localhost:3000> |
| Agent health | <http://localhost:8000/health> |
| AIStor console | <http://localhost:9001> (`minioadmin` / `minioadmin`) |
