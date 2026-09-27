import { Badge, Button, brand } from "@starter/ui";
import { useQuery } from "@tanstack/react-query";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  CreditCard,
  LoaderCircle,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { AppShell } from "../components/app-shell";
import { requireSession } from "../lib/auth-navigation";
import {
  type BillingOffer,
  billingOverviewQueryOptions,
  type CheckoutKind,
  useBillingCheckout,
  useBillingPortal,
} from "../lib/billing";
import "../billing-styles.css";

const iconStroke = 1.8;

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Try again.";
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: "Active",
    canceled: "Canceled",
    incomplete: "Pending",
    incomplete_expired: "Expired",
    past_due: "Past due",
    paused: "Paused",
    paid: "Paid",
    trialing: "Trialing",
    unpaid: "Unpaid",
    failed: "Failed",
  };
  return labels[status] ?? status.replaceAll("_", " ");
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatMoney(
  amount: number | null,
  currency: string | null,
  fallback = "Price shown at checkout",
): string {
  if (amount === null || !currency) return fallback;

  try {
    const format = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    });
    // Stripe represents ISK charges with two decimal places despite ISO 4217.
    const decimals =
      currency.toLowerCase() === "isk"
        ? 2
        : (format.resolvedOptions().maximumFractionDigits ?? 2);
    return format.format(amount / 10 ** decimals);
  } catch {
    return `${amount} ${currency.toUpperCase()} in minor units`;
  }
}

function navigateToHostedBilling(url: string): void {
  const target = new URL(url);
  if (target.protocol !== "https:") {
    throw new Error("Secure billing link was unavailable. Please try again.");
  }
  window.location.assign(target.href);
}

function isCurrentSubscription(status: string): boolean {
  return !["canceled", "incomplete_expired"].includes(status);
}

export const Route = createFileRoute("/billing")({
  headers: () => ({ "Cache-Control": "private, no-store" }),
  validateSearch: (search): { checkout?: "success" | "cancelled" } => {
    if (search.checkout === "success" || search.checkout === "cancelled") {
      return { checkout: search.checkout };
    }
    return {};
  },
  beforeLoad: ({ location }) => requireSession(location.href),
  loader: ({ context }) =>
    context.queryClient.fetchQuery(billingOverviewQueryOptions),
  head: () => ({
    meta: [
      { title: `Billing · ${brand.name}` },
      {
        name: "description",
        content: `Review subscription and purchases in ${brand.name}.`,
      },
    ],
  }),
  pendingComponent: BillingLoadingPage,
  errorComponent: BillingErrorPage,
  component: BillingPage,
});

function BillingLoadingPage() {
  return (
    <AppShell>
      <main className="app-content billing-content" aria-busy="true">
        <div className="billing-heading">
          <span className="eyebrow">Workspace / Billing</span>
          <h1>Billing</h1>
          <p>Subscription, purchases, and payment details in one place.</p>
        </div>
        <div className="billing-loading" role="status">
          <LoaderCircle className="spin" size={20} aria-hidden="true" />
          Loading billing details…
        </div>
      </main>
    </AppShell>
  );
}

function BillingErrorPage({ error }: ErrorComponentProps) {
  const router = useRouter();

  return (
    <AppShell>
      <main className="app-content billing-content">
        <div className="billing-heading">
          <span className="eyebrow">Workspace / Billing</span>
          <h1>Billing</h1>
          <p>Subscription, purchases, and payment details in one place.</p>
        </div>
        <div className="billing-failure" role="alert">
          <span className="billing-failure-icon" aria-hidden="true">
            <RefreshCw size={24} strokeWidth={iconStroke} />
          </span>
          <h2>Billing details could not be loaded</h2>
          <p>{errorMessage(error)}</p>
          <Button type="button" onClick={() => void router.invalidate()}>
            Try again
          </Button>
        </div>
      </main>
    </AppShell>
  );
}

