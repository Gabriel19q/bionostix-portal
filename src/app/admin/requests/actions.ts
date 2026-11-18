"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSession } from "@/lib/session";
import { emails, sendEmail } from "@/lib/email";
import { parseNumber, parseText } from "@/lib/parse";
import { displayDate, eur, sellPrice, today } from "@/lib/format";
import { DOC_TYPE_LABEL, STATUS_HINT, STATUS_LABEL, type RequestStatus } from "@/lib/status";

async function requireAdmin() {
  const session = await getSession();
  if (session.profile?.role !== "admin") throw new Error("Admins only");
  return session.supabase;
}

async function customerEmailsFor(supabase: SupabaseClient, requestId: string) {
  const { data: req } = await supabase.from("requests").select("number, company_id").eq("id", requestId).single();
  const { data: people } = await supabase.from("profiles").select("email").eq("company_id", req?.company_id);
  return { number: req?.number as string, to: (people ?? []).map((p) => p.email as string) };
}

function refresh(id: string) {
  revalidatePath(`/admin/requests/${id}`);
  revalidatePath("/admin/requests");
}

export async function saveItems(formData: FormData) {
  const supabase = await requireAdmin();
  const requestId = String(formData.get("request_id"));
  const ids = formData.getAll("item_id").map(String);
  for (const id of ids) {
    const qty = parseNumber(formData.get(`qty_${id}`));
    const price = parseNumber(formData.get(`price_${id}`));
    const { error } = await supabase
      .from("request_items")
      .update({
        confirmed_qty: qty === null ? null : Math.max(0, Math.round(qty)),
        confirmed_unit_price: price === null ? null : Math.round(price * 100) / 100,
      })
      .eq("id", id)
      .eq("request_id", requestId);
    if (error) throw new Error(error.message);
  }
  refresh(requestId);
}

// "Update catalog": the manufacturer reports new stock and/or purchase price for a batch in this request.
// The batch in the catalog is updated for all customers (stock checked today). For this order the confirmed
// price is set to the new sell price of the customer's group and the quantity is capped at the new stock;
// both can still be overwritten by hand before sending the counter-offer.
export async function updateCatalogFromRequest(formData: FormData) {
  const supabase = await requireAdmin();
  const requestId = String(formData.get("request_id"));
  const { data: req } = await supabase
    .from("requests").select("companies(customer_groups(default_markup_pct))").eq("id", requestId)
    .single<{ companies: { customer_groups: { default_markup_pct: number } | null } }>();
  const groupPct = Number(req?.companies?.customer_groups?.default_markup_pct ?? 0);
  const { data: items } = await supabase
    .from("request_items")
    .select("id, requested_qty, confirmed_qty, offers(id, available_qty, purchase_price, markup_override_pct)")
    .eq("request_id", requestId)
    .returns<{
      id: string; requested_qty: number; confirmed_qty: number | null;
      offers: { id: string; available_qty: number | null; purchase_price: number | null; markup_override_pct: number | null };
    }[]>();

  for (const i of items ?? []) {
    const o = i.offers;
    const stockRaw = parseNumber(formData.get(`stock_${i.id}`));
    const purchaseRaw = parseNumber(formData.get(`purchase_${i.id}`));
    const stock = stockRaw === null ? null : Math.max(0, Math.round(stockRaw));
    const purchase = purchaseRaw === null ? null : Math.round(purchaseRaw * 100) / 100;
    const stockChanged = stock !== o.available_qty;
    const purchaseChanged = purchase !== (o.purchase_price === null ? null : Number(o.purchase_price));
    if (!stockChanged && !purchaseChanged) continue;

    const { error } = await supabase
      .from("offers").update({ available_qty: stock, purchase_price: purchase, stock_as_of: today() }).eq("id", o.id);
    if (error) throw new Error(error.message);

    const itemUpdate: { confirmed_unit_price?: number | null; confirmed_qty?: number } = {};
    if (purchaseChanged) {
      itemUpdate.confirmed_unit_price = purchase === null ? null
        : sellPrice(purchase, o.markup_override_pct === null ? null : Number(o.markup_override_pct), groupPct);
      await supabase.from("request_item_costs").update({ purchase_price_snapshot: purchase }).eq("request_item_id", i.id);
    }
    if (stock !== null && stock < (i.confirmed_qty ?? i.requested_qty)) itemUpdate.confirmed_qty = stock;
    if (Object.keys(itemUpdate).length) await supabase.from("request_items").update(itemUpdate).eq("id", i.id);
  }
  revalidatePath("/admin/catalog");
  refresh(requestId);
  redirect(`/admin/requests/${requestId}?saved=catalog`);
}

