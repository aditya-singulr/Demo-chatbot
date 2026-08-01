#!/usr/bin/env bash
# Run the Next.js frontend and all three Python backends together.
#   8000 -> main.py               (no guardrail)
#   8001 -> main_guardrail.py     (Singulr SDK guardrail)
#   8002 -> main_guardrail_litellm.py (LiteLLM proxy guardrail)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY_DIR="$ROOT_DIR/python-chatbot"
VENV_DIR="$PY_DIR/.venv"

if [ ! -d "$VENV_DIR" ]; then
  echo "Creating Python virtualenv at $VENV_DIR"
  python3 -m venv "$VENV_DIR"
  "$VENV_DIR/bin/pip" install --upgrade pip >/dev/null
  "$VENV_DIR/bin/pip" install -r "$PY_DIR/requirements.txt"
fi

if [ ! -d "$ROOT_DIR/node_modules" ]; then
  echo "Installing frontend dependencies"
  (cd "$ROOT_DIR" && npm install)
fi

PIDS=()

cleanup() {
  echo ""
  echo "Shutting down..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

run_backend() {
  local name="$1"
  local script="$2"
  shift 2
  echo "Starting $name..."
  ("$VENV_DIR/bin/python" "$PY_DIR/$script" "$@") &
  PIDS+=($!)
}

run_backend "backend (no guardrail, :8000)" main.py --env-file .env
run_backend "backend (guardrail, :8001)" main_guardrail.py --env-file .env
run_backend "backend (guardrail litellm, :8002)" main_guardrail_litellm.py --env-file .env

echo "Starting frontend (:3000)..."
(node "$ROOT_DIR/scripts/start-ui.mjs" --env-file .env) &
PIDS+=($!)

wait
