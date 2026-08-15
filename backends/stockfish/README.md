# @tactica/stockfish

The Stockfish chess engine wrapped in a small HTTP API, packaged as a Docker container. Used by
`tactica-analysis` to evaluate positions when looking for blunders.

Stockfish itself speaks only [UCI](https://backscattering.de/chess/uci/) over stdin/stdout, so this
service exists to translate that into something a normal HTTP client can call. All UCI knowledge in
the repo lives here.

## Running it

`pnpm serve:backend` from the repo root starts this alongside the other backends (it's registered as
a turbo sidecar of `tactica-core`), on **port 3503**. On its own:

```bash
pnpm --filter @tactica/stockfish serve
```

That builds the TypeScript, builds the image, and runs the container in the foreground; Ctrl+C tears
it down.

## API

### `GET /health`

```json
{ "status": "ok", "engineRunning": true }
```

### `POST /evaluate`

```jsonc
// request — movetimeMs and multiPv are optional
{ "fen": "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1", "movetimeMs": 200, "multiPv": 3 }
```

```jsonc
// response
{
  "bestMoveUci": "a1a8", // null for an already-terminal position
  "lines": [
    // best-first; one per requested PV rank
    { "multipv": 1, "depth": 24, "pvUci": ["a1a8"], "mate": 1 },
  ],
}
```

**Scores are side-to-move-relative**, exactly as UCI reports them: `cp` is centipawns and `mate` is
moves-to-mate (negative meaning the side to move is getting mated), both from the perspective of
whoever is to move in the FEN you sent. Normalizing to a particular player's perspective is the
caller's job — see the blunder-detection notes in `docs/tech-designs/BLUNDER_PUZZLES_MVP.md`.

Errors come back as `{ "message": string, "code": string }` with `InputValidationError` (400),
`EngineTimeoutError` (504) or `EngineError` (500).

## Configuration

Every value has a working default, so no env vars are required.

| Var                           | Default     | Purpose                                           |
| ----------------------------- | ----------- | ------------------------------------------------- |
| `PORT` / `HOST_NAME`          | 3503, all   | Where the HTTP server listens                     |
| `STOCKFISH_PATH`              | `stockfish` | Engine binary, resolved from `PATH`               |
| `ENGINE_THREADS`              | 1           | UCI `Threads` — keep low so N containers behave   |
| `ENGINE_HASH`                 | 128         | UCI `Hash` in MB                                  |
| `ENGINE_SEARCH_GRACE_MS`      | 10000       | Slack past `movetimeMs` before the engine is hung |
| `ENGINE_HANDSHAKE_TIMEOUT_MS` | 10000       | Budget for `uciok`/`readyok` at startup           |
| `ENGINE_SHUTDOWN_TIMEOUT_MS`  | 2000        | Graceful `quit` budget before SIGKILL             |

Per-request defaults and limits (`movetimeMs`, `multiPv`) live in the contract's Zod schema rather
than in env vars — they're part of the API, and callers that want different search budgets pass them
per request.

## Testing

```bash
pnpm --filter @tactica/stockfish test        # UCI parsing (no engine, no Docker)
pnpm --filter @tactica/stockfish test:smoke  # builds the image, runs it, asserts against a real engine
```

Request/response validation is covered by `@tactica/stockfish-contract`'s own tests. The smoke test
runs on an isolated port (3599) under its own container name, so it won't disturb a container you
already have running for development.

## How it works

Standard stack, same as every other backend: Fastify + ts-rest against a shared contract, with
`@tactica/logging` and the correlation-ID and error-handling plugins wired up by
`InternalFastifyAppBuilder` (the SuperTokens-free sibling of `FastifyAppBuilder` — nothing in a
browser talks to this service). That means an `x-correlation-id` from `tactica-analysis` shows up on
every log line this service emits, and thrown errors serialize to the same `{ message, code }` DTO
as everywhere else.

Being the one service that ships **inside a container we build**, it has a packaging problem the
others don't: `pnpm deploy` symlinks workspace packages back to their source directories, which
doesn't survive a `COPY`. So the service is bundled into a single self-contained file with esbuild and
that one file is the whole image payload. See the Dockerfile for the two non-obvious bundler flags
(`--format=cjs` and `--keep-names`) and what breaks without them.

One Stockfish process is started at boot and kept warm — the UCI handshake and NNUE load cost far
more than a short search. Since a single engine can only search one position at a time, requests are
serialized through a promise queue; treat this as a single-slot resource and scale with replicas
rather than concurrent calls. A search that blows past `movetimeMs + ENGINE_SEARCH_GRACE_MS` is
treated as wedged: the process is killed and the next request starts a fresh one. Crashes are handled
the same lazy way, which avoids a restart loop when the binary itself is broken.
