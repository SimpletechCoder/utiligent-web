/**
 * Per-site billing model with reseller margins.
 *
 * Pure, isomorphic helpers (no server-only imports) so both the billing UI and
 * the save server action share one source of truth for pricing maths.
 *
 * Base metering price is tiered on the number of meters at the site:
 *   - 1–9 meters   → R145 / meter
 *   - 10–99 meters → R65 / meter   ("10+")
 *   - 100+ meters  → R50 / meter   ("bulk")
 * The Valve + Leak detection add-on is a flat R95 / meter.
 */

export const VALVE_LEAK_ADDON_PRICE = 95;

export interface BillingItem {
  /** Stable identifier for the line item. */
  key: string;
  /** Human label shown in the billing table. */
  label: string;
  /** Base (cost) price per unit, in Rand. */
  basePrice: number;
  /** Reseller margin added per unit, in Rand (editable). */
  resellerAdjustment: number;
  /** Number of units billed. */
  quantity: number;
  /** Whether this line is an optional add-on. */
  addon?: boolean;
}

export interface BillingItemComputed extends BillingItem {
  /** base + adjustment, per unit. */
  clientPrice: number;
  /** basePrice * quantity. */
  baseTotal: number;
  /** clientPrice * quantity. */
  clientTotal: number;
  /** adjustment * quantity. */
  margin: number;
}

export interface BillingTotals {
  baseTotal: number;
  clientTotal: number;
  margin: number;
}

/** Tiered base metering price per meter, given the site's meter count. */
export function basePricePerMeter(meterCount: number): number {
  if (meterCount >= 100) return 50;
  if (meterCount >= 10) return 65;
  return 145;
}

/** Label for the active pricing tier (for display). */
export function pricingTierLabel(meterCount: number): string {
  if (meterCount >= 100) return "Bulk (100+ meters)";
  if (meterCount >= 10) return "Volume (10+ meters)";
  return "Standard (1–9 meters)";
}

/**
 * Default line items for a site, derived from its live meter count. Used when a
 * site has no saved billing config yet.
 */
export function defaultBillingItems(meterCount: number): BillingItem[] {
  const qty = Math.max(meterCount, 0);
  return [
    {
      key: "metering",
      label: "Metering & Monitoring",
      basePrice: basePricePerMeter(qty),
      resellerAdjustment: 0,
      quantity: qty,
      addon: false,
    },
    {
      key: "valve_leak",
      label: "Valve + Leak Detection",
      basePrice: VALVE_LEAK_ADDON_PRICE,
      resellerAdjustment: 0,
      quantity: 0,
      addon: true,
    },
  ];
}

/** Round to 2 decimals, guarding against floating-point drift. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Compute derived columns for a single line item. */
export function computeItem(item: BillingItem): BillingItemComputed {
  const basePrice = Number(item.basePrice) || 0;
  const adjustment = Number(item.resellerAdjustment) || 0;
  const quantity = Number(item.quantity) || 0;
  const clientPrice = round2(basePrice + adjustment);
  return {
    ...item,
    basePrice,
    resellerAdjustment: adjustment,
    quantity,
    clientPrice,
    baseTotal: round2(basePrice * quantity),
    clientTotal: round2(clientPrice * quantity),
    margin: round2(adjustment * quantity),
  };
}

/** Compute the totals row across all line items. */
export function computeTotals(items: BillingItem[]): BillingTotals {
  return items.reduce<BillingTotals>(
    (acc, raw) => {
      const item = computeItem(raw);
      acc.baseTotal = round2(acc.baseTotal + item.baseTotal);
      acc.clientTotal = round2(acc.clientTotal + item.clientTotal);
      acc.margin = round2(acc.margin + item.margin);
      return acc;
    },
    { baseTotal: 0, clientTotal: 0, margin: 0 }
  );
}

/** Format a Rand amount for display. */
export function formatCurrency(amount: number, currency: string = "ZAR"): string {
  const symbol = currency === "ZAR" ? "R" : `${currency} `;
  return `${symbol}${(Number(amount) || 0).toFixed(2)}`;
}
