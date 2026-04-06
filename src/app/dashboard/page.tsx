import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

async function getStats(supabase: Awaited<ReturnType<typeof createClient>>) {
  const [meters, gateways, alerts, sites, members, org] = await Promise.all([
    supabase.from("meters").select("id", { count: "exact", head: true }),
    supabase.from("gateways").select("id", { count: "exact", head: true }),
    supabase
      .from("alerts")
      .select("id", { count: "exact", head: true })
      .eq("status", "triggered"),
    supabase.from("sites").select("id", { count: "exact", head: true }),
    supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase.from("organizations").select("name, plan, status").limit(1).single(),
  ]);

  return {
    meterCount: meters.count ?? 0,
    gatewayCount: gateways.count ?? 0,
    activeAlerts: alerts.count ?? 0,
    siteCount: sites.count ?? 0,
    memberCount: members.count ?? 0,
    orgName: org.data?.name ?? "Your Organization",
    orgPlan: org.data?.plan ?? "—",
    orgStatus: org.data?.status ?? "—",
  };
}

async function getRecentAlerts(
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const { data } = await supabase
    .from("alerts")
    .select("id, severity, message, triggered_at, status")
    .order("triggered_at", { ascending: false })
    .limit(5);

  return data ?? [];
}

async function getRecentAudit(
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const { data } = await supabase
    .from("audit_logs")
    .select("id, entity_type, action, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  return data ?? [];
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const [stats, recentAlerts, recentAudit] = await Promise.all([
    getStats(supabase),
    getRecentAlerts(supabase),
    getRecentAudit(supabase),
  ]);

  const cards = [
    {
      label: "Meters",
      value: stats.meterCount,
      color: "blue",
      href: "/dashboard/meters",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      label: "Gateways",
      value: stats.gatewayCount,
      color: "green",
      href: "/dashboard/gateways",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0" />
        </svg>
      ),
    },
    {
      label: "Active Alerts",
      value: stats.activeAlerts,
      color: stats.activeAlerts > 0 ? "red" : "gray",
      href: "/dashboard/alerts",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      ),
    },
    {
      label: "Sites",
      value: stats.siteCount,
      color: "purple",
      href: "/dashboard/sites",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      label: "Team Members",
      value: stats.memberCount,
      color: "indigo",
      href: "/dashboard/settings",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
  ];

  const colorMap: Record<string, { bg: string; text: string; icon: string }> = {
    blue: { bg: "bg-blue-50", text: "text-blue-700", icon: "text-blue-500" },
    green: { bg: "bg-green-50", text: "text-green-700", icon: "text-green-500" },
    red: { bg: "bg-red-50", text: "text-red-700", icon: "text-red-500" },
    gray: { bg: "bg-gray-50", text: "text-gray-700", icon: "text-gray-400" },
    purple: { bg: "bg-purple-50", text: "text-purple-700", icon: "text-purple-500" },
    indigo: { bg: "bg-indigo-50", text: "text-indigo-700", icon: "text-indigo-500" },
  };

  const severityColors: Record<string, string> = {
    critical: "bg-red-100 text-red-800",
    high: "bg-orange-100 text-orange-800",
    medium: "bg-yellow-100 text-yellow-800",
    low: "bg-blue-100 text-blue-800",
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">{stats.orgName}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 capitalize">
            {stats.orgPlan}
          </span>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
            stats.orgStatus === "active" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${stats.orgStatus === "active" ? "bg-green-500" : "bg-gray-400"}`} />
            <span className="capitalize">{stats.orgStatus}</span>
          </span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {cards.map((card) => {
          const colors = colorMap[card.color];
          return (
            <Link
              key={card.label}
              href={card.href}
              className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4 hover:border-gray-300 hover:shadow-sm transition-all"
            >
              <div
                className={`w-11 h-11 rounded-lg ${colors.bg} ${colors.icon} flex items-center justify-center flex-shrink-0`}
              >
                {card.icon}
              </div>
              <div>
                <p className="text-xs text-gray-500">{card.label}</p>
                <p className={`text-xl font-bold ${colors.text}`}>
                  {card.value}
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent alerts */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Recent Alerts</h2>
            <Link href="/dashboard/alerts" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              View all
            </Link>
          </div>
          {recentAlerts.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-400">
              <svg className="w-8 h-8 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              No alerts. All systems nominal.
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {recentAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="px-6 py-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                        severityColors[alert.severity] ?? "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {alert.severity}
                    </span>
                    <span className="text-sm text-gray-700 truncate">{alert.message}</span>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0 ml-4">
                    {new Date(alert.triggered_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
            <Link href="/dashboard/audit" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              Audit log
            </Link>
          </div>
          {recentAudit.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-400">
              <svg className="w-8 h-8 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              No activity recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {recentAudit.map((entry) => (
                <div
                  key={entry.id}
                  className="px-6 py-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 flex-shrink-0">
                      {entry.entity_type}
                    </span>
                    <span className="text-sm text-gray-700 capitalize">{entry.action}</span>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0 ml-4">
                    {new Date(entry.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="mt-6 bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard/gateways/add"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Gateway
          </Link>
          <Link
            href="/dashboard/settings"
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            Manage Users
          </Link>
          <Link
            href="/dashboard/billing"
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
            </svg>
            Billing
          </Link>
        </div>
      </div>
    </div>
  );
}
