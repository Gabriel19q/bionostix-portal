"use client";

import { SELLER_LABEL } from "@/lib/status";
import { useMemo, useState } from "react";
import { displayDate, eur, monthsUntil } from "@/lib/format";
import { CartPanel, useCart } from "./cart";
import { downloadCatalogExcel } from "./export";
import { logExportAction } from "../activity-actions";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Download, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type CatalogItem = {
  seller: string;
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
type SortDir = "asc" | "desc";
const ALL = "__all__";

// Clickable column header for sorting (desktop). On phones the headers are hidden, so a sort menu is shown instead.
function SortHeader({ label, k, sort, dir, onSort, right, className = "" }: {
  label: string; k: SortKey; sort: SortKey; dir: SortDir; onSort: (k: SortKey) => void; right?: boolean;
  className?: string;
}) {
  const active = sort === k;
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={`px-2 py-2 ${right ? "text-right" : ""} ${className}`}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-900 ${active ? "text-slate-900" : ""}`}>
        {label}
        <Icon className={`size-3.5 ${active ? "text-primary" : "opacity-60"}`} aria-hidden />
      </button>
    </th>
  );
}

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
  const [dir, setDir] = useState<SortDir>("asc");

  function onSort(k: SortKey) {
    if (k === sort) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSort(k);
      setDir("asc");
    }
  }

  function addToOrder(i: CatalogItem) {
    const raw = draft[i.offer_id] ?? String(i.moq);
    const qty = Math.floor(Number(raw));
    if (!Number.isFinite(qty) || qty < i.moq) {
      toast.error(`Minimum order for ${i.trade_name} is ${i.moq} packs.`);
      return;
    }
    if (i.available_qty !== null && qty > i.available_qty) {
      toast.error(`Only ${i.available_qty.toLocaleString("en")} packs of ${i.trade_name} are available.`);
      return;
    }
    set(i.offer_id, qty);
    toast.success(`${qty.toLocaleString("en")} packs of ${i.trade_name} added`, {
      description: "You can review and send it under “Your order request”.",
    });
  }

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
      if (!needle) return true;
      return [i.trade_name, i.active_ingredient, i.strength, i.pzn, i.manufacturer]
        .some((v) => v?.toLowerCase().includes(needle));
    });
    const exp = (x: CatalogItem) => x.expiry_date ?? "9999";
    const sign = dir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      // "On request" (no date / no price) always goes last, whatever the direction.
      if (sort === "expiry") {
        if (!a.expiry_date !== !b.expiry_date) return a.expiry_date ? -1 : 1;
        return sign * exp(a).localeCompare(exp(b));
      }
      if (sort === "price") {
        if ((a.unit_price === null) !== (b.unit_price === null)) return a.unit_price === null ? 1 : -1;
        return sign * ((a.unit_price ?? 0) - (b.unit_price ?? 0));
      }
      return sign * a.trade_name.localeCompare(b.trade_name) || exp(a).localeCompare(exp(b));
    });
  }, [items, q, manufacturer, sort, dir]);

  if (items.length === 0) {
    return <div className="card text-sm text-slate-600">No products are available at the moment. Please check back soon.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-80">
          <label className="label" htmlFor="q">Search</label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-600" aria-hidden />
            <input id="q" className="input pr-9 pl-9" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Product, active ingredient, PZN…" />
            {q && (
              <button type="button" aria-label="Clear search" onClick={() => setQ("")}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-1 text-slate-600 hover:text-slate-900">
                <X className="size-4" aria-hidden />
              </button>
            )}
          </div>
        </div>
        <div className="w-full sm:w-56">
          <label className="label" id="m-label">Manufacturer</label>
          <Select value={manufacturer || ALL} onValueChange={(v) => setManufacturer(v === ALL ? "" : v)}>
            <SelectTrigger aria-labelledby="m-label"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All manufacturers</SelectItem>
              {manufacturers.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-56 md:hidden">
          <label className="label" id="s-label">Sort by</label>
          <Select value={`${sort}:${dir}`} onValueChange={(v) => {
            const [k, d] = v.split(":") as [SortKey, SortDir];
            setSort(k);
            setDir(d);
          }}>
            <SelectTrigger aria-labelledby="s-label"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="name:asc">Product name (A–Z)</SelectItem>
              <SelectItem value="expiry:asc">Expiry (shortest first)</SelectItem>
              <SelectItem value="expiry:desc">Expiry (longest first)</SelectItem>
              <SelectItem value="price:asc">Price (lowest first)</SelectItem>
              <SelectItem value="price:desc">Price (highest first)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex items-center gap-3 pb-1">
          <p className="text-sm text-slate-600">{rows.length} of {items.length} offers</p>
          {selected.size > 0 && (
            <Button variant="link" size="sm" onClick={() => setSelected(new Set())}>
              Clear selection ({selected.size})
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={exporting}>
                <Download aria-hidden />
                {exporting ? "Preparing…" : "Download Excel"}
                <ChevronDown aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Download as Excel</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => exportRows(items, "all")}>
                All products ({items.length})
              </DropdownMenuItem>
              <DropdownMenuItem disabled={rows.length === items.length} onSelect={() => exportRows(rows, "view")}>
                Current view ({rows.length})
              </DropdownMenuItem>
              <DropdownMenuItem disabled={selected.size === 0}
                onSelect={() => exportRows(items.filter((i) => selected.has(i.offer_id)), "selected")}>
                Selected ({selected.size})
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={includePrices}
                onCheckedChange={(v) => setIncludePrices(v === true)}
                onSelect={(e) => e.preventDefault()}>
                Include prices
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="table-stack min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2">
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
              <SortHeader label="Product" k="name" sort={sort} dir={dir} onSort={onSort} className="min-w-36" />
              <th className="px-2 py-2">Active ingredient</th>
              <th className="px-2 py-2">Pack size</th>
              <th className="px-2 py-2">Manufacturer</th>
              <th className="px-2 py-2">Seller</th>
              <SortHeader label="Expiry" k="expiry" sort={sort} dir={dir} onSort={onSort} />
              <SortHeader label="Price / pack" k="price" sort={sort} dir={dir} onSort={onSort} right />
              <th className="px-2 py-2 text-right">Available</th>
              <th className="px-2 py-2 text-right">MOQ</th>
              <th className="px-2 py-2">Incoterm</th>
              {canRequest && <th className="px-2 py-2">Request</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((i) => {
              const months = i.expiry_date ? monthsUntil(i.expiry_date) : null;
              return (
                <tr key={i.offer_id} className={selected.has(i.offer_id) ? "[&>td]:bg-slate-50" : ""}>
                  <td className="px-2 py-2" data-label="Select">
                    <input type="checkbox" aria-label={`Select ${i.trade_name}`} checked={selected.has(i.offer_id)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(i.offer_id);
                        else next.delete(i.offer_id);
                        setSelected(next);
                      }} />
                  </td>
                  <td className="px-2 py-2">
                    <div className="font-medium">{i.trade_name}</div>
                    <div className="text-xs text-slate-500">
                      {[i.strength, i.dosage_form, i.pzn && `PZN ${i.pzn}`].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="px-2 py-2" data-label="Active ingredient">{i.active_ingredient || "–"}</td>
                  <td className="px-2 py-2" data-label="Pack size">{i.pack_size || "–"}</td>
                  <td className="px-2 py-2" data-label="Manufacturer">{i.manufacturer}</td>
                  <td className="px-2 py-2" data-label="Seller">{SELLER_LABEL[i.seller] ?? i.seller}</td>
                  <td className="px-2 py-2" data-label="Expiry">
                    {months === null ? onRequest : (
                      <div>
                        <div className={months < 6 ? "font-bold text-danger" : months < 12 ? "mark-attention inline-block" : ""}>
                          {displayDate(i.expiry_date)}
                        </div>
                        <div className="text-xs text-slate-500">{months} months left</div>
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right font-bold" data-label="Price / pack">{i.unit_price === null ? onRequest : eur(i.unit_price)}</td>
                  <td className="px-2 py-2 text-right" data-label="Available">{i.available_qty === null ? onRequest : i.available_qty.toLocaleString("en")}</td>
                  <td className="px-2 py-2 text-right" data-label="MOQ">{i.moq}</td>
                  <td className="px-2 py-2 text-xs text-slate-600" data-label="Incoterm">
                    <div>
                      {i.incoterm}
                      <div className="text-slate-500">stock {displayDate(i.stock_as_of)}</div>
                    </div>
                  </td>
                  {canRequest && (
                    <td className="px-2 py-2" data-label="Request">
                      {cart[i.offer_id] ? (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-bold text-success">{cart[i.offer_id].toLocaleString("en")} packs added</span>
                          <Button variant="link" size="sm" className="min-h-0 text-xs font-normal text-slate-600"
                            onClick={() => {
                              set(i.offer_id, 0);
                              toast(`${i.trade_name} removed from your order`);
                            }}>
                            Remove
                          </Button>
                        </div>
                      ) : (
                        <form
                          className="flex items-center gap-1"
                          onSubmit={(e) => {
                            e.preventDefault();
                            addToOrder(i);
                          }}
                        >
                          <input type="number" min={i.moq} max={i.available_qty ?? undefined} aria-label="Packs"
                            className="input w-20 py-1 text-right"
                            value={draft[i.offer_id] ?? String(i.moq)}
                            onChange={(e) => setDraft({ ...draft, [i.offer_id]: e.target.value })} />
                          <Button variant="outline" size="sm">Add</Button>
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
        to confirmation. Displayed products are a non-binding offer (subject to availability). “On request” items can be requested as well; we confirm price and availability in our order confirmation.
        Narcotics are supplied only after individual review.
      </p>
    </div>
  );
}
