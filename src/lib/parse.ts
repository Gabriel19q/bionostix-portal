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

// PZN: keep digits only, pad to 8 (German PZNs are 8 digits; older 7-digit ones get a leading 0)
export function parsePzn(input: unknown): string | null {
  const s = parseText(input);
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  if (digits.length === 0) return null;
  return digits.length === 7 ? `0${digits}` : digits;
}

export const IMPORT_FIELDS = [
  { key: "trade_name", label: "Product name", required: true, hints: ["product", "name", "bezeichnung", "artikel", "handelsname", "präparat", "praeparat", "description", "artikelbezeichnung"] },
  { key: "batch", label: "Batch", required: true, hints: ["batch", "charge", "ch.-b", "ch-b", "chb", "lot", "chargen"] },
  { key: "expiry_date", label: "Expiry date", required: true, hints: ["expiry", "exp", "verfall", "mhd", "haltbar", "verwendbar", "ablauf"] },
  { key: "available_qty", label: "Available quantity", required: true, hints: ["qty", "quantity", "menge", "stock", "bestand", "stück", "stueck", "packungen", "anzahl", "verfügbar", "verfuegbar"] },
  { key: "purchase_price", label: "Purchase price (EUR)", required: true, hints: ["price", "preis", "ek", "einkauf", "apu", "netto", "unit price", "cost"] },
  { key: "pzn", label: "PZN", required: false, hints: ["pzn"] },
  { key: "active_ingredient", label: "Active ingredient", required: false, hints: ["wirkstoff", "ingredient", "inn", "substance"] },
  { key: "strength", label: "Strength", required: false, hints: ["strength", "stärke", "staerke", "dosis", "dosage"] },
  { key: "dosage_form", label: "Dosage form", required: false, hints: ["form", "darreichung", "dosage form"] },
  { key: "pack_size", label: "Pack size", required: false, hints: ["pack", "packung", "packungsgröße", "packungsgroesse", "größe", "inhalt", "n1", "n2", "n3"] },
  { key: "moq", label: "Minimum order quantity", required: false, hints: ["moq", "mindest", "minimum"] },
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
