#!/usr/bin/env bash
# Shared helpers for scripts/provision/*. Sourced by the inner provisioners.
# shellcheck shell=bash

# Pinned OpenShell release (docs: Latest = v0.1.8; installed CLI wins — see
# docs/openshell.md). `openshell --version` is recorded after install.
OPENSHELL_VERSION="${OPENSHELL_VERSION:-v0.1.8}"
OPENSHELL_DEB_VERSION="${OPENSHELL_VERSION#v}"

GATEWAY_NAME="${OPENSHELL_GATEWAY_NAME:-openshell}"
GATEWAY_PORT="${OPENSHELL_GATEWAY_PORT:-17670}"
GATEWAY_ENDPOINT="https://127.0.0.1:${GATEWAY_PORT}"

log()  { printf '[provision] %s\n' "$*"; }
warn() { printf '[provision][warn] %s\n' "$*" >&2; }
die()  { printf '[provision][error] %s\n' "$*" >&2; exit 1; }

# Host RAM in decimal GB and logical cores, from /proc (works in WSL2 and Linux).
host_ram_gb() {
  awk '/MemTotal/ { printf "%.3f", $2 / 1e6 }' /proc/meminfo   # kB -> GB (decimal)
}
host_cores() { nproc; }

# WSL2 resource rules (docs/openshell.md §5):
#   memory cap = clamp(hostRAM_GB * 0.375, 4, 16)  (16 GB -> 6 GB, 32 GB -> 12 GB)
#   processors = min(4, cores / 2); swap = 8 GB; autoMemoryReclaim = gradual
wsl2_memory_cap_gb() {
  awk -v ram="$(host_ram_gb)" -v cores="$(host_cores)" 'BEGIN {
    cap = ram * 0.375; if (cap < 4) cap = 4; if (cap > 16) cap = 16;
    printf "%d", int(cap);            # 16.42 GB -> 6, 24 -> 9, 32 -> 12, 64 -> 16
  }'
}
wsl2_processors() {
  awk -v cores="$(host_cores)" 'BEGIN { p = int(cores / 2); if (p > 4) p = 4; if (p < 1) p = 1; print p }'
}

# Landlock ABI probe — mirrors crates/openshell-sandbox/src/linux/landlock.rs:
# landlock_create_ruleset(NULL, 0, LANDLOCK_CREATE_RULESET_VERSION=1) returns
# the ABI version admitted by the active kernel. Requires ABI >= 3.
landlock_abi() {
  python3 - <<'PY' 2>/dev/null || echo 0
import ctypes
libc = ctypes.CDLL(None, use_errno=True)
ctypes.set_errno(0)
r = libc.syscall(444, None, 0, 1)  # SYS_landlock_create_ruleset, VERSION flag
print(r if r > 0 else 0)
PY
}
require_landlock_abi3() {
  local abi; abi="$(landlock_abi)"
  [ "$abi" -ge 3 ] || die "Landlock ABI >= 3 required, detected ABI=${abi} (kernel $(uname -r))"
  log "Landlock ABI=${abi} (>= 3 required) OK on kernel $(uname -r)"
}

# Free VRAM in MiB via nvidia-smi; empty when no GPU. Warn below 6 GB
# (qwen2.5vl:7b Q4 needs ~5.5 GB) and suggest the 3b fallback.
check_vram() {
  command -v nvidia-smi >/dev/null 2>&1 || { warn "nvidia-smi not found; skipping VRAM check"; return 0; }
  local free; free="$(nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits 2>/dev/null | head -1)"
  [ -n "$free" ] || return 0
  if [ "$free" -lt 6144 ]; then
    warn "free VRAM ${free} MiB < 6144 MiB — qwen2.5vl:7b Q4 needs ~5.5 GB; consider AGENT_MODEL=qwen2.5vl:3b"
  else
    log "free VRAM ${free} MiB OK"
  fi
}

footprint_report() {
  log "footprint report (run inside the distro/host):"
  free -h | sed 's/^/[provision]   /'
  log "guidance: vmmem (Windows) should stay < ~3 GB after 10 min idle on the 16 GB spec, < 4 GB during a run"
}

# Ensure the default (non-root) target user exists and return its name/uid.
resolve_target_user() {
  if [ -n "${OPENSHELL_TARGET_USER:-}" ]; then
    id "$OPENSHELL_TARGET_USER" >/dev/null 2>&1 || die "user $OPENSHELL_TARGET_USER not found"
    echo "$OPENSHELL_TARGET_USER"
    return
  fi
  # In WSL the default user is the first uid>=1000 entry; fall back to SUDO_USER.
  local u
  u="$(awk -F: '$3 >= 1000 && $3 < 65534 { print $1; exit }' /etc/passwd)"
  echo "${u:-${SUDO_USER:-}}"
}

run_as_user() { # run_as_user <user> <cmd...> — with the user's runtime dir for systemctl --user
  local u="$1"; shift
  local uid; uid="$(id -u "$u")"
  runuser -u "$u" -- env HOME="/home/$u" XDG_RUNTIME_DIR="/run/user/$uid" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$uid/bus" "$@"
}
