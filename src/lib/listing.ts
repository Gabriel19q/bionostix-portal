// Offer (listing) fields of the marketplace, shared by the upload mask and the server.
// Required/optional per category as in SPEC.md (Angebote hochladen). The database checks the rules again.
import { COUNTRIES, matchCountry } from "@/lib/countries";
import { parseDate, parseNumber, parseYesNo } from "@/lib/parse";
import type { Category } from "@/lib/categories";
import { looksGerman, translateIngredientsText, translateProductName } from "@/lib/translate";

export type Need = "R" | "O" | "N"; // required, optional, not used

export const DOSAGE_FORMS = ["Tablet", "Effervescent tablet", "Capsule", "Powder", "Effervescent powder",
  "Solution for injection", "Gummies", "Lozenge", "Drops", "Spray", "Cream", "Other"];
export const TESTS = ["TSH", "FT3", "FT4", "HbA1c", "Glucose", "CRP", "PSA", "hCG", "Ferritin", "Vitamin D", "Troponin",
  "D-Dimer", "HIV", "HBsAg", "HCV", "Syphilis", "SARS-CoV-2 antigen", "Influenza A/B", "Malaria", "Dengue",
  "Urinalysis (multi-parameter)", "Blood grouping", "Other"];
export const METHODS = ["ELISA", "CLIA", "Rapid test (lateral flow)", "Immunofluorescence", "RIA", "PCR",
  "Urine test strip", "Clinical chemistry", "Haematology reagent", "HPLC", "Other"];
export const IVDR_CLASSES = ["A", "B", "C", "D", "Not yet classified (IVDD)"];
export const PRODUCT_TYPES = ["Gloves", "Wound dressing", "Bandage", "Gauze", "Plaster", "Syringe", "Needle", "Cannula",
  "Face mask", "Gown", "Lab consumable", "Disinfectant", "Other"];
export const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "One size", "Other"];
export const UNITS = ["tablets", "capsules", "sachets", "vials", "ampoules", "bottles", "tubes", "ml", "g", "tests",
  "strips", "pieces", "pairs", "other"];
export const INCOTERMS = ["EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP", "FAS", "FOB", "CFR", "CIF"];
export const DOCUMENTS = ["CoA", "CPP", "FSC", "GMP certificate", "Registration dossier", "Stability data",
  "Declaration of conformity / CE certificate", "ISO 13485 certificate", "Certificate of origin", "Other"];

export type FieldType = "country" | "packaging" | "ingredients" | "text" | "int" | "money" | "select" | "bool" | "expiry" | "date" | "countryRule" | "countries" | "documents";

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  need: Record<Category, Need>;
  hints: string[]; // header words in sellers' own lists (English and German)
  help?: string; // short explanation or example shown under the field
  when?: (values: Record<string, string>) => boolean; // field only applies when this is true
  labelFor?: (values: Record<string, string>) => string; // label that depends on other answers
};

const all = (n: Need): Record<Category, Need> => ({ pharma: n, ivd: n, supplements: n, health: n });
const only = (m: Partial<Record<Category, Need>>): Record<Category, Need> => ({ pharma: "N", ivd: "N", supplements: "N", health: "N", ...m });

