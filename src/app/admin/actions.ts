"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { emails, sendEmail } from "@/lib/email";

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

  const { data: before } = await supabase.from("companies").select("name, status").eq("id", id).single();

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

  // First approval: tell the customer their access is active
  if (before && before.status !== "approved") {
    const { data: people } = await supabase.from("profiles").select("email").eq("company_id", id);
    await sendEmail({ to: (people ?? []).map((p) => p.email), ...emails.accessApproved(before.name) });
  }
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
