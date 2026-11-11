import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { displayDate, eur } from "@/lib/format";
import { DOC_TYPE_LABEL, SELLER_LABEL, STATUS_HINT, STATUS_LABEL, StatusBadge, type RequestStatus } from "@/lib/status";
import { respondAction } from "../../actions";

type Req = { id: string; number: string; status: RequestStatus; seller: string | null; customer_comment: string | null; delivery_country: string | null; created_at: string };
type Item = { id: string; trade_name: string; strength: string | null; pack_size: string | null; manufacturer: string; batch: string; expiry_date: string | null; requested_qty: number; unit_price_snapshot: number | null; confirmed_qty: number | null; confirmed_unit_price: number | null };
type History = { id: number; new_status: RequestStatus; note: string | null; created_at: string };
type Doc = { id: string; storage_path: string; file_name: string; doc_type: string; created_at: string };

export default async function RequestDetailPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sent?: string }>;
}) {
  const { id } = await params;
  const { sent } = await searchParams;
  const { supabase, company } = await getSession();
  if (!company) redirect("/portal");

  const [{ data: req }, { data: items }, { data: history }, { data: docs }] = await Promise.all([
    supabase.rpc("get_my_requests").eq("id", id).maybeSingle(),
    supabase.rpc("get_my_request_items").eq("request_id", id),
    supabase.rpc("get_my_request_history").eq("request_id", id).order("created_at"),
    supabase.rpc("get_my_documents").eq("request_id", id).order("created_at"),
  ]);
  if (!req) notFound();
  const r = req as Req;
  await logActivity(supabase, "view_request", `/portal/requests/${id}`, { number: r.number, status: r.status });
  const lines = (items ?? []) as Item[];
  const files = (docs ?? []) as Doc[];
  const { data: signed } = files.length
    ? await supabase.storage.from("documents").createSignedUrls(files.map((d) => d.storage_path), 600)
    : { data: [] };
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  const confirmed = lines.some((l) => l.confirmed_qty !== null || l.confirmed_unit_price !== null);
  const priceOf = (l: Item) => l.confirmed_unit_price ?? l.unit_price_snapshot;
  const total = lines.reduce((s, l) => s + (l.confirmed_qty ?? l.requested_qty) * Number(priceOf(l) ?? 0), 0);
  const openPrices = lines.some((l) => priceOf(l) === null);
  const canCancel = ["new", "in_review", "offer_sent"].includes(r.status);

  return (
    <div className="space-y-6">
      {sent && (
        <div className="card border-emerald-300 bg-emerald-50 text-sm text-emerald-900">
          Thank you, your request was sent. We will get back to you with an offer.
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/portal/requests" className="text-sm text-slate-500 hover:underline">← My requests</Link>
          <h1 className="text-2xl font-bold">Request {r.number}</h1>
          <p className="text-sm text-slate-600">
            Sent {displayDate(r.created_at)}
            {r.delivery_country && ` · delivery to ${r.delivery_country}`}
            {r.seller && ` · invoiced by ${SELLER_LABEL[r.seller] ?? r.seller}`}
          </p>
        </div>
        <StatusBadge status={r.status} />
      </div>

      <div className="card space-y-3">
        <p className="text-sm">{STATUS_HINT[r.status]}</p>
        {r.status === "offer_sent" && (
          <div className="flex flex-wrap gap-2">
            <form action={respondAction}>
              <input type="hidden" name="request_id" value={r.id} />
              <input type="hidden" name="accept" value="true" />
              <button className="btn-primary">Accept offer</button>
            </form>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Product</th><th className="px-3 py-2">Batch</th><th className="px-3 py-2">Expiry</th>
              <th className="px-3 py-2 text-right">Requested</th>
              {confirmed && <th className="px-3 py-2 text-right">Confirmed</th>}
              <th className="px-3 py-2 text-right">Price / pack</th><th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((l) => {
              const qty = l.confirmed_qty ?? l.requested_qty;
              const price = priceOf(l);
              const priceChanged = l.confirmed_unit_price !== null && l.unit_price_snapshot !== null &&
                Number(l.confirmed_unit_price) !== Number(l.unit_price_snapshot);
              return (
                <tr key={l.id}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{l.trade_name}</div>
                    <div className="text-xs text-slate-500">{[l.strength, l.pack_size, l.manufacturer].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{l.batch || "–"}</td>
                  <td className="px-3 py-2">{displayDate(l.expiry_date)}</td>
                  <td className="px-3 py-2 text-right">{l.requested_qty}</td>
                  {confirmed && (
                    <td className={`px-3 py-2 text-right ${l.confirmed_qty !== null && l.confirmed_qty !== l.requested_qty ? "font-medium text-amber-700" : ""}`}>
                      {l.confirmed_qty ?? "–"}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right">
                    {price === null ? <span className="text-slate-500">On request</span> : eur(price)}
                    {priceChanged && <div className="text-xs text-slate-400 line-through">{eur(l.unit_price_snapshot)}</div>}
                  </td>
                  <td className="px-3 py-2 text-right">{price === null ? "–" : eur(qty * Number(price))}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={confirmed ? 6 : 5} className="px-3 py-2 text-right font-medium">
                {confirmed ? "Total" : "Indicative total"}
                {openPrices && <span className="font-normal text-slate-500"> (plus items with price on request)</span>}
              </td>
              <td className="px-3 py-2 text-right font-bold">{eur(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {r.customer_comment && <p className="text-sm text-slate-600">Your comment: {r.customer_comment}</p>}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="card space-y-3">
          <h2 className="font-bold">Documents</h2>
          {files.length === 0 ? (
            <p className="text-sm text-slate-500">No documents yet. Proforma and shipping documents will appear here.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {files.map((d) => (
                <li key={d.id}>
                  <a href={urlByPath.get(d.storage_path) ?? "#"} target="_blank" rel="noreferrer" className="text-brand-600 underline">
                    {d.file_name}
                  </a>{" "}
                  <span className="text-slate-500">· {DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type} · {displayDate(d.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card space-y-3">
          <h2 className="font-bold">History</h2>
          <ol className="space-y-2 text-sm">
            {((history ?? []) as History[]).map((h) => (
              <li key={h.id}>
                <span className="font-medium">{STATUS_LABEL[h.new_status]}</span>
                <span className="text-slate-500"> · {displayDate(h.created_at)}</span>
                {h.note && <p className="mt-0.5 whitespace-pre-line text-slate-600">{h.note}</p>}
              </li>
            ))}
          </ol>
        </div>
      </div>

      {canCancel && (
        <form action={respondAction}>
          <input type="hidden" name="request_id" value={r.id} />
          <input type="hidden" name="accept" value="false" />
          <button className="btn-danger">Cancel request</button>
        </form>
      )}
    </div>
  );
}
