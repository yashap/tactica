#!/usr/bin/env bash

set -eo pipefail

# Builds the stockfish image, runs it, and asserts against the real engine over HTTP.
# Deliberately uses its own container name and port so it never disturbs a container already
# running for development on 3503.

container_name=tactica_stockfish_smoke
image_name=tactica-stockfish:smoke
host_port="${STOCKFISH_SMOKE_PORT:-3599}"
repo_root="$(git rev-parse --show-toplevel)"

cleanup() {
  docker rm -f "$container_name" >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM
cleanup

"$repo_root/tools/scripts/build_stockfish_image.sh" "$image_name"

docker run -d --name "$container_name" --init -p "$host_port:3503" "$image_name" >/dev/null

ready=''
for _ in $(seq 1 60); do
    if curl -sf "http://localhost:$host_port/health" >/dev/null 2>&1; then
        ready=1
        break
    fi
    # Fail fast if the container died rather than waiting out the whole loop
    if [ -z "$(docker ps -q -f "name=$container_name")" ]; then
        break
    fi
    sleep 1
done

if [ "$ready" != '1' ]; then
    echo >&2 "stockfish container never became healthy — logs follow:"
    docker logs "$container_name" >&2 2>&1 || true
    exit 1
fi

if ! STOCKFISH_URL="http://localhost:$host_port" node "$repo_root/backends/stockfish/dist/smokeTest.js"; then
    echo >&2 "smoke test failed — container logs follow:"
    docker logs "$container_name" >&2 2>&1 || true
    exit 1
fi
