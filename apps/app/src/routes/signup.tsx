import { brand } from "@starter/ui";
import { createFileRoute } from "@tanstack/react-router";
import { AuthScreen } from "../components/auth-screen";
import { normalizeReturnTo } from "../lib/safe-return";

export const Route = createFileRoute("/signup")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: normalizeReturnTo(search.redirect),
  }),
  head: () => ({
    meta: [
      { title: `Create account · ${brand.name}` },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content: `Create an account to get started with ${brand.name}.`,
      },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const { redirect } = Route.useSearch();
  return <AuthScreen mode="signup" redirect={redirect} />;
}
