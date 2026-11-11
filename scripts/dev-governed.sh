#!/usr/bin/env bash
# dev-governed.sh — governed launch path for the Smart Crowd Counter.
#
# Additive and opt-in: scripts/dev.sh and scripts/dev.ps1 are untouched.
# Run from the repo root on the Windows host (Git Bash or PowerShell):
#
#   scripts/dev-governed.sh            # ensure MinIO on Windows, then launch
#                                      # the ADK agent inside the OpenShell
#                                      # sandbox in the WSL2 project distro
#
# What it does:
#   Windows host: ensures MinIO AIStor is up on :9000, then re-execs inside
#     the WSL2 distro named after the project (smart-crowd-counter).
#   Inside the distro: gateway readiness, profile lint/import, provider
#     creation (creds from .env, gateway-side only), workload image build
#     (rootless podman), then `openshell sandbox create` with the ADK agent
#     as the main process, both providers attached, the sandbox policy, and
#     OLLAMA_BASE_URL=http://host.openshell.internal:11434. Port 8000 is
#     forwarded so the Next.js app (AGENT_URL=http://localhost:8000) reaches
#     the agent through Windows localhost -> WSL -> sandbox.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_NAME="$(basename "$REPO_ROOT")"
SANDBOX_NAME="crowd-counter"
IMAGE="localhost/smart-crowd-counter-agent:v1"
GATEWAY_NAME="openshell"
GATEWAY_ENDPOINT="https://127.0.0.1:17670"

log() { printf '[dev-governed] %s\n' "$*"; }

wait_gateway() {
  for i in $(seq 1 45); do
    openshell --color never status 2>/dev/null | grep -q 'Status: Connected' && return 0
    sleep 2
  done
  return 1
}

inner() {
  command -v openshell >/dev/null 2>&1 || { echo "[dev-governed][error] openshell CLI not found - run scripts/provision/provision.sh windows+wsl2 first" >&2; exit 1; }
  systemctl --user is-active podman.socket >/dev/null 2>&1 || systemctl --user start podman.socket

  # 1. gateway registered + ready
  if ! openshell --color never gateway list 2>/dev/null | grep -q "$GATEWAY_NAME"; then
    openshell --color never gateway add "$GATEWAY_ENDPOINT" --local --name "$GATEWAY_NAME"
  fi
  wait_gateway || { echo "[dev-governed][error] gateway not reachable at $GATEWAY_ENDPOINT" >&2; exit 1; }
  log "gateway ready: $(openshell --color never status 2>/dev/null | grep -E 'Status|Version' | tr -s ' ' | tr '\n' ' ')"

  # 2. profiles linted + imported (idempotent)
  for p in ollama-openai minio-aistor-s3; do
    if ! openshell --color never profile list 2>/dev/null | grep -q "$p"; then
      openshell --color never profile lint -f "$REPO_ROOT/openshell/profile/$p.yaml"
      openshell --color never profile import -f "$REPO_ROOT/openshell/profile/$p.yaml"
      log "imported profile $p"
    fi
  done

  # 3. providers (idempotent); minio creds come from .env and stay gateway-side
  if ! openshell --color never provider list 2>/dev/null | grep -q '^ollama'; then
    openshell --color never provider create --name ollama --type ollama-openai
  fi
  if ! openshell --color never provider list 2>/dev/null | grep -q '^minio'; then
    APP_USER="$(grep -E '^S3_APP_USER=' "$REPO_ROOT/.env" 2>/dev/null | cut -d= -f2-)"; APP_USER="${APP_USER:-crowd-counter}"
    APP_SECRET="$(grep -E '^S3_APP_SECRET=' "$REPO_ROOT/.env" 2>/dev/null | cut -d= -f2-)"; APP_SECRET="${APP_SECRET:-crowd-counter-dev-secret}"
    openshell --color never provider create --name minio --type minio-aistor-s3 \
      --credential AWS_ACCESS_KEY_ID="$APP_USER" --credential AWS_SECRET_ACCESS_KEY="$APP_SECRET"
    log "created provider minio (credential values held gateway-side only)"
  fi

  # 4. workload image (rootless podman)
  if ! podman image exists "$IMAGE"; then
    log "building $IMAGE with rootless podman..."
    podman build -f "$REPO_ROOT/agent/Dockerfile.sandbox" -t "$IMAGE" "$REPO_ROOT/agent"
  fi

  # 5. sandbox: ADK agent as the main process, providers + policy attached
  openshell --color never sandbox delete "$SANDBOX_NAME" >/dev/null 2>&1 || true
  AGENT_MODEL="${AGENT_MODEL:-qwen2.5vl:7b}"
  PHOTOS_BUCKET="$(grep -E '^S3_PHOTOS_BUCKET=' "$REPO_ROOT/.env" 2>/dev/null | cut -d= -f2-)"; PHOTOS_BUCKET="${PHOTOS_BUCKET:-snaps}"
  RESULTS_BUCKET="$(grep -E '^S3_RESULTS_BUCKET=' "$REPO_ROOT/.env" 2>/dev/null | cut -d= -f2-)"; RESULTS_BUCKET="${RESULTS_BUCKET:-analysis}"
  log "creating sandbox '$SANDBOX_NAME' (agent main process, providers ollama+minio, policy crowd-counter-agent)..."
  openshell --color never sandbox create --name "$SANDBOX_NAME" \
    --from "$IMAGE" \
    --provider ollama --provider minio \
    --policy "$REPO_ROOT/openshell/policy/crowd-counter-agent.yaml" \
    --env OLLAMA_BASE_URL="http://host.openshell.internal:11434" \
    --env OLLAMA_API_BASE="http://host.openshell.internal:11434" \
    --env S3_ENDPOINT="host.openshell.internal:9000" \
    --env S3_USE_TLS="false" \
    --env S3_PHOTOS_BUCKET="$PHOTOS_BUCKET" \
    --env S3_RESULTS_BUCKET="$RESULTS_BUCKET" \
    --env AGENT_MODEL="$AGENT_MODEL" \
    --env PORT="8000" \
    --restart-policy on-failure \
    --detach -- uvicorn smart_crowd_counter:app --host 0.0.0.0 --port 8000
  # Expose the agent through the gateway (persists via the systemd user unit,
  # unlike a CLI-session forward): the service URL is
  #   http://default--crowd-counter.openshell.localhost:17670/
  # reachable from Windows as localhost:17670 via WSL localhostForwarding.
  openshell --color never service expose "$SANDBOX_NAME" 8000 2>&1 | tail -2
  SVC_URL="http://default--${SANDBOX_NAME}.openshell.localhost:17670"
  log "sandbox created; waiting for agent health via $SVC_URL ..."
  for i in $(seq 1 60); do
    curl -sf -m 3 "$SVC_URL/health" >/dev/null 2>&1 && break
    sleep 2
  done
  log "agent health: $(curl -sf -m 3 "$SVC_URL/health" 2>/dev/null || echo 'NOT READY')"
  openshell --color never sandbox list 2>&1 | head -4
  log "done. Point the web app at the governed agent, e.g. AGENT_URL=$SVC_URL"
  log "(or keep AGENT_URL=http://localhost:8000 and run: openshell forward start --background 8000 $SANDBOX_NAME)"
  log "effective policy: openshell policy get $SANDBOX_NAME --full"
}

