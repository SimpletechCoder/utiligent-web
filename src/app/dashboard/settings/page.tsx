import { createClient } from "@/lib/supabase/server";
import { getUserPermissions } from "@/lib/permissions";
import { SettingsPanel } from "@/components/settings/settings-panel";

async function getSettingsData(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  // Get membership with profile info
  const { data: membership } = await supabase
    .from("memberships")
    .select(
      "id, role, organization_id, permission_profile_id, permission_profiles(id, name), organizations(id, name, slug, plan, status, org_type, billing_email, support_email, branding, max_child_orgs, max_users, max_meters, created_at)"
    )
    .eq("user_id", user?.id ?? "")
    .limit(1)
    .single();

  // Check if platform admin
  const { data: platformAdmin } = await supabase
    .from("platform_admins")
    .select("is_active")
    .eq("user_id", user?.id ?? "")
    .eq("is_active", true)
    .maybeSingle();

  return {
    user,
    membership,
    org: (membership as any)?.organizations ?? null,
    isPlatformAdmin: !!platformAdmin,
  };
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const [{ user, membership, org, isPlatformAdmin }, permissions] = await Promise.all([
    getSettingsData(supabase),
    getUserPermissions(),
  ]);

  return (
    <SettingsPanel
      org={org}
      membership={membership}
      user={user}
      permissions={Array.from(permissions)}
      isPlatformAdmin={isPlatformAdmin}
    />
  );
}
