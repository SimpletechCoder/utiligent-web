import { createClient } from "@/lib/supabase/server";

async function getAlerts(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase
    .from("alerts")
    .select(
      "id, alert_type, severity, status, title, message, triggered_at, acknowledged_at, resolved_at, meter_id, meters(serial_number)"
    )
    .order("triggered_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("alerts query error:", error);
  }
  return data ?? [];
}

export default async function AlertsPage() {
  const supabase = await createClient();
  const alerts = await getAlerts(supabase);

  const severityStyles: Record<string, { dot: string; bg: string; text: string }> = {
    critical: { dot: "bg-red-600", bg: "bg-red-50", text: "text-red-800" },
    high: { dot: "bg-orange-500", bg: "bg-orange-50", text: "text-orange-800" },
    medium: { dot: "bg-yellow-500", bg: "bg-yellow-50", text: "text-yellow-800" },
    low: { dot: "bg-blue-400", bg: "bg-blue-50", text: "text-blue-800" },
    info: { dot: "bg-gray-400", bg: "bg-gray-50", text: "text-gray-700" },
  };

  const statusStyles: Record<string, string> = {
    triggered: "bg-red-100 text-red-700",
    acknowledged: "bg-yellow-100 text-yellow-700",
    resolved: "bg-green-100 text-green-700",
  };

  const triggered = alerts.filter((a: any) => a.status === "triggered");
  const acknowledged = alerts.filter((a: any) => a.status === "acknowledged");
  const resolved = alerts.filter((a: any) => a.status === "resolved");

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alerts</h1>
          <p className="text-gray-500 mt-1">
            {triggered.length} active, {acknowledged.length} acknowledged, {resolved.length} resolved
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-red-700">{triggered.length}</p>
            <p className="text-xs text-gray-500">Active Alerts</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-yellow-50 text-yellow-600 flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-yellow-700">{acknowledged.length}</p>
            <p className="text-xs text-gray-500">Acknowledged</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-green-50 text-green-600 flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-700">{resolved.length}</p>
            <p className="text-xs text-gray-500">Resolved</p>
          </div>
        </div>
      </div>

      {/* Alerts list */}
      {alerts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-green-50 text-green-500 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">All clear</h3>
          <p className="text-gray-500 max-w-sm mx-auto">
            No alerts have been triggered. Alerts will appear here when leak detection, tamper, or threshold rules fire.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Severity</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Alert</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Meter</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Triggered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {alerts.map((alert: any) => {
                  const sev = severityStyles[alert.severity] ?? severityStyles.info;
                  const statClass = statusStyles[alert.status] ?? "bg-gray-100 text-gray-700";
                  return (
                    <tr key={alert.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${sev.bg} ${sev.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
                          <span className="capitalize">{alert.severity}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900 text-sm">{alert.title}</div>
                        {alert.message && (
                          <div className="text-xs text-gray-400 mt-0.5 max-w-xs truncate">{alert.message}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 font-mono">
                        {alert.meters?.serial_number ?? "—"}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${statClass}`}>
                          {alert.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {alert.triggered_at
                          ? new Date(alert.triggered_at).toLocaleString()
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
