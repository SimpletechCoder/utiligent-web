"use server";

import { createClient } from "@/lib/supabase/server";
import { userHasPermission } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import {
  basePricePerMeter,
  VALVE_LEAK_ADDON_PRICE,
  type BillingItem,
} from "@/lib/billing";

interface SaveResult {
  success: boolean;
  error?: string;
}

/**
 * The client is only trusted with the reseller margin and (for the opt-in
 * add-on) how many meters it covers. Base prices, labels, quantities of the
 * core metering line, and the pricing tier are ALL determined server-side from
 * the site's real meter count — never from the request body.
 */
export interface BillingAdjustmentInput {
  key: string;
  resellerAdjustment: number;
  /** Only honoured for the opt-in add-on line; clamped to the meter count. */
  quantity?: number;
}

/**
 * Save (create or update) the per-site billing configuration.
 *
 * Authorization is resolved against the site's own organization; the caller
 * must hold `site.billing.manage` and be an active member.
 *
 * Base pricing is authoritative: the server reads the live meter count, applies
 * the tiered rate (R145 / R65 / R50) and the fixed R95 valve+leak add-on, and
 * accepts ONLY the reseller adjustment (validated ≥ 0) from the client. This
 * prevents a reseller from writing a zero or negative base cost.
 */
export async function saveSiteBillingConfig(
  siteId: string,
  adjustments: BillingAdjustmentInput[],
  currency: string = "ZAR",
  notes: string | null = null
): Promise<SaveResult> {
  try {
    if (!siteId) return { success: false, error: "Site ID is required" };
    if (!Array.isArray(adjustments)) {
      return { success: false, error: "Invalid billing payload" };
    }

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

    if (!(await userHasPermission("site.billing.manage", site.organization_id))) {
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

    // Reject negative reseller margins outright rather than silently clamping.
    for (const a of adjustments) {
      if (Number(a.resellerAdjustment) < 0) {
        return { success: false, error: "Reseller adjustment cannot be negative" };
      }
    }

    // Authoritative meter count for the site.
    const { count } = await supabase
      .from("meters")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId);
    const meterCount = count ?? 0;

    const adjByKey = new Map(adjustments.map((a) => [a.key, a]));
    const meteringAdj = Math.max(0, Number(adjByKey.get("metering")?.resellerAdjustment) || 0);
    const valveAdj = Math.max(0, Number(adjByKey.get("valve_leak")?.resellerAdjustment) || 0);
    const valveQty = Math.min(
      Math.max(0, Math.trunc(Number(adjByKey.get("valve_leak")?.quantity) || 0)),
      meterCount
    );

    // Server builds the line items with server-computed base prices.
    const items: BillingItem[] = [
      {
        key: "metering",
        label: "Metering & Monitoring",
        basePrice: basePricePerMeter(meterCount),
        resellerAdjustment: meteringAdj,
        quantity: meterCount,
        addon: false,
      },
      {
        key: "valve_leak",
        label: "Valve + Leak Detection",
        basePrice: VALVE_LEAK_ADDON_PRICE,
        resellerAdjustment: valveAdj,
        quantity: valveQty,
        addon: true,
      },
    ];

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
        items,
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
      newValue: { items, currency },
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message ?? "Unexpected error" };
  }
}
