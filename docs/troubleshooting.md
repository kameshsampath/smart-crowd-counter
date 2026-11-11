# Troubleshooting

## Missing GPS pins

Map pins come from EXIF GPS. Converting HEIC to JPG often drops the location;
many converters strip EXIF, and iPhone Share > Options > Location: off removes
it on purpose. Check a file directly:

```sh
node scripts/check-gps.mjs path/to/photo.jpg
```

If `gps` is `null`, re-export the photo with location included. Uploads also
return a warning ("N of M photos had no GPS location..."), so missing pins are
never silent.

## "Some photos could not be analyzed"

`GET /api/images` returns this warning when the agent call fails — the local
inference server may be busy or offline.

!!! tip "Check the agent and Ollama"
    ```sh
    curl -s http://localhost:8000/health   # agent
    ollama ps                              # local inference
    ```

    Then retry shortly. Results are cached, so retries are free once a call
    succeeds.

## First analysis is slow

Inference is local and free, but slow. Model choice and GPU availability
dominate latency. Use `AGENT_MODEL=qwen2.5vl:3b` (~3.5 GB) on low-RAM
machines instead of `qwen2.5vl:7b` (~5 GB), tune `OLLAMA_NUM_CTX`, or lower
`MAX_INFERENCE_DIMENSION` to shrink the image sent to the model. See
[Environment Setup](setup.md#ollama-model).

## Docker needs 16 GB RAM

Give Docker 16 GB of RAM; on Windows set the VM memory in
`%USERPROFILE%\.wslconfig` and run `wsl --shutdown` — see
[Run with Docker](docker.md). To save RAM, run Ollama on the host and set
`COMPOSE_OLLAMA_URL=http://host.docker.internal:11434` in `.env`.

## Missing license

`scripts/dev.sh` exits with "Missing minio.license" — download the free
single-node license from the [MinIO pricing page](https://min.io/pricing) and
save it as `minio.license` in the repo root. Alternatively point `S3_ENDPOINT`
at community MinIO or any S3-compatible store; the app only uses the S3 API.

## Port conflicts

The stack binds 3000 (web), 8000 (agent), 9000/9001 (AIStor), and 11434
(Ollama).

!!! tip "Docs preview port"
    The docs preview defaults to port 8000 too — when the app is running, use:

    ```sh
    uv run --project docs mkdocs serve -a 127.0.0.1:8080
    ```

## Reset failed partway

`POST /api/reset` can return `{ cleared: false, retryToken, warning }` when a
photo could not be deleted. Retry the same request with the `retryToken`
before starting a new reset.

## Counts look wrong

!!! warning "Estimates, not records"
    Counts are AI estimates, not attendance records. Totals across photos are
    not unique attendees, and the hands-up percentage is not a general
    engagement metric. Open vision models count crowds less accurately than
    frontier hosted models — treat estimates as rough.

## Costs and limits

- Inference is local and free, but slow.
- This is a shared demo. All app users see the same photo library, and a
  confirmed reset deletes it for everyone. Restrict access before use.
