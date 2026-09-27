import { expect, test } from "bun:test";
import { readBillingEnvironment } from "./env";

test("billing is optional only when every Stripe value is absent", () => {
  expect(
    readBillingEnvironment({ APP_ORIGIN: "http://localhost:3000" }),
  ).toBeNull();
  expect(() =>
    readBillingEnvironment({ STRIPE_SECRET_KEY: "sk_test_partial" }),
  ).toThrow("Incomplete Stripe configuration");
});

test("billing rejects unsafe redirect origins", () => {
  const values = {
    STRIPE_SECRET_KEY: "sk_test_fake",
    STRIPE_WEBHOOK_SECRET: "whsec_fake",
    STRIPE_SUBSCRIPTION_PRICE_ID: "price_subscription",
    STRIPE_ONE_TIME_PRICE_ID: "price_one_time",
  };
  expect(() =>
    readBillingEnvironment({
      ...values,
      APP_ORIGIN: "https://example.com/path",
    }),
  ).toThrow("exact HTTP(S) origin");
  expect(
    readBillingEnvironment({ ...values, APP_ORIGIN: "http://localhost:3000" }),
  ).toEqual({
    secretKey: values.STRIPE_SECRET_KEY,
    webhookSecret: values.STRIPE_WEBHOOK_SECRET,
    subscriptionPriceId: values.STRIPE_SUBSCRIPTION_PRICE_ID,
    oneTimePriceId: values.STRIPE_ONE_TIME_PRICE_ID,
    appOrigin: "http://localhost:3000",
  });
});
