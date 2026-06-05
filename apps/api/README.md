# @finrep/api

NestJS 11 (TypeScript, ESM) backend skeleton for Phase 1A. Modules: **Config**,
**Prisma**, **Health** (`GET /health`), **Reports** (`POST /reports/generate`).

## Engine-consumption constraint (important)

`apps/web` aliases `@finrep/engine` to `packages/engine/src/index.ts` via Vite,
so esbuild transpiles the `.ts` sources on the fly. **The api cannot do this.**
The engine (and ingestion) sources use `moduleResolution: "Bundler"` with
`.js`-suffixed relative import specifiers and export `./dist/index.js`. Plain
Node / `tsc` (NodeNext resolution) cannot resolve `./types/rows.js` against a
`.ts` file. Therefore **the api consumes the engine from its BUILT `dist`** (the
package `main` / `exports` -> `./dist/index.js`), and the api is itself ESM
(`type: module`, `module`/`moduleResolution: NodeNext`).

Consequence: the workspace deps must be built before/alongside the api. Turbo's
`build` task has `dependsOn: ["^build"]`, so `turbo build --filter=@finrep/api`
builds `@finrep/db` (Prisma client) and `@finrep/engine` first, then the api.
There is **no tsconfig path alias to engine source** for the api.

## Endpoints

- `GET /health` -> `200 { status: "ok", db: "ok" }` (or `503 ... db: "down"`).
  Checks DB connectivity with `SELECT 1`.
- `POST /reports/generate` -> stateless wrapper over `generateReports()`.
  Body: `{ cyData: NormalizedRow[], pyData, auditData, school: { netAssetsBegin,
  pyNetAssetsBegin, auditNetAssetsBegin } }`. Returns the engine `ReportBundle`
  `{ soaResults, sfpResults, scf, netAssets, unmapped, validation, meta }`.

Auth: Phase 1B ships real JWT/RBAC. `POST /reports/generate` is now behind
`JwtAuthGuard` (requires a valid Bearer access token). The web app's live report
preview computes the statements client-side via `@finrep/engine`, so this
endpoint is a server-side compute convenience rather than the web preview path.

## Local dev

```sh
# from repo root
pnpm -F @finrep/db generate     # generate the Prisma client
pnpm build                      # builds engine + db + api (turbo ^build ordering)
DATABASE_URL=postgresql://finrep:finrep_dev_pw@localhost:5434/finrep?schema=public \
  pnpm -F @finrep/api start
```

Or run the whole stack (postgres + api) via Docker — see the root
`docker-compose.yml`.

## Build / migrate flow (container)

- `prisma generate` runs at **build** time (in the Dockerfile installer stage).
- `prisma migrate deploy` runs at **start** time (idempotent) via `start.sh`,
  pointed at `packages/db/prisma/schema.prisma`.

## Image leanness

The Dockerfile is multi-stage and `turbo prune @finrep/api --docker` keeps only
the api + its workspace deps (apps/web is pruned out). The runner stage then:

- pins the Prisma engine to a single target via `binaryTargets =
  ["native", "debian-openssl-3.0.x"]` in the schema, so only the Debian engine
  the runtime needs is shipped (no spurious `native`/RHEL binaries);
- prunes dev/build-only packages from the pnpm store that the **compiled** dist
  never imports (verified: only `@finrep/{db,engine}`, `@nestjs/*`,
  `class-validator`, `class-transformer` + runtime transitives are needed) —
  turbo/typescript/eslint/esbuild/tsup/webpack/vite/rollup/xlsx/etc.;
- strips `*.map` files.

The prisma CLI + `@prisma/*` are intentionally kept (needed by `start.sh`'s
`migrate deploy`). Net effect: ~716 MB -> ~658 MB with identical behavior.

## Env

Required `DATABASE_URL`; defaults `PORT=8000`, `WEB_ORIGIN=http://localhost:5173`.
Placeholders read but unused in 1A: `JWT_SECRET`, `JWT_ACCESS_TTL`,
`JWT_REFRESH_TTL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
