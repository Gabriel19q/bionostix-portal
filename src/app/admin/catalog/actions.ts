"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { parseDate, parseNumber, parsePzn, parseText, parseYesNo } from "@/lib/parse";
import { deleteOffers, findOrCreateManufacturer, findProduct, type ProductFields } from "@/lib/catalog";

async function requireAdmin() {
  const session = await getSession();
  if (session.profile?.role !== "admin") throw new Error("Admins only");
  return session.supabase;
}

export async function saveOffer(formData: FormData) {
  const supabase = await requireAdmin();
  const get = (k: string) => formData.get(k);

  const offerId = parseText(get("offer_id"));
  const productId = parseText(get("product_id"));
  const manufacturerName = parseText(get("manufacturer"));
  const tradeName = parseText(get("trade_name"));
  const batch = parseText(get("batch")) ?? "";
  const expiry = parseDate(get("expiry_date"));
  const qty = parseNumber(get("available_qty"));
  const price = parseNumber(get("purchase_price"));
  if (!manufacturerName || !tradeName) throw new Error("Manufacturer and product name are required.");

  const manufacturer_id = await findOrCreateManufacturer(supabase, manufacturerName);
  const product: ProductFields & { is_rx: boolean; is_cold_chain: boolean; is_narcotic: boolean } = {
    trade_name: tradeName,
    active_ingredient: parseText(get("active_ingredient")),
    strength: parseText(get("strength")),
    dosage_form: parseText(get("dosage_form")),
    pack_size: parseText(get("pack_size")),
    pzn: parsePzn(get("pzn")),
    manufacturer_id,
    is_rx: get("is_rx") === "on",
    is_cold_chain: get("is_cold_chain") === "on",
    is_narcotic: get("is_narcotic") === "on",
  };

  let pid = productId ?? (await findProduct(supabase, product));
  if (pid) {
    const { error } = await supabase.from("products").update(product).eq("id", pid);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await supabase.from("products").insert(product).select("id").single();
    if (error) throw new Error(error.message);
    pid = data.id as string;
  }

  const markup = parseNumber(get("markup_override_pct"));
  const offer = {
    product_id: pid,
    batch,
    expiry_date: expiry,
    available_qty: qty === null ? null : Math.round(qty),
    moq: Math.max(1, Math.round(parseNumber(get("moq")) ?? 1)),
    purchase_price: price === null ? null : Math.round(price * 100) / 100,
    internal_note: parseText(get("internal_note")),
    coa_available: parseYesNo(get("coa_available")),
    markup_override_pct: markup,
    incoterm: parseText(get("incoterm")) ?? "EXW",
    stock_as_of: parseDate(get("stock_as_of")) ?? new Date().toISOString().slice(0, 10),
    is_active: get("is_active") === "on",
  };

  const { error } = offerId
    ? await supabase.from("offers").update(offer).eq("id", offerId)
    : await supabase.from("offers").insert(offer);
  if (error) {
    if (error.code === "23505") throw new Error("This product already has an entry with that batch (or without batch).");
    throw new Error(error.message);
  }

  revalidatePath("/admin/catalog");
  redirect("/admin/catalog");
}

// Bulk actions from the catalog table and the delete button on a batch page
export async function offerAction(formData: FormData) {
  const supabase = await requireAdmin();
  const op = String(formData.get("op") ?? "");
  const back = new URLSearchParams();
  for (const k of ["q", "m", "inactive"]) {
    const v = parseText(formData.get(k));
    if (v) back.set(k, v);
  }

  // Single-row show/hide: op = "toggle:<id>:<true|false>"
  if (op.startsWith("toggle:")) {
    const [, id, active] = op.split(":");
    const { error } = await supabase.from("offers").update({ is_active: active === "true" }).eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath("/admin/catalog");
    redirect(`/admin/catalog?${back}`);
  }

  const ids = formData.getAll("offer_id").map(String).filter(Boolean);
  if (ids.length === 0) {
    back.set("msg", "none");
    redirect(`/admin/catalog?${back}`);
  }
  if (op === "hide" || op === "show") {
    const { error } = await supabase.from("offers").update({ is_active: op === "show" }).in("id", ids);
    if (error) throw new Error(error.message);
    back.set("msg", `${op}:${ids.length}`);
  } else if (op === "delete") {
    const { deleted, hidden } = await deleteOffers(supabase, ids);
    back.set("msg", `delete:${deleted}:${hidden}`);
  }
  revalidatePath("/admin/catalog");
  redirect(`/admin/catalog?${back}`);
}
