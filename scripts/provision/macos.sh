#!/usr/bin/env bash
# macos.sh — macOS target for the governed environment.
#
# Platform model (docs/openshell.md §1): on macOS the OpenShell gateway runs
# natively and isolation uses the container boundary (Podman machine) instead
# of Landlock. Per the IDD, the Landlock ABI check is SKIPPED here and replaced
# by the documented macOS runtime check — never faked:
#   rootless podman via `podman machine` + `podman info` rootless=true.
#
# NOTE (anti-hallucination protocol): this path is written from the NVIDIA
# docs + install.sh; it is marked "per docs, unverified at runtime" in the
# commit message because the demo host is Windows + WSL2.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

[ "$(uname -s)" = "Darwin" ] || die "macos.sh must run on macOS"

# --- toolchain ----------------------------------------------------------------
if ! command -v brew >/dev/null 2>&1; then
  die "Homebrew required (https://brew.sh) — install.sh's macOS path uses it"
fi
command -v mise >/dev/null 2>&1 || curl -fsSL https://mise.run | sh >/dev/null
mise use -g node@lts uv@latest >/dev/null 2>&1 || true
grep -q 'mise activate' ~/.zshrc 2>/dev/null || echo 'eval "$(mise activate zsh)"' >> ~/.zshrc

# --- pinned OpenShell via the documented installer (release formula) ----------
curl -LsSf https://raw.githubusercontent.com/NVIDIA/OpenShell/main/install.sh \
  | OPENSHELL_VERSION="$OPENSHELL_VERSION" sh
log "installed: $(openshell --version)"

# --- rootless Podman machine (container isolation boundary) ------------------
brew install podman 2>/dev/null || true
podman machine init --now 2>/dev/null || podman machine start 2>/dev/null || die "podman machine failed to start"
# Documented macOS runtime check (substitutes the Landlock ABI check):
podman info --format 'rootless={{.Host.Security.Rootless}}' | grep -q 'rootless=true' \
  || die "podman is not rootless on macOS"
podman machine info >/dev/null || die "podman machine not responding"
log "macOS runtime check OK: rootless Podman machine running (container boundary replaces Landlock)"

# --- gateway (launchd service started by the formula) + readiness ------------
brew services start nvidia/openshell/openshell 2>/dev/null || warn "brew service start failed; start the gateway manually: openshell-gateway"
for i in $(seq 1 30); do
  curl -sk "${GATEWAY_ENDPOINT}/healthz" >/dev/null 2>&1 && break
  sleep 1
done
openshell gateway remove "$GATEWAY_NAME" >/dev/null 2>&1 || true
openshell gateway add "$GATEWAY_ENDPOINT" --local --name "$GATEWAY_NAME"
openshell status | grep -q 'Status: Connected' || die "gateway not reachable at ${GATEWAY_ENDPOINT}"
log "gateway ready: ${GATEWAY_ENDPOINT} ($(openshell status | grep 'Version:' | tr -s ' '))"

footprint_report
log "provision OK (macos) — openshell pin: ${OPENSHELL_VERSION}"