if grep -qi 'microsoft' /proc/sys/kernel/osrelease 2>/dev/null; then
  inner
else
  # Windows host side
  command -v wsl.exe >/dev/null 2>&1 || { echo "[dev-governed][error] wsl.exe not found" >&2; exit 1; }
  # ensure MinIO AIStor on :9000
  if ! curl -sf -m 3 -o /dev/null http://localhost:9000/minio/health/live 2>/dev/null; then
    log "starting MinIO AIStor on :9000..."
    ROOT_USER="$(grep -E '^S3_ACCESS_KEY=' "$REPO_ROOT/.env" 2>/dev/null | cut -d= -f2-)"; ROOT_USER="${ROOT_USER:-minioadmin}"
    ROOT_PASSWORD="$(grep -E '^S3_SECRET_KEY=' "$REPO_ROOT/.env" 2>/dev/null | cut -d= -f2-)"; ROOT_PASSWORD="${ROOT_PASSWORD:-minioadmin}"
    MINIO_ROOT_USER="$ROOT_USER" MINIO_ROOT_PASSWORD="$ROOT_PASSWORD" \
      nohup "$REPO_ROOT/.bin/minio.exe" server "$REPO_ROOT/.minio-data" \
      --license "$REPO_ROOT/minio.license" --console-address :9001 >/dev/null 2>&1 &
    for i in $(seq 1 30); do
      curl -sf -m 3 -o /dev/null http://localhost:9000/minio/health/live && break
      sleep 1
    done
  fi
  log "MinIO AIStor: $(curl -s -m 3 -o /dev/null -w '%{http_code}' http://localhost:9000/minio/health/live)"
  wsl.exe -l -q 2>/dev/null | tr -d '\0' | grep -qx "$PROJECT_NAME" \
    || { echo "[dev-governed][error] WSL2 distro '$PROJECT_NAME' not found - run: scripts/provision/provision.sh windows+wsl2" >&2; exit 1; }
  # accept both Windows (D:\...) and Git Bash (/d/...) repo paths
  case "$REPO_ROOT" in
    [A-Za-z]:[\\/]*) DRIVE="$(printf '%s' "$REPO_ROOT" | cut -c1 | tr 'A-Z' 'a-z')"; REST="${REPO_ROOT:2}" ;;
    /*)              DRIVE="$(printf '%s' "$REPO_ROOT" | cut -c2 | tr 'A-Z' 'a-z')"; REST="${REPO_ROOT:2}" ;;
    *) echo "[dev-governed][error] cannot map repo path to a WSL mount: $REPO_ROOT" >&2; exit 1 ;;
  esac
  # leading // defeats MSYS path mangling when wsl.exe (a Windows binary) gets the arg
  REPO_WSL="//mnt/$DRIVE${REST//\\//}"
  exec wsl.exe -d "$PROJECT_NAME" -- env "AGENT_MODEL=${AGENT_MODEL:-}" bash "$REPO_WSL/scripts/dev-governed.sh"
fi
