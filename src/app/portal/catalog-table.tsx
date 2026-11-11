"use client";

import { useMemo, useState } from "react";
import { displayDate, eur, monthsUntil } from "@/lib/format";
import { CartPanel, useCart } from "./cart";
import { downloadCatalogExcel } from "./export";
import { logExportAction } from "../activity-actions";

export type CatalogItem = {
  offer_id: string;
  product_id: string;
  trade_name: string;
  active_ingredient: string | null;
  strength: string | null;
  dosage_form: string | null;
  pack_size: string | null;
  pzn: string | null;
  manufacturer: string;
  is_rx: boolean;
  is_cold_chain: boolean;
  is_narcotic: boolean;
  batch: string;
  expiry_date: string | null;
  available_qty: number | null;
  moq: number;
  incoterm: string;
  stock_as_of: string;
  unit_price: number | null;
  coa_available: boolean | null;
};

const onRequest = <span className="text-slate-500">On request</span>;

type SortKey = "name" | "expiry" | "price";

export function CatalogTable({ items, canRequest, defaultCountry }: {
  items: CatalogItem[];
  canRequest: boolean;
  defaultCountry: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [includePrices, setIncludePrices] = useState(true);
  const [exporting, setExporting] = useState(false);
  const { cart, set, clear } = useCart(items);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [coaOnly, setCoaOnly] = useState(false);

  async function exportRows(list: CatalogItem[], mode: "all" | "view" | "selected") {
    if (list.length === 0) return;
    setExporting(true);
    try {
      await downloadCatalogExcel(list, { includePrices });
      logExportAction(list.length, mode, includePrices).catch(() => {});
    } finally {
      setExporting(false);
    }
  }

  const manufacturers = useMemo(() => [...new Set(items.map((i) => i.manufacturer))].sort(), [items]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = items.filter((i) => {
      if (manufacturer && i.manufacturer !== manufacturer) return false;
      if (coaOnly && i.coa_available !== true) return false;
      if (!needle) return true;
      return [i.trade_name, i.active_ingredient, i.strength, i.pzn, i.manufacturer]
        .some((v) => v?.toLowerCase().includes(needle));
    });
    return filtered.sort((a, b) => {
      const exp = (x: CatalogItem) => x.expiry_date ?? "9999";
      if (sort === "expiry") return exp(a).localeCompare(exp(b));
      if (sort === "price") return (a.unit_price ?? Infinity) - (b.unit_price ?? Infinity);
      return a.trade_name.localeCompare(b.trade_name) || exp(a).localeCompare(exp(b));
    });
  }, [items, q, manufacturer, sort, coaOnly]);

  if (items.length === 0) {
    return <div className="card text-sm text-slate-600">No products are available at the moment. Please check back soon.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-80">
          <label className="label" htmlFor="q">Search</label>
          <input id="q" className="input" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Product, active ingredient, PZN…" />
        </div>
        <div className="w-56">
          <label className="label" htmlFor="m">Manufacturer</label>
          <select id="m" className="input" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)}>
            <option value="">All</option>
            {manufacturers.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div className="w-44">
          <label className="label" htmlFor="s">Sort by</label>
          <select id="s" className="input" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="name">Product name</option>
            <option value="expiry">Expiry date</option>
            <option value="price">Price</option>
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={coaOnly} onChange={(e) => setCoaOnly(e.target.checked)} />
          With COA only
        </label>
        <p className="pb-2 text-sm text-slate-500">{rows.length} of {items.length} batches</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
        <span className="font-medium">Download Excel:</span>
        <button className="btn-secondary px-3 py-1" disabled={exporting} onClick={() => exportRows(items, "all")}>
          All products ({items.length})
        </button>
        {rows.length !== items.length && (
          <button className="btn-secondary px-3 py-1" disabled={exporting} onClick={() => exportRows(rows, "view")}>
            Current view ({rows.length})
          </button>
        )}
        <button className="btn-secondary px-3 py-1" disabled={exporting || selected.size === 0}
          onClick={() => exportRows(items.filter((i) => selected.has(i.offer_id)), "selected")}>
          Selected ({selected.size})
        </button>
        <label className="ml-2 flex items-center gap-2">
          <input type="checkbox" checked={includePrices} onChange={(e) => setIncludePrices(e.target.checked)} />
          Include prices
        </label>
        {selected.size > 0 && (
          <button className="ml-auto text-xs text-slate-500 underline" onClick={() => setSelected(new Set())}>Clear selection</button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="table-stack min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2.5 py-2">
                <input type="checkbox" aria-label="Select all shown"
                  checked={rows.length > 0 && rows.every((r) => selected.has(r.offer_id))}
                  onChange={(e) => {
                    const next = new Set(selected);
                    for (const r of rows) {
                      if (e.target.checked) next.add(r.offer_id);
                      else next.delete(r.offer_id);
                    }
                    setSelected(next);
                  }} />
              </th>
              <th className="px-2.5 py-2">Product</th>
              <th className="px-2.5 py-2">Manufacturer</th>
              <th className="px-2.5 py-2">Batch</th>
              <th className="px-2.5 py-2">Expiry</th>
              <th className="px-2.5 py-2 text-right">Available</th>
              <th className="px-2.5 py-2 text-right">MOQ</th>
              <th className="px-2.5 py-2 text-right">Price / pack</th>
              <th className="px-2.5 py-2" title="Certificate of analysis">COA</th>
              <th className="px-2.5 py-2">Terms</th>
              {canRequest && <th className="px-2.5 py-2">Request</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((i) => {
              const months = i.expiry_date ? monthsUntil(i.expiry_date) : null;
              return (
                <tr key={i.offer_id} className={selected.has(i.offer_id) ? "[&>td]:bg-slate-50" : ""}>
                  <td className="px-2.5 py-2" data-label="Select">
                    <input type="checkbox" aria-label={`Select ${i.trade_name}`} checked={selected.has(i.offer_id)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(i.offer_id);
                        else next.delete(i.offer_id);
                        setSelected(next);
                      }} />
                  </td>
                  <td className="px-2.5 py-2">
                    <div className="font-medium">{i.trade_name}</div>
                    <div className="text-xs text-slate-500">
                      {[i.active_ingredient, i.strength, i.dosage_form, i.pack_size, i.pzn && `PZN ${i.pzn}`]
                        .filter(Boolean).join(" · ")}
                    </div>
                    <div className="mt-1 flex gap-1">
                      {i.is_rx && <span className="label-neutral">Rx</span>}
                      {i.is_cold_chain && <span className="label-neutral">Cold chain</span>}
                      {i.is_narcotic && (
                        <span className="label-neutral"
                          title="Narcotic: supplied only after individual review of permits">Narcotic</span>
                      )}
                    </div>
                  </td>
                  <td className="px-2.5 py-2" data-label="Manufacturer">{i.manufacturer}</td>
                  <td className="px-2.5 py-2 font-mono text-xs" data-label="Batch">{i.batch || "–"}</td>
                  <td className="px-2.5 py-2" data-label="Expiry">
                    {months === null ? onRequest : (
                      <div>
                        <div className={months < 6 ? "font-bold text-danger" : months < 12 ? "mark-attention inline-block" : ""}>
                          {displayDate(i.expiry_date)}
                        </div>
                        <div className="text-xs text-slate-500">{months} months left</div>
                      </div>
                    )}
                  </td>
                  <td className="px-2.5 py-2 text-right" data-label="Available">{i.available_qty === null ? onRequest : i.available_qty.toLocaleString("en")}</td>
                  <td className="px-2.5 py-2 text-right" data-label="MOQ">{i.moq}</td>
                  <td className="px-2.5 py-2 text-right font-bold" data-label="Price / pack">{i.unit_price === null ? onRequest : eur(i.unit_price)}</td>
                  <td className="px-2.5 py-2 text-xs" data-label="COA">
                    {i.coa_available === true ? <span className="label-neutral">Available</span>
                      : i.coa_available === false ? <span className="text-slate-600">Not available</span> : onRequest}
                  </td>
                  <td className="px-2.5 py-2 text-xs text-slate-600" data-label="Terms">
                    <div>
                      {i.incoterm}
                      <div className="text-slate-500">stock {displayDate(i.stock_as_of)}</div>
                    </div>
                  </td>
                  {canRequest && (
                    <td className="px-2.5 py-2" data-label="Request">
                      {cart[i.offer_id] ? (
                        <div className="text-xs">
                          <span className="font-bold text-success">{cart[i.offer_id]} packs added</span>
                          <button className="ml-2 text-slate-500 underline" onClick={() => set(i.offer_id, 0)}>Remove</button>
                        </div>
                      ) : (
                        <form
                          className="flex items-center gap-1"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const qty = Math.floor(Number(draft[i.offer_id] ?? i.moq));
                            if (qty >= i.moq && (i.available_qty === null || qty <= i.available_qty)) set(i.offer_id, qty);
                          }}
                        >
                          <input type="number" min={i.moq} max={i.available_qty ?? undefined} aria-label="Packs"
                            className="input w-24 py-1 text-right"
                            value={draft[i.offer_id] ?? String(i.moq)}
                            onChange={(e) => setDraft({ ...draft, [i.offer_id]: e.target.value })} />
                          <button className="btn-secondary px-3 py-1">Add</button>
                        </form>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <CartPanel items={items} cart={cart} setQty={set} clear={clear} canRequest={canRequest}
        defaultCountry={defaultCountry} />
      <p className="text-xs text-slate-500">
        Prices per pack in EUR, excluding VAT. Availability as reported by the manufacturer on the date shown and subject
        to confirmation. “On request” items can be requested as well; we confirm price and availability in our offer.
        Narcotics are supplied only after individual review.
      </p>
    </div>
  );
}
