// Tests the stock-list import logic against a small in-memory stand-in for the database.
// Run: npx tsx --conditions=react-server scripts/test-import.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { processImport } from "../src/lib/import.ts";
import { deleteOffers } from "../src/lib/catalog.ts";

function mockSupabase(tables) {
  return {
    from(name) {
      const rows = (tables[name] ??= []);
      const filters = [];
      let op = "select", payload = null, single = false, maybe = false, limitN = null;
      const unescape = (s) => s.replace(/\\(.)/g, "$1").toLowerCase();
      const q = {
        select() { if (op === "select") op = "select"; return q; },
        insert(v) { op = "insert"; payload = v; return q; },
        update(v) { op = "update"; payload = v; return q; },
        delete() { op = "delete"; return q; },
        eq(c, v) { filters.push((r) => r[c] === v); return q; },
        ilike(c, v) { filters.push((r) => (r[c] ?? "").toLowerCase() === unescape(v)); return q; },
        is(c) { filters.push((r) => r[c] === null || r[c] === undefined); return q; },
        in(c, vs) { filters.push((r) => vs.includes(r[c])); return q; },
        limit(n) { limitN = n; return q; },
        single() { single = true; return run(); },
        maybeSingle() { maybe = true; return run(); },
        then(res, rej) { return run().then(res, rej); },
      };
      function run() {
        const match = rows.filter((r) => filters.every((f) => f(r)));
        if (op === "insert") {
          const list = (Array.isArray(payload) ? payload : [payload]).map((v) => ({ id: randomUUID(), ...v }));
          for (const r of list) {
            if (name === "offers" && rows.some((x) => x.product_id === r.product_id && x.batch === r.batch)) {
              return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate" } });
            }
            rows.push(r);
          }
          return Promise.resolve({ data: single ? list[0] : list, error: null });
        }
        if (op === "delete") {
          for (const r of match) rows.splice(rows.indexOf(r), 1);
          return Promise.resolve({ data: match, error: null });
        }
        if (op === "update") {
          for (const r of match) Object.assign(r, payload);
          return Promise.resolve({ data: match, error: null });
        }
        const data = limitN ? match.slice(0, limitN) : match;
        if (single || maybe) return Promise.resolve({ data: data[0] ?? null, error: null });
        return Promise.resolve({ data, error: null });
      }
      return q;
    },
  };
}

const base = { manufacturer: "Accord Healthcare", stockAsOf: "2026-11-06", incoterm: "EXW", defaultMoq: 1, isRx: true, hideMissing: false, parseNames: false, coaDefault: "keep" };
const tables = { manufacturers: [], products: [], offers: [] };
const db = mockSupabase(tables);

const list1 = [
  { trade_name: "Capecitabin Accord", strength: "500 mg", pack_size: "120 tablets", pzn: "1234567", batch: "B1", expiry_date: "12/2027", available_qty: "300", purchase_price: "45,90" },
  { trade_name: "Capecitabin Accord", strength: "500 mg", pack_size: "120 tablets", pzn: "1234567", batch: "B2", expiry_date: 46387, available_qty: 80, purchase_price: 44.5 },
  { trade_name: "Letrozol Accord", strength: "2.5 mg", pack_size: "30 tablets", batch: "L9", expiry_date: "31.03.2028", available_qty: "1.200", purchase_price: "3,10", moq: "50" },
  { trade_name: "", batch: "X1", expiry_date: "soon", available_qty: "", purchase_price: "x" },
  { trade_name: "Letrozol Accord", strength: "2.5 mg", pack_size: "30 tablets", batch: "L9", expiry_date: "31.03.2028", available_qty: 5, purchase_price: 3 },
];

// Dry run writes nothing
const dry = await processImport(db, { ...base, rows: list1 }, true);
assert.deepEqual(dry.newManufacturers, ["Accord Healthcare"]);
assert.deepEqual(dry.counts, { new_product: 2, new_batch: 1, update: 0, unchanged: 0, error: 2, hidden: 0 });
assert.equal(tables.offers.length, 0, "dry run must not write");
assert.equal(tables.manufacturers.length, 0, "dry run must not create manufacturer");
assert.match(dry.rows[3].message, /product name missing/);
assert.match(dry.rows[4].message, /twice/);

// Real import
const real = await processImport(db, { ...base, rows: list1 }, false);
assert.deepEqual(real.counts, dry.counts, "preview and import agree");
assert.equal(tables.manufacturers.length, 1);
assert.equal(tables.products.length, 2);
assert.equal(tables.offers.length, 3);
const b1 = tables.offers.find((o) => o.batch === "B1");
assert.equal(b1.expiry_date, "2027-12-31");
assert.equal(b1.purchase_price, 45.9);
assert.equal(tables.products.find((p) => p.pzn)?.pzn, "01234567");
const l9 = tables.offers.find((o) => o.batch === "L9");
assert.equal(l9.available_qty, 1200);
assert.equal(l9.moq, 50);

