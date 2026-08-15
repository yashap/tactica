# Chess.com Import → Stockfish Blunder Puzzles → AI Coach

## Status

| Milestone                                                  | State          |
| ---------------------------------------------------------- | -------------- |
| M1 — Link chess.com account + raw game import              | ✅ Implemented |
| M2 — stockfish service (Dockerized engine API)             | ✅ Implemented |
| M3 — tactica-analysis service (blunder detection pipeline) | ✅ Implemented |
| M4 — Pipeline integration → puzzles appear                 | Not started    |
| M5 — Puzzle-solving UI                                     | Not started    |
| M6 — tactica-coach service + explanations UI               | Not started    |
| M7 — Lichess source                                        | Not started    |

This document is the source of truth for the feature. Update it as milestones land or as decisions change during implementation.

## Context

Tactica is an AI chess coach app, currently a well-scaffolded skeleton: working SuperTokens auth, a hotseat chess board (chess.js, client-only), and a placeholder `Todo` domain as the only persisted entity. This feature is the first real product loop: **pull a user's games from chess.com → find their blunders with server-side Stockfish → present each blunder as a "find the best move" puzzle → explain it with a Claude-powered coach**. It introduces the repo's first outbound API integration, first background jobs, first additional backend services, and first LLM usage — so it deliberately establishes the patterns for all of those.

### Decisions

- **Multi-user deployed app** (real accounts; per-user scoping via `userId` columns, per the established repository pattern)
- **Service decomposition**: four services — tactica-core (API/domain), **tactica-analysis** (game analysis, owns its own job queue + logical DB), **stockfish** (engine in a Docker container behind an HTTP API), **tactica-coach** (stateless LLM service). All logical DBs live in the existing shared Postgres containers (dev :5440 / test :5441)
- **pg-boss** for job queues (tactica-core and tactica-analysis, each in its own logical DB)
- **Coach v1 = one-shot explanation** after solving/failing; grounding designed so interactive chat is additive (coach can call tactica-analysis for ad-hoc evals later). Default model **`claude-opus-5`** (`COACH_MODEL` env)
- **Secrets**: committed `.env` (non-secrets) + gitignored `.env.secrets` populated via **`pnpm get-secrets`** (1Password `op inject` from a committed `.env.secrets.tpl`); coach fails fast with an actionable error if the secret is missing
- **Game import abstracted** behind a `GameSource` interface: chess.com first, lichess fast-follow
- **First sync imports recent 3 months** (newest first); "Sync now" pulls new games; full backfill deferred
- **Puzzles get a real promotion picker** (no auto-queen in puzzle mode; hotseat play screen unchanged for now)
- **Todo is example code**: once the first real Drizzle domain lands (M1), delete the todo contract/routes/repo/specs/client surface and write a migration dropping the `Todo` table

### Key facts (researched July 2026)

- chess.com's API (`api.chess.com/pub`) is **public, no auth** — user just provides their username. Endpoints: `/pub/player/{u}` (validate), `/pub/player/{u}/games/archives`, `/pub/player/{u}/games/{YYYY}/{MM}` (JSON with embedded PGN per game). **Serial requests only** (parallel → 429), set a custom `User-Agent`, honor `Retry-After` backoff. Data refreshes ~12–24h.
- **Stockfish has no REST API and no official Docker image** — it speaks UCI over stdin/stdout only; official releases are precompiled binaries. Community HTTP wrappers are all unmaintained hobby repos (several AGPL). So we build a tiny image ourselves: official binary + a ~100-line Node HTTP wrapper we author (warm engine process, request queue). Engine-as-subprocess is the standard GPL-safe pattern (lichess does the same).
- Blunder detection (lichess-style, implemented in-house): eval every position, convert cp → win-probability via logistic mapping `winP = 1/(1 + e^(-0.00368208·cp))`, threshold the **drop in win-prob** (≥0.10 inaccuracy / ≥0.20 mistake / ≥0.30 blunder). Win-prob avoids flagging cosmetic cp swings in already-decided positions. UCI `score cp` is from the **side to move** — must normalize to the user's perspective.

## Architecture

```
frontend (Expo)
   │ ts-rest
   ▼
tactica-core :3501 ────ts-rest────▶ tactica-analysis :3502 ──HTTP──▶ stockfish :3503 (Docker)
 │ tactica_core DB                   │ tactica_analysis DB            official binary +
 │ pg-boss: import-games,            │ pg-boss: run-analysis          Node UCI↔HTTP wrapper
 │          analyze-game             │
 └────ts-rest────▶ tactica-coach :3504 (stateless) ──▶ Anthropic API
                    (future chat: coach ──▶ tactica-analysis)
```

