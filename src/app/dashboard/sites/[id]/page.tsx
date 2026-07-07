import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { userHasPermission } from "@/lib/permissions";
import { EditSiteButton } from "@/components/sites/site-form";
import { SiteBillingSection } from "@/components/sites/site-billing-section";
import {
  SiteMembersSection,
  type SiteMemberRow,
} from "@/components/sites/site-members-section";
import type { BillingItem } from "@/lib/billing";

interface SiteDetailPageProps {
  params: Promise<{ id: string }>;
}

const statusStyles: Record<string, { dot: string; bg: string; text: string }> = {
  active: { dot: "bg-green-500", bg: "bg-green-50", text: "text-green-700" },
  inactive: { dot: "bg-gray-400", bg: "bg-surface-secondary", text: "text-text-secondary" },
};

async function getSite(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string
) {
  const { data } = await supabase
    .from("sites")
    .select(
      "id, name, code, address, latitude, longitude, timezone, status, organization_id, created_at"
    )
    .eq("id", id)
    .maybeSingle();
  return data;
}

export default async function SiteDetailPage({ params }: SiteDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch the site first so every permission check is scoped to the org that
  // actually owns this site (a multi-org user's other memberships are irrelevant).
  const site = await getSite(supabase, id);
  if (!site) notFound();

  const orgId = site.organization_id;
  const [canEdit, canViewBilling, canManageBilling, canManageMembers] =
    await Promise.all([
      userHasPermission("site.edit", orgId),
      userHasPermission("site.billing.view", orgId),
      userHasPermission("site.billing.manage", orgId),
      userHasPermission("site.member.manage", orgId),
    ]);

  // Billing is commercially sensitive — only render it for users who may view it
  // (managers may always manage/view). This mirrors the tightened RLS SELECT.
  const showBilling = canViewBilling || canManageBilling;

  const [buildingsRes, metersRes, gatewaysRes, siteMembersRes, orgMembersRes] =
    await Promise.all([
      supabase.from("buildings").select("id, name, site_id").eq("site_id", id).order("name"),
      supabase
        .from("meters")
        .select("id, name, serial_number, status, meter_type")
        .eq("site_id", id)
        .order("name"),
      supabase
        .from("gateways")
        .select("id, name, serial_number, status")
        .eq("site_id", id)
        .order("name"),
      supabase
        .from("site_memberships")
        .select("id, user_id, role")
        .eq("site_id", id)
        .order("created_at"),
      supabase
        .from("memberships")
        .select("user_id, role")
        .eq("organization_id", site.organization_id)
        .eq("status", "active"),
    ]);

  // Only query billing data at all when the viewer is permitted to see it.
  const billingRes = showBilling
    ? await supabase
        .from("site_billing_configs")
        .select("items, currency")
        .eq("site_id", id)
        .maybeSingle()
    : { data: null };

  const buildings = buildingsRes.data ?? [];
  const meters = metersRes.data ?? [];
  const gateways = gatewaysRes.data ?? [];

  // Units hang off buildings; fetch them best-effort when buildings exist.
  let unitCount = 0;
  if (buildings.length > 0) {
    const { count } = await supabase
      .from("units")
      .select("id", { count: "exact", head: true })
      .in(
        "building_id",
        buildings.map((b: any) => b.id)
      );
    unitCount = count ?? 0;
  }

  const billingItems = (billingRes.data?.items as BillingItem[] | undefined) ?? null;
  const currency = billingRes.data?.currency ?? "ZAR";
  const siteMembers = (siteMembersRes.data ?? []) as SiteMemberRow[];
  const orgMembers = orgMembersRes.data ?? [];

  const addr = site.address as
    | { street?: string; city?: string; province?: string; country?: string; postalCode?: string }
    | null;
  const style = statusStyles[site.status] ?? statusStyles.inactive;

  const counts = [
    { label: "Buildings", value: buildings.length },
    { label: "Units", value: unitCount },
    { label: "Meters", value: meters.length },
    { label: "Gateways", value: gateways.length },
  ];

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link href="/dashboard/sites" className="text-brand hover:text-brand-dark">
          Sites
        </Link>
        <span className="text-text-muted">/</span>
        <span className="text-text-secondary">{site.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-text">{site.name}</h1>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
              <span className="capitalize">{site.status}</span>
            </span>
          </div>
          <p className="text-text-muted font-mono text-sm mt-1">{site.code}</p>
          {addr && (
            <p className="text-sm text-text-secondary mt-1">
              {[addr.street, addr.city, addr.province, addr.country]
                .filter(Boolean)
                .join(", ")}
            </p>
          )}
          <p className="text-xs text-text-muted mt-1">
            TZ: {site.timezone ?? "UTC"}
            {site.latitude != null && site.longitude != null && (
              <>
                {" · "}
                {Number(site.latitude).toFixed(4)}, {Number(site.longitude).toFixed(4)}
              </>
            )}
          </p>
        </div>
        {canEdit && (
          <EditSiteButton
            siteId={site.id}
            initial={{
              name: site.name,
              code: site.code,
              street: addr?.street ?? "",
              city: addr?.city ?? "",
              province: addr?.province ?? "",
              country: addr?.country ?? "South Africa",
              postalCode: addr?.postalCode ?? "",
              latitude: site.latitude != null ? String(site.latitude) : "",
              longitude: site.longitude != null ? String(site.longitude) : "",
              timezone: site.timezone ?? "Africa/Johannesburg",
              status: site.status ?? "active",
            }}
          />
        )}
      </div>

      {/* Count cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {counts.map((c) => (
          <div key={c.label} className="bg-surface rounded-xl border border-border p-5">
            <p className="text-xs text-text-secondary">{c.label}</p>
            <p className="text-2xl font-bold text-text mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Buildings & Gateways */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface rounded-xl border border-border">
          <div className="px-6 py-4 border-b border-border-light">
            <h2 className="text-lg font-semibold text-text">Buildings</h2>
          </div>
          <div className="p-6">
            {buildings.length === 0 ? (
              <p className="text-sm text-text-secondary">No buildings recorded.</p>
            ) : (
              <ul className="divide-y divide-border-light">
                {buildings.map((b: any) => (
                  <li key={b.id} className="py-2 text-sm text-text">
                    {b.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="bg-surface rounded-xl border border-border">
          <div className="px-6 py-4 border-b border-border-light">
            <h2 className="text-lg font-semibold text-text">Gateways</h2>
          </div>
          <div className="p-6">
            {gateways.length === 0 ? (
              <p className="text-sm text-text-secondary">No gateways at this site.</p>
            ) : (
              <ul className="divide-y divide-border-light">
                {gateways.map((g: any) => (
                  <li key={g.id} className="py-2 flex items-center justify-between">
                    <Link
                      href={`/dashboard/gateways/${g.id}`}
                      className="text-sm text-brand hover:text-brand-dark"
                    >
                      {g.name || g.serial_number}
                    </Link>
                    <span className="text-xs text-text-muted capitalize">{g.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Meters */}
      <div className="bg-surface rounded-xl border border-border">
        <div className="px-6 py-4 border-b border-border-light">
          <h2 className="text-lg font-semibold text-text">Meters</h2>
        </div>
        <div className="p-6">
          {meters.length === 0 ? (
            <p className="text-sm text-text-secondary">No meters at this site.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-light">
                    <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider py-2 pr-4">
                      Name
                    </th>
                    <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider py-2 px-4">
                      Serial
                    </th>
                    <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider py-2 px-4">
                      Type
                    </th>
                    <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider py-2 pl-4">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {meters.map((m: any) => (
                    <tr key={m.id}>
                      <td className="py-2 pr-4 text-sm text-text">
                        {m.name || "—"}
                      </td>
                      <td className="py-2 px-4 text-sm font-mono text-text-secondary">
                        {m.serial_number}
                      </td>
                      <td className="py-2 px-4 text-sm text-text-secondary capitalize">
                        {m.meter_type ?? "—"}
                      </td>
                      <td className="py-2 pl-4 text-sm text-text-secondary capitalize">
                        {m.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Billing */}
      {showBilling && (
        <SiteBillingSection
          siteId={site.id}
          canManage={canManageBilling}
          currency={currency}
          meterCount={meters.length}
          initialItems={billingItems}
        />
      )}

      {/* Members */}
      <SiteMembersSection
        siteId={site.id}
        canManage={canManageMembers}
        members={siteMembers}
        orgMembers={orgMembers as { user_id: string; role: string }[]}
      />
    </div>
  );
}
