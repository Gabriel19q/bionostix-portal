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
