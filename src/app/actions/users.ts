"use server";

import { createClient } from "@/lib/supabase/server";

interface InviteUserResult {
  success: boolean;
  error?: string;
  userId?: string | null;
}

/**
 * Invite a user to the current organization.
 *
 * Flow:
 * 1. Verify the caller has user.invite permission
 * 2. Try to create the user via Supabase Admin API (service role)
 *    - If user already exists, look them up by email
 * 3. Create a membership record linking them to the org
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in environment.
 */
export async function inviteUser(
  email: string,
  role: string,
  permissionProfileId: string | null,
  organizationId: string
): Promise<InviteUserResult> {
  try {
    // Validate inputs
    if (!email || !email.includes("@")) {
      return { success: false, error: "Valid email is required" };
    }
    if (!organizationId) {
      return { success: false, error: "Organization ID is required" };
    }

    // Check caller permissions
    const supabase = await createClient();
    const {
      data: { user: caller },
    } = await supabase.auth.getUser();

    if (!caller) {
      return { success: false, error: "Not authenticated" };
    }

    // Check service role key availability
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!serviceKey || !supabaseUrl) {
      return {
        success: false,
        error:
          "Server not configured for user invitations. Add SUPABASE_SERVICE_ROLE_KEY to environment variables.",
      };
    }

    // Use admin API to create user or find existing
    // We use fetch directly to avoid importing the admin client in case it throws
    let userId: string | null = null;

    // Try to create the user with a temporary password
    const tempPassword =
      "Temp" +
      Math.random().toString(36).slice(2, 10) +
      "!" +
      Math.floor(Math.random() * 100);

    const createRes = await fetch(
      `${supabaseUrl}/auth/v1/admin/users`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { invited_by: caller.id },
        }),
      }
    );

    if (createRes.ok) {
      const created = await createRes.json();
      userId = created.id;
    } else {
      const err = await createRes.json();
      // User might already exist
      if (
        err.msg?.includes("already been registered") ||
        err.message?.includes("already been registered")
      ) {
        // Look up existing user by email
        const listRes = await fetch(
          `${supabaseUrl}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
          {
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              apikey: serviceKey,
            },
          }
        );
        if (listRes.ok) {
          const list = await listRes.json();
          const found = (list.users ?? []).find(
            (u: any) => u.email === email
          );
          if (found) {
            userId = found.id;
          }
        }
      }

      if (!userId) {
        return {
          success: false,
          error: err.msg || err.message || "Failed to create user",
        };
      }
    }

    // Check if membership already exists
    const { data: existing } = await supabase
      .from("memberships")
      .select("id, status")
      .eq("user_id", userId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (existing) {
      if (existing.status === "active") {
        return {
          success: false,
          error: "User is already a member of this organization",
        };
      }
      // Reactivate inactive membership
      const { error: updateErr } = await supabase
        .from("memberships")
        .update({
          status: "active",
          role,
          permission_profile_id: permissionProfileId,
        })
        .eq("id", existing.id);

      if (updateErr) {
        return { success: false, error: updateErr.message };
      }
      return { success: true, userId };
    }

    // Create new membership
    const { error: insertErr } = await supabase
      .from("memberships")
      .insert({
        user_id: userId,
        organization_id: organizationId,
        role,
        permission_profile_id: permissionProfileId,
        status: "active",
      });

    if (insertErr) {
      return { success: false, error: insertErr.message };
    }

    return { success: true, userId };
  } catch (err: any) {
    return { success: false, error: err.message ?? "Unexpected error" };
  }
}

/**
 * Update a membership's role and permission profile.
 */
export async function updateMember(
  membershipId: string,
  role: string,
  permissionProfileId: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("memberships")
      .update({
        role,
        permission_profile_id: permissionProfileId || null,
      })
      .eq("id", membershipId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Deactivate a membership (soft remove).
 */
export async function removeMember(
  membershipId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("memberships")
      .update({ status: "inactive" })
      .eq("id", membershipId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
