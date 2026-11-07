import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ActivityEvent =
  | "login" | "view_catalog" | "view_requests" | "view_request" | "export" | "submit_request" | "respond";

// Records customer activity for the admin "Activity" page. Never blocks or breaks the page.
export async function logActivity(
  supabase: SupabaseClient, event: ActivityEvent, path?: string, meta?: Record<string, unknown>,
) {
  try {
    await supabase.rpc("log_activity", { p_event: event, p_path: path ?? null, p_meta: meta ?? null });
  } catch {
    // tracking is best-effort
  }
}