export const FIELDS: FieldDef[] = [
  { key: "item_no", label: "Your item no.", type: "text", need: all("O"), hints: ["item no", "article no", "art.-nr", "artikelnummer", "artikelnr", "sku", "item", "ref"] },
  { key: "product_name", label: "Product name", type: "text", need: all("R"), hints: ["product name", "product", "name", "bezeichnung", "artikelbezeichnung", "handelsname", "description", "produkt", "artikel"], help: "e.g. Paracetamol 500 mg tablets" },
  { key: "name_on_pack", label: "Name on pack (original)", type: "text", need: all("O"), hints: [], help: "Original name as printed on the pack" },
  { key: "brand", label: "Brand", type: "text", need: all("R"), hints: ["brand", "marke", "manufacturer", "hersteller", "trade name"], help: "Brand or manufacturer as on the pack" },
  { key: "active_ingredients", label: "Active ingredients", type: "ingredients", need: only({ pharma: "R", supplements: "R" }), hints: ["active ingredient", "ingredients", "wirkstoff", "inhaltsstoffe", "inn", "substance", "composition"], help: "Each ingredient with amount and unit per unit" },
  { key: "dosage_form", label: "Dosage form", type: "select", options: DOSAGE_FORMS, need: only({ pharma: "R", supplements: "R" }), hints: ["dosage form", "darreichungsform", "darreichung", "form"] },
  { key: "dosage_form_other", label: "Dosage form – other", type: "text", need: only({ pharma: "O", supplements: "O" }), hints: [] },
  { key: "test_parameter", label: "Test / parameter", type: "select", options: TESTS, need: only({ ivd: "R" }), hints: ["test", "parameter", "analyte", "analyt"] },
  { key: "test_parameter_other", label: "Test – other", type: "text", need: only({ ivd: "O" }), hints: [] },
  { key: "method", label: "Method", type: "select", options: METHODS, need: only({ ivd: "R" }), hints: ["method", "methode", "technology"] },
  { key: "method_other", label: "Method – other", type: "text", need: only({ ivd: "O" }), hints: [] },
  { key: "ce_marking", label: "CE marking", type: "bool", need: only({ ivd: "R", health: "O" }), hints: ["ce marking", "ce", "ce-kennzeichnung"] },
  { key: "ivdr_class", label: "IVDR class", type: "select", options: IVDR_CLASSES, need: only({ ivd: "O" }), hints: ["ivdr class", "ivdr", "class", "klasse"] },
  { key: "sample_type", label: "Sample type", type: "text", need: only({ ivd: "O" }), hints: ["sample", "probe", "specimen", "probenmaterial"] },
  { key: "product_type", label: "Product type", type: "select", options: PRODUCT_TYPES, need: only({ health: "R" }), hints: ["product type", "produktart", "type", "typ"] },
  { key: "product_type_other", label: "Product type – other", type: "text", need: only({ health: "O" }), hints: [] },
  { key: "size_variant", label: "Size / variant", type: "select", options: SIZES, need: only({ health: "R" }), hints: ["size", "größe", "groesse", "variant", "variante"] },
  { key: "size_variant_other", label: "Size – other", type: "text", need: only({ health: "O" }), hints: [] },
  { key: "material", label: "Material", type: "text", need: only({ health: "O" }), hints: ["material"] },
  { key: "units_per_pack", label: "Units per pack", type: "int", need: all("R"), hints: ["units per pack", "pack size", "packungsgröße", "packungsgroesse", "inhalt", "units", "stück pro packung", "pcs per pack", "tests per kit"], help: "e.g. 20 for a pack of 20 tablets" },
  { key: "unit", label: "Unit", type: "select", options: UNITS, need: all("R"), hints: ["unit", "einheit"], help: "What one unit is" },
  { key: "national_code", label: "National code (e.g. PZN)", type: "text", need: only({ pharma: "O" }), hints: ["pzn", "national code", "nationale nummer"], help: "e.g. 01234567" },
  { key: "ma_holder", label: "MA holder", type: "text", need: only({ pharma: "O" }), hints: ["ma holder", "zulassungsinhaber", "marketing authorisation holder", "pharmazeutischer unternehmer"], help: "Marketing authorisation holder" },
  { key: "ean", label: "EAN / GTIN", type: "text", need: all("O"), hints: ["ean", "gtin", "barcode"] },
  { key: "packaging_language", label: "Packaging (country / language)", type: "packaging", need: all("R"), hints: ["packaging language", "packaging", "language", "sprache", "origin", "herkunft", "pack country"], help: "Country of the pack, or Custom for e.g. “German, English”" },
  { key: "quantity", label: "Quantity available (packs)", type: "int", need: all("R"), hints: ["quantity", "qty", "menge", "stock", "bestand", "available", "verfügbar", "verfuegbar", "anzahl"], help: "Number of packs you can deliver, e.g. 5000" },
  { key: "moq", label: "MOQ (packs)", type: "int", need: all("O"), hints: ["moq", "minimum order", "mindestmenge", "mindestabnahme"], help: "Minimum order quantity, e.g. 100" },
  { key: "price", label: "Price per pack (EUR)", type: "money", need: all("R"), hints: ["price", "preis", "unit price", "eur", "€", "netto"], help: "Net price for one pack, e.g. 1.20" },
  { key: "expiry", label: "Expiry", type: "expiry", need: all("R"), hints: ["expiry", "exp", "verfall", "mhd", "shelf life", "haltbarkeit", "haltbar", "verwendbar"], help: "Date, MM/YYYY or 'min 24 months'" },
  { key: "incoterm", label: "Incoterm", type: "select", options: INCOTERMS, need: all("R"), hints: ["incoterm", "incoterms", "lieferbedingung", "delivery terms"], help: "e.g. EXW = buyer collects at your warehouse" },
  { key: "incoterm_place", label: "Incoterm place", type: "text", need: all("R"), hints: ["incoterm place", "place", "ort", "location", "lagerort", "warehouse", "lager"], help: "City of the warehouse, e.g. Hamburg" },
  { key: "lead_time_days", label: "Lead time (days)", type: "int", need: all("O"), hints: ["lead time", "lieferzeit", "dispatch"], help: "Days until the goods are ready, e.g. 7" },
  { key: "valid_until", label: "Offer valid until", type: "date", need: all("R"), hints: ["valid until", "gültig bis", "gueltig bis", "offer valid", "validity"] },
  { key: "buyers", label: "Buyers based in", type: "countryRule", need: all("O"), hints: ["buyers based in", "sell to", "verkauf an", "käuferland"], help: "Empty = all countries · 'DE, AT' · 'all except RU'" },
  { key: "ship", label: "Ship to (destination)", type: "countryRule", need: all("O"), hints: ["ship to", "destination", "zielland", "lieferland"], help: "Same format" },
  { key: "registered_in", label: "Registered in", type: "countries", need: all("O"), hints: ["registered in", "registriert in", "registration", "zulassung"], help: "Countries with a marketing authorisation, e.g. DE, AT" },
  { key: "documents_available", label: "Documents available on request", type: "documents", need: all("O"), hints: ["documents", "dokumente", "certificates", "zertifikate"] },
];

