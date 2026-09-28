import { brand } from "@starter/ui";
import { createFileRoute } from "@tanstack/react-router";
import { RecoveryScreen } from "../components/recovery-screen";
import { isSearchFlagTrue } from "../lib/auth-search";

type ResetSearch = {
  token?: string;
  invalidToken?: boolean;
};

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): ResetSearch => ({
    ...(typeof search.token === "string" && search.token.length > 0
      ? { token: search.token }
      : {}),
    ...(search.error === "INVALID_TOKEN" ||
    isSearchFlagTrue(search.invalidToken)
      ? { invalidToken: true }
      : {}),
  }),
  headers: () => ({
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
  }),
  head: () => ({
    meta: [
      { title: `Choose new password · ${brand.name}` },
      { name: "robots", content: "noindex" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token, invalidToken } = Route.useSearch();
  return (
    <RecoveryScreen
      mode="reset"
      token={token ?? null}
      invalidToken={invalidToken === true}
    />
  );
}
