import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { displayDate, eur } from "@/lib/format";
import { StatusBadge, type RequestStatus } from "@/lib/status";

type Req = { id: string; number: string; status: RequestStatus; created_at: string; updated_at: string };
type Item = { request_id: string; requested_qty: number; unit_price_snapshot: number | null; confirmed_qty: number | null; confirmed_unit_price: number | null };

export default async function MyRequestsPage() {
  const { supabase, company } = await getSession();
  if (!company) redirect("/portal");

  const [{ data: requests }, { data: items }] = await Promise.all([
    supabase.rpc("get_my_requests").order("created_at", { ascending: false }),
    supabase.rpc("get_my_request_items"),
  ]);
  const reqs = (requests ?? []) as Req[];
  await logActivity(supabase, "view_requests", "/portal/requests");
  const allItems = (items ?? []) as Item[];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">My requests</h1>
      {reqs.length === 0 ? (
        <div className="card text-sm text-slate-600">
          No requests yet. <Link href="/portal" className="text-brand-600 underline">Browse the catalog</Link> to send one.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Request</th><th className="px-3 py-2">Sent</th>
                <th className="px-3 py-2 text-right">Lines</th><th className="px-3 py-2 text-right">Value</th>
                <th className="px-3 py-2">Status</th><th className="px-3 py-2">Last update</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reqs.map((r) => {
                const lines = allItems.filter((i) => i.request_id === r.id);
                const value = lines.reduce(
                  (s, i) => s + (i.confirmed_qty ?? i.requested_qty) * Number(i.confirmed_unit_price ?? i.unit_price_snapshot ?? 0), 0);
                return (
                  <tr key={r.id}>
                    <td className="px-3 py-2">
                      <Link href={`/portal/requests/${r.id}`} className="font-medium text-brand-600 hover:underline">{r.number}</Link>
                    </td>
                    <td className="px-3 py-2">{displayDate(r.created_at)}</td>
                    <td className="px-3 py-2 text-right">{lines.length}</td>
                    <td className="px-3 py-2 text-right">{eur(value)}</td>
                    <td className="px-3 py-2"><StatusBadge status={r.status} viewer="customer" /></td>
                    <td className="px-3 py-2 text-slate-500">{displayDate(r.updated_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
