// Checks for the seller upload: column matching, mask rows and validation. npx tsx scripts/test-listing.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { toSheet } from "../src/lib/sheet.ts";
import {
  guessListingMapping, rowsToDrafts, validateDraft, draftToPayload, parseCountryRule, parseExpiry, listingToDraft,
} from "../src/lib/listing.ts";

const ALL = ["pharma", "ivd", "supplements", "health"];
const future = "2099-12-31";

// Our own template: every example row maps without errors
const wb = XLSX.read(readFileSync("public/templates/Bionostix-Offer-Upload-Template.xlsx"), { type: "buffer" });
const grid = XLSX.utils.sheet_to_json(wb.Sheets["Upload template"], { header: 1, raw: true, defval: null });
const t = toSheet(grid);
t.rows = t.rows.filter((r) => String(r[0] ?? "") !== "Choose from list");
const tm = guessListingMapping(t.headers);
assert.equal(tm.category, "Category *");
assert.equal(tm.product_name, "Product name *");
assert.equal(tm.active_ingredients, "Active ingredients with strength (*)");
const td = rowsToDrafts(t.headers, t.rows, tm, "");
assert.deepEqual(td.map((d) => d.category), ["pharma", "ivd", "supplements", "health"]);
for (const d of td) {
  d.values.valid_until = future; // template dates may lie in the past by now
  assert.deepEqual(validateDraft(d, ALL), {}, `template row ${d.values.product_name}`);
}
assert.equal(td[2].values.active_ingredients, "Vitamin C 1000 mg; Zinc 10 mg");

// A messy German list: matched columns, missing fields flagged
const messy = toSheet([
  ["Artikelbezeichnung", "Marke", "Wirkstoff", "Darreichungsform", "Packungsgröße", "Einheit", "Menge", "Preis", "MHD", "Lager"],
  ["Ibuprofen 400", "IbuEx", "Ibuprofen 400 mg", "Filmtabletten", 20, "Stk", 5000, "1,35", "12/2027", "Hamburg"],
  ["Vitamin C", "VitaX", "Vitamin C", "Brausetabletten", 20, "tablets", 100, "abc", "min 24 Monate", "Hamburg"],
]);
const mm = guessListingMapping(messy.headers);
assert.equal(mm.product_name, "Artikelbezeichnung");
assert.equal(mm.quantity, "Menge");
assert.equal(mm.expiry, "MHD");
assert.equal(mm.incoterm_place, "Lager");
const md = rowsToDrafts(messy.headers, messy.rows, mm, "pharma");
assert.equal(md[0].values.dosage_form, "Tablet");
assert.equal(md[0].values.unit, "pieces");
assert.equal(md[1].values.dosage_form, "Effervescent tablet");
const e0 = validateDraft(md[0], ["pharma"]);
assert.deepEqual(Object.keys(e0).sort(), ["incoterm", "packaging_language", "valid_until"]);
const e1 = validateDraft(md[1], ["pharma"]);
assert.ok(e1.price && e1.active_ingredients, "invalid price and ingredient without amount are flagged");
assert.equal(validateDraft(md[0], ["ivd"]).category, "Category not approved for you");

// Country rules and expiry
assert.deepEqual(parseCountryRule("DE, AT").rule, { mode: "only", countries: ["Germany", "Austria"] });
assert.deepEqual(parseCountryRule("all except RU, BY").rule, { mode: "except", countries: ["Russia", "Belarus"] });
assert.deepEqual(parseCountryRule("").rule, { mode: "all", countries: [] });
assert.deepEqual(parseCountryRule("DE, Atlantis").unknown, ["Atlantis"]);
assert.deepEqual(parseExpiry("min 24 months"), { date: null, months: 24, ok: true });
assert.equal(parseExpiry("05/2030").date, "2030-05-31");

// Payload and round trip
Object.assign(md[0].values, { incoterm: "EXW", packaging_language: "German", valid_until: future, ship: "all except RU" });
md[0].country_prices = [{ country: "IQ", price: "1,10" }];
assert.deepEqual(validateDraft(md[0], ["pharma"]), {});
const p = draftToPayload(md[0]);
assert.equal(p.price, 1.35);
assert.equal(p.expiry_date, "2027-12-31");
assert.deepEqual([p.ship_mode, p.ship_countries], ["except", ["Russia"]]);
assert.deepEqual(p.country_prices, [{ country: "Iraq", price: 1.1 }]);
assert.equal(p.test_parameter, null, "fields of other categories are not sent");
const back = listingToDraft({ ...p, id: "x", country_prices: [{ country: "Iraq", price: 1.1 }] });
assert.equal(back.values.ship, "all except Russia");
assert.deepEqual(validateDraft(back, ["pharma"]), {});

console.log("listing upload tests passed");
