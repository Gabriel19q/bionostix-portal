// Free, built-in translation of German product names and ingredients into English (no external service).
// Sellers upload their lists as they are; the portal shows English names and keeps the original as "name on pack".
// Unknown words stay unchanged. Extend the word lists when a gap shows up.

// Longer phrases first: they are applied in this order
const PHRASES: [RegExp, string][] = [
  [/\bmagensaftresistente?n?\s+tabletten\b/gi, "gastro-resistant tablets"],
  [/\bmagensaftresistente?n?\s+hartkapseln\b/gi, "gastro-resistant hard capsules"],
  [/\bretardtabletten\b/gi, "prolonged-release tablets"],
  [/\bretardkapseln\b/gi, "prolonged-release capsules"],
  [/\bfilmtabletten\b/gi, "film-coated tablets"],
  [/\bfilmtbl\.?/gi, "film-coated tablets"],
  [/\bbrausetabletten\b/gi, "effervescent tablets"],
  [/\bbrausepulver\b/gi, "effervescent powder"],
  [/\blutschtabletten\b/gi, "lozenges"],
  [/\bkautabletten\b/gi, "chewable tablets"],
  [/\bschmelztabletten\b/gi, "orodispersible tablets"],
  [/\bweichkapseln\b/gi, "soft capsules"],
  [/\bhartkapseln\b/gi, "hard capsules"],
  [/\binjektionsl(?:ö|oe)sung\b/gi, "solution for injection"],
  [/\binj\.?-?\s*l(?:sg|ösung)\.?/gi, "solution for injection"],
  [/\binfusionsl(?:ö|oe)sungskonzentrat\b/gi, "concentrate for solution for infusion"],
  [/\binfusionsl(?:ö|oe)sung\b/gi, "solution for infusion"],
  [/\binf\.?-?\s*l(?:sg|ösung)\.?-?\s*konz\.?/gi, "concentrate for solution for infusion"],
  [/\bpulver zur herstellung einer injektionsl(?:ö|oe)sung\b/gi, "powder for solution for injection"],
  [/\bl(?:ö|oe)sung zum einnehmen\b/gi, "oral solution"],
  [/\bsuspension zum einnehmen\b/gi, "oral suspension"],
  [/\btropfen zum einnehmen\b/gi, "oral drops"],
  [/\bzum einnehmen\b/gi, "oral"],
  [/\baugentropfen\b/gi, "eye drops"],
  [/\bnasenspray\b/gi, "nasal spray"],
  [/\bmundspray\b/gi, "oral spray"],
  [/\bfertigspritzen?\b/gi, "pre-filled syringe"],
  [/\bfertigpens?\b/gi, "pre-filled pen"],
  [/\bdurchstechflaschen?\b/gi, "vial"],
  [/\beinmalhandschuhe\b/gi, "disposable gloves"],
  [/\buntersuchungshandschuhe\b/gi, "examination gloves"],
  [/\bop-handschuhe\b/gi, "surgical gloves"],
  [/\bmund-nasen-schutz\b/gi, "face mask"],
  [/\bschnelltests?\b/gi, "rapid test"],
  [/\bteststreifen\b/gi, "test strips"],
  [/\bnahrungserg(?:ä|ae)nzungsmittel\b/gi, "food supplement"],
];

