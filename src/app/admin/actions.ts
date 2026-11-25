"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { emails, sendEmail } from "@/lib/email";

async function requireAdmin() {
  const session = await getSession();
  if (session.profile?.role !== "admin") throw new Error("Admins only");
  return session;
}

const APPROVAL = ["applied", "approved", "rejected"] as const;
type Approval = (typeof APPROVAL)[number];
function approval(v: FormDataEntryValue | null): Approval | null {
  const s = String(v ?? "");
  return (APPROVAL as readonly string[]).includes(s) ? (s as Approval) : null;
}

// Marketplace review: roles, categories and sites are approved separately (SPEC.md, Registrierung und Freigabe).
export async function saveCompanyReview(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const id = String(formData.get("company_id"));
  const { data: before } = await supabase.from("companies")
    .select("name, status, wants_buy, wants_sell").eq("id", id).single();
  if (!before) throw new Error("Company not found");

  const buy = before.wants_buy ? approval(formData.get("buy_status")) : null;
  const sell = before.wants_sell ? approval(formData.get("sell_status")) : null;
  const pctRaw = String(formData.get("commission_pct") ?? "").replace(",", ".").trim();
  const pct = pctRaw === "" ? null : Number(pctRaw);
  if (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) throw new Error("Commission must be between 0 and 100 %.");

  // Sites
  const { data: sites } = await supabase.from("company_sites").select("id").eq("company_id", id);
  const validDates: string[] = [];
  for (const s of sites ?? []) {
    const status = approval(formData.get(`site_status:${s.id}`)) ?? "applied";
    const valid = String(formData.get(`site_valid:${s.id}`) ?? "") || null;
    if (status === "approved" && valid) validDates.push(valid);
    const { error } = await supabase.from("company_sites").update({ status, licence_valid_until: valid }).eq("id", s.id);
    if (error) throw new Error(error.message);
  }

  // Categories
  const { data: cats } = await supabase.from("company_categories").select("role, category").eq("company_id", id);
  for (const c of cats ?? []) {
    const status = approval(formData.get(`cat:${c.role}:${c.category}`)) ?? "applied";
    const { error } = await supabase.from("company_categories").update({ status })
      .eq("company_id", id).eq("role", c.role).eq("category", c.category);
    if (error) throw new Error(error.message);
  }

  const active = buy === "approved" || sell === "approved";
  const rejected = !active && (buy ?? "rejected") === "rejected" && (sell ?? "rejected") === "rejected";
  const update: Record<string, unknown> = {
    buy_status: buy,
    sell_status: sell,
    commission_pct: before.wants_sell ? pct : null,
    internal_note: String(formData.get("internal_note") ?? "") || null,
    // Earliest approved licence date: the old checks (my_company_active) use it
    license_expires_on: validDates.sort()[0] ?? null,
  };
  if (before.status !== "suspended") {
    update.status = active ? "approved" : rejected ? "rejected" : "applied";
    if (active && before.status !== "approved") {
      update.verified_on = new Date().toISOString().slice(0, 10);
      update.verified_by = user!.id;
    }
  }
  const { error } = await supabase.from("companies").update(update).eq("id", id);
  if (error) throw new Error(error.message);

  // First approval: tell the company their access is active
  if (active && before.status === "applied") {
    const { data: people } = await supabase.from("profiles").select("email").eq("company_id", id);
    await sendEmail({ to: (people ?? []).map((p) => p.email), ...emails.accessApproved(before.name) });
  }
  revalidatePath("/admin");
  // Show "Saved" at this company and keep it in view
  redirect(`/admin?saved=${id}#company-${id}`);
}

export async function setStandardCommission(formData: FormData) {
  const { supabase } = await requireAdmin();
  const pct = Number(String(formData.get("pct") ?? "").replace(",", "."));
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error("Commission must be between 0 and 100 %.");
  const { error } = await supabase.from("app_settings")
    .upsert({ key: "standard_commission_pct", value: pct, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

// Creates a company account directly, e.g. the seller accounts of Bionostix and Sanicura.
// Users are then added with "Move" (they register first, then get assigned).
export async function createCompanyAccount(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();
  const wantsBuy = formData.get("wants_buy") === "on";
  const wantsSell = formData.get("wants_sell") === "on";
  const categories = formData.getAll("categories").map(String)
    .filter((c) => ["pharma", "ivd", "supplements", "health"].includes(c));
  if (!name || !country) throw new Error("Name and country are required.");
  if (!wantsBuy && !wantsSell) throw new Error("Choose buyer and/or seller.");

  const code = wantsSell ? `S-${10000 + Math.floor(Math.random() * 90000)}` : null;
  const { data: company, error } = await supabase.from("companies").insert({
    name, country, wants_buy: wantsBuy, wants_sell: wantsSell,
    buy_status: wantsBuy ? "approved" : null, sell_status: wantsSell ? "approved" : null,
    seller_code: code,
    status: "approved", verified_on: new Date().toISOString().slice(0, 10), verified_by: user!.id,
  }).select("id").single();
  if (error) throw new Error(error.message);
  await supabase.from("company_sites").insert({ company_id: company.id, country, status: "approved" });
  const rows = [
    ...(wantsBuy ? categories.map((c) => ({ company_id: company.id, role: "buy", category: c, status: "approved" })) : []),
    ...(wantsSell ? categories.map((c) => ({ company_id: company.id, role: "sell", category: c, status: "approved" })) : []),
  ];
  if (rows.length) await supabase.from("company_categories").insert(rows);
  revalidatePath("/admin");
}

export async function setCompanyStatus(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("company_id"));
  const status = String(formData.get("status"));
  if (!["applied", "suspended", "rejected"].includes(status)) throw new Error("Invalid status");

  const { error } = await supabase.from("companies").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

export async function assignUser(formData: FormData) {
  const { supabase } = await requireAdmin();
  const userId = String(formData.get("user_id"));
  const companyId = String(formData.get("company_id") || "") || null;
  const { error } = await supabase.rpc("admin_assign_user_company", { p_user_id: userId, p_company_id: companyId });
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

// Removes a company that has neither users nor requests, e.g. a duplicate created by a second employee
export async function deleteCompany(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("company_id"));
  const [{ count: users }, { count: requests }] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("company_id", id),
    supabase.from("requests").select("id", { count: "exact", head: true }).eq("company_id", id),
  ]);
  if ((users ?? 0) > 0 || (requests ?? 0) > 0) throw new Error("This company still has users or requests.");
  const { error } = await supabase.from("companies").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}
