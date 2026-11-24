"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession, isApprovedSeller } from "@/lib/session";
import { emails, sendEmail } from "@/lib/email";
import { draftToPayload, validateDraft, type Draft } from "@/lib/listing";
import { WANTED_FIELDS, wantedToPayload } from "@/lib/wanted";
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

// Admin help: prepares offers for a seller as drafts; the seller confirms them under "My offers".
export async function adminPrepareListingsAction(sellerCompanyId: string, drafts: Draft[]) {
  const { supabase, profile } = await getSession();
  if (profile?.role !== "admin") return { ok: false as const, error: "Admins only." };
  const { data: cats } = await supabase.from("company_categories").select("category")
    .eq("company_id", sellerCompanyId).eq("role", "sell").eq("status", "approved");
  const approved = (cats ?? []).map((c) => c.category as Category);
  if (!Array.isArray(drafts) || drafts.length === 0) return { ok: false as const, error: "No offers to save." };
  const bad = drafts.findIndex((d) => Object.keys(validateDraft(d, approved)).length > 0);
  if (bad >= 0) return { ok: false as const, error: `Row ${bad + 1} still has missing or invalid values.` };
  const { data, error } = await supabase.rpc("admin_prepare_listings", { p_company: sellerCompanyId, p: drafts.map(draftToPayload) });
  if (error) return { ok: false as const, error: error.message };
  const { data: people } = await supabase.from("profiles").select("email").eq("company_id", sellerCompanyId);
  await sendEmail({ to: (people ?? []).map((p) => p.email), ...emails.offersPrepared(data as number) });
  revalidatePath("/admin/catalog");
  return { ok: true as const, saved: data as number };
}

// Buyers: product requests (wanted list). Rules are checked again here and in the database.
export async function saveProductRequestsAction(drafts: Draft[]) {
  const { supabase, account } = await getSession();
  const c = account?.company;
  if (!c || c.status !== "approved" || !c.wants_buy || c.buy_status !== "approved") {
    return { ok: false as const, error: "Your buyer access is not active." };
  }
  const approved = (account?.categories ?? []).filter((k) => k.role === "buy" && k.status === "approved").map((k) => k.category as Category);
  if (!Array.isArray(drafts) || drafts.length === 0) return { ok: false as const, error: "No product requests to save." };
  const bad = drafts.findIndex((d) => Object.keys(validateDraft(d, approved, undefined, WANTED_FIELDS)).length > 0);
  if (bad >= 0) return { ok: false as const, error: `Row ${bad + 1} still has missing or invalid values.` };
  const { data, error } = await supabase.rpc("save_product_requests", { p: drafts.map(wantedToPayload) });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/portal/sourcing");
  return { ok: true as const, saved: data as number };
}

// Admin help: prepares product requests for a buyer as drafts; the buyer confirms them.
export async function adminPrepareProductRequestsAction(buyerCompanyId: string, drafts: Draft[]) {
  const { supabase, profile } = await getSession();
  if (profile?.role !== "admin") return { ok: false as const, error: "Admins only." };
  const { data: cats } = await supabase.from("company_categories").select("category")
    .eq("company_id", buyerCompanyId).eq("role", "buy").eq("status", "approved");
  const approved = (cats ?? []).map((c) => c.category as Category);
  if (!Array.isArray(drafts) || drafts.length === 0) return { ok: false as const, error: "No product requests to save." };
  const bad = drafts.findIndex((d) => Object.keys(validateDraft(d, approved, undefined, WANTED_FIELDS)).length > 0);
  if (bad >= 0) return { ok: false as const, error: `Row ${bad + 1} still has missing or invalid values.` };
  const { data, error } = await supabase.rpc("admin_prepare_product_requests", { p_company: buyerCompanyId, p: drafts.map(wantedToPayload) });
  if (error) return { ok: false as const, error: error.message };
  const { data: people } = await supabase.from("profiles").select("email").eq("company_id", buyerCompanyId);
  await sendEmail({ to: (people ?? []).map((p) => p.email), ...emails.requestsPrepared(data as number) });
  revalidatePath("/admin/sourcing");
  return { ok: true as const, saved: data as number };
}

export async function closeProductRequestsAction(formData: FormData) {
  const { supabase } = await getSession();
  const ids = formData.getAll("id").map(String).filter((s) => /^[0-9a-f-]{36}$/i.test(s));
  if (ids.length === 0) return;
  const { error } = await supabase.rpc("close_product_requests", { p_ids: ids });
  if (error) throw new Error(error.message);
  revalidatePath("/portal/sourcing");
  redirect("/portal/sourcing?closed=1");
}
