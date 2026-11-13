"use server";

import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";

export async function logLoginAction() {
  await logActivity(await createClient(), "login", "/login");
}

export async function logExportAction(rows: number, mode: string, withPrices: boolean) {
  await logActivity(await createClient(), "export", "/portal/catalog", {
    rows: Math.max(0, Math.min(100000, Math.round(rows))),
    mode: ["all", "view", "selected"].includes(mode) ? mode : "other",
    prices: !!withPrices,
  });
}
