import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseDate, parseNumber, parsePrice, parsePzn, parseQuantity, parseText } from "@/lib/parse";
import { parseProductName } from "@/lib/product-name";

export type ImportRow = Record<string, unknown>;

export type ImportPayload = {
  manufacturer: string; // used for rows without their own manufacturer
  stockAsOf: string;
  incoterm: string;
  defaultMoq: number;
  isRx: boolean;
  hideMissing: boolean;
  parseNames: boolean; // derive ingredient, strength, form and pack size from the product name
  rows: ImportRow[]; // already mapped to field keys (trade_name, batch, ...)
};

export type RowResult = {
  line: number;
  product: string;
  manufacturer: string;
  batch: string;
  ingredient: string | null;
  strength: string | null;
  pack: string | null;
  expiry: string | null;
  qty: number | null;
  moq: number;
  price: number | null;
  status: "new_product" | "new_batch" | "update" | "unchanged" | "error";
  message?: string;
};

export type ImportResult = {
  newManufacturers: string[];
  counts: Record<RowResult["status"] | "hidden", number>;
  rows: RowResult[];
};

type Product = {
  id: string; pzn: string | null; trade_name: string; strength: string | null; pack_size: string | null;
  manufacturer_id: string; active_ingredient: string | null; dosage_form: string | null;
};
type Offer = {
  id: string; product_id: string; batch: string; expiry_date: string | null; available_qty: number | null;
  moq: number; purchase_price: number | null; is_active: boolean; internal_note: string | null;
};

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const key = (...parts: (string | null | undefined)[]) => parts.map(norm).join("|");
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const sameNum = (a: number | null, b: number | null) =>
  a === null || b === null ? a === b : Math.abs(Number(a) - Number(b)) < 0.005;
const show = (v: unknown) => (v === null || v === undefined || v === "" ? "on request" : String(v));

