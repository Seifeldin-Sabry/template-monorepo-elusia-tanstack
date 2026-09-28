import { Button, brand, Input, Label } from "@starter/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { authCapabilitiesQueryOptions } from "../lib/auth-capabilities";
import { authClient } from "../lib/auth-client";
import { normalizeReturnTo } from "../lib/safe-return";
import { AuthLayout } from "./auth-layout";

type AuthMode = "login" | "signup";

type AuthScreenProps = {
  mode: AuthMode;
  redirect: string;
  verified?: boolean;
  reset?: boolean;
  verificationError?: boolean;
};

export function AuthScreen({
  mode,
  redirect,
  verified = false,
  reset = false,
  verificationError = false,
}: AuthScreenProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate();
  const capabilities = useQuery(authCapabilitiesQueryOptions);
  const [isPending, setIsPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(
    null,
  );
  const [verificationNotice, setVerificationNotice] = useState<string | null>(
    null,
  );
  const isSignup = mode === "signup";
  const destination = normalizeReturnTo(redirect);
  const emailEnabled = capabilities.data?.emailEnabled === true;

  async function resendVerification() {
    if (!verificationEmail || isPending) return;
    setIsPending(true);
    setFormError(null);
    setVerificationNotice(null);
    try {
      const result = await authClient.sendVerificationEmail({
        email: verificationEmail,
        callbackURL: new URL("/login?verified=1", brand.appUrl).href,
      });
      if (result.error) {
        setFormError(
          result.error.message || "Could not resend email. Try again.",
        );
      } else {
        setVerificationNotice("Verification email sent. Check your inbox.");
      }
    } catch {
      setFormError("Connection failed. Check your connection and try again.");
    } finally {
      setIsPending(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    setFormError(null);
    setVerificationNotice(null);
    if (!isSignup) setVerificationEmail(null);
    if (isSignup) {
      if (!capabilities.isSuccess) {
        setFormError("Account service is unavailable. Try again shortly.");
        return;
      }
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
            ...(emailEnabled
              ? {
                  callbackURL: new URL("/login?verified=1", brand.appUrl).href,
                }
              : {}),
          })
        : await authClient.signIn.email({ email, password });

      if (result.error) {
        if (
          !isSignup &&
          result.error.code === "EMAIL_NOT_VERIFIED" &&
          emailEnabled
        ) {
          setVerificationEmail(email);
        }
        setFormError(
          result.error.message ||
            (isSignup
              ? "Account could not be created. Try again."
              : "Sign in failed. Check your details and try again."),
        );
        return;
      }
      if (isSignup && emailEnabled) {
        setVerificationEmail(email);
        setVerificationNotice("Check your inbox for a verification link.");
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

  if (isSignup && verificationEmail) {
    return (
      <AuthLayout>
        <div className="auth-intro auth-intro-standalone">
          <p className="auth-kicker">One more step</p>
          <h1 id="auth-title">Check your inbox.</h1>
          <p>
            If an account can be created for {verificationEmail}, a verification
            link is on its way. Open it before signing in.
          </p>
        </div>
        {verificationNotice && (
          <p className="auth-form-success" role="status">
            {verificationNotice}
          </p>
        )}
        {formError && (
          <p className="auth-form-error" role="alert">
            {formError}
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          className="auth-submit"
          onClick={() => void resendVerification()}
          disabled={isPending}
        >
          {isPending ? "Sending…" : "Resend verification email"}
          {!isPending && <ArrowRight size={18} aria-hidden="true" />}
        </Button>
        <p className="auth-switch-copy">
          Already verified?{" "}
          <Link to="/login" search={{ redirect: destination }}>
            Sign in
          </Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <nav className="auth-mode-nav" aria-label="Account access">
        <Link
          to="/login"
          search={{ redirect: destination }}
          className={isSignup ? "auth-mode-link" : "auth-mode-link is-active"}
          aria-current={isSignup ? undefined : "page"}
        >
          Sign in
        </Link>
        <Link
          to="/signup"
          search={{ redirect: destination }}
          className={isSignup ? "auth-mode-link is-active" : "auth-mode-link"}
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

      {verified && !verificationError && (
        <p className="auth-form-success" role="status">
          Email verified. Sign in to continue.
        </p>
      )}
      {reset && (
        <p className="auth-form-success" role="status">
          Password updated. Sign in with your new password.
        </p>
      )}
      {verificationError && (
        <p className="auth-form-error" role="alert">
          Verification link is invalid or expired. Sign in to request a new
          link.
        </p>
      )}

      <form className="auth-form" onSubmit={handleSubmit} aria-busy={isPending}>
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

        {!isSignup && emailEnabled && (
          <div className="auth-sub-actions">
            <Link to="/forgot-password">Forgot password?</Link>
          </div>
        )}

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

        {!isSignup && verificationEmail && emailEnabled && (
          <Button
            type="button"
            variant="outline"
            onClick={() => void resendVerification()}
            disabled={isPending}
          >
            {isPending ? "Sending…" : "Resend verification email"}
          </Button>
        )}

        {verificationNotice && (
          <p className="auth-form-success" role="status">
            {verificationNotice}
          </p>
        )}

        {isSignup && capabilities.isError && (
          <p className="auth-form-error" role="alert">
            Account service is unavailable. Try again shortly.
          </p>
        )}

        <Button
          className="auth-submit"
          type="submit"
          size="lg"
          disabled={isPending || (isSignup && !capabilities.isSuccess)}
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
    </AuthLayout>
  );
}
