// Extracts active ingredient, strength, dosage form and pack size from a product name such as
// "Anastrozole film-coated tablets 1 mg, 100 tablets" or "Carboplatin 10 mg/ml 450 mg Inf.-Lsg.-Konz.".
// Heuristic: results are suggestions shown in the import preview, never overwrite values from real columns.

export type ParsedName = {
  active_ingredient: string | null;
  strength: string | null;
  dosage_form: string | null;
  pack_size: string | null;
};

const UNIT = "(?:mg|g|µg|mcg|ug|ml|l|ie|i\\.e\\.|iu|e|mmol|%)";
const NUM = "\\d+(?:[.,]\\d+)?";
// "10 mg/ml", "50 mg/100 ml", "1 mg", "25MG", "100 E/ml"
const DOSE_RE = new RegExp(`(${NUM})\\s*(${UNIT})(?:\\s*/\\s*(${NUM})?\\s*(${UNIT}))?(?![a-z])`, "gi");

// Pack counts: "100 tablets", "20 Tabletten", "5x1ML", "5 x 3 ml", "N3"
const PACK_RE = new RegExp(
  `(\\d+\\s*x\\s*${NUM}\\s*${UNIT})|(\\d+)\\s*(film-?coated tablets|filmtabletten|tablets|tabletten|tabl\\.?|capsules|kapseln|kps\\.?|ampoules|ampullen|amp\\.?|vials|durchstechflaschen|sachets|beutel|st(?:ück|k)?\\.?|pcs|pens?|fertigspritzen|pre-?filled syringes)(?![a-z])|\\b(N[123])\\b`,
  "i",
);

const FORMS: [RegExp, string][] = [
  [/inf(?:usions?)?\.?-?\s*lsg\.?-?\s*konz|infusionslsg\.?-?konz|concentrate for solution for infusion|infusion concentrate/i, "concentrate for solution for infusion"],
  [/inf(?:usions)?\.?-?\s*lsg|infusionsl(?:ö|oe)sung|solution for infusion/i, "solution for infusion"],
  [/inj(?:ektions)?\.?-?\s*lsg|injektionsl(?:ö|oe)sung|solution for injection/i, "solution for injection"],
  [/pulver|powder/i, "powder"],
  [/film-?coated tablets|filmtabletten|filmtabl/i, "film-coated tablets"],
  [/retardtabletten|prolonged-release tablets/i, "prolonged-release tablets"],
  [/tablets|tabletten|tabl\b/i, "tablets"],
  [/hartkapseln|capsules|kapseln/i, "capsules"],
  [/fertigspritze|pre-?filled syringe/i, "pre-filled syringe"],
  [/\bpen\b/i, "pen"],
  [/creme|cream/i, "cream"],
  [/salbe|ointment/i, "ointment"],
  [/tropfen|drops/i, "drops"],
  [/sirup|syrup/i, "syrup"],
];

// Words that end the ingredient part of a name
const STOP_WORDS = /^(film-?coated|tablets?|tabletten|filmtabletten|capsules?|kapseln|hartkapseln|inf\.?|infusion\w*|inj\.?|injektion\w*|injection|solution|lsg\.?|konz\.?|concentrate|pulver|powder|retard\w*|creme|cream|salbe|tropfen|drops|sirup|pen|fertigspritze|ampoules?|ampullen|und|and|zur|for|-)$/i;

function clean(s: string) {
  return s.replace(/\s+/g, " ").replace(/^[\s,;–-]+|[\s,;–-]+$/g, "").trim();
}

function normUnit(u: string) {
  const low = u.toLowerCase();
  if (low === "i.e." || low === "ie") return "IE";
  if (low === "iu") return "IU";
  if (low === "e") return "E";
  if (low === "ug" || low === "mcg") return "µg";
  return low;
}

function formatDose(m: RegExpExecArray) {
  const [, n1, u1, n2, u2] = m;
  let s = `${n1.replace(",", ".")} ${normUnit(u1)}`;
  if (u2) s += `/${n2 ? `${n2.replace(",", ".")} ` : ""}${normUnit(u2)}`;
  return s;
}

export function parseProductName(name: string, manufacturer?: string | null): ParsedName {
  const original = name.replace(/[®™]/g, "").trim();

  // Dose expressions in order of appearance
  const doses: { text: string; index: number; end: number }[] = [];
  for (const m of original.matchAll(DOSE_RE)) {
    doses.push({ text: formatDose(m as RegExpExecArray), index: m.index!, end: m.index! + m[0].length });
  }

  // Pack size: explicit count first; otherwise for "x mg/ml, 300 mg/15 ml" the second dose is the content
  let pack_size: string | null = null;
  const pack = original.match(PACK_RE);
  if (pack) {
    if (pack[1]) {
      const m = pack[1].match(new RegExp(`(\\d+)\\s*x\\s*(${NUM})\\s*(${UNIT})`, "i"));
      pack_size = m ? `${m[1]} x ${m[2].replace(",", ".")} ${normUnit(m[3])}` : pack[1];
    }
    else if (pack[2]) pack_size = `${pack[2]} ${pack[3].toLowerCase().replace(/\.$/, "")}`;
    else if (pack[4]) pack_size = pack[4].toUpperCase();
  }
  const packStart = pack?.index ?? -1;
  const strengthDoses = doses.filter((d) => packStart < 0 || d.index < packStart || d.index >= packStart + (pack?.[0].length ?? 0));
  // A dose that is part of the pack expression ("5x1ML") is not a strength
  const strength = strengthDoses[0]?.text ?? null;
  if (!pack_size && strengthDoses.length > 1 && /\/\s*ml$/i.test(strengthDoses[0].text)) {
    pack_size = strengthDoses.slice(1).map((d) => d.text).join(", ");
  }

  let dosage_form: string | null = null;
  for (const [re, label] of FORMS) {
    if (re.test(original)) {
      dosage_form = label;
      break;
    }
  }

  // Ingredient: a name in brackets wins ("Hetronifly (Serplulimab)"), otherwise the words before
  // the first number or dosage-form word, without the manufacturer's name
  let active_ingredient: string | null = null;
  const bracket = original.match(/\(([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\s-]{2,})\)/);
  if (bracket) {
    active_ingredient = clean(bracket[1]);
  } else {
    const firstDigit = original.search(/\d/);
    const head = firstDigit >= 0 ? original.slice(0, firstDigit) : original;
    const words: string[] = [];
    const maker = (manufacturer ?? "").toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    for (const raw of head.split(/[\s,]+/)) {
      const w = raw.trim();
      if (!w) continue;
      if (STOP_WORDS.test(w)) break;
      if (maker.some((mk) => w.toLowerCase().startsWith(mk))) continue;
      words.push(w);
    }
    active_ingredient = clean(words.join(" ")) || null;
  }
  if (active_ingredient) {
    // "anastrozole" -> "Anastrozole", keep existing capitalisation otherwise
    active_ingredient = active_ingredient.charAt(0).toUpperCase() + active_ingredient.slice(1);
  }

  return { active_ingredient, strength, dosage_form, pack_size };
}
