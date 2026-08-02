#!/usr/bin/env bash

set -eo pipefail

# Builds the stockfish service image. Expects the TypeScript to have been compiled already — the
# Dockerfile copies `dist` rather than building inside the image (see the comment there).

image_name="${1:-tactica-stockfish:local}"
repo_root="$(git rev-parse --show-toplevel)"
service_dir="$repo_root/backends/stockfish"

if [ ! -d "$service_dir/dist" ]; then
    echo >&2 "No compiled output at $service_dir/dist — run 'pnpm --filter @tactica/stockfish build' first"
    exit 1
fi

docker build -t "$image_name" "$service_dir"
