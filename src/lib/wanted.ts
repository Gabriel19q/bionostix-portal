// Product requests (buyers' wanted lists): fields of the upload mask, shared by browser and server.
import type { Category } from "@/lib/categories";
import { parseDate, parseNumber } from "@/lib/parse";
import { matchCountry } from "@/lib/countries";
import { DOSAGE_FORMS, METHODS, PRODUCT_TYPES, SIZES, TESTS, UNITS, fieldMap, type Draft, type FieldDef, type Need } from "@/lib/listing";

const all = (n: Need): Record<Category, Need> => ({ pharma: n, ivd: n, supplements: n, health: n });
const only = (m: Partial<Record<Category, Need>>): Record<Category, Need> => ({ pharma: "N", ivd: "N", supplements: "N", health: "N", ...m });

export const WANTED_FIELDS: FieldDef[] = [
  { key: "product_name", label: "Product name", type: "text", need: all("R"), hints: ["product name", "product", "name", "bezeichnung", "artikelbezeichnung", "artikel", "description", "produkt"] },
  { key: "active_ingredients", label: "Active ingredients", type: "ingredients", need: only({ pharma: "R", supplements: "R" }), hints: ["active ingredient", "ingredients", "wirkstoff", "inhaltsstoffe", "inn", "substance"] },
  { key: "dosage_form", label: "Dosage form", type: "select", options: DOSAGE_FORMS, need: only({ pharma: "O", supplements: "O" }), hints: ["dosage form", "darreichungsform", "darreichung", "form"] },
  { key: "test_parameter", label: "Test / parameter", type: "select", options: TESTS, need: only({ ivd: "R" }), hints: ["test", "parameter", "analyte"] },
  { key: "method", label: "Method", type: "select", options: METHODS, need: only({ ivd: "O" }), hints: ["method", "methode"] },
  { key: "product_type", label: "Product type", type: "select", options: PRODUCT_TYPES, need: only({ health: "R" }), hints: ["product type", "produktart", "type"] },
  { key: "size_variant", label: "Size / variant", type: "select", options: SIZES, need: only({ health: "O" }), hints: ["size", "größe", "groesse", "variant"] },
  { key: "units_per_pack", label: "Units per pack", type: "int", need: all("O"), hints: ["units per pack", "pack size", "packungsgröße", "packungsgroesse", "inhalt", "pack", "packung"] },
  { key: "unit", label: "Unit", type: "select", options: UNITS, need: all("O"), hints: ["unit", "einheit"] },
  { key: "quantity", label: "Quantity needed (packs)", type: "int", need: all("R"), hints: ["quantity", "qty", "menge", "bedarf", "anzahl", "amount"] },
  { key: "target_price", label: "Target price per pack (EUR)", type: "money", need: all("O"), hints: ["target price", "zielpreis", "price", "preis"] },
  { key: "needed_by", label: "Needed by", type: "date", need: all("O"), hints: ["needed by", "deadline", "bis", "termin", "liefertermin"] },
  { key: "delivery_country", label: "Delivery country", type: "country", need: all("R"), hints: ["delivery country", "country", "land", "lieferland", "destination", "delivery", "ship to"] },
  { key: "note", label: "Note", type: "text", need: all("O"), hints: ["note", "notes", "comment", "bemerkung", "kommentar"] },
];
export const WANTED_BY_KEY = fieldMap(WANTED_FIELDS);

export function wantedToPayload(d: Draft) {
  const v = (k: string) => (d.values[k] ?? "").trim();
  const keep = (k: string) => (WANTED_BY_KEY[k].need[d.category as Category] === "N" ? null : v(k) || null);
  return {
    id: d.id ?? null,
    category: d.category,
    product_name: v("product_name"),
    active_ingredients: keep("active_ingredients"),
    dosage_form: keep("dosage_form"),
    test_parameter: keep("test_parameter"),
    method: keep("method"),
    product_type: keep("product_type"),
    size_variant: keep("size_variant"),
    units_per_pack: v("units_per_pack") ? Number(v("units_per_pack")) : null,
    unit: v("unit") || null,
    quantity: Number(v("quantity")),
    target_price: parseNumber(v("target_price")),
    needed_by: parseDate(v("needed_by")),
    delivery_country: matchCountry(v("delivery_country")),
    note: v("note") || null,
  };
}

export function requestToDraft(r: Record<string, unknown>): Draft {
  const s = (k: string) => (r[k] === null || r[k] === undefined ? "" : String(r[k]));
  const values: Record<string, string> = {};
  for (const f of WANTED_FIELDS) values[f.key] = s(f.key);
  return { id: s("id"), category: (r.category as Category) ?? "", values, country_prices: [] };
}
