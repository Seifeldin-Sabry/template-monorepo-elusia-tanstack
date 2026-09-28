import { brand } from "@starter/ui";
import { createFileRoute } from "@tanstack/react-router";
import { AuthScreen } from "../components/auth-screen";
import { isSearchFlagTrue } from "../lib/auth-search";
import { normalizeReturnTo } from "../lib/safe-return";

type LoginSearch = {
  redirect: string;
  verified?: boolean;
  reset?: boolean;
  verificationError?: boolean;
};

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: normalizeReturnTo(search.redirect),
    ...(isSearchFlagTrue(search.verified) ? { verified: true } : {}),
    ...(isSearchFlagTrue(search.reset) ? { reset: true } : {}),
    ...(search.error === "invalid_token" ||
    isSearchFlagTrue(search.verificationError)
      ? { verificationError: true }
      : {}),
  }),
  head: () => ({
    meta: [
      { title: `Sign in · ${brand.name}` },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content: `Sign in to your ${brand.name} workspace.`,
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { redirect, verified, reset, verificationError } = Route.useSearch();
  return (
    <AuthScreen
      mode="login"
      redirect={redirect}
      verified={verified === true}
      reset={reset === true}
      verificationError={verificationError === true}
    />
  );
}