export const fieldMap = (fields: FieldDef[]) => Object.fromEntries(fields.map((f) => [f.key, f])) as Record<string, FieldDef>;
export const FIELD_BY_KEY = fieldMap(FIELDS);

export type CountryRule = { mode: "all" | "only" | "except"; countries: string[] };

// The values one row of the mask holds. Text values exactly as shown in the inputs.
export type Draft = {
  id?: string;
  category: Category | "";
  values: Record<string, string>;
  country_prices: { country: string; price: string }[];
  suggested?: string[]; // fields the portal filled in itself: shown as "suggested – please check"
};

// Active ingredients: name, amount and unit as separate fields; stored as "Vitamin C 1000 mg; Zinc 10 mg"
export const STRENGTH_UNITS = ["mg", "g", "µg", "IU", "mg/ml", "µg/ml", "%", "mmol", "CFU", "ml"];
export type Ingredient = { name: string; amount: string; unit: string };

export function parseIngredients(text: string): Ingredient[] {
  return text.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    // "?" marks a value the seller has not entered yet (while editing)
    const m = part.match(/^(.+?)\s+(\d+(?:[.,]\d+)?|\?)\s*(\S.*)$/);
    if (!m) return { name: part, amount: "", unit: "" };
    const unit = m[3].trim() === "?" ? "" : m[3].trim();
    if (m[2] === "?") return { name: m[1].trim(), amount: "", unit };
    const known = STRENGTH_UNITS.find((u) => u.toLowerCase() === unit.toLowerCase().replace("mcg", "µg").replace("ug", "µg").replace(/^i\.?e\.?$/, "iu"));
    return { name: m[1].trim(), amount: m[2].replace(",", "."), unit: known ?? unit };
  });
}

export function serializeIngredients(list: Ingredient[]): string {
  return list
    .filter((i) => i.name.trim() || i.amount.trim() || i.unit.trim())
    .map((i) => `${i.name.trim() || "?"} ${i.amount.trim() || "?"} ${i.unit.trim() || "?"}`)
    .join("; ");
}

const norm = (s: string) => s.toLowerCase().replace(/[*()]/g, " ").replace(/\s+/g, " ").trim();

