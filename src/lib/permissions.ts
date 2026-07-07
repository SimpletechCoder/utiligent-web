import { createClient } from "@/lib/supabase/server";

/**
 * Resolve the organization a permission check should be scoped to when the
 * caller doesn't already know it (e.g. "my org" pages like the audit log or the
 * gateway list). Returns the caller's first active membership org, or null.
 *
 * Prefer passing an explicit organization id wherever the target org is known
 * (e.g. the org that owns the site/gateway being viewed) — this helper is only
 * for inherently caller-scoped pages.
 */
export async function getCurrentOrgId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  return data?.organization_id ?? null;
}

/**
 * Get the current user's effective permission flags **within a specific
 * organization**.
 *
 * A user may belong to more than one organization; resolving against the wrong
 * membership would leak or deny access incorrectly. Callers must therefore pass
 * the id of the org the check is about (the org that owns the resource).
 *
 * Resolution order:
 * 1. Platform admins get every flag regardless of org.
 * 2. Otherwise start with the flags granted by the user's permission profile
 *    for their **active membership in `organizationId`**.
 * 3. Apply per-user overrides (grant=true adds, grant=false removes).
 */
export async function getUserPermissions(
  organizationId: string
): Promise<Set<string>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !organizationId) {
    return new Set();
  }

  // Check platform admin status — they get everything.
  const { data: platformAdmin } = await supabase
    .from("platform_admins")
    .select("is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (platformAdmin) {
    const { data: allFlags } = await supabase
      .from("permission_flags")
      .select("id");
    return new Set((allFlags ?? []).map((f: any) => f.id));
  }

  // Active membership for THIS organization — not just any membership.
  const { data: membership } = await supabase
    .from("memberships")
    .select("id, permission_profile_id")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle();

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
 * Check if the user holds a specific permission flag within an organization.
 */
export async function userHasPermission(
  flagId: string,
  organizationId: string
): Promise<boolean> {
  const permissions = await getUserPermissions(organizationId);
  return permissions.has(flagId);
}

/**
 * Check multiple permissions within an org (true if the user has ANY of them).
 */
export async function userHasAnyPermission(
  flagIds: string[],
  organizationId: string
): Promise<boolean> {
  const permissions = await getUserPermissions(organizationId);
  return flagIds.some((flagId) => permissions.has(flagId));
}

/**
 * Check multiple permissions within an org (true only if the user has ALL).
 */
export async function userHasAllPermissions(
  flagIds: string[],
  organizationId: string
): Promise<boolean> {
  const permissions = await getUserPermissions(organizationId);
  return flagIds.every((flagId) => permissions.has(flagId));
}
