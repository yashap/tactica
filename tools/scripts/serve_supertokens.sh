#!/usr/bin/env bash

set -eo pipefail

container_name=supertokens

cleanup() {
  docker rm -f "$container_name" >/dev/null 2>&1 || true
}

# Force-remove the container on any exit/signal so a single Ctrl+C tears it down
# immediately instead of waiting for the container to shut down gracefully.
trap cleanup EXIT INT TERM

# Remove any leftover container from a previous run before starting a new one.
cleanup

docker run --name "$container_name" \
  --add-host=host.docker.internal:host-gateway \
  -e POSTGRESQL_USER="supertokens" \
  -e POSTGRESQL_PASSWORD="supertokens_password" \
  -e POSTGRESQL_HOST="host.docker.internal" \
  -e POSTGRESQL_PORT="5440" \
  -e POSTGRESQL_DATABASE_NAME="supertokens" \
  -e LOG_LEVEL="${LOG_LEVEL:-WARN}" \
  -p 3567:3567 \
  registry.supertokens.io/supertokens/supertokens-postgresql:11.0.4 &

# Wait on the backgrounded container so an incoming signal interrupts the wait,
# runs the trap (force-killing the container), and lets this script exit fast.
wait $!
