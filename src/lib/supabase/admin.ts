import "server-only";
import { createClient } from "@supabase/supabase-js";

// Server-only access with the service role key (bypasses row level security). Used only to look up the
// email addresses of the other side of an order, so buyers and sellers never see each other's addresses.
// Returns null without SUPABASE_SERVICE_ROLE_KEY: the portal keeps working, those emails are skipped.
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
