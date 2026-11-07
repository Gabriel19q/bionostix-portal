// Parsing helpers for manufacturer stock lists (German and English formats).

// "12,50" | "1.234,56" | "1,234.56" | "12.5" | "€ 12,50" | 12.5 -> number
export function parseNumber(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  let s = String(input).trim().replace(/[€\s]|EUR/gi, "");
  if (s === "" || s === "-") return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // the later separator is the decimal separator
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    // "1,234" with exactly 3 digits after a single comma is ambiguous; treat comma as decimal (German lists)
    s = s.replace(",", ".");
  } else if (lastDot > -1 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ""); // "1.234" thousands
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function iso(y: number, m: number, d: number) {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;
  return date.toISOString().slice(0, 10);
}

function lastDayOfMonth(y: number, m: number) {
  if (y < 100) y += 2000;
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

// Excel serial | "31.12.2027" | "2027-12-31" | "12/2027" | "12.2027" | "2027-12" | Date -> "YYYY-MM-DD"
// Month-only expiry dates mean the last day of that month.
export function parseDate(input: unknown): string | null {
  if (input === null || input === undefined || input === "") return null;
  if (input instanceof Date && !isNaN(input.getTime())) {
    return iso(input.getFullYear(), input.getMonth() + 1, input.getDate());
  }
  if (typeof input === "number") {
    if (input < 20000 || input > 80000) return null; // not a plausible Excel date
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(input) * 86_400_000);
    return date.toISOString().slice(0, 10);
  }
  const s = String(input).trim();
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return iso(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/))) return iso(+m[3], +m[2], +m[1]);
  if ((m = s.match(/^(\d{1,2})[./-](\d{4})$/))) return +m[1] >= 1 && +m[1] <= 12 ? lastDayOfMonth(+m[2], +m[1]) : null;
  if ((m = s.match(/^(\d{4})[./-](\d{1,2})$/))) return +m[2] >= 1 && +m[2] <= 12 ? lastDayOfMonth(+m[1], +m[2]) : null;
  if (/^\d{5}$/.test(s)) return parseDate(Number(s));
  return null;
}

export function parseText(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  const s = String(input).trim();
  return s === "" ? null : s;
}

// PZN: keep digits only, pad to 8 digits (German PZNs have 8 digits)
export function parsePzn(input: unknown): string | null {
  const s = parseText(input);
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  if (digits.length === 0) return null;
  // numbers in Excel lose leading zeros (368697 -> 00368697)
  return digits.length < 8 ? digits.padStart(8, "0") : digits;
}

export const IMPORT_FIELDS = [
  { key: "trade_name", label: "Product name", required: true, hints: ["product", "name", "bezeichnung", "artikel", "handelsname", "präparat", "praeparat", "description", "artikelbezeichnung", "produkt"] },
  { key: "manufacturer", label: "Manufacturer", required: false, hints: ["manufacturer", "hersteller", "supplier", "lieferant", "firma", "pharmazeutischer unternehmer"] },
  { key: "pzn", label: "PZN", required: false, hints: ["pzn"] },
  { key: "batch", label: "Batch", required: false, hints: ["batch", "charge", "ch.-b", "ch-b", "chb", "lot", "chargen"] },
  { key: "expiry_date", label: "Expiry date / shelf life", required: false, hints: ["expiry", "exp", "verfall", "mhd", "shelf life", "shelf", "haltbar", "verwendbar", "ablauf", "haltbarkeit"] },
  { key: "available_qty", label: "Available quantity", required: false, hints: ["qty", "quantity", "menge", "stock", "bestand", "stück", "stueck", "packungen", "anzahl", "verfügbar", "verfuegbar"] },
  { key: "purchase_price", label: "Purchase price (EUR)", required: false, hints: ["ek", "price", "preis", "einkauf", "netto", "unit price", "cost", "apu"] },
  { key: "active_ingredient", label: "Active ingredient", required: false, hints: ["wirkstoff", "ingredient", "inn", "substance"] },
  { key: "strength", label: "Strength", required: false, hints: ["strength", "stärke", "staerke", "dosis", "dosage"] },
  { key: "dosage_form", label: "Dosage form", required: false, hints: ["darreichung", "dosage form", "form"] },
  { key: "pack_size", label: "Pack size", required: false, hints: ["pack", "packung", "packungsgröße", "packungsgroesse", "größe", "inhalt", "n1", "n2", "n3"] },
  { key: "moq", label: "Minimum order quantity", required: false, hints: ["moq", "mindest", "minimum"] },
  { key: "coa_available", label: "COA available (yes/no)", required: false, hints: ["coa", "certificate of analysis", "analysenzertifikat", "analysezertifikat", "certificate", "zertifikat"] },
  { key: "note", label: "Internal note", required: false, hints: ["note", "notes", "notiz", "bemerkung", "kommentar", "comment", "remarks", "info", "status"] },
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]["key"];

