import { Button, brand, Input, Label } from "@starter/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  Eye,
  EyeOff,
  Layers3,
  LoaderCircle,
} from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { authClient } from "../lib/auth-client";
import { normalizeReturnTo } from "../lib/safe-return";
import "../auth-styles.css";

type AuthMode = "login" | "signup";

type AuthScreenProps = {
  mode: AuthMode;
  redirect: string;
};

export function AuthScreen({ mode, redirect }: AuthScreenProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate();
  const [isPending, setIsPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const isSignup = mode === "signup";
  const destination = normalizeReturnTo(redirect);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    setFormError(null);
    if (isSignup) {
      const confirmation = String(formData.get("confirmPassword") ?? "");

      if (!name) {
        setFormError("Enter your name to create an account.");
        return;
      }
      if (password !== confirmation) {
        setFormError("Passwords do not match.");
        return;
      }
    }

    setIsPending(true);
    let authenticated = false;
    try {
      const result = isSignup
        ? await authClient.signUp.email({
            name,
            email,
            password,
          })
        : await authClient.signIn.email({ email, password });

      if (result.error) {
        setFormError(
          result.error.message ||
            (isSignup
              ? "Account could not be created. Try again."
              : "Sign in failed. Check your details and try again."),
        );
        return;
      }
      authenticated = true;
      queryClient.clear();
      await router.invalidate();
      await navigate({ href: destination, replace: true });
    } catch {
      setFormError(
        authenticated
          ? "Signed in, but workspace could not open. Try reloading."
          : "Connection failed. Check your connection and try again.",
      );
    } finally {
      setIsPending(false);
    }
  }

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

        <div className="auth-form-wrap">
          <nav className="auth-mode-nav" aria-label="Account access">
            <Link
              to="/login"
              search={{ redirect: destination }}
              className={
                isSignup ? "auth-mode-link" : "auth-mode-link is-active"
              }
              aria-current={isSignup ? undefined : "page"}
            >
              Sign in
            </Link>
            <Link
              to="/signup"
              search={{ redirect: destination }}
              className={
                isSignup ? "auth-mode-link is-active" : "auth-mode-link"
              }
              aria-current={isSignup ? "page" : undefined}
            >
              Create account
            </Link>
          </nav>

          <div className="auth-intro">
            <p className="auth-kicker">
              {isSignup ? "Get started" : "Your workspace"}
            </p>
            <h1 id="auth-title">
              {isSignup ? "Make room for what’s next." : "Welcome back."}
            </h1>
            <p>
              {isSignup
                ? "Create an account and give your projects a place to begin."
                : "Sign in to pick up where your work left off."}
            </p>
          </div>

          <form
            className="auth-form"
            onSubmit={handleSubmit}
            aria-busy={isPending}
          >
            {isSignup && (
              <div className="auth-field">
                <Label htmlFor="auth-name">Full name</Label>
                <Input
                  id="auth-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Your name"
                  required
                  maxLength={100}
                  disabled={isPending}
                />
              </div>
            )}

            <div className="auth-field">
              <Label htmlFor="auth-email">Email address</Label>
              <Input
                id="auth-email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="name@example.com"
                required
                disabled={isPending}
              />
            </div>

            <div className="auth-field">
              <Label htmlFor="auth-password">Password</Label>
              <div className="auth-password-field">
                <Input
                  id="auth-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  placeholder={
                    isSignup ? "At least 8 characters" : "Enter password"
                  }
                  required
                  minLength={isSignup ? 8 : undefined}
                  maxLength={128}
                  disabled={isPending}
                />
                <button
                  type="button"
                  className="auth-reveal"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((visible) => !visible)}
                  disabled={isPending}
                >
                  {showPassword ? (
                    <EyeOff size={18} strokeWidth={1.8} aria-hidden="true" />
                  ) : (
                    <Eye size={18} strokeWidth={1.8} aria-hidden="true" />
                  )}
                </button>
              </div>
              {isSignup && (
                <p className="auth-field-hint">Use at least 8 characters.</p>
              )}
            </div>

            {isSignup && (
              <div className="auth-field">
                <Label htmlFor="auth-confirm-password">Confirm password</Label>
                <Input
                  id="auth-confirm-password"
                  name="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Enter password again"
                  required
                  minLength={8}
                  maxLength={128}
                  disabled={isPending}
                />
              </div>
            )}

            {formError && (
              <p className="auth-form-error" role="alert">
                {formError}
              </p>
            )}

            <Button
              className="auth-submit"
              type="submit"
              size="lg"
              disabled={isPending}
            >
              {isPending ? (
                <LoaderCircle className="auth-spinner" aria-hidden="true" />
              ) : null}
              {isPending
                ? isSignup
                  ? "Creating account…"
                  : "Signing in…"
                : isSignup
                  ? "Create account"
                  : "Sign in"}
              {!isPending && <ArrowRight size={18} aria-hidden="true" />}
            </Button>
          </form>

          <p className="auth-switch-copy">
            {isSignup ? "Already have an account?" : `New to ${brand.name}?`}{" "}
            <Link
              to={isSignup ? "/login" : "/signup"}
              search={{ redirect: destination }}
            >
              {isSignup ? "Sign in" : "Create an account"}
            </Link>
          </p>
        </div>

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
