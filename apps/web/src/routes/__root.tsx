import { brand } from "@starter/ui";
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import "../styles.css";

const description =
  "A connected Bun monorepo starter with TanStack Start, Elysia, PostgreSQL, Better Auth, and optional Stripe Checkout and Upstash Redis.";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: `${brand.name} — Full-stack starter` },
      { name: "description", content: description },
      { name: "theme-color", content: brand.themeColor },
      { property: "og:type", content: "website" },
      { property: "og:title", content: `${brand.name} — Full-stack starter` },
      { property: "og:description", content: description },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }],
  }),
  component: RootComponent,
  notFoundComponent: RootNotFound,
});

function RootComponent() {
  return (
    <Document>
      <Outlet />
    </Document>
  );
}

function RootNotFound() {
  return (
    <Document>
      <main id="main" className="not-found page-wrap">
        <a className="wordmark" href="/" aria-label={`${brand.name} home`}>
          <span className="wordmark-symbol" aria-hidden="true">
            <span>g.</span>
          </span>
          {brand.name}
        </a>
        <div>
          <p className="eyebrow">404 · Page not found</p>
          <h1>Nothing lives at this path.</h1>
          <p>Start from the homepage or open the product app.</p>
          <div className="hero-actions">
            <a className="text-action" href="/">
              Back to homepage
            </a>
            <a className="text-action" href={brand.appUrl}>
              Open app
            </a>
          </div>
        </div>
      </main>
    </Document>
  );
}

function Document({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
