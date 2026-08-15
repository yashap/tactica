#!/usr/bin/env bash

set -eo pipefail

# Builds the stockfish service image. Expects the service to have been bundled already — the
# Dockerfile copies the prebuilt bundle rather than building inside the image (see the comment there).

image_name="${1:-tactica-stockfish:local}"
repo_root="$(git rev-parse --show-toplevel)"
service_dir="$repo_root/backends/stockfish"

if [ ! -f "$service_dir/dist/server.cjs" ]; then
    echo >&2 "No bundle at $service_dir/dist/server.cjs — run 'pnpm --filter @tactica/stockfish build' first"
    exit 1
fi

docker build -t "$image_name" "$service_dir"
