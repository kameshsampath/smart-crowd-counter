# Governed-environment provisioning

Platform-aware provisioning for the NVIDIA OpenShell governed path
(design: [docs/openshell.md](../../docs/openshell.md), intent:
[docs/idd/part-1-openshell-security.idd.md](../../docs/idd/part-1-openshell-security.idd.md)).

> **NATIVE WINDOWS + WSL2 COMBO**: on Windows, the host runs Ollama (CUDA),
> MinIO AIStor and Next.js natively; a WSL2 distro imported from the golden
> tar runs **only** the OpenShell gateway, rootless headless Podman and the
> sandboxed agent. The existing `scripts/dev.sh` / `dev.ps1` flow is
> untouched — the governed path is additive and opt-in.

## Targets

| Target | Entry point | What runs where |
| ------ | ----------- | --------------- |
| `windows+wsl2` (demo path) | `scripts/provision/provision.sh windows+wsl2` from the Windows host | gateway + Podman + agent in a WSL2 distro named after the project (`smart-crowd-counter`), imported from `dist/openshell-golden.tar`; `.wslconfig` scaled by the script |
| `linux` | `sudo scripts/provision/provision.sh linux` | same, directly on the Linux host |
| `macos` | `scripts/provision/provision.sh macos` | gateway native via Homebrew, Podman machine as the container boundary (Landlock check replaced by the documented macOS runtime check) |

## Usage (Windows host)

```powershell
# 1. Build the golden image once (imports a base distro, provisions it, exports dist/openshell-golden.tar)
scripts/provision/provision.sh windows+wsl2 -BuildGolden -BaseDistro Ubuntu

# 2. Provision / reset the project distro from the golden tar
scripts/provision/provision.sh windows+wsl2
scripts/provision/provision.sh windows+wsl2 -ResetFromGoldenTar
```

The script writes a scaled `%USERPROFILE%\.wslconfig` (memory cap =
`clamp(hostRAM x 0.375, 4, 16)` GB — 16 GB host -> 6 GB, 32 GB -> 12 GB;
processors = `min(4, cores/2)`; swap 8 GB; `autoMemoryReclaim=gradual`),
warns when free VRAM < 6 GB (suggests `AGENT_MODEL=qwen2.5vl:3b`), and prints
a footprint report (`free -h`; vmmem guidance < ~3 GB idle on the 16 GB spec).

## What the inner provisioner checks (linux / windows+wsl2)

- systemd running (WSL2: enables `[boot] systemd=true` and asks for a distro restart)
- cgroups v2, subuid/subgid, `loginctl enable-linger`
- rootless headless Podman: `systemctl --user enable --now podman.socket`, `podman info` reports `rootless=true`
- pinned OpenShell CLI (`OPENSHELL_VERSION=v0.1.8`, verified with `openshell --version`)
- **Landlock ABI >= 3** probed via `landlock_create_ruleset(NULL, 0, VERSION)`
- gateway config `~/.config/openshell/gateway.toml` with `compute_driver = "podman"`,
  validated by `openshell-gateway config preflight`
- gateway readiness: systemd user unit `openshell-gateway` active,
  `openshell gateway add https://127.0.0.1:17670 --local --name openshell`,
  `openshell status` reports `Connected` / `Authenticated (mTLS)`

`dist/` (golden tar, exported base tar, distro vhdx dirs) is gitignored.
