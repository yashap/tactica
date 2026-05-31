# SuperTokens

A local deployment of the [self-hosted SuperTokens backend](https://supertokens.com/use-oss), powering authentication for Tactica.

Connects to the dev Postgres container (`tactica_postgres_dev`) over `host.docker.internal:5440` and exposes the core API on `localhost:3567`.

Bring it up with:

```
pnpm db:migrate-up                                # ensures the dev Postgres + supertokens DB/user exist
pnpm --filter @tactica/supertokens serve          # runs the core
```