// Matches a free value from a seller list to one of the options ("tabletten" -> "Tablet")
const OPTION_ALIASES: Record<string, string> = {
  tabletten: "Tablet", tablette: "Tablet", tablets: "Tablet", tbl: "Tablet", "film-coated tablet": "Tablet", filmtabletten: "Tablet",
  brausetabletten: "Effervescent tablet", brausetablette: "Effervescent tablet", "effervescent tablets": "Effervescent tablet",
  kapseln: "Capsule", capsules: "Capsule", hartkapseln: "Capsule", weichkapseln: "Capsule", "soft capsules": "Capsule",
  pulver: "Powder", brausepulver: "Effervescent powder", "injektionslösung": "Solution for injection",
  "solution for injection": "Solution for injection", injection: "Solution for injection", tropfen: "Drops",
  "oral drops": "Drops", creme: "Cream", lutschtabletten: "Lozenge", lozenges: "Lozenge", gummibärchen: "Gummies",
  handschuhe: "Gloves", verbandmaterial: "Wound dressing", spritzen: "Syringe", kanülen: "Needle",
  ja: "Yes", nein: "No", stück: "pieces", stk: "pieces", pcs: "pieces", tabl: "tablets", kps: "capsules",
};

export function matchOption(value: string, options: string[]): string {
  const v = norm(value);
  if (!v) return "";
  const exact = options.find((o) => norm(o) === v);
  if (exact) return exact;
  const alias = OPTION_ALIASES[v];
  if (alias && options.includes(alias)) return alias;
  const starts = options.find((o) => v.startsWith(norm(o)) || norm(o).startsWith(v));
  if (starts) return starts;
  // Dosage forms in free text ("Film-coated tablets", "Hartkapseln") -> closest option
  if (options === DOSAGE_FORMS) return formFromText(value);
  return "";
}

// "Pharmaceuticals", "Arzneimittel", "IVD", "NEM" ... -> category
export function matchCategory(value: unknown): Category | "" {
  const v = norm(String(value ?? ""));
  if (!v) return "";
  if (/^(pharma|pharmaceutical|arznei|medicine|drug|rx|otc)/.test(v)) return "pharma";
  if (/^(ivd|in-vitro|in vitro|diagnost|test)/.test(v)) return "ivd";
  if (/^(food supplement|supplement|nahrungserg|nem|nutraceutical|vitamin)/.test(v)) return "supplements";
  if (/^(health|medical device|medizinprodukt|gesundheit|consumable|verbrauch)/.test(v)) return "health";
  return "";
}

// Guess which column of the seller's list belongs to which field, by header name.
export function guessListingMapping(headers: string[], fields: FieldDef[] = FIELDS): Record<string, string> {
  const result: Record<string, string> = {};
  const used = new Set<string>();
  const usable = [{ key: "category", hints: ["category", "kategorie", "bereich", "produktbereich"] }, ...fields.filter((f) => f.hints.length > 0),
    { key: "strength", hints: ["strength", "stärke", "staerke", "wirkstärke", "dosierung", "dosage"] }];
  for (const pass of ["exact", "contains"] as const) {
    for (const field of usable) {
      if (result[field.key]) continue;
      const match = headers.find((h) => !used.has(h) && field.hints.some((hint) =>
        pass === "exact" ? norm(h) === hint : hint.length > 2 && norm(h).includes(hint)));
      if (match) {
        result[field.key] = match;
        used.add(match);
      }
    }
  }
  return result;
}

// Turns a raw spreadsheet cell into the text shown in the mask
export function cellToText(field: FieldDef, raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  switch (field.type) {
    case "select": {
      const text = String(raw).trim();
      const matched = matchOption(text, field.options ?? []);
      return matched || (text ? (field.options?.includes("Other") ? `Other: ${text}` : text) : "");
    }
    case "bool": {
      const b = parseYesNo(raw);
      return b === null ? String(raw).trim() : b ? "Yes" : "No";
    }
    case "date": {
      return parseDate(raw) ?? String(raw).trim();
    }
    case "expiry": {
      if (typeof raw === "number" && raw > 20000) return parseDate(raw) ?? "";
      return String(raw).trim();
    }
    case "int":
    case "money": {
      const n = parseNumber(raw);
      return n === null ? String(raw).trim() : String(field.type === "int" ? Math.round(n) : n);
    }
    case "country": {
      const text = String(raw).trim();
      return matchCountry(text) || text;
    }
    case "packaging": {
      const text = String(raw).trim();
      return matchCountry(text) || LANGUAGE_COUNTRY[text.toLowerCase()] || text;
    }
    default:
      return String(raw).trim();
  }
}

