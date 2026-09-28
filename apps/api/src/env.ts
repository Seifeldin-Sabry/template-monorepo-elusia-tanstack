import type { LogLevel } from "./logger";

export type ApiEnvironment = {
  databaseUrl: string;
  host: string;
  port: number;
  apiOrigin: string;
  authSecret: string;
  authCookieDomain?: string;
  allowedOrigins: string[];
  logLevel: LogLevel;
};

export function readApiEnvironment(
  env: Record<string, string | undefined>,
): ApiEnvironment {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  let databaseProtocol: string;
  try {
    databaseProtocol = new URL(databaseUrl).protocol;
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL");
  }
  if (!["postgres:", "postgresql:"].includes(databaseProtocol)) {
    throw new Error("DATABASE_URL must use postgres:// or postgresql://");
  }

  const host = env.API_HOST || "0.0.0.0";
  const port = Number(env.API_PORT || "3001");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("API_PORT must be an integer between 1 and 65535");
  }

  const apiOrigin = env.API_ORIGIN;
  if (!apiOrigin) throw new Error("API_ORIGIN is required");
  assertOrigin(apiOrigin, "API_ORIGIN");
  const apiUrl = new URL(apiOrigin);

  const authCookieDomain = env.AUTH_COOKIE_DOMAIN?.trim() || undefined;
  if (authCookieDomain) {
    const labels = authCookieDomain.split(".");
    if (
      authCookieDomain !== authCookieDomain.toLowerCase() ||
      labels.length < 2 ||
      labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))
    ) {
      throw new Error(
        "AUTH_COOKIE_DOMAIN must be a plain lowercase domain name",
      );
    }
    const appOrigin = env.APP_ORIGIN;
    if (!appOrigin)
      throw new Error("APP_ORIGIN is required with AUTH_COOKIE_DOMAIN");
    assertOrigin(appOrigin, "APP_ORIGIN");
    const appUrl = new URL(appOrigin);
    if (apiUrl.protocol !== "https:" || appUrl.protocol !== "https:") {
      throw new Error(
        "AUTH_COOKIE_DOMAIN requires HTTPS API_ORIGIN and APP_ORIGIN",
      );
    }
    const hosts: [string, string][] = [
      ["API_ORIGIN", apiUrl.hostname],
      ["APP_ORIGIN", appUrl.hostname],
    ];
    for (const [name, hostname] of hosts) {
      if (
        hostname !== authCookieDomain &&
        !hostname.endsWith(`.${authCookieDomain}`)
      ) {
        throw new Error(`${name} must be hosted under AUTH_COOKIE_DOMAIN`);
      }
    }
  }

  if (
    env.NODE_ENV === "production" &&
    apiUrl.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(apiUrl.hostname)
  ) {
    throw new Error("Production API_ORIGIN must use HTTPS");
  }

  const authSecret = env.BETTER_AUTH_SECRET;
  if (!authSecret || authSecret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters");
  }
  if (
    env.NODE_ENV === "production" &&
    authSecret === "local-only-better-auth-secret-1234567890"
  ) {
    throw new Error("Replace local-only BETTER_AUTH_SECRET before production");
  }

  const allowedOrigins = [
    ...new Set(
      (env.CORS_ORIGINS || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
  if (allowedOrigins.length === 0)
    throw new Error("CORS_ORIGINS must list at least one origin");
  if (authCookieDomain && !allowedOrigins.includes(env.APP_ORIGIN ?? "")) {
    throw new Error(
      "CORS_ORIGINS must include APP_ORIGIN with AUTH_COOKIE_DOMAIN",
    );
  }

  for (const origin of allowedOrigins) {
    assertOrigin(origin, "CORS origin");
  }

  const logLevel = env.LOG_LEVEL || "info";
  if (!isLogLevel(logLevel)) {
    throw new Error(
      "LOG_LEVEL must be trace, debug, info, warn, error, fatal, or silent",
    );
  }

  return {
    databaseUrl,
    host,
    port,
    apiOrigin,
    authSecret,
    ...(authCookieDomain ? { authCookieDomain } : {}),
    allowedOrigins,
    logLevel,
  };
}

function isLogLevel(value: string): value is ApiEnvironment["logLevel"] {
  return [
    "trace",
    "debug",
    "info",
    "warn",
    "error",
    "fatal",
    "silent",
  ].includes(value);
}

function assertOrigin(origin: string, name: string) {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error(`${name} must be an exact HTTP(S) origin: ${origin}`);
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.origin !== origin ||
    url.username ||
    url.password
  ) {
    throw new Error(`${name} must be an exact HTTP(S) origin: ${origin}`);
  }
}
