#!/usr/bin/env bash
# inner-linux.sh — in-machine provisioner for the OpenShell governed
# environment. Runs INSIDE the target machine (WSL2 distro or Linux host) as
# root. Used by windows-wsl2.ps1 (via `wsl -d <distro> -- bash ...`) and by
# provision.sh on a plain Linux host.
#
# Idempotent: safe to re-run. Exit code 42 means "systemd was just enabled in
# WSL — restart the distro and re-run" (the Windows wrapper handles that).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

IS_WSL=0
if grep -qi 'microsoft-standard-wsl2\|microsoft' /proc/sys/kernel/osrelease 2>/dev/null; then
  IS_WSL=1
fi

TARGET_USER="$(resolve_target_user)"
[ -n "$TARGET_USER" ] || die "could not resolve a non-root target user"
log "target machine: $(uname -srm) (WSL=${IS_WSL}) user=${TARGET_USER}"

# --- 1. WSL2 distro settings + systemd (needed for the rootless Podman user socket) ---
if [ "$IS_WSL" -eq 1 ]; then
  touch /etc/wsl.conf
  changed=0
  if ! grep -q '^systemd=true' /etc/wsl.conf; then
    if grep -q '^\[boot\]' /etc/wsl.conf; then
      sed -i '/^\[boot\]/a systemd=true' /etc/wsl.conf
    else
      printf '[boot]\nsystemd=true\n' >> /etc/wsl.conf
    fi
    changed=1
  fi
  # default login user (a `wsl --import`ed distro defaults to root otherwise)
  if ! awk '/^\[user\]/{f=1;next} /^\[/{f=0} f && /^default=/{found=1} END{exit !found}' /etc/wsl.conf; then
    if grep -q '^\[user\]' /etc/wsl.conf; then
      sed -i "/^\[user\]/a default=$TARGET_USER" /etc/wsl.conf
    else
      printf '[user]\ndefault=%s\n' "$TARGET_USER" >> /etc/wsl.conf
    fi
    changed=1
  fi
  if [ "$changed" -eq 1 ]; then
    log "updated /etc/wsl.conf (systemd / default user) - distro restart required (wrapper handles it)"
    exit 42
  fi
fi
# Fresh distro boot: wait for systemd to settle (WSL may report "starting").
state="unknown"
for i in $(seq 1 30); do
  state="$(systemctl is-system-running 2>/dev/null || true)"
  case "$state" in running|degraded) break ;; esac
  sleep 2
done
case "$state" in running|degraded) ;; *) die "systemd not running (state=${state}); WSL2 needs /etc/wsl.conf [boot] systemd=true + distro restart" ;; esac
log "systemd state: $state"

# --- 2. base packages -------------------------------------------------------
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates git python3 jq unzip podman uidmap >/dev/null
log "base packages installed; podman $(podman --version)"

# cgroups v2 required by the rootless Podman driver
[ "$(stat -fc %T /sys/fs/cgroup)" = "cgroup2fs" ] || die "cgroups v2 required, /sys/fs/cgroup is $(stat -fc %T /sys/fs/cgroup)"

# subuid/subgid ranges for rootless containers
for f in /etc/subuid /etc/subgid; do
  grep -q "^${TARGET_USER}:" "$f" || echo "${TARGET_USER}:100000:65536" >> "$f"
done

# WSL2: make / a shared mount so rootless container mounts propagate (best effort)
if [ "$IS_WSL" -eq 1 ]; then
  mount --make-rshared / 2>/dev/null || warn "could not make / rshared (non-fatal)"
fi

# --- 3. toolchain: mise, node, uv -------------------------------------------
if ! command -v mise >/dev/null 2>&1; then
  curl -fsSL https://mise.run | MISE_INSTALL_PATH=/usr/local/bin/mise sh >/dev/null
fi
log "mise $(mise --version)"
run_as_user "$TARGET_USER" bash -c '
  export PATH="$HOME/.local/bin:$PATH"
  mise use -g node@lts uv@latest >/dev/null 2>&1 || mise use -g node uv >/dev/null 2>&1
  # mise shims on PATH for ALL shells (non-interactive login shells skip the tail of ~/.bashrc)
  for f in ~/.bashrc ~/.profile; do
    touch "$f"
    grep -q "mise/shims" "$f" || echo "export PATH=\"\$HOME/.local/share/mise/shims:\$PATH\"" >> "$f"
  done
  grep -q "mise activate" ~/.bashrc || echo "eval \"\$(mise activate bash)\"" >> ~/.bashrc
'
log "node $(run_as_user "$TARGET_USER" bash -lc 'node --version' 2>/dev/null || echo n/a), uv $(run_as_user "$TARGET_USER" bash -lc 'uv --version' 2>/dev/null || echo n/a)"

