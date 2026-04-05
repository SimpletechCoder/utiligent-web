import { createClient } from "@/lib/supabase/server";

async function getStats(supabase: Awaited<ReturnType<typeof createClient>>) {
  const [meters, gateways, alerts, org] = await Promise.all([
    supabase.from("meters").select("id", { count: "exact", head: true }),
    supabase.from("gateways").select("id", { count: "exact", head: true }),
    supabase
      .from("alerts")
      .select("id", { count: "exact", head: true })
      .eq("status", "triggered"),
    supabase.from("organizations").select("name").limit(1).single(),
  ]);

  return {
    meterCount: meters.count ?? 0,
    gatewayCount: gateways.count ?? 0,
    activeAlerts: alerts.count ?? 0,
    orgName: org.data?.name ?? "Your Organization",
  };
}

async function getRecentAlerts(
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const { data } = await supabase
    .from("alerts")
    .select("id, severity, message, triggered_at, status")
    .order("triggered_at", { ascending: false })
    .limit(5);

  return data ?? [];
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const stats = await getStats(supabase);
  const recentAlerts = await getRecentAlerts(supabase);

  const cards = [
    {
      label: "Meters",
      value: stats.meterCount,
      color: "blue",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      label: "Gateways",
      value: stats.gatewayCount,
      color: "green",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0" />
        </svg>
      ),
    },
    {
      label: "Active Alerts",
      value: stats.activeAlerts,
      color: stats.activeAlerts > 0 ? "red" : "gray",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      ),
    },
  ];

  const colorMap: Record<string, { bg: string; text: string; icon: string }> = {
    blue: { bg: "bg-blue-50", text: "text-blue-700", icon: "text-blue-500" },
    green: { bg: "bg-green-50", text: "text-green-700", icon: "text-green-500" },
    red: { bg: "bg-red-50", text: "text-red-700", icon: "text-red-500" },
    gray: { bg: "bg-gray-50", text: "text-gray-700", icon: "text-gray-400" },
  };

  const severityColors: Record<string, string> = {
    critical: "bg-red-100 text-red-800",
    high: "bg-orange-100 text-orange-800",
    medium: "bg-yellow-100 text-yellow-800",
    low: "bg-blue-100 text-blue-800",
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">{stats.orgName}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {cards.map((card) => {
          const colors = colorMap[card.color];
          return (
            <div
              key={card.label}
              className="bg-white rounded-xl border border-gray-200 p-6 flex items-center gap-4"
            >
              <div
                className={`w-12 h-12 rounded-lg ${colors.bg} ${colors.icon} flex items-center justify-center`}
              >
                {card.icon}
              </div>
              <div>
                <p className="text-sm text-gray-500">{card.label}</p>
                <p className={`text-2xl font-bold ${colors.text}`}>
                  {card.value}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent alerts */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            Recent Alerts
          </h2>
        </div>
        {recentAlerts.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-400">
            No alerts yet. Alerts will appear here when triggered.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {recentAlerts.map((alert) => (
              <div
                key={alert.id}
                className="px-6 py-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      severityColors[alert.severity] ?? "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {alert.severity}
                  </span>
                  <span className="text-sm text-gray-700">{alert.message}</span>
                </div>
                <span className="text-xs text-gray-400">
                  {new Date(alert.triggered_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
