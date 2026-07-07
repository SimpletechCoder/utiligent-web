"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { HEALTH_COLORS, type MapSite } from "./map-types";

interface SiteMapInnerProps {
  sites: MapSite[];
  focus: { lat: number; lng: number; key: number } | null;
  isDark: boolean;
}

/** Colored circular pin as an inline div icon (no external marker images). */
function pinIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "utiligent-site-pin",
    html: `<span style="
      display:block;width:18px;height:18px;border-radius:9999px;
      background:${color};border:2px solid #ffffff;
      box-shadow:0 0 0 1px rgba(0,0,0,0.25),0 1px 3px rgba(0,0,0,0.4);
    "></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  });
}

/** Imperatively pans/zooms the map when a site is selected in the side panel. */
function FocusController({
  focus,
}: {
  focus: { lat: number; lng: number; key: number } | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (focus) {
      map.flyTo([focus.lat, focus.lng], 14, { duration: 0.8 });
    }
  }, [focus, map]);
  return null;
}

/** Fits the map to the bounds of all located sites on first render. */
function FitBounds({ sites }: { sites: MapSite[] }) {
  const map = useMap();
  useEffect(() => {
    const located = sites.filter((s) => s.latitude != null && s.longitude != null);
    if (located.length === 0) return;
    if (located.length === 1) {
      map.setView([located[0].latitude!, located[0].longitude!], 12);
      return;
    }
    const bounds = L.latLngBounds(
      located.map((s) => [s.latitude!, s.longitude!] as [number, number])
    );
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    // Only fit once, on mount, so user pans are preserved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export default function SiteMapInner({ sites, focus, isDark }: SiteMapInnerProps) {
  const located = useMemo(
    () => sites.filter((s) => s.latitude != null && s.longitude != null),
    [sites]
  );

  // Default centre: Johannesburg, South Africa.
  const defaultCenter: [number, number] = [-26.2041, 28.0473];

  return (
    <MapContainer
      center={defaultCenter}
      zoom={6}
      scrollWheelZoom
      className={`h-full w-full ${isDark ? "utiligent-map-dark" : ""}`}
      style={{ background: "var(--bg-hover)" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds sites={located} />
      <FocusController focus={focus} />
      {located.map((site) => (
        <Marker
          key={site.id}
          position={[site.latitude!, site.longitude!]}
          icon={pinIcon(HEALTH_COLORS[site.health])}
        >
          <Popup>
            <div style={{ minWidth: 160 }}>
              <strong>{site.name}</strong>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                {site.code}
              </div>
              {site.address && (
                <div style={{ fontSize: 12, marginTop: 4 }}>{site.address}</div>
              )}
              <div style={{ fontSize: 12, marginTop: 4 }}>
                {site.meterCount} meter{site.meterCount !== 1 ? "s" : ""}
              </div>
              <a
                href={`/dashboard/sites/${site.id}`}
                style={{ fontSize: 12, color: "#2563eb", fontWeight: 600, marginTop: 6, display: "inline-block" }}
              >
                View site →
              </a>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
