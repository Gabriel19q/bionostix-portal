"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSession } from "@/lib/session";
import { emails, sendEmail } from "@/lib/email";
import { parseNumber, parseText } from "@/lib/parse";
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

  // When the offer goes out, unconfirmed lines are confirmed as requested
  if (status === "offer_sent") {
    const { data: items } = await supabase
      .from("request_items").select("id, requested_qty, unit_price_snapshot, confirmed_qty, confirmed_unit_price")
      .eq("request_id", id);
    const missing = (items ?? []).filter((i) => i.confirmed_unit_price === null && i.unit_price_snapshot === null);
    if (missing.length) redirect(`/admin/requests/${id}?error=prices`);
    for (const i of items ?? []) {
      if (i.confirmed_qty === null || i.confirmed_unit_price === null) {
        await supabase.from("request_items").update({
          confirmed_qty: i.confirmed_qty ?? i.requested_qty,
          confirmed_unit_price: i.confirmed_unit_price ?? i.unit_price_snapshot,
        }).eq("id", i.id);
      }
    }
  }

  const { error } = await supabase.rpc("admin_set_request_status", {
    p_request_id: id, p_status: status, p_note: message,
  });
  if (error) throw new Error(error.message);

  if (notify) {
    const { number, to } = await customerEmailsFor(supabase, id);
    await sendEmail({ to, ...emails.statusChanged(number, STATUS_LABEL[status], STATUS_HINT[status], message, id) });
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
