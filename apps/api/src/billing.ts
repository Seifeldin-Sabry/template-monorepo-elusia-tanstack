import {
  BillingPriceConfigurationError,
  type BillingService,
  ExistingSubscriptionError,
} from "@starter/billing";
import { Elysia, t } from "elysia";

type BillingUser = { id: string; email: string };

export type BillingRoutesOptions = {
  billing?: BillingService | null;
  getUser: (headers: Headers) => Promise<BillingUser | null>;
  allowedOrigins: string[];
};

const unavailable = {
  error: {
    code: "BILLING_NOT_CONFIGURED" as const,
    message: "Billing is not configured for this deployment.",
  },
};

const unauthorized = {
  error: {
    code: "UNAUTHORIZED" as const,
    message: "Sign in required.",
  },
};

const invalidOrigin = {
  error: {
    code: "INVALID_ORIGIN" as const,
    message: "Origin not allowed.",
  },
};

export function createBillingRoutes({
  billing,
  getUser,
  allowedOrigins,
}: BillingRoutesOptions) {
  const trustedOrigins = new Set(allowedOrigins);
  return new Elysia({ name: "billing-routes", prefix: "/billing" })
    .get("/overview", async ({ request, status }) => {
      const user = await getUser(request.headers);
      if (!user) return status(401, unauthorized);
      if (!billing) {
        return {
          enabled: false as const,
          offers: [],
          subscription: null,
          purchases: [],
        };
      }
      try {
        return await billing.overview(user.id);
      } catch (error) {
        if (error instanceof BillingPriceConfigurationError)
          return status(503, {
            error: {
              code: "BILLING_PRICE_INVALID" as const,
              message: error.message,
            },
          });
        throw error;
      }
    })
    .post(
      "/checkout",
      async ({ request, body, status }) => {
        if (!trustedOrigins.has(request.headers.get("origin") ?? ""))
          return status(403, invalidOrigin);
        const user = await getUser(request.headers);
        if (!user) return status(401, unauthorized);
        if (!billing) return status(503, unavailable);
        try {
          return await billing.checkout(user, body.kind);
        } catch (error) {
          if (error instanceof ExistingSubscriptionError) {
            return status(409, {
              error: {
                code: "SUBSCRIPTION_ALREADY_EXISTS" as const,
                message: error.message,
              },
            });
          }
          if (error instanceof BillingPriceConfigurationError) {
            return status(503, {
              error: {
                code: "BILLING_PRICE_INVALID" as const,
                message: error.message,
              },
            });
          }
          throw error;
        }
      },
      {
        body: t.Object(
          {
            kind: t.Union([t.Literal("subscription"), t.Literal("one_time")]),
          },
          { additionalProperties: false },
        ),
      },
    )
    .post("/portal", async ({ request, status }) => {
      if (!trustedOrigins.has(request.headers.get("origin") ?? ""))
        return status(403, invalidOrigin);
      const user = await getUser(request.headers);
      if (!user) return status(401, unauthorized);
      if (!billing) return status(503, unavailable);
      const portal = await billing.portal(user.id);
      if (!portal) {
        return status(404, {
          error: {
            code: "BILLING_CUSTOMER_NOT_FOUND" as const,
            message: "No billing customer exists for this account yet.",
          },
        });
      }
      return portal;
    })
    .post(
      "/webhook",
      async ({ request, status }) => {
        if (!billing) return status(503, unavailable);
        const signature = request.headers.get("stripe-signature");
        if (!signature) {
          return status(400, {
            error: {
              code: "INVALID_WEBHOOK_SIGNATURE" as const,
              message: "Missing Stripe signature.",
            },
          });
        }

        let event: Awaited<ReturnType<BillingService["verifyWebhook"]>>;
        try {
          event = await billing.verifyWebhook(await request.text(), signature);
        } catch {
          return status(400, {
            error: {
              code: "INVALID_WEBHOOK_SIGNATURE" as const,
              message: "Stripe signature verification failed.",
            },
          });
        }

        await billing.processWebhook(event);
        return { received: true as const };
      },
      { parse: "none" },
    );
}
