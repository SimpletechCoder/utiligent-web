"use server";

import { createClient } from "@/lib/supabase/server";
import { userHasPermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";

interface Result {
  success: boolean;
  error?: string;
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function isPlatformAdmin(
  supabase: SupabaseServerClient,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("platform_admins")
    .select("is_active")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  return !!data;
}

/** The org's permission ceiling, as configured by its parent reseller / super admin. */
async function orgCaps(
  supabase: SupabaseServerClient,
  organizationId: string
): Promise<{ active: boolean; set: Set<string> }> {
  const { data } = await supabase
    .from("reseller_permission_caps")
    .select("flag_id")
    .eq("organization_id", organizationId);
  return {
    active: (data ?? []).length > 0,
    set: new Set((data ?? []).map((c: any) => c.flag_id)),
  };
}

/**
 * Validate a set of flag ids against the org's caps and platform-only rules.
 * Platform admins bypass both. Returns an error string, or null if allowed.
 */
async function validateGrantableFlags(
  supabase: SupabaseServerClient,
  flagIds: string[],
  organizationId: string | null,
  isAdmin: boolean
): Promise<string | null> {
  if (flagIds.length === 0) return null;

  const uniqueIds = Array.from(new Set(flagIds));

  const { data: flagRows } = await supabase
    .from("permission_flags")
    .select("id, is_platform_only")
    .in("id", uniqueIds);

  const known = new Map((flagRows ?? []).map((f: any) => [f.id, f]));
  for (const id of uniqueIds) {
    if (!known.has(id)) return `Unknown permission flag: ${id}`;
  }

  if (isAdmin) return null;

  // Non-admins may never grant platform-only flags.
  for (const f of flagRows ?? []) {
    if (f.is_platform_only) {
      return "You cannot grant a platform-only permission";
    }
  }

  // Non-admins may not grant flags outside the org's cap (when one is set).
  if (organizationId) {
    const caps = await orgCaps(supabase, organizationId);
    if (caps.active) {
      for (const id of uniqueIds) {
        if (!caps.set.has(id)) {
          return `Permission "${id}" exceeds the organization's permission cap`;
        }
      }
    }
  }

  return null;
}

/**
 * Replace the flags assigned to a permission profile.
 *
 * Enforces (server-side) that the granted flags do not exceed the org's
 * `reseller_permission_caps`, and that non-admins cannot grant platform-only
 * flags. This is the write-path counterpart to the greyed-out UI.
 */
export async function saveProfileFlags(
  profileId: string,
  flagIds: string[]
): Promise<Result> {
  try {
    if (!profileId) return { success: false, error: "Profile ID is required" };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    const { data: profile } = await supabase
      .from("permission_profiles")
      .select("id, organization_id, is_system")
      .eq("id", profileId)
      .maybeSingle();

    if (!profile) return { success: false, error: "Profile not found" };

    const isAdmin = await isPlatformAdmin(supabase, user.id);

    if (profile.is_system && !isAdmin) {
      return { success: false, error: "System profiles can only be edited by platform admins" };
    }

    if (!isAdmin) {
      // Non-admins may only edit org-scoped profiles, and the permission check
      // is scoped to that profile's organization (not just any membership).
      if (!profile.organization_id) {
        return { success: false, error: "You do not have permission to edit this profile" };
      }
      if (!(await userHasPermission("user.permission.override", profile.organization_id))) {
        return { success: false, error: "You do not have permission to edit profiles" };
      }
      const { data: membership } = await supabase
        .from("memberships")
        .select("id")
        .eq("user_id", user.id)
        .eq("organization_id", profile.organization_id)
        .eq("status", "active")
        .maybeSingle();
      if (!membership) {
        return { success: false, error: "You are not a member of this organization" };
      }
    }

    const capError = await validateGrantableFlags(
      supabase,
      flagIds,
      profile.organization_id,
      isAdmin
    );
    if (capError) return { success: false, error: capError };

    const uniqueIds = Array.from(new Set(flagIds));

    const { error: delError } = await supabase
      .from("permission_profile_flags")
      .delete()
      .eq("profile_id", profileId);
    if (delError) return { success: false, error: delError.message };

    if (uniqueIds.length > 0) {
      const { error: insError } = await supabase
        .from("permission_profile_flags")
        .insert(uniqueIds.map((flagId) => ({ profile_id: profileId, flag_id: flagId })));
      if (insError) return { success: false, error: insError.message };
    }

    if (profile.organization_id) {
      await writeAudit(supabase, {
        organizationId: profile.organization_id,
        actorUserId: user.id,
        action: "permission.profile.flags.update",
        entityType: "permission_profile",
        entityId: profileId,
        newValue: { flag_ids: uniqueIds },
      });
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? "Unexpected error" };
  }
}

export interface OverrideInput {
  flagId: string;
  granted: boolean;
}

/**
 * Replace a membership's per-user permission overrides.
 *
 * Enforces that any *granted* flag stays within the org's caps and is not
 * platform-only (for non-admins). Revocations are always permitted.
 */
export async function saveUserOverrides(
  membershipId: string,
  overrides: OverrideInput[]
): Promise<Result> {
  try {
    if (!membershipId) return { success: false, error: "Membership ID is required" };
    if (!Array.isArray(overrides)) return { success: false, error: "Invalid payload" };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    const { data: membership } = await supabase
      .from("memberships")
      .select("id, organization_id")
      .eq("id", membershipId)
      .maybeSingle();

    if (!membership) return { success: false, error: "Membership not found" };

    const isAdmin = await isPlatformAdmin(supabase, user.id);

    if (
      !isAdmin &&
      !(await userHasPermission("user.permission.override", membership.organization_id))
    ) {
      return { success: false, error: "You do not have permission to override flags" };
    }

    if (!isAdmin) {
      const { data: callerMembership } = await supabase
        .from("memberships")
        .select("id")
        .eq("user_id", user.id)
        .eq("organization_id", membership.organization_id)
        .eq("status", "active")
        .maybeSingle();
      if (!callerMembership) {
        return { success: false, error: "You are not a member of this organization" };
      }
    }

    // Only *granted* flags need to respect the cap; revocations are unrestricted.
    const grantedFlags = overrides.filter((o) => o.granted).map((o) => o.flagId);
    const capError = await validateGrantableFlags(
      supabase,
      grantedFlags,
      membership.organization_id,
      isAdmin
    );
    if (capError) return { success: false, error: capError };

    const { error: delError } = await supabase
      .from("user_permission_overrides")
      .delete()
      .eq("membership_id", membershipId);
    if (delError) return { success: false, error: delError.message };

    if (overrides.length > 0) {
      const { error: insError } = await supabase
        .from("user_permission_overrides")
        .insert(
          overrides.map((o) => ({
            membership_id: membershipId,
            flag_id: o.flagId,
            granted: o.granted,
          }))
        );
      if (insError) return { success: false, error: insError.message };
    }

    await writeAudit(supabase, {
      organizationId: membership.organization_id,
      actorUserId: user.id,
      action: "permission.override.update",
      entityType: "membership",
      entityId: membershipId,
      newValue: { overrides },
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? "Unexpected error" };
  }
}

/** Authorize a profile-management action against the profile's own org. */
async function authorizeProfileMgmt(
  supabase: SupabaseServerClient,
  userId: string,
  organizationId: string | null,
  isSystem: boolean
): Promise<string | null> {
  const isAdmin = await isPlatformAdmin(supabase, userId);
  if (isAdmin) return null;
  if (isSystem || !organizationId) {
    return "This profile can only be managed by platform admins";
  }
  if (!(await userHasPermission("user.permission.override", organizationId))) {
    return "You do not have permission to manage profiles";
  }
  const { data: membership } = await supabase
    .from("memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) return "You are not a member of this organization";
  return null;
}

/**
 * Create a permission profile with an initial flag set (authorized + audited).
 * Flags are validated against the org's caps before insert.
 */
export async function createProfile(
  organizationId: string,
  name: string,
  description: string | null,
  flagIds: string[]
): Promise<{ success: boolean; error?: string; profileId?: string }> {
  try {
    if (!organizationId) return { success: false, error: "Organization ID is required" };
    if (!name?.trim()) return { success: false, error: "Profile name is required" };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    const authError = await authorizeProfileMgmt(supabase, user.id, organizationId, false);
    if (authError) return { success: false, error: authError };

    const isAdmin = await isPlatformAdmin(supabase, user.id);
    const capError = await validateGrantableFlags(supabase, flagIds, organizationId, isAdmin);
    if (capError) return { success: false, error: capError };

    const { data: profile, error } = await supabase
      .from("permission_profiles")
      .insert({
        organization_id: organizationId,
        name: name.trim(),
        description: description ?? "",
        is_system: false,
      })
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };

    const uniqueIds = Array.from(new Set(flagIds));
    if (uniqueIds.length > 0) {
      const { error: insErr } = await supabase
        .from("permission_profile_flags")
        .insert(uniqueIds.map((flagId) => ({ profile_id: profile.id, flag_id: flagId })));
      if (insErr) return { success: false, error: insErr.message };
    }

    await writeAudit(supabase, {
      organizationId,
      actorUserId: user.id,
      action: "permission.profile.create",
      entityType: "permission_profile",
      entityId: profile.id,
      newValue: { name: name.trim(), flag_ids: uniqueIds },
    });

    return { success: true, profileId: profile.id };
  } catch (err: any) {
    return { success: false, error: err.message ?? "Unexpected error" };
  }
}

/** Update a profile's name/description (flags go through saveProfileFlags). */
export async function updateProfileMeta(
  profileId: string,
  name: string,
  description: string | null
): Promise<Result> {
  try {
    if (!profileId) return { success: false, error: "Profile ID is required" };
    if (!name?.trim()) return { success: false, error: "Profile name is required" };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    const { data: profile } = await supabase
      .from("permission_profiles")
      .select("id, organization_id, is_system, name, description")
      .eq("id", profileId)
      .maybeSingle();
    if (!profile) return { success: false, error: "Profile not found" };

    const authError = await authorizeProfileMgmt(
      supabase,
      user.id,
      profile.organization_id,
      profile.is_system
    );
    if (authError) return { success: false, error: authError };

    const { error } = await supabase
      .from("permission_profiles")
      .update({
        name: name.trim(),
        description: description ?? "",
        updated_at: new Date().toISOString(),
      })
      .eq("id", profileId);
    if (error) return { success: false, error: error.message };

    if (profile.organization_id) {
      await writeAudit(supabase, {
        organizationId: profile.organization_id,
        actorUserId: user.id,
        action: "permission.profile.update",
        entityType: "permission_profile",
        entityId: profileId,
        oldValue: { name: profile.name, description: profile.description },
        newValue: { name: name.trim(), description },
      });
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? "Unexpected error" };
  }
}

/** Delete a permission profile and its flag associations. */
export async function deleteProfile(profileId: string): Promise<Result> {
  try {
    if (!profileId) return { success: false, error: "Profile ID is required" };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    const { data: profile } = await supabase
      .from("permission_profiles")
      .select("id, organization_id, is_system, name")
      .eq("id", profileId)
      .maybeSingle();
    if (!profile) return { success: false, error: "Profile not found" };

    const authError = await authorizeProfileMgmt(
      supabase,
      user.id,
      profile.organization_id,
      profile.is_system
    );
    if (authError) return { success: false, error: authError };

    const { error: flagErr } = await supabase
      .from("permission_profile_flags")
      .delete()
      .eq("profile_id", profileId);
    if (flagErr) return { success: false, error: flagErr.message };

    const { error } = await supabase
      .from("permission_profiles")
      .delete()
      .eq("id", profileId);
    if (error) return { success: false, error: error.message };

    if (profile.organization_id) {
      await writeAudit(supabase, {
        organizationId: profile.organization_id,
        actorUserId: user.id,
        action: "permission.profile.delete",
        entityType: "permission_profile",
        entityId: profileId,
        oldValue: { name: profile.name },
      });
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? "Unexpected error" };
  }
}

/**
 * Replace a reseller org's permission caps (the ceiling its child users may be
 * granted). Platform-admin only, since caps are the super-admin control point.
 */
export async function saveResellerCaps(
  organizationId: string,
  flagIds: string[]
): Promise<Result> {
  try {
    if (!organizationId) return { success: false, error: "Organization ID is required" };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    if (!(await isPlatformAdmin(supabase, user.id))) {
      return { success: false, error: "Only platform admins can set permission caps" };
    }

    const uniqueIds = Array.from(new Set(flagIds));

    const { error: delErr } = await supabase
      .from("reseller_permission_caps")
      .delete()
      .eq("organization_id", organizationId);
    if (delErr) return { success: false, error: delErr.message };

    if (uniqueIds.length > 0) {
      const { error: insErr } = await supabase
        .from("reseller_permission_caps")
        .insert(uniqueIds.map((flagId) => ({ organization_id: organizationId, flag_id: flagId })));
      if (insErr) return { success: false, error: insErr.message };
    }

    await writeAudit(supabase, {
      organizationId,
      actorUserId: user.id,
      action: "permission.caps.update",
      entityType: "organization",
      entityId: organizationId,
      newValue: { flag_ids: uniqueIds },
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? "Unexpected error" };
  }
}
