# The Stockfish engine behind a small HTTP API.
#
# Stockfish is installed from Debian's repositories rather than downloading an official release
# binary: Debian builds it for both arm64 and amd64, so the same Dockerfile works on an Apple Silicon
# dev machine and on x86 CI with no per-architecture download logic. The trade-off is a generic
# build instead of a CPU-optimized one (official releases ship AVX2/BMI2 variants) — fine here,
# since analysis runs at a fixed movetime rather than a fixed depth.
#
# The wrapper is compiled on the host (`pnpm --filter @tactica/stockfish build`) and its `dist` is
# copied in. It has zero runtime dependencies — only Node builtins — so the image needs no package
# install step, and its tsconfig extends a workspace package that wouldn't resolve inside a build
# stage anyway.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends stockfish \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# `type: module` lives here, and Node needs it to load dist/*.js as ESM
COPY package.json ./
COPY dist ./dist

ENV PORT=3503
ENV HOST_NAME=0.0.0.0
# Debian's package installs to /usr/games, which is not on the default PATH
ENV STOCKFISH_PATH=/usr/games/stockfish
EXPOSE 3503

USER node

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3503)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
