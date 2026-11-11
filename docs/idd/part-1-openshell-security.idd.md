# IDD Artifact: Govern the Smart Crowd Counter Agent with NVIDIA OpenShell (Part 1 — Security)

> Intent-Driven Development treats the intent prompt as the design document.
> This file is the versioned design artifact for Part 1. Implementation commits
> are reviewed against this intent; changes to intent are made by editing this
> file in a commit of their own.

## Intent

The Google ADK analysis agent (`agent/`) must run inside an NVIDIA OpenShell
sandbox such that it can reach ONLY the local MinIO AIStor endpoint and the
local Ollama endpoint, read ONLY the filesystem paths it needs, and never
hold real S3 credentials in its environment. The existing Windows/dev.sh flow
remains untouched — the governed path is additive and opt-in. This is a
private-AI security demonstration (policy-as-code, evidence of denies, correct
OpenShell architecture).

## Hard constraints

Schema truth: https://docs.nvidia.com/openshell/latest/how-it-works/policies/schema

1. Sandbox policy YAML uses ONLY: `version`, `filesystem_policy`
   {include_workdir, read_only, read_write}, `landlock` {compatibility},
   `process` {run_as_user, run_as_group}, `network_policies`,
   `network_middlewares`. NO `masked_paths`, NO `default_egress`, NO
   `no_new_privileges` — OpenShell rejects unknown fields; default-deny and
   seccomp are implicit.
2. Host-local services are reached via `host.openshell.internal`, NEVER
   `127.0.0.1`/`localhost` — network policy never authorizes loopback.
