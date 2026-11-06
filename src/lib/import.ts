import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseDate, parseNumber, parsePzn, parseText } from "@/lib/parse";

export type ImportRow = Record<string, unknown>;

export type ImportPayload = {
  manufacturer: string;
  stockAsOf: string;
  incoterm: string;
  defaultMoq: number;
  isRx: boolean;
  hideMissing: boolean;
  rows: ImportRow[]; // already mapped to field keys (trade_name, batch, ...)
};

export type RowResult = {
  line: number;
  product: string;
  batch: string;
  status: "new_product" | "new_batch" | "update" | "unchanged" | "error";
  message?: string;
};

export type ImportResult = {
  manufacturerIsNew: boolean;
  counts: Record<RowResult["status"] | "hidden", number>;
  rows: RowResult[];
};

type Product = { id: string; pzn: string | null; trade_name: string; strength: string | null; pack_size: string | null; manufacturer_id: string };
type Offer = { id: string; product_id: string; batch: string; expiry_date: string; available_qty: number; moq: number; purchase_price: number; is_active: boolean };

const key = (...parts: (string | null | undefined)[]) => parts.map((p) => (p ?? "").trim().toLowerCase()).join("|");
const eq = (a: number, b: number) => Math.abs(Number(a) - Number(b)) < 0.005;