- **tactica-core** owns all user-facing domain data (`GameAccount`, `Game`, `Puzzle`, `PuzzleAttempt`, `CoachExplanation`) and orchestration. pg-boss jobs: `import-games` (fetch from chess.com), `analyze-game` (submit PGN to tactica-analysis, poll until done, persist puzzles).
- **tactica-analysis**: new Fastify service following tactica-core patterns (`FastifyAppBuilder`, single `config.ts`, Drizzle + own migrations, logical DB `tactica_analysis`). Async API: `POST /tactica-analysis/analyses {pgn, playerColor, settings?}` → `201 {id, status}` (enqueues pg-boss `run-analysis`); `GET /tactica-analysis/analyses/:id` → `{id, status, result?, error?}` where `result = {moveEvals, blunders: [{ply, fen, playedMoveUci/San, bestMoveUci/San, acceptableMovesUci, engineLines, evalBefore/After, winProbBefore/After, severity}]}`. One `Analysis` table (request/result jsonb, status, error) + pg-boss schema. Calls the stockfish service per position (local HTTP, negligible overhead vs. 80ms+ movetimes).
- **stockfish**: `backends/stockfish` — Dockerfile (official Stockfish binary + small Node/TS wrapper server we author) + run scripts following the `backends/supertokens` pattern, started by the standard `pnpm serve:backend`. API: `POST /evaluate {fen, movetimeMs, multiPv}` → `{bestMoveUci, lines: [{pvUci: string[], cp?, mate?}]}`. Wrapper keeps one warm engine (UCI handshake once), serializes requests through a queue, respawns on crash. `ENGINE_THREADS` / `ENGINE_HASH` envs. All UCI protocol knowledge lives here and only here.
- **tactica-coach**: stateless Fastify service, no DB. `POST /tactica-coach/explanations {grounding}` → `{content, model}`. Owns the system prompt + Anthropic call (`@anthropic-ai/sdk`, `claude-opus-5`, `max_tokens: 1024`, non-streaming, defensive handling of `stop_reason === 'refusal'`/`max_tokens`). tactica-core builds grounding from its DB, calls coach, persists the cache. **Fails fast at startup** if `ANTHROPIC_API_KEY` is unset, with error text pointing at `pnpm get-secrets`; tactica-core maps coach-unreachable/failed to a typed 503 `CoachDisabled` so the rest of the stack (and CI, which has no 1Password) works without it.
- **Internal auth**: tactica-analysis and tactica-coach check an `X-Internal-Api-Key` preHandler (`INTERNAL_API_KEY` env, dev default `dev_internal_key` — a committed non-secret). No SuperTokens on internal services.
- **Analysis algorithm** (two-pass per game in tactica-analysis): Pass 1 — replay PGN with chess.js, single-PV `movetimeMs: 80` per position, flag user moves by win-prob drop (mistake+ become puzzles). Pass 2 — flagged positions get `multiPv: 3`, `movetimeMs: 1000`; best move = PV1, `acceptableMovesUci` = PVs within 0.05 win-prob of best; store top-3 lines (SAN+UCI+eval — the coach grounding). Movetimes env-tunable (`ANALYSIS_SCAN_MOVETIME_MS`, `ANALYSIS_DEEP_MOVETIME_MS`) — e2e/CI uses ~10ms. Budget ≈ 8–10s/game at defaults.
- **pg-boss usage**: one boss instance per service against its own DB; workers registered at startup, gated by `WORKER_ENABLED` env (default `'true'`, **`'false'` in test setup** — tests invoke handler functions directly). `retryLimit: 3`, exponential backoff.

## Secrets & env files

- **`.env` (committed)**: non-secret env vars worth setting explicitly (service URLs, `INTERNAL_API_KEY` dev default, etc.). In-code dev defaults remain the primary mechanism; this file overrides/documents.
- **`.env.secrets` (gitignored)**: real secrets (`ANTHROPIC_API_KEY`). Never committed.
- **`.env.secrets.tpl` (committed)**: 1Password references (`ANTHROPIC_API_KEY=op://<vault>/<item>/<field>`).
- **`pnpm get-secrets`** (root script): `op inject -i .env.secrets.tpl -o .env.secrets`. Requires `op` CLI signed in; README documents the one-time setup.
- **Loading**: services load both files at startup (Node 22 `--env-file` flags in the serve scripts, or equivalent under tsx), `.env.secrets` if-exists. `.gitignore` updated (currently ignores `.env*` wholesale; must allow `.env` and `.env.secrets.tpl`).
- CI/e2e: no secrets; coach is simply absent (disabled path is asserted).

