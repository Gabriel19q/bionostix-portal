"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { emails, sendEmail } from "@/lib/email";
import { SOURCING_STATUS, type SourcingStatus } from "@/lib/sourcing";

export async function updateSourcingAction(formData: FormData) {
  const { supabase, profile } = await getSession();
  if (profile?.role !== "admin") throw new Error("Admins only");

  const id = String(formData.get("id") ?? "");
  const statusInput = String(formData.get("status") ?? "open");
  const status = (statusInput in SOURCING_STATUS ? statusInput : "open") as SourcingStatus;
  const reply = String(formData.get("reply") ?? "").trim().slice(0, 5000) || null;
  const internal_note = String(formData.get("internal_note") ?? "").trim().slice(0, 5000) || null;
  const notify = formData.get("notify") === "on";
  const show = String(formData.get("show") ?? "");

  const { data: row, error } = await supabase
    .from("sourcing_requests")
    .update({ status, reply, internal_note })
    .eq("id", id)
    .select("number, product, profiles(email), companies(contact_email)")
    .single<{ number: string; product: string; profiles: { email: string } | null; companies: { contact_email: string | null } | null }>();
  if (error) throw new Error(error.message);

  if (notify) {
    await sendEmail({
      to: [row.profiles?.email ?? "", row.companies?.contact_email ?? ""],
      ...emails.sourcingUpdate(row.number, row.product, SOURCING_STATUS[status].label, reply),
    });
  }

  revalidatePath("/admin/sourcing");
  redirect(`/admin/sourcing?saved=${encodeURIComponent(row.number)}${notify ? "&notified=1" : ""}${show ? `&show=${show}` : ""}#${id}`);
}
