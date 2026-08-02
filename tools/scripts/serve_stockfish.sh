#!/usr/bin/env bash

set -eo pipefail

container_name=tactica_stockfish
image_name=tactica-stockfish:local
host_port="${STOCKFISH_PORT:-3503}"
repo_root="$(git rev-parse --show-toplevel)"

cleanup() {
  docker rm -f "$container_name" >/dev/null 2>&1 || true
}

# Force-remove the container on any exit/signal so a single Ctrl+C tears it down
# immediately instead of waiting for the container to shut down gracefully.
trap cleanup EXIT INT TERM

# Remove any leftover container from a previous run before starting a new one.
cleanup

"$repo_root/tools/scripts/build_stockfish_image.sh" "$image_name"

# --init gives the container a real init process to reap the Stockfish child cleanly
docker run --name "$container_name" \
  --init \
  -e ENGINE_THREADS="${ENGINE_THREADS:-1}" \
  -e ENGINE_HASH="${ENGINE_HASH:-128}" \
  -p "$host_port:3503" \
  "$image_name" &

# Wait on the backgrounded container so an incoming signal interrupts the wait,
# runs the trap (force-killing the container), and lets this script exit fast.
wait $!