// "Deutsch" / "German" in a seller list usually means a German pack
const LANGUAGE_COUNTRY: Record<string, string> = {
  german: "Germany", deutsch: "Germany", french: "France", französisch: "France", italian: "Italy", italienisch: "Italy",
  spanish: "Spain", spanisch: "Spain", dutch: "Netherlands", niederländisch: "Netherlands", polish: "Poland", polnisch: "Poland",
  arabic: "", arabisch: "",
};
export const PACKAGING_OPTIONS = ["Custom", ...COUNTRIES];

// Builds mask rows from the seller's sheet and the chosen column mapping.
export function rowsToDrafts(headers: string[], rows: unknown[][], mapping: Record<string, string>, defaultCategory: Category | "", fields: FieldDef[] = FIELDS): Draft[] {
  const byKey = fieldMap(fields);
  return rows.map((r) => {
    const values: Record<string, string> = {};
    for (const [key, header] of Object.entries(mapping)) {
      if (key === "category" || key === "strength") continue;
      const field = byKey[key];
      const i = headers.indexOf(header);
      if (!field || i < 0) continue;
      let text = cellToText(field, r[i]);
      // "Other: xyz" from a select goes into the field's "– other" companion
      if (text.startsWith("Other: ") && byKey[`${key}_other`]) {
        values[`${key}_other`] = text.slice(7);
        text = "Other";
      }
      values[key] = text;
    }
    // A separate strength column ("500 mg") belongs to a single ingredient without amount
    const strengthIndex = mapping.strength ? headers.indexOf(mapping.strength) : -1;
    const strength = strengthIndex >= 0 ? String(r[strengthIndex] ?? "").trim() : "";
    if (strength && values.active_ingredients && !/\d/.test(values.active_ingredients) && !values.active_ingredients.includes(";")) {
      values.active_ingredients = `${values.active_ingredients} ${strength}`;
    }
    const catIndex = mapping.category ? headers.indexOf(mapping.category) : -1;
    const category = (catIndex >= 0 ? matchCategory(r[catIndex]) : "") || defaultCategory;
    return { category, values, country_prices: [] };
  });
}

// "film-coated tablets" -> Tablet, "solution for infusion" -> Solution for injection ...
function formFromText(text: string): string {
  const t = text.toLowerCase();
  if (/brause|efferves/.test(t)) return /pulver|powder/.test(t) ? "Effervescent powder" : "Effervescent tablet";
  if (/lutsch|lozenge/.test(t)) return "Lozenge";
  if (/tablet|tablett/.test(t)) return "Tablet";
  if (/kapsel|capsule/.test(t)) return "Capsule";
  if (/inj|infus|ampul|ampoule|vial|syringe|spritze/.test(t)) return "Solution for injection";
  if (/pulver|powder/.test(t)) return "Powder";
  if (/tropfen|drops/.test(t)) return "Drops";
  if (/spray/.test(t)) return "Spray";
  if (/creme|cream|salbe|ointment|gel\b/.test(t)) return "Cream";
  if (/gumm/.test(t)) return "Gummies";
  return "";
}