// Validates and matches a stock list. With dryRun=false it also writes the changes.
export async function processImport(supabase: SupabaseClient, payload: ImportPayload, dryRun: boolean): Promise<ImportResult> {
  if (payload.rows.length === 0) throw new Error("The list has no rows.");
  if (payload.rows.length > 5000) throw new Error("Please import at most 5,000 rows at once.");
  const stockAsOf = parseDate(payload.stockAsOf) ?? new Date().toISOString().slice(0, 10);
  const fallbackMaker = parseText(payload.manufacturer);
  const hasNoteColumn = payload.rows.some((r) => "note" in r);

  // Manufacturers: one per row (column) or the list-wide one
  const makerNames = new Map<string, string>(); // normalised -> display name
  for (const r of payload.rows) {
    const m = parseText(r.manufacturer) ?? fallbackMaker;
    if (m) makerNames.set(norm(m), m);
  }
  const makerIds = new Map<string, string>(); // normalised name -> id
  for (const [n, display] of makerNames) {
    const { data } = await supabase.from("manufacturers").select("id").ilike("name", escapeLike(display)).maybeSingle();
    if (data) makerIds.set(n, data.id as string);
  }
  const newManufacturers = [...makerNames].filter(([n]) => !makerIds.has(n)).map(([, d]) => d);
  if (!dryRun) {
    for (const display of newManufacturers) {
      const { data, error } = await supabase.from("manufacturers").insert({ name: display }).select("id").single();
      if (error) throw new Error(error.message);
      makerIds.set(norm(display), data.id as string);
    }
  }

  // What already exists for these manufacturers, plus any product with a PZN from the list
  const cols = "id, pzn, trade_name, strength, pack_size, manufacturer_id, active_ingredient, dosage_form";
  const products: Product[] = [];
  const existingMakerIds = [...makerIds.values()];
  if (existingMakerIds.length) {
    const { data } = await supabase.from("products").select(cols).in("manufacturer_id", existingMakerIds);
    products.push(...((data ?? []) as Product[]));
  }
  const pzns = [...new Set(payload.rows.map((r) => parsePzn(r.pzn)).filter((p): p is string => !!p))];
  if (pzns.length) {
    const { data } = await supabase.from("products").select(cols).in("pzn", pzns);
    for (const p of (data ?? []) as Product[]) if (!products.some((x) => x.id === p.id)) products.push(p);
  }
  const byPzn = new Map(products.filter((p) => p.pzn).map((p) => [p.pzn as string, p]));
  const byName = new Map(products.map((p) => [key(p.manufacturer_id, p.trade_name, p.strength, p.pack_size), p]));

  const offers: Offer[] = [];
  if (products.length) {
    const { data } = await supabase
      .from("offers").select("id, product_id, batch, expiry_date, available_qty, moq, purchase_price, is_active, internal_note")
      .in("product_id", products.map((p) => p.id));
    offers.push(...((data ?? []) as Offer[]));
  }
  const offerByKey = new Map(offers.map((o) => [key(o.product_id, o.batch), o]));

  const results: RowResult[] = [];
  const seen = new Set<string>();
  const touchedOfferIds = new Set<string>();
  const newProducts = new Map<string, string>(); // product key -> id (placeholder in dry run)

  for (const [i, raw] of payload.rows.entries()) {
    const line = i + 1;
    const trade_name = parseText(raw.trade_name);
    const makerName = parseText(raw.manufacturer) ?? fallbackMaker;
    const batch = parseText(raw.batch) ?? "";
    const parsed = payload.parseNames && trade_name ? parseProductName(trade_name, makerName) : null;
    const product = {
      trade_name: trade_name ?? "",
      active_ingredient: parseText(raw.active_ingredient) ?? parsed?.active_ingredient ?? null,
      strength: parseText(raw.strength) ?? parsed?.strength ?? null,
      dosage_form: parseText(raw.dosage_form) ?? parsed?.dosage_form ?? null,
      pack_size: parseText(raw.pack_size) ?? parsed?.pack_size ?? null,
      pzn: parsePzn(raw.pzn),
    };
    const expiryRaw = parseText(raw.expiry_date);
    const expiry = parseDate(raw.expiry_date);
    const price = parsePrice(raw.purchase_price);
    const quantity = parseQuantity(raw.available_qty);
    const moq = Math.max(1, Math.round(parseNumber(raw.moq) ?? quantity.moq ?? payload.defaultMoq ?? 1));

    const base = {
      line, product: trade_name ?? "(no name)", manufacturer: makerName ?? "", batch,
      ingredient: product.active_ingredient, strength: product.strength, pack: product.pack_size,
      expiry, qty: quantity.qty, moq, price: price.value,
    };
    const errors: string[] = [];
    if (!trade_name) errors.push("product name missing");
    if (!makerName) errors.push("manufacturer missing");
    if (errors.length) {
      results.push({ ...base, status: "error", message: errors.join(", ") });
      continue;
    }
    const notes: string[] = [];
    if (expiryRaw && !expiry) notes.push(`expiry “${expiryRaw}” not readable, left open`);
    if (price.unreadable) notes.push(`price “${parseText(raw.purchase_price)}” not readable, left on request`);
    if (quantity.unreadable) notes.push(`quantity “${parseText(raw.available_qty)}” not readable, left on request`);

    const makerKey = norm(makerName);
    const makerId = makerIds.get(makerKey) ?? `new:${makerKey}`;
    const pKey = product.pzn ? `pzn:${product.pzn}` : key(makerId, product.trade_name, product.strength, product.pack_size);
    const existing = (product.pzn && byPzn.get(product.pzn)) || byName.get(key(makerId, product.trade_name, product.strength, product.pack_size));

    const dupKey = `${pKey}#${norm(batch)}`;
    if (seen.has(dupKey)) {
      results.push({ ...base, status: "error", message: batch ? "same product and batch appear twice in the list" : "same product appears twice in the list without batch numbers" });
      continue;
    }
    seen.add(dupKey);

    let productId = existing?.id ?? newProducts.get(pKey);
    const isNewProduct = !productId;
    if (!productId) {
      if (dryRun) {
        productId = `new:${pKey}`;
      } else {
        const { data, error } = await supabase
          .from("products").insert({ ...product, manufacturer_id: makerId, is_rx: payload.isRx }).select("id").single();
        if (error) {
          results.push({ ...base, status: "error", message: error.message });
          continue;
        }
        productId = data.id as string;
      }
      newProducts.set(pKey, productId);
    } else if (!dryRun && existing) {
      // Fill in details the product is still missing; never overwrite what is there
      const fill: Record<string, string> = {};
      for (const f of ["active_ingredient", "dosage_form", "strength", "pack_size"] as const) {
        if (product[f] && !existing[f]) fill[f] = product[f]!;
      }
      if (Object.keys(fill).length) await supabase.from("products").update(fill).eq("id", existing.id);
    }

    const offer = existing ? offerByKey.get(key(productId, batch)) : undefined;
    const values: Record<string, unknown> = {
      expiry_date: expiry,
      available_qty: quantity.qty,
      moq,
      purchase_price: price.value,
      stock_as_of: stockAsOf,
      incoterm: payload.incoterm || "EXW",
      is_active: true,
    };
    if (hasNoteColumn) values.internal_note = parseText(raw.note);

    if (offer) {
      touchedOfferIds.add(offer.id);
      const changes: string[] = [];
      if (offer.available_qty !== quantity.qty) changes.push(`qty ${show(offer.available_qty)} → ${show(quantity.qty)}`);
      if (!sameNum(offer.purchase_price, price.value)) changes.push(`price ${show(offer.purchase_price)} → ${show(price.value)}`);
      if (offer.expiry_date !== expiry) changes.push(`expiry ${offer.expiry_date ?? "open"} → ${expiry ?? "open"}`);
      if (offer.moq !== moq) changes.push(`MOQ ${offer.moq} → ${moq}`);
      if (hasNoteColumn && (offer.internal_note ?? null) !== parseText(raw.note)) changes.push("note");
      if (!offer.is_active) changes.push("visible again");
      if (!dryRun) {
        const { error } = await supabase.from("offers").update(values).eq("id", offer.id);
        if (error) {
          results.push({ ...base, status: "error", message: error.message });
          continue;
        }
      }
      results.push({
        ...base,
        status: changes.length ? "update" : "unchanged",
        message: [...changes, ...notes].join(", ") || undefined,
      });
    } else {
      if (!dryRun) {
        const { error } = await supabase.from("offers").insert({ ...values, product_id: productId, batch });
        if (error) {
          results.push({ ...base, status: "error", message: error.message });
          continue;
        }
      }
      results.push({ ...base, status: isNewProduct ? "new_product" : "new_batch", message: notes.join(", ") || undefined });
    }
  }

  // Active batches of the manufacturers in this list that are no longer on it
  let hidden = 0;
  if (payload.hideMissing) {
    const listMakerIds = new Set([...makerNames.keys()].map((n) => makerIds.get(n)).filter(Boolean));
    const ownProductIds = new Set(products.filter((p) => listMakerIds.has(p.manufacturer_id)).map((p) => p.id));
    const toHide = offers.filter((o) => o.is_active && ownProductIds.has(o.product_id) && !touchedOfferIds.has(o.id));
    hidden = toHide.length;
    if (!dryRun && toHide.length) {
      const { error } = await supabase.from("offers").update({ is_active: false }).in("id", toHide.map((o) => o.id));
      if (error) throw new Error(error.message);
    }
  }

  const counts = { new_product: 0, new_batch: 0, update: 0, unchanged: 0, error: 0, hidden };
  for (const r of results) counts[r.status]++;
  return { newManufacturers, counts, rows: results };
}
