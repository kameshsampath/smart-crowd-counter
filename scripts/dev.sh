#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# 1. Load .env (creating from .env.example if needed)
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "[dev] Created .env from .env.example"
fi
set -a
# shellcheck disable=SC1091
source <(tr -d '\r' < .env)
set +a

ROOT_USER="${S3_ACCESS_KEY:-minioadmin}"
ROOT_PASSWORD="${S3_SECRET_KEY:-minioadmin}"
APP_USER="${S3_APP_USER:-crowd-counter}"
APP_SECRET="${S3_APP_SECRET:-crowd-counter-dev-secret}"
PHOTOS_BUCKET="${S3_PHOTOS_BUCKET:-snaps}"
RESULTS_BUCKET="${S3_RESULTS_BUCKET:-analysis}"
AGENT_MODEL="${AGENT_MODEL:-qwen2.5vl:7b}"
OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://localhost:11434}"

if [[ ! -f minio.license ]]; then
  echo "Error: Missing minio.license in $REPO_ROOT." >&2
  echo "Download a free single-node license at https://min.io/pricing and save it as minio.license." >&2
  exit 1
fi

# 2. Ensure minio and mc binaries are available
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
esac

BIN_DIR="$REPO_ROOT/.bin"
mkdir -p "$BIN_DIR"
export PATH="$BIN_DIR:$PATH"

if ! command -v minio >/dev/null 2>&1; then
  echo "[dev] Downloading MinIO AIStor ($OS-$ARCH)..."
  curl -fsSL "https://dl.min.io/aistor/minio/release/${OS}-${ARCH}/minio" -o "$BIN_DIR/minio"
  chmod +x "$BIN_DIR/minio"
fi

if ! command -v mc >/dev/null 2>&1; then
  echo "[dev] Downloading MinIO Client ($OS-$ARCH)..."
  curl -fsSL "https://dl.min.io/aistor/mc/release/${OS}-${ARCH}/mc" -o "$BIN_DIR/mc"
  chmod +x "$BIN_DIR/mc"
fi

MINIO_PID=""
AGENT_PID=""
cleanup() {
  echo ""
  echo "[dev] Stopping background services..."
  [[ -n "$AGENT_PID" ]] && kill "$AGENT_PID" 2>/dev/null || true
  [[ -n "$MINIO_PID" ]] && kill "$MINIO_PID" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

# 3. Start MinIO AIStor
export MINIO_ROOT_USER="$ROOT_USER"
export MINIO_ROOT_PASSWORD="$ROOT_PASSWORD"
echo "[dev] Starting MinIO AIStor on :9000 (console :9001)..."
minio server "$REPO_ROOT/.minio-data" --license "$REPO_ROOT/minio.license" --console-address ":9001" &
MINIO_PID=$!

# 4. Wait for AIStor and provision buckets + scoped service user
until mc alias set local http://localhost:9000 "$ROOT_USER" "$ROOT_PASSWORD" >/dev/null 2>&1 && mc ready local >/dev/null 2>&1; do
  sleep 1
done

mc mb --ignore-existing "local/$PHOTOS_BUCKET" "local/$RESULTS_BUCKET" >/dev/null
POLICY_FILE="$(mktemp)"
cat > "$POLICY_FILE" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:*"],
      "Resource": [
        "arn:aws:s3:::${PHOTOS_BUCKET}",
        "arn:aws:s3:::${PHOTOS_BUCKET}/*",
        "arn:aws:s3:::${RESULTS_BUCKET}",
        "arn:aws:s3:::${RESULTS_BUCKET}/*"
      ]
    }
  ]
}
EOF
mc admin policy create local crowd-counter "$POLICY_FILE" >/dev/null 2>&1 || true
rm -f "$POLICY_FILE"
mc admin user remove local "$APP_USER" >/dev/null 2>&1 || true
mc admin user add local "$APP_USER" "$APP_SECRET" >/dev/null
mc admin policy attach local crowd-counter --user "$APP_USER" >/dev/null
echo "[dev] Buckets ($PHOTOS_BUCKET, $RESULTS_BUCKET) and service user ($APP_USER) ready."

# 5. Low-RAM Ollama defaults & scoped S3 credentials for both agent and web app
export OLLAMA_MAX_LOADED_MODELS="${OLLAMA_MAX_LOADED_MODELS:-1}"
export OLLAMA_KEEP_ALIVE="${OLLAMA_KEEP_ALIVE:-2m}"
export OLLAMA_BASE_URL
export OLLAMA_API_BASE="$OLLAMA_BASE_URL"
export AGENT_MODEL
export S3_ACCESS_KEY="$APP_USER"
export S3_SECRET_KEY="$APP_SECRET"

echo "[dev] Syncing and starting Google ADK agent ($AGENT_MODEL) on :8000..."
(
  cd "$REPO_ROOT/agent"
  uv sync
  exec uv run smart-crowd-counter-agent
) &
AGENT_PID=$!

# 6. Start Next.js web app
if [[ ! -d node_modules ]]; then
  echo "[dev] Installing npm dependencies..."
  npm ci
fi

echo "[dev] Starting Next.js on http://localhost:3000 (Ctrl+C to stop all services)..."
npm run dev