// Fills in what can be read from the product name and recognises the category. Everything filled in
// here is marked as suggested so the seller checks it.
export function autoComplete(d: Draft, approved: Category[], parseName: (name: string) => {
  active_ingredient: string | null; strength: string | null; dosage_form: string | null; pack_size: string | null;
}): Draft {
  const values = { ...d.values };
  const suggested = new Set(d.suggested ?? []);
  // English product name and ingredients; the original stays as "name on pack"
  const original = values.product_name ?? "";
  if (original && looksGerman(original)) {
    if (!values.name_on_pack) values.name_on_pack = original;
    values.product_name = translateProductName(original);
    suggested.add("product_name");
  }
  const name = original;
  const text = `${name} ${values.active_ingredients ?? ""} ${values.dosage_form ?? ""}`.toLowerCase();
  let category = d.category;
  if (!category) {
    const guess: Category | "" =
      /\b(elisa|clia|assay|reagen[st]|test ?kit|rapid test|schnelltest|teststreifen|test strips?|immunoassay)\b/.test(text) || /\btests?\b/.test(text) ? "ivd"
      : /(glove|handschuh|dressing|verband|bandage|gauze|kompresse|syringe|spritze|needle|kanüle|cannula|mask\b|maske|gown|kittel|desinfekt|disinfect|pflaster|plaster)/.test(text) ? "health"
      : /(vitamin|zink|zinc|magnes|calcium|kalzium|omega|probiot|collagen|kollagen|biotin|folsäure|folic|selen|q10|nahrungserg|supplement|gumm|multivit)/.test(text) ? "supplements"
      : /\d\s*(mg|µg|mcg|g|ml|iu|ie)\b/.test(text) || /(tablet|tablett|kapsel|capsule|injekt|inject|infus|ampul|ampoule|sirup|syrup|salbe|creme|cream)/.test(text) ? "pharma"
      : "";
    if (guess && approved.includes(guess)) {
      category = guess;
      suggested.add("category");
    }
  }
  if (values.active_ingredients) {
    const english = translateIngredientsText(values.active_ingredients);
    if (english !== values.active_ingredients) {
      values.active_ingredients = english;
      suggested.add("active_ingredients");
    }
  }
  if (category === "pharma" || category === "supplements") {
    const parsed = name ? parseName(name) : null;
    if (parsed) {
      const ingredients = values.active_ingredients ?? "";
      if (!ingredients && parsed.active_ingredient && parsed.strength) {
        values.active_ingredients = translateIngredientsText(`${parsed.active_ingredient} ${parsed.strength}`);
        suggested.add("active_ingredients");
      } else if (ingredients && !/\d/.test(ingredients) && !ingredients.includes(";") && parsed.strength) {
        values.active_ingredients = translateIngredientsText(`${ingredients} ${parsed.strength}`);
        suggested.add("active_ingredients");
      }
      if (!values.dosage_form && parsed.dosage_form) {
        const form = matchOption(parsed.dosage_form, DOSAGE_FORMS) || formFromText(parsed.dosage_form);
        if (form) {
          values.dosage_form = form;
          suggested.add("dosage_form");
        }
      }
      const pack = parsed.pack_size?.match(/^(\d+)\s+(\S+)/);
      if (pack && !values.units_per_pack) {
        values.units_per_pack = pack[1];
        suggested.add("units_per_pack");
      }
      if (pack && (!values.unit || values.unit === "pieces")) {
        const unit = matchOption(pack[2], UNITS) || (/tabl/i.test(pack[2]) ? "tablets" : /kaps|caps/i.test(pack[2]) ? "capsules" : "");
        if (unit && unit !== values.unit) {
          values.unit = unit;
          suggested.add("unit");
        }
      }
    }
    // "Stk" next to a tablet form means tablets
    if (values.unit === "pieces" && /tablet/i.test(values.dosage_form ?? "")) {
      values.unit = "tablets";
      suggested.add("unit");
    } else if (values.unit === "pieces" && /capsule/i.test(values.dosage_form ?? "")) {
      values.unit = "capsules";
      suggested.add("unit");
    }
  }
  return { ...d, category, values, suggested: [...suggested] };
}

export function parseExpiry(text: string): { date: string | null; months: number | null; ok: boolean } {
  const t = text.trim();
  if (!t) return { date: null, months: null, ok: false };
  const m = t.match(/^(?:min(?:imum)?\.?|mind(?:estens)?\.?)?\s*(\d{1,3})\s*(?:months?|monate?|m)\b/i);
  if (m) {
    const months = Number(m[1]);
    return months >= 1 && months <= 120 ? { date: null, months, ok: true } : { date: null, months: null, ok: false };
  }
  const date = parseDate(t);
  return date ? { date, months: null, ok: true } : { date: null, months: null, ok: false };
}

// "" -> all · "DE, AT" -> only · "all except RU, BY" -> except. Unknown names are reported.
export function parseCountryRule(text: string): { rule: CountryRule; unknown: string[] } {
  const t = text.trim();
  if (!t || /^(all|alle|worldwide|weltweit)$/i.test(t)) return { rule: { mode: "all", countries: [] }, unknown: [] };
  const except = t.match(/^(?:all|alle|worldwide|weltweit)?\s*(?:except|ausser|außer|excluding|ohne|not)\s*:?\s*(.*)$/i);
  const list = (except ? except[1] : t).split(/[,;/]|\s+und\s+|\s+and\s+/).map((s) => s.trim()).filter(Boolean);
  const countries: string[] = [];
  const unknown: string[] = [];
  for (const item of list) {
    const c = matchCountry(item);
    if (c) countries.push(c);
    else unknown.push(item);
  }
  return { rule: { mode: except ? "except" : "only", countries: [...new Set(countries)] }, unknown };
}