function BillingPage() {
  const { user } = Route.useRouteContext();
  const { checkout } = Route.useSearch();
  const overviewQuery = useQuery(billingOverviewQueryOptions);
  const checkoutMutation = useBillingCheckout();
  const portalMutation = useBillingPortal();
  const [busyAction, setBusyAction] = useState<CheckoutKind | "portal" | null>(
    null,
  );
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const overview = overviewQuery.data;
  const actionError =
    navigationError ??
    (checkoutMutation.error ? errorMessage(checkoutMutation.error) : null) ??
    (portalMutation.error ? errorMessage(portalMutation.error) : null);

  async function beginCheckout(kind: CheckoutKind) {
    checkoutMutation.reset();
    portalMutation.reset();
    setNavigationError(null);
    setBusyAction(kind);
    try {
      navigateToHostedBilling(await checkoutMutation.mutateAsync(kind));
    } catch (error) {
      if (!checkoutMutation.error) setNavigationError(errorMessage(error));
      setBusyAction(null);
    }
  }

  async function openPortal() {
    checkoutMutation.reset();
    portalMutation.reset();
    setNavigationError(null);
    setBusyAction("portal");
    try {
      navigateToHostedBilling(await portalMutation.mutateAsync());
    } catch (error) {
      if (!portalMutation.error) setNavigationError(errorMessage(error));
      setBusyAction(null);
    }
  }

  if (!overview) return <BillingLoadingPage />;

  const subscription = overview.subscription;
  const hasCurrentSubscription = Boolean(
    subscription && isCurrentSubscription(subscription.status),
  );
  const hasBillingAccount = Boolean(subscription || overview.purchases.length);

  return (
    <AppShell userName={user.name}>
      <main className="app-content billing-content">
        <header className="billing-heading">
          <span className="eyebrow">Workspace / Billing</span>
          <div className="billing-heading-row">
            <div>
              <h1>Billing</h1>
              <p>Subscription, purchases, and payment details in one place.</p>
            </div>
            {overview.enabled && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="billing-refresh"
                disabled={overviewQuery.isFetching || busyAction !== null}
                onClick={() => void overviewQuery.refetch()}
              >
                <RefreshCw
                  size={15}
                  strokeWidth={iconStroke}
                  className={overviewQuery.isFetching ? "spin" : undefined}
                  aria-hidden="true"
                />
                Refresh status
              </Button>
            )}
          </div>
        </header>

        {checkout === "success" && (
          <div className="billing-return-note" role="status">
            <ShieldCheck
              size={20}
              strokeWidth={iconStroke}
              aria-hidden="true"
            />
            <div>
              <strong>Returned from checkout</strong>
              <p>
                Payment confirmation can take a moment. Status below reflects
                confirmed billing records; refresh if it has not updated yet.
              </p>
            </div>
          </div>
        )}
        {checkout === "cancelled" && (
          <div
            className="billing-return-note billing-return-neutral"
            role="status"
          >
            <CreditCard size={20} strokeWidth={iconStroke} aria-hidden="true" />
            <div>
              <strong>Checkout closed</strong>
              <p>Existing billing details remain available below.</p>
            </div>
          </div>
        )}

        {actionError && (
          <div className="billing-action-error" role="alert">
            <strong>Could not continue to billing</strong>
            <span>{actionError}</span>
          </div>
        )}

        {!overview.enabled ? (
          <section
            className="billing-unavailable"
            aria-labelledby="billing-unavailable-title"
          >
            <span className="billing-unavailable-icon" aria-hidden="true">
              <CreditCard size={26} strokeWidth={iconStroke} />
            </span>
            <span className="section-kicker">Billing status</span>
            <h2 id="billing-unavailable-title">Purchases are unavailable</h2>
            <p>
              Billing options are not available for this workspace right now.
            </p>
          </section>
        ) : (
          <>
            <section
              className="billing-account"
              aria-labelledby="billing-account-title"
            >
              <div className="billing-account-main">
                <span className="billing-account-icon" aria-hidden="true">
                  <CreditCard size={22} strokeWidth={iconStroke} />
                </span>
                <div>
                  <span className="billing-account-kicker">
                    Account overview
                  </span>
                  <h2 id="billing-account-title">
                    {subscription ? "Subscription" : "No subscription"}
                  </h2>
                  <p>
                    {subscription
                      ? subscription.cancelAtPeriodEnd
                        ? "Cancellation scheduled for end of current period."
                        : "Manage payment method and subscription in Stripe."
                      : "Choose subscription below if recurring access fits."}
                  </p>
                </div>
              </div>
              <div className="billing-account-detail">
                <span className="billing-detail-label">Status</span>
                <Badge
                  variant={
                    subscription?.status === "active" ||
                    subscription?.status === "trialing"
                      ? "subtle"
                      : "outline"
                  }
                >
                  {subscription ? statusLabel(subscription.status) : "None"}
                </Badge>
                {subscription?.currentPeriodEnd && (
                  <p>
                    {subscription.cancelAtPeriodEnd
                      ? "Access ends"
                      : "Current period ends"}{" "}
                    <time dateTime={subscription.currentPeriodEnd}>
                      {formatDate(subscription.currentPeriodEnd)}
                    </time>
                  </p>
                )}
              </div>
              {hasBillingAccount && (
                <Button
                  type="button"
                  variant="outline"
                  className="billing-portal-button"
                  disabled={busyAction !== null}
                  onClick={() => void openPortal()}
                >
                  {busyAction === "portal" ? (
                    <LoaderCircle
                      className="spin"
                      size={16}
                      aria-hidden="true"
                    />
                  ) : (
                    <ArrowUpRight
                      size={16}
                      strokeWidth={iconStroke}
                      aria-hidden="true"
                    />
                  )}
                  {busyAction === "portal" ? "Opening…" : "Manage billing"}
                </Button>
              )}
            </section>

            <section
              className="billing-options"
              aria-labelledby="billing-options-title"
            >
              <div className="billing-section-heading">
                <span className="section-kicker">Available options</span>
                <h2 id="billing-options-title">Choose how to pay</h2>
                <p>
                  Checkout opens on Stripe. Plan details and total appear before
                  payment.
                </p>
              </div>
              <ul className="billing-offer-grid">
                {overview.offers.map((offer: BillingOffer) => {
                  const isSubscription = offer.kind === "subscription";
                  const isCurrent = isSubscription && hasCurrentSubscription;
                  const isBusy = busyAction === offer.kind;
                  return (
                    <li className="billing-offer" key={offer.kind}>
                      <div className="billing-offer-topline">
                        <span>{isSubscription ? "Recurring" : "One-time"}</span>
                        <ArrowUpRight
                          size={16}
                          strokeWidth={iconStroke}
                          aria-hidden="true"
                        />
                      </div>
                      <h3>{offer.label}</h3>
                      <p>
                        {isSubscription
                          ? offer.interval
                            ? `Charged every ${offer.interval}. Manage or cancel in billing portal.`
                            : "Recurring charge. Manage or cancel in billing portal."
                          : "Single payment with no recurring charge."}
                      </p>
                      <div className="billing-offer-footer">
                        <div className="billing-price">
                          <strong
                            className={
                              offer.amount === null
                                ? "billing-price-note"
                                : undefined
                            }
                          >
                            {formatMoney(offer.amount, offer.currency)}
                          </strong>
                          {isSubscription && offer.interval && (
                            <span>/ {offer.interval}</span>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant={isCurrent ? "outline" : "default"}
                          disabled={isCurrent || busyAction !== null}
                          onClick={() => void beginCheckout(offer.kind)}
                          aria-label={
                            isCurrent
                              ? "Current subscription"
                              : `${isSubscription ? "Choose" : "Purchase"} ${offer.label}`
                          }
                        >
                          {isBusy ? (
                            <LoaderCircle
                              className="spin"
                              size={16}
                              aria-hidden="true"
                            />
                          ) : !isCurrent ? (
                            <ArrowRight
                              size={16}
                              strokeWidth={iconStroke}
                              aria-hidden="true"
                            />
                          ) : null}
                          {isBusy
                            ? "Opening…"
                            : isCurrent
                              ? "Current plan"
                              : isSubscription
                                ? "Choose plan"
                                : "Purchase"}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section
              className="billing-history"
              aria-labelledby="billing-history-title"
            >
              <div className="billing-section-heading">
                <span className="section-kicker">Payment record</span>
                <h2 id="billing-history-title">One-time payments</h2>
                <p>Recorded payment activity for this account.</p>
              </div>
              {overview.purchases.length ? (
                <ul className="billing-purchase-list">
                  {overview.purchases.map((purchase) => (
                    <li key={purchase.checkoutSessionId}>
                      <span
                        className="billing-purchase-icon"
                        aria-hidden="true"
                      >
                        <ReceiptText size={18} strokeWidth={iconStroke} />
                      </span>
                      <span className="billing-purchase-copy">
                        <strong>One-time purchase</strong>
                        <time dateTime={purchase.createdAt}>
                          {formatDate(purchase.createdAt)}
                        </time>
                      </span>
                      <span className="billing-purchase-meta">
                        <strong>
                          {formatMoney(
                            purchase.amountTotal,
                            purchase.currency,
                            "Amount unavailable",
                          )}
                        </strong>
                        <span>{statusLabel(purchase.status)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="billing-history-empty">
                  <ReceiptText
                    size={24}
                    strokeWidth={iconStroke}
                    aria-hidden="true"
                  />
                  <div>
                    <strong>No one-time payment activity yet</strong>
                    <p>
                      Checkout activity will appear here after confirmation.
                    </p>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </AppShell>
  );
}
