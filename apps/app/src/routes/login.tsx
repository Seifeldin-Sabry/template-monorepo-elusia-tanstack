import { brand } from "@starter/ui";
import { createFileRoute } from "@tanstack/react-router";
import { AuthScreen } from "../components/auth-screen";
import { normalizeReturnTo } from "../lib/safe-return";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: normalizeReturnTo(search.redirect),
  }),
  head: () => ({
    meta: [
      { title: `Sign in · ${brand.name}` },
      {
        name: "description",
        content: `Sign in to your ${brand.name} workspace.`,
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { redirect } = Route.useSearch();
  return <AuthScreen mode="login" redirect={redirect} />;
}
