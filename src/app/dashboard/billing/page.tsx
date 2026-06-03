import { createClient } from "@/lib/supabase/server";

async function getBillingOverview(supabase: Awaited<ReturnType<typeof createClient>>) {
  const [bills, meters] = await Promise.all([
    supabase
      .from("bills")
      .select("id, period_start, period_end, total_amount, currency, status, due_date")
      .order("period_start", { ascending: false })
      .limit(12),
    supabase.from("meters").select("id", { count: "exact", head: true }),
  ]);

  return {
    bills: bills.data ?? [],
    activeMeterCount: meters.count ?? 0,
  };
}

export default async function BillingPage() {
  const supabase = await createClient();
  const { bills, activeMeterCount } = await getBillingOverview(supabase);

  const statusStyles: Record<string, string> = {
    draft: "bg-surface-secondary text-text-secondary",
    issued: "bg-blue-100 text-blue-700",
    paid: "bg-green-100 text-green-700",
    overdue: "bg-red-100 text-red-700",
    void: "bg-surface-secondary text-text-muted",
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-text">Billing</h1>
          <p className="text-text-muted mt-1">Subscription and billing history</p>
        </div>
      </div>

      {/* Subscription summary */}
      <div className="bg-surface rounded-xl border border-border p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text">Current Subscription</h2>
            <p className="text-sm text-text-secondary mt-1">
              {activeMeterCount} active meter{activeMeterCount !== 1 ? "s" : ""} &mdash; billed monthly per meter
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-text">
              R{(activeMeterCount * 35).toFixed(2)}
            </p>
            <p className="text-xs text-text-muted">est. monthly (R35/meter)</p>
          </div>
        </div>
      </div>

      {/* Bills table */}
      {bills.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border px-6 py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-surface-secondary text-text-muted flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-text mb-1">No bills yet</h3>
          <p className="text-text-muted max-w-sm mx-auto">
            Bills will be generated at the end of each billing period based on active meters and consumption.
          </p>
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border-light">
            <h2 className="text-lg font-semibold text-text">Billing History</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border-light">
                  <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-6 py-3">Period</th>
                  <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-6 py-3">Amount</th>
                  <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-6 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-6 py-3">Due Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {bills.map((bill: any) => (
                  <tr key={bill.id} className="hover:bg-surface-hover transition-colors">
                    <td className="px-6 py-4 text-sm text-text">
                      {new Date(bill.period_start).toLocaleDateString()} &ndash;{" "}
                      {new Date(bill.period_end).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-text">
                      {bill.currency ?? "ZAR"} {Number(bill.total_amount).toFixed(2)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${statusStyles[bill.status] ?? "bg-surface-secondary text-text-secondary"}`}>
                        {bill.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-text-secondary">
                      {bill.due_date ? new Date(bill.due_date).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
