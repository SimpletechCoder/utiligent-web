import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { computeTotals, formatCurrency, type BillingItem } from "@/lib/billing";

function AccessDenied() {
  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-text">Organizations</h1>
      <div className="mt-6 bg-surface rounded-xl border border-border p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-surface-secondary text-text-muted flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-text mb-1">Platform admins only</h2>
        <p className="text-text-muted">
          The reseller overview is restricted to platform administrators.
        </p>
      </div>
    </div>
  );
}

interface OrgCard {
  id: string;
  name: string;
  slug: string;
  status: string;
  org_type: string;
  siteCount: number;
  meterCount: number;
  billingTotal: number;
}

export default async function OrganizationsPage() {
  const supabase = await createClient();

  if (!(await isPlatformAdmin(supabase))) {
    return <AccessDenied />;
  }

  const [orgsRes, sitesRes, metersRes, billingRes] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, slug, status, org_type")
      .in("org_type", ["reseller", "customer"])
      .order("org_type")
      .order("name"),
    supabase.from("sites").select("id, organization_id"),
    supabase.from("meters").select("id, site_id"),
    supabase.from("site_billing_configs").select("organization_id, items"),
  ]);

  const orgs = orgsRes.data ?? [];
  const sites = sitesRes.data ?? [];
  const meters = metersRes.data ?? [];
  const billing = billingRes.data ?? [];

  // Map each site to its org, so meters (keyed by site) roll up to orgs.
  const siteToOrg = new Map<string, string>();
  sites.forEach((s: any) => siteToOrg.set(s.id, s.organization_id));

  const cards: OrgCard[] = orgs.map((org: any): OrgCard => {
    const siteCount = sites.filter((s: any) => s.organization_id === org.id).length;
    const meterCount = meters.filter(
      (m: any) => siteToOrg.get(m.site_id) === org.id
    ).length;
    const billingTotal = billing
      .filter((b: any) => b.organization_id === org.id)
      .reduce(
        (sum: number, b: any) =>
          sum + computeTotals((b.items as BillingItem[]) ?? []).clientTotal,
        0
      );
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      org_type: org.org_type,
      siteCount,
      meterCount,
      billingTotal,
    };
  });

  const resellers = cards.filter((c) => c.org_type === "reseller");
  const customers = cards.filter((c) => c.org_type === "customer");

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text">Organizations</h1>
        <p className="text-text-muted mt-1">
          Read-only overview of all reseller &amp; customer accounts
        </p>
      </div>

      <OrgSection title="Resellers" cards={resellers} />
      <OrgSection title="Customer Organizations" cards={customers} />
    </div>
  );
}

function OrgSection({ title, cards }: { title: string; cards: OrgCard[] }) {
  const typeBadge: Record<string, string> = {
    reseller: "bg-purple-100 text-purple-800",
    customer: "bg-green-100 text-green-800",
  };

  return (
    <div className="mb-8">
      <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
        {title}
      </h2>
      {cards.length === 0 ? (
        <p className="text-sm text-text-muted">No {title.toLowerCase()} found.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cards.map((org) => (
            <Link
              key={org.id}
              href={`/dashboard/organizations/${org.id}`}
              className="block bg-surface rounded-xl border border-border p-6 hover:shadow-md hover:border-brand transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-text">{org.name}</h3>
                  <p className="text-xs text-text-muted font-mono mt-0.5">{org.slug}</p>
                </div>
                <span
                  className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    typeBadge[org.org_type] ?? "bg-surface-secondary text-text"
                  }`}
                >
                  {org.org_type}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border-light">
                <div>
                  <p className="text-xs text-text-secondary">Sites</p>
                  <p className="text-lg font-bold text-text">{org.siteCount}</p>
                </div>
                <div>
                  <p className="text-xs text-text-secondary">Meters</p>
                  <p className="text-lg font-bold text-text">{org.meterCount}</p>
                </div>
                <div>
                  <p className="text-xs text-text-secondary">Billing</p>
                  <p className="text-lg font-bold text-text">
                    {formatCurrency(org.billingTotal)}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-1.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    org.status === "active" ? "bg-green-500" : "bg-text-muted"
                  }`}
                />
                <span className="text-xs text-text-secondary capitalize">{org.status}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