// Guess which spreadsheet column belongs to which field, by header name.
export function guessMapping(headers: string[]): Partial<Record<ImportFieldKey, string>> {
  const result: Partial<Record<ImportFieldKey, string>> = {};
  const used = new Set<string>();
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  // exact-ish hints first (pzn, batch...), then the broad ones
  for (const field of IMPORT_FIELDS) {
    const match = headers.find((h) => !used.has(h) && field.hints.some((hint) => norm(h) === hint));
    if (match) {
      result[field.key] = match;
      used.add(match);
    }
  }
  for (const field of IMPORT_FIELDS) {
    if (result[field.key]) continue;
    const match = headers.find((h) => !used.has(h) && field.hints.some((hint) => norm(h).includes(hint)));
    if (match) {
      result[field.key] = match;
      used.add(match);
    }
  }
  return result;
}

const ON_REQUEST = /request|anfrage|tbc|to be confirmed|tba|n\/a|on demand|bestätigen|bestaetigen|\?/i;

// "12,50" -> 12.5 · "upon request" -> on request · anything else unreadable -> flagged
export function parsePrice(input: unknown): { value: number | null; unreadable: boolean } {
  const text = parseText(input);
  if (text === null) return { value: null, unreadable: false };
  const n = parseNumber(input);
  if (n !== null && n >= 0) return { value: Math.round(n * 100) / 100, unreadable: false };
  return { value: null, unreadable: !ON_REQUEST.test(text) };
}

// 1000 -> qty 1000 · "min. 500" -> MOQ 500, quantity on request · "Qty to be confirmed" -> on request
export function parseQuantity(input: unknown): { qty: number | null; moq: number | null; unreadable: boolean } {
  const text = parseText(input);
  if (text === null) return { qty: null, moq: null, unreadable: false };
  const min = text.match(/^(?:min(?:imum)?\.?|mind(?:estens)?\.?|ab|from|>=?)\s*([\d.,]+)/i);
  if (min) return { qty: null, moq: parseNumber(min[1]), unreadable: false };
  const n = parseNumber(input);
  if (n !== null && n >= 0) return { qty: Math.round(n), moq: null, unreadable: false };
  return { qty: null, moq: null, unreadable: !ON_REQUEST.test(text) };
}

// "yes", "ja", "x", "✓", 1 -> true · "no", "nein", "-", 0 -> false · empty / unclear -> null
export function parseYesNo(input: unknown): boolean | null {
  if (typeof input === "boolean") return input;
  const s = parseText(input)?.toLowerCase();
  if (!s) return null;
  if (/^(yes|y|ja|j|x|✓|✔|true|1|available|vorhanden|verfügbar|verfuegbar|ok)$/.test(s)) return true;
  if (/^(no|n|nein|-|–|false|0|not available|nicht verfügbar|nicht vorhanden|keins?)$/.test(s)) return false;
  return null;
}
