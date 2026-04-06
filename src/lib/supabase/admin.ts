import { createClient } from "@supabase/supabase-js";

/**
 * Creates a Supabase client with the SERVICE_ROLE key.
 * This bypasses RLS and should ONLY be used in server actions / API routes.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in environment variables.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Add it to .env.local to enable admin operations."
    );
  }

  return createClient(url, serviceKey, {
    db: { schema: "app" },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
