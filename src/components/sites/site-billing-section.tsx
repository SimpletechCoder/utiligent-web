"use client";

import { useMemo, useState } from "react";
import { saveSiteBillingConfig } from "@/app/actions/billing";
import {
  basePricePerMeter,
  computeItem,
  computeTotals,
  formatCurrency,
  pricingTierLabel,
  VALVE_LEAK_ADDON_PRICE,
  type BillingItem,
} from "@/lib/billing";

interface SiteBillingSectionProps {
  siteId: string;
  canManage: boolean;
  currency: string;
  meterCount: number;
  initialItems: BillingItem[] | null;
}

function findAdjustment(items: BillingItem[] | null, key: string): number {
  const match = items?.find((i) => i.key === key);
  return match ? Math.max(0, Number(match.resellerAdjustment) || 0) : 0;
}

function findQuantity(items: BillingItem[] | null, key: string, fallback: number): number {
  const match = items?.find((i) => i.key === key);
  return match ? Math.max(0, Math.trunc(Number(match.quantity) || 0)) : fallback;
}

export function SiteBillingSection({
  siteId,
  canManage,
  currency,
  meterCount,
  initialItems,
}: SiteBillingSectionProps) {
  // Only the reseller margin (and the add-on's meter coverage) are editable.
  // Base prices and the metering quantity are server-authoritative — shown here
  // read-only, computed from the live meter count so the preview matches what
  // the server will persist.
  const [meteringAdj, setMeteringAdj] = useState<number>(() =>
    findAdjustment(initialItems, "metering")
  );
  const [valveAdj, setValveAdj] = useState<number>(() =>
    findAdjustment(initialItems, "valve_leak")
  );
  const [valveQty, setValveQty] = useState<number>(() =>
    Math.min(findQuantity(initialItems, "valve_leak", 0), meterCount)
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<
    { type: "success" | "error"; text: string } | null
  >(null);

  const meteringBase = basePricePerMeter(meterCount);

  const items: BillingItem[] = useMemo(
    () => [
      {
        key: "metering",
        label: "Metering & Monitoring",
        basePrice: meteringBase,
        resellerAdjustment: meteringAdj,
        quantity: meterCount,
        addon: false,
      },
      {
        key: "valve_leak",
        label: "Valve + Leak Detection",
        basePrice: VALVE_LEAK_ADDON_PRICE,
        resellerAdjustment: valveAdj,
        quantity: valveQty,
        addon: true,
      },
    ],
    [meteringBase, meteringAdj, meterCount, valveAdj, valveQty]
  );

  const totals = useMemo(() => computeTotals(items), [items]);

  function resetToDefaults() {
    setMeteringAdj(0);
    setValveAdj(0);
    setValveQty(0);
    setMessage(null);
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      // Send only the reseller adjustments; the server recomputes base prices.
      const result = await saveSiteBillingConfig(
        siteId,
        [
          { key: "metering", resellerAdjustment: meteringAdj },
          { key: "valve_leak", resellerAdjustment: valveAdj, quantity: valveQty },
        ],
        currency
      );
      if (!result.success) {
        setMessage({ type: "error", text: result.error ?? "Failed to save" });
      } else {
        setMessage({ type: "success", text: "Billing configuration saved" });
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message ?? "Unexpected error" });
    } finally {
      setSaving(false);
    }
  }

  const cellNum = "text-right tabular-nums";

  return (
    <div className="bg-surface rounded-xl border border-border">
      <div className="px-6 py-4 border-b border-border-light flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text">Billing & Reseller Margin</h2>
          <p className="text-sm text-text-secondary mt-0.5">
            Pricing tier: {pricingTierLabel(meterCount)} · {meterCount} meter
            {meterCount !== 1 ? "s" : ""}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <button
              onClick={resetToDefaults}
              className="px-3 py-2 border border-border text-text rounded-lg text-sm font-medium hover:bg-surface-hover transition-colors"
            >
              Reset margins
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-dark disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Save Billing"}
            </button>
          </div>
        )}
      </div>

      {message && (
        <div
          className={`mx-6 mt-4 px-4 py-3 rounded-lg text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="overflow-x-auto p-6">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="border-b border-border-light">
              <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider py-3 pr-4">
                Item
              </th>
              <th className="text-right text-xs font-medium text-text-secondary uppercase tracking-wider py-3 px-4">
                Qty
              </th>
              <th className="text-right text-xs font-medium text-text-secondary uppercase tracking-wider py-3 px-4">
                Base Price
              </th>
              <th className="text-right text-xs font-medium text-text-secondary uppercase tracking-wider py-3 px-4">
                Reseller Adj.
              </th>
              <th className="text-right text-xs font-medium text-text-secondary uppercase tracking-wider py-3 px-4">
                Client Price
              </th>
              <th className="text-right text-xs font-medium text-text-secondary uppercase tracking-wider py-3 pl-4">
                Margin
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light">
            {items.map((raw) => {
              const item = computeItem(raw);
              const isAddon = item.key === "valve_leak";
              return (
                <tr key={item.key}>
                  <td className="py-3 pr-4">
                    <div className="text-sm font-medium text-text">{item.label}</div>
                    {item.addon && (
                      <span className="text-xs text-text-muted">Add-on</span>
                    )}
                  </td>
                  <td className={`py-3 px-4 ${cellNum}`}>
                    {canManage && isAddon ? (
                      <input
                        type="number"
                        min={0}
                        max={meterCount}
                        value={valveQty}
                        onChange={(e) =>
                          setValveQty(
                            Math.min(
                              Math.max(0, Math.trunc(Number(e.target.value) || 0)),
                              meterCount
                            )
                          )
                        }
                        className="w-20 px-2 py-1 border border-border rounded text-sm text-right bg-surface text-text focus:outline-none focus:ring-2 focus:ring-brand"
                      />
                    ) : (
                      item.quantity
                    )}
                  </td>
                  <td className={`py-3 px-4 text-sm text-text ${cellNum}`}>
                    {formatCurrency(item.basePrice, currency)}
                  </td>
                  <td className={`py-3 px-4 ${cellNum}`}>
                    {canManage ? (
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={isAddon ? valveAdj : meteringAdj}
                        onChange={(e) => {
                          const next = Math.max(0, Number(e.target.value) || 0);
                          if (isAddon) setValveAdj(next);
                          else setMeteringAdj(next);
                        }}
                        className="w-24 px-2 py-1 border border-border rounded text-sm text-right bg-surface text-text focus:outline-none focus:ring-2 focus:ring-brand"
                      />
                    ) : (
                      formatCurrency(item.resellerAdjustment, currency)
                    )}
                  </td>
                  <td className={`py-3 px-4 text-sm font-medium text-text ${cellNum}`}>
                    {formatCurrency(item.clientPrice, currency)}
                  </td>
                  <td className={`py-3 pl-4 text-sm text-green-600 ${cellNum}`}>
                    {formatCurrency(item.margin, currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border">
              <td className="py-3 pr-4 text-sm font-semibold text-text" colSpan={2}>
                Totals (monthly)
              </td>
              <td className={`py-3 px-4 text-sm font-semibold text-text ${cellNum}`}>
                {formatCurrency(totals.baseTotal, currency)}
              </td>
              <td className="py-3 px-4" />
              <td className={`py-3 px-4 text-sm font-semibold text-text ${cellNum}`}>
                {formatCurrency(totals.clientTotal, currency)}
              </td>
              <td className={`py-3 pl-4 text-sm font-semibold text-green-600 ${cellNum}`}>
                {formatCurrency(totals.margin, currency)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {canManage && (
        <p className="px-6 pb-5 -mt-2 text-xs text-text-muted">
          Base prices are set automatically from the site&apos;s meter count and cannot be
          edited. You control the reseller margin only.
        </p>
      )}
    </div>
  );
}
