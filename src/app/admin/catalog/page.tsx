import Link from "next/link";
import { getSession } from "@/lib/session";
import { displayDate, eur, monthsUntil, sellPrice } from "@/lib/format";
import { offerAction } from "./actions";
import { ConfirmButton, SelectAll } from "./bulk-controls";
import { SELLER_LABEL } from "@/lib/status";

type Row = {
  id: string;
  batch: string;
  expiry_date: string | null;
  available_qty: number | null;
  moq: number;
  purchase_price: number | null;
  internal_note: string | null;
  coa_available: boolean | null;
  markup_override_pct: number | null;
  incoterm: string;
  stock_as_of: string;
  is_active: boolean;
  products: {
    trade_name: string;
    strength: string | null;
    pack_size: string | null;
    pzn: string | null;
    is_cold_chain: boolean;
    is_narcotic: boolean;
    seller: string;
    manufacturers: { name: string } | null;
  };
};

export default async function AdminCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; m?: string; inactive?: string; msg?: string }>;
}) {
  const { q = "", m = "", inactive, msg } = await searchParams;
  const { supabase } = await getSession();
  const [{ data: offers }, { data: groups }, { data: manufacturers }] = await Promise.all([
    supabase
      .from("offers")
      .select("*, products(trade_name, strength, pack_size, pzn, is_cold_chain, is_narcotic, seller, manufacturers(name))")
      .order("expiry_date", { nullsFirst: false })
      .returns<Row[]>(),
    supabase.from("customer_groups").select("id, name, default_markup_pct").order("name"),
    supabase.from("manufacturers").select("name").order("name"),
  ]);

  const needle = q.trim().toLowerCase();
  const rows = (offers ?? []).filter((o) => {
    if (!inactive && !o.is_active) return false;
    if (m && o.products.manufacturers?.name !== m) return false;
    if (!needle) return true;
    return [o.products.trade_name, o.products.strength, o.products.pzn, o.batch, o.products.manufacturers?.name]
      .some((v) => v?.toLowerCase().includes(needle));
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Catalog</h1>
          <p className="text-sm text-slate-600">{rows.length} batch(es) shown. Purchase prices are visible to admins only.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/import" className="btn-secondary">Import stock list</Link>
          <Link href="/admin/catalog/new" className="btn-primary">Add batch</Link>
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <div className="w-72">
          <label className="label">Search</label>
          <input name="q" className="input" defaultValue={q} placeholder="Name, PZN, batch…" />
        </div>
        <div className="w-56">
          <label className="label">Manufacturer</label>
          <select name="m" className="input" defaultValue={m}>
            <option value="">All</option>
            {(manufacturers ?? []).map((x) => <option key={x.name}>{x.name}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="inactive" value="1" defaultChecked={!!inactive} /> Show hidden batches
        </label>
        <button className="btn-secondary">Filter</button>
      </form>

      {msg && <Notice msg={msg} />}

      <form action={offerAction} className="space-y-2">
      <input type="hidden" name="q" value={q} />
      <input type="hidden" name="m" value={m} />
      <input type="hidden" name="inactive" value={inactive ?? ""} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-600">Selected batches:</span>
        <button name="op" value="hide" className="btn-secondary px-3 py-1">Hide</button>
        <button name="op" value="show" className="btn-secondary px-3 py-1">Show</button>
        <ConfirmButton value="delete" className="btn-danger px-3 py-1"
          message="Delete {n} selected batch(es)? This cannot be undone. Batches that appear in a customer request are hidden instead.">
          Delete
        </ConfirmButton>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-2"><SelectAll /></th>
              <th className="px-2 py-2">Product</th>
              <th className="px-2 py-2">Manufacturer</th>
              <th className="px-2 py-2">Batch</th>
              <th className="px-2 py-2">Expiry</th>
              <th className="px-2 py-2 text-right">Qty / as of</th>
              <th className="px-2 py-2 text-right">MOQ</th>
              <th className="px-2 py-2 text-right">Purchase</th>
              <th className="px-2 py-2 text-right">Markup</th>
              {(groups ?? []).map((g) => (
                <th key={g.id} className="px-2 py-2 text-right">{g.name}</th>
              ))}
              <th className="px-2 py-2">COA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={11 + (groups?.length ?? 0)} className="px-3 py-6 text-center text-slate-500">
                  No batches yet. Add one or import a manufacturer stock list.
                </td>
              </tr>
            )}
            {rows.map((o) => {
              const months = o.expiry_date ? monthsUntil(o.expiry_date) : null;
              return (
                <tr key={o.id} className={o.is_active ? "" : "bg-slate-50 text-slate-400"}>
                  <td className="px-2 py-2">
                    <input type="checkbox" name="offer_id" value={o.id} aria-label={`Select ${o.products.trade_name}`} />
                  </td>
                  <td className="px-2 py-2">
                    <Link href={`/admin/catalog/${o.id}`} className="font-medium text-brand-600 hover:underline">
                      {o.products.trade_name}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {[o.products.strength, o.products.pack_size, o.products.pzn && `PZN ${o.products.pzn}`]
                        .filter(Boolean).join(" · ")}
                      {o.products.is_cold_chain && " · cold chain"}
                      {o.products.is_narcotic && " · BtM"}
                    </div>
                    <div className="text-xs text-slate-600">Seller: {SELLER_LABEL[o.products.seller] ?? o.products.seller}</div>
                    {o.internal_note && <div className="text-xs italic text-slate-600">Internal: {o.internal_note}</div>}
                    <button name="op" value={`toggle:${o.id}:${o.is_active ? "false" : "true"}`}
                      className="text-xs text-slate-600 underline hover:text-brand-600">
                      {o.is_active ? "Hide from customers" : "Show to customers"}
                    </button>
                  </td>
                  <td className="px-2 py-2">{o.products.manufacturers?.name}</td>
                  <td className="px-2 py-2 font-mono text-xs">{o.batch || "–"}</td>
                  <td className={`px-2 py-2 whitespace-nowrap ${months === null ? "text-slate-400" : months < 6 ? "font-bold text-danger" : ""}`}>
                    {o.expiry_date
                      ? <span className={months !== null && months >= 6 && months < 12 ? "mark-attention" : ""}>{displayDate(o.expiry_date)}</span>
                      : "open"}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {o.available_qty ?? <span className="text-slate-400">on request</span>}
                    <div className="text-xs whitespace-nowrap text-slate-500">{displayDate(o.stock_as_of)}</div>
                  </td>
                  <td className="px-2 py-2 text-right">{o.moq}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{o.purchase_price === null ? <span className="text-slate-400">on request</span> : eur(o.purchase_price)}</td>
                  <td className="px-2 py-2 text-right">
                    {o.markup_override_pct !== null ? `${o.markup_override_pct}%` : <span className="text-slate-400">group</span>}
                  </td>
                  {(groups ?? []).map((g) => (
                    <td key={g.id} className="px-2 py-2 text-right whitespace-nowrap">
                      {o.purchase_price === null ? <span className="text-slate-400">–</span>
                        : eur(sellPrice(Number(o.purchase_price), o.markup_override_pct === null ? null : Number(o.markup_override_pct), Number(g.default_markup_pct)))}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-xs">
                    {o.coa_available === true ? <span className="label-neutral">yes</span>
                      : o.coa_available === false ? "no" : <span className="text-slate-400">–</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </form>
    </div>
  );
}

function Notice({ msg }: { msg: string }) {
  const [op, a, b] = msg.split(":");
  let text = "";
  if (op === "none") text = "Please tick at least one batch first.";
  else if (op === "hide") text = `${a} batch(es) hidden from customers.`;
  else if (op === "show") text = `${a} batch(es) visible to customers again.`;
  else if (op === "delete") {
    text = `${a} batch(es) deleted.`;
    if (Number(b) > 0) text += ` ${b} batch(es) appear in customer requests and were hidden instead, so the request history stays complete.`;
  }
  if (!text) return null;
  return <div className="notice-info">{text}</div>;
}
