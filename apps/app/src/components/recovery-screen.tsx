import { Button, brand, Input, Label } from "@starter/ui";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { authCapabilitiesQueryOptions } from "../lib/auth-capabilities";
import { authClient } from "../lib/auth-client";
import { AuthLayout } from "./auth-layout";

type RecoveryScreenProps =
  | { mode: "forgot" }
  | { mode: "reset"; token: string | null; invalidToken: boolean };

export function RecoveryScreen(props: RecoveryScreenProps) {
  const capabilities = useQuery(authCapabilitiesQueryOptions);
  const navigate = useNavigate();
  const [isPending, setIsPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [requestSent, setRequestSent] = useState(false);
  const isForgot = props.mode === "forgot";
  const emailEnabled = capabilities.data?.emailEnabled === true;
  const canReset = props.mode === "reset" && props.token && !props.invalidToken;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending || !emailEnabled) return;

    const formData = new FormData(event.currentTarget);
    setFormError(null);
    setIsPending(true);

    try {
      if (isForgot) {
        const email = String(formData.get("email") ?? "").trim();
        const result = await authClient.requestPasswordReset({
          email,
          redirectTo: new URL("/reset-password", brand.appUrl).href,
        });
        if (result.error) {
          setFormError(
            result.error.message || "Could not send reset link. Try again.",
          );
          return;
        }
        setRequestSent(true);
        return;
      }

      if (props.mode !== "reset" || !props.token || props.invalidToken) return;
      const password = String(formData.get("password") ?? "");
      const confirmation = String(formData.get("confirmPassword") ?? "");
      if (password !== confirmation) {
        setFormError("Passwords do not match.");
        return;
      }
      const result = await authClient.resetPassword({
        newPassword: password,
        token: props.token,
      });
      if (result.error) {
        setFormError(
          result.error.message || "Could not reset password. Try again.",
        );
        return;
      }
      await navigate({ href: "/login?reset=1", replace: true });
    } catch {
      setFormError("Connection failed. Check your connection and try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <AuthLayout>
      <div className="auth-intro auth-intro-standalone">
        <p className="auth-kicker">Account recovery</p>
        <h1 id="auth-title">
          {isForgot ? "Find your way back." : "Set a new password."}
        </h1>
        <p>
          {isForgot
            ? "Enter the email tied to your account. We’ll send a reset link if it exists."
            : "Choose a new password to get back to your workspace."}
        </p>
      </div>

      {capabilities.isPending && (
        <p className="auth-recovery-status" role="status">
          Checking account recovery…
        </p>
      )}
      {capabilities.isError && (
        <div className="auth-recovery-status" role="alert">
          Account service is unavailable. Try again shortly.
          <Button
            type="button"
            variant="outline"
            onClick={() => void capabilities.refetch()}
          >
            Retry
          </Button>
        </div>
      )}
      {capabilities.isSuccess && !emailEnabled && (
        <p className="auth-recovery-status" role="status">
          Email recovery is not configured for this workspace.
        </p>
      )}
      {emailEnabled && requestSent && (
        <p className="auth-form-success" role="status">
          If an account matches that address, a reset link is on its way. Check
          your inbox.
        </p>
      )}
      {emailEnabled && !isForgot && !canReset && (
        <p className="auth-form-error" role="alert">
          This reset link is missing or expired. Request a new one.
        </p>
      )}

      {emailEnabled && !requestSent && (isForgot || canReset) && (
        <form
          className="auth-form"
          onSubmit={handleSubmit}
          aria-busy={isPending}
        >
          {isForgot ? (
            <div className="auth-field">
              <Label htmlFor="recovery-email">Email address</Label>
              <Input
                id="recovery-email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="name@example.com"
                required
                disabled={isPending}
              />
            </div>
          ) : (
            <>
              <div className="auth-field">
                <Label htmlFor="recovery-password">New password</Label>
                <div className="auth-password-field">
                  <Input
                    id="recovery-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    required
                    minLength={8}
                    maxLength={128}
                    disabled={isPending}
                  />
                  <button
                    type="button"
                    className="auth-reveal"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
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
                <p className="auth-field-hint">Use at least 8 characters.</p>
              </div>
              <div className="auth-field">
                <Label htmlFor="recovery-confirm-password">
                  Confirm password
                </Label>
                <Input
                  id="recovery-confirm-password"
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
            </>
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
              ? isForgot
                ? "Sending link…"
                : "Updating password…"
              : isForgot
                ? "Send reset link"
                : "Update password"}
            {!isPending && <ArrowRight size={18} aria-hidden="true" />}
          </Button>
        </form>
      )}

      <p className="auth-switch-copy">
        {isForgot || requestSent ? (
          <Link to="/login" search={{ redirect: "/" }}>
            Back to sign in
          </Link>
        ) : (
          <Link to="/forgot-password">Request a new link</Link>
        )}
      </p>
    </AuthLayout>
  );
}