export function parseCountryList(text: string): { countries: string[]; unknown: string[] } {
  const { rule, unknown } = parseCountryRule(text);
  return { countries: rule.mode === "only" ? rule.countries : [], unknown: rule.mode === "except" ? [text] : unknown };
}

export function parseDocuments(text: string): { docs: string[]; unknown: string[] } {
  const docs: string[] = [];
  const unknown: string[] = [];
  for (const item of text.split(/[,;]/).map((s) => s.trim()).filter(Boolean)) {
    const d = DOCUMENTS.find((x) => norm(x) === norm(item) || norm(x).startsWith(norm(item)) || (norm(item) === "coa" && x === "CoA"));
    if (d) docs.push(d);
    else unknown.push(item);
  }
  return { docs: [...new Set(docs)], unknown };
}


// Errors per field key for one row. approved: the categories this seller may sell.
export function validateDraft(d: Draft, approved: Category[], today = new Date().toISOString().slice(0, 10), fields: FieldDef[] = FIELDS): Record<string, string> {
  const byKey = fieldMap(fields);
  const e: Record<string, string> = {};
  if (!d.category) {
    e.category = "Choose a category";
    return e;
  }
  if (!approved.includes(d.category)) e.category = "Category not approved for you";
  const v = (k: string) => (d.values[k] ?? "").trim();
  for (const f of fields) {
    const need = f.need[d.category];
    const value = v(f.key);
    if (need === "N" || (f.when && !f.when(d.values))) continue;
    if (need === "R" && !value) {
      e[f.key] = "Required";
      continue;
    }
    if (!value) continue;
    switch (f.type) {
      case "select":
        if (!f.options?.includes(value)) e[f.key] = "Choose from the list";
        else if (value === "Other" && byKey[`${f.key}_other`] && !v(`${f.key}_other`)) e[`${f.key}_other`] = "Describe “Other”";
        break;
      case "bool":
        if (!["Yes", "No"].includes(value)) e[f.key] = "Yes or No";
        break;
      case "country":
        if (!COUNTRIES.includes(value)) e[f.key] = "Choose a country";
        break;
      case "int": {
        const n = Number(value);
        if (!Number.isInteger(n) || n < (f.key === "quantity" || f.key === "lead_time_days" ? 0 : 1)) e[f.key] = "Whole number";
        break;
      }
      case "money": {
        const n = parseNumber(value);
        if (n === null || n <= 0) e[f.key] = "Price above 0";
        break;
      }
      case "date": {
        const date = parseDate(value);
        if (!date) e[f.key] = "Date, e.g. 31.12.2026";
        else if (date < today) e[f.key] = "Date is in the past";
        break;
      }
      case "expiry": {
        const x = parseExpiry(value);
        if (!x.ok) e[f.key] = "Date, MM/YYYY or 'min 24 months'";
        else if (x.date && x.date <= today) e[f.key] = "Already expired";
        break;
      }
      case "countryRule": {
        const { rule, unknown } = parseCountryRule(value);
        if (unknown.length) e[f.key] = `Unknown country: ${unknown.join(", ")}`;
        else if (rule.mode !== "all" && rule.countries.length === 0) e[f.key] = "Name at least one country";
        break;
      }
      case "countries": {
        const { unknown } = parseCountryList(value);
        if (unknown.length) e[f.key] = `Unknown country: ${unknown.join(", ")}`;
        break;
      }
      case "documents": {
        const { unknown } = parseDocuments(value);
        if (unknown.length) e[f.key] = `Unknown document: ${unknown.join(", ")}`;
        break;
      }
    }
  }
  if (!e.active_ingredients && v("active_ingredients") && byKey.active_ingredients && byKey.active_ingredients.need[d.category] !== "N") {
    const bad = parseIngredients(v("active_ingredients")).find((i) => !i.name || i.name === "?" || !(Number(i.amount) > 0) || !i.unit || i.unit === "…");
    if (bad) e.active_ingredients = bad.name && bad.name !== "?" ? `Add amount and unit for ${bad.name}` : "Add the ingredient name";
  }
  if (!e.moq && v("moq") && v("quantity") && Number(v("moq")) > Number(v("quantity"))) e.moq = "MOQ is above the quantity";
  d.country_prices.forEach((cp, i) => {
    if (!matchCountry(cp.country) || !(parseNumber(cp.price) ?? 0)) e[`country_price_${i}`] = "Country and price above 0";
  });
  return e;
}

