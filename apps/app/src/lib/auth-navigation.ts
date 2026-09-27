import { redirect } from "@tanstack/react-router";
import { getSessionUser } from "./auth-session";
import { normalizeReturnTo } from "./safe-return";

export async function requireSession(locationHref: string) {
  const user = await getSessionUser();
  if (!user) {
    throw redirect({
      to: "/login",
      search: { redirect: normalizeReturnTo(locationHref) },
    });
  }
  return { user };
}
