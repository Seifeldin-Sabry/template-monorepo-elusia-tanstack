import { expect, test } from "bun:test";
import type { BetterAuthSecondaryStorage } from "@starter/cache";
import { createDatabase } from "@starter/db";
import { createEmailService } from "@starter/email";
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

test("enables verification and reset callbacks only with configured email", async () => {
  const connection = createDatabase(databaseUrl);
  const sent: { to: string; subject: string }[] = [];
  const email = createEmailService({
    env: {
      RESEND_API_KEY: "re_test",
      EMAIL_FROM: "Groundwork <mail@example.com>",
    },
    sender: async (message) => {
      sent.push({ to: message.to, subject: message.subject });
      return { data: { id: "email-test-id" }, error: null };
    },
  });
  try {
    const withoutEmail = createAuth(connection.db, {
      ...baseEnvironment,
      email: createEmailService({ env: {} }),
    });
    expect(
      withoutEmail.options.emailAndPassword?.requireEmailVerification,
    ).toBeUndefined();
    expect(withoutEmail.options.emailVerification).toBeUndefined();

    const configured = createAuth(connection.db, { ...baseEnvironment, email });
    expect(configured.options.emailAndPassword?.requireEmailVerification).toBe(
      true,
    );
    expect(configured.options.emailVerification?.sendOnSignUp).toBe(true);
    expect(configured.options.emailVerification?.sendOnSignIn).toBe(true);

    const verification =
      configured.options.emailVerification?.sendVerificationEmail;
    const reset = configured.options.emailAndPassword?.sendResetPassword;
    if (!verification || !reset)
      throw new Error("Email callbacks not installed");
    const user = {
      id: "user-test",
      name: "Test User",
      email: "person@example.com",
      emailVerified: false,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await verification({
      user,
      url: "https://api.example.com/api/auth/verify-email?token=secret",
    });
    await reset({
      user,
      url: "https://app.example.com/reset-password?token=secret",
    });
    await Bun.sleep(5);
    expect(sent).toEqual([
      { to: user.email, subject: "Verify your email address" },
      { to: user.email, subject: "Reset your password" },
    ]);
  } finally {
    await connection.close();
  }
});

test("propagates email delivery failure without exposing provider details", async () => {
  const connection = createDatabase(databaseUrl);
  const errors: Record<string, unknown>[] = [];
  const email = createEmailService({
    env: { RESEND_API_KEY: "re_test", EMAIL_FROM: "mail@example.com" },
    sender: async () => ({
      data: null,
      error: { message: "provider token is private" },
    }),
  });
  try {
    const auth = createAuth(connection.db, {
      ...baseEnvironment,
      email,
      logger: { info() {}, warn() {}, error: (entry) => errors.push(entry) },
    });
    const verification = auth.options.emailVerification?.sendVerificationEmail;
    if (!verification) throw new Error("Verification callback not installed");
    await expect(
      verification({
        user: { email: "person@example.com", name: "Test" },
        url: "https://api.example.com/api/auth/verify-email?token=secret",
      }),
    ).rejects.toThrow("Email delivery failed");
    expect(errors[0]?.event).toBe("verification_email_failed");
    expect(JSON.stringify(errors)).not.toContain("provider token is private");
  } finally {
    await connection.close();
  }
});
