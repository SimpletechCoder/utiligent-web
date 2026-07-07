export type SiteHealth = "ok" | "warning" | "critical";

export interface MapSite {
  id: string;
  name: string;
  code: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  meterCount: number;
  health: SiteHealth;
}

export const HEALTH_COLORS: Record<SiteHealth, string> = {
  ok: "#16a34a",
  warning: "#d97706",
  critical: "#dc2626",
};

export const HEALTH_LABELS: Record<SiteHealth, string> = {
  ok: "All OK",
  warning: "Warning / offline",
  critical: "Critical alert",
};
