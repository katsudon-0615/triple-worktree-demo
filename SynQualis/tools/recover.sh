#!/bin/bash
set -e

echo "Checking runtime..."
if [ -f .lock_runtime ] && [ $(($(date +%s) - $(stat -c %Y .lock_runtime))) -gt 180 ]; then
  echo "Timeout exceeded, recovering..."
  git restore .
  git clean -fd
  git reset --hard
fi

touch .lock_runtime
