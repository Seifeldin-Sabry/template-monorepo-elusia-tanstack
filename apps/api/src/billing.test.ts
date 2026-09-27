import { expect, test } from "bun:test";
import {
  type BillingService,
  ExistingSubscriptionError,
} from "@starter/billing";
import { createBillingRoutes } from "./billing";

test("unconfigured billing remains readable and disables payment actions", async () => {
  const routes = createBillingRoutes({
    billing: null,
    getUser: async () => ({ id: "user-1", email: "user@example.test" }),
    allowedOrigins: ["http://localhost:3000"],
  });

  const overview = await routes.handle(
    new Request("http://localhost/billing/overview"),
  );
  expect(overview.status).toBe(200);
  expect(await overview.json()).toEqual({
    enabled: false,
    offers: [],
    subscription: null,
    purchases: [],
  });

  const checkout = await routes.handle(
    new Request("http://localhost/billing/checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify({ kind: "one_time" }),
    }),
  );
  expect(checkout.status).toBe(503);
  expect((await checkout.json()).error.code).toBe("BILLING_NOT_CONFIGURED");

  const missingOrigin = await routes.handle(
    new Request("http://localhost/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "one_time" }),
    }),
  );
  expect(missingOrigin.status).toBe(403);
  expect((await missingOrigin.json()).error.code).toBe("INVALID_ORIGIN");

  const foreignPortal = await routes.handle(
    new Request("http://localhost/billing/portal", {
      method: "POST",
      headers: { origin: "https://foreign.example" },
    }),
  );
  expect(foreignPortal.status).toBe(403);
});

test("billing validates Checkout kind and maps subscription conflict", async () => {
  const service = {
    checkout: async () => {
      throw new ExistingSubscriptionError();
    },
  } as unknown as BillingService;
  const routes = createBillingRoutes({
    billing: service,
    getUser: async () => ({ id: "user-1", email: "user@example.test" }),
    allowedOrigins: ["http://localhost:3000"],
  });

  const request = (kind: string) =>
    new Request("http://localhost/billing/checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify({ kind }),
    });
  expect((await routes.handle(request("price_attacker_selected"))).status).toBe(
    422,
  );
  const duplicate = await routes.handle(request("subscription"));
  expect(duplicate.status).toBe(409);
  expect((await duplicate.json()).error.code).toBe(
    "SUBSCRIPTION_ALREADY_EXISTS",
  );
});

test("Stripe webhook verifier receives exact raw JSON before processing", async () => {
  const rawBody = '{ "id" : "evt_test", "data": { "object": {} } }';
  let receivedBody = "";
  let processed = false;
  const service = {
    verifyWebhook: (body: string, signature: string) => {
      receivedBody = body;
      if (signature !== "valid") throw new Error("Invalid signature");
      return { id: "evt_test" };
    },
    processWebhook: async () => {
      processed = true;
    },
  } as unknown as BillingService;
  const routes = createBillingRoutes({
    billing: service,
    getUser: async () => null,
    allowedOrigins: ["http://localhost:3000"],
  });
  const webhook = (signature: string) =>
    new Request("http://localhost/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signature,
      },
      body: rawBody,
    });

  const rejected = await routes.handle(webhook("invalid"));
  expect(rejected.status).toBe(400);
  expect(processed).toBe(false);

  const accepted = await routes.handle(webhook("valid"));
  expect(accepted.status).toBe(200);
  expect(receivedBody).toBe(rawBody);
  expect(processed).toBe(true);
});
