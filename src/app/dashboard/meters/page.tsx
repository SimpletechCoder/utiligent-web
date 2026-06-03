import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

async function getMeters(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase
    .from("meters")
    .select(
      "id, serial_number, manufacturer, model, utility_type, status, installed_at, site_id, building_id, unit_id, gateway_id, sites(name), buildings(name), units(name), gateways(name)"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("meters query error:", error);
  }
  return data ?? [];
}

export default async function MetersPage() {
  const supabase = await createClient();
  const meters = await getMeters(supabase);

  const statusStyles: Record<string, { dot: string; bg: string; text: string }> = {
    active: { dot: "bg-green-500", bg: "bg-green-50", text: "text-green-700" },
    inactive: { dot: "bg-gray-400", bg: "bg-surface-secondary", text: "text-text-secondary" },
    faulty: { dot: "bg-red-500", bg: "bg-red-50", text: "text-red-700" },
    decommissioned: { dot: "bg-yellow-500", bg: "bg-yellow-50", text: "text-yellow-700" },
  };

  const utilityIcons: Record<string, string> = {
    water: "💧",
    electricity: "⚡",
    gas: "🔥",
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-text">Meters</h1>
          <p className="text-text-secondary mt-1">
            {meters.length} meter{meters.length !== 1 ? "s" : ""} registered
          </p>
        </div>
      </div>

      {meters.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border px-6 py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-brand-light text-brand flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-text mb-1">No meters yet</h3>
          <p className="text-text-secondary max-w-sm mx-auto">
            Meters will appear here once your gateway starts forwarding data from your LoRaWAN devices.
          </p>
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border-light">
                  <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-6 py-3">
                    Meter
                  </th>
                  <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-6 py-3">
                    Type
                  </th>
                  <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-6 py-3">
                    Location
                  </th>
                  <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-6 py-3">
                    Gateway
                  </th>
                  <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-6 py-3">
                    Status
                  </th>
                  <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-6 py-3">
                    Installed
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {meters.map((meter: any) => {
                  const style = statusStyles[meter.status] ?? statusStyles.inactive;
                  const location = [
                    meter.sites?.name,
                    meter.buildings?.name,
                    meter.units?.name,
                  ]
                    .filter(Boolean)
                    .join(" / ");

                  return (
                    <tr key={meter.id} className="hover:bg-surface-hover transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-text">
                          {meter.serial_number}
                        </div>
                        <div className="text-xs text-text-muted">
                          {meter.manufacturer} {meter.model}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm">
                          {utilityIcons[meter.utility_type] ?? "📊"}{" "}
                          <span className="capitalize">{meter.utility_type}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-text-secondary">
                        {location || <span className="text-text-muted">Unassigned</span>}
                      </td>
                      <td className="px-6 py-4 text-sm text-text-secondary">
                        {meter.gateways?.name ?? (
                          <span className="text-text-muted">None</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                          <span className="capitalize">{meter.status}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-text-secondary">
                        {meter.installed_at
                          ? new Date(meter.installed_at).toLocaleDateString()
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
