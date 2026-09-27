import { expect, test } from "bun:test";
import {
  billingPurchases,
  billingSubscriptions,
  billingWebhookEvents,
  createDatabase,
  user,
} from "@starter/db";
import { eq, inArray } from "drizzle-orm";
import type Stripe from "stripe";
import type { BillingEnvironment } from "./env";
import {
  BillingPriceConfigurationError,
  createBillingService,
  ExistingSubscriptionError,
} from "./service";

const databaseTest = process.env.TEST_DATABASE_URL ? test : test.skip;

databaseTest(
  "Checkout and webhook state stay tied to verified server prices",
  async () => {
    const connection = createDatabase(process.env.TEST_DATABASE_URL ?? "");
    const userId = crypto.randomUUID();
    const suffix = userId.replaceAll("-", "");
    const customerId = `cus_test_${suffix}`;
    const checkoutSessionId = `cs_test_${suffix}`;
    const subscriptionCheckoutSessionPrefix = `cs_sub_test_${suffix}`;
    const failedCheckoutSessionId = `cs_failed_${suffix}`;
    const subscriptionId = `sub_test_${suffix}`;
    const unrelatedSubscriptionId = `sub_unrelated_${suffix}`;
    const eventIds = [
      `evt_paid_${suffix}`,
      `evt_subscription_active_${suffix}`,
      `evt_subscription_canceled_${suffix}`,
      `evt_subscription_late_${suffix}`,
      `evt_subscription_unrelated_${suffix}`,
      `evt_payment_failed_${suffix}`,
      `evt_payment_completed_late_${suffix}`,
    ];
    const config: BillingEnvironment = {
      secretKey: "sk_test_fake",
      webhookSecret: "whsec_fake",
      subscriptionPriceId: "price_subscription_server",
      oneTimePriceId: "price_one_time_server",
      appOrigin: "http://localhost:3000",
    };

    let customerCreations = 0;
    const checkoutParams: Stripe.Checkout.SessionCreateParams[] = [];
    let paymentStatus: Stripe.Checkout.Session.PaymentStatus = "paid";
    let subscriptionStatus: Stripe.Subscription.Status = "active";
    let wrongPriceType = true;
    let subscriptionCheckoutCreations = 0;
    let subscriptionSessionStatus: "open" | "expired" = "open";
    let pendingPriceId = config.subscriptionPriceId;
    let expiredSessions = 0;
    let liveSubscriptionPriceId: string | null = null;
    const stripe = {
      prices: {
        retrieve: async (priceId: string) => ({
          id: priceId,
          active: true,
          recurring:
            priceId === config.subscriptionPriceId || wrongPriceType
              ? { interval: "month" }
              : null,
          unit_amount: 2400,
          currency: "usd",
          product: { name: "Starter plan" },
        }),
      },
      customers: {
        create: async () => {
          customerCreations += 1;
          return { id: customerId };
        },
      },
      checkout: {
        sessions: {
          create: async (params: Stripe.Checkout.SessionCreateParams) => {
            checkoutParams.push(params);
            if (params.mode === "subscription") {
              subscriptionCheckoutCreations += 1;
              pendingPriceId = params.line_items?.[0]?.price ?? "";
              return {
                id: `${subscriptionCheckoutSessionPrefix}_${subscriptionCheckoutCreations}`,
                url: `https://checkout.stripe.test/subscription/${subscriptionCheckoutCreations}`,
                expires_at: Math.floor(Date.now() / 1000) + 3600,
              };
            }
            return {
              id: checkoutSessionId,
              url: "https://checkout.stripe.test/session",
              expires_at: Math.floor(Date.now() / 1000) + 3600,
            };
          },
          retrieve: async (id: string) =>
            id.startsWith(subscriptionCheckoutSessionPrefix)
              ? {
                  id,
                  mode: "subscription",
                  status: subscriptionSessionStatus,
                  customer: customerId,
                  metadata: { userId, priceId: pendingPriceId },
                  url: `https://checkout.stripe.test/subscription/${id.split("_").at(-1)}`,
                  expires_at: Math.floor(Date.now() / 1000) + 3600,
                }
              : {
                  id,
                  mode: "payment",
                  customer: customerId,
                  metadata: {
                    userId,
                    kind: "one_time",
                    priceId: config.oneTimePriceId,
                  },
                  payment_intent: `pi_test_${suffix}`,
                  payment_status: paymentStatus,
                  amount_total: 2400,
                  currency: "usd",
                },
          expire: async () => {
            expiredSessions += 1;
            return { status: "expired" };
          },
        },
      },
      subscriptions: {
        list: async () => ({
          data: liveSubscriptionPriceId
            ? [
                {
                  status: "active",
                  items: { data: [{ price: { id: liveSubscriptionPriceId } }] },
                },
              ]
            : [],
        }),
        retrieve: async (id: string) => ({
          id,
          customer: customerId,
          status: subscriptionStatus,
          cancel_at_period_end: subscriptionStatus === "active",
          items: {
            data: [
              {
                price: {
                  id:
                    id === unrelatedSubscriptionId
                      ? "price_unrelated"
                      : config.subscriptionPriceId,
                },
                current_period_end: 1_800_000_000,
              },
            ],
          },
        }),
      },
    } as unknown as Stripe;

    const service = createBillingService(connection.db, config, stripe);
    try {
      await connection.db.insert(user).values({
        id: userId,
        name: "Billing test",
        email: `${suffix}@example.test`,
      });

      await expect(
        service.checkout(
          { id: userId, email: `${suffix}@example.test` },
          "one_time",
        ),
      ).rejects.toBeInstanceOf(BillingPriceConfigurationError);
      expect(customerCreations).toBe(0);
      wrongPriceType = false;

      const oneTime = await service.checkout(
        { id: userId, email: `${suffix}@example.test` },
        "one_time",
      );
      expect(oneTime.url).toBe("https://checkout.stripe.test/session");
      expect(checkoutParams.at(-1)?.mode).toBe("payment");
      expect(checkoutParams.at(-1)?.line_items?.[0]?.price).toBe(
        config.oneTimePriceId,
      );
      expect(customerCreations).toBe(1);

      const paidEvent = {
        id: eventIds[0],
        type: "checkout.session.completed",
        data: { object: { id: checkoutSessionId } },
      } as Stripe.Event;
      await service.processWebhook(paidEvent);
      paymentStatus = "unpaid";
      await service.processWebhook(paidEvent);
      const purchases = await connection.db
        .select()
        .from(billingPurchases)
        .where(eq(billingPurchases.checkoutSessionId, checkoutSessionId));
      expect(purchases).toHaveLength(1);
      expect(purchases[0]?.status).toBe("paid");

      await service.processWebhook({
        id: eventIds[5],
        type: "checkout.session.async_payment_failed",
        data: { object: { id: failedCheckoutSessionId } },
      } as Stripe.Event);
      await service.processWebhook({
        id: eventIds[6],
        type: "checkout.session.completed",
        data: { object: { id: failedCheckoutSessionId } },
      } as Stripe.Event);
      const failedPurchases = await connection.db
        .select()
        .from(billingPurchases)
        .where(eq(billingPurchases.checkoutSessionId, failedCheckoutSessionId));
      expect(failedPurchases[0]?.status).toBe("failed");

      const subscriptionEvent = (
        id: string,
        type: string,
        resourceId = subscriptionId,
      ) =>
        ({
          id,
          type,
          data: { object: { id: resourceId } },
        }) as Stripe.Event;
      await service.processWebhook(
        subscriptionEvent(eventIds[1] ?? "", "customer.subscription.created"),
      );
      await connection.db.insert(billingSubscriptions).values({
        stripeSubscriptionId: `sub_history_${suffix}`,
        userId,
        stripeCustomerId: customerId,
        priceId: config.subscriptionPriceId,
        status: "canceled",
        updatedAt: new Date(Date.now() + 1000),
      });
      expect((await service.overview(userId)).subscription?.status).toBe(
        "active",
      );
      await service.processWebhook(
        subscriptionEvent(
          eventIds[4] ?? "",
          "customer.subscription.created",
          unrelatedSubscriptionId,
        ),
      );
      expect((await service.overview(userId)).subscription?.status).toBe(
        "active",
      );
      await expect(
        service.checkout(
          { id: userId, email: `${suffix}@example.test` },
          "subscription",
        ),
      ).rejects.toBeInstanceOf(ExistingSubscriptionError);

      subscriptionStatus = "canceled";
      await service.processWebhook(
        subscriptionEvent(eventIds[2] ?? "", "customer.subscription.deleted"),
      );
      await service.processWebhook(
        subscriptionEvent(eventIds[3] ?? "", "customer.subscription.created"),
      );
      const subscriptions = await connection.db
        .select()
        .from(billingSubscriptions)
        .where(eq(billingSubscriptions.stripeSubscriptionId, subscriptionId));
      expect(subscriptions[0]?.status).toBe("canceled");

      liveSubscriptionPriceId = config.subscriptionPriceId;
      await expect(
        service.checkout(
          { id: userId, email: `${suffix}@example.test` },
          "subscription",
        ),
      ).rejects.toBeInstanceOf(ExistingSubscriptionError);
      liveSubscriptionPriceId = "price_unrelated";

      const [first, second] = await Promise.all([
        service.checkout(
          { id: userId, email: `${suffix}@example.test` },
          "subscription",
        ),
        service.checkout(
          { id: userId, email: `${suffix}@example.test` },
          "subscription",
        ),
      ]);
      expect(first.url).toBe("https://checkout.stripe.test/subscription/1");
      expect(second.url).toBe(first.url);
      expect(subscriptionCheckoutCreations).toBe(1);
      subscriptionSessionStatus = "expired";
      const retry = await service.checkout(
        { id: userId, email: `${suffix}@example.test` },
        "subscription",
      );
      expect(retry.url).toBe("https://checkout.stripe.test/subscription/2");
      expect(subscriptionCheckoutCreations).toBe(2);
      subscriptionSessionStatus = "open";
      config.subscriptionPriceId = "price_subscription_changed";
      const changedPrice = await service.checkout(
        { id: userId, email: `${suffix}@example.test` },
        "subscription",
      );
      expect(changedPrice.url).toBe(
        "https://checkout.stripe.test/subscription/3",
      );
      expect(expiredSessions).toBe(1);
      expect(checkoutParams.at(-1)?.mode).toBe("subscription");
      expect(checkoutParams.at(-1)?.line_items?.[0]?.price).toBe(
        config.subscriptionPriceId,
      );
      expect(customerCreations).toBe(1);
    } finally {
      await connection.db
        .delete(billingWebhookEvents)
        .where(inArray(billingWebhookEvents.stripeEventId, eventIds));
      await connection.db.delete(user).where(eq(user.id, userId));
      await connection.close();
    }
  },
);
