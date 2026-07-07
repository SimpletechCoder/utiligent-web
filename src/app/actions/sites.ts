"use server";

import { createClient } from "@/lib/supabase/server";
import { userHasPermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";

interface SiteAddress {
  street?: string;
  city?: string;
  province?: string;
  country?: string;
  postalCode?: string;
}

export interface SiteInput {
  name: string;
  code: string;
  address?: SiteAddress | null;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string | null;
  status?: string;
}

interface SiteResult {
  success: boolean;
  error?: string;
  siteId?: string;
}

/**
 * Authorize a management action against a specific organization.
 *
 * Mirrors the gateway/user server-action pattern: the caller must be
 * authenticated, hold the given permission flag, and be an active member of the
 * target organization. Returns the caller's user id on success.
 */
async function authorizeOrgAction(
  organizationId: string,
  flag: string
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Not authenticated" };

  if (!(await userHasPermission(flag))) {
    return { ok: false, error: "You do not have permission to perform this action" };
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("id")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle();

  if (!membership) {
    return { ok: false, error: "You are not a member of this organization" };
  }

  return { ok: true, userId: user.id };
}

function validateSite(input: SiteInput): string | null {
  if (!input.name?.trim()) return "Site name is required";
  if (!input.code?.trim()) return "Site code is required";
  if (
    input.latitude != null &&
    (input.latitude < -90 || input.latitude > 90)
  ) {
    return "Latitude must be between -90 and 90";
  }
  if (
    input.longitude != null &&
    (input.longitude < -180 || input.longitude > 180)
  ) {
    return "Longitude must be between -180 and 180";
  }
  return null;
}

/**
 * Create a new site under the given organization.
 */
export async function createSite(
  organizationId: string,
  input: SiteInput
): Promise<SiteResult> {
  try {
    if (!organizationId) return { success: false, error: "Organization ID is required" };

    const validationError = validateSite(input);
    if (validationError) return { success: false, error: validationError };

    const auth = await authorizeOrgAction(organizationId, "site.add");
    if (!auth.ok) return { success: false, error: auth.error };

    const supabase = await createClient();

    const row = {
      organization_id: organizationId,
      name: input.name.trim(),
      code: input.code.trim(),
      address: input.address ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      timezone: input.timezone?.trim() || "UTC",
      status: input.status || "active",
    };

    const { data, error } = await supabase
      .from("sites")
      .insert(row)
      .select("id")
      .single();

    if (error) return { success: false, error: error.message };

    await writeAudit(supabase, {
      organizationId,
      actorUserId: auth.userId,
      action: "site.create",
      entityType: "site",
      entityId: data.id,
      newValue: row,
    });

    return { success: true, siteId: data.id };
  } catch (err: any) {
    return { success: false, error: err.message ?? "Unexpected error" };
  }
}

/**
 * Update an existing site. Authorization is resolved against the site's own
 * organization (not a client-supplied value).
 */
export async function updateSite(
  siteId: string,
  input: SiteInput
): Promise<SiteResult> {
  try {
    if (!siteId) return { success: false, error: "Site ID is required" };

    const validationError = validateSite(input);
    if (validationError) return { success: false, error: validationError };

    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("sites")
      .select("id, organization_id, name, code, address, latitude, longitude, timezone, status")
      .eq("id", siteId)
      .maybeSingle();

    if (!existing) return { success: false, error: "Site not found" };

    const auth = await authorizeOrgAction(existing.organization_id, "site.edit");
    if (!auth.ok) return { success: false, error: auth.error };

    const patch = {
      name: input.name.trim(),
      code: input.code.trim(),
      address: input.address ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      timezone: input.timezone?.trim() || "UTC",
      status: input.status || existing.status,
    };

    const { error } = await supabase.from("sites").update(patch).eq("id", siteId);

    if (error) return { success: false, error: error.message };

    await writeAudit(supabase, {
      organizationId: existing.organization_id,
      actorUserId: auth.userId,
      action: "site.update",
      entityType: "site",
      entityId: siteId,
      oldValue: existing,
      newValue: patch,
    });

    return { success: true, siteId };
  } catch (err: any) {
    return { success: false, error: err.message ?? "Unexpected error" };
  }
}

/**
 * Assign a user to a specific site within an organization.
 */
export async function assignUserToSite(
  siteId: string,
  userId: string,
  role: string = "viewer"
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!siteId || !userId) return { success: false, error: "Site and user are required" };

    const supabase = await createClient();

    const { data: site } = await supabase
      .from("sites")
      .select("id, organization_id")
      .eq("id", siteId)
      .maybeSingle();

    if (!site) return { success: false, error: "Site not found" };

    const auth = await authorizeOrgAction(site.organization_id, "site.member.manage");
    if (!auth.ok) return { success: false, error: auth.error };

    // The user being assigned must be an active member of the site's org. The DB
    // trigger enforces this too, but we check here for a clean error message.
    const { data: targetMembership } = await supabase
      .from("memberships")
      .select("id")
      .eq("user_id", userId)
      .eq("organization_id", site.organization_id)
      .eq("status", "active")
      .maybeSingle();

    if (!targetMembership) {
      return {
        success: false,
        error: "User is not an active member of this site's organization",
      };
    }

    const { error } = await supabase.from("site_memberships").upsert(
      {
        site_id: siteId,
        user_id: userId,
        organization_id: site.organization_id,
        role,
        created_by: auth.userId,
      },
      { onConflict: "site_id,user_id" }
    );

    if (error) return { success: false, error: error.message };

    await writeAudit(supabase, {
      organizationId: site.organization_id,
      actorUserId: auth.userId,
      action: "site.member.assign",
      entityType: "site_membership",
      entityId: siteId,
      newValue: { site_id: siteId, user_id: userId, role },
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? "Unexpected error" };
  }
}

/**
 * Remove a user's assignment from a site.
 */
export async function removeSiteMembership(
  membershipId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!membershipId) return { success: false, error: "Membership ID is required" };

    const supabase = await createClient();

    const { data: target } = await supabase
      .from("site_memberships")
      .select("id, site_id, user_id, organization_id")
      .eq("id", membershipId)
      .maybeSingle();

    if (!target) return { success: false, error: "Assignment not found" };

    const auth = await authorizeOrgAction(target.organization_id, "site.member.manage");
    if (!auth.ok) return { success: false, error: auth.error };

    const { error } = await supabase
      .from("site_memberships")
      .delete()
      .eq("id", membershipId);

    if (error) return { success: false, error: error.message };

    await writeAudit(supabase, {
      organizationId: target.organization_id,
      actorUserId: auth.userId,
      action: "site.member.remove",
      entityType: "site_membership",
      entityId: target.site_id,
      oldValue: { user_id: target.user_id },
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? "Unexpected error" };
  }
}
