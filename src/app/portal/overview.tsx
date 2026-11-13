import Link from "next/link";
import { getSession } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { displayDate, eur, today } from "@/lib/format";
import { SELLER_LABEL, StatusBadge, type RequestStatus } from "@/lib/status";
import type { CatalogItem } from "./catalog-table";
import { AddToOrder } from "./add-to-order";

type Req = {
  id: string; number: string; status: RequestStatus; payment_due_date: string | null;
  created_at: string; updated_at: string;
};
type Line = { request_id: string; product_id: string };

const CLOSED: RequestStatus[] = ["completed", "declined", "cancelled"];

// Customer start page after login (meeting 9 Nov 2026): to-dos, open orders, recommendations.
export async function Overview() {
  const { supabase, company } = await getSession();
  if (!company) return null;

  const [{ data: reqData }, { data: lineData }, { data: catalogData }] = await Promise.all([
    supabase.rpc("get_my_requests").order("created_at", { ascending: false }),
    supabase.rpc("get_my_request_items").select("request_id, product_id"),
    supabase.rpc("get_catalog"),
  ]);
  const requests = (reqData ?? []) as Req[];
  const lines = (lineData ?? []) as Line[];
  const catalog = (catalogData ?? []) as CatalogItem[];
  await logActivity(supabase, "view_requests", "/portal", { overview: true });

  // To-dos for the customer
  const now = today();
  const todos: { key: string; text: React.ReactNode; href: string; action: string; urgent?: boolean }[] = [];
  for (const r of requests) {
    if (r.status === "changes_proposed") {
      todos.push({ key: r.id, href: `/portal/requests/${r.id}`, action: "Review changes",
        text: <>We can supply <strong>{r.number}</strong> with changes. Please accept or cancel.</> });
    }
    if (r.status === "proforma_sent" && r.payment_due_date) {
      const overdue = r.payment_due_date < now;
      todos.push({ key: r.id + "-pay", href: `/portal/requests/${r.id}`, action: "View proforma", urgent: overdue,
        text: overdue
          ? <>The payment deadline for <strong>{r.number}</strong> ({displayDate(r.payment_due_date)}) has passed.</>
          : <>Please pay the deposit for <strong>{r.number}</strong> by {displayDate(r.payment_due_date)}.</> });
    }
  }
  if (company.license_expires_on) {
    const days = Math.round((Date.parse(company.license_expires_on) - Date.parse(now)) / 864e5);
    if (days <= 30) {
      todos.push({ key: "licence", href: `mailto:${process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "info@bionostix-germany.de"}`,
        action: "Send renewed licence", urgent: days < 0,
        text: days < 0
          ? <>Your licence on file expired on {displayDate(company.license_expires_on)}. Ordering is paused.</>
          : <>Your licence on file expires on {displayDate(company.license_expires_on)}.</> });
    }
  }

  const open = requests.filter((r) => !CLOSED.includes(r.status));

  // Recommendations: products ordered before that are available again; otherwise the newest offers
  const orderedProducts = new Set(lines.map((l) => l.product_id));
  const reorder = catalog.filter((c) => orderedProducts.has(c.product_id));
  const recommended = (reorder.length ? reorder : [...catalog].sort((a, b) => b.stock_as_of.localeCompare(a.stock_as_of)))
    .filter((c, i, all) => all.findIndex((x) => x.product_id === c.product_id) === i)
    .slice(0, 6);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-sm text-slate-600">{company.name}</p>
      </div>

      <section className="space-y-3" aria-labelledby="todo-h">
        <h2 id="todo-h" className="text-lg font-bold">Your to-dos</h2>
        {todos.length === 0 ? (
          <p className="notice-success">Nothing to do right now.</p>
        ) : (
          <ul className="space-y-2">
            {todos.map((t) => (
              <li key={t.key} className={`${t.urgent ? "notice-error" : "notice-attention"} flex flex-wrap items-center justify-between gap-3`}>
                <span>{t.text}</span>
                <a href={t.href} className="btn-secondary bg-white">{t.action}</a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="open-h">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="open-h" className="text-lg font-bold">Open orders</h2>
          <Link href="/portal/requests" className="text-sm text-brand-600 underline">All orders</Link>
        </div>
        {open.length === 0 ? (
          <div className="card text-sm text-slate-600">
            No open orders. <Link href="/portal/catalog" className="text-brand-600 underline">Browse the catalog</Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="table-stack min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Order</th><th className="px-3 py-2">Sent</th>
                  <th className="px-3 py-2">Status</th><th className="px-3 py-2">Last update</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {open.slice(0, 5).map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2" data-label="Order">
                      <Link href={`/portal/requests/${r.id}`} className="font-bold text-brand-600 hover:underline">{r.number}</Link>
                    </td>
                    <td className="px-3 py-2" data-label="Sent">{displayDate(r.created_at)}</td>
                    <td className="px-3 py-2" data-label="Status"><StatusBadge status={r.status} viewer="customer" /></td>
                    <td className="px-3 py-2 text-slate-500" data-label="Last update">{displayDate(r.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {recommended.length > 0 && (
        <section className="space-y-3" aria-labelledby="rec-h">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="rec-h" className="text-lg font-bold">{reorder.length ? "Available again for you" : "Current offers"}</h2>
            <Link href="/portal/catalog" className="text-sm text-brand-600 underline">Full catalog</Link>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recommended.map((c) => (
              <li key={c.offer_id} className="card flex flex-col gap-2 p-5">
                <p className="font-bold">{c.trade_name}</p>
                <p className="text-sm text-slate-600">
                  {[c.active_ingredient, c.strength, c.pack_size].filter(Boolean).join(" · ")}
                </p>
                <p className="text-xs text-slate-600">{c.manufacturer} · Seller: {SELLER_LABEL[c.seller] ?? c.seller}</p>
                <p className="mt-auto flex items-baseline justify-between pt-2">
                  <span className="text-lg font-bold">{c.unit_price === null ? "On request" : eur(c.unit_price)}</span>
                  <span className="text-xs text-slate-600">
                    {c.available_qty === null ? "qty on request" : `${c.available_qty.toLocaleString("en")} available`} · MOQ {c.moq}
                  </span>
                </p>
                {company.can_request && <AddToOrder offerId={c.offer_id} moq={c.moq} />}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
