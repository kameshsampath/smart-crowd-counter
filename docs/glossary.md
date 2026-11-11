# Glossary

| Term | Meaning |
|---|---|
| ADK | [Google Agent Development Kit](https://google.github.io/adk-docs/) — the framework the analysis agent is built on. |
| Agent | The FastAPI service (`agent/`) exposing `POST /analyze` and `GET /health`; the only component that talks to the LLM. |
| AIStor | [MinIO AIStor](https://min.io/product/aistor) — the object storage used here (free single-node license). Any S3-compatible store works. |
| Analysis cache | The `analysis` bucket: one JSON per photo (`<photo>.json`) so analyzed photos are never re-sent to the model. |
| Bucket | An S3 container for objects. This app uses `snaps` (photos) and `analysis` (results). |
| EXIF / GPS | Image metadata standard; the GPS fields become the session-map pins, stored as S3 object metadata at upload. |
| Gateway | The OpenShell control plane that sandboxes launch against; it holds the real credentials and re-signs requests. |
| Golden tar | A pre-built WSL2 distro image imported with `wsl --import`, so every machine gets the same governed environment. |
| Governed mode | The optional OpenShell path (`scripts/dev-governed.sh`) where the agent runs sandboxed with placeholder credentials. |
| host.openshell.internal | The hostname sandboxed workloads use to reach host services (Ollama `:11434`, AIStor `:9000`); loopback is never authorized. |
| Landlock | Linux syscall-based filesystem sandbox used inside the OpenShell sandbox (ABI ≥ 3 required). |
| LiteLLM | The library the ADK agent uses to call Ollama as `ollama_chat/<AGENT_MODEL>`. |
| Object metadata | Key/value data stored with an S3 object (here: `latitude`, `longitude`, and the stamped analysis fields). |
| Ollama | Local inference runtime ([ollama.com](https://ollama.com/)) running the vision model on your GPU/CPU. |
| OCSF | Open Cybersecurity Schema Framework — the format of the deny-evidence log lines the gateway emits. |
| OpenShell | [NVIDIA OpenShell](https://github.com/NVIDIA/OpenShell) — the sandbox runtime behind governed mode: policy-as-code, default-deny egress. |
| Policy-as-code | The OpenShell sandbox policy YAML (`openshell/policy/`) declaring filesystem, process, and network rules. |
| Provider profile | An OpenShell declaration of an external service (here: Ollama inference, AIStor data) the sandbox may reach. |
| Retry token | HMAC-signed snapshot returned by a partial `POST /api/reset`, so a failed cleanup can be retried safely. |
| Rootless Podman | The container runtime OpenShell uses to enforce the sandbox boundary without root. |
| S3 API | The Amazon S3 REST API — the only storage interface the app uses, which is why MinIO and AIStor are interchangeable. |
| Sandbox | The isolated environment (non-root uid, Landlock allowlist, default-deny network) the agent runs in during governed mode. |
| SigV4 | AWS request signing; the gateway signs S3 requests gateway-side so the workload never sees the secret key. |
| Vision model | The multimodal LLM (`qwen2.5vl:7b` by default) that counts attendees and raised hands in a photo. |
| WSL2 | Windows Subsystem for Linux 2 — runs the OpenShell boundary on Windows while the host runs Ollama/AIStor/Next.js natively. |
