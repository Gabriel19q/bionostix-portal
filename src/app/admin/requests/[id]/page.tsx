import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { displayDate, displayDateTime, eur } from "@/lib/format";
import { EVENT_LABEL, ORDER_DOC_KIND, ORDER_STATUS, productLine, type OrderProduct, type OrderStatus } from "@/lib/orders";

type Row = {
  id: string; number: string; status: OrderStatus; quantity: number; unit_price: number; created_at: string;
  delivery_country: string; final_destination: string; needed_by: string | null; required_documents: string[];
  comment: string | null; counter_quantity: number | null; counter_price: number | null; counter_note: string | null;
  decline_reason: string | null; accepted_at: string | null; commission_pct: number | null; commission_eur: number | null;
  tracking: string | null; product: OrderProduct;
  buyer: { name: string; country: string; contact_email: string | null } | null;
  seller: { name: string; seller_code: string | null; contact_email: string | null } | null;
  market_order_events: { id: number; actor: string; event: string; note: string | null; created_at: string }[];
  market_order_documents: { id: string; kind: string; file_name: string; storage_path: string; created_at: string }[];
};

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getSession();
  const { data } = await supabase.from("market_orders")
    .select("*, buyer:companies!market_orders_buyer_company_id_fkey(name, country, contact_email), seller:companies!market_orders_seller_company_id_fkey(name, seller_code, contact_email), market_order_events(id, actor, event, note, created_at), market_order_documents(id, kind, file_name, storage_path, created_at)")
    .eq("id", id).maybeSingle<Row>();
  if (!data) notFound();
  const o = data;
  const docs = o.market_order_documents;
  const { data: signed } = docs.length ? await supabase.storage.from("documents").createSignedUrls(docs.map((d) => d.storage_path), 600) : { data: [] };
  const url = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/requests" className="text-sm text-brand-600 underline">← Orders</Link>
          <h1 className="mt-2 text-2xl font-bold">{o.number} · {o.product.product_name}</h1>
          <p className="text-sm text-slate-600">{productLine(o.product)} · sent {displayDate(o.created_at)}</p>
        </div>
        <span className={ORDER_STATUS[o.status].tag}>{ORDER_STATUS[o.status].label}</span>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card text-sm"><h2 className="font-bold">Buyer</h2><p>{o.buyer?.name}</p><p className="text-slate-600">{o.buyer?.country} · {o.buyer?.contact_email}</p></div>
        <div className="card text-sm"><h2 className="font-bold">Seller</h2><p>{o.seller?.name} ({o.seller?.seller_code})</p><p className="text-slate-600">{o.seller?.contact_email}</p></div>
        <div className="card text-sm"><h2 className="font-bold">Commission</h2>
          <p>{o.commission_eur !== null ? `${eur(o.commission_eur)} (${o.commission_pct} %)` : "Not concluded yet"}</p>
          {o.accepted_at && <p className="text-slate-600">due since {displayDate(o.accepted_at)}</p>}</div>
      </div>
      <div className="card">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 md:grid-cols-4">
          <div><dt className="text-xs font-bold text-slate-600">Quantity</dt><dd>{o.quantity} packs</dd></div>
          <div><dt className="text-xs font-bold text-slate-600">Price / total</dt><dd>{eur(o.unit_price)} / {eur(o.quantity * o.unit_price)}</dd></div>
          <div><dt className="text-xs font-bold text-slate-600">Delivery / final destination</dt><dd>{o.delivery_country} / {o.final_destination}</dd></div>
          <div><dt className="text-xs font-bold text-slate-600">Needed by</dt><dd>{o.needed_by ? displayDate(o.needed_by) : "–"}</dd></div>
          <div><dt className="text-xs font-bold text-slate-600">Documents required</dt><dd>{o.required_documents.join(", ") || "–"}</dd></div>
          {o.counter_quantity && <div><dt className="text-xs font-bold text-slate-600">Counter-offer</dt><dd>{o.counter_quantity} × {eur(o.counter_price ?? 0)}{o.counter_note ? ` – ${o.counter_note}` : ""}</dd></div>}
          {o.decline_reason && <div><dt className="text-xs font-bold text-slate-600">Decline reason</dt><dd>{o.decline_reason}</dd></div>}
          {o.tracking && <div><dt className="text-xs font-bold text-slate-600">Tracking</dt><dd>{o.tracking}</dd></div>}
          {o.comment && <div className="md:col-span-4"><dt className="text-xs font-bold text-slate-600">Comment from the buyer</dt><dd className="whitespace-pre-line">{o.comment}</dd></div>}
        </dl>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card space-y-2"><h2 className="font-bold">Documents</h2>
          {docs.length === 0 ? <p className="text-sm text-slate-600">No documents.</p> : (
            <ul className="text-sm">{docs.map((d) => <li key={d.id}><a href={url.get(d.storage_path) ?? "#"} target="_blank" rel="noreferrer" className="text-brand-600 underline">{d.file_name}</a>
              <span className="text-xs text-slate-500"> · {ORDER_DOC_KIND[d.kind] ?? d.kind} · {displayDate(d.created_at)}</span></li>)}</ul>)}
        </div>
        <div className="card space-y-2"><h2 className="font-bold">History</h2>
          <ol className="space-y-1 text-sm">{[...o.market_order_events].sort((a, b) => a.id - b.id).map((e) => (
            <li key={e.id}>{EVENT_LABEL[e.event] ?? e.event} <span className="text-xs text-slate-500">· {e.actor} · {displayDateTime(e.created_at)}</span>
              {e.note && <span className="block text-xs text-slate-600">{e.note}</span>}</li>))}</ol>
        </div>
      </div>
    </div>
  );
}
