"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { adminEmails, emails, sendEmail } from "@/lib/email";

type CartLine = { offer_id: string; qty: number };

export async function submitRequestAction(input: { items: CartLine[]; comment: string; deliveryCountry: string }) {
  const { supabase, company } = await getSession();
  if (!company) return { ok: false as const, error: "Not signed in" };

  const items = input.items
    .filter((i) => typeof i.offer_id === "string" && Number.isInteger(i.qty) && i.qty > 0)
    .map((i) => ({ offer_id: i.offer_id, qty: i.qty }));
  if (items.length === 0) return { ok: false as const, error: "Your request is empty." };

  const { data: id, error } = await supabase.rpc("submit_request", {
    p_items: items,
    p_comment: input.comment.slice(0, 2000),
    p_delivery_country: input.deliveryCountry.slice(0, 100),
  });
  if (error) return { ok: false as const, error: friendly(error.message) };

  const { data: req } = await supabase.rpc("get_my_requests").eq("id", id).maybeSingle<{ number: string }>();
  const mail = emails.newRequest(req?.number ?? "", company.name, items.length, id as string);
  await sendEmail({ to: adminEmails(), ...mail });

  revalidatePath("/portal/requests");
  return { ok: true as const, id: id as string };
}

export async function respondAction(formData: FormData) {
  const { supabase, company } = await getSession();
  if (!company) throw new Error("Not signed in");
  const id = String(formData.get("request_id"));
  const accept = formData.get("accept") === "true";

  const { error } = await supabase.rpc("customer_respond", { p_request_id: id, p_accept: accept });
  if (error) throw new Error(friendly(error.message));

  const { data: req } = await supabase.rpc("get_my_requests").eq("id", id).maybeSingle<{ number: string }>();
  await sendEmail({ to: adminEmails(), ...emails.customerResponded(req?.number ?? "", company.name, accept, id) });

  revalidatePath(`/portal/requests/${id}`);
  revalidatePath("/portal/requests");
}

export async function notifyNewApplication() {
  const { company } = await getSession();
  if (!company || company.status !== "applied") return;
  await sendEmail({ to: adminEmails(), ...emails.newApplication(company.name, company.country) });
}

function friendly(message: string) {
  const known: Record<string, string> = {
    "quantity above available stock": "One of the quantities is higher than the available stock. Please adjust it.",
    "quantity below minimum order quantity": "One of the quantities is below the minimum order quantity.",
    "offer not available": "One of the batches is no longer available. Please remove it and try again.",
    "company not approved or licence expired": "Your access is not active or your licence on file has expired.",
    "request can no longer be cancelled": "This request can no longer be cancelled. Please contact us.",
    "nothing to accept yet": "There is no offer to accept yet.",
  };
  return Object.entries(known).find(([k]) => message.includes(k))?.[1] ?? message;
}
