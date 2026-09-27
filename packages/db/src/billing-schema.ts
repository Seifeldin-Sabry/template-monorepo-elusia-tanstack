import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";

export const billingCustomers = pgTable("billing_customers", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id").notNull().unique(),
  pendingSubscriptionCheckoutId: text("pending_subscription_checkout_id"),
  pendingSubscriptionCheckoutExpiresAt: timestamp(
    "pending_subscription_checkout_expires_at",
    { withTimezone: true },
  ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const billingPurchases = pgTable(
  "billing_purchases",
  {
    checkoutSessionId: text("checkout_session_id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    paymentIntentId: text("payment_intent_id"),
    priceId: text("price_id").notNull(),
    status: text("status").notNull(),
    amountTotal: integer("amount_total"),
    currency: text("currency"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("billing_purchases_user_id_idx").on(table.userId)],
);

export const billingSubscriptions = pgTable(
  "billing_subscriptions",
  {
    stripeSubscriptionId: text("stripe_subscription_id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    priceId: text("price_id").notNull(),
    status: text("status").notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("billing_subscriptions_user_id_idx").on(table.userId)],
);

export const billingWebhookEvents = pgTable("billing_webhook_events", {
  stripeEventId: text("stripe_event_id").primaryKey(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
