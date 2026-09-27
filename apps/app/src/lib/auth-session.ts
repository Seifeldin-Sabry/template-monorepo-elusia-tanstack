import { createServerFn } from "@tanstack/react-start";
import {
  getRequestHeaders,
  setResponseHeader,
} from "@tanstack/react-start/server";
import { httpOrigin } from "./http-origin";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
};

function isSessionUser(value: unknown): value is SessionUser {
  if (!value || typeof value !== "object") return false;
  const user = value as Record<string, unknown>;
  return (
    typeof user.id === "string" &&
    typeof user.name === "string" &&
    typeof user.email === "string"
  );
}

export const getSessionUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionUser | null> => {
    setResponseHeader("Cache-Control", "private, no-store");
    const origin = httpOrigin(
      process.env.API_INTERNAL_ORIGIN ?? process.env.API_ORIGIN,
      "API_INTERNAL_ORIGIN or API_ORIGIN",
    );

    const cookie = getRequestHeaders().get("cookie");
    const response = await fetch(new URL("/api/auth/get-session", origin), {
      ...(cookie ? { headers: { cookie } } : {}),
      cache: "no-store",
    });

    if (response.status === 401) return null;
    if (!response.ok) {
      throw new Error("Authentication service is unavailable. Try again.");
    }

    const payload: unknown = await response.json();
    if (payload === null) return null;
    if (!payload || typeof payload !== "object" || !("user" in payload)) {
      throw new Error("Authentication service returned an invalid session.");
    }

    return isSessionUser(payload.user) ? payload.user : null;
  },
);
