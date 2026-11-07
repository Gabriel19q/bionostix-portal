import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// ilike without wildcards = case-insensitive equality; escape % and _ in user text
const exact = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function findOrCreateManufacturer(supabase: SupabaseClient, name: string) {
  const clean = name.trim();
  const { data: existing } = await supabase.from("manufacturers").select("id").ilike("name", exact(clean)).maybeSingle();
  if (existing) return existing.id as string;
  const { data, error } = await supabase.from("manufacturers").insert({ name: clean }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export type ProductFields = {
  trade_name: string;
  active_ingredient: string | null;
  strength: string | null;
  dosage_form: string | null;
  pack_size: string | null;
  pzn: string | null;
  manufacturer_id: string;
};

// Same PZN = same product. Without PZN: same manufacturer, name, strength and pack size.
export async function findProduct(supabase: SupabaseClient, p: ProductFields) {
  if (p.pzn) {
    const { data } = await supabase.from("products").select("id").eq("pzn", p.pzn).maybeSingle();
    if (data) return data.id as string;
  }
  let q = supabase
    .from("products")
    .select("id")
    .eq("manufacturer_id", p.manufacturer_id)
    .ilike("trade_name", exact(p.trade_name));
  q = p.strength ? q.ilike("strength", exact(p.strength)) : q.is("strength", null);
  q = p.pack_size ? q.ilike("pack_size", exact(p.pack_size)) : q.is("pack_size", null);
  const { data } = await q.limit(1);
  return (data?.[0]?.id as string | undefined) ?? null;
}


// Deletes batches. Batches that appear in a customer request are kept for the record and hidden instead.
// Products left without any batch are deleted as well.
export async function deleteOffers(supabase: SupabaseClient, ids: string[]) {
  if (ids.length === 0) return { deleted: 0, hidden: 0 };
  const { data: used } = await supabase.from("request_items").select("offer_id").in("offer_id", ids);
  const usedIds = new Set((used ?? []).map((u) => u.offer_id as string));
  const deletable = ids.filter((id) => !usedIds.has(id));
  const keep = ids.filter((id) => usedIds.has(id));

  const { data: affected } = await supabase.from("offers").select("product_id").in("id", deletable);
  if (deletable.length) {
    const { error } = await supabase.from("offers").delete().in("id", deletable);
    if (error) throw new Error(error.message);
  }
  if (keep.length) {
    const { error } = await supabase.from("offers").update({ is_active: false }).in("id", keep);
    if (error) throw new Error(error.message);
  }

  const productIds = [...new Set((affected ?? []).map((a) => a.product_id as string))];
  if (productIds.length) {
    const { data: stillUsed } = await supabase.from("offers").select("product_id").in("product_id", productIds);
    const orphan = productIds.filter((p) => !(stillUsed ?? []).some((s) => s.product_id === p));
    if (orphan.length) await supabase.from("products").delete().in("id", orphan);
  }
  return { deleted: deletable.length, hidden: keep.length };
}