// "Send counter-offer": save the confirmed values, set "Changes to accept" and email the customer the
// changed lines. The customer accepts (-> changes_accepted) or cancels; then the proforma follows.
export async function sendCounterOffer(formData: FormData) {
  await saveItems(formData);
  const supabase = await requireAdmin();
  const id = String(formData.get("request_id"));
  const message = parseText(formData.get("counter_message"));

  const { data: current } = await supabase.from("requests").select("status").eq("id", id).single();
  if (!["new", "in_review", "changes_proposed"].includes(current?.status ?? "")) {
    redirect(`/admin/requests/${id}?error=counterstatus`);
  }
  const { data: items } = await supabase
    .from("request_items")
    .select("id, requested_qty, unit_price_snapshot, confirmed_qty, confirmed_unit_price, offers(products(trade_name, strength, pack_size))")
    .eq("request_id", id)
    .returns<{
      id: string; requested_qty: number; unit_price_snapshot: number | null; confirmed_qty: number | null;
      confirmed_unit_price: number | null; offers: { products: { trade_name: string; strength: string | null; pack_size: string | null } };
    }[]>();
  const lines = (items ?? []).map((i) => ({
    ...i,
    qty: i.confirmed_qty ?? i.requested_qty,
    price: i.confirmed_unit_price ?? i.unit_price_snapshot,
  }));
  if (lines.some((l) => l.price === null)) redirect(`/admin/requests/${id}?error=prices`);
  const changed = lines.filter((l) => l.qty !== l.requested_qty || Number(l.price) !== Number(l.unit_price_snapshot));
  if (changed.length === 0) redirect(`/admin/requests/${id}?error=nochanges`);

  for (const l of lines) {
    await supabase.from("request_items").update({ confirmed_qty: l.qty, confirmed_unit_price: l.price }).eq("id", l.id);
  }
  const { error } = await supabase.rpc("admin_set_request_status", {
    p_request_id: id, p_status: "changes_proposed", p_note: message,
  });
  if (error) throw new Error(error.message);

  const summary = changed.map((l) => {
    const p = l.offers.products;
    const name = [p.trade_name, p.strength, p.pack_size].filter(Boolean).join(" ");
    const was = `${l.requested_qty} packs at ${l.unit_price_snapshot === null ? "price on request" : eur(l.unit_price_snapshot)}`;
    return `- ${name}: ${was} -> now ${l.qty} packs at ${eur(l.price)}`;
  }).join("\n");
  const { number, to } = await customerEmailsFor(supabase, id);
  await sendEmail({ to, ...emails.counterOffer(number, summary, message, id) });
  refresh(id);
  redirect(`/admin/requests/${id}?updated=changes_proposed`);
}

export async function saveMeta(formData: FormData) {
  const supabase = await requireAdmin();
  const id = String(formData.get("request_id"));

  const { error } = await supabase
    .from("requests")
    .update({ internal_note: parseText(formData.get("internal_note")) })
    .eq("id", id);
  if (error) throw new Error(error.message);
  refresh(id);
}

