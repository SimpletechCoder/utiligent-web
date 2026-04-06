import { createClient } from "@/lib/supabase/server";

async function getGateways(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase
    .from("gateways")
    .select(
      "id, name, serial_number, firmware_version, status, last_seen_at, last_heartbeat_at, provisioned_at, site_id, sites(name)"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("gateways query error:", error);
  }
  return data ?? [];
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function GatewaysPage() {
  const supabase = await createClient();
  const gateways = await getGateways(supabase);

  const statusStyles: Record<string, { dot: string; bg: string; text: string }> = {
    online: { dot: "bg-green-500", bg: "bg-green-50", text: "text-green-700" },
    offline: { dot: "bg-red-500", bg: "bg-red-50", text: "text-red-700" },
    provisioned: { dot: "bg-blue-500", bg: "bg-blue-50", text: "text-blue-700" },
    revoked: { dot: "bg-gray-400", bg: "bg-gray-50", text: "text-gray-600" },
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gateways</h1>
          <p className="text-gray-500 mt-1">
            {gateways.length} gateway{gateways.length !== 1 ? "s" : ""} configured
          </p>
        </div>
      </div>

      {gateways.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-green-50 text-green-500 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No gateways yet</h3>
          <p className="text-gray-500 max-w-sm mx-auto">
            Gateways will appear here once provisioned. Configure your Milesight UG56 to connect to the Utiligent ingest endpoint.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {gateways.map((gw: any) => {
            const style = statusStyles[gw.status] ?? statusStyles.offline;
            return (
              <div
                key={gw.id}
                className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">{gw.name || gw.serial_number}</h3>
                    {gw.name && (
                      <p className="text-xs text-gray-400 mt-0.5">{gw.serial_number}</p>
                    )}
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                    <span className="capitalize">{gw.status}</span>
                  </span>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Site</span>
                    <span className="text-gray-900">{gw.sites?.name ?? "Unassigned"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Firmware</span>
                    <span className="text-gray-900 font-mono text-xs">{gw.firmware_version ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Last seen</span>
                    <span className="text-gray-900">{timeAgo(gw.last_seen_at)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Heartbeat</span>
                    <span className="text-gray-900">{timeAgo(gw.last_heartbeat_at)}</span>
                  </div>
                  {gw.provisioned_at && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Provisioned</span>
                      <span className="text-gray-900">
                        {new Date(gw.provisioned_at).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
