import { createClient } from "@/lib/supabase/server";

/**
 * Server-side check for platform (super) admin status. Mirrors the check used
 * in the settings page and the getUserPermissions() resolver.
 */
export async function isPlatformAdmin(
  supabase?: Awaited<ReturnType<typeof createClient>>
): Promise<boolean> {
  const client = supabase ?? (await createClient());
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return false;

  const { data } = await client
    .from("platform_admins")
    .select("is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  return !!data;
}
