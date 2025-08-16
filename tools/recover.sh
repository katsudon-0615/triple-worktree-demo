#!/usr/bin/env bash
set -euo pipefail

# プロジェクトルートでの実行を想定
ROOT_DIR="$(cd "$(dirname "$0")"/.. && pwd)"
cd "$ROOT_DIR"

LOCK_FILE=".lock_runtime"
LOG_DIR="logs/local"
LOG_FILE="$LOG_DIR/recover.ndjson"

mkdir -p "$LOG_DIR"

now_epoch() {
  date +%s
}

file_mtime_epoch() {
  # GNU stat と BSD stat 両対応
  if stat --version >/dev/null 2>&1; then
    stat -c %Y "$1"
  else
    stat -f %m "$1"
  fi
}

touch_lock() {
  touch "$LOCK_FILE"
}

append_log() {
  local status="$1" # ok | recover
  local reason="$2" # string
  local ts
  ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  local epoch
  epoch="$(now_epoch)"
  local relcwd
  relcwd="$(pwd)"
  # NDJSON 1 行
  printf '{"ts":"%s","epoch":%s,"status":"%s","reason":"%s","cwd":"%s"}\n' \
    "$ts" "$epoch" "$status" "$reason" "$relcwd" >> "$LOG_FILE"
}

NEEDS_RECOVER=false
REASON=""

if [ -f "$LOCK_FILE" ]; then
  last_mtime="$(file_mtime_epoch "$LOCK_FILE")"
  now="$(now_epoch)"
  elapsed=$((now - last_mtime))
  if [ "$elapsed" -gt 180 ]; then
    NEEDS_RECOVER=true
    REASON="lock_elapsed_${elapsed}s_gt_180s"
  else
    REASON="lock_elapsed_${elapsed}s_le_180s"
  fi
else
  REASON="no_lock_file"
fi

if [ "$NEEDS_RECOVER" = true ]; then
  # 復旧動作（未コミット変更と未追跡を破棄、HEAD を強制）
  git restore . || true
  git clean -fd || true
  git reset --hard || true
  append_log "recover" "$REASON"
else
  append_log "ok" "$REASON"
fi

# 次回チェックに向けてロック更新
touch_lock

exit 0