// Validates and matches a manufacturer stock list. With dryRun=false it also writes the changes.
export async function processImport(supabase: SupabaseClient, payload: ImportPayload, dryRun: boolean): Promise<ImportResult> {
  const manufacturerName = payload.manufacturer.trim();
  if (!manufacturerName) throw new Error("Please choose the manufacturer.");
  if (payload.rows.length === 0) throw new Error("The list has no rows.");
  if (payload.rows.length > 5000) throw new Error("Please import at most 5,000 rows at once.");
  const stockAsOf = parseDate(payload.stockAsOf) ?? new Date().toISOString().slice(0, 10);

  const { data: existingManufacturer } = await supabase
    .from("manufacturers").select("id").ilike("name", manufacturerName.replace(/[\\%_]/g, (c) => `\\${c}`)).maybeSingle();
  let manufacturerId = existingManufacturer?.id as string | undefined;
  const manufacturerIsNew = !manufacturerId;
  if (!manufacturerId && !dryRun) {
    const { data, error } = await supabase.from("manufacturers").insert({ name: manufacturerName }).select("id").single();
    if (error) throw new Error(error.message);
    manufacturerId = data.id;
  }

  // Load what already exists for this manufacturer (and any product matching a PZN in the list)
  const pzns = [...new Set(payload.rows.map((r) => parsePzn(r.pzn)).filter((p): p is string => !!p))];
  const products: Product[] = [];
  if (manufacturerId) {
    const { data } = await supabase.from("products").select("id, pzn, trade_name, strength, pack_size, manufacturer_id").eq("manufacturer_id", manufacturerId);
    products.push(...((data ?? []) as Product[]));
  }
  if (pzns.length) {
    const { data } = await supabase.from("products").select("id, pzn, trade_name, strength, pack_size, manufacturer_id").in("pzn", pzns);
    for (const p of (data ?? []) as Product[]) if (!products.some((x) => x.id === p.id)) products.push(p);
  }
  const byPzn = new Map(products.filter((p) => p.pzn).map((p) => [p.pzn as string, p]));
  const byName = new Map(
    products.filter((p) => p.manufacturer_id === manufacturerId).map((p) => [key(p.trade_name, p.strength, p.pack_size), p]),
  );

  const offers: Offer[] = [];
  if (products.length) {
    const { data } = await supabase
      .from("offers").select("id, product_id, batch, expiry_date, available_qty, moq, purchase_price, is_active")
      .in("product_id", products.map((p) => p.id));
    offers.push(...((data ?? []) as Offer[]));
  }
  const offerByKey = new Map(offers.map((o) => [key(o.product_id, o.batch), o]));

  const results: RowResult[] = [];
  const seen = new Set<string>();
  const touchedOfferIds = new Set<string>();
  const newProductsByKey = new Map<string, string>(); // product key -> id (or placeholder in dry run)

  for (const [i, raw] of payload.rows.entries()) {
    const line = i + 1;
    const trade_name = parseText(raw.trade_name);
    const batch = parseText(raw.batch);
    const expiry = parseDate(raw.expiry_date);
    const qty = parseNumber(raw.available_qty);
    const price = parseNumber(raw.purchase_price);
    const label = trade_name ?? "(no name)";
    const errors: string[] = [];
    if (!trade_name) errors.push("product name missing");
    if (!batch) errors.push("batch missing");
    if (!expiry) errors.push(`expiry date not readable (${String(raw.expiry_date ?? "")})`);
    if (qty === null || qty < 0) errors.push("quantity missing");
    if (price === null || price < 0) errors.push("purchase price missing");
    if (errors.length) {
      results.push({ line, product: label, batch: batch ?? "", status: "error", message: errors.join(", ") });
      continue;
    }

    const product = {
      trade_name: trade_name!,
      active_ingredient: parseText(raw.active_ingredient),
      strength: parseText(raw.strength),
      dosage_form: parseText(raw.dosage_form),
      pack_size: parseText(raw.pack_size),
      pzn: parsePzn(raw.pzn),
    };
    const pKey = product.pzn ? `pzn:${product.pzn}` : key(product.trade_name, product.strength, product.pack_size);
    const existing = (product.pzn && byPzn.get(product.pzn)) || byName.get(key(product.trade_name, product.strength, product.pack_size));

    const dupKey = `${pKey}#${batch!.toLowerCase()}`;
    if (seen.has(dupKey)) {
      results.push({ line, product: label, batch: batch!, status: "error", message: "same product and batch appear twice in the list" });
      continue;
    }
    seen.add(dupKey);

    let productId = existing?.id ?? newProductsByKey.get(pKey);
    const isNewProduct = !productId;
    if (!productId) {
      if (dryRun) {
        productId = `new:${pKey}`;
      } else {
        const { data, error } = await supabase
          .from("products").insert({ ...product, manufacturer_id: manufacturerId, is_rx: payload.isRx }).select("id").single();
        if (error) {
          results.push({ line, product: label, batch: batch!, status: "error", message: error.message });
          continue;
        }
        productId = data.id as string;
      }
      newProductsByKey.set(pKey, productId);
    } else if (!dryRun && existing) {
      // fill in details the list provides but the product lacks
      const fill: Record<string, string> = {};
      for (const f of ["active_ingredient", "dosage_form", "strength", "pack_size"] as const) {
        const v = product[f];
        if (v && !(existing as unknown as Record<string, string | null>)[f]) fill[f] = v;
      }
      if (Object.keys(fill).length) await supabase.from("products").update(fill).eq("id", existing.id);
    }

    const moq = Math.max(1, Math.round(parseNumber(raw.moq) ?? payload.defaultMoq ?? 1));
    const offer = existing ? offerByKey.get(key(productId, batch)) : undefined;
    const values = {
      expiry_date: expiry!,
      available_qty: Math.round(qty!),
      moq,
      purchase_price: Math.round(price! * 100) / 100,
      stock_as_of: stockAsOf,
      incoterm: payload.incoterm || "EXW",
      is_active: true,
    };

    if (offer) {
      touchedOfferIds.add(offer.id);
      const changes: string[] = [];
      if (offer.available_qty !== values.available_qty) changes.push(`qty ${offer.available_qty} → ${values.available_qty}`);
      if (!eq(offer.purchase_price, values.purchase_price)) changes.push(`price ${offer.purchase_price} → ${values.purchase_price}`);
      if (offer.expiry_date !== values.expiry_date) changes.push(`expiry ${offer.expiry_date} → ${values.expiry_date}`);
      if (offer.moq !== values.moq) changes.push(`MOQ ${offer.moq} → ${values.moq}`);
      if (!offer.is_active) changes.push("visible again");
      if (!dryRun) {
        const { error } = await supabase.from("offers").update(values).eq("id", offer.id);
        if (error) {
          results.push({ line, product: label, batch: batch!, status: "error", message: error.message });
          continue;
        }
      }
      results.push({
        line, product: label, batch: batch!,
        status: changes.length ? "update" : "unchanged",
        message: changes.join(", ") || undefined,
      });
    } else {
      if (!dryRun) {
        const { error } = await supabase.from("offers").insert({ ...values, product_id: productId, batch });
        if (error) {
          results.push({ line, product: label, batch: batch!, status: "error", message: error.message });
          continue;
        }
      }
      results.push({ line, product: label, batch: batch!, status: isNewProduct ? "new_product" : "new_batch" });
    }
  }

  // Batches of this manufacturer that are no longer on the list
  let hidden = 0;
  if (payload.hideMissing && manufacturerId) {
    const ownProductIds = new Set(products.filter((p) => p.manufacturer_id === manufacturerId).map((p) => p.id));
    const toHide = offers.filter((o) => o.is_active && ownProductIds.has(o.product_id) && !touchedOfferIds.has(o.id));
    hidden = toHide.length;
    if (!dryRun && toHide.length) {
      const { error } = await supabase.from("offers").update({ is_active: false }).in("id", toHide.map((o) => o.id));
      if (error) throw new Error(error.message);
    }
  }

  const counts = { new_product: 0, new_batch: 0, update: 0, unchanged: 0, error: 0, hidden };
  for (const r of results) counts[r.status]++;
  return { manufacturerIsNew, counts, rows: results };
}
