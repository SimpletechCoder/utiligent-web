"use server";

import { createClient } from "@/lib/supabase/server";
import { userHasPermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import type { BillingItem } from "@/lib/billing";

interface SaveResult {
  success: boolean;
  error?: string;
}

/**
 * Sanitize client-supplied line items to the whitelisted numeric/string shape,
 * so a caller cannot smuggle arbitrary JSON into the config column.
 */
function sanitizeItems(items: BillingItem[]): BillingItem[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    key: String(item.key ?? "").slice(0, 64),
    label: String(item.label ?? "").slice(0, 120),
    basePrice: Number(item.basePrice) || 0,
    resellerAdjustment: Number(item.resellerAdjustment) || 0,
    quantity: Math.max(0, Math.trunc(Number(item.quantity) || 0)),
    addon: Boolean(item.addon),
  }));
}

/**
 * Save (create or update) the per-site billing configuration.
 *
 * Authorization is resolved against the site's own organization; the caller
 * must hold `site.billing.manage` and be an active member.
 */
export async function saveSiteBillingConfig(
  siteId: string,
  items: BillingItem[],
  currency: string = "ZAR",
  notes: string | null = null
): Promise<SaveResult> {
  try {
    if (!siteId) return { success: false, error: "Site ID is required" };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: "Not authenticated" };

    const { data: site } = await supabase
      .from("sites")
      .select("id, organization_id")
      .eq("id", siteId)
      .maybeSingle();

    if (!site) return { success: false, error: "Site not found" };

    if (!(await userHasPermission("site.billing.manage"))) {
      return { success: false, error: "You do not have permission to manage billing" };
    }

    const { data: membership } = await supabase
      .from("memberships")
      .select("id")
      .eq("user_id", user.id)
      .eq("organization_id", site.organization_id)
      .eq("status", "active")
      .maybeSingle();

    if (!membership) {
      return { success: false, error: "You are not a member of this organization" };
    }

    const sanitized = sanitizeItems(items);

    // Snapshot the previous config for the audit trail.
    const { data: previous } = await supabase
      .from("site_billing_configs")
      .select("items, currency")
      .eq("site_id", siteId)
      .maybeSingle();

    const { error } = await supabase.from("site_billing_configs").upsert(
      {
        site_id: siteId,
        organization_id: site.organization_id,
        currency: currency || "ZAR",
        items: sanitized,
        notes,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      },
      { onConflict: "site_id" }
    );

    if (error) return { success: false, error: error.message };

    await writeAudit(supabase, {
      organizationId: site.organization_id,
      actorUserId: user.id,
      action: "site.billing.update",
      entityType: "site_billing_config",
      entityId: siteId,
      oldValue: previous ?? null,
      newValue: { items: sanitized, currency },
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? "Unexpected error" };
  }
}
