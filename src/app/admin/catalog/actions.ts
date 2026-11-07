"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { parseDate, parseNumber, parsePzn, parseText } from "@/lib/parse";
import { findOrCreateManufacturer, findProduct, type ProductFields } from "@/lib/catalog";

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

export async function setOfferActive(formData: FormData) {
  const supabase = await requireAdmin();
  const { error } = await supabase
    .from("offers")
    .update({ is_active: formData.get("active") === "true" })
    .eq("id", String(formData.get("offer_id")));
  if (error) throw new Error(error.message);
  revalidatePath("/admin/catalog");
}
