"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSession } from "@/lib/session";
import { emails, sendEmail } from "@/lib/email";
import { parseNumber, parseText } from "@/lib/parse";
import { displayDate, today } from "@/lib/format";
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

export async function saveMeta(formData: FormData) {
  const supabase = await requireAdmin();
  const id = String(formData.get("request_id"));
  const seller = parseText(formData.get("seller"));
  const { error } = await supabase
    .from("requests")
    .update({ seller, internal_note: parseText(formData.get("internal_note")) })
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
}

export async function registerRequestDocument(input: {
  requestId: string; path: string; fileName: string; docType: string; notify: boolean;
}) {
  const supabase = await requireAdmin();
  if (!input.path.startsWith(`request/${input.requestId}/`)) throw new Error("Invalid path");
  if (!(input.docType in DOC_TYPE_LABEL)) throw new Error("Unknown document type");
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("documents").insert({
    storage_path: input.path,
    file_name: input.fileName.slice(0, 200),
    doc_type: input.docType,
    request_id: input.requestId,
    uploaded_by: user?.id,
  });
  if (error) throw new Error(error.message);

  if (input.notify) {
    const { number, to } = await customerEmailsFor(supabase, input.requestId);
    await sendEmail({ to, ...emails.documentAdded(number, DOC_TYPE_LABEL[input.docType], input.requestId) });
  }
  refresh(input.requestId);
}
