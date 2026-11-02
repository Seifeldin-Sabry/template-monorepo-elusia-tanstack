# Groundwork

Reusable full-stack starter with a Bun/Elysia API, two TanStack Start sites, and PostgreSQL (Neon in production), deployed to Fly.io. Projects CRUD shows the complete path from Drizzle through Elysia and typed Eden Treaty calls to a TanStack Query interface. Better Auth supplies email/password sessions. Optional integrations add Upstash Redis, Resend email, Upstash QStash jobs, and Stripe billing with both subscriptions and one-time purchases.

## First run

Requires Bun 1.4.0, Docker with Compose, and Git.

```sh
bun install --frozen-lockfile
cp .env.example .env
bun run db:up
bun run db:migrate
bun run dev
```

Open [app](http://localhost:3000), [landing site](http://localhost:3002), and [API health](http://localhost:3001/health). Create an account in the app, then create, edit, and delete projects. Billing page remains usable in a disabled state until Stripe is configured.

PostgreSQL binds to localhost. If port 5432 is occupied, change `POSTGRES_PORT`, `DATABASE_URL`, and `TEST_DATABASE_URL` to port 5433 in `.env` before starting Compose. To add the optional sample project, register first, set `SEED_USER_EMAIL` to that account's email, then run `bun run db:seed`. Seed is safe to rerun. Without that variable it exits without inserting data.

## Workspaces

| Path | Purpose |
| --- | --- |
| `apps/api` | Bun/Elysia server, Better Auth, validated project and billing routes, Eden contract |
| `apps/app` | TanStack Start product app, projects dashboard, authentication, billing |
| `apps/web` | Separate TanStack Start landing site |
| `packages/db` | Drizzle schema, Postgres.js connection, SQL migrations, seed |
| `packages/billing` | Stripe checkout, customer portal, webhook reconciliation |
| `packages/cache` | Optional Upstash Redis cache and Better Auth rate-limit storage |
| `packages/email` | Optional Resend delivery for verification and password reset |
| `packages/jobs` | Optional Upstash QStash job queue; API receives signed callbacks |
| `packages/ui` | Shared shadcn-style controls, Tailwind tokens, brand settings |

The app imports `@starter/api/contract` as a **type only** and calls API routes through Eden Treaty. Its browser bundle contains no database or API runtime module. Query options define one projects cache key; `useCreateProject`, `useUpdateProject`, and `useDeleteProject` await invalidation on success. Server rendering uses a request-scoped QueryClient and forwards the session cookie for API reads.

## Environment

Copy `.env.example` to ignored `.env` for local development. In staging and production, inject environment variables through the host or secret manager; an `.env` file is optional there. Root development, build, test, and database scripts use dotenvx. `bunfig.toml` disables Bun runtime's implicit `.env` loading, so runtime scripts receive file values through dotenvx. Bun's package manager can still inspect `.env` during installation. API validates required settings at startup; app server validates origins before API requests. Keep secrets out of `VITE_` variables; those values are public in frontend builds. Turborepo declares task environment inputs for caching and process forwarding.

| Variable | Purpose |
| --- | --- |
| `POSTGRES_PORT` | Docker host port, default 5432 |
| `DATABASE_URL` | PostgreSQL URL used by API, seed, Drizzle generation, Studio, and migrations in the current environment |
| `TEST_DATABASE_URL` | PostgreSQL integration-test URL; use an isolated disposable database outside local development |
| `API_HOST`, `API_PORT` | Bun API listen address and port |
| `API_ORIGIN` | Public API/Auth origin; Better Auth uses it as base URL |
| `API_INTERNAL_ORIGIN` | Optional app-server-only API URL on a private network; defaults to `API_ORIGIN` |
| `VITE_API_ORIGIN` | Public browser API origin; normally same as `API_ORIGIN` |
| `APP_ORIGIN` | Public product app origin, used for SSR requests, auth trust, and Stripe return URLs |
| `VITE_APP_ORIGIN`, `VITE_WEB_ORIGIN` | Public links compiled into frontend builds |
| `CORS_ORIGINS` | Exact comma-separated browser origins trusted by API |
| `BETTER_AUTH_SECRET` | 32+ character signing secret; production startup rejects example value |
| `AUTH_COOKIE_DOMAIN` | Optional shared parent domain for HTTPS sibling API/app subdomains |
| `SEED_USER_EMAIL` | Existing registered email to receive sample project |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Optional Upstash pair; both or neither |
| `REDIS_KEY_NAMESPACE` | Redis key prefix to separate deployments |
| `RESEND_API_KEY`, `EMAIL_FROM` | Optional Resend credential and verified sender address; both or neither |
| `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` | Optional QStash token and signing keys; all three or none |
| `QSTASH_DEV` | `true` runs local QStash dev server with deterministic keys instead |
| `LOG_LEVEL` | Minimum API JSON log level |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Optional Stripe test/live secret and signing secret |
| `STRIPE_SUBSCRIPTION_PRICE_ID`, `STRIPE_ONE_TIME_PRICE_ID` | Server-owned recurring and one-time Price IDs |

### PostgreSQL in each environment

Local development uses PostgreSQL 17 from Docker Compose. `bun run db:up` starts it; default `DATABASE_URL` in `.env.example` points to `localhost:5432`. If that port is occupied, change `POSTGRES_PORT`, `DATABASE_URL`, and `TEST_DATABASE_URL` together. Compose is only for local development. Staging and production can use Neon or any compatible hosted PostgreSQL service: set each deployment's `DATABASE_URL` to that environment's connection string, then run the same `bun run db:migrate` command before deploying API code. No provider-specific migration variable or driver is required. Include provider-required TLS settings in the URL. Confirm that the selected connection endpoint permits migration DDL; if a provider offers separate pooled and direct endpoints, choose its migration-capable endpoint for the migration job. Never run integration tests against production data.

Change `packages/db/src/schema.ts` and related schema files, run `bun run db:generate`, review generated SQL, commit migration files, then run `bun run db:migrate` with target environment's `DATABASE_URL`. Runtime and migration processes can receive different values for that same variable if connection endpoints differ. `db:studio` opens Drizzle Studio with the configured database.

### Better Auth

Email/password registration, sign-in, sign-out, and database-backed sessions work without another service. Projects and billing routes require a session; project records are scoped to the session user. Better Auth rate limits use PostgreSQL by default. With both Upstash values present, rate-limit counters use Redis while sessions remain in PostgreSQL. Partial Upstash configuration fails at API startup.

Localhost works across the app/API ports. For HTTPS sibling hosts such as `app.example.com` and `api.example.com`, set `AUTH_COOKIE_DOMAIN=example.com`; both hosts must match that domain. If hosts belong to different registrable domains, place an API/auth reverse proxy on the app's origin to avoid third-party cookie failures. Keep `API_ORIGIN` public; use `API_INTERNAL_ORIGIN` only when the app server needs a private route to the API. API rate limits use Bun's direct socket IP and discard incoming forwarding headers. Behind a reverse proxy, that IP belongs to the proxy; add per-client rate limiting at the proxy if needed.

Without Resend, signup works immediately and email verification and password-reset delivery remain off. Set both `RESEND_API_KEY` and `EMAIL_FROM` to enable verification on signup and password-reset emails; partial configuration fails at API startup. App shows check-inbox/resend and forgot/reset-password flows only when email delivery is enabled. Verify sender domain with Resend. Set both server-side `APP_ORIGIN` and build-time `VITE_APP_ORIGIN` to the same public app URL so verification and recovery links return to the correct host. Social login is not included.

### API logging

API emits one Pino JSON completion record per request with ISO timestamp, service, event, request ID, HTTP method, pathname without query, actual status, and duration in milliseconds. Startup, shutdown, enabled integrations, and unexpected errors use the same logger. `LOG_LEVEL=info` is the default; `trace`, `debug`, `warn`, `error`, `fatal`, and `silent` are also accepted. Request IDs return in `X-Request-ID` to correlate client reports with server logs. Logs omit request bodies and raw headers; common credential fields are redacted, and unexpected errors record exception names and call sites without their potentially sensitive messages. Forward stdout/stderr to the deployment's log collector and set its retention and access controls there.

### Stripe: subscriptions and one-time purchases

Billing is optional. Create a recurring Price and a one-time Price in Stripe test mode. Set all four `STRIPE_*` variables in `.env`; leaving all blank disables billing, while a partial configuration fails at startup. Checkout accepts only `subscription` or `one_time`; API selects Price IDs from server configuration. Both modes use hosted Stripe Checkout. Subscription customers can open Stripe Customer Portal. Signed webhooks reconcile subscription state and one-time purchase records into PostgreSQL; processed Stripe event IDs prevent duplicate writes. The UI shows current state from the database.

For local webhook forwarding, install Stripe CLI and run:

```sh
stripe listen --forward-to http://localhost:3001/billing/webhook
```

Copy the printed `whsec_...` value into `STRIPE_WEBHOOK_SECRET`, restart API, then use Stripe test cards through the billing page. Configure the same webhook endpoint and event types in Stripe for deployment: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, and `customer.subscription.created`, `.updated`, `.deleted`. Configure Customer Portal in Stripe before offering its link. No Stripe credentials are committed, and live payment processing needs a real Stripe account and webhook endpoint.

Billing records demonstrate integration; they do not grant application entitlements yet. Add an explicit server-side entitlement check for paid product features. For production billing, enable email verification/recovery and reconcile operational exceptions from Stripe Dashboard.

### QStash jobs

Jobs are optional. With no `QSTASH_*` values, API runs without a queue and never publishes. With all three set, creating a project publishes a `project-created` message after the database write succeeds. QStash then calls `POST {API_ORIGIN}/jobs/project-created`; API verifies the `Upstash-Signature` JWT against the raw body and that public URL, re-reads the committed project by owner and ID, and logs the outcome. Messages carry identifiers only, use a stable deduplication ID, and retry three times before landing in the QStash dead letter queue. Non-2xx responses trigger retries, so handlers must be idempotent. Partial configuration fails at startup. Enqueue failure produces a warning while the saved project remains available; use a transactional outbox if future jobs must be delivered reliably.

Locally, set `QSTASH_DEV=true`: the SDK downloads and starts the QStash dev server on port 8080 and uses its deterministic keys, so callbacks reach `localhost:3001` without a tunnel. Dev mode is ignored when `NODE_ENV=production`. In production, copy the token and both signing keys from the Upstash console into API secrets. API itself is the worker; there is nothing separate to deploy. Add a job by extending `JobName`, adding a publish method in `packages/jobs/src/queue.ts`, and adding a matching signed route.

### Choose modules

Core dependency path: product app calls the API through an Eden contract; API uses PostgreSQL through `packages/db`. Better Auth lives in the API and stores sessions in PostgreSQL. Both frontends share `packages/ui`; `apps/web` can be removed independently. API opts into `packages/cache`, `packages/email`, `packages/jobs`, and `packages/billing` at startup. Jobs use the database directly in their worker; billing owns its own database tables. Email and jobs have no dependency on each other.

**Disable at runtime:** leave Upstash Redis, Resend, or QStash credentials blank, or leave all four Stripe settings blank. Their packages remain installed, but core app still runs. Partial configuration fails fast. Keep provider secrets on API servers, never in `VITE_` variables.

**Remove code from a derivative project:**

| Module | Files and wiring to remove |
| --- | --- |
| Upstash | Delete `packages/cache`; remove `@starter/cache` from `apps/api/package.json`, `createCache` and `secondaryStorage` wiring from `apps/api/src/server.ts`, and cache type/option from `apps/api/src/auth.ts`. Set Better Auth rate-limit storage to `database`. |
| Resend | Delete `packages/email`; remove API package dependency and email setup in `apps/api/src/server.ts` and `apps/api/src/auth.ts`. Remove `/auth/capabilities` from `apps/api/src/app.ts`, `apps/app/src/lib/auth-capabilities.ts`, `apps/app/src/routes/forgot-password.tsx`, `apps/app/src/routes/reset-password.tsx`, `apps/app/src/components/recovery-screen.tsx`, and conditional controls in `apps/app/src/components/auth-screen.tsx`. Basic email/password auth remains. |
| QStash | Delete `packages/jobs`; remove API package dependency, queue setup in `apps/api/src/server.ts`, and `jobs` option, `/jobs/project-created` route, and `onProjectCreated` hook in `apps/api/src/app.ts`. Projects CRUD remains. |
| Stripe | Delete `packages/billing` and `apps/api/src/billing.ts`; remove billing imports/options/routes from `apps/api/src/server.ts` and `app.ts` and API package dependency. Remove `apps/app/src/routes/billing.tsx`, `apps/app/src/lib/billing.ts`, `apps/app/src/billing-styles.css`, links in `apps/app/src/components/app-shell.tsx`, and billing copy in `apps/web/src/routes/index.tsx`. Remove `packages/db/src/billing-schema.ts` and billing exports from its `schema.ts` and `index.ts`. |

For each removal, delete corresponding variables from `.env.example` and `turbo.json`, update relevant tests and package manifests, then run `bun install` to refresh `bun.lock`. For Stripe schema removal on an existing database, generate and review a **new** Drizzle migration, apply it to local PostgreSQL with `bun run db:migrate`, and keep previously applied migration history. After deleting frontend routes, regenerate `apps/app/src/routeTree.gen.ts` with `bun run --cwd apps/app build`. Finish with `bun run check`.

For a single app that also serves the landing page, remove `apps/web`, `fly.web.toml`, the CI "Deploy landing site" step, its `turbo.json` tasks, and root `dev:web`/`start:web` scripts and `dev` filter; point `VITE_WEB_ORIGIN` at the app origin and add public routes to `apps/app`. Projects CRUD is a removable sample: replace its table, repository, routes, UI, tests, seed, and related job with domain features; migrate deployed databases instead of rewriting applied SQL.

## Commands

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start API, app, and landing together |
| `bun run dev:api`, `dev:app`, `dev:web` | Start one service |
| `bun run build` | Build all workspaces |
| `bun run start:api`, `start:app`, `start:web` | Start built services |
| `bun run lint`, `format`, `format:check` | Biome checks and formatting |
| `bun run typecheck`, `test`, `check` | Typecheck, tests, or full verification |
| `bun run db:up`, `db:down` | Start or stop local PostgreSQL |
| `bun run db:generate`, `db:migrate`, `db:seed`, `db:studio` | Database workflow |

`bun run check` runs lint, typecheck, tests, and production builds. CI performs each check as a separate named step after starting PostgreSQL and applying migrations. CI needs no Stripe, Resend, or Upstash credentials. The optional `deploy` job ships to Fly after CI passes on `main`; see Fly.io deployment.

## Adapt the starter

1. Update product name, links, and theme color in `packages/ui/src/brand.ts`; adjust shared visual tokens in `packages/ui/tokens.css`. Search for `@starter`, `groundwork`, and the favicon mark when renaming the repository, package scope, Redis namespace, and logo.
2. Add a Drizzle table or column, generate SQL, review it, and commit the migration.
3. Add an owner-scoped repository method and validated Elysia route. Exported `App` type updates Eden calls automatically.
4. Add a typed Eden operation, TanStack Query key/options, mutation hook with awaited invalidation, and app route. Keep server secrets out of browser imports.
5. Add focused validation, database, and typed-client tests. Projects is a removable example; delete its route, repository, and table after replacing it.

## Fly.io deployment

Three Fly apps deploy from the repository root, each with a root config: `fly.api.toml` (Bun API), `fly.app.toml` (Bun product app), and `fly.web.toml` (Bun landing site). Dockerfiles live in each app directory and use the repository root as build context. Replace `starter-*` app names, `example.com` hosts, and region in all three configs, then:

```sh
fly apps create <slug>-api && fly apps create <slug>-app && fly apps create <slug>-web
fly secrets set -a <slug>-api DATABASE_URL=... BETTER_AUTH_SECRET="$(openssl rand -base64 32)"
fly deploy -c fly.api.toml   # release_command runs Drizzle migrations first
fly deploy -c fly.app.toml
fly deploy -c fly.web.toml
fly certs add api.example.com -a <slug>-api   # likewise app.example.com, example.com
```

Add optional `UPSTASH_*`, `QSTASH_*`, `RESEND_*`/`EMAIL_FROM`, and `STRIPE_*` secrets the same way. Non-secret origins live in each config's `[env]`; `VITE_` origins are `[build.args]` because they compile into frontend bundles. Use a Neon connection string for `DATABASE_URL`, in the same region as `primary_region`. API reads the client address from `Fly-Client-IP` when `FLY_APP_NAME` is present, because the socket peer is Fly's proxy; Better Auth rate limits would otherwise share one bucket. Point Stripe's webhook at `https://api.example.com/billing/webhook`. For automatic deploys, create a token with `fly tokens create org`, store it as GitHub secret `FLY_API_TOKEN`, and set repository variable `FLY_DEPLOY=true`.

## Deployment notes

Deploy all three outputs on Bun; Nitro selects its Bun preset when built with Bun. Root `start:*` commands set `NODE_ENV=production`. Provide server secrets only to API and migration jobs; app server needs its public and optional internal API origins. Set `VITE_` origins at frontend build time. Run committed migrations before starting revised API code. Keep app/API hosts on the same site or proxy API through app origin. Set explicit CORS origins and a fresh `BETTER_AUTH_SECRET`; serve public traffic over HTTPS. Protected app routes send `Cache-Control: private, no-store`; keep that policy at the hosting layer.

TanStack Start is currently a release candidate and its Vite hosting guide uses Nitro 3 beta; both are pinned to compatible published versions here. Validate host-specific output and cookie behavior before deploying. GitHub Actions workflow lives in `.github/workflows/ci.yml`.
