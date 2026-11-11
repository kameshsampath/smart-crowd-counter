# Run with Docker

!!! warning "Docker needs 16 GB of RAM"
    Use Docker only if you can give Docker 16 GB of RAM. On Windows, use
    Docker Desktop with the WSL2 backend and set the VM memory in
    `%USERPROFILE%\.wslconfig`:

    ```ini
    [wsl2]
    memory=16GB
    processors=8
    autoMemoryReclaim=gradual
    ```

    Then run `wsl --shutdown` to apply. Defaults are fine on Linux and macOS.

```sh
git clone https://github.com/kameshsampath/smart-crowd-counter.git
cd smart-crowd-counter
docker compose up --build -d
docker compose exec ollama ollama pull qwen2.5vl:7b   # once, ~5 GB
```

## What the compose stack does

- `aistor` — MinIO AIStor on `:9000` (S3 API) and `:9001` (console), data in
  the `minio-data` volume, license mounted from `./minio.license`.
- `aistor-init` — waits for AIStor, creates the `snaps` and `analysis`
  buckets, and provisions the `crowd-counter` service user with a scoped
  policy. The web app uses that user, not the root credentials.
- `ollama` — Ollama on `:11434`, models in the `ollama-models` volume. For
  NVIDIA GPU passthrough, enable GPU access in Docker Desktop (WSL2 backend)
  and uncomment the `deploy.resources.reservations` block on the `ollama`
  service in `docker-compose.yml`.
- `agent` — the ADK agent on `:8000`.
- `web` — the Next.js app on `:3000`.

## Using Ollama on the host

!!! tip "Save RAM: run Ollama on the host"
    To run Ollama on the host instead of in a container, set
    `COMPOSE_OLLAMA_URL=http://host.docker.internal:11434` in `.env`. The
    agent resolves `host.docker.internal` through the `host-gateway` mapping
    (built in on Windows and macOS, declared for Linux in
    `docker-compose.yml`).

!!! note "No AIStor license?"
    Point `S3_ENDPOINT` at any S3-compatible store, for example community
    MinIO. The app only uses the S3 API.