## Data model (tactica-core, all tables spread `standardFields` + `userId uuid` indexed)

- **`GameAccount`**: `source` enum(`chesscom`|`lichess`), `externalUsername`, `syncCheckpoint text` nullable (chess.com: last fully-imported `YYYY-MM`; lichess later: timestamp), `lastSyncedAt`. Unique `(userId, source)`.
- **`Game`**: `gameAccountId` FK, `source` + `externalGameId` (chess.com game `uuid`, fallback `url`) with **unique `(userId, source, externalGameId)`** → idempotent re-imports via `onConflictDoNothing`; `pgn` text (source of truth); parsed headers for list UI (`playedAt`, `timeControl`, `userColor`, `opponentUsername`, `result`); `analysisStatus` enum(`pending`|`analyzing`|`analyzed`|`failed`); `moveEvals` jsonb nullable.

**Colors**: our domain type is `ChessColor` = `'white' | 'black'` (contract enum + Postgres `ChessColor` enum) — spelled out for readability in the DB and API. chess.js's own `'w' | 'b'` convention stays confined to the board/engine code that talks to chess.js; convert at that boundary.

- **`Puzzle`**: `gameId` FK, `ply`, `fen` (position before the blunder, user to move), `playedMoveUci/San`, `bestMoveUci/San`, `acceptableMovesUci` jsonb, `engineLines` jsonb (top-3 multipv, SAN+UCI+eval — the coach grounding snapshot), eval/win-prob before/after, `severity` enum. Unique `(gameId, ply)` → idempotent re-analysis.
- **`PuzzleAttempt`**: `puzzleId` FK, `moveUci`, `correct` — append-only.
- **`CoachExplanation`**: `puzzleId` FK unique, `content` (markdown), `model`, `promptContext` jsonb (exact grounding payload, so chat can rehydrate later).

(tactica-analysis additionally has its own `Analysis` table in `tactica_analysis`, described above.)

## Patterns to follow / reuse

- **Endpoint loop**: contract in `packages/tactica-core-contract/src/lib/contract/<domain>.ts` (Zod + `ContractBuilder.build*Responses`), mounted in `contract/root.ts`; `pgTable` spreading `standardFields` from `@tactica/drizzle-utils`; Repository class taking `Db`, userId-scoped, throws `NotFoundError` from `@tactica/errors`; `registerXRoutes` via `initServer()` + `getSessionUserId`; registered in `backends/tactica-core/src/main.ts`. Migrations: `pnpm --filter @tactica/tactica-core db:generate-migration <name>`.
- **Frontend API**: all endpoints go through the typed `TacticaCoreClient` (`packages/tactica-core-client`) + React Query hooks in `frontends/tactica-app/src/api/`. The client is built from the `buildTacticaAxios` instance (token-refresh interceptors for free).
- **Pagination**: list endpoints use `packages/pagination`.
- **Outbound chess.com client**: plain typed `fetch` wrapper (~60 lines) with serial-request + `Retry-After` backoff; do **not** reuse `AxiosInstanceBuilder` (its error interceptor assumes our `ServerErrorDto`). Base URL env `CHESSCOM_API_URL` (default `https://api.chess.com/pub`) — the seam for e2e fixture servers.
- **Service-to-service clients**: `packages/tactica-analysis-contract`/`-client` and `packages/tactica-coach-contract`/`-client`, mirroring the core contract/client packages. The stockfish wrapper's API is simple enough for a small typed client inside tactica-analysis.
- **New logical DB**: reuse `tools/scripts/ensure_postgres_db.sh` / `ensure_postgres_user.sh` for `tactica_analysis` (dev + test), wired into root `package.json` `db:*` scripts.
- **Docker-run service**: `backends/stockfish` follows the `backends/supertokens` shape (scripts that build/run the container), included in `pnpm serve:backend`.
- **`GameSource` interface** (the lichess seam):
  ```ts
  interface GameSource {
    readonly source: 'chesscom' | 'lichess'
    validateUsername(username: string): Promise<boolean>
    // Batches (chess.com: one per monthly archive) so the import job checkpoints between batches
    fetchGames(
      username: string,
      opts: { sinceCheckpoint?: string; maxBatches: number },
    ): AsyncIterable<{ batchKey: string; isComplete: boolean; games: ExternalGame[] }>
  }
  ```

## Milestones (one PR each, tackled one at a time)

### M1 — Link chess.com account + raw game import (tactica-core only)