export async function changeStatus(formData: FormData) {
  const supabase = await requireAdmin();
  const id = String(formData.get("request_id"));
  const status = String(formData.get("status")) as RequestStatus;
  const message = parseText(formData.get("message"));
  const notify = formData.get("notify") === "on";
  if (!(status in STATUS_LABEL)) throw new Error("Unknown status");

  // Proposing changes or sending the proforma (= order confirmation, contract): empty confirmed fields mean
  // "as requested". The proforma may only differ from the request if the customer accepted the changes first.
  if (status === "proforma_sent" || status === "changes_proposed") {
    const { data: current } = await supabase.from("requests").select("status").eq("id", id).single();
    const { data: items } = await supabase
      .from("request_items").select("id, requested_qty, unit_price_snapshot, confirmed_qty, confirmed_unit_price")
      .eq("request_id", id);
    const lines = (items ?? []).map((i) => ({
      id: i.id as string,
      qty: (i.confirmed_qty ?? i.requested_qty) as number,
      price: (i.confirmed_unit_price ?? i.unit_price_snapshot) as number | null,
      requestedQty: i.requested_qty as number,
      requestedPrice: i.unit_price_snapshot as number | null,
    }));
    if (lines.some((l) => l.price === null)) redirect(`/admin/requests/${id}?error=prices`);
    const changed = lines.some((l) => l.qty !== l.requestedQty || Number(l.price) !== Number(l.requestedPrice));
    if (status === "proforma_sent" && changed && current?.status !== "changes_accepted") {
      redirect(`/admin/requests/${id}?error=changes`);
    }
    if (status === "changes_proposed" && !changed) redirect(`/admin/requests/${id}?error=nochanges`);

    if (status === "proforma_sent") {
      // Reservation at the manufacturer = payment deadline on the proforma
      const due = String(formData.get("payment_due") ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || due < today()) redirect(`/admin/requests/${id}?error=due`);
      const { data: docs } = await supabase.from("documents").select("id").eq("request_id", id).eq("doc_type", "proforma");
      if (!docs?.length) redirect(`/admin/requests/${id}?error=proforma`);
      const { error: dueError } = await supabase.from("requests").update({ payment_due_date: due }).eq("id", id);
      if (dueError) throw new Error(dueError.message);
    }

    for (const l of lines) {
      await supabase.from("request_items").update({ confirmed_qty: l.qty, confirmed_unit_price: l.price }).eq("id", l.id);
    }
  }

  const { error } = await supabase.rpc("admin_set_request_status", {
    p_request_id: id, p_status: status, p_note: message,
  });
  if (error) throw new Error(error.message);

  if (notify) {
    const { number, to } = await customerEmailsFor(supabase, id);
    let hint = STATUS_HINT[status];
    if (status === "proforma_sent") {
      const due = displayDate(String(formData.get("payment_due")));
      hint += ` Please pay the deposit by ${due}. If no payment is received by then, the proforma invoice will be cancelled.`;
    }
    await sendEmail({ to, ...emails.statusChanged(number, STATUS_LABEL[status], hint, message, id) });
  }
  refresh(id);
  redirect(`/admin/requests/${id}?updated=${status}`);
}

export async function registerRequestDocument(input: {
  requestId: string; path: string; fileName: string; docType: string; notify: boolean;
}) {
  const supabase = await requireAdmin();
  if (!input.path.startsWith(`request/${input.requestId}/`)) throw new Error("Invalid path");
  if (!(input.docType in DOC_TYPE_LABEL)) throw new Error("Unknown document type");
  const { data: claimsData } = await supabase.auth.getClaims();
  const { error } = await supabase.from("documents").insert({
    storage_path: input.path,
    file_name: input.fileName.slice(0, 200),
    doc_type: input.docType,
    request_id: input.requestId,
    uploaded_by: claimsData?.claims?.sub,
  });
  if (error) throw new Error(error.message);

  if (input.notify) {
    const { number, to } = await customerEmailsFor(supabase, input.requestId);
    await sendEmail({ to, ...emails.documentAdded(number, DOC_TYPE_LABEL[input.docType], input.requestId) });
  }
  refresh(input.requestId);
}
