import "server-only";

import { headers } from "next/headers";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

interface AuditEntry {
  organizationId: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
}

/**
 * Best-effort resolution of the caller's source IP from proxy headers.
 * Returns null when unavailable (e.g. during prerender).
 */
async function resolveClientIp(): Promise<string | null> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    if (forwarded) {
      // x-forwarded-for may be a comma-separated list; the first is the client.
      return forwarded.split(",")[0]?.trim() || null;
    }
    return h.get("x-real-ip");
  } catch {
    return null;
  }
}

/**
 * Write an ISO/POPIA-compliant audit entry.
 *
 * Records the action, actor, target entity, request IP and before/after
 * snapshots. Failures are swallowed (and left to Supabase logging) so an audit
 * write can never break the primary mutation — the caller has already
 * authorized and performed the change.
 */
export async function writeAudit(
  supabase: SupabaseServerClient,
  entry: AuditEntry
): Promise<void> {
  // An audit write must never break the primary mutation, which has already
  // been authorized and applied — so failures are non-fatal. But they MUST be
  // visible in server logs, not swallowed silently.
  try {
    const ip = await resolveClientIp();

    const { error } = await supabase.from("audit_logs").insert({
      organization_id: entry.organizationId,
      actor_user_id: entry.actorUserId,
      actor_type: "user",
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      ip_address: ip,
      old_value: entry.oldValue ?? null,
      new_value: entry.newValue ?? null,
      details: {
        old_value: entry.oldValue ?? null,
        new_value: entry.newValue ?? null,
      },
    });

    if (error) {
      console.error(
        `[audit] failed to record ${entry.action} on ${entry.entityType}/${entry.entityId}: ${error.message}`
      );
    }
  } catch (err: any) {
    console.error(
      `[audit] unexpected error recording ${entry.action} on ${entry.entityType}/${entry.entityId}: ${err?.message ?? err}`
    );
  }
}
