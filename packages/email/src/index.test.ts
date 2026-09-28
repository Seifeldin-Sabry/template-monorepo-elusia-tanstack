import { describe, expect, test } from "bun:test";
import { createEmailService, type EmailSender } from "./index";

const configured = {
  RESEND_API_KEY: "re_test_only",
  EMAIL_FROM: "Groundwork <hello@example.test>",
};

describe("optional Resend email", () => {
  test("missing configuration disables mail without a provider call", async () => {
    let calls = 0;
    const email = createEmailService({
      env: {},
      sender: async () => {
        calls++;
        return { data: { id: "unused" }, error: null };
      },
    });
    expect(email.enabled).toBe(false);
    expect(
      email.sendVerificationEmail({
        to: "reader@example.test",
        url: "https://example.test/verify",
      }),
    ).rejects.toThrow("Email delivery is disabled");
    expect(calls).toBe(0);
  });

  test("partial configuration fails before creating sender", () => {
    expect(() =>
      createEmailService({ env: { RESEND_API_KEY: "re_test_only" } }),
    ).toThrow("Set both RESEND_API_KEY and EMAIL_FROM");
    expect(() =>
      createEmailService({ env: { EMAIL_FROM: "hello@example.test" } }),
    ).toThrow("Set both RESEND_API_KEY and EMAIL_FROM");
    expect(() =>
      createEmailService({
        env: { RESEND_API_KEY: "re_test_only", EMAIL_FROM: "invalid sender" },
      }),
    ).toThrow("EMAIL_FROM must be an email address");
  });

  test("verification and reset render safe HTML plus plain text", async () => {
    const sent: Parameters<EmailSender>[] = [];
    const email = createEmailService({
      env: configured,
      sender: async (...args) => {
        sent.push(args);
        return { data: { id: `mail_${sent.length}` }, error: null };
      },
    });
    expect(email.enabled).toBe(true);
    expect(
      await email.sendVerificationEmail({
        to: "reader@example.test",
        name: '<script>alert("x")</script>',
        url: "https://example.test/verify?token=a&other=b",
      }),
    ).toEqual({ id: "mail_1" });
    expect(sent[0]?.[0].from).toBe(configured.EMAIL_FROM);
    expect(sent[0]?.[0].html).toContain("&lt;script&gt;");
    expect(sent[0]?.[0].html).not.toContain("<script>");
    expect(sent[0]?.[0].html).toContain("token=a&amp;other=b");
    expect(sent[0]?.[0].text).toContain("token=a&other=b");

    expect(
      await email.sendPasswordResetEmail({
        to: "reader@example.test",
        url: "http://localhost:3000/reset-password?token=abc",
      }),
    ).toEqual({ id: "mail_2" });
    expect(sent[1]?.[0].subject).toBe("Reset your password");
    expect(sent[1]?.[0].text).toContain("ignore this email");
  });

  test("generic send supports idempotency keys and handles provider failure", async () => {
    const sent: Parameters<EmailSender>[] = [];
    const email = createEmailService({
      env: configured,
      sender: async (...args) => {
        sent.push(args);
        if (sent.length === 1) {
          return { data: { id: "mail_1" }, error: null };
        }
        return { data: null, error: { message: "provider details" } };
      },
    });
    const message = {
      to: "reader@example.test",
      subject: "Project created",
      html: "<p>Created</p>",
      text: "Created",
      idempotencyKey: "project-created-123",
    };
    expect(await email.send(message)).toEqual({ id: "mail_1" });
    expect(sent[0]?.[1]).toEqual({ idempotencyKey: "project-created-123" });
    expect(email.send(message)).rejects.toThrow(
      "Email provider rejected message",
    );
    expect(
      email.sendVerificationEmail({
        to: "reader@example.test",
        url: "javascript:alert(1)",
      }),
    ).rejects.toThrow("Account email URL must use HTTPS");
  });
});
