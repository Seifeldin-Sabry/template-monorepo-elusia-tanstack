import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import type { BetterAuthSecondaryStorage } from "@starter/cache";
import {
  account,
  type Database,
  rateLimit,
  session,
  user,
  verification,
} from "@starter/db";
import { betterAuth } from "better-auth";

export type AuthEnvironment = {
  apiOrigin: string;
  secret: string;
  trustedOrigins: string[];
  cookieDomain?: string;
  secondaryStorage?: BetterAuthSecondaryStorage;
  getClientIp?: (request: Request) => string | null;
};

export type AuthenticatedSession = {
  user: { id: string; email: string; name: string };
  session: { id: string; userId: string };
};

export type AuthService = {
  handler(request: Request): Promise<Response>;
  getSession(headers: Headers): Promise<AuthenticatedSession | null>;
};

export function createAuth(db: Database, environment: AuthEnvironment) {
  return betterAuth({
    baseURL: environment.apiOrigin,
    secret: environment.secret,
    trustedOrigins: environment.trustedOrigins,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user, session, account, verification, rateLimit },
    }),
    emailAndPassword: { enabled: true },
    advanced: {
      // Auth handler receives a sanitized x-real-ip injected from Bun's socket.
      // Never trust the client's raw forwarding headers for rate-limit keys.
      ipAddress: { ipAddressHeaders: ["x-real-ip"] },
      ...(environment.cookieDomain
        ? {
            useSecureCookies: true,
            crossSubDomainCookies: {
              enabled: true,
              domain: environment.cookieDomain,
            },
          }
        : {}),
    },
    ...(environment.secondaryStorage
      ? { secondaryStorage: environment.secondaryStorage }
      : {}),
    session: { storeSessionInDatabase: true },
    rateLimit: {
      enabled: true,
      storage: environment.secondaryStorage ? "secondary-storage" : "database",
    },
  });
}

export function createAuthService(
  db: Database,
  environment: AuthEnvironment,
): AuthService {
  const auth = createAuth(db, environment);

  return {
    handler(request) {
      const headers = new Headers(request.headers);
      headers.delete("x-real-ip");
      const address = environment.getClientIp?.(request);
      if (address) headers.set("x-real-ip", address);
      return auth.handler(new Request(request, { headers }));
    },
    async getSession(headers) {
      const current = await auth.api.getSession({ headers });
      if (!current) return null;

      return {
        user: {
          id: current.user.id,
          email: current.user.email,
          name: current.user.name,
        },
        session: { id: current.session.id, userId: current.session.userId },
      };
    },
  };
}
