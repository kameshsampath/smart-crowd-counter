# Smart Crowd Counter — Google ADK Agent

FastAPI service wrapping a Google ADK `LlmAgent` backed by a local Ollama vision model via LiteLLM (`ollama_chat/<AGENT_MODEL>`).

## Run Locally (with `uv`)

```powershell
cd agent
uv sync

# Default model: qwen2.5vl:7b (use qwen2.5vl:3b on RAM-constrained machines)
$env:AGENT_MODEL = "qwen2.5vl:7b"
$env:OLLAMA_BASE_URL = "http://localhost:11434"

uv run smart-crowd-counter-agent
```

## Endpoints

- `GET /health` — Returns `{ "status": "ok", "model": ..., "ollama": ... }`
- `POST /analyze` — Accepts `{ "path": "photo.jpg", "image_base64": "..." }` and returns `{ "total_attendees", "raised_hands", "percentage_with_hands_up", "caption" }`
