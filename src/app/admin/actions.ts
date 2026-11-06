"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";

async function requireAdmin() {
  const session = await getSession();
  if (session.profile?.role !== "admin") throw new Error("Admins only");
  return session;
}

export async function approveCompany(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const id = String(formData.get("company_id"));
  const groupId = String(formData.get("customer_group_id") || "");
  const expires = String(formData.get("license_expires_on") || "");
  const note = String(formData.get("internal_note") || "");
  if (!groupId) throw new Error("Please choose a customer group.");

  const { error } = await supabase
    .from("companies")
    .update({
      status: "approved",
      customer_group_id: groupId,
      license_expires_on: expires || null,
      internal_note: note || null,
      verified_on: new Date().toISOString().slice(0, 10),
      verified_by: user!.id,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
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
