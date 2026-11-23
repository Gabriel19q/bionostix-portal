"use server";

import { revalidatePath } from "next/cache";
import { getSession, isApprovedSeller } from "@/lib/session";
import { draftToPayload, validateDraft, type Draft } from "@/lib/listing";
import type { Category } from "@/lib/categories";

// Saves offers from the upload mask. Rules are checked again here and in the database.
export async function saveListingsAction(drafts: Draft[]) {
  const { supabase, account } = await getSession();
  if (!isApprovedSeller(account)) return { ok: false as const, error: "Your seller access is not active." };
  const approved = (account?.categories ?? [])
    .filter((c) => c.role === "sell" && c.status === "approved").map((c) => c.category as Category);
  if (!Array.isArray(drafts) || drafts.length === 0) return { ok: false as const, error: "No offers to save." };
  const bad = drafts.findIndex((d) => Object.keys(validateDraft(d, approved)).length > 0);
  if (bad >= 0) return { ok: false as const, error: `Row ${bad + 1} still has missing or invalid values.` };

  const { data, error } = await supabase.rpc("save_listings", { p: drafts.map(draftToPayload) });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/portal/sell");
  return { ok: true as const, saved: data as number };
}

export async function endListingsAction(formData: FormData) {
  const { supabase, account } = await getSession();
  if (!isApprovedSeller(account)) throw new Error("Your seller access is not active.");
  const ids = formData.getAll("id").map(String).filter((s) => /^[0-9a-f-]{36}$/i.test(s));
  if (ids.length === 0) return;
  const { error } = await supabase.rpc("end_listings", { p_ids: ids });
  if (error) throw new Error(error.message);
  revalidatePath("/portal/sell");
}
