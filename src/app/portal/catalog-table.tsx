"use client";

import { useMemo, useState } from "react";
import { displayDate, eur, monthsUntil } from "@/lib/format";

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
  expiry_date: string;
  available_qty: number;
  moq: number;
  incoterm: string;
  stock_as_of: string;
  unit_price: number;
};

type SortKey = "name" | "expiry" | "price";

export function CatalogTable({ items }: { items: CatalogItem[] }) {
  const [q, setQ] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [sort, setSort] = useState<SortKey>("name");

  const manufacturers = useMemo(() => [...new Set(items.map((i) => i.manufacturer))].sort(), [items]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = items.filter((i) => {
      if (manufacturer && i.manufacturer !== manufacturer) return false;
      if (!needle) return true;
      return [i.trade_name, i.active_ingredient, i.strength, i.pzn, i.manufacturer]
        .some((v) => v?.toLowerCase().includes(needle));
    });
    return filtered.sort((a, b) => {
      if (sort === "expiry") return a.expiry_date.localeCompare(b.expiry_date);
      if (sort === "price") return Number(a.unit_price) - Number(b.unit_price);
      return a.trade_name.localeCompare(b.trade_name) || a.expiry_date.localeCompare(b.expiry_date);
    });
  }, [items, q, manufacturer, sort]);

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
        <p className="pb-2 text-sm text-slate-500">{rows.length} of {items.length} batches</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Manufacturer</th>
              <th className="px-3 py-2">Batch</th>
              <th className="px-3 py-2">Expiry</th>
              <th className="px-3 py-2 text-right">Available</th>
              <th className="px-3 py-2 text-right">MOQ</th>
              <th className="px-3 py-2 text-right">Price / pack</th>
              <th className="px-3 py-2">Terms</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((i) => {
              const months = monthsUntil(i.expiry_date);
              return (
                <tr key={i.offer_id}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{i.trade_name}</div>
                    <div className="text-xs text-slate-500">
                      {[i.active_ingredient, i.strength, i.dosage_form, i.pack_size, i.pzn && `PZN ${i.pzn}`]
                        .filter(Boolean).join(" · ")}
                    </div>
                    <div className="mt-1 flex gap-1">
                      {i.is_rx && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">Rx</span>}
                      {i.is_cold_chain && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] text-sky-900">Cold chain</span>}
                      {i.is_narcotic && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900"
                          title="Narcotic: supplied only after individual review of permits">Narcotic</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">{i.manufacturer}</td>
                  <td className="px-3 py-2 font-mono text-xs">{i.batch}</td>
                  <td className="px-3 py-2">
                    <div className={months < 6 ? "font-medium text-red-700" : months < 12 ? "text-amber-700" : ""}>
                      {displayDate(i.expiry_date)}
                    </div>
                    <div className="text-xs text-slate-500">{months} months left</div>
                  </td>
                  <td className="px-3 py-2 text-right">{i.available_qty.toLocaleString("en")}</td>
                  <td className="px-3 py-2 text-right">{i.moq}</td>
                  <td className="px-3 py-2 text-right font-medium">{eur(i.unit_price)}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {i.incoterm}
                    <div className="text-slate-400">stock {displayDate(i.stock_as_of)}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Prices per pack in EUR, excluding VAT. Availability as reported by the manufacturer on the date shown and subject
        to confirmation. Narcotics are supplied only after individual review.
      </p>
    </div>
  );
}
