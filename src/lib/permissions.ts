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
    .from("organization_memberships")
    .select(
      `
    permission_profile_flags(flag_id)
    `
    )
    .eq("user_id", user.id)
    .single();

  if (!membership || !membership.permission_profile_flags) {
    return new Set();
  }

  const flags = (membership.permission_profile_flags as any[]).map(
    (pf) => pf.flag_id
  );
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
