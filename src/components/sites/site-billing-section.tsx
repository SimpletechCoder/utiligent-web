"use client";

import { useMemo, useState } from "react";
import { saveSiteBillingConfig } from "@/app/actions/billing";
import {
  computeItem,
  computeTotals,
  defaultBillingItems,
  formatCurrency,
  pricingTierLabel,
  type BillingItem,
} from "@/lib/billing";

interface SiteBillingSectionProps {
  siteId: string;
  canManage: boolean;
  currency: string;
  meterCount: number;
  initialItems: BillingItem[] | null;
}

export function SiteBillingSection({
  siteId,
  canManage,
  currency,
  meterCount,
  initialItems,
}: SiteBillingSectionProps) {
  const [items, setItems] = useState<BillingItem[]>(
    initialItems && initialItems.length > 0
      ? initialItems
      : defaultBillingItems(meterCount)
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<
    { type: "success" | "error"; text: string } | null
  >(null);

  const totals = useMemo(() => computeTotals(items), [items]);

  function updateItem(index: number, patch: Partial<BillingItem>) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item))
    );
  }

  function resetToDefaults() {
    setItems(defaultBillingItems(meterCount));
    setMessage(null);
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const result = await saveSiteBillingConfig(siteId, items, currency);
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
              Reset to defaults
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
            {items.map((raw, index) => {
              const item = computeItem(raw);
              return (
                <tr key={item.key}>
                  <td className="py-3 pr-4">
                    <div className="text-sm font-medium text-text">{item.label}</div>
                    {item.addon && (
                      <span className="text-xs text-text-muted">Add-on</span>
                    )}
                  </td>
                  <td className={`py-3 px-4 ${cellNum}`}>
                    {canManage ? (
                      <input
                        type="number"
                        min={0}
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(index, {
                            quantity: Math.max(0, Number(e.target.value) || 0),
                          })
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
                        step="any"
                        value={item.resellerAdjustment}
                        onChange={(e) =>
                          updateItem(index, {
                            resellerAdjustment: Number(e.target.value) || 0,
                          })
                        }
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
    </div>
  );
}
