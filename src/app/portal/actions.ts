"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { adminEmails, emails, sendEmail } from "@/lib/email";
import { logActivity } from "@/lib/activity";

type CartLine = { offer_id: string; qty: number; min_expiry?: string };

export async function submitRequestAction(input: {
  items: CartLine[]; comment: string; deliveryCountry: string; deliveryDeadline: string; acceptedTerms: boolean;
}) {
  const { supabase, company } = await getSession();
  if (!company) return { ok: false as const, error: "Not signed in" };

  const items = input.items
    .filter((i) => typeof i.offer_id === "string" && Number.isInteger(i.qty) && i.qty > 0)
    .map((i) => ({
      offer_id: i.offer_id,
      qty: i.qty,
      ...(i.min_expiry && /^\d{4}-\d{2}-\d{2}$/.test(i.min_expiry) ? { min_expiry: i.min_expiry } : {}),
    }));
  if (items.length === 0) return { ok: false as const, error: "Your request is empty." };
  if (!input.acceptedTerms) return { ok: false as const, error: "Please accept the terms & conditions." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.deliveryDeadline)) return { ok: false as const, error: "Please enter a delivery deadline." };

  const { data: ids, error } = await supabase.rpc("submit_request", {
    p_items: items,
    p_comment: input.comment.slice(0, 2000),
    p_delivery_country: input.deliveryCountry.slice(0, 100),
    p_delivery_deadline: input.deliveryDeadline,
  });
  if (error) return { ok: false as const, error: friendly(error.message) };

  // One request per seller (products of different sellers are split)
  const requestIds = (ids ?? []) as string[];
  const { data: reqs } = await supabase.rpc("get_my_requests").in("id", requestIds);
  for (const r of (reqs ?? []) as { id: string; number: string }[]) {
    const { count } = await supabase.rpc("get_my_request_items", {}, { count: "exact", head: true }).eq("request_id", r.id);
    await sendEmail({ to: adminEmails(), ...emails.newRequest(r.number, company.name, count ?? 0, r.id) });
    await logActivity(supabase, "submit_request", "/portal/catalog", { number: r.number, lines: count ?? undefined });
  }

  revalidatePath("/portal/requests");
  return { ok: true as const, ids: requestIds };
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
  await logActivity(supabase, "respond", `/portal/requests/${id}`, { number: req?.number, accepted: accept });

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
    "nothing to accept yet": "There are no changes to accept yet.",
    "delivery deadline must be in the future": "The delivery deadline must be a future date.",
    "delivery country is required": "Please choose the delivery country.",
    "minimum expiry must be in the future": "The minimum expiry date must be a future date.",
  };
  return Object.entries(known).find(([k]) => message.includes(k))?.[1] ?? message;
}
