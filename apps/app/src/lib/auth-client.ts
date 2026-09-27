import { createAuthClient } from "better-auth/react";
import { httpOrigin } from "./http-origin";

export const authClient = createAuthClient({
  baseURL: httpOrigin(import.meta.env.VITE_API_ORIGIN, "VITE_API_ORIGIN"),
  fetchOptions: { credentials: "include" },
});