const WORDS: Record<string, string> = {
  tabletten: "tablets", tablette: "tablet", tbl: "tablets", kapseln: "capsules", kapsel: "capsule", kps: "capsules",
  pulver: "powder", granulat: "granules", tropfen: "drops", saft: "syrup", sirup: "syrup", salbe: "ointment",
  creme: "cream", gel: "gel", zäpfchen: "suppositories", zaepfchen: "suppositories", pflaster: "patches",
  ampullen: "ampoules", ampulle: "ampoule", amp: "ampoules", beutel: "sachets", dose: "tin", flasche: "bottle",
  lösung: "solution", loesung: "solution", konzentrat: "concentrate", suspension: "suspension", emulsion: "emulsion",
  stück: "pieces", stueck: "pieces", stk: "pieces", st: "pieces", packung: "pack", packungen: "packs", karton: "carton",
  handschuhe: "gloves", puderfrei: "powder-free", gepudert: "powdered", steril: "sterile", unsteril: "non-sterile",
  größe: "size", groesse: "size", verbandmull: "gauze", mullbinden: "gauze bandages", binden: "bandages",
  kompressen: "compresses", wundauflage: "wound dressing", verband: "dressing", spritzen: "syringes", spritze: "syringe",
  kanülen: "needles", kanuelen: "needles", kanüle: "needle", masken: "masks", maske: "mask", kittel: "gowns",
  desinfektionsmittel: "disinfectant", händedesinfektion: "hand disinfectant",
  mit: "with", und: "and", ohne: "without", für: "for", fuer: "for", kinder: "children", erwachsene: "adults",
  nitril: "nitrile", latex: "latex", vinyl: "vinyl", zuckerfrei: "sugar-free", laktosefrei: "lactose-free", vegan: "vegan",
};

// Active ingredients: exceptions first, then regular German -> English endings (INN names)
const INGREDIENTS: Record<string, string> = {
  coffein: "Caffeine", koffein: "Caffeine", zink: "Zinc", eisen: "Iron", kalzium: "Calcium", kalium: "Potassium",
  natrium: "Sodium", jod: "Iodine", jodid: "Iodide", selen: "Selenium", kupfer: "Copper", mangan: "Manganese",
  folsäure: "Folic acid", folsaeure: "Folic acid", acetylsalicylsäure: "Acetylsalicylic acid", ass: "Acetylsalicylic acid",
  metamizol: "Metamizole", metamizol_natrium: "Metamizole sodium", diclofenac_natrium: "Diclofenac sodium",
  omeprazol: "Omeprazole", pantoprazol: "Pantoprazole", esomeprazol: "Esomeprazole", lansoprazol: "Lansoprazole",
  metronidazol: "Metronidazole", fluconazol: "Fluconazole", clotrimazol: "Clotrimazole", ketoconazol: "Ketoconazole",
  allopurinol: "Allopurinol", metoclopramid: "Metoclopramide", furosemid: "Furosemide", tamoxifen: "Tamoxifen",
  ciclosporin: "Ciclosporin", cyclophosphamid: "Cyclophosphamide", ifosfamid: "Ifosfamide", ondansetron: "Ondansetron",
  levothyroxin: "Levothyroxine", levothyroxin_natrium: "Levothyroxine sodium", glucose: "Glucose", traubenzucker: "Glucose",
  vitamin: "Vitamin", nachtkerzenöl: "Evening primrose oil", fischöl: "Fish oil", fischoel: "Fish oil",
  magnesiumcitrat: "Magnesium citrate", calciumcarbonat: "Calcium carbonate",
  // salt and hydrate parts of compound names ("Metformin-Hydrochlorid")
  hydrochlorid: "Hydrochloride", hydrobromid: "Hydrobromide", sulfat: "Sulfate", phosphat: "Phosphate", citrat: "Citrate",
  acetat: "Acetate", maleat: "Maleate", mesilat: "Mesilate", besilat: "Besilate", chlorid: "Chloride", tartrat: "Tartrate",
  fumarat: "Fumarate", succinat: "Succinate", monohydrat: "Monohydrate", dihydrat: "Dihydrate", trihydrat: "Trihydrate",
};