// Second list a week later: B1 qty changed, B2 sold out, new batch B3
const list2 = [
  { trade_name: "capecitabin accord", pzn: "01234567", batch: "B1", expiry_date: "12/2027", available_qty: 250, purchase_price: "45,90" },
  { trade_name: "Capecitabin Accord", pzn: "1234567", batch: "B3", expiry_date: "06/2028", available_qty: 500, purchase_price: 46 },
  { trade_name: "Letrozol Accord", strength: "2.5 mg", pack_size: "30 tablets", batch: "L9", expiry_date: "31.03.2028", available_qty: "1.200", purchase_price: "3,10", moq: 50 },
];
const second = await processImport(db, { ...base, manufacturer: "accord healthcare", hideMissing: true, rows: list2 }, false);
assert.deepEqual(second.newManufacturers, [], "manufacturer matched case-insensitively");
assert.deepEqual(second.counts, { new_product: 0, new_batch: 1, update: 1, unchanged: 1, error: 0, hidden: 1 });
assert.match(second.rows[0].message, /qty 300 → 250/);
assert.equal(tables.offers.find((o) => o.batch === "B2").is_active, false, "sold-out batch hidden");
assert.equal(tables.products.length, 2, "no duplicate products");


// Real-world list: several manufacturers, no batches, "upon request", "min. 500", shelf life as Excel date
const XLSX = (await import("xlsx")).default ?? (await import("xlsx"));
const { readFileSync, existsSync } = await import("node:fs");
const file = new URL("./fixtures/preisuebersicht_hersteller.xlsx", import.meta.url);
if (existsSync(file)) {
  const wb = XLSX.read(readFileSync(file), { type: "buffer" });
  const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
  const cols = { pzn: 0, trade_name: 1, manufacturer: 2, purchase_price: 3, available_qty: 5, expiry_date: 6, note: 7 };
  const rows = grid.slice(1).filter((r) => r.some((c) => c !== null)).map((r) =>
    Object.fromEntries(Object.entries(cols).map(([k, i]) => [k, r[i] ?? null])));
  const t2 = { manufacturers: [], products: [], offers: [] };
  const db2 = mockSupabase(t2);
  const payload = { ...base, manufacturer: "", parseNames: true, rows };
  const prev = await processImport(db2, payload, true);
  assert.equal(prev.counts.error, 0, JSON.stringify(prev.rows.filter((r) => r.status === "error")));
  assert.deepEqual(prev.newManufacturers.sort(), ["Accord", "Bendalis"]);
  const res = await processImport(db2, payload, false);
  assert.equal(t2.manufacturers.length, 2);
  assert.equal(t2.offers.length, rows.length);
  const cis = t2.offers.find((o) => t2.products.find((p) => p.id === o.product_id).pzn === "00370955");
  assert.equal(cis.moq, 500, "min. 500 becomes the MOQ");
  assert.equal(cis.available_qty, null, "quantity on request");
  const pac = t2.products.find((p) => p.pzn === "02453421");
  assert.equal(t2.offers.find((o) => o.product_id === pac.id).purchase_price, null, "upon request → no price");
  const ana = t2.products.find((p) => p.pzn === "11156952");
  assert.deepEqual([ana.active_ingredient, ana.strength, ana.pack_size], ["Anastrozole", "1 mg", "100 tablets"]);
  assert.equal(t2.offers.find((o) => o.product_id === ana.id).expiry_date, "2028-05-31");
  assert.equal(t2.offers.find((o) => o.product_id === ana.id).internal_note, "?");
  // Importing the same list again changes nothing
  const again = await processImport(db2, payload, false);
  assert.equal(again.counts.unchanged, rows.length, JSON.stringify(again.rows.filter((r) => r.status !== "unchanged")));
  console.log(`real list: ${res.counts.new_product} products from ${prev.newManufacturers.length} manufacturers imported`);
}

// COA: from a column, or one value for the whole list
{
  const t3 = { manufacturers: [], products: [], offers: [] };
  const db3 = mockSupabase(t3);
  const rows = [
    { trade_name: "Alpha 10 mg", batch: "A1", coa_available: "ja" },
    { trade_name: "Beta 20 mg", batch: "B1", coa_available: "no" },
    { trade_name: "Gamma 5 mg", batch: "G1", coa_available: "" },
  ];
  await processImport(db3, { ...base, manufacturer: "X", rows }, false);
  assert.deepEqual(t3.offers.map((o) => o.coa_available), [true, false, null]);
  const again = await processImport(db3, { ...base, manufacturer: "X", coaDefault: "yes", rows: rows.map((r) => ({ trade_name: r.trade_name, batch: r.batch })) }, false);
  assert.equal(again.counts.update, 2, "Alpha already had a COA");
  assert.deepEqual(t3.offers.map((o) => o.coa_available), [true, true, true]);
  const keep = await processImport(db3, { ...base, manufacturer: "X", rows: rows.map((r) => ({ trade_name: r.trade_name, batch: r.batch })) }, false);
  assert.equal(keep.counts.unchanged, 3, "without COA column and default 'keep' nothing changes");
}

// Deleting: batches used in a request are hidden instead; products without batches are removed
{
  const t4 = { manufacturers: [], products: [{ id: "p1" }, { id: "p2" }], offers: [
    { id: "o1", product_id: "p1", is_active: true }, { id: "o2", product_id: "p1", is_active: true },
    { id: "o3", product_id: "p2", is_active: true }], request_items: [{ id: "ri", offer_id: "o2" }] };
  const res = await deleteOffers(mockSupabase(t4), ["o1", "o2", "o3"]);
  assert.deepEqual(res, { deleted: 2, hidden: 1 });
  assert.deepEqual(t4.offers.map((o) => [o.id, o.is_active]), [["o2", false]]);
  assert.deepEqual(t4.products.map((p) => p.id), ["p1"], "p2 had no batches left and was removed");
}

console.log("import tests passed");
