# Deploying to Cloudflare (Pages or Workers + D1)

There are two ways to deploy. Both use **D1** as the database and run the
monitor checks once a minute from a **cron trigger**.

| | **Pages** (`CLOUDFLARE_TARGET=pages`, CI default) | **Workers** (`CLOUDFLARE_TARGET=workers`) |
|---|---|---|
| App | Cloudflare Pages project `leicraftmc-status-page` | Worker `leicraftmc-status-page` |
| Monitor cron | separate Worker `leicraftmc-status-page-cron` (Pages Functions can't have cron triggers) | the same Worker |
| Custom domain | works with DNS anywhere, via a CNAME to `<project>.pages.dev` | needs the domain's DNS on Cloudflare |
| Static files | free and unlimited, never hit the Function | served by Workers Static Assets |
| Build output | `dist/` | `.output/` |

There is no hand-written wrangler config. The settings live in
`build/cloudflare-config.ts` and are used from `nuxt.config.ts`; the build
generates the config files:

- Pages: `dist/_worker.js/wrangler.json` (app) and `dist/cron-worker/wrangler.json`
  (cron Worker, entry point `server/cron-worker.ts`).
- Workers: `.output/server/wrangler.json`.

Nitro also writes a redirect in `.wrangler/deploy/`, so `wrangler deploy`,
`wrangler pages deploy` and `wrangler dev` / `wrangler pages dev` find the app's
config after a build.

## Requirements

- **Node.js ≥ 22** for wrangler (its dev server does not work under Bun).
- About **4–5 GB of free RAM** for the build: the whole server is bundled into
  one file. If the build gets `Killed`, close other memory-heavy programs or
  build in CI.

## Automatic deploys (GitLab CI)

The `deploy:cloudflare` job in `.gitlab/ci/deploy-cf.yml` runs on pushes to the
default branch after `test:typecheck` and `test:unit` pass. It runs
`bun run deploy:cf:pages`, or `bun run deploy:cf` when `CLOUDFLARE_TARGET` is
`workers` (set it in the job or as a CI/CD variable).

Set these CI/CD variables (Settings → CI/CD → Variables, **masked** and
**protected**):

| Variable | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | API token with *Workers Scripts: Edit*, *D1: Edit* and, for Pages, *Cloudflare Pages: Edit* |
| `CLOUDFLARE_ACCOUNT_ID` | your Cloudflare account id |
| `CLOUDFLARE_D1_DATABASE_ID` | id from `wrangler d1 create` (below) |
| `LCCFWSP_APP_URL` | public URL, e.g. `https://status.example.com` |

## One-time setup

```sh
npx wrangler login                               # or set CLOUDFLARE_API_TOKEN
npx wrangler d1 create leicraftmc-status-page    # note the database_id
bun run cf:pages:create                          # Pages only: create the project (production branch: main)
```

Put the printed `database_id` into the `CLOUDFLARE_D1_DATABASE_ID` CI variable
(or export it locally before a manual deploy). Both targets use the same
database, so switching between them keeps all data.

**Custom domain (Pages):** in the dashboard, go to **Workers & Pages →
leicraftmc-status-page → Custom domains → Set up a custom domain**, then create
the CNAME record Cloudflare shows (`status.example.com` → `leicraftmc-status-page.pages.dev`)
at your DNS provider. Set `LCCFWSP_APP_URL` to that domain.

## Manual deploy

```sh
export CLOUDFLARE_D1_DATABASE_ID=<id>
export LCCFWSP_APP_URL=https://status.example.com
bun run deploy:cf:pages     # or: bun run deploy:cf (Workers)
```

`deploy:cf:pages` runs, in order:

1. `build:cf:pages`: Nuxt build with the `cloudflare_pages` preset. `CF_BUILD=1`
   enables the Cloudflare-only settings (config generation, stubs for the
   Bun-only SQLite driver and unused schema libraries), `CF_TARGET=pages` picks
   the Pages variant and writes the cron Worker's config.
2. `db:d1:migrate:pages:prod`: applies pending migrations to the remote D1 database.
3. `wrangler pages deploy --branch main`: uploads the app as the production deployment.
4. `wrangler deploy --config dist/cron-worker/wrangler.json`: deploys the cron Worker.

`deploy:cf` (Workers) does the same with `build:cf`, `db:d1:migrate:prod` and a
single `wrangler deploy`.

**Switching an existing Workers deployment to Pages:** deploy with the Pages
target, then delete the old `leicraftmc-status-page` Worker in the dashboard
(**Workers & Pages → leicraftmc-status-page → Settings → Delete**). Otherwise
its cron keeps running and every monitor is checked twice.

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

With an empty database, whichever runs first — the first request or the first
cron run — creates an `admin` user and logs a one-time password-reset URL
(Workers have no filesystem to write it to). Look for
`Initial admin user created` in the logs:

- **Pages:** usually the cron Worker, within a minute of the first deploy:
  **Workers & Pages → leicraftmc-status-page-cron → Logs** (kept, since
  observability is enabled), or `npx wrangler tail leicraftmc-status-page-cron`.
  If a page request came first, it's in the Pages project's live logs
  (`npx wrangler pages deployment tail --project-name leicraftmc-status-page`);
  Pages doesn't keep logs, so start tailing before opening the site.
- **Workers:** **Workers & Pages → leicraftmc-status-page → Logs**, or
  `npx wrangler tail leicraftmc-status-page`.

Open the URL once to set the admin password.

## Local preview

```sh
# Workers: build → migrate local D1 → wrangler dev on http://localhost:8787
bun run preview:cf

# Pages: build → migrate local D1 → wrangler pages dev on http://localhost:8788,
# and in a second terminal the cron Worker (same local database):
bun run preview:cf:pages
bun run preview:cf:pages:cron      # trigger: curl "http://localhost:8789/__scheduled?cron=*+*+*+*+*"
```

Trigger the cron manually with
`curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"`.

## Running on the Workers Free plan

The app is built to fit the Free plan. What each limit means here:

| Free-plan limit | How the app stays within it |
|---|---|
| **10 ms CPU per request** | Public API responses are cached for 30 s per isolate (`publicResponseCache`), and rendered public pages for 30 s (`swr` route rules, Cloudflare build only). History reads one pre-aggregated row per monitor and day instead of raw checks. Session tokens and API keys are verified with SHA-256 (they are 256-bit random values), so authenticated requests don't run a password hash. |
| 10 ms CPU per request: **login, password reset/change** | These run PBKDF2-SHA256 with 600,000 iterations (OWASP's recommendation), about 150 ms of CPU. That is deliberately kept for security. Cloudflare allows occasional overruns ("each isolate has some built-in flexibility to allow for cases where your Worker infrequently runs over the configured limit"), and logins are infrequent. If they fail with error 1102, the Workers Paid plan removes the limit. |
| 50 subrequests and 50 D1 queries per invocation | The cron (in the app Worker, or the cron Worker on Pages) uses 4 database round-trips (batched) plus one fetch per monitor, and checks at most 6 monitors at a time (the concurrent-connection limit), so up to about 45 monitors per run. |
| **100,000 D1 rows written per day** | Each check writes about 5 rows (raw check + its index entry, the daily aggregate, and later deleting the raw check + index entry). That's roughly **13 monitors at a 60 s interval**, or 27 at 120 s. |
| 5,000,000 D1 rows read per day | A public page view reads about 90 aggregate rows per monitor for its history, at most once per 30 s per isolate thanks to the cache. The history bars re-fetch every 5 minutes, the live status every 30 s. |
| 100,000 requests per day | An open status page makes about 2 requests per minute while visible (polling pauses in hidden tabs). |
| 500 MB database | Raw checks are kept for `LCCFWSP_CHECK_RETENTION_DAYS` (default 90; `0` keeps them forever). Uptime history and latency statistics come from the daily aggregates and are kept regardless. |

Other limits:

- Cron granularity is 1 minute, so `interval_seconds` below 60 has no effect.
- Login/reset rate limits are kept per Worker isolate, not globally, so they are weaker than on Bun.
- Worker size: the build is ~0.7 MB gzip (limit 3 MB on Free).

To check real CPU usage after deploying, open the Worker's **Logs** in the
dashboard (for Pages: the cron Worker's logs, and the Pages project's live logs
for requests); every invocation shows its CPU time.

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
