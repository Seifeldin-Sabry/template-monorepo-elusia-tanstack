import { brand } from "@starter/ui";
import { createFileRoute } from "@tanstack/react-router";
import { RecoveryScreen } from "../components/recovery-screen";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: `Reset password · ${brand.name}` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  return <RecoveryScreen mode="forgot" />;
}
