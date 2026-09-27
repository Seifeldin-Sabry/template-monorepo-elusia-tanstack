import { expect, test } from "bun:test";
import type { BetterAuthSecondaryStorage } from "@starter/cache";
import { createDatabase } from "@starter/db";
import { createAuth } from "./auth";

const databaseUrl = "postgres://starter:starter@localhost:5432/starter";
const baseEnvironment = {
  apiOrigin: "https://api.example.com",
  secret: "test-secret-with-at-least-32-characters",
  trustedOrigins: ["https://app.example.com"],
};

test("enables secure shared cookies only for configured domain", async () => {
  const connection = createDatabase(databaseUrl);
  try {
    const shared = createAuth(connection.db, {
      ...baseEnvironment,
      cookieDomain: "example.com",
    });
    expect(shared.options.advanced?.crossSubDomainCookies).toEqual({
      enabled: true,
      domain: "example.com",
    });
    expect(shared.options.advanced?.useSecureCookies).toBe(true);

    const isolated = createAuth(connection.db, baseEnvironment);
    expect(isolated.options.advanced?.crossSubDomainCookies).toBeUndefined();
  } finally {
    await connection.close();
  }
});

test("optional secondary storage changes rate limits while sessions remain in PostgreSQL", async () => {
  const connection = createDatabase(databaseUrl);
  const values = new Map<string, string>();
  const secondaryStorage: BetterAuthSecondaryStorage = {
    get: async (key) => values.get(key) ?? null,
    getAndDelete: async (key) => {
      const value = values.get(key) ?? null;
      values.delete(key);
      return value;
    },
    set: async (key, value) => {
      values.set(key, value);
    },
    delete: async (key) => {
      values.delete(key);
    },
    increment: async (key) => {
      const next = Number(values.get(key) ?? 0) + 1;
      values.set(key, String(next));
      return next;
    },
  };

  try {
    const postgresOnly = createAuth(connection.db, baseEnvironment);
    expect(postgresOnly.options.rateLimit?.storage).toBe("database");

    const withCache = createAuth(connection.db, {
      ...baseEnvironment,
      secondaryStorage,
    });
    expect(withCache.options.secondaryStorage).toBe(secondaryStorage);
    expect(withCache.options.rateLimit?.storage).toBe("secondary-storage");
    expect(withCache.options.session?.storeSessionInDatabase).toBe(true);
  } finally {
    await connection.close();
  }
});
