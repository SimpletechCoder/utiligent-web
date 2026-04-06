import { createClient } from "@/lib/supabase/server";

/**
 * Get the current user's effective permission flags.
 *
 * Resolution order:
 * 1. Start with the flags granted by the user's permission profile
 * 2. Apply per-user overrides (grant=true adds, grant=false removes)
 * 3. Platform admins get all flags regardless
 */
export async function getUserPermissions(): Promise<Set<string>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Set();
  }

  // Check platform admin status — they get everything
  const { data: platformAdmin } = await supabase
    .from("platform_admins")
    .select("is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (platformAdmin) {
    // Fetch every flag in the system
    const { data: allFlags } = await supabase
      .from("permission_flags")
      .select("id");
    return new Set((allFlags ?? []).map((f: any) => f.id));
  }

  // Get membership with profile id
  const { data: membership } = await supabase
    .from("memberships")
    .select("id, permission_profile_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return new Set<string>();
  }

  // Step 1: Profile-based flags
  const profileFlags = new Set<string>();
  if (membership.permission_profile_id) {
    const { data: flagRows } = await supabase
      .from("permission_profile_flags")
      .select("flag_id")
      .eq("profile_id", membership.permission_profile_id);

    (flagRows ?? []).forEach((r: any) => profileFlags.add(r.flag_id));
  }

  // Step 2: Apply per-user overrides
  const { data: overrides } = await supabase
    .from("user_permission_overrides")
    .select("flag_id, granted")
    .eq("membership_id", membership.id);

  const effectiveFlags = new Set(profileFlags);

  (overrides ?? []).forEach((o: any) => {
    if (o.granted) {
      effectiveFlags.add(o.flag_id);
    } else {
      effectiveFlags.delete(o.flag_id);
    }
  });

  return effectiveFlags;
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
