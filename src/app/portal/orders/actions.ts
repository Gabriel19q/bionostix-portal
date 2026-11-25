"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { adminEmails, orderEmails, sendEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity";
import { eur } from "@/lib/format";
import { ORDER_DOC_KIND, ORDER_STATUS, type Order, type OrderStatus } from "@/lib/orders";

const text = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().slice(0, max);
const uuid = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "");
  return /^[0-9a-f-]{36}$/i.test(s) ? s : null;
};

// Email addresses of one side of an order. Looked up server-side only, so neither side learns the other's address.
async function emailsOf(orderId: string, side: "buyer" | "seller") {
  const admin = createAdminClient();
  if (!admin) {
    console.info("[email skipped: no SUPABASE_SERVICE_ROLE_KEY] order notification", orderId, side);
    return [];
  }
  const { data: o } = await admin.from("market_orders").select("buyer_company_id, seller_company_id").eq("id", orderId).single();
  if (!o) return [];
  const companyId = side === "buyer" ? o.buyer_company_id : o.seller_company_id;
  const [{ data: people }, { data: company }] = await Promise.all([
    admin.from("profiles").select("email").eq("company_id", companyId),
    admin.from("companies").select("contact_email").eq("id", companyId).single(),
  ]);
  return [...(people ?? []).map((p) => p.email as string), company?.contact_email ?? ""];
}

async function loadOrder(id: string) {
  const { supabase } = await getSession();
  const { data } = await supabase.rpc("get_my_order", { p_id: id });
  return data as Order | null;
}

function friendly(message: string) {
  const known: Record<string, string> = {
    "not an approved buyer": "Your buyer access is not active.",
    "offer not available": "This offer is no longer available.",
    "quantity missing": "Please enter the quantity.",
    "more than available": "The quantity is higher than the quantity available.",
    "below minimum order quantity": "The quantity is below the minimum order quantity.",
    "delivery country missing": "Please choose the delivery country.",
    "cannot be shipped": "This offer cannot be shipped to the chosen country.",
    "date must be in the future": "The date must be in the future.",
    "document not offered": "Please choose only documents the seller offers.",
    "too many requests today": "You have sent many requests today. Please continue tomorrow.",
    "counter-offer must change": "A counter-offer must change the quantity or the price.",
    "invalid counter-offer": "Please enter a valid quantity and price.",
  };
  return Object.entries(known).find(([k]) => message.includes(k))?.[1] ?? "Something went wrong. Please try again.";
}

// Buyer: binding request to an offer
export async function submitOrderAction(formData: FormData) {
  const { supabase } = await getSession();
  const listingId = uuid(formData.get("listing_id"));
  const neededBy = text(formData.get("needed_by"), 10);
  const { data: id, error } = await supabase.rpc("submit_order", {
    p: {
      listing_id: listingId,
      quantity: Number(text(formData.get("quantity"), 12)),
      delivery_country: text(formData.get("delivery_country"), 100),
      final_destination: text(formData.get("final_destination"), 100),
      needed_by: /^\d{4}-\d{2}-\d{2}$/.test(neededBy) ? neededBy : null,
      required_documents: formData.getAll("required_documents").map(String),
      comment: text(formData.get("comment"), 2000),
    },
  });
  if (error) redirect(`/portal/catalog/${listingId}?error=${encodeURIComponent(friendly(error.message))}`);
  const order = await loadOrder(id as string);
  if (order) {
    await sendEmail({ to: await emailsOf(order.id, "seller"), ...orderEmails.requested(order.number, order.product.product_name, order.quantity, order.id) });
  }
  await logActivity(supabase, "submit_request", "/portal/catalog", { number: order?.number });
  revalidatePath("/portal/requests");
  redirect(`/portal/requests/${id}?sent=1`);
}

// Buyer: withdraw before acceptance
export async function withdrawOrderAction(formData: FormData) {
  const { supabase } = await getSession();
  const id = uuid(formData.get("id"));
  if (!id) return;
  const { error } = await supabase.rpc("withdraw_order", { p_id: id });
  if (error) redirect(`/portal/requests/${id}?error=${encodeURIComponent("This request can no longer be withdrawn.")}`);
  const order = await loadOrder(id);
  if (order) await sendEmail({ to: await emailsOf(id, "seller"), ...orderEmails.withdrawn(order.number, order.product.product_name, id) });
  revalidatePath("/portal/requests");
  redirect(`/portal/requests/${id}`);
}

