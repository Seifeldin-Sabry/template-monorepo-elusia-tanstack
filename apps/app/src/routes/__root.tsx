import { brand } from "@starter/ui";
import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, Layers3 } from "lucide-react";
import type { ReactNode } from "react";
import "../styles.css";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: `Projects · ${brand.name}` },
      {
        name: "description",
        content: `A clear place to organize projects in ${brand.name}.`,
      },
    ],
  }),
  notFoundComponent: NotFoundPage,
  component: Root,
});

function NotFoundPage() {
  return (
    <div className="not-found-shell">
      <header className="not-found-header">
        <Link
          to="/"
          className="not-found-brand"
          aria-label={`${brand.name} workspace home`}
        >
          <span className="not-found-brand-mark" aria-hidden="true">
            <Layers3 size={19} strokeWidth={1.8} />
          </span>
          {brand.name}
        </Link>
        <span className="not-found-header-label">Workspace / 404</span>
      </header>

      <main className="not-found-content" aria-labelledby="not-found-title">
        <span className="not-found-number" aria-hidden="true">
          404
        </span>
        <div className="not-found-copy">
          <span className="not-found-kicker">Page not found</span>
          <h1 id="not-found-title">This page isn’t here.</h1>
          <p>Check the address, or return to the workspace.</p>
          <div className="not-found-actions">
            <Link to="/" className="not-found-primary">
              Back to workspace
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <a href={brand.webUrl} className="not-found-secondary">
              Visit website
              <ArrowUpRight size={17} aria-hidden="true" />
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}

function Root() {
  return (
    <Document>
      <Outlet />
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
