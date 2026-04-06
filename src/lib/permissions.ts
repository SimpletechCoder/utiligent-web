import { createClient } from "@/lib/supabase/server";

/**
 * Get the current user's permission flags from their profile
 */
export async function getUserPermissions(): Promise<Set<string>> {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Set();
  }

  // Get user's organization membership and permission profile
  const { data: membership } = await supabase
    .from("memberships")
    .select("permission_profile_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership || !membership.permission_profile_id) {
    return new Set<string>();
  }

  // Get flags for this profile
  const { data: flagRows } = await supabase
    .from("permission_profile_flags")
    .select("flag_id")
    .eq("profile_id", membership.permission_profile_id);

  if (!flagRows) {
    return new Set<string>();
  }

  const flags = flagRows.map((pf: any) => pf.flag_id);
  return new Set(flags);
}

/**
 * Check if user has a specific permission flag
 */
export async function userHasPermission(flagId: string): Promise<boolean> {
  const permissions = await getUserPermissions();
  return permissions.has(flagId);
}

/**
 * Check multiple permissions (returns true if user has any of them)
 */
export async function userHasAnyPermission(
  flagIds: string[]
): Promise<boolean> {
  const permissions = await getUserPermissions();
  return flagIds.some((flagId) => permissions.has(flagId));
}

/**
 * Check multiple permissions (returns true only if user has all of them)
 */
export async function userHasAllPermissions(
  flagIds: string[]
): Promise<boolean> {
  const permissions = await getUserPermissions();
  return flagIds.every((flagId) => permissions.has(flagId));
}
