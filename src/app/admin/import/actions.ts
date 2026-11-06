"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { processImport, type ImportPayload, type ImportResult } from "@/lib/import";

type Outcome = { ok: true; result: ImportResult } | { ok: false; error: string };

async function run(payload: ImportPayload, dryRun: boolean): Promise<Outcome> {
  const { supabase, profile } = await getSession();
  if (profile?.role !== "admin") return { ok: false, error: "Admins only" };
  try {
    const result = await processImport(supabase, payload, dryRun);
    if (!dryRun) revalidatePath("/admin/catalog");
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Import failed" };
  }
}

export async function previewImport(payload: ImportPayload) {
  return run(payload, true);
}

export async function applyImport(payload: ImportPayload) {
  return run(payload, false);
}
