#!/usr/bin/env bash

set -eo pipefail

container_name=tactica_stockfish
image_name=tactica-stockfish:local
host_port="${STOCKFISH_PORT:-3503}"
repo_root="$(git rev-parse --show-toplevel)"

# Remove any container left over from a previous run (e.g. one that outlived a SIGKILL).
docker rm -f "$container_name" >/dev/null 2>&1 || true

"$repo_root/tools/scripts/build_stockfish_image.sh" "$image_name"

# `exec` so this shell is *replaced* by `docker run`, rather than backgrounding the container and
# waiting on it behind a trap. Every extra process between turbo and the container is one more place
# a shutdown signal can be swallowed, and that is exactly what used to happen: Ctrl+C left the
# container running and streaming healthcheck logs until a second Ctrl+C.
#
# With exec, turbo's signal lands directly on `docker run`, which proxies it into the container;
# --init's tini forwards it to node, which closes the server and quits the engine. --rm then removes
# the container as it exits, so there is no cleanup trap to miss.
exec docker run --name "$container_name" \
  --rm \
  --init \
  -e ENGINE_THREADS="${ENGINE_THREADS:-1}" \
  -e ENGINE_HASH="${ENGINE_HASH:-128}" \
  -p "$host_port:3503" \
  "$image_name"
