# Groundwork

Reusable full-stack starter with a Bun/Elysia API, two TanStack Start sites, and PostgreSQL. Projects CRUD shows the complete path from Drizzle through Elysia and typed Eden Treaty calls to a TanStack Query interface. Better Auth supplies email/password sessions. Optional integrations add Upstash Redis and Stripe billing with both subscriptions and one-time purchases.

## First run

Requires Bun 1.4.0, Docker with Compose, and Git. Node 20.20+ runs the product app's built server.

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
| `packages/ui` | Shared shadcn-style controls, Tailwind tokens, brand settings |

The app imports `@starter/api/contract` as a **type only** and calls API routes through Eden Treaty. Its browser bundle contains no database or API runtime module. Query options define one projects cache key; `useCreateProject`, `useUpdateProject`, and `useDeleteProject` await invalidation on success. Server rendering uses a request-scoped QueryClient and forwards the session cookie for API reads.

## Environment

Copy `.env.example` to ignored `.env`. Root development, build, test, and database scripts use dotenvx. `bunfig.toml` disables Bun's implicit `.env` loading, so dotenvx is the single file loader. API validates required settings at startup; app server validates origins before API requests. Keep secrets out of `VITE_` variables; those values are public in frontend builds. Turborepo declares task environment inputs for caching and process forwarding.

| Variable | Purpose |
| --- | --- |
| `POSTGRES_PORT` | Docker host port, default 5432 |
| `DATABASE_URL` | API/seed PostgreSQL URL; use Neon pooled URL for hosted traffic |
| `DATABASE_MIGRATION_URL` | Optional direct Neon URL for migrations; local setup falls back to `DATABASE_URL` |
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
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Optional Stripe test/live secret and signing secret |
| `STRIPE_SUBSCRIPTION_PRICE_ID`, `STRIPE_ONE_TIME_PRICE_ID` | Server-owned recurring and one-time Price IDs |

### Local PostgreSQL and Neon

`bun run db:up` starts PostgreSQL 17 in Docker Compose. Same Postgres.js driver and migrations work with standard PostgreSQL and Neon. For Neon, set `DATABASE_URL` to a pooled connection string and `DATABASE_MIGRATION_URL` to a direct string. The migration command rejects a Neon pooler hostname when no direct URL is supplied. Never run integration tests against production data.

Change `packages/db/src/schema.ts` and related schema files, run `bun run db:generate`, review generated SQL, commit migration files, then run `bun run db:migrate`. Run migrations before a new API deployment. `db:studio` opens Drizzle Studio with the configured database.

### Better Auth

Email/password registration, sign-in, sign-out, and database-backed sessions work without another service. Projects and billing routes require a session; project records are scoped to the session user. Better Auth rate limits use PostgreSQL by default. With both Upstash values present, rate-limit counters use Redis while sessions remain in PostgreSQL. Partial Upstash configuration fails at API startup.

Localhost works across the app/API ports. For HTTPS sibling hosts such as `app.example.com` and `api.example.com`, set `AUTH_COOKIE_DOMAIN=example.com`; both hosts must match that domain. If hosts belong to different registrable domains, place an API/auth reverse proxy on the app's origin to avoid third-party cookie failures. Keep `API_ORIGIN` public; use `API_INTERNAL_ORIGIN` only when the app server needs a private route to the API. At a public reverse proxy, strip client-supplied IP headers and configure Better Auth's trusted IP header settings for accurate per-client rate limits.

This basic auth setup has no email verification, password-reset delivery, or social login. Add a mail provider and those flows before relying on verified email identity or supporting paid accounts at scale.

### Stripe: subscriptions and one-time purchases

Billing is optional. Create a recurring Price and a one-time Price in Stripe test mode. Set all four `STRIPE_*` variables in `.env`; leaving all blank disables billing, while a partial configuration fails at startup. Checkout accepts only `subscription` or `one_time`; API selects Price IDs from server configuration. Both modes use hosted Stripe Checkout. Subscription customers can open Stripe Customer Portal. Signed webhooks reconcile subscription state and one-time purchase records into PostgreSQL; processed Stripe event IDs prevent duplicate writes. The UI shows current state from the database.

For local webhook forwarding, install Stripe CLI and run:

```sh
stripe listen --forward-to http://localhost:3001/billing/webhook
```

Copy the printed `whsec_...` value into `STRIPE_WEBHOOK_SECRET`, restart API, then use Stripe test cards through the billing page. Configure the same webhook endpoint and event types in Stripe for deployment: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, and `customer.subscription.created`, `.updated`, `.deleted`. Configure Customer Portal in Stripe before offering its link. No Stripe credentials are committed, and live payment processing needs a real Stripe account and webhook endpoint.

Billing records demonstrate integration; they do not grant application entitlements yet. Add an explicit server-side entitlement check for paid product features. For production, add email recovery/verification and reconcile operational exceptions from Stripe Dashboard.

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

`bun run check` runs lint, typecheck, tests, and production builds. CI performs the same checks after starting PostgreSQL and applying migrations.

## Adapt the starter

1. Update product name, links, and theme color in `packages/ui/src/brand.ts`; adjust shared visual tokens in `packages/ui/tokens.css`. Search for `@starter`, `groundwork`, and the favicon mark when renaming the repository, package scope, Redis namespace, and logo.
2. Add a Drizzle table or column, generate SQL, review it, and commit the migration.
3. Add an owner-scoped repository method and validated Elysia route. Exported `App` type updates Eden calls automatically.
4. Add a typed Eden operation, TanStack Query key/options, mutation hook with awaited invalidation, and app route. Keep server secrets out of browser imports.
5. Add focused validation, database, and typed-client tests. Projects is a removable example; delete its route, repository, and table after replacing it.

## Deployment notes

Deploy API and landing output on Bun; deploy app output on Node. Root `start:*` commands set `NODE_ENV=production`. Provide server secrets only to API and migration jobs; app server needs its public and optional internal API origins. Set `VITE_` origins at frontend build time. Run committed migrations before starting revised API code. Keep app/API hosts on the same site or proxy API through app origin. Set explicit CORS origins and a fresh `BETTER_AUTH_SECRET`; serve public traffic over HTTPS. Protected app routes send `Cache-Control: private, no-store`; keep that policy at the hosting layer.

TanStack Start is currently a release candidate and its Vite hosting guide uses Nitro 3 beta; both are pinned to compatible published versions here. Validate host-specific output and cookie behavior before deploying. GitHub Actions workflow lives in `.github/workflows/ci.yml`.
