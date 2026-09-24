# Deploying to Cloudflare (Workers + D1)

The status page runs on Cloudflare **Workers** with **D1** as the database and
**Workers Static Assets** for the Nuxt client build. The per-minute monitor
check runs as a **cron trigger** (Nitro scheduled task `check-monitors`).

There is no hand-written `wrangler.jsonc`. The Cloudflare settings live in
`nuxt.config.ts` under `nitro.cloudflare`, and `bun run build:cf` makes Nitro
generate `.output/server/wrangler.json` (adding `main`, `assets`,
`compatibility_date` and the `nodejs_compat` flag itself) plus a redirect in
`.wrangler/deploy/` so `wrangler deploy` / `wrangler dev` find it.

## Requirements

- **Node.js ≥ 22** for wrangler (its dev server does not work under Bun).
- About **4–5 GB of free RAM** for `build:cf`: the whole server is bundled
  into one worker. If the build gets `Killed`, close other memory-heavy
  programs or build in CI.

## Automatic deploys (GitLab CI)

`.gitlab/ci/deploy-cf.yml` adds two jobs:

| Job | Runs | Does |
|---|---|---|
| `test:build:cloudflare` | every pipeline | builds the worker and runs `wrangler deploy --dry-run` |
| `deploy:cloudflare` | pushes to the default branch, after `test:typecheck`, `test:unit` and `test:build:cloudflare` pass | `bun run deploy:cf` (build → migrate → deploy) |

Set these CI/CD variables (Settings → CI/CD → Variables, **masked** and
**protected**):

| Variable | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | API token with *Workers Scripts: Edit* and *D1: Edit* |
| `CLOUDFLARE_ACCOUNT_ID` | your Cloudflare account id |
| `CLOUDFLARE_D1_DATABASE_ID` | id from `wrangler d1 create` (below) |
| `LCCFWSP_APP_URL` | public URL, e.g. `https://status.example.com` |

## One-time setup

```sh
npx wrangler login                               # or set CLOUDFLARE_API_TOKEN
npx wrangler d1 create leicraftmc-status-page    # note the database_id
```

Put the printed `database_id` into the `CLOUDFLARE_D1_DATABASE_ID` CI variable
(or export it locally before a manual deploy).

## Manual deploy

```sh
export CLOUDFLARE_D1_DATABASE_ID=<id>
export LCCFWSP_APP_URL=https://status.example.com
bun run deploy:cf
```

`deploy:cf` runs, in order:

1. `build:cf`: Nuxt build with the `cloudflare_module` preset. `CF_BUILD=1`
   enables the Cloudflare-only settings in `nuxt.config.ts` (config generation,
   stubs for the Bun-only SQLite driver and for unused schema libraries).
2. `db:d1:migrate:prod`: applies pending migrations to the remote D1 database.
3. `wrangler deploy`: uploads the worker and static assets.

## Database migrations

Migrations run **automatically on every deploy**, always before the new code
goes live. Wrangler records applied files in the `d1_migrations` table, so
re-running is a no-op when nothing is pending. If a migration fails, the
deploy stops and the previous worker keeps running. The old code briefly runs
against the new schema, so keep migrations backwards-compatible (add first,
drop in a later release).

New migrations are still generated with drizzle-kit (`bun run db:generate`);
wrangler applies the same SQL files from `drizzle/migrations`.
`LCCFWSP_DB_AUTO_MIGRATE` is `false` on Workers because drizzle's migrator
reads files from disk.

```sh
bun run db:d1:migrate        # local D1 (.wrangler/state), needs a prior build:cf
bun run db:d1:migrate:prod   # remote D1, needs a prior build:cf
```

## First boot: the initial admin account

With an empty database, the first request creates an `admin` user and logs a
one-time password-reset URL (Workers have no filesystem to write it to). Read
it from **Workers → leicraftmc-status-page → Logs** in the dashboard
(observability is enabled), or stream logs before opening the site:

```sh
npx wrangler tail --format pretty
```

## Local preview

```sh
bun run preview:cf     # build → migrate local D1 → wrangler dev on http://localhost:8787
```

Trigger the cron manually with
`curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"`.

## Limits to keep in mind

| Limit | Impact |
|---|---|
| **CPU time: 10 ms/request on the Free plan** | Login and password reset hash with PBKDF2 (600k iterations), which takes far more than 10 ms of CPU. **Use the Workers Paid plan** or those requests will fail. |
| Subrequests per invocation: 50 (Free) / 1000 (Paid) | Each monitor check uses about 3 D1 queries plus 1 fetch/socket, so the Free plan handles roughly 12–15 monitors per cron run. |
| Cron granularity: 1 minute | `interval_seconds` below 60 has no effect. |
| In-memory rate limits | Login/reset rate limits are kept per Worker isolate, not globally, so they are weaker than on Bun. |
| Worker size: 3 MB gzip (Free) / 10 MB (Paid) | The current build is ~0.8 MB gzip. |

## Troubleshooting

- **`Could not resolve "bun:sqlite"`**: you built without `CF_BUILD=1`; use
  `bun run build:cf`.
- **`Disallowed operation called within global scope`**: some module runs
  I/O, timers or random generation at import time. Move it into a handler or
  guard it with `Runtime.isCloudflare` (see the rate-limit cleanup in
  `server/lib/api/versions/v1/routes/auth/`).
- **`D1 binding "DB" not found`**: `nitro.cloudflare.wrangler.d1_databases`
  is missing or the binding isn't named `DB`.
- **`wrangler dev` hangs**: it's running under Bun; use Node ≥ 22.

## Differences from the Bun deployment

| | Bun | Cloudflare Workers |
|---|---|---|
| Database | SQLite file (`LCCFWSP_DB_PATH`) | D1 binding `DB` |
| Migrations | drizzle on boot (`LCCFWSP_DB_AUTO_MIGRATE=true`) | wrangler on deploy |
| Startup | at server start | on the first request |
| Initial admin token | written to `<config dir>/initial_admin_password_reset_token.txt` | printed to worker logs |
| TCP monitor checks | `Bun.connect` | `cloudflare:sockets` |
| Cron | in-process Nitro scheduler | Workers cron trigger |