3. Ollama = documented credentialless inference provider profile
   (id: ollama-openai, category: inference, endpoint
   host.openshell.internal:11434, protocol: rest, access: read-write,
   binaries = the agent image's actual python paths).
   Ref: https://docs.nvidia.com/openshell/latest/how-it-works/inference
4. MinIO/AIStor = `data`-category provider profile, static S3 credentials bound
   to the AIStor endpoint, gateway-side SigV4 signing (credential_signing:
   sigv4, signing_service: s3) so the workload holds only placeholders.
   Ref: https://docs.nvidia.com/openshell/latest/how-it-works/providers/profiles
5. Gateway is first-class: sandboxes via `openshell sandbox create` against a
   registered gateway; policies via the `openshell policy` CLI. No hand-rolled
   sandbox launchers.
6. Every profile is linted (`openshell profile lint`) before import; the CI
   schema test is generated FROM the schema reference as an allowed-fields
   ALLOWLIST — a field is legal only if the schema lists it, so an
   invented-but-plausible field fails the test (such a regression must be
   impossible to ship).
7. Isolation comes ONLY from an OpenShell-supported runtime: rootless headless
   Podman. NO bwrap, no hand-rolled launchers. Docker Desktop is documented as
   a supported alternative only (not the demo path).
8. PLATFORM MODEL — state this prominently in every doc: the Windows demo is a
   NATIVE WINDOWS + WSL2 COMBO: Windows host runs Ollama (CUDA), MinIO AIStor,
   Next.js; the WSL2 golden distro runs ONLY the OpenShell gateway + rootless
   Podman + the sandboxed agent. Provisioning scripts are PLATFORM-AWARE with
   three first-class targets:
   - windows+wsl2: golden distro via wsl --import; .wslconfig written by the
     provision script (resource rules below); Landlock ABI check required.
   - linux: same scripts, no WSL layer; Landlock ABI check required.
   - macOS: OpenShell gateway native; container isolation boundary instead of
     Landlock — SKIP the Landlock check, substitute the documented macOS
     runtime check; do not fake or skip verification.
   Docs must include a component × platform matrix so readers know exactly
   what runs where on their machine.

## Anti-hallucination protocol (binding)

9. VERIFY BEFORE WRITE: before writing any OpenShell policy field, profile
   field, or CLI command, confirm it exists in the linked authoritative doc
   for the CURRENT version. If you cannot verify it, do not write it — stop
   and report the gap instead of guessing.
10. NEVER INVENT: no assumed OpenShell features, flags, env vars, or fields.
    Unknown-field rejection is OpenShell's actual behavior — an invented
    field is a bug the gateway will reject at runtime, not a style issue.
11. PIN AND PROBE: pin the openshell CLI version in the golden image and
    record it (`openshell --version`) in docs/openshell.md. When docs and
    the installed CLI disagree, THE INSTALLED CLI WINS — verify with
    `openshell <cmd> --help` and report the divergence.
12. WHEN UNSURE: run the real command in the WSL2 distro and use its actual
    output. Prefer a verified `--help` or a small probe over prose from
    memory. If a probe is impossible (e.g., docs-only decision), say so
    explicitly in the commit message and mark the claim "per docs, unverified
    at runtime".

## Resource rules (provision script MUST implement)

- Detect host RAM and SCALE .wslconfig — never hardcode:
  WSL2 memory cap = clamp(hostRAM × 0.375, 4 GB, 16 GB) — 16 GB host → 6 GB,
  24 GB → 9 GB, 32 GB → 12 GB, 64 GB → 16 GB.
  processors = min(4, hostCores/2); swap = 8 GB; autoMemoryReclaim=gradual.
  Better machines get bigger budgets automatically; the demo spec
  (16 GB RAM, RTX 4070 8 GB VRAM) is the MINIMUM target, not the ceiling.
- Detect free VRAM and warn if < 6 GB (qwen2.5vl:7b Q4 needs ~5.5 GB);
  suggest qwen2.5vl:3b fallback.
- Ollama: OLLAMA_MAX_LOADED_MODELS=1, OLLAMA_KEEP_ALIVE=2m.
- Post-provision footprint report: `free -h`, vmmem guidance (< ~3 GB after
  10 min idle on the 16 GB spec), computed budgets echoed back.
- Target: ~5 GB RAM headroom on the 16 GB spec; zero Windows freezes.
- Full budget table: Windows host ~9 GB (baseline 4.5, Ollama 1, AIStor 0.5,
  Next.js 1.5, browser 1.5); WSL2 distro ~2 GB used (distro+Podman 0.5,
  gateway 0.5, sandboxed agent 0.7-1); headroom ~5 GB. Ollama weights live in
  VRAM (~5.5/8 GB), never run Ollama inside WSL2.

## Non-goals

No Next.js upload-flow or MinIO IAM changes. No MemKV/vLLM (Part 2 — dropped).
No inbox agent implementation (Part 1b — README may TEASE it only). No cloud
VMs, no public endpoints, no tunnels.

## Commit plan — IN ORDER, one atomic commit each, stack works after every commit

1. `docs: OpenShell integration design notes` — docs/openshell.md: architecture
   mapping (gateway/provider/policy → agent/Ollama/AIStor), corrections
   table, NATIVE WINDOWS + WSL2 COMBO callout, component × platform
   matrix, topology + resource budget, AND an "Authoritative OpenShell
   references" appendix with canonical NVIDIA doc links grouped by concern
   (concepts, policies, providers, sandboxes/runtimes, gateways,
   observability, tutorials, repo/SDKs), each annotated with the commit/
   decision it backs. Verify links are live at commit time; use /latest/
   paths. Start from: /about/overview, /about/architecture,
   /about/run-your-first-agent, /how-it-works/policies/schema,
   /how-it-works/policies/network-rules, /how-it-works/policies/manage-policies,
   /how-it-works/policies/prover, /how-it-works/providers/overview,
   /how-it-works/providers/profiles, /how-it-works/inference,
   /how-it-works/providers/aws, /how-it-works/sandboxes/overview,
   /how-it-works/sandboxes/runtimes, /extensibility/isolation-backends,
   /how-it-works/gateways/overview, /observability/ocsf-json-export,
   /security/best-practices, /tutorials/first-network-policy, plus
   github.com/NVIDIA/OpenShell and its providers/ directory.
   Evidence: human review; every decision traces to a linked authoritative
   page; a reader can extend the integration from the links alone.
2. `feat(scripts): platform-aware governed-environment provisioning` —
   scripts/provision/ with windows+wsl2 / linux / macos targets: mise, uv, node,
   openshell CLI, rootless headless Podman, golden-image tar + reset
   (WSL2/Linux), scaled .wslconfig per resource rules, Landlock ABI ≥ 3 check
   (linux/wsl2) or macOS runtime check, gateway readiness, footprint report.
   Evidence: fresh distro passes all checks; `-ResetFromGoldenTar` reproduces;
   on a 32 GB host the echoed WSL cap is 12 GB (scaling proven); vmmem < ~3 GB
   after 10 min idle.
3. `feat(agent): sandbox-ready workload image` — predictable python/venv paths
   (/sandbox/.venv/**), non-root, no baked secrets; builds with `podman build`.
   Evidence: `which python` = declared path; `id -u` non-zero; no key-like env.
4. `feat(openshell): Ollama inference provider profile` — lint, import, describe.
   Evidence: lint passes; endpoint shows host.openshell.internal:11434; zero
   credential fields.
5. `feat(openshell): MinIO S3 data provider profile` — static creds, SigV4.
   Evidence: sandboxed curl to AIStor succeeds with PLACEHOLDER creds; same curl
   to a different host → `credential_endpoint_mismatch` 403 (capture the
   output — this is the core private-AI evidence).
6. `feat(openshell): sandbox policy for the crowd-counter agent` — schema-valid
   fields only, landlock hard_requirement (linux/wsl2), minimal filesystem.
   Evidence: `openshell policy get <sandbox> --full` shows provider-derived +
   sandbox rules and nothing else; every allow-rule maps to docs/openshell.md.
7. `feat(scripts): governed launch path` — scripts/dev-governed.sh: register
   gateway, import profiles, create providers, `openshell sandbox create` with
   the ADK agent as main process, attach providers, set
   OLLAMA_BASE_URL=http://host.openshell.internal:11434/v1. Existing
   dev.sh/dev.ps1 untouched. Evidence: photo upload in Windows browser →
   analysis completes; Ollama log on Windows shows the request; vmmem < 4 GB
   during the run.
8. `test: deny evidence + schema conformance` — CI schema test (unknown field ⇒
   fail); scripts/deny-evidence.sh inside the sandbox: non-allowlisted host,
   forbidden path read, out-of-scope bucket — all three BLOCKED, OCSF/log
   lines captured as the evidence artifact. Evidence: script exits 0 only when
   all denies fire; tamper test (add unknown field ⇒ CI fails) passes.
9. `docs: governed-agent README + demo walkthrough` — end-to-end narrative with
   expected CLI outputs; NATIVE WINDOWS + WSL2 COMBO stated up top; platform
   matrix; Docker Desktop as supported alternative only.
   Evidence: walkthrough runs start-to-finish on a RESET distro with zero
   improvisation, on the 16 GB spec (and a larger machine if available).
10. `docs: README improvements and practical applications` —
    a) "Why OpenShell": private-AI motivation, architectural changes (gateway,
    provider profiles, sandboxed agent, policy-as-code; updated mermaid diagram
    showing the sandbox boundary), before/after trust story (agent holds
    placeholders, not secrets).
    b) "Practical applications": industrial/factory floor inspections, airport
    & security-post inspections, smart-city infrastructure (lamp posts,
    utilities, public works), field service & insurance claims, event/conference
    analytics (current demo). Each ties to the same loop: field workers capture
    photos → drop into storage → governed agent analyzes. Close with the inbox
    feature as Roadmap (Part 1b): photos land in `snaps/inbox/`, the governed
    agent validates, processes, files them — no upload UI needed. Teaser only,
    no implementation promises.
    Evidence: README renders; applications read as business value, not a
    feature list.

## Definition of done

- All 10 commits on a feature branch, each passing lint/tests.
- From a reset golden distro: one command starts the governed stack; photo
  upload → analysis works; deny-evidence shows all blocks; budgets held.
- `openshell policy get --full` output captured in docs as the reviewable
  security artifact.
- README covers the combo topology, platform matrix, why, and applications
  with the inbox roadmap teaser.
- No secret values in repo files, logs, or docs.

## Parked for next iteration (recorded decision, out of Part 1 scope)

The agent is the ONLY LLM boundary. All model calls stay inside the governed
agent; the web app's contract remains `POST /analyze {path}` — it never sends
prompts and never calls LLMs or model-serving endpoints directly.

Next-iteration upgrade (after Part 1): make the analysis agent tool-using.
Storage operations (get_photo, read_photo_metadata, save_analysis, list_photos)
are exposed as an MCP server; the ADK agent consumes it as an MCP client, so
tools plug in and out behind the agent boundary without any UI/API change, and
OpenShell's `protocol: mcp` network policy governs individual `tools/call`
invocations by tool name. The inbox feature (Part 1b) builds on this
tool-using agent with a watch trigger. Next.js does NOT call the MCP server
for LLM-related work; deterministic housekeeping, if ever needed, is a
separate explicit decision.
