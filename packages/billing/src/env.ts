export type BillingEnvironment = {
  secretKey: string;
  webhookSecret: string;
  subscriptionPriceId: string;
  oneTimePriceId: string;
  appOrigin: string;
};

const billingKeys = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_SUBSCRIPTION_PRICE_ID",
  "STRIPE_ONE_TIME_PRICE_ID",
] as const;

/** Stripe is an optional integration, but partial configuration is a boot error. */
export function readBillingEnvironment(
  env: Record<string, string | undefined>,
): BillingEnvironment | null {
  if (billingKeys.every((key) => !env[key]?.trim())) return null;

  const missing = billingKeys.filter((key) => !env[key]?.trim());
  if (missing.length) {
    throw new Error(
      `Incomplete Stripe configuration: ${missing.join(", ")} required`,
    );
  }

  const origin = env.APP_ORIGIN;
  if (!origin)
    throw new Error("APP_ORIGIN is required when Stripe is configured");

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error("APP_ORIGIN must be a valid HTTP(S) origin");
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.origin !== origin ||
    url.username ||
    url.password
  ) {
    throw new Error("APP_ORIGIN must be an exact HTTP(S) origin");
  }

  function required(key: (typeof billingKeys)[number]): string {
    const value = env[key]?.trim();
    if (!value) throw new Error(`${key} is required when Stripe is configured`);
    return value;
  }

  return {
    secretKey: required("STRIPE_SECRET_KEY"),
    webhookSecret: required("STRIPE_WEBHOOK_SECRET"),
    subscriptionPriceId: required("STRIPE_SUBSCRIPTION_PRICE_ID"),
    oneTimePriceId: required("STRIPE_ONE_TIME_PRICE_ID"),
    appOrigin: origin,
  };
}
