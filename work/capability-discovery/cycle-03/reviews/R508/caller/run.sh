#!/usr/bin/env bash
set -euo pipefail
# Arguments: repository root, frozen D3 protocol, original Lenard PNG, fresh output directory.
REPO_ROOT=$(realpath "$1")
PROTOCOL_PATH=$(realpath "$2")
SOURCE_PNG=$(realpath "$3")
TRIAL_OUTPUT=$(realpath -m "$4")
CALLER_DIR=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$TRIAL_OUTPUT"
python "$REPO_ROOT/experiments/capability-discovery/source-pixels/stage-png.py" --source "$SOURCE_PNG" --expected-sha256 27ad16bcf2c075316048ec39bc5035e0ebbe260bde32140466a3010f15d75834 --image-id Lenard-full --frame Lenard-full.original-source-pixel-centers --out "$TRIAL_OUTPUT/staged-original-source.json"
node "$CALLER_DIR/run-trial.mjs" "$REPO_ROOT" "$PROTOCOL_PATH" "$TRIAL_OUTPUT/staged-original-source.json" "$TRIAL_OUTPUT"
