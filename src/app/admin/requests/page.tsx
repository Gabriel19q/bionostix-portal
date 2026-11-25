import Link from "next/link";
import { getSession } from "@/lib/session";
import { displayDate, eur } from "@/lib/format";
import { ORDER_STATUS, OPEN_STATUSES, type OrderStatus } from "@/lib/orders";

type Row = {
  id: string; number: string; status: OrderStatus; quantity: number; unit_price: number; created_at: string;
  accepted_at: string | null; commission_pct: number | null; commission_eur: number | null; product: { product_name: string };
  buyer: { name: string; country: string } | null; seller: { name: string; seller_code: string | null } | null;
};

const DEAL: OrderStatus[] = ["accepted", "paid", "shipped", "completed"];

// All orders between buyers and sellers, with the commission per seller and month (due at acceptance)
export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show = "open" } = await searchParams;
  const { supabase } = await getSession();
  const { data } = await supabase.from("market_orders")
    .select("id, number, status, quantity, unit_price, created_at, accepted_at, commission_pct, commission_eur, product, buyer:companies!market_orders_buyer_company_id_fkey(name, country), seller:companies!market_orders_seller_company_id_fkey(name, seller_code)")
    .order("created_at", { ascending: false }).limit(1000).returns<Row[]>();
  const all = data ?? [];
  const rows = show === "all" ? all : all.filter((r) => OPEN_STATUSES.includes(r.status));

  // Commission per month and seller
  const byMonth = new Map<string, Map<string, { orders: number; value: number; commission: number }>>();
  for (const r of all.filter((x) => DEAL.includes(x.status) && x.accepted_at)) {
    const month = r.accepted_at!.slice(0, 7);
    const seller = `${r.seller?.name ?? "?"} (${r.seller?.seller_code ?? ""})`;
    const m = byMonth.get(month) ?? new Map();
    const v = m.get(seller) ?? { orders: 0, value: 0, commission: 0 };
    v.orders += 1; v.value += r.quantity * r.unit_price; v.commission += Number(r.commission_eur ?? 0);
    m.set(seller, v); byMonth.set(month, m);
  }
  const months = [...byMonth.keys()].sort().reverse();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Orders</h1>
          <p className="text-sm text-slate-600">Binding requests and concluded orders between buyers and sellers.</p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link href="/admin/requests" className={show === "all" ? "btn-secondary" : "btn-primary"}>Open</Link>
          <Link href="/admin/requests?show=all" className={show === "all" ? "btn-primary" : "btn-secondary"}>All</Link>
        </div>
      </div>

      {rows.length === 0 ? <div className="card text-sm text-slate-600">No orders here.</div> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-600">
              <tr><th className="p-3">Order</th><th className="p-3">Product</th><th className="p-3">Buyer</th><th className="p-3">Seller</th>
                <th className="p-3 text-right">Value</th><th className="p-3 text-right">Commission</th><th className="p-3">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="p-3"><Link href={`/admin/requests/${r.id}`} className="font-bold text-brand-600 underline">{r.number}</Link>
                    <span className="block text-xs text-slate-500">{displayDate(r.created_at)}</span></td>
                  <td className="p-3">{r.product.product_name}<span className="block text-xs text-slate-500">{r.quantity} × {eur(r.unit_price)}</span></td>
                  <td className="p-3">{r.buyer?.name}<span className="block text-xs text-slate-500">{r.buyer?.country}</span></td>
                  <td className="p-3">{r.seller?.name}<span className="block text-xs text-slate-500">{r.seller?.seller_code}</span></td>
                  <td className="p-3 text-right">{eur(r.quantity * r.unit_price)}</td>
                  <td className="p-3 text-right">{r.commission_eur !== null ? <>{eur(r.commission_eur)}<span className="block text-xs text-slate-500">{r.commission_pct} %</span></> : "–"}</td>
                  <td className="p-3"><span className={ORDER_STATUS[r.status].tag}>{ORDER_STATUS[r.status].label}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card space-y-3">
        <h2 className="font-bold">Commission due (by month of acceptance)</h2>
        <p className="text-xs text-slate-600">Due at acceptance, also if the buyer does not pay the seller. Invoice the seller; payment by bank transfer within 14 days.</p>
        {months.length === 0 ? <p className="text-sm text-slate-600">No concluded orders yet.</p> : months.map((m) => (
          <div key={m}>
            <h3 className="text-sm font-bold">{m}</h3>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {[...byMonth.get(m)!.entries()].map(([seller, v]) => (
                  <tr key={seller}><td className="py-1">{seller}</td><td className="py-1 text-right">{v.orders} order(s)</td>
                    <td className="py-1 text-right">{eur(v.value)}</td><td className="py-1 text-right font-bold">{eur(v.commission)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
