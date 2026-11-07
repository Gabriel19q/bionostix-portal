// Quick checks for the spreadsheet parsing helpers: npx tsx scripts/test-parse.mjs
import assert from "node:assert/strict";
import { parseNumber, parseDate, parsePzn, guessMapping } from "../src/lib/parse.ts";

const n = [["12,50", 12.5], ["1.234,56", 1234.56], ["1,234.56", 1234.56], ["12.5", 12.5], ["€ 12,50", 12.5],
  [12.5, 12.5], ["1.234", 1234], ["", null], ["abc", null], ["7", 7], ["0,99 EUR", 0.99]];
for (const [input, want] of n) assert.equal(parseNumber(input), want, `parseNumber(${input})`);

const d = [["31.12.2027", "2027-12-31"], ["2027-12-31", "2027-12-31"], ["12/2027", "2027-12-31"], ["02.2028", "2028-02-29"],
  ["2027-06", "2027-06-30"], [46387, "2026-12-31"], ["31.02.2027", null], ["1.3.27", "2027-03-01"], ["", null], ["soon", null]];
for (const [input, want] of d) assert.equal(parseDate(input), want, `parseDate(${input})`);

assert.equal(parsePzn("1234567"), "01234567");
assert.equal(parsePzn(368697), "00368697");
assert.equal(parsePzn("0252428"), "00252428");
assert.equal(parsePzn("PZN 12345678"), "12345678");
assert.equal(parsePzn(""), null);

const map = guessMapping(["Artikelbezeichnung", "PZN", "Ch.-B.", "Verfall", "Menge", "EK netto", "Wirkstoff", "Stärke", "Packungsgröße"]);
assert.deepEqual(map, {
  trade_name: "Artikelbezeichnung", pzn: "PZN", batch: "Ch.-B.", expiry_date: "Verfall", available_qty: "Menge",
  purchase_price: "EK netto", active_ingredient: "Wirkstoff", strength: "Stärke", pack_size: "Packungsgröße",
});
const mapEn = guessMapping(["Product", "Batch", "Expiry", "Qty", "Unit price", "MOQ"]);
assert.equal(mapEn.trade_name, "Product");
assert.equal(mapEn.purchase_price, "Unit price");
assert.equal(mapEn.moq, "MOQ");

console.log("parse tests passed");

// Product name parsing (examples from a real manufacturer list)
const { parseProductName } = await import("../src/lib/product-name.ts");
const cases = [
  ["Anastrozole film-coated tablets 1 mg, 100 tablets", "Accord", ["Anastrozole", "1 mg", "film-coated tablets", "100 tablets"]],
  ["Carboplatin 10 mg/ml 450 mg Inf.-Lsg.-Konz.", "Accord", ["Carboplatin", "10 mg/ml", "concentrate for solution for infusion", "450 mg"]],
  ["Hetronifly® (Serplulimab) 10 mg/100 ml Infusionslsg.-Konz.", "Accord", ["Serplulimab", "10 mg/100 ml", "concentrate for solution for infusion", null]],
  ["Fluorouracil Accord 50 mg/ml, 1000 mg/20 ml", "Accord", ["Fluorouracil", "50 mg/ml", null, "1000 mg/20 ml"]],
  ["Exemestan 25MG, 100 tablets", "Accord", ["Exemestan", "25 mg", "tablets", "100 tablets"]],
  ["Glycopyrronium Bromide, 5x1ML", "Accord", ["Glycopyrronium Bromide", null, null, "5 x 1 ml"]],
  ["Irinotecan Bendalis 20 mg/ml 100 mg Inf.-Lsg.-Konz.", "Bendalis", ["Irinotecan", "20 mg/ml", "concentrate for solution for infusion", "100 mg"]],
];
for (const [name, maker, [ing, str, form, pack]] of cases) {
  const p = parseProductName(name, maker);
  assert.deepEqual([p.active_ingredient, p.strength, p.dosage_form, p.pack_size], [ing, str, form, pack], name);
}
console.log("product name tests passed");

const { parsePrice, parseQuantity } = await import("../src/lib/parse.ts");
assert.deepEqual(parsePrice("upon request"), { value: null, unreadable: false });
assert.deepEqual(parsePrice(12.8), { value: 12.8, unreadable: false });
assert.deepEqual(parsePrice("3,99 €"), { value: 3.99, unreadable: false });
assert.deepEqual(parsePrice("cheap"), { value: null, unreadable: true });
assert.deepEqual(parseQuantity("min. 500"), { qty: null, moq: 500, unreadable: false });
assert.deepEqual(parseQuantity("Qty to be confirmed"), { qty: null, moq: null, unreadable: false });
assert.deepEqual(parseQuantity(16420), { qty: 16420, moq: null, unreadable: false });
assert.deepEqual(parseQuantity("1.000"), { qty: 1000, moq: null, unreadable: false });
assert.deepEqual(parseQuantity(null), { qty: null, moq: null, unreadable: false });

const listMap = guessMapping(["PZN", "Product", "Manufacturer", "EK", "HAP/APU", "Quantity", "Shelf Life", "Column 8"]);
assert.deepEqual(listMap, { pzn: "PZN", trade_name: "Product", manufacturer: "Manufacturer", purchase_price: "EK",
  available_qty: "Quantity", expiry_date: "Shelf Life" });
console.log("price/quantity/mapping tests passed");

const { parseYesNo } = await import("../src/lib/parse.ts");
assert.equal(parseYesNo("Ja"), true);
assert.equal(parseYesNo("x"), true);
assert.equal(parseYesNo("no"), false);
assert.equal(parseYesNo("-"), false);
assert.equal(parseYesNo(""), null);
assert.equal(parseYesNo("on request"), null);
assert.equal(guessMapping(["Product", "COA"]).coa_available, "COA");
console.log("COA parsing tests passed");
