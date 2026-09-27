import { expect, test } from "bun:test";
import type { Database } from "@starter/db";
import Stripe from "stripe";
import { createBillingService } from "./service";

test("Stripe SDK verifies exact signed webhook bytes", async () => {
  const secret = "whsec_test_signature";
  const stripe = new Stripe("sk_test_fake");
  const service = createBillingService(
    {} as Database,
    {
      secretKey: "sk_test_fake",
      webhookSecret: secret,
      subscriptionPriceId: "price_subscription",
      oneTimePriceId: "price_one_time",
      appOrigin: "http://localhost:3000",
    },
    stripe,
  );
  const payload = JSON.stringify({
    id: "evt_test_signature",
    object: "event",
    type: "checkout.session.completed",
    data: { object: { id: "cs_test_signature" } },
  });
  const signature = await stripe.webhooks.generateTestHeaderStringAsync({
    payload,
    secret,
  });

  expect((await service.verifyWebhook(payload, signature)).id).toBe(
    "evt_test_signature",
  );
  await expect(
    service.verifyWebhook(`${payload} `, signature),
  ).rejects.toThrow();
});
