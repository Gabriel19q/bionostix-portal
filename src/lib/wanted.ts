// Product requests (buyers' wanted lists): fields of the upload mask, shared by browser and server.
import type { Category } from "@/lib/categories";
import { parseDate, parseNumber } from "@/lib/parse";
import { matchCountry } from "@/lib/countries";
import { displayDate } from "@/lib/format";
import { DOSAGE_FORMS, METHODS, PRODUCT_TYPES, SIZES, TESTS, UNITS, fieldMap, parseDocuments, type Draft, type FieldDef, type Need } from "@/lib/listing";

const all = (n: Need): Record<Category, Need> => ({ pharma: n, ivd: n, supplements: n, health: n });
const only = (m: Partial<Record<Category, Need>>): Record<Category, Need> => ({ pharma: "N", ivd: "N", supplements: "N", health: "N", ...m });

// Order terms: shown as choices, stored as codes
export const ORDER_TYPES: Record<string, string> = { one_time: "One-time order", annual: "Annual quantity with partial deliveries" };
export const SCHEDULES: Record<string, string> = {
  monthly: "Monthly (12 deliveries)", bimonthly: "Every 2 months (6 deliveries)", quarterly: "Quarterly (4 deliveries)",
  semiannual: "Twice a year (2 deliveries)", on_call: "On call (as needed)",
};
const codeOf = (map: Record<string, string>, label: string) => Object.keys(map).find((k) => map[k] === label) ?? null;
const isAnnual = (v: Record<string, string>) => v.order_type === ORDER_TYPES.annual;

export const WANTED_FIELDS: FieldDef[] = [
  { key: "product_name", label: "Product name", type: "text", need: all("R"), hints: ["product name", "product", "name", "bezeichnung", "artikelbezeichnung", "artikel", "description", "produkt"], help: "e.g. Amoxicillin 500 mg capsules" },
  { key: "active_ingredients", label: "Active ingredients", type: "ingredients", need: only({ pharma: "R", supplements: "R" }), hints: ["active ingredient", "ingredients", "wirkstoff", "inhaltsstoffe", "inn", "substance"], help: "Each ingredient with amount per unit, e.g. Amoxicillin 500 mg" },
  { key: "dosage_form", label: "Dosage form", type: "select", options: DOSAGE_FORMS, need: only({ pharma: "O", supplements: "O" }), hints: ["dosage form", "darreichungsform", "darreichung", "form"] },
  { key: "test_parameter", label: "Test / parameter", type: "select", options: TESTS, need: only({ ivd: "R" }), hints: ["test", "parameter", "analyte"] },
  { key: "method", label: "Method", type: "select", options: METHODS, need: only({ ivd: "O" }), hints: ["method", "methode"] },
  { key: "product_type", label: "Product type", type: "select", options: PRODUCT_TYPES, need: only({ health: "R" }), hints: ["product type", "produktart", "type"] },
  { key: "size_variant", label: "Size / variant", type: "select", options: SIZES, need: only({ health: "O" }), hints: ["size", "größe", "groesse", "variant"] },
  { key: "units_per_pack", label: "Units per pack", type: "int", need: all("O"), hints: ["units per pack", "pack size", "packungsgröße", "packungsgroesse", "inhalt", "pack", "packung"], help: "e.g. 20 for a pack of 20 capsules" },
  { key: "unit", label: "Unit", type: "select", options: UNITS, need: all("O"), hints: ["unit", "einheit"] },
  { key: "order_type", label: "Order type", type: "select", options: Object.values(ORDER_TYPES), need: all("R"), hints: ["order type", "bestellart", "auftragsart"], help: "Annual quantity, e.g. for a tender with several deliveries" },
  { key: "quantity", label: "Quantity (packs)", type: "int", need: all("R"), hints: ["quantity", "qty", "menge", "bedarf", "anzahl", "amount"],
    labelFor: (v) => (isAnnual(v) ? "Annual quantity (packs)" : "Quantity (packs)"), help: "e.g. 5000" },
  { key: "delivery_schedule", label: "Delivery schedule", type: "select", options: Object.values(SCHEDULES), need: all("R"), hints: ["delivery schedule", "schedule", "lieferrhythmus", "frequency", "rhythmus"], when: isAnnual },
  { key: "needed_by", label: "Latest delivery date", type: "date", need: all("R"), hints: ["needed by", "deadline", "bis", "termin", "liefertermin", "delivery date"],
    labelFor: (v) => (isAnnual(v) ? "First delivery by" : "Latest delivery date") },
  { key: "partial_deliveries", label: "Partial deliveries allowed", type: "bool", need: all("O"), hints: ["partial deliveries", "teillieferung", "teillieferungen"], when: (v) => !isAnnual(v) },
  { key: "target_price", label: "Target price per pack (EUR)", type: "money", need: all("O"), hints: ["target price", "zielpreis", "price", "preis"], help: "Optional, net, e.g. 1.90" },
  { key: "delivery_country", label: "Delivery country", type: "country", need: all("R"), hints: ["delivery country", "country", "land", "lieferland", "destination", "delivery", "ship to"] },
  { key: "registration_planned", label: "Registration in the destination country planned?", type: "bool", need: all("R"), hints: ["registration", "zulassung", "registrierung"], help: "Yes if you or the seller will register the product in the delivery country" },
  { key: "required_documents", label: "Required documents", type: "documents", need: all("O"), hints: ["documents", "dokumente", "certificates", "zertifikate", "required documents"], help: "Documents the seller must provide" },
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
    order_type: codeOf(ORDER_TYPES, v("order_type")),
    delivery_schedule: isAnnual(d.values) ? codeOf(SCHEDULES, v("delivery_schedule")) : null,
    partial_deliveries: isAnnual(d.values) || !v("partial_deliveries") ? null : v("partial_deliveries") === "Yes",
    registration_planned: v("registration_planned") ? v("registration_planned") === "Yes" : null,
    required_documents: parseDocuments(v("required_documents")).docs,
    note: v("note") || null,
  };
}

