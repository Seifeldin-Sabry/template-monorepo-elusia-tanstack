import { Button, brand } from "@starter/ui";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Blocks,
  Braces,
  CreditCard,
  Database,
  Layers3,
  Network,
  ShieldCheck,
  Terminal,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/")({ component: HomePage });

const layers = [
  {
    icon: Layers3,
    label: "Interface",
    title: "TanStack Start",
    detail: "Product app and public site",
    path: "apps/app · apps/web",
  },
  {
    icon: Network,
    label: "Contract",
    title: "Eden Treaty",
    detail: "Typed requests from API shape",
    path: "apps/app → apps/api",
  },
  {
    icon: Braces,
    label: "Service",
    title: "Elysia",
    detail: "Validated routes on Bun",
    path: "apps/api",
  },
  {
    icon: Blocks,
    label: "Data access",
    title: "Drizzle",
    detail: "Schema and SQL migrations",
    path: "packages/db",
  },
  {
    icon: Database,
    label: "Storage",
    title: "PostgreSQL",
    detail: "Local or hosted on Neon",
    path: "Postgres",
  },
] as const;

const workspaces = [
  {
    path: "apps/web",
    role: "Landing",
    purpose: "A public entry point, ready for your product story.",
  },
  {
    path: "apps/app",
    role: "Product",
    purpose: "Account-aware projects CRUD and billing screens.",
  },
  {
    path: "apps/api",
    role: "API",
    purpose: "Elysia routes, validation, and a typed contract.",
  },
  {
    path: "packages/db",
    role: "Database",
    purpose: "Postgres schema, migrations, and connection setup.",
  },
  {
    path: "packages/ui",
    role: "Interface",
    purpose: "Shared tokens and editable shadcn-style components.",
  },
  {
    path: "packages/billing",
    role: "Payments",
    purpose: "Stripe Checkout, portal, and webhook handling.",
  },
  {
    path: "packages/cache",
    role: "Storage",
    purpose: "Optional Upstash Redis for auth secondary storage.",
  },
] as const;

const capabilities = [
  {
    icon: ShieldCheck,
    label: "Identity",
    title: "Better Auth",
    detail:
      "Email and password sign-in, database sessions, and rate limits. Projects belong to the signed-in account.",
  },
  {
    icon: CreditCard,
    label: "Payments",
    title: "Stripe Checkout",
    detail:
      "Hosted checkout for subscriptions and one-time purchases, with a billing portal and verified webhooks. Add Stripe keys and Price IDs to enable it.",
  },
  {
    icon: Zap,
    label: "Optional cache",
    title: "Upstash Redis",
    detail:
      "Plug in secondary storage for Better Auth and rate limiting. Leave its credentials empty to run with PostgreSQL alone.",
  },
] as const;

