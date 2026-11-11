# Governed agent — demo walkthrough

End-to-end guide for running the Smart Crowd Counter analysis agent inside an
NVIDIA OpenShell sandbox.

!!! note "Native Windows + WSL2 combo"
    The Windows host runs Ollama (CUDA), MinIO AIStor and Next.js natively. A
    WSL2 distro — imported from a golden tar and named after the project
    (`smart-crowd-counter`) — runs **only** the OpenShell gateway, rootless
    headless Podman, and the sandboxed agent. The existing
    `scripts/dev.sh` / `scripts/dev.ps1` flow is untouched; the governed path
    is additive and opt-in (`scripts/dev-governed.sh`).

## Platform matrix

| Component | `windows+wsl2` (demo path) | `linux` | `macos` |
| --------- | -------------------------- | ------- | ------- |
| Next.js app + browser | Windows host | Linux host | macOS host |
| MinIO AIStor `:9000` | Windows host | Linux host | macOS host |
| Ollama `:11434` | Windows host, CUDA (`OLLAMA_HOST=0.0.0.0`) | Linux host | macOS host |
| OpenShell gateway | WSL2 distro `smart-crowd-counter` | native | native |
| Compute runtime | rootless headless Podman in the distro | rootless Podman on the host | Podman machine |
| Sandboxed agent | `openshell sandbox create` | same | same |
| Filesystem isolation | Landlock (ABI ≥ 3 checked at provision) | Landlock (ABI ≥ 3) | container boundary (documented macOS runtime check) |
| `.wslconfig` | written/scaled by `scripts/provision/windows-wsl2.ps1` | n/a | n/a |

Docker Desktop is a documented supported alternative runtime only — it is **not**
the demo path (isolation here comes from rootless Podman via the OpenShell podman
driver).

## Prerequisites

- Windows 11 + WSL2 (demo path), or Linux/macOS per the matrix.
- MinIO AIStor license at `./minio.license` (free single-node license from
  <https://min.io/pricing>).
- Ollama installed on the host with a pulled vision model
  (`ollama pull qwen2.5vl:7b`; on this 8 GB-VRAM spec use `qwen2.5vl:3b` — the
  provisioner warns when free VRAM < 6 GB).
- Demo machine: 16 GB RAM, RTX 4070 (8 GB VRAM) is the **minimum** target. The
  provisioner scales `.wslconfig` automatically: on a 16 GB host the WSL2 cap is
  6 GB / 4 processors / 8 GB swap (32 GB host → 12 GB).

## Walkthrough (windows+wsl2)

### Windows Host

All commands from the repo root on the Windows host.

**Step 1 — Build the golden image once** (exports `dist/openshell-golden.tar`):

```powershell
scripts/provision/provision.sh windows+wsl2 -BuildGolden -BaseDistro Ubuntu
```

**Step 2 — Provision / reset the project distro** from the golden tar:

```powershell
scripts/provision/provision.sh windows+wsl2   # or -ResetFromGoldenTar
```

**Step 3 — Launch the governed agent** (MinIO is ensured on :9000 first):

```powershell
AGENT_MODEL=qwen2.5vl:3b scripts/dev-governed.sh
```

**Step 4 — Point the web app at the governed agent and open the UI.** Set in
`.env`: `AGENT_URL=http://default--crowd-counter.openshell.localhost:17670`, then:

```powershell
npm run dev
```

### Inside WSL2 Distro

```bash
wsl -d smart-crowd-counter -- openshell status
```

- Connected / Authenticated (mTLS) / 0.1.8

```bash
wsl -d smart-crowd-counter -- openshell sandbox list
```

- `crowd-counter` Ready

```bash
wsl -d smart-crowd-counter -- openshell policy get crowd-counter --full
```

- the full policy artifact — see below

```bash
wsl -d smart-crowd-counter -- openshell logs crowd-counter
```

- OCSF events, including denies

Deny evidence (exits 0 only when all probes fire). Set `REPO_WIN` to your
Windows clone path once per shell — `wslpath` converts it to the WSL mount,
so no `/mnt/<drive>/...` path is hardcoded:

```bash
export REPO_WIN='D:/git/smart-crowd-counter'   # adjust to your clone
wsl -d smart-crowd-counter -- bash "$(wsl wslpath -u "$REPO_WIN")/scripts/deny-evidence.sh"
```

```shell
  OK: example.com blocked (curl exit 7)
  OK: `/root/.bashrc` read blocked: Permission denied
  OK: `/.openshell` blocked
  OK: private-logs denied by IAM: S3Error code=AccessDenied (HTTP 403)
  ALL DENIES FIRED (log lines captured to `dist/deny-evidence.log`)
```

## Reviewable security artifact

Run the following command:

```shell
openshell policy get crowd-counter --full
```

That should show the following YAML which is the currently applicable policy:

```yaml
version: 1
filesystem_policy:
  include_workdir: true
  read_only: [/bin, /usr, /lib, /proc, /dev/urandom, /etc, /var/log]
  read_write: [/tmp, /dev/null]
landlock:
  compatibility: hard_requirement
process:
  run_as_user: "1500"
  run_as_group: "1500"
network_policies:
  _provider_minio:   # host.openshell.internal:9000, rest, read-write, sigv4/s3
  _provider_ollama:  # host.openshell.internal:11434, rest, read-write
```

## What the agent can and cannot do

| Probe (inside sandbox) | Result |
| ---------------------- | ------ |
| minio `list_buckets` via `host.openshell.internal:9000` with placeholder creds | `['analysis', 'snaps']` — gateway re-signed SigV4 |
| same placeholder creds to `host.openshell.internal:11434` | DENIED `credential_unavailable` (engine:credential-binding) |
| curl `https://example.com` | DENIED `transparent_tcp_policy_denied` |
| `cat /root/.bashrc`, `ls /.openshell` | Permission denied / blocked |
| `list_objects('private-logs')` (outside IAM policy) | S3 `AccessDenied` 403 |
| Ollama `/api/tags` via `host.openshell.internal:11434` | 200 — inference path works |

!!! note
    The installed 0.1.8 runtime returns `credential_unavailable` (HTTP 500) for
    a placeholder at an unbound endpoint where the docs' error table lists
    `credential_endpoint_mismatch` (403) — the installed runtime wins; both are
    credential-binding denies.

## Layout

```
openshell/profile/ollama-openai.yaml     # credentialless inference profile (docs: how-it-works/inference)
openshell/profile/minio-aistor-s3.yaml   # data profile: static creds + gateway-side SigV4
openshell/policy/crowd-counter-agent.yaml  # schema-valid sandbox policy
agent/Dockerfile.sandbox                # /sandbox/.venv, USER sandbox (1500), no secrets
scripts/provision/                      # platform-aware provisioning + golden tar
scripts/dev-governed.sh                 # governed launch path
scripts/deny-evidence.sh                # deny probes + OCSF capture
scripts/openshell/gen-schema-allowlist.mjs  # regenerates the CI allowlist from the schema docs
__tests__/openshell/                    # schema conformance tests
```
