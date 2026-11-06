// Tests the stock-list import logic against a small in-memory stand-in for the database.
// Run: npx tsx --conditions=react-server scripts/test-import.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { processImport } from "../src/lib/import.ts";

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

const base = { manufacturer: "Accord Healthcare", stockAsOf: "2026-11-06", incoterm: "EXW", defaultMoq: 1, isRx: true, hideMissing: false };
const tables = { manufacturers: [], products: [], offers: [] };
const db = mockSupabase(tables);

const list1 = [
  { trade_name: "Capecitabin Accord", strength: "500 mg", pack_size: "120 tablets", pzn: "1234567", batch: "B1", expiry_date: "12/2027", available_qty: "300", purchase_price: "45,90" },
  { trade_name: "Capecitabin Accord", strength: "500 mg", pack_size: "120 tablets", pzn: "1234567", batch: "B2", expiry_date: 46387, available_qty: 80, purchase_price: 44.5 },
  { trade_name: "Letrozol Accord", strength: "2.5 mg", pack_size: "30 tablets", batch: "L9", expiry_date: "31.03.2028", available_qty: "1.200", purchase_price: "3,10", moq: "50" },
  { trade_name: "Broken", batch: "", expiry_date: "soon", available_qty: "", purchase_price: "x" },
  { trade_name: "Letrozol Accord", strength: "2.5 mg", pack_size: "30 tablets", batch: "L9", expiry_date: "31.03.2028", available_qty: 5, purchase_price: 3 },
];

// Dry run writes nothing
const dry = await processImport(db, { ...base, rows: list1 }, true);
assert.equal(dry.manufacturerIsNew, true);
assert.deepEqual(dry.counts, { new_product: 2, new_batch: 1, update: 0, unchanged: 0, error: 2, hidden: 0 });
assert.equal(tables.offers.length, 0, "dry run must not write");
assert.equal(tables.manufacturers.length, 0, "dry run must not create manufacturer");
assert.match(dry.rows[3].message, /batch missing/);
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
assert.equal(second.manufacturerIsNew, false, "manufacturer matched case-insensitively");
assert.deepEqual(second.counts, { new_product: 0, new_batch: 1, update: 1, unchanged: 1, error: 0, hidden: 1 });
assert.match(second.rows[0].message, /qty 300 → 250/);
assert.equal(tables.offers.find((o) => o.batch === "B2").is_active, false, "sold-out batch hidden");
assert.equal(tables.products.length, 2, "no duplicate products");

console.log("import tests passed");