- pg-boss dependency + startup wiring in `main.ts` (`WORKER_ENABLED` gate); `GameAccount` + `Game` tables + migration; `GameSource` + `ChessComGameSource` + `ChessComClient`; `import-games` job (archives → months > checkpoint + current month, newest-first, `IMPORT_MAX_MONTHS=3` cap, per-month checkpoint advance, per-game `onConflictDoNothing`, skip-and-warn on unparseable PGN); contracts `gameAccount.ts` + `game.ts` (create validates username against provider → 422 if not found; get includes progress stats `{gamesImported, gamesPending, syncActive}`; `POST /game-accounts/:id/sync`; paginated games list); `TacticaCoreClient` extension + React Query adoption; `(app)` layout Stack→Tabs (Play / Settings); `(app)/settings.tsx` link screen with polling progress (React Query `refetchInterval: 2500` while active). **Delete the Todo example**: contract, domain code, specs, client surface, and a migration dropping the `Todo` table.
- **Verify**: Vitest — repo tests, import idempotency (run twice on fixture JSON → same count), checkpoint resume, real recorded chess.com fixture responses in `src/test/fixtures/chesscom/` (confirms chess.js handles `{[%clk ...]}` comments); e2e — fixture chess.com HTTP server in `e2e-tests-web`, backend started with `CHESSCOM_API_URL` pointed at it, link account → game count appears. Existing `play.spec.ts` still passes after Tabs migration.
- **Implementation notes (as built, July 2026)**:
  - Provider-username-not-found returns **400 `InputValidationError`**, not 422 — the repo's error system keys codes off its existing error classes and has no 422 class.
  - `syncCheckpoint` advances **once, at the end of a successful run** (to the newest fully-completed month fetched), not per-month. With batches yielded newest-first, per-month advancement can't be done safely, and a retried run re-fetches at most `IMPORT_MAX_MONTHS` months with all inserts deduped — cheap enough.
  - **Checkpoint granularity is per-source, and should match what the provider can actually query.** For chess.com that's a **month**, because the only history endpoint is `/pub/player/{u}/games/{YYYY}/{MM}` — a finer (e.g. per-day) checkpoint would still have to be widened back to whole months, so it saves zero HTTP requests (the scarce resource, given serial-requests-only) while narrowing the re-scan window. That last part matters: chess.com archives refresh only every 12–24h, so games can appear in the API after they ended; re-scanning the whole current month means a late arrival still gets picked up, whereas a day checkpoint would skip it permanently. Lichess (M7) is the opposite case — its export API takes a real `since` timestamp, so a timestamp checkpoint is correct there.
  - Redundant work from coarse batches is handled directly instead: each batch is filtered against `GameRepository.findExistingExternalGameIds` (one indexed lookup on the same unique index that dedupes inserts) **before** PGN parsing and insertion, so re-fetching the current month doesn't re-parse or re-ship games we already have.
  - `GameAccount` gained a `lastSyncJobId` column: `stats.syncActive` is derived via pg-boss's public `getJobById` (no reaching into the `pgboss` schema).
  - The `import-games` queue uses pg-boss policy `stately` + `singletonKey = gameAccountId`, so double-clicking "Sync now" can't enqueue duplicates.
  - `Game.moveEvals` was deferred to M4 (it's written by analysis; no reason to carry a dead column until then).
  - `ChessComGameSource` skips variants (`rules !== 'chess'`), games without PGNs, and PGNs chess.js can't parse (skip-and-warn).
  - PGN validity is checked at import time with chess.js in the job (chess.js added as a tactica-core dependency).
  - The e2e fixture chess.com server is started by Playwright's `globalSetup` on port 4599; CI points the backend at it via `CHESSCOM_API_URL`. Local e2e runs work against either the fixture (if the backend was started with the env var) or real chess.com.

### M2 — stockfish service (Dockerized engine API)

- `backends/stockfish`: Dockerfile (slim Debian/Alpine + official Stockfish release binary + our Node/TS wrapper server); wrapper: warm engine process (single UCI handshake), request queue, `POST /evaluate {fen, movetimeMs, multiPv}` → `{bestMoveUci, lines: [{pvUci, cp?, mate?}]}`, health endpoint, crash-respawn, clean `quit` on shutdown; `ENGINE_THREADS`/`ENGINE_HASH` envs; run scripts wired into `pnpm serve:backend` (build image if stale, `docker run` on :3503); CI wiring (docker already used for SuperTokens in e2e).
- **Verify**: unit tests for UCI parsing (pure functions on recorded engine output); smoke test — build image, run container, curl a known tactic position and assert the obvious best move + multipv shape; wire the smoke test into CI.
- **Implementation notes (as built, August 2026)**:
  - **Stockfish comes from Debian's apt** (`stockfish` 15.1 on bookworm), not an official release binary. Debian builds it for both arm64 and amd64, so the one Dockerfile works on an Apple Silicon dev machine and on x86 CI with no per-arch download or checksum logic — which resolves risk #2 below. The cost is a generic build rather than a CPU-optimized one (official releases ship AVX2/BMI2 variants); acceptable because analysis runs at fixed movetime, and swapping in an official binary later is a contained perf lever. Note the package installs to `/usr/games/stockfish`, which is **not** on the image's default `PATH` — the Dockerfile sets `STOCKFISH_PATH` explicitly.
  - **The service uses the same stack as every other backend**: Fastify + ts-rest against `packages/stockfish-contract`, `@tactica/logging`, and the shared correlation-ID / HTTP-logging / error-handling plugins. This was initially built dependency-free (`node:http` only) to keep the container trivial to package; that was the wrong trade. The consistency is worth real money here — an `x-correlation-id` from tactica-analysis now threads into every log line this service emits, which is exactly what you want when debugging a core → analysis → stockfish chain, and errors serialize to the same `{ message, code }` DTO as everywhere else instead of a bespoke shape.
  - **Packaging is the one genuinely novel problem**, since this is the only service that ships inside an image we build (the others run from source via `tsx`). `pnpm deploy` is not the answer: it symlinks workspace packages back to their source directories, which doesn't survive a `COPY`. Instead the service is **bundled with esbuild into one self-contained CJS file** that is the entire image payload. Two flags are load-bearing, both found the hard way:
    - `--format=cjs` — winston's chain (`logform` → `@colors/colors`) uses dynamic `require()`, so an ESM bundle dies at startup with `Dynamic require of "util" is not supported`.
    - `--keep-names` — `ServerError` derives its `code` from `this.constructor.name`; without it the bundler renames classes and every error came back as `_NotFoundError`, which `buildServerErrorFromDto` then fails to match, silently degrading typed errors to `UnknownError` on the client.
  - **`FastifyAppBuilder` gained a required `kind: 'userFacing' | 'internal'`** discriminant: it previously hard-registered SuperTokens and CORS and required a `websiteDomain`, none of which an internal service has. `internal` skips both. M3/M6 should pass `kind: 'internal'`.
    - CORS and SuperTokens are **one switch, not two independent flags**, because they're coupled: the CORS config calls `supertokens.getAllCORSHeaders()`, which resolves to `getInstanceOrThrowError()` and therefore throws unless SuperTokens was initialized. `{cors: true, auth: false}` would crash at startup, so the type makes it unrepresentable.
    - `websiteDomain` lives only on the `userFacing` branch — it's the input both plugins need, and there's nothing sensible for an internal service to pass.
    - The discriminant is **required rather than defaulted**, so every service states its posture out loud. A switch that defaults to on (or that infers "internal" from a missing `websiteDomain`) would let a missing env var silently serve a user-facing service without session verification.
    - Pinned by tests in fastify-utils: an `internal` app serves its routes, has no CORS header, 404s `/auth/signin`, and still gets correlation IDs plus the shared error DTO. `userFacing` isn't unit-testable in-process (it needs `SuperTokens.init()` against a reachable core) and is covered by the Playwright suite instead.
  - **Fixed a pre-existing repo-wide inconsistency while here**: `@ts-rest/fastify` answers request-validation failures with its own `{ pathParameterErrors, bodyErrors, … }` raw-Zod shape, the only place our HTTP surface broke the `{ message, code }` contract — so `buildServerErrorFromDto` couldn't recognize it and degraded it to an `UnknownError` containing a dump of Zod JSON. `tacticaRequestValidationErrorHandler` (in fastify-utils, unit-tested) converts it to a normal `InputValidationError`; it's wired into stockfish **and** tactica-core's routers, and M3/M6 should pass it too.
  - **Scores are returned exactly as UCI reports them — side-to-move-relative — and are deliberately not normalized here.** Normalizing is M3's job (see risk #1). The response type documents this at the field level so it can't be missed.
  - **FEN validation is a security boundary, not just input hygiene.** UCI is newline-delimited and the FEN is interpolated into `position fen <fen>`, so a FEN containing a newline would let a caller append arbitrary engine commands. `isValidFen` matches an anchored pattern that cannot contain one; both a unit test and the smoke test cover the injection attempt, and the smoke test then re-evaluates a position to prove the rejected `\nquit` never reached the engine.
  - **Failure handling is lazy respawn, not eager restart**: a crashed or timed-out engine is forgotten and the next request starts a fresh one. Eager restarting would spin in a loop if the binary itself were broken. A search that exceeds `movetimeMs + ENGINE_SEARCH_GRACE_MS` is treated as wedged and the process is killed, since a stuck engine would otherwise block every queued request behind it. `/health` reports `engineRunning` honestly (verified: SIGKILL the engine → `engineRunning: false` → next request transparently recovers).
  - One warm engine + a promise queue means requests are **strictly serialized** (verified: 6 concurrent 150 ms searches → 953 ms wall clock). M3 should therefore treat the service as a single-slot resource; parallelism later means more replicas, not more concurrent requests per replica.
  - Endpoints are `GET /health` and `POST /evaluate` (no path prefix, unlike tactica-core's `/tactica-core/*` — `/health` at the root is the container-healthcheck convention) with **no internal-API-key check**: unlike tactica-analysis/tactica-coach, this service holds no data and no credentials, so the key would only add ceremony. Revisit if it is ever exposed beyond the local network.
  - Per-request defaults and limits (`movetimeMs`, `multiPv`) live in the contract's Zod schema rather than env vars — they're part of the API, and the analysis-side tunables (`ANALYSIS_*_MOVETIME_MS`) belong to the caller anyway.
  - Registered as a **turbo sidecar** of tactica-core's `serve` task (`with: ["@tactica/supertokens#serve", "@tactica/stockfish#serve"]`), so `pnpm serve:backend` starts all three; the container name is `tactica_stockfish` (prefixed, unlike the pre-existing bare `supertokens` container, to avoid colliding with other projects on a dev machine). The e2e CI job now waits on `:3503/health` too, since it builds the image as part of starting the backends.
  - CI runs the smoke test as its **own `stockfish-smoke` job** rather than inside `pnpm test`, keeping the unit suites hermetic — they need neither Docker nor the engine binary. `pnpm --filter @tactica/stockfish test:smoke` runs the identical flow locally, on an isolated port/container name so it won't disturb a dev container on 3503.

### M3 — tactica-analysis service (blunder detection pipeline)

- Scaffold `backends/tactica-analysis` (port 3502, tactica-core structure: `FastifyAppBuilder`, `config.ts`, Drizzle + own migrations, logical DB `tactica_analysis` dev+test); `packages/tactica-analysis-contract`/`-client`; internal-key preHandler; `Analysis` table; pg-boss `run-analysis` worker; stockfish HTTP client (`STOCKFISH_URL`); `blunderDetection.ts` as **pure functions** (win-prob, thresholds, severity, side-to-move perspective normalization); two-pass analysis; async submit/status API; root scripts + turbo wiring (`serve:backend`, `db:migrate-up[:test]`).
- **Verify**: unit tests for win-prob math + eval-perspective normalization (hand-computed cases, zero engine); worker tests with a faked stockfish client; integration test against the real container — fixture game with an egregious hanging-queen blunder (robust at any depth) → correct `fen`/`bestMoveUci`/severity; manual curl round-trip locally.
- **Implementation notes (as built, August 2026)**:
  - **Everything is white-relative once it leaves the engine boundary.** `toWhiteRelative` is applied exactly once, in `evaluatePosition`, and every eval in the contract (`moveEvals`, `evalBefore`, `evalAfter`) is documented as white-relative. Consumers never have to know whose turn it was. The one place scores stay side-to-move-relative is the deep pass's `engineLines`, where the player is to move anyway so the two frames coincide.
  - **A checkmated position is reported as `mate: ∓1`, never `mate: 0`.** Zero has no sign, so it would survive negation unchanged and silently break perspective flipping — the exact class of bug risk #1 warns about. Pinned by a test asserting the terminal eval is non-zero and negates properly.
  - **Terminal positions are scored locally, not sent to the engine.** Stockfish returns no lines at all for a mated/stalemated position (as M2's smoke test showed), so asking would burn a round trip and hand back nothing to score.
  - **Positions come from chess.js's `move.before` / `move.after`**, not by replaying the PGN by hand — every position the game passed through, with no chance of drift between the FEN we evaluate and the FEN we store on the puzzle.
  - **Only `mistake` and `blunder` graduate to puzzles**; inaccuracies are detected and scored but filtered by `isPuzzleWorthy`, because a 0.1 win-probability dip makes a poor "find the best move".
  - **Env vars are service-prefixed** (`ANALYSIS_PORT`, `ANALYSIS_DATABASE_URL`) rather than reusing `PORT`/`DATABASE_URL`. Turbo hands every task the same environment, so shared names would silently point this service at tactica-core's database. Same reasoning applies to M6's coach.
  - **The `Analysis` table has no `userId`** — this service analyses a PGN handed to it and knows nothing about accounts. tactica-core owns user data and does the authorization before it ever calls here. Ids are unguessable UUIDs behind the internal-key gate.
  - `buildRequireInternalApiKey` lives in **fastify-utils** (M6 reuses it) and is registered as a `preHandler` scoped to `/tactica-analysis/*`, leaving `GET /health` open for container healthchecks and the CI readiness wait.
  - The job **records the failure on the row and rethrows**, so the polling caller sees `failed` while pg-boss still retries; re-running is safe because analysis is a pure function of the PGN. An already-`succeeded` analysis short-circuits, so a duplicate delivery is cheap.
  - **Two engine-backed tests** (`analyzeGame.engine.spec.ts`) run against a real container and are `describe.skipIf`'d when `:3503/health` is unreachable, keeping `pnpm test` hermetic. They caught nothing that the fakes missed, but they're the only thing that would catch our UCI/FEN/perspective plumbing disagreeing with the actual engine. Verified locally: `Qxf7+` flagged as a blunder, best move `Bc4`, win probability 0.485 → 0.098.
  - Timestamp wrinkle worth knowing: `createdAt` defaults to Postgres's `now()` while repository updates set `updatedAt` from the Node process clock, and in Docker those drift by a few milliseconds — so `updatedAt >= createdAt` is not reliably true. Tests compare two updates against each other instead. (Pre-existing pattern, shared with tactica-core.)

### M4 — Pipeline integration → puzzles appear (tactica-core)

- `Puzzle` table + migration; `analyze-game` pg-boss job in core: submit PGN via analysis client → poll status (2s interval, generous timeout) → persist `Puzzle` rows (`onConflictDoNothing`) + `Game.analysisStatus`/`moveEvals`; enqueue `analyze-game` per newly-imported game (hook into M1's import job); `puzzle.ts` contract (paginated list, get); account progress stats now include `gamesAnalyzed`/`puzzleCount`; settings screen shows analysis progress.
- **Verify**: Vitest with a faked analysis client (submit/poll/persist, idempotent re-run, failure → `analysisStatus='failed'` + pg-boss retry); full-stack manual run with a real chess.com account; e2e — fixture archive containing one game with a known blunder + real tactica-analysis + stockfish container with `ANALYSIS_*_MOVETIME_MS=10` → assert puzzle count appears. (Fallback if engine-in-CI proves flaky: test-only seed endpoint — but try the real pipeline first.)

### M5 — Puzzle-solving UI

- `useChessGame` accepts `{initialFen?}`; `Chessboard` gains `orientation: ChessColor` (view-only transform) + `interactiveColor?: ChessColor` (converting to chess.js's `'w'|'b'` internally); **promotion picker** component shown when a puzzle move is a pawn reaching the last rank (replaces auto-queen in puzzle mode; hotseat play screen untouched); `usePuzzle` hook (load FEN, one user move, compare UCI — including promotion piece — against `bestMoveUci ∪ acceptableMovesUci`); `(app)/puzzles/index.tsx` (list, newest first, solved/unsolved badges) + `[id].tsx`; Puzzles tab; `PuzzleAttempt` table + `POST /puzzles/:id/attempts` (server re-validates + stores `correct`; client validates locally for instant feedback — these are the user's own games, no cheating incentive). Success: ✓ then animate engine's opponent reply (`engineLines[0]` move 2). Failure: "you played X in the game / best was Y" with both shown, Retry offered. Either terminal state reveals the coach panel slot (M6).
- **Verify**: e2e (the star): sign up → link (fixture server) → analysis completes (tiny movetimes) → open puzzle → play best move → success state; second test plays a wrong move → fail state; include a promotion puzzle fixture if practical. Vitest for attempt validation. testID conventions extended (`puzzlesScreen`, `puzzle-<id>`, `promotionPicker-<piece>`, etc.).

### M6 — tactica-coach service + explanations UI

- **Secrets infra** (first secret arrives here): committed `.env` + `.env.secrets.tpl`, gitignored `.env.secrets`, root `pnpm get-secrets` (`op inject`), env-file loading in serve scripts, `.gitignore` fix, README docs.
- `backends/tactica-coach` (port 3504, stateless, no DB): `packages/tactica-coach-contract`/`-client`; internal-key preHandler; `buildPrompt`/system prompt module (friendly coach, concrete squares/pieces, never contradict engine lines, ≤180 words); Anthropic call via `@anthropic-ai/sdk` with constructor-injected client (model `COACH_MODEL` default `claude-opus-5`, `max_tokens: 1024`, non-streaming, defensive `refusal`/`max_tokens` handling); fails fast at startup without `ANTHROPIC_API_KEY` (message: run `pnpm get-secrets`).
- tactica-core: `CoachExplanation` table; `buildCoachContext` pure function (FEN; game metadata; last ~6 SAN moves from PGN; the blunder with eval/win-prob drop; 3 engine lines in SAN; whether/what the user tried) — shaped as **system prompt + messages array from day one** (chat later = append + resend); `POST /puzzles/:id/explanation` — return cached row if exists, else call coach + persist; coach-unreachable → typed 503 `CoachDisabled`; `coachAvailable` flag in puzzle DTO; frontend coach panel with "Coach is thinking…" state, auto-triggered on solve/fail, hidden when unavailable.
- **Verify**: snapshot test of `buildCoachContext` payload (the future chat contract); coach service tests with fake Anthropic client incl. refusal handling; core caching test (second call = no coach invocation); manual with a real key via `pnpm get-secrets`; e2e asserts the disabled path (no key in CI).

### M7 — Lichess source (fast follow)

- `LichessGameSource` against `https://lichess.org/api/games/user/{username}` (NDJSON export; `since` param ↔ `syncCheckpoint` as timestamp); source picker on settings screen; `LICHESS_API_URL` env for fixtures.
- **Verify**: fixture-based source tests mirroring M1; e2e optional (interface already exercised).

## Risks & gotchas

1. **Eval perspective** (the classic bug): UCI `score cp` is side-to-move-relative; normalize to user perspective before win-prob math. Pin with hand-computed unit tests (M3).
2. ~~**Stockfish container**: multi-arch consideration (dev = Apple Silicon, CI = x86 ubuntu) — pick official binaries per arch in the Dockerfile (or `apt-get` inside the image as fallback); keep the wrapper's engine settings conservative (`Threads`, `Hash`) so N containers ≠ resource blowup.~~ **Resolved in M2**: `apt-get` handles both arches with one Dockerfile, and `ENGINE_THREADS`/`ENGINE_HASH` default to 1 thread / 128 MB.
3. **chess.com etiquette**: serial requests, custom `User-Agent`, `Retry-After` backoff, month checkpointing so failures resume not restart; always re-fetch current month (dedupe via unique index).
4. **chess.js PGN quirks**: `%clk` comments, odd headers — validated against real recorded fixtures; unparseable game = skip + warn, never fail the import job.
5. **E2e vs external APIs**: never hit api.chess.com or api.anthropic.com in CI — `CHESSCOM_API_URL` fixture server, coach disabled path.
6. **pg-boss × serial Vitest**: `WORKER_ENABLED=false` in test setup; tests call handler functions directly. Two boss instances (one per service/DB); pg-boss self-migrates its schema — keep it out of Drizzle's purview.
7. **Service-to-service resilience**: analysis poll needs a timeout + `analysisStatus='failed'` path; core's pg-boss retry re-submits cleanly because puzzle insertion is idempotent. Coach-unreachable is a soft failure (`CoachDisabled`), never a crash in core.
8. **Coach fail-fast vs. dev UX**: a dev who hasn't run `pnpm get-secrets` gets a crashing coach process under `pnpm serve:backend` — ensure the process manager tolerates one service exiting (others keep running) and the error message is unmissable.
9. **Tabs migration**: converting `(app)` Stack→Tabs touches the auth-gate layout — keep redirect logic identical; existing `play.spec.ts` guards it.
10. **Analysis backlog**: ~10s/game × ~300 games ≈ 50 min single-threaded — acceptable in background; newest-first import means fresh puzzles appear quickly; analysis concurrency is the future knob.
11. **More services, more startup surface**: `serve:backend` now manages SuperTokens + Postgres-dependent services + a Docker engine container; keep the e2e preflight check updated so failures are diagnosable.

## Verification (overall)

Each milestone lands green on the existing CI (lint / test / e2e-web) with its own tests added. End-to-end acceptance after M6: fresh signup → link a real chess.com username → games import → puzzles appear → solve one correctly (success + opponent reply animation) → fail one (reveal) → coach explanation renders (with secrets from `pnpm get-secrets`). Mobile (Maestro) untouched until the web flow stabilizes.
