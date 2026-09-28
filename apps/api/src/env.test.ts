import { expect, test } from "bun:test";
import { readApiEnvironment } from "./env";

const valid = {
  DATABASE_URL: "postgres://starter:starter@localhost:5432/starter",
  API_ORIGIN: "http://localhost:3001",
  BETTER_AUTH_SECRET: "local-test-secret-at-least-thirty-two-chars",
  CORS_ORIGINS: "http://localhost:3000,https://example.com",
};

test("validates and deduplicates explicit CORS origins", () => {
  expect(
    readApiEnvironment({
      ...valid,
      CORS_ORIGINS:
        "http://localhost:3000, https://example.com, http://localhost:3000",
    }).allowedOrigins,
  ).toEqual(["http://localhost:3000", "https://example.com"]);
});

test("rejects wildcard or URL path in CORS origin", () => {
  expect(() => readApiEnvironment({ ...valid, CORS_ORIGINS: "*" })).toThrow();
  expect(() =>
    readApiEnvironment({ ...valid, CORS_ORIGINS: "https://example.com/path" }),
  ).toThrow();
});

test("rejects invalid database and port configuration", () => {
  expect(() =>
    readApiEnvironment({ ...valid, DATABASE_URL: "sqlite:example" }),
  ).toThrow();
  expect(() => readApiEnvironment({ ...valid, API_PORT: "99999" })).toThrow();
  expect(() =>
    readApiEnvironment({ ...valid, API_ORIGIN: "http://localhost:3001/path" }),
  ).toThrow();
  expect(() =>
    readApiEnvironment({ ...valid, BETTER_AUTH_SECRET: "short" }),
  ).toThrow();
});

test("validates shared auth cookie domain for sibling HTTPS hosts", () => {
  const deployment = {
    ...valid,
    API_ORIGIN: "https://api.example.com",
    APP_ORIGIN: "https://app.example.com",
    CORS_ORIGINS: "https://app.example.com",
    AUTH_COOKIE_DOMAIN: "example.com",
    NODE_ENV: "production",
  };
  expect(readApiEnvironment(deployment).authCookieDomain).toBe("example.com");

  expect(() =>
    readApiEnvironment({ ...deployment, API_ORIGIN: "http://api.example.com" }),
  ).toThrow();
  expect(() =>
    readApiEnvironment({ ...deployment, APP_ORIGIN: "https://app.other.com" }),
  ).toThrow();
  expect(() =>
    readApiEnvironment({ ...deployment, AUTH_COOKIE_DOMAIN: "example..com" }),
  ).toThrow();
  expect(() =>
    readApiEnvironment({
      ...deployment,
      CORS_ORIGINS: "https://web.example.com",
    }),
  ).toThrow();
  expect(() =>
    readApiEnvironment({ ...deployment, AUTH_COOKIE_DOMAIN: "com" }),
  ).toThrow();
});

test("rejects insecure public production API origin", () => {
  expect(() =>
    readApiEnvironment({
      ...valid,
      API_ORIGIN: "http://api.example.com",
      NODE_ENV: "production",
    }),
  ).toThrow();
  expect(() =>
    readApiEnvironment({
      ...valid,
      API_ORIGIN: "https://api.example.com",
      NODE_ENV: "production",
      BETTER_AUTH_SECRET: "local-only-better-auth-secret-1234567890",
    }),
  ).toThrow();
});

test("validates structured logging level", () => {
  expect(readApiEnvironment(valid).logLevel).toBe("info");
  expect(readApiEnvironment({ ...valid, LOG_LEVEL: "debug" }).logLevel).toBe(
    "debug",
  );
  expect(() => readApiEnvironment({ ...valid, LOG_LEVEL: "verbose" })).toThrow(
    "LOG_LEVEL",
  );
});
