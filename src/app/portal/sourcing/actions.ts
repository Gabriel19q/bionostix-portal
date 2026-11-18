"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { adminEmails, emails, sendEmail } from "@/lib/email";
import { logActivity } from "@/lib/activity";

const text = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().slice(0, max);

export async function submitSourcingAction(formData: FormData) {
  const { supabase, company } = await getSession();
  if (!company) redirect("/portal");

  const product = text(formData.get("product"), 300);
  const neededBy = text(formData.get("needed_by"), 10);
  const { data: id, error } = await supabase.rpc("submit_sourcing_request", {
    p_product: product,
    p_details: text(formData.get("details"), 20000),
    p_quantity: text(formData.get("quantity"), 200),
    p_target_price: text(formData.get("target_price"), 200),
    p_needed_by: /^\d{4}-\d{2}-\d{2}$/.test(neededBy) ? neededBy : null,
    p_delivery_country: text(formData.get("delivery_country"), 100),
  });
  if (error) redirect(`/portal/sourcing?error=${encodeURIComponent(friendly(error.message))}`);

  const { data: row } = await supabase.rpc("get_my_sourcing_requests").eq("id", id).maybeSingle<{ number: string }>();
  await sendEmail({ to: adminEmails(), ...emails.newSourcing(row?.number ?? "", company.name, product) });
  await logActivity(supabase, "submit_sourcing", "/portal/sourcing", { number: row?.number });

  revalidatePath("/portal/sourcing");
  redirect(`/portal/sourcing?sent=${encodeURIComponent(row?.number ?? "1")}`);
}

function friendly(message: string) {
  const known: Record<string, string> = {
    "product is required": "Please tell us which product you are looking for.",
    "delivery country is required": "Please choose the delivery country.",
    "date must be in the future": "The date must be in the future.",
    "text too long": "Your text is too long. Please shorten it or send the list by email.",
    "too many sourcing requests today": "You have sent many requests today. Please send further ones tomorrow or by email.",
    "company not approved or licence expired": "Your access is not active or your licence on file has expired.",
  };
  return Object.entries(known).find(([k]) => message.includes(k))?.[1] ?? "Something went wrong. Please try again.";
}
