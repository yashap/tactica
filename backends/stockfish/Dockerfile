# The Stockfish engine behind an HTTP API.
#
# Stockfish is installed from Debian's repositories rather than downloading an official release
# binary: Debian builds it for both arm64 and amd64, so the same Dockerfile works on an Apple Silicon
# dev machine and on x86 CI with no per-architecture download logic. The trade-off is a generic
# build instead of a CPU-optimized one (official releases ship AVX2/BMI2 variants) — fine here,
# since analysis runs at a fixed movetime rather than a fixed depth.
#
# The service itself is built on the host into a single self-contained file
# (`pnpm --filter @tactica/stockfish build`) and copied in. Bundling, rather than shipping
# node_modules, is what lets this service use the same Fastify + @tactica/* stack as every other
# backend without dragging a pnpm workspace into the image: `pnpm deploy` symlinks workspace packages
# back to their source directories, which doesn't survive a COPY. Two non-obvious bundler settings:
#
#   --format=cjs    winston's dependency chain (logform -> @colors/colors) uses dynamic require(),
#                   which an ESM bundle cannot do — it fails at startup with
#                   "Dynamic require of \"util\" is not supported".
#   --keep-names    ServerError derives its `code` from `this.constructor.name`. Without this the
#                   bundler renames classes and every error DTO comes back as `_NotFoundError`,
#                   which `buildServerErrorFromDto` on the client side then fails to match.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends stockfish \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# A single file with no dependencies, so there is nothing to install here
COPY dist/server.cjs ./server.cjs

ENV PORT=3503
ENV HOST_NAME=0.0.0.0
# Debian's package installs to /usr/games, which is not on the default PATH
ENV STOCKFISH_PATH=/usr/games/stockfish
EXPOSE 3503

USER node

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3503)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.cjs"]
