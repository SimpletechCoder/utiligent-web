import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { computeTotals, formatCurrency, type BillingItem } from "@/lib/billing";
import { RequestAccessButton } from "@/components/organizations/request-access-button";

interface OrgDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function OrgDetailPage({ params }: OrgDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  if (!(await isPlatformAdmin(supabase))) {
    return (
      <div className="max-w-lg">
        <h1 className="text-2xl font-bold text-text">Organization</h1>
        <p className="text-text-muted mt-4">
          This view is restricted to platform administrators.
        </p>
      </div>
    );
  }

  const { data: org } = await supabase
    .from("organizations")
    .select(
      "id, name, slug, status, org_type, plan, billing_email, support_email, max_users, max_meters, created_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (!org) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Sites first (scoped to this org) so the meter count can be a bounded
  // count aggregate over just this org's sites — not a full-table scan.
  const { data: sitesData } = await supabase
    .from("sites")
    .select("id, name, code, status")
    .eq("organization_id", id)
    .order("name");

  const sites = sitesData ?? [];
  const siteIds = sites.map((s: any) => s.id);

  const [metersRes, membersRes, billingRes, requestRes] = await Promise.all([
    siteIds.length
      ? supabase
          .from("meters")
          .select("id", { count: "exact", head: true })
          .in("site_id", siteIds)
      : Promise.resolve({ count: 0 }),
    supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", id)
      .eq("status", "active"),
    supabase.from("site_billing_configs").select("items").eq("organization_id", id),
    supabase
      .from("admin_access_requests")
      .select("status")
      .eq("target_organization_id", id)
      .eq("requester_user_id", user?.id ?? "")
      .eq("status", "pending")
      .maybeSingle(),
  ]);

  const meterCount = metersRes.count ?? 0;
  const memberCount = membersRes.count ?? 0;
  const billingTotal = (billingRes.data ?? []).reduce(
    (sum: number, b: any) =>
      sum + computeTotals((b.items as BillingItem[]) ?? []).clientTotal,
    0
  );

  const stats = [
    { label: "Sites", value: sites.length },
    { label: "Meters", value: meterCount },
    { label: "Active Users", value: memberCount },
    { label: "Billing (monthly)", value: formatCurrency(billingTotal) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/organizations" className="text-brand hover:text-brand-dark">
          Organizations
        </Link>
        <span className="text-text-muted">/</span>
        <span className="text-text-secondary">{org.name}</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-text">{org.name}</h1>
            <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 capitalize">
              {org.org_type}
            </span>
          </div>
          <p className="text-text-muted font-mono text-sm mt-1">{org.slug}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-surface-secondary text-text-secondary">
            Read-only
          </span>
          <RequestAccessButton organizationId={org.id} existingStatus={requestRes.data?.status} />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-surface rounded-xl border border-border p-5">
            <p className="text-xs text-text-secondary">{s.label}</p>
            <p className="text-2xl font-bold text-text mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Contact & limits */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <h2 className="text-lg font-semibold text-text mb-4">Details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <Detail label="Plan" value={org.plan} />
          <Detail label="Status" value={org.status} />
          <Detail label="Billing Email" value={org.billing_email} />
          <Detail label="Support Email" value={org.support_email} />
          <Detail label="Max Users" value={String(org.max_users)} />
          <Detail label="Max Meters" value={String(org.max_meters)} />
        </div>
      </div>

      {/* Sites */}
      <div className="bg-surface rounded-xl border border-border">
        <div className="px-6 py-4 border-b border-border-light">
          <h2 className="text-lg font-semibold text-text">Sites</h2>
        </div>
        <div className="p-6">
          {sites.length === 0 ? (
            <p className="text-sm text-text-secondary">No sites for this organization.</p>
          ) : (
            <ul className="divide-y divide-border-light">
              {sites.map((s: any) => (
                <li key={s.id} className="py-2 flex items-center justify-between">
                  <div>
                    <span className="text-sm text-text">{s.name}</span>
                    <span className="text-xs text-text-muted font-mono ml-2">{s.code}</span>
                  </div>
                  <span className="text-xs text-text-secondary capitalize">{s.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold text-text-secondary uppercase">{label}</p>
      <p className="text-text capitalize">{value || "—"}</p>
    </div>
  );
}