const ENDINGS: [RegExp, string][] = [
  [/säure$/i, " acid"], [/saeure$/i, " acid"],
  [/hydrochlorid$/i, " hydrochloride"], [/hydrobromid$/i, " hydrobromide"],
  [/natrium$/i, " sodium"], [/kalium$/i, " potassium"], [/calcium$/i, " calcium"], [/magnesium$/i, " magnesium"],
  [/chlorid$/i, "chloride"], [/bromid$/i, "bromide"], [/iodid$/i, "iodide"], [/oxid$/i, "oxide"],
  [/sulfat$/i, "sulfate"], [/phosphat$/i, "phosphate"], [/citrat$/i, "citrate"], [/acetat$/i, "acetate"],
  [/maleat$/i, "maleate"], [/fumarat$/i, "fumarate"], [/tartrat$/i, "tartrate"], [/succinat$/i, "succinate"],
  [/mesilat$/i, "mesilate"], [/besilat$/i, "besilate"], [/carbonat$/i, "carbonate"], [/gluconat$/i, "gluconate"],
  [/lactat$/i, "lactate"], [/nitrat$/i, "nitrate"], [/dipropionat$/i, "dipropionate"], [/valerat$/i, "valerate"],
  [/azol$/i, "azole"], [/prazol$/i, "prazole"], [/amid$/i, "amide"], [/imid$/i, "imide"], [/olol$/i, "olol"],
];

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// One ingredient name: "Diclofenac-Natrium" -> "Diclofenac sodium", "Ascorbinsäure" -> "Ascorbic acid"
export function translateIngredient(name: string): string {
  const trimmed = name.trim();
  const key = trimmed.toLowerCase().replace(/[\s-]+/g, "_");
  if (INGREDIENTS[key]) return INGREDIENTS[key];
  if (/^ascorbinsäure$|^ascorbinsaeure$/i.test(trimmed)) return "Ascorbic acid";
  // Compound names with a hyphen: translate each part ("Metformin-Hydrochlorid")
  if (/[-\s]/.test(trimmed)) {
    return capitalise(trimmed.split(/[-\s]+/).map((part, i) => {
      const t = translateIngredient(part);
      return i === 0 ? t : t.toLowerCase();
    }).join(" ").replace(/\s+/g, " "));
  }
  for (const [re, rep] of ENDINGS) {
    if (re.test(trimmed)) {
      const base = trimmed.replace(re, "");
      if (!base) break;
      // German "-in" bases stay ("Ascorbin" -> "Ascorbic" only via the exception above)
      return capitalise(`${base}${rep}`.replace(/\s+/g, " ").trim());
    }
  }
  return trimmed;
}

// "Vitamin C 1000 mg; Zink 10 mg" -> "Vitamin C 1000 mg; Zinc 10 mg"
export function translateIngredientsText(text: string): string {
  return text.split(";").map((part) => {
    const m = part.trim().match(/^(.+?)(\s+(?:\d+(?:[.,]\d+)?|\?)\s*\S.*)?$/);
    if (!m) return part.trim();
    return `${translateIngredient(m[1])}${m[2] ?? ""}`;
  }).join("; ");
}

// Product name: German dosage-form and packaging words -> English; brand names stay
export function translateProductName(name: string): string {
  let out = name;
  for (const [re, rep] of PHRASES) out = out.replace(re, rep);
  out = out.replace(/[A-Za-zÄÖÜäöüß]+\.?/g, (word) => {
    const bare = word.replace(/\.$/, "");
    const hit = WORDS[bare.toLowerCase()];
    return hit ?? word;
  });
  // Ingredient-like words with typical German endings ("Ibuprofen-Natrium", "Metamizol")
  out = out.replace(/\b[A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ]?[a-zäöüß]+)?\b/g, (word) => {
    const t = translateIngredient(word);
    return t !== word && /(acid|sodium|potassium|ide|ate|azole|prazole|amide|Caffeine|Zinc|Iron|Iodine|Selenium)/i.test(t) ? t : word;
  });
  out = out.replace(/\s+/g, " ").replace(/\s+,/g, ",").trim();
  return /^[A-ZÄÖÜ]/.test(name.trim()) ? capitalise(out) : out;
}

// True when the name probably is German (worth showing the original as "name on pack")
export function looksGerman(name: string): boolean {
  return translateProductName(name) !== name.trim();
}