export function requestToDraft(r: Record<string, unknown>): Draft {
  const s = (k: string) => (r[k] === null || r[k] === undefined ? "" : String(r[k]));
  const values: Record<string, string> = {};
  for (const f of WANTED_FIELDS) values[f.key] = s(f.key);
  values.order_type = ORDER_TYPES[s("order_type")] ?? "";
  values.delivery_schedule = SCHEDULES[s("delivery_schedule")] ?? "";
  values.partial_deliveries = r.partial_deliveries === true ? "Yes" : r.partial_deliveries === false ? "No" : "";
  values.registration_planned = r.registration_planned === true ? "Yes" : r.registration_planned === false ? "No" : "";
  values.required_documents = ((r.required_documents as string[] | null) ?? []).join(", ");
  return { id: s("id"), category: (r.category as Category) ?? "", values, country_prices: [] };
}

// One line with the order terms of a saved product request (buyer and admin views)
export function orderTerms(r: {
  order_type: string | null; delivery_schedule: string | null; needed_by: string | null; partial_deliveries: boolean | null;
  registration_planned: boolean | null; required_documents: string[] | null;
}) {
  const date = r.needed_by ? displayDate(r.needed_by) : null;
  return [
    r.order_type === "annual" ? `Annual quantity · ${SCHEDULES[r.delivery_schedule ?? ""] ?? ""}` : r.order_type === "one_time" ? "One-time order" : null,
    date && (r.order_type === "annual" ? `first delivery by ${date}` : `latest delivery ${date}`),
    r.partial_deliveries === true ? "partial deliveries allowed" : r.partial_deliveries === false ? "no partial deliveries" : null,
    r.registration_planned === true ? "registration in destination country planned" : r.registration_planned === false ? "no registration planned" : null,
    r.required_documents?.length ? `documents: ${r.required_documents.join(", ")}` : null,
  ].filter(Boolean).join(" · ");
}
