"use server";

import { createClient } from "@/lib/supabase/server";
import type { MapSite, SiteHealth } from "@/components/map/map-types";

function formatAddress(address: any): string {
  if (!address || typeof address !== "object") return "";
  return [address.street, address.city, address.province, address.country]
    .filter(Boolean)
    .join(", ");
}

/** Read an embedded `resource(count)` aggregate from a PostgREST result row. */
function embeddedCount(value: any): number {
  if (Array.isArray(value)) return Number(value[0]?.count) || 0;
  if (value && typeof value === "object") return Number(value.count) || 0;
  return 0;
}

/**
 * Lightweight dashboard-map summary.
 *
 * Uses a SINGLE query with PostgREST embedded aggregates — `meters(count)` and
 * `alerts(count)` (filtered to triggered) — instead of fetching full meter/
 * gateway/alert datasets and counting in memory. If the `alerts` relationship
 * isn't available, it falls back to a single meters-only count query.
 *
 * Returns only what the map needs: id, name, code, address, coords, status,
 * meter count and active-alert count (rolled into a health colour).
 */
export async function getDashboardMapData(): Promise<MapSite[]> {
  const supabase = await createClient();

  const withAlerts =
    "id, name, code, address, latitude, longitude, status, meters(count), alerts(count)";

  const primary = await supabase
    .from("sites")
    .select(withAlerts)
    .eq("alerts.status", "triggered")
    .order("name");

  let rows: any[] = primary.data ?? [];
  if (primary.error) {
    const fallback = await supabase
      .from("sites")
      .select("id, name, code, address, latitude, longitude, status, meters(count)")
      .order("name");
    rows = fallback.data ?? [];
  }

  return rows.map((site): MapSite => {
    const meterCount = embeddedCount(site.meters);
    const activeAlerts = embeddedCount(site.alerts);
    const health: SiteHealth =
      activeAlerts > 0 ? "critical" : site.status !== "active" ? "warning" : "ok";

    return {
      id: site.id,
      name: site.name,
      code: site.code,
      address: formatAddress(site.address),
      latitude: site.latitude != null ? Number(site.latitude) : null,
      longitude: site.longitude != null ? Number(site.longitude) : null,
      meterCount,
      health,
    };
  });
}
