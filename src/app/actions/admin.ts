"use server";

import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";

interface RequestResult {
  success: boolean;
  error?: string;
  requestId?: string;
}

async function isPlatformAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
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

/**
 * Request edit access to another organization's data (from the read-only
 * Super Admin reseller drill-down). Creates an `admin_access_requests` record.
 *
 * Only platform admins may raise these requests. A pending request for the same
 * target is reused rather than duplicated.
 */
export async function requestEditAccess(
  targetOrganizationId: string,
  reason: string | null = null
): Promise<RequestResult> {
  try {
    if (!targetOrganizationId) {
      return { success: false, error: "Target organization is required" };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: "Not authenticated" };

    if (!(await isPlatformAdmin(supabase, user.id))) {
      return { success: false, error: "Only platform admins can request access" };
    }

    // Resolve the requester's own organization (best-effort) for the record.
    const { data: membership } = await supabase
      .from("memberships")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    // Reuse an existing pending request rather than stacking duplicates.
    const { data: existing } = await supabase
      .from("admin_access_requests")
      .select("id")
      .eq("requester_user_id", user.id)
      .eq("target_organization_id", targetOrganizationId)
      .eq("status", "pending")
      .maybeSingle();

    if (existing) {
      return { success: true, requestId: existing.id };
    }

    const { data, error } = await supabase
      .from("admin_access_requests")
      .insert({
        requester_user_id: user.id,
        requester_org_id: membership?.organization_id ?? null,
        target_organization_id: targetOrganizationId,
        reason: reason?.trim() || null,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) return { success: false, error: error.message };

    await writeAudit(supabase, {
      organizationId: targetOrganizationId,
      actorUserId: user.id,
      action: "admin.access.request",
      entityType: "admin_access_request",
      entityId: data.id,
      newValue: { target_organization_id: targetOrganizationId, reason },
    });

    return { success: true, requestId: data.id };
  } catch (err: any) {
    return { success: false, error: err.message ?? "Unexpected error" };
  }
}
