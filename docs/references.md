# References

All external sites and links referenced across these docs. External links open
in a new tab/window.

## Project

- [smart-crowd-counter](https://github.com/kameshsampath/smart-crowd-counter) — this repo
- [Published docs site](https://kameshsampath.github.io/smart-crowd-counter/) — this site, built by CI from `mkdocs.yaml` + `docs/`
- [smart-crowd-counter-demo](https://github.com/kameshsampath/smart-crowd-counter-demo) — the prompt-driven parent repo
- [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0) — license text

## Runtime and AI stack

- [Google ADK documentation](https://google.github.io/adk-docs/) — the agent framework
- [Ollama](https://ollama.com/) — local model runtime
- [qwen2.5vl models on Ollama](https://ollama.com/library/qwen2.5vl) — default vision model (`qwen2.5vl:7b`, low-RAM `qwen2.5vl:3b`)
- [LiteLLM](https://docs.litellm.ai/) — the ADK agent reaches Ollama as `ollama_chat/<AGENT_MODEL>`

## Storage

- [MinIO AIStor](https://min.io/product/aistor) — object storage used here
- [MinIO pricing page](https://min.io/pricing) — free single-node AIStor license (`minio.license`)
- [MinIO client (mc)](https://min.io/docs/minio/linux/reference/minio-mc.html) — CLI used to provision buckets and users
- [AWS S3 API](https://docs.aws.amazon.com/AmazonS3/latest/API/Welcome.html) — the only storage API the app uses, so any S3-compatible store works

## Web app stack

- [Next.js](https://nextjs.org/docs) — web framework
- [React](https://react.dev/) — UI library
- [exifr](https://github.com/MikeKovarik/exifr) — EXIF and GPS parsing
- [EXIF specification](https://www.exif.org/) — where the GPS metadata comes from
- [sharp](https://sharp.pixelplumbing.com/) — image validation
- [Leaflet](https://leafletjs.com/) — session map
- [OpenStreetMap](https://www.openstreetmap.org/) — map tiles (proxied same-origin via `/api/tiles`)

## Toolchain

- [uv](https://docs.astral.sh/uv/) — Python package and project manager for the agent and these docs
- [Node.js](https://nodejs.org/) — web app runtime (24 LTS, pinned in `.nvmrc`)
- [Docker](https://docs.docker.com/) — optional compose stack
- [WSL2](https://learn.microsoft.com/windows/wsl/) — Windows VM backend for Docker Desktop and the governed-mode distro

## Governed mode

- [NVIDIA OpenShell](https://github.com/NVIDIA/OpenShell) — the sandbox runtime used in governed mode
- [OpenShell docs](https://docs.nvidia.com/openshell/latest/) — policies, providers, sandboxes, gateways

## Docs site tooling

- [MkDocs](https://www.mkdocs.org/) — static site generator
- [Material for MkDocs](https://squidfunk.github.io/mkdocs-material/) — the theme used here
- [GitHub Pages](https://docs.github.com/pages) — serves the published site from the `gh-pages` branch
- [GitHub Actions](https://docs.github.com/actions) — CI workflow `.github/workflows/docs.yml`