# --- 4. pinned OpenShell CLI + gateway + prover ------------------------------
ARCH="$(uname -m)"; [ "$ARCH" = "x86_64" ] && ARCH=amd64; [ "$ARCH" = "aarch64" ] && ARCH=arm64
DEB="/tmp/openshell_${OPENSHELL_DEB_VERSION}-1_${ARCH}.deb"
if ! curl -fsSL -o "$DEB" "https://github.com/NVIDIA/OpenShell/releases/download/${OPENSHELL_VERSION}/openshell_${OPENSHELL_DEB_VERSION}-1_${ARCH}.deb"; then
  die "could not download pinned OpenShell release ${OPENSHELL_VERSION} (${ARCH})"
fi
apt-get install -y -qq "$DEB" >/dev/null
INSTALLED="$(openshell --version)"
log "installed: ${INSTALLED}"
[ "$INSTALLED" = "openshell ${OPENSHELL_DEB_VERSION}" ] || die "version mismatch: got '${INSTALLED}', wanted openshell ${OPENSHELL_DEB_VERSION}"
printf '%s\n' "${OPENSHELL_VERSION}" > /etc/openshell-release-pin

# --- 5. Landlock ABI >= 3 (linux/wsl2 hard requirement) ----------------------
require_landlock_abi3

# --- 6. rootless headless Podman user socket ---------------------------------
loginctl enable-linger "$TARGET_USER" 2>/dev/null || warn "enable-linger failed (continuing)"
# systemd user manager must be up (linger + running systemd guarantee it after boot)
for i in $(seq 1 15); do
  [ -S "/run/user/$(id -u "$TARGET_USER")/bus" ] && break
  sleep 1
done
run_as_user "$TARGET_USER" systemctl --user enable podman.socket
run_as_user "$TARGET_USER" systemctl --user start podman.socket
run_as_user "$TARGET_USER" systemctl --user is-active podman.socket | grep -q active \
  || die "podman.socket not active"
run_as_user "$TARGET_USER" podman info --format 'rootless={{.Host.Security.Rootless}}' | grep -q 'rootless=true' \
  || die "podman is not rootless"
log "rootless headless Podman OK ($(run_as_user "$TARGET_USER" podman --version))"

# --- 7. gateway config (podman driver) + readiness ---------------------------
# WSL2: the supervisor's trusted destination for host.openshell.internal must be
# the Windows host address reachable from WSL - the default-route IP, which is
# the vEthernet (WSL) adapter IP on the Windows side (e.g. 172.23.208.1).
# Left empty on plain Linux the driver uses supervisor loopback (the host).
# Verified: Windows DNS (10.255.255.254) is NOT reachable for host services
# from WSL; the default-route IP is (MinIO :9000 answers there).
USER_HOME="/home/$TARGET_USER"
GW_IP=""
if [ "$IS_WSL" -eq 1 ]; then
  GW_IP="$(ip route | awk '/^default/{print $3; exit}')"
  [ -n "$GW_IP" ] || die "WSL2: could not detect the Windows host gateway IP (default route)"
  log "WSL2: host.openshell.internal -> host_gateway_ip=$GW_IP (Windows vEthernet (WSL) adapter)"
fi
install -d -o "$TARGET_USER" -g "$TARGET_USER" "$USER_HOME/.config/openshell"
{
  printf '[openshell]\nversion = 2\n\n[openshell.gateway]\ncompute_driver = "podman"\n'
  if [ -n "$GW_IP" ]; then
    printf '\n[openshell.drivers.podman]\nhost_gateway_ip = "%s"\n' "$GW_IP"
  fi
} > "$USER_HOME/.config/openshell/gateway.toml"
chown "$TARGET_USER:$TARGET_USER" "$USER_HOME/.config/openshell/gateway.toml"
run_as_user "$TARGET_USER" openshell-gateway config preflight --path "$USER_HOME/.config/openshell/gateway.toml"

run_as_user "$TARGET_USER" systemctl --user enable --now openshell-gateway.service >/dev/null
for i in $(seq 1 30); do
  curl -sk "${GATEWAY_ENDPOINT}/healthz" >/dev/null 2>&1 && break
  sleep 1
done
run_as_user "$TARGET_USER" systemctl --user is-active openshell-gateway.service | grep -q active \
  || die "openshell-gateway.service not active"

# Register the local mTLS gateway (certs generated by the unit with
# --server-san host.openshell.internal) and verify readiness.
run_as_user "$TARGET_USER" openshell gateway remove "$GATEWAY_NAME" >/dev/null 2>&1 || true
run_as_user "$TARGET_USER" openshell gateway add "$GATEWAY_ENDPOINT" --local --name "$GATEWAY_NAME"
run_as_user "$TARGET_USER" openshell status | grep -q 'Status: Connected' \
  || die "gateway not reachable at ${GATEWAY_ENDPOINT}"
log "gateway ready: ${GATEWAY_ENDPOINT} ($(run_as_user "$TARGET_USER" openshell status | grep 'Version:' | tr -s ' '))"

# --- 8. footprint ------------------------------------------------------------
footprint_report
log "provision OK — openshell pin: ${OPENSHELL_VERSION} (${INSTALLED})"
