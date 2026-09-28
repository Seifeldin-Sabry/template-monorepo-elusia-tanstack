import { brand } from "@starter/ui";
import { ArrowUpRight, Layers3 } from "lucide-react";
import type { ReactNode } from "react";
import "../auth-styles.css";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-shell">
      <aside className="auth-story" aria-label={`About ${brand.name}`}>
        <a className="auth-brand auth-brand-on-dark" href={brand.webUrl}>
          <span className="auth-brand-mark" aria-hidden="true">
            <Layers3 size={21} strokeWidth={1.8} />
          </span>
          <span>{brand.name}</span>
        </a>

        <div className="auth-story-body">
          <div className="auth-story-rule" aria-hidden="true" />
          <p className="auth-story-label">A workspace with room to grow</p>
          <h2>Build from solid ground.</h2>
          <p className="auth-story-copy">
            Keep projects close, ideas organized, and next steps clear. Start
            with a foundation that leaves space for the work ahead.
          </p>
          <div className="auth-story-graphic" aria-hidden="true">
            <span className="auth-graphic-track auth-graphic-track-one" />
            <span className="auth-graphic-track auth-graphic-track-two" />
            <span className="auth-graphic-track auth-graphic-track-three" />
            <span className="auth-graphic-block auth-graphic-block-one" />
            <span className="auth-graphic-block auth-graphic-block-two" />
            <span className="auth-graphic-block auth-graphic-block-three" />
          </div>
        </div>

        <div className="auth-story-footer">
          <span>{brand.tagline}</span>
          <ArrowUpRight size={18} strokeWidth={1.6} aria-hidden="true" />
        </div>
      </aside>

      <section className="auth-form-side" aria-labelledby="auth-title">
        <div className="auth-mobile-brand">
          <a className="auth-brand" href={brand.webUrl}>
            <span className="auth-brand-mark" aria-hidden="true">
              <Layers3 size={19} strokeWidth={1.8} />
            </span>
            <span>{brand.name}</span>
          </a>
        </div>

        <div className="auth-form-wrap">{children}</div>

        <footer className="auth-footer">
          <span>
            © {new Date().getFullYear()} {brand.name}
          </span>
          <a href={brand.webUrl}>
            Visit website <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </footer>
      </section>
    </main>
  );
}
