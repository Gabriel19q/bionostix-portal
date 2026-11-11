import Link from "next/link";
import { getSession } from "@/lib/session";
import { displayDate, eur } from "@/lib/format";
import { StatusBadge, type RequestStatus } from "@/lib/status";

type Row = {
  id: string;
  number: string;
  status: RequestStatus;
  created_at: string;
  updated_at: string;
  delivery_country: string | null;
  companies: { name: string } | null;
  request_items: {
    requested_qty: number;
    unit_price_snapshot: number | null;
    confirmed_qty: number | null;
    confirmed_unit_price: number | null;
    request_item_costs: { purchase_price_snapshot: number | null } | null;
  }[];
};

const CLOSED: RequestStatus[] = ["completed", "declined", "cancelled"];

export default async function AdminRequestsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show = "open" } = await searchParams;
  const { supabase } = await getSession();
  const { data } = await supabase
    .from("requests")
    .select("id, number, status, created_at, updated_at, delivery_country, companies(name), request_items(requested_qty, unit_price_snapshot, confirmed_qty, confirmed_unit_price, request_item_costs(purchase_price_snapshot))")
    .order("created_at", { ascending: false })
    .returns<Row[]>();

  const all = data ?? [];
  const rows = all.filter((r) => (show === "all" ? true : show === "closed" ? CLOSED.includes(r.status) : !CLOSED.includes(r.status)));
  const newCount = all.filter((r) => r.status === "new").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Requests</h1>
          <p className="text-sm text-slate-600">{newCount === 0 ? "No new requests." : `${newCount} new request(s) waiting.`}</p>
        </div>
        <div className="flex gap-1 text-sm">
          {[["open", "Open"], ["closed", "Closed"], ["all", "All"]].map(([k, label]) => (
            <Link key={k} href={`/admin/requests?show=${k}`}
              className={`rounded-md px-3 py-1.5 ${show === k ? "bg-brand-600 text-white" : "border border-slate-300 bg-white"}`}>
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Request</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Received</th>
              <th className="px-3 py-2 text-right">Lines</th><th className="px-3 py-2 text-right">Value</th>
              <th className="px-3 py-2 text-right">Gross margin</th><th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">Nothing here.</td></tr>
            )}
            {rows.map((r) => {
              let value = 0, cost = 0, marginValue = 0;
              for (const i of r.request_items) {
                const qty = i.confirmed_qty ?? i.requested_qty;
                const price = i.confirmed_unit_price ?? i.unit_price_snapshot;
                const purchase = i.request_item_costs?.purchase_price_snapshot ?? null;
                if (price !== null) value += qty * Number(price);
                if (price !== null && purchase !== null) {
                  cost += qty * Number(purchase);
                  marginValue += qty * Number(price);
                }
              }
              return (
                <tr key={r.id} className={r.status === "new" ? "bg-amber-50/50" : ""}>
                  <td className="px-3 py-2">
                    <Link href={`/admin/requests/${r.id}`} className="font-medium text-brand-600 hover:underline">{r.number}</Link>
                  </td>
                  <td className="px-3 py-2">
                    {r.companies?.name}
                    {r.delivery_country && <span className="text-xs text-slate-500"> · {r.delivery_country}</span>}
                  </td>
                  <td className="px-3 py-2">{displayDate(r.created_at)}</td>
                  <td className="px-3 py-2 text-right">{r.request_items.length}</td>
                  <td className="px-3 py-2 text-right">{eur(value)}</td>
                  <td className="px-3 py-2 text-right">
                    {eur(marginValue - cost)}
                    {marginValue > 0 && <span className="text-xs text-slate-500"> ({Math.round(((marginValue - cost) / marginValue) * 100)}%)</span>}
                  </td>
                  <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
