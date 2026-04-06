import { createClient } from "@/lib/supabase/server";

async function getSites(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase
    .from("sites")
    .select("id, name, code, timezone, status, address, created_at")
    .order("name");

  if (error) {
    console.error("sites query error:", error);
  }
  return data ?? [];
}

async function getSiteCounts(supabase: Awaited<ReturnType<typeof createClient>>, siteIds: string[]) {
  if (siteIds.length === 0) return {};
  const { data: buildings } = await supabase
    .from("buildings")
    .select("site_id")
    .in("site_id", siteIds);

  const { data: meters } = await supabase
    .from("meters")
    .select("site_id")
    .in("site_id", siteIds);

  const counts: Record<string, { buildings: number; meters: number }> = {};
  siteIds.forEach((id) => {
    counts[id] = {
      buildings: buildings?.filter((b: any) => b.site_id === id).length ?? 0,
      meters: meters?.filter((m: any) => m.site_id === id).length ?? 0,
    };
  });
  return counts;
}

export default async function SitesPage() {
  const supabase = await createClient();
  const sites = await getSites(supabase);
  const counts = await getSiteCounts(
    supabase,
    sites.map((s: any) => s.id)
  );

  const statusStyles: Record<string, { dot: string; bg: string; text: string }> = {
    active: { dot: "bg-green-500", bg: "bg-green-50", text: "text-green-700" },
    inactive: { dot: "bg-gray-400", bg: "bg-gray-50", text: "text-gray-600" },
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sites</h1>
          <p className="text-gray-500 mt-1">
            {sites.length} site{sites.length !== 1 ? "s" : ""} configured
          </p>
        </div>
      </div>

      {sites.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-purple-50 text-purple-500 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No sites yet</h3>
          <p className="text-gray-500 max-w-sm mx-auto">
            Sites represent physical locations where your meters and gateways are installed.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sites.map((site: any) => {
            const style = statusStyles[site.status] ?? statusStyles.inactive;
            const c = counts[site.id] ?? { buildings: 0, meters: 0 };
            const addr = site.address;

            return (
              <div
                key={site.id}
                className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{site.name}</h3>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">{site.code}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                    <span className="capitalize">{site.status}</span>
                  </span>
                </div>

                {addr && (
                  <p className="text-sm text-gray-500 mb-4">
                    {[addr.street, addr.city, addr.province, addr.country].filter(Boolean).join(", ")}
                  </p>
                )}

                <div className="flex gap-4 text-sm pt-3 border-t border-gray-100">
                  <div>
                    <span className="font-semibold text-gray-900">{c.buildings}</span>
                    <span className="text-gray-500 ml-1">building{c.buildings !== 1 ? "s" : ""}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-gray-900">{c.meters}</span>
                    <span className="text-gray-500 ml-1">meter{c.meters !== 1 ? "s" : ""}</span>
                  </div>
                </div>

                <div className="text-xs text-gray-400 mt-3">
                  TZ: {site.timezone ?? "UTC"}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
