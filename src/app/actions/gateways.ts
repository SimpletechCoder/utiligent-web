"use server";

import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { userHasPermission } from "@/lib/permissions";

interface CreateGatewayInput {
  organizationId: string;
  gatewayProfileId: string;
  name?: string;
  serialNumber?: string;
  siteId?: string | null;
}

interface CreateGatewayResult {
  success: boolean;
  error?: string;
  gatewayId?: string;
  /** Returned exactly once, at creation time. Never re-fetchable in plaintext. */
  apiKey?: string;
}

/**
 * Provision a new gateway.
 *
 * The API key is generated **server-side** with a CSPRNG (`crypto.randomBytes`)
 * and returned to the caller only once. The previous client-side implementation
 * used `Math.random()` (predictable) and regenerated the key on every render, so
 * the value shown to the user never matched what was stored.
 *
 * Authorization is enforced here (not just in the UI): the caller must hold the
 * `gateway.add` flag and be an active member of the target organization.
 *
 * NOTE: the intended long-term path is the `provision_gateway` SECURITY DEFINER
 * RPC documented in SECURITY.md, which also mints the HMAC `signing_key` used by
 * the ingest edge function. This action is a hardened stopgap that mirrors the
 * existing schema; migrate to the RPC once its signature is confirmed.
 */
export async function createGateway(
  input: CreateGatewayInput
): Promise<CreateGatewayResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { success: false, error: "Not authenticated" };

    if (!input.gatewayProfileId) {
      return { success: false, error: "A gateway profile is required" };
    }

    if (!(await userHasPermission("gateway.add", input.organizationId))) {
      return {
        success: false,
        error: "You do not have permission to add gateways",
      };
    }

    const { data: membership } = await supabase
      .from("memberships")
      .select("id")
      .eq("user_id", user.id)
      .eq("organization_id", input.organizationId)
      .eq("status", "active")
      .maybeSingle();

    if (!membership) {
      return { success: false, error: "You are not a member of this organization" };
    }

    const apiKey = "sk_gw_" + randomBytes(24).toString("hex");
    const serialNumber =
      input.serialNumber?.trim() ||
      `SN-${randomBytes(4).toString("hex").toUpperCase()}`;

    const { data, error } = await supabase
      .from("gateways")
      .insert({
        organization_id: input.organizationId,
        name: input.name?.trim() || "New Gateway",
        serial_number: serialNumber,
        api_key: apiKey,
        firmware_version: "1.0.0",
        status: "pending",
        gateway_profile_id: input.gatewayProfileId,
        site_id: input.siteId || null,
      })
      .select("id")
      .single();

    if (error) return { success: false, error: error.message };

    return { success: true, gatewayId: data.id, apiKey };
  } catch (err: any) {
    return { success: false, error: err.message ?? "Unexpected error" };
  }
}
