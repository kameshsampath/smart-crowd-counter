#!/usr/bin/env bash
# deny-evidence.sh — capture proof that the governed sandbox blocks:
#   1. a non-allowlisted network host
#   2. a forbidden filesystem path (Landlock allowlist + protected /.openshell)
#   3. an out-of-scope S3 bucket (IAM-scoped service account)
# Exits 0 ONLY when all three denies fire. OCSF/log lines are captured by the
# wrapper mode below into dist/deny-evidence.log.
#
# Run from the Windows host:  scripts/deny-evidence.sh
# (wrapper mode re-execs into the sandbox via `openshell sandbox exec ... bash -s`)
set -u

if [ "${OPENSHELL_SANDBOX:-}" = "1" ]; then
  # ---------------- in-sandbox probe mode ----------------
  rc=0
  echo "== probe 1: non-allowlisted host (example.com) =="
  if curl -s -m 8 -o /dev/null https://example.com 2>/dev/null; then
    echo "FAIL: example.com was reachable"; rc=1
  else
    echo "OK: example.com blocked (curl exit $?)"
  fi
  echo "== probe 2: forbidden path read (/root, not in filesystem_policy) =="
  if out="$(cat /root/.bashrc 2>&1)"; then
    echo "FAIL: read /root/.bashrc"; rc=1
  else
    echo "OK: /root/.bashrc read blocked: ${out:-<denied>}"
  fi
  echo "== probe 2b: protected /.openshell =="
  if ls /.openshell >/dev/null 2>&1; then
    echo "FAIL: /.openshell visible"; rc=1
  else
    echo "OK: /.openshell blocked"
  fi
  echo "== probe 3: out-of-scope bucket (private-logs, outside IAM policy) =="
  if /sandbox/.venv/bin/python -c "
import os, sys
from minio import Minio
from minio.error import S3Error
c = Minio(os.environ['S3_ENDPOINT'], access_key=os.environ['AWS_ACCESS_KEY_ID'], secret_key=os.environ['AWS_SECRET_ACCESS_KEY'], secure=False)
try:
    list(c.list_objects('private-logs'))
    print('FAIL: private-logs accessible'); sys.exit(1)
except S3Error as e:
    if e.code == 'AccessDenied':
        print('OK: private-logs denied by IAM: S3Error code=%s (HTTP 403)' % e.code); sys.exit(0)
    print('FAIL: unexpected S3Error', e.code); sys.exit(1)
except Exception as e:
    print('FAIL: unexpected', type(e).__name__, str(e)[:100]); sys.exit(1)
"; then :; else echo "FAIL: private-logs not denied"; rc=1; fi
  if [ "$rc" -eq 0 ]; then echo "ALL DENIES FIRED"; else echo "SOME PROBES DID NOT DENY"; fi
  exit "$rc"
fi

# ---------------- wrapper mode (runs in the WSL2 distro) ----------------
SANDBOX="${SANDBOX:-crowd-counter}"
OUT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/dist"
mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/deny-evidence.log"
{
  echo "# deny evidence captured $(date -u +%FT%TZ) (sandbox: $SANDBOX)"
  echo "## probe output (inside sandbox)"
  openshell --color never sandbox exec --name "$SANDBOX" -- bash -s < "${BASH_SOURCE[0]}"
  prc=$?
  echo
  echo "## OCSF / supervisor log lines (denies)"
  openshell --color never logs "$SANDBOX" 2>/dev/null | grep -iE "DENIED|denied|mismatch|unavailable" | tail -20
  echo
  echo "probe exit code: $prc"
} > "$OUT" 2>&1
cat "$OUT"
exit "$(grep -oE 'probe exit code: [0-9]+' "$OUT" | tail -1 | cut -d' ' -f4)"
