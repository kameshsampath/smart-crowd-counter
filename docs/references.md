# References

All external sites and links referenced across these docs, sorted by topic.
External links open in a new tab/window.

## Docs site tooling

- [GitHub Actions](https://docs.github.com/actions) — CI workflow `.github/workflows/docs.yml`
- [GitHub Pages](https://docs.github.com/pages) — serves the published site from the `gh-pages` branch
- [Material for MkDocs](https://squidfunk.github.io/mkdocs-material/) — the theme used here
- [MkDocs](https://www.mkdocs.org/) — static site generator

## Governed mode

- [NVIDIA OpenShell](https://github.com/NVIDIA/OpenShell) — the sandbox runtime used in governed mode
- [OpenShell docs](https://docs.nvidia.com/openshell/latest/) — policies, providers, sandboxes, gateways

## License

- [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0) — license text (see `LICENSE` and `NOTICE` in the repo)

## Runtime and AI stack

- [Google ADK documentation](https://google.github.io/adk-docs/) — the agent framework
- [LiteLLM](https://docs.litellm.ai/) — the ADK agent reaches Ollama as `ollama_chat/<AGENT_MODEL>`
- [Ollama](https://ollama.com/) — local model runtime
- [qwen2.5vl models on Ollama](https://ollama.com/library/qwen2.5vl) — default vision model (`qwen2.5vl:7b`, low-RAM `qwen2.5vl:3b`)

## Storage

- [AWS S3 API](https://docs.aws.amazon.com/AmazonS3/latest/API/Welcome.html) — the only storage API the app uses, so any S3-compatible store works
- [MinIO AIStor](https://min.io/product/aistor) — object storage used here
- [MinIO client (mc)](https://min.io/docs/minio/linux/reference/minio-mc.html) — CLI used to provision buckets and users
- [MinIO pricing page](https://min.io/pricing) — free single-node AIStor license (`minio.license`)

## Toolchain

- [Docker](https://docs.docker.com/) — optional compose stack
- [Node.js](https://nodejs.org/) — web app runtime (24 LTS, pinned in `.nvmrc`)
- [uv](https://docs.astral.sh/uv/) — Python package and project manager for the agent and these docs
- [WSL2](https://learn.microsoft.com/windows/wsl/) — Windows VM backend for Docker Desktop and the governed-mode distro

## Web app stack

- [EXIF specification](https://www.exif.org/) — where the GPS metadata comes from
- [exifr](https://github.com/MikeKovarik/exifr) — EXIF and GPS parsing
- [Leaflet](https://leafletjs.com/) — session map
- [Next.js](https://nextjs.org/docs) — web framework
- [OpenStreetMap](https://www.openstreetmap.org/) — map tiles (proxied same-origin via `/api/tiles`)
- [React](https://react.dev/) — UI library
- [sharp](https://sharp.pixelplumbing.com/) — image validation
