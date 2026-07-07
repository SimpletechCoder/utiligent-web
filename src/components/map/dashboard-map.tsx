"use client";

import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTheme } from "@/lib/theme-provider";
import {
  HEALTH_COLORS,
  HEALTH_LABELS,
  type MapSite,
  type SiteHealth,
} from "./map-types";

// Leaflet touches `window`, so the map is client-only (ssr:false is only
// permitted inside a Client Component).
const SiteMapInner = dynamic(() => import("./site-map-inner"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-surface-hover">
      <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});

interface DashboardMapProps {
  sites: MapSite[];
}

const HEALTH_ORDER: Record<SiteHealth, number> = { critical: 0, warning: 1, ok: 2 };

export function DashboardMap({ sites }: DashboardMapProps) {
  const { isDark } = useTheme();
  const [search, setSearch] = useState("");
  const [focus, setFocus] = useState<{ lat: number; lng: number; key: number } | null>(
    null
  );
  // Monotonic key so selecting the same site twice still re-triggers the fly-to.
  const focusKey = useRef(0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = q
      ? sites.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.code.toLowerCase().includes(q) ||
            s.address.toLowerCase().includes(q)
        )
      : sites;
    return [...matched].sort(
      (a, b) => HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health] || a.name.localeCompare(b.name)
    );
  }, [sites, search]);

  const locatedCount = sites.filter((s) => s.latitude != null && s.longitude != null).length;

  function focusSite(site: MapSite) {
    if (site.latitude == null || site.longitude == null) return;
    focusKey.current += 1;
    setFocus({ lat: site.latitude, lng: site.longitude, key: focusKey.current });
  }

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden">
      {/* Dark-mode tile + popup styling, scoped to the map. */}
      <style>{`
        .utiligent-map-dark .leaflet-tile {
          filter: brightness(0.7) invert(1) contrast(0.85) hue-rotate(180deg) saturate(0.7);
        }
        .utiligent-map-dark .leaflet-container { background: #0f1117; }
        .leaflet-popup-content-wrapper, .leaflet-popup-tip {
          background: var(--bg-card); color: var(--text-primary);
        }
        .utiligent-map-dark .leaflet-control-attribution {
          background: rgba(20,22,32,0.8); color: #94a3b8;
        }
        .utiligent-map-dark .leaflet-control-attribution a { color: #60a5fa; }
      `}</style>

      <div className="px-6 py-4 border-b border-border-light flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text">Site Map</h2>
          <p className="text-sm text-text-secondary mt-0.5">
            {locatedCount} of {sites.length} site{sites.length !== 1 ? "s" : ""} located
          </p>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4">
          {(Object.keys(HEALTH_COLORS) as SiteHealth[]).map((h) => (
            <span key={h} className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: HEALTH_COLORS[h] }}
              />
              {HEALTH_LABELS[h]}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr]">
        {/* Searchable side panel */}
        <div className="border-b lg:border-b-0 lg:border-r border-border-light flex flex-col max-h-[240px] lg:max-h-[480px]">
          <div className="p-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sites…"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface text-text focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {filtered.length === 0 ? (
              <p className="text-sm text-text-muted px-2 py-4 text-center">No sites found.</p>
            ) : (
              <ul className="space-y-1">
                {filtered.map((site) => {
                  const hasCoords = site.latitude != null && site.longitude != null;
                  return (
                    <li key={site.id}>
                      <button
                        onClick={() => focusSite(site)}
                        disabled={!hasCoords}
                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                          hasCoords ? "hover:bg-surface-hover cursor-pointer" : "cursor-default opacity-60"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: HEALTH_COLORS[site.health] }}
                          />
                          <span className="text-sm font-medium text-text truncate">
                            {site.name}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-0.5 pl-4">
                          <span className="text-xs text-text-muted truncate">
                            {hasCoords ? site.address || site.code : "No location set"}
                          </span>
                          <Link
                            href={`/dashboard/sites/${site.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-brand hover:text-brand-dark font-medium flex-shrink-0 ml-2"
                          >
                            Open
                          </Link>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Map */}
        <div className="h-[300px] lg:h-[480px]">
          {locatedCount === 0 ? (
            <div className="h-full w-full flex items-center justify-center text-center px-6 bg-surface-hover">
              <div>
                <p className="text-sm font-medium text-text">No sites have coordinates yet</p>
                <p className="text-xs text-text-muted mt-1 max-w-xs">
                  Add latitude &amp; longitude to a site to see it on the map.
                </p>
              </div>
            </div>
          ) : (
            <SiteMapInner sites={sites} focus={focus} isDark={isDark} />
          )}
        </div>
      </div>
    </div>
  );
}
