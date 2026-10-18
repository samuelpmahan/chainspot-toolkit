#!/usr/bin/env bash
set -euo pipefail
# REPO_ROOT PROTOCOL_JSON DESCRIPTOR_JSON VERIFIED_STAGED_SOURCE_JSON FRESH_OUTPUT_DIR
CALLER_DIR=$(cd "$(dirname "$0")" && pwd)
node "$CALLER_DIR/run-diagnostic.mjs" "$1" "$2" "$3" "$4" "$5"
