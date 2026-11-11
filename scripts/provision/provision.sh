#!/usr/bin/env bash
# provision.sh <target> — platform-aware governed-environment provisioning.
#
# Targets (docs/openshell.md §1):
#   windows+wsl2  Windows host + WSL2 distro from the golden tar (demo path).
#                 Run from Git Bash/PowerShell on the Windows host; delegates
#                 to windows-wsl2.ps1. Extra args are forwarded to the ps1.
#   linux         Plain Linux host: runs inner-linux.sh directly (as root).
#   macos         macOS host: brew/install.sh + Podman machine (no Landlock;
#                 documented macOS runtime check substitutes it).
#
# Examples:
#   scripts/provision/provision.sh windows+wsl2 -BuildGolden
#   scripts/provision/provision.sh windows+wsl2 -ResetFromGoldenTar
#   scripts/provision/provision.sh linux
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-}"
[ -n "$TARGET" ] || { echo "usage: $0 <windows+wsl2|linux|macos> [extra args...]" >&2; exit 2; }
shift

case "$TARGET" in
  windows+wsl2)
    # Must run on the Windows host (needs wsl.exe), not inside a distro.
    if grep -qi 'microsoft' /proc/sys/kernel/osrelease 2>/dev/null; then
      echo "[provision][error] windows+wsl2 must run on the Windows host, not inside WSL" >&2
      exit 2
    fi
    command -v wsl.exe >/dev/null 2>&1 || { echo "[provision][error] wsl.exe not found" >&2; exit 2; }
    exec powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$SCRIPT_DIR/windows-wsl2.ps1" "$@"
    ;;
  linux)
    [ "$(id -u)" -eq 0 ] || { echo "[provision][error] linux target must run as root (sudo)" >&2; exit 2; }
    exec bash "$SCRIPT_DIR/inner-linux.sh"
    ;;
  macos)
    command -v uname >/dev/null && [ "$(uname -s)" = "Darwin" ] || { echo "[provision][error] macos target must run on macOS" >&2; exit 2; }
    exec bash "$SCRIPT_DIR/macos.sh" "$@"
    ;;
  *)
    echo "[provision][error] unknown target: $TARGET" >&2; exit 2 ;;
esac