function HomePage() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="site-header-inner page-wrap">
          <a className="wordmark" href="/" aria-label={`${brand.name} home`}>
            <span className="wordmark-symbol" aria-hidden="true">
              g<span>.</span>
            </span>
            <span>{brand.name}</span>
          </a>
          <nav className="desktop-nav" aria-label="Primary">
            <a href="#architecture">Architecture</a>
            <a href="#capabilities">Features</a>
            <a href="#start">Setup</a>
          </nav>
          <Button asChild size="sm" className="header-action">
            <a href={brand.appUrl}>
              Open app <ArrowUpRight aria-hidden="true" />
            </a>
          </Button>
        </div>
      </header>

      <main id="main">
        <section className="hero page-wrap" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="eyebrow-rule" /> Full-stack starter
            </p>
            <h1 id="hero-title">
              Working code.
              <br />
              From day one.
            </h1>
            <p className="hero-lede">
              TanStack Start, Elysia, Eden Treaty, and Postgres in one connected
              Bun workspace.
            </p>
            <div className="hero-actions">
              <Button asChild size="lg">
                <a href={brand.appUrl}>
                  Open app <ArrowUpRight aria-hidden="true" />
                </a>
              </Button>
              <a className="text-action" href="#architecture">
                See architecture <ArrowDownRight aria-hidden="true" />
              </a>
            </div>
            <p className="hero-note">
              Projects CRUD traces the full path. Auth is ready; Stripe and
              Redis are opt-in.
            </p>
          </div>
          <SystemMap />
        </section>

        <section
          className="workspaces-section page-wrap"
          id="architecture"
          aria-labelledby="architecture-title"
        >
          <div className="section-intro">
            <div>
              <h2 id="architecture-title">
                One repository.
                <br />
                Clear boundaries.
              </h2>
            </div>
            <p>
              Each package has a job. Shared types travel through the system;
              server code and credentials stay on the server.
            </p>
          </div>
          <ul
            className="workspace-table"
            id="included"
            aria-label="Included workspaces"
          >
            {workspaces.map((workspace) => (
              <li className="workspace-row" key={workspace.path}>
                <code>{workspace.path}</code>
                <strong>{workspace.role}</strong>
                <p>{workspace.purpose}</p>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="capabilities-section page-wrap"
          id="capabilities"
          aria-labelledby="capabilities-title"
        >
          <div className="section-intro">
            <div>
              <h2 id="capabilities-title">
                Beyond the
                <br />
                sample feature.
              </h2>
            </div>
            <p>
              Projects demonstrate the request path. Identity, payments, and
              optional caching have their own boundaries, ready for the product
              you build next.
            </p>
          </div>
          <ol className="capabilities-list">
            {capabilities.map(({ icon: Icon, label, title, detail }, index) => (
              <li className="capability-row" key={title}>
                <div className="capability-marker">
                  <span>0{index + 1}</span>
                  <Icon aria-hidden="true" size={20} strokeWidth={1.7} />
                </div>
                <div>
                  <span className="capability-label">{label}</span>
                  <h3>{title}</h3>
                </div>
                <p>{detail}</p>
              </li>
            ))}
          </ol>
        </section>

        <section
          className="start-section"
          id="start"
          aria-labelledby="start-title"
        >
          <div className="page-wrap start-layout">
            <div className="start-copy">
              <h2 id="start-title">
                Clone. Configure.
                <br />
                Make it yours.
              </h2>
              <p>
                Start with local Postgres, apply committed migrations, then run
                both frontends and API together. Add Stripe and Upstash
                credentials when needed.
              </p>
              <a className="start-link" href={brand.appUrl}>
                Explore sample app <ArrowUpRight aria-hidden="true" />
              </a>
            </div>
            <section className="quickstart" aria-label="Quickstart commands">
              <div className="quickstart-heading">
                <Terminal aria-hidden="true" />
                <span>From repository root</span>
              </div>
              <ol>
                <li>
                  <span>01</span>
                  <code>bun install</code>
                </li>
                <li>
                  <span>02</span>
                  <code>cp .env.example .env</code>
                </li>
                <li>
                  <span>03</span>
                  <code>bun run db:up</code>
                </li>
                <li>
                  <span>04</span>
                  <code>bun run db:migrate</code>
                </li>
                <li>
                  <span>05</span>
                  <code>bun run dev</code>
                </li>
              </ol>
              <p>
                Open product app at <code>localhost:3000</code>.
              </p>
            </section>
          </div>
        </section>
      </main>

      <footer className="site-footer page-wrap">
        <p>Good foundations leave room to build.</p>
        <div className="footer-meta">
          <strong className="footer-wordmark">{brand.name}</strong>
          <div>
            <a href="#architecture">Architecture</a>
            <a href="#capabilities">Features</a>
            <a href="#start">Setup</a>
            <a href={brand.appUrl}>
              Open app <ArrowRight aria-hidden="true" />
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}

function SystemMap() {
  return (
    <figure className="system-map" aria-labelledby="system-map-title">
      <div className="system-map-topline">
        <span id="system-map-title">Request path</span>
        <span>Browser to database</span>
      </div>
      <ol className="system-map-layers">
        {layers.map(({ icon: Icon, label, title, detail, path }, index) => (
          <li className="system-layer" key={title}>
            <div className="layer-leading">
              <span className="layer-index">0{index + 1}</span>
              <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
            </div>
            <div className="layer-content">
              <span className="layer-label">{label}</span>
              <strong>{title}</strong>
              <p>{detail}</p>
              <code>{path}</code>
            </div>
            {index < layers.length - 1 && (
              <ArrowRight
                className="layer-arrow"
                aria-hidden="true"
                size={16}
              />
            )}
          </li>
        ))}
      </ol>
      <figcaption>
        <span>
          <span className="status-mark" /> Connected by a typed contract
        </span>
        <span>Projects CRUD is the working example</span>
      </figcaption>
    </figure>
  );
}