async function afterAccepted(order: Order) {
  await Promise.all([
    sendEmail({ to: await emailsOf(order.id, "buyer"), ...orderEmails.acceptedBuyer(order.number, order.product.product_name, order.id) }),
    sendEmail({ to: await emailsOf(order.id, "seller"), ...orderEmails.acceptedSeller(order.number, order.product.product_name, order.id) }),
  ]);
  const admin = createAdminClient();
  const { data: c } = admin
    ? await admin.from("market_orders").select("commission_eur").eq("id", order.id).single()
    : { data: null };
  await sendEmail({
    to: adminEmails(),
    ...orderEmails.acceptedAdmin(order.number, order.product.product_name, eur(order.total), c ? eur(c.commission_eur) : "see admin area"),
  });
}

// Buyer: answer a counter-offer
export async function answerCounterAction(formData: FormData) {
  const { supabase } = await getSession();
  const id = uuid(formData.get("id"));
  if (!id) return;
  const accept = formData.get("accept") === "yes";
  const { error } = await supabase.rpc("answer_counter_offer", { p_id: id, p_accept: accept });
  if (error) redirect(`/portal/requests/${id}?error=${encodeURIComponent("This counter-offer can no longer be answered.")}`);
  const order = await loadOrder(id);
  if (order) {
    if (accept) await afterAccepted(order);
    else await sendEmail({ to: await emailsOf(id, "seller"), ...orderEmails.counterDeclined(order.number, order.product.product_name, id) });
  }
  await logActivity(supabase, "respond", `/portal/requests/${id}`, { accept });
  revalidatePath("/portal/requests");
  redirect(`/portal/requests/${id}`);
}

// Seller: accept, decline or counter
export async function respondOrderAction(formData: FormData) {
  const { supabase } = await getSession();
  const id = uuid(formData.get("id"));
  if (!id) return;
  const action = text(formData.get("action"), 10);
  const { error } = await supabase.rpc("respond_to_order", {
    p_id: id,
    p_action: action,
    p: {
      reason: text(formData.get("reason"), 1000),
      quantity: text(formData.get("quantity"), 12) || null,
      price: text(formData.get("price"), 12).replace(",", ".") || null,
      note: text(formData.get("note"), 1000),
      update_listing: formData.get("update_listing") === "on",
    },
  });
  if (error) redirect(`/portal/sell/orders/${id}?error=${encodeURIComponent(friendly(error.message))}`);
  const order = await loadOrder(id);
  if (order) {
    if (action === "accept") await afterAccepted(order);
    if (action === "decline") await sendEmail({ to: await emailsOf(id, "buyer"), ...orderEmails.declined(order.number, order.product.product_name, id) });
    if (action === "counter") await sendEmail({ to: await emailsOf(id, "buyer"), ...orderEmails.countered(order.number, order.product.product_name, id) });
  }
  revalidatePath("/portal/sell/orders");
  redirect(`/portal/sell/orders/${id}`);
}

// Seller: payment received, shipped, completed
export async function setProgressAction(formData: FormData) {
  const { supabase } = await getSession();
  const id = uuid(formData.get("id"));
  if (!id) return;
  const status = text(formData.get("status"), 20) as OrderStatus;
  const tracking = text(formData.get("tracking"), 200) || null;
  const { error } = await supabase.rpc("set_order_progress", { p_id: id, p_status: status, p_tracking: tracking });
  if (error) redirect(`/portal/sell/orders/${id}?error=${encodeURIComponent("The status cannot be changed.")}`);
  const order = await loadOrder(id);
  if (order && status in ORDER_STATUS) {
    await sendEmail({ to: await emailsOf(id, "buyer"), ...orderEmails.progress(order.number, ORDER_STATUS[status].label, tracking, id) });
  }
  revalidatePath("/portal/sell/orders");
  redirect(`/portal/sell/orders/${id}`);
}

// Both: register a file the browser uploaded into order/<id>/...
export async function registerOrderDocumentAction(orderId: string, path: string, fileName: string, kind: string) {
  const { supabase } = await getSession();
  if (!uuid(orderId) || !(kind in ORDER_DOC_KIND)) return { ok: false as const, error: "Invalid document." };
  const { error } = await supabase.rpc("add_order_document", { p_order: orderId, p_path: path, p_file_name: fileName, p_kind: kind });
  if (error) return { ok: false as const, error: "The document could not be saved." };
  const order = await loadOrder(orderId);
  if (order) {
    const mail = order.side === "seller"
      ? { to: await emailsOf(orderId, "buyer"), ...orderEmails.document(order.number, ORDER_DOC_KIND[kind], orderId) }
      : { to: await emailsOf(orderId, "seller"), ...orderEmails.documentForSeller(order.number, ORDER_DOC_KIND[kind], orderId) };
    await sendEmail(mail);
  }
  revalidatePath(order?.side === "seller" ? `/portal/sell/orders/${orderId}` : `/portal/requests/${orderId}`);
  return { ok: true as const };
}