// Converts a valid mask row into the JSON the database function save_listings expects.
export function draftToPayload(d: Draft) {
  const v = (k: string) => (d.values[k] ?? "").trim();
  const n = (k: string) => (v(k) ? Number(v(k)) : null);
  const expiry = parseExpiry(v("expiry"));
  const buyers = parseCountryRule(v("buyers")).rule;
  const ship = parseCountryRule(v("ship")).rule;
  const keep = (k: string) => (FIELD_BY_KEY[k].need[d.category as Category] === "N" ? null : v(k) || null);
  return {
    id: d.id ?? null,
    category: d.category,
    item_no: v("item_no") || null,
    product_name: v("product_name"),
    name_on_pack: v("name_on_pack") || null,
    brand: v("brand"),
    active_ingredients: keep("active_ingredients"),
    dosage_form: keep("dosage_form"),
    dosage_form_other: v("dosage_form") === "Other" ? keep("dosage_form_other") : null,
    test_parameter: keep("test_parameter"),
    test_parameter_other: v("test_parameter") === "Other" ? keep("test_parameter_other") : null,
    method: keep("method"),
    method_other: v("method") === "Other" ? keep("method_other") : null,
    ce_marking: keep("ce_marking") === null ? null : v("ce_marking") === "Yes",
    ivdr_class: keep("ivdr_class"),
    sample_type: keep("sample_type"),
    product_type: keep("product_type"),
    product_type_other: v("product_type") === "Other" ? keep("product_type_other") : null,
    size_variant: keep("size_variant"),
    size_variant_other: v("size_variant") === "Other" ? keep("size_variant_other") : null,
    material: keep("material"),
    units_per_pack: n("units_per_pack"),
    unit: v("unit"),
    national_code: keep("national_code"),
    ma_holder: keep("ma_holder"),
    ean: v("ean") || null,
    packaging_language: v("packaging_language"),
    quantity: n("quantity"),
    moq: n("moq"),
    price: parseNumber(v("price")),
    expiry_date: expiry.date,
    min_shelf_life_months: expiry.months,
    incoterm: v("incoterm"),
    incoterm_place: v("incoterm_place"),
    lead_time_days: n("lead_time_days"),
    valid_until: parseDate(v("valid_until")),
    buyers_mode: buyers.mode,
    buyers_countries: buyers.countries,
    ship_mode: ship.mode,
    ship_countries: ship.countries,
    registered_in: parseCountryList(v("registered_in")).countries,
    documents_available: parseDocuments(v("documents_available")).docs,
    country_prices: d.country_prices.map((cp) => ({ country: matchCountry(cp.country), price: parseNumber(cp.price) })),
  };
}

// A saved listing (from get_my_listings) back into a mask row, for editing
export function listingToDraft(l: Record<string, unknown>): Draft {
  const s = (k: string) => (l[k] === null || l[k] === undefined ? "" : String(l[k]));
  const rule = (mode: string, countries: string[]) =>
    mode === "all" ? "" : mode === "except" ? `all except ${countries.join(", ")}` : countries.join(", ");
  const values: Record<string, string> = {};
  for (const f of FIELDS) values[f.key] = s(f.key);
  values.ce_marking = l.ce_marking === null || l.ce_marking === undefined ? "" : l.ce_marking ? "Yes" : "No";
  values.expiry = l.expiry_date ? s("expiry_date") : l.min_shelf_life_months ? `min ${s("min_shelf_life_months")} months` : "";
  values.buyers = rule(s("buyers_mode"), (l.buyers_countries as string[]) ?? []);
  values.ship = rule(s("ship_mode"), (l.ship_countries as string[]) ?? []);
  values.registered_in = ((l.registered_in as string[]) ?? []).join(", ");
  values.documents_available = ((l.documents_available as string[]) ?? []).join(", ");
  return {
    id: s("id"),
    category: l.category as Category,
    values,
    country_prices: ((l.country_prices as { country: string; price: number }[]) ?? []).map((c) => ({ country: c.country, price: String(c.price) })),
  };
}

