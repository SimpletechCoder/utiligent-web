import { createClient } from "@/lib/supabase/server";

async function getOrgProfile(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: user } = await supabase.auth.getUser();
  const { data: membership } = await supabase
    .from("memberships")
    .select("role, organization_id, organizations(id, name, slug, billing_email, support_email, status, created_at)")
    .eq("user_id", user.user?.id ?? "")
    .limit(1)
    .single();

  return {
    user: user.user,
    membership,
    org: (membership as any)?.organizations ?? null,
  };
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const { user, membership, org } = await getOrgProfile(supabase);

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">Manage your organization and account</p>
      </div>

      <div className="space-y-6 max-w-2xl">
        {/* Organization details */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Organization</h2>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Name</label>
                <p className="mt-1 text-sm text-gray-900">{org?.name ?? "—"}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Slug</label>
                <p className="mt-1 text-sm text-gray-900 font-mono">{org?.slug ?? "—"}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Status</label>
                <p className="mt-1">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    org?.status === "active"
                      ? "bg-green-50 text-green-700"
                      : "bg-gray-50 text-gray-600"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${org?.status === "active" ? "bg-green-500" : "bg-gray-400"}`} />
                    <span className="capitalize">{org?.status ?? "—"}</span>
                  </span>
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Billing Email</label>
                <p className="mt-1 text-sm text-gray-900">{org?.billing_email ?? "Not set"}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Support Email</label>
                <p className="mt-1 text-sm text-gray-900">{org?.support_email ?? "Not set"}</p>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Created</label>
              <p className="mt-1 text-sm text-gray-900">
                {org?.created_at ? new Date(org.created_at).toLocaleDateString() : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Account details */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Your Account</h2>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Email</label>
                <p className="mt-1 text-sm text-gray-900">{user?.email ?? "—"}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Role</label>
                <p className="mt-1">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 capitalize">
                    {(membership as any)?.role?.replace("_", " ") ?? "—"}
                  </span>
                </p>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">User ID</label>
              <p className="mt-1 text-xs text-gray-400 font-mono">{user?.id ?? "—"}</p>
            </div>
          </div>
        </div>

        {/* Supabase Auth redirect reminder */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-6 py-4">
          <div className="flex gap-3">
            <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-amber-800">Password change</p>
              <p className="text-xs text-amber-600 mt-1">
                To change your password, use the Forgot Password flow on the login page. Make sure the Supabase Auth redirect URL is configured for this domain.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
