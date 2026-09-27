import {
  billingCustomers,
  billingPurchases,
  billingSubscriptions,
  billingWebhookEvents,
  type Database,
} from "@starter/db";
import { desc, eq, sql } from "drizzle-orm";
import Stripe from "stripe";
import type { BillingEnvironment } from "./env";

export type CheckoutKind = "subscription" | "one_time";

export class ExistingSubscriptionError extends Error {
  constructor() {
    super("Manage the existing subscription in the billing portal.");
    this.name = "ExistingSubscriptionError";
  }
}

export class BillingPriceConfigurationError extends Error {
  constructor(kind: CheckoutKind) {
    super(`Configured ${kind} Stripe Price is inactive or has the wrong type.`);
    this.name = "BillingPriceConfigurationError";
  }
}

const blockingSubscriptionStatuses = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "incomplete",
  "paused",
]);

export type BillingOverview = {
  enabled: true;
  offers: Array<{
    kind: CheckoutKind;
    label: string;
    amount: number | null;
    currency: string;
    interval: string | null;
  }>;
  subscription: {
    status: string;
    priceId: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  purchases: Array<{
    checkoutSessionId: string;
    status: string;
    amountTotal: number | null;
    currency: string | null;
    createdAt: string;
  }>;
};

type BillingUser = { id: string; email: string };

function stripeId(value: string | { id: string } | null): string | null {
  return typeof value === "string" ? value : (value?.id ?? null);
}

function productName(price: Stripe.Price): string | null {
  const product = price.product;
  if (typeof product === "string" || !product) return null;
  return "name" in product && typeof product.name === "string"
    ? product.name
    : null;
}

function assertPriceMatchesKind(price: Stripe.Price, kind: CheckoutKind): void {
  if (
    !price.active ||
    (kind === "subscription" && !price.recurring) ||
    (kind === "one_time" && price.recurring)
  ) {
    throw new BillingPriceConfigurationError(kind);
  }
}

/**
 * One Stripe client and one webhook pipeline serve both Checkout modes. Public
 * callers choose only a kind; Stripe Price IDs always come from server config.
 */
export function createBillingService(
  db: Database,
  config: BillingEnvironment,
  stripe = new Stripe(config.secretKey, { maxNetworkRetries: 2 }),
) {
  async function customerFor(user: BillingUser): Promise<string> {
    const existing = await db
      .select({ stripeCustomerId: billingCustomers.stripeCustomerId })
      .from(billingCustomers)
      .where(eq(billingCustomers.userId, user.id))
      .limit(1);
    if (existing[0]) return existing[0].stripeCustomerId;

    // Stripe's idempotency key covers concurrent first checkouts and retries if
    // customer creation succeeds but the database write fails.
    const created = await stripe.customers.create(
      { email: user.email, metadata: { userId: user.id } },
      { idempotencyKey: `starter-customer-${user.id}` },
    );
    await db
      .insert(billingCustomers)
      .values({ userId: user.id, stripeCustomerId: created.id })
      .onConflictDoNothing();

    const stored = await db
      .select({ stripeCustomerId: billingCustomers.stripeCustomerId })
      .from(billingCustomers)
      .where(eq(billingCustomers.userId, user.id))
      .limit(1);
    if (!stored[0])
      throw new Error("Could not persist Stripe customer mapping");
    return stored[0].stripeCustomerId;
  }

  async function overview(userId: string): Promise<BillingOverview> {
    const [subscriptionPrice, oneTimePrice, subscriptions, purchases] =
      await Promise.all([
        stripe.prices.retrieve(config.subscriptionPriceId, {
          expand: ["product"],
        }),
        stripe.prices.retrieve(config.oneTimePriceId, { expand: ["product"] }),
        db
          .select()
          .from(billingSubscriptions)
          .where(
            sql`${billingSubscriptions.userId} = ${userId} AND ${billingSubscriptions.priceId} = ${config.subscriptionPriceId}`,
          )
          .orderBy(desc(billingSubscriptions.updatedAt)),
        db
          .select()
          .from(billingPurchases)
          .where(eq(billingPurchases.userId, userId))
          .orderBy(desc(billingPurchases.createdAt))
          .limit(20),
      ]);

    assertPriceMatchesKind(subscriptionPrice, "subscription");
    assertPriceMatchesKind(oneTimePrice, "one_time");

    const subscription =
      subscriptions.find((plan) =>
        blockingSubscriptionStatuses.has(plan.status),
      ) ?? subscriptions[0];
    return {
      enabled: true,
      offers: [
        {
          kind: "subscription",
          label: productName(subscriptionPrice) ?? "Subscription",
          amount: subscriptionPrice.unit_amount,
          currency: subscriptionPrice.currency,
          interval: subscriptionPrice.recurring?.interval ?? null,
        },
        {
          kind: "one_time",
          label: productName(oneTimePrice) ?? "One-time purchase",
          amount: oneTimePrice.unit_amount,
          currency: oneTimePrice.currency,
          interval: null,
        },
      ],
      subscription: subscription
        ? {
            status: subscription.status,
            priceId: subscription.priceId,
            currentPeriodEnd:
              subscription.currentPeriodEnd?.toISOString() ?? null,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          }
        : null,
      purchases: purchases.map((purchase) => ({
        checkoutSessionId: purchase.checkoutSessionId,
        status: purchase.status,
        amountTotal: purchase.amountTotal,
        currency: purchase.currency,
        createdAt: purchase.createdAt.toISOString(),
      })),
    };
  }

  async function createCheckoutSession(
    user: BillingUser,
    kind: CheckoutKind,
    customer: string,
    priceId: string,
  ) {
    const metadata = { userId: user.id, kind, priceId };
    const session = await stripe.checkout.sessions.create({
      mode: kind === "subscription" ? "subscription" : "payment",
      customer,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${config.appOrigin}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.appOrigin}/billing?checkout=cancelled`,
      metadata,
      ...(kind === "subscription"
        ? { subscription_data: { metadata } }
        : { payment_intent_data: { metadata } }),
    });
    if (!session.url) throw new Error("Stripe Checkout returned no hosted URL");
    return session;
  }

  async function checkout(user: BillingUser, kind: CheckoutKind) {
    const priceId =
      kind === "subscription"
        ? config.subscriptionPriceId
        : config.oneTimePriceId;
    const price = await stripe.prices.retrieve(priceId);
    assertPriceMatchesKind(price, kind);

    const customer = await customerFor(user);
    if (kind === "one_time") {
      const session = await createCheckoutSession(
        user,
        kind,
        customer,
        priceId,
      );
      return { url: session.url ?? "" };
    }

    // A transaction-scoped per-user lock serializes subscription Checkout
    // creation across API instances. A second request reuses the same open
    // hosted session instead of creating another payable plan.
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(871302, hashtext(${user.id}))`,
      );

      const stored = await tx
        .select({ status: billingSubscriptions.status })
        .from(billingSubscriptions)
        .where(
          sql`${billingSubscriptions.userId} = ${user.id} AND ${billingSubscriptions.priceId} = ${config.subscriptionPriceId}`,
        );
      if (
        stored.some((plan) => blockingSubscriptionStatuses.has(plan.status))
      ) {
        throw new ExistingSubscriptionError();
      }

      // Stripe is authoritative if a completed Checkout precedes webhook
      // delivery. Ignore subscriptions for unrelated Prices in same account.
      const subscriptions = await stripe.subscriptions.list({
        customer,
        status: "all",
        limit: 100,
      });
      if (
        subscriptions.data.some(
          (plan) =>
            blockingSubscriptionStatuses.has(plan.status) &&
            plan.items.data.some(
              (item) => item.price.id === config.subscriptionPriceId,
            ),
        )
      ) {
        throw new ExistingSubscriptionError();
      }

      const customers = await tx
        .select({
          pendingId: billingCustomers.pendingSubscriptionCheckoutId,
          pendingExpiresAt:
            billingCustomers.pendingSubscriptionCheckoutExpiresAt,
        })
        .from(billingCustomers)
        .where(eq(billingCustomers.userId, user.id))
        .limit(1);
      const pending = customers[0];
      if (
        pending?.pendingId &&
        pending.pendingExpiresAt &&
        pending.pendingExpiresAt.getTime() > Date.now()
      ) {
        const session = await stripe.checkout.sessions.retrieve(
          pending.pendingId,
        );
        if (
          stripeId(session.customer) !== customer ||
          session.metadata?.userId !== user.id
        ) {
          throw new Error(
            "Pending Checkout customer mapping does not match user",
          );
        }
        if (
          session.status === "open" &&
          session.url &&
          session.expires_at * 1000 > Date.now() &&
          session.mode === "subscription" &&
          session.metadata?.priceId === config.subscriptionPriceId
        ) {
          return { url: session.url };
        }
        if (session.status === "open") {
          await stripe.checkout.sessions.expire(session.id);
        }
      }

      const session = await createCheckoutSession(
        user,
        kind,
        customer,
        priceId,
      );
      await tx
        .update(billingCustomers)
        .set({
          pendingSubscriptionCheckoutId: session.id,
          pendingSubscriptionCheckoutExpiresAt: new Date(
            session.expires_at * 1000,
          ),
        })
        .where(eq(billingCustomers.userId, user.id));
      return { url: session.url ?? "" };
    });
  }

  async function portal(userId: string) {
    const customer = await db
      .select({ stripeCustomerId: billingCustomers.stripeCustomerId })
      .from(billingCustomers)
      .where(eq(billingCustomers.userId, userId))
      .limit(1);
    if (!customer[0]) return null;

    const session = await stripe.billingPortal.sessions.create({
      customer: customer[0].stripeCustomerId,
      return_url: `${config.appOrigin}/billing`,
    });
    return { url: session.url };
  }

  async function verifyWebhook(
    rawBody: string,
    signature: string,
  ): Promise<Stripe.Event> {
    return stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      config.webhookSecret,
    );
  }

  async function processWebhook(event: Stripe.Event): Promise<void> {
    const checkoutEvents = [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
    ];
    const subscriptionEvents = [
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
    ];

    if (checkoutEvents.includes(event.type)) {
      const eventSession = event.data.object as Stripe.Checkout.Session;
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(871303, hashtext(${eventSession.id}))`,
        );
        const session = await stripe.checkout.sessions.retrieve(
          eventSession.id,
        );
        if (session.mode !== "payment" || session.metadata?.kind !== "one_time")
          return;

        const customerId = stripeId(session.customer);
        if (!customerId)
          throw new Error("Checkout session has no Stripe customer");

        const inserted = await tx
          .insert(billingWebhookEvents)
          .values({ stripeEventId: event.id, type: event.type })
          .onConflictDoNothing()
          .returning({ stripeEventId: billingWebhookEvents.stripeEventId });
        if (!inserted.length) return;

        const customers = await tx
          .select({ userId: billingCustomers.userId })
          .from(billingCustomers)
          .where(eq(billingCustomers.stripeCustomerId, customerId))
          .limit(1);
        const userId = customers[0]?.userId;
        if (!userId || userId !== session.metadata?.userId) {
          throw new Error("Checkout customer mapping does not match user");
        }

        const priorPurchases = await tx
          .select({ status: billingPurchases.status })
          .from(billingPurchases)
          .where(eq(billingPurchases.checkoutSessionId, session.id))
          .limit(1);
        const observedStatus =
          session.payment_status === "paid"
            ? "paid"
            : event.type === "checkout.session.async_payment_failed"
              ? "failed"
              : "unpaid";
        const status =
          priorPurchases[0]?.status === "paid"
            ? "paid"
            : priorPurchases[0]?.status === "failed" &&
                observedStatus === "unpaid"
              ? "failed"
              : observedStatus;

        const purchase = {
          checkoutSessionId: session.id,
          userId,
          stripeCustomerId: customerId,
          paymentIntentId: stripeId(session.payment_intent),
          priceId: session.metadata.priceId ?? config.oneTimePriceId,
          status,
          amountTotal: session.amount_total,
          currency: session.currency,
        };
        await tx.insert(billingPurchases).values(purchase).onConflictDoUpdate({
          target: billingPurchases.checkoutSessionId,
          set: purchase,
        });
      });
      return;
    }

    if (subscriptionEvents.includes(event.type)) {
      const eventSubscription = event.data.object as Stripe.Subscription;
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(871304, hashtext(${eventSubscription.id}))`,
        );
        const inserted = await tx
          .insert(billingWebhookEvents)
          .values({ stripeEventId: event.id, type: event.type })
          .onConflictDoNothing()
          .returning({ stripeEventId: billingWebhookEvents.stripeEventId });
        if (!inserted.length) return;

        // Fetch under same per-resource lock. Delayed or concurrent deliveries
        // then reconcile latest Stripe state in commit order.
        const subscription = await stripe.subscriptions.retrieve(
          eventSubscription.id,
        );
        const customerId = stripeId(subscription.customer);
        if (!customerId) throw new Error("Subscription has no Stripe customer");

        const customers = await tx
          .select({ userId: billingCustomers.userId })
          .from(billingCustomers)
          .where(eq(billingCustomers.stripeCustomerId, customerId))
          .limit(1);
        const userId = customers[0]?.userId;
        if (!userId) return; // Other Stripe account activity is not this app's.

        const item = subscription.items.data.find(
          (item) => item.price.id === config.subscriptionPriceId,
        );
        if (!item) {
          // Price changed away from starter plan (or unrelated account event).
          // Remove prior local plan state so entitlements cannot stay active.
          await tx
            .delete(billingSubscriptions)
            .where(
              eq(billingSubscriptions.stripeSubscriptionId, subscription.id),
            );
          return;
        }

        const state = {
          stripeSubscriptionId: subscription.id,
          userId,
          stripeCustomerId: customerId,
          priceId: item.price.id,
          status: subscription.status,
          currentPeriodEnd: item.current_period_end
            ? new Date(item.current_period_end * 1000)
            : null,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          updatedAt: new Date(),
        };
        await tx.insert(billingSubscriptions).values(state).onConflictDoUpdate({
          target: billingSubscriptions.stripeSubscriptionId,
          set: state,
        });
      });
    }
  }

  return { overview, checkout, portal, verifyWebhook, processWebhook };
}

export type BillingService = ReturnType<typeof createBillingService>;
