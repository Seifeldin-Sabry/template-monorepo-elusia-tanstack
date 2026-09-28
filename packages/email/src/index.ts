import { Resend } from "resend";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey?: string;
};

export type AccountEmail = {
  to: string;
  name?: string;
  url: string;
};

export type EmailSender = (
  message: {
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
  },
  options?: { idempotencyKey: string },
) => Promise<{
  data: { id: string } | null;
  error: { message: string } | null;
}>;

type EmailOperations = {
  send(message: EmailMessage): Promise<{ id: string }>;
  sendVerificationEmail(message: AccountEmail): Promise<{ id: string }>;
  sendPasswordResetEmail(message: AccountEmail): Promise<{ id: string }>;
};

export type EmailService = EmailOperations &
  ({ enabled: true } | { enabled: false });

export type CreateEmailOptions = {
  /** Defaults to process.env. Useful for deterministic tests. */
  env?: Record<string, string | undefined>;
  /** Injected transport keeps tests free of external requests. */
  sender?: EmailSender;
};

function validSenderAddress(from: string): boolean {
  const address = "[^\\s<>@\\r\\n]+@[^\\s<>@\\r\\n]+\\.[^\\s<>@\\r\\n]+";
  return (
    new RegExp(`^${address}$`).test(from) ||
    new RegExp(`^[^<>\\r\\n]+ <${address}>$`).test(from)
  );
}

function htmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function accountUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Account email URL must be an absolute HTTP(S) URL");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) {
    throw new Error("Account email URL must use HTTPS outside localhost");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Account email URL must not contain credentials");
  }
  return parsed.toString();
}

function accountMessage(
  kind: "verification" | "password-reset",
  message: AccountEmail,
): EmailMessage {
  const url = accountUrl(message.url);
  const name = message.name?.trim();
  const greeting = name ? `Hi ${name},` : "Hello,";
  const safeGreeting = htmlEscape(greeting);
  const verification = kind === "verification";
  const subject = verification
    ? "Verify your email address"
    : "Reset your password";
  const action = verification ? "Verify email" : "Reset password";
  const explanation = verification
    ? "Confirm your email address to finish setting up your account."
    : "A password reset was requested for your account. If this was not you, you can ignore this email.";
  const text = `${greeting}\n\n${explanation}\n\n${action}: ${url}\n\nIf the button does not work, paste the link into your browser.`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:32px 16px;background:#f7f8fa;color:#17202f;font-family:Arial,Helvetica,sans-serif"><main style="max-width:520px;margin:auto;padding:32px;border:1px solid #e5e7eb;border-radius:16px;background:#fff"><p style="margin:0 0 24px;color:#4b5f88;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase">Account</p><h1 style="margin:0 0 20px;font-size:28px;line-height:1.2">${subject}</h1><p style="line-height:1.6">${safeGreeting}</p><p style="line-height:1.6">${explanation}</p><p style="margin:28px 0"><a href="${htmlEscape(url)}" style="display:inline-block;padding:13px 20px;border-radius:8px;background:#304fc5;color:#fff;text-decoration:none;font-weight:700">${action}</a></p><p style="color:#64748b;font-size:13px;line-height:1.6">If the button does not work, copy this link:<br><a href="${htmlEscape(url)}" style="color:#304fc5;overflow-wrap:anywhere">${htmlEscape(url)}</a></p></main></body></html>`;
  return { to: message.to, subject, html, text };
}

function createResendSender(apiKey: string): EmailSender {
  const resend = new Resend(apiKey);
  return (message, options) => resend.emails.send(message, options);
}

/**
 * Optional Resend integration. Missing configuration disables sending; a partial
 * configuration fails at startup so verification and recovery never fail silently.
 */
export function createEmailService(
  options: CreateEmailOptions = {},
): EmailService {
  const env = options.env ?? process.env;
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  if ((apiKey && !from) || (!apiKey && from)) {
    throw new Error("Set both RESEND_API_KEY and EMAIL_FROM, or neither");
  }

  if (!apiKey || !from) {
    const unavailable = async (): Promise<never> => {
      throw new Error(
        "Email delivery is disabled; configure RESEND_API_KEY and EMAIL_FROM",
      );
    };
    return {
      enabled: false,
      send: unavailable,
      sendVerificationEmail: unavailable,
      sendPasswordResetEmail: unavailable,
    };
  }

  if (!validSenderAddress(from)) {
    throw new Error(
      "EMAIL_FROM must be an email address or Name <email@domain>",
    );
  }

  const sender = options.sender ?? createResendSender(apiKey);

  const send: EmailOperations["send"] = async (message) => {
    if (!message.to.trim() || !message.subject.trim()) {
      throw new Error("Email recipient and subject are required");
    }
    const { idempotencyKey, ...payload } = message;
    const options = idempotencyKey ? { idempotencyKey } : undefined;
    const result = await sender({ from, ...payload }, options);
    if (result.error) {
      // Provider details can contain addresses or token-bearing links.
      throw new Error("Email provider rejected message");
    }
    if (!result.data?.id) {
      throw new Error("Email provider returned no message ID");
    }
    return { id: result.data.id };
  };

  return {
    enabled: true,
    send,
    async sendVerificationEmail(message) {
      return send(accountMessage("verification", message));
    },
    async sendPasswordResetEmail(message) {
      return send(accountMessage("password-reset", message));
    },
  };
}
