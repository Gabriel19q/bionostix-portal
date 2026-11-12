import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { displayDate, displayDateTime, eur, today } from "@/lib/format";
import {
  DOC_TYPE_LABEL, SELLER_LABEL, STATUS_FLOW, STATUS_LABEL, StatusBadge, type RequestStatus,
} from "@/lib/status";
import { changeStatus, saveItems, saveMeta, sendCounterOffer } from "../actions";
import { RequestDocumentUpload } from "./request-document-upload";

type Item = {
  id: string;
  requested_qty: number;
  min_expiry_date: string | null;
  unit_price_snapshot: number | null;
  confirmed_qty: number | null;
  confirmed_unit_price: number | null;
  request_item_costs: { purchase_price_snapshot: number | null } | null;
  offers: {
    batch: string;
    expiry_date: string | null;
    available_qty: number | null;
    coa_available: boolean | null;
    products: { trade_name: string; strength: string | null; pack_size: string | null; is_narcotic: boolean; manufacturers: { name: string } | null };
  };
};
type Req = {
  id: string; number: string; status: RequestStatus; seller: string | null; customer_comment: string | null;
  delivery_country: string | null; delivery_deadline: string | null; payment_due_date: string | null; internal_note: string | null; created_at: string;
  companies: { id: string; name: string; country: string; contact_name: string | null; contact_email: string | null; contact_phone: string | null };
};

// Suggested next step; "Changes to accept" is only chosen on purpose, so it is skipped here.
function nextStatus(s: RequestStatus): RequestStatus {
  // Changes are only proposed on purpose; from "in review" the usual next step is the proforma
  const flow = STATUS_FLOW.filter((x) => x !== "changes_proposed" && x !== "changes_accepted");
  const i = flow.indexOf(s === "changes_proposed" || s === "changes_accepted" ? "in_review" : s);
  return i >= 0 && i < flow.length - 1 ? flow[i + 1] : s;
}

export default async function AdminRequestPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error: pageError } = await searchParams;
  const { supabase } = await getSession();
  const [{ data: req }, { data: items }, { data: history }, { data: docs }] = await Promise.all([
    supabase.from("requests")
      .select("id, number, status, seller, customer_comment, delivery_country, delivery_deadline, payment_due_date, internal_note, created_at, companies(id, name, country, contact_name, contact_email, contact_phone)")
      .eq("id", id).maybeSingle<Req>(),
    supabase.from("request_items")
      .select("id, requested_qty, min_expiry_date, unit_price_snapshot, confirmed_qty, confirmed_unit_price, request_item_costs(purchase_price_snapshot), offers(batch, expiry_date, available_qty, coa_available, products(trade_name, strength, pack_size, is_narcotic, manufacturers(name)))")
      .eq("request_id", id).returns<Item[]>(),
    supabase.from("request_status_history").select("id, new_status, note, created_at, changed_by").eq("request_id", id).order("created_at").order("id"),
    supabase.from("documents").select("id, storage_path, file_name, doc_type, created_at").eq("request_id", id).order("created_at"),
  ]);
  if (!req) notFound();
  const overdue = req.status === "proforma_sent" && !!req.payment_due_date && req.payment_due_date < today();
  const lines = items ?? [];
  const files = docs ?? [];
  const { data: signed } = files.length
    ? await supabase.storage.from("documents").createSignedUrls(files.map((d) => d.storage_path), 600)
    : { data: [] };
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  // Margin only where both sale and purchase price are known
  let value = 0, cost = 0, marginValue = 0;
  for (const l of lines) {
    const qty = l.confirmed_qty ?? l.requested_qty;
    const price = l.confirmed_unit_price ?? l.unit_price_snapshot;
    const purchase = l.request_item_costs?.purchase_price_snapshot ?? null;
    if (price !== null) value += qty * Number(price);
    if (price !== null && purchase !== null) {
      cost += qty * Number(purchase);
      marginValue += qty * Number(price);
    }
  }
  const openPrices = lines.some((l) => (l.confirmed_unit_price ?? l.unit_price_snapshot) === null);
  const c = req.companies;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/requests" className="text-sm text-slate-500 hover:underline">← Requests</Link>
          <h1 className="text-2xl font-bold">Request {req.number}</h1>
          <p className="text-sm text-slate-600">
            {c.name} ({c.country}) · {c.contact_name} · {c.contact_email}{c.contact_phone && ` · ${c.contact_phone}`}
          </p>
          <p className="text-sm text-slate-600">
            Received {displayDateTime(req.created_at)}{req.delivery_country && ` · delivery to ${req.delivery_country}`}
          </p>
          {req.delivery_deadline && (
            <p className="mt-1 text-sm"><span className="font-bold">Delivery deadline:</span> {displayDate(req.delivery_deadline)}</p>
          )}
          {req.payment_due_date && (
            <p className="mt-1 text-sm">
              <span className="font-bold">Reserved until / payment due:</span>{" "}
              {overdue ? (
                <span className="font-bold text-danger">{displayDate(req.payment_due_date)} · Payment overdue: cancel the proforma?</span>
              ) : displayDate(req.payment_due_date)}
            </p>
          )}
        </div>
        <StatusBadge status={req.status} viewer="admin" />
      </div>
      {pageError === "prices" && (
        <div className="notice-error">
          Some lines have no price yet (“on request”). Enter a confirmed price for every line and save first.
        </div>
      )}
      {pageError === "changes" && (
        <div className="notice-error">
          Confirmed quantities or prices differ from the order request. Set “Changes to accept” first, so the customer
          can accept the changes. Send the proforma after they accepted.
        </div>
      )}
      {pageError === "nochanges" && (
        <div className="notice-error">
          Nothing differs from the order request. Upload the proforma and set “Proforma sent” instead.
        </div>
      )}
      {pageError === "counterstatus" && (
        <div className="notice-error">A counter-offer is only possible before the proforma is sent.</div>
      )}
      {pageError === "due" && (
        <div className="notice-error">
          Enter the date until which the manufacturer reserves the goods. It is the payment deadline on the proforma.
        </div>
      )}
      {pageError === "proforma" && (
        <div className="notice-error">Upload the proforma invoice below (type “Proforma invoice”) before setting “Proforma sent”.</div>
      )}
      {req.customer_comment && (
        <div className="card text-sm"><span className="font-medium">Customer comment:</span> {req.customer_comment}</div>
      )}

      <form action={saveItems} className="space-y-3">
        <input type="hidden" name="request_id" value={req.id} />
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Product</th><th className="px-3 py-2">Batch</th>
                <th className="px-3 py-2 text-right">Requested</th><th className="px-3 py-2 text-right">In stock now</th>
                <th className="px-3 py-2 text-right">Confirmed packs</th>
                <th className="px-3 py-2 text-right">Purchase</th><th className="px-3 py-2 text-right">Requested at</th>
                <th className="px-3 py-2 text-right">Confirmed price</th><th className="px-3 py-2 text-right">Line margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l) => {
                const p = l.offers.products;
                const qty = l.confirmed_qty ?? l.requested_qty;
                const price = l.confirmed_unit_price ?? l.unit_price_snapshot;
                const purchase = l.request_item_costs?.purchase_price_snapshot ?? null;
                return (
                  <tr key={l.id}>
                    <td className="px-3 py-2">
                      <input type="hidden" name="item_id" value={l.id} />
                      <div className="font-medium">{p.trade_name}</div>
                      <div className="text-xs text-slate-500">
                        {[p.strength, p.pack_size, p.manufacturers?.name].filter(Boolean).join(" · ")}
                        {p.is_narcotic && <span className="ml-1 font-bold text-slate-900">· BtM: check permits</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {l.offers.batch || "–"}<div className="font-sans text-slate-500">exp. {displayDate(l.offers.expiry_date)}</div>
                      {l.min_expiry_date && (
                        <div className="font-sans"><span className="mark-attention">min. exp. {displayDate(l.min_expiry_date)}</span></div>
                      )}
                      <div className="font-sans text-slate-500">
                        COA: {l.offers.coa_available === true ? "yes" : l.offers.coa_available === false ? "no" : "not specified"}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">{l.requested_qty}</td>
                    <td className={`px-3 py-2 text-right ${l.offers.available_qty !== null && l.offers.available_qty < l.requested_qty ? "font-bold text-danger" : "text-slate-500"}`}>
                      {l.offers.available_qty ?? "on request"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input name={`qty_${l.id}`} className="input w-24 py-1 text-right" defaultValue={l.confirmed_qty ?? ""}
                        placeholder={String(l.requested_qty)} />
                    </td>
                    <td className="px-3 py-2 text-right text-slate-500">{purchase === null ? "open" : eur(purchase)}</td>
                    <td className="px-3 py-2 text-right">{l.unit_price_snapshot === null ? "on request" : eur(l.unit_price_snapshot)}</td>
                    <td className="px-3 py-2 text-right">
                      <input name={`price_${l.id}`} className="input w-28 py-1 text-right" defaultValue={l.confirmed_unit_price ?? ""}
                        placeholder={l.unit_price_snapshot === null ? "enter price" : String(l.unit_price_snapshot)} />
                    </td>
                    <td className={`px-3 py-2 text-right ${price !== null && purchase !== null && Number(price) < Number(purchase) ? "font-bold text-danger" : ""}`}>{price === null || purchase === null ? "–" : eur(qty * (Number(price) - Number(purchase)))}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="text-sm">
              <tr>
                <td colSpan={7} className="px-3 py-2 text-right">
                  Value {eur(value)}{openPrices && <> · <span className="mark-attention">some prices still open</span></>}
                </td>
                <td colSpan={2} className={`px-3 py-2 text-right font-bold ${marginValue - cost < 0 ? "text-danger" : ""}`}>
                  Margin {eur(marginValue - cost)}{marginValue > 0 && ` (${Math.round(((marginValue - cost) / marginValue) * 100)}%)`}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-secondary">Save quantities and prices</button>
          <p className="text-xs text-slate-500">Empty fields mean “as requested”. The customer sees confirmed values.</p>
        </div>
        {["new", "in_review", "changes_proposed"].includes(req.status) && (
          <div className="card space-y-3">
            <h2 className="font-bold">Counter-offer</h2>
            <p className="text-sm text-slate-600">
              Change confirmed packs or prices above if stock or price differ from the request, then send them to the
              customer. They accept or cancel in the portal; after acceptance you send the proforma.
            </p>
            <div>
              <label className="label" htmlFor="counter_message">Message to the customer (optional)</label>
              <textarea id="counter_message" name="counter_message" rows={2} className="input"
                placeholder="e.g. Only 80 pens available now, the rest in 3 weeks." />
            </div>
            <button formAction={sendCounterOffer} className="btn-primary">Send counter-offer</button>
          </div>
        )}
      </form>

      <div className="grid gap-6 md:grid-cols-2">
        <form action={changeStatus} className="card space-y-3">
          <input type="hidden" name="request_id" value={req.id} />
          <h2 className="font-bold">Change status</h2>
          <div>
            <label className="label">New status</label>
            <select name="status" className="input" defaultValue={nextStatus(req.status)}>
              {(Object.keys(STATUS_LABEL) as RequestStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="payment_due">Reserved until = payment deadline (for “Proforma sent”)</label>
            <input id="payment_due" name="payment_due" type="date" className="input" min={today()}
              defaultValue={req.payment_due_date ?? ""} />
            <p className="mt-1 text-xs text-slate-600">
              Date until which the manufacturer reserves the goods (e.g. 3 days). The customer sees it only as payment
              deadline: without payment by then, the proforma is cancelled. State the same deadline on the proforma PDF.
            </p>
          </div>
          <div>
            <label className="label">Message to the customer (optional, visible to them)</label>
            <textarea name="message" rows={3} className="input" placeholder="e.g. Batch B2 only 80 packs available, confirmed 80." />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="notify" defaultChecked /> Email the customer
          </label>
          <button className="btn-primary">Update status</button>
          <p className="text-xs text-slate-500">
            The proforma is the order confirmation (it forms the contract). If you changed quantities or prices, set
            “Changes to accept” first and send the proforma once the customer accepted. Upload the proforma below and enter
            the payment deadline before setting “Proforma sent”.
          </p>
        </form>

        <div className="space-y-6">
          <form action={saveMeta} className="card space-y-3">
            <input type="hidden" name="request_id" value={req.id} />
            <h2 className="font-bold">Internal</h2>
            <div>
              <label className="label">Seller on the invoice</label>
              <select name="seller" className="input" defaultValue={req.seller ?? ""}>
                <option value="">Not decided</option>
                {Object.entries(SELLER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Internal note (only admins)</label>
              <textarea name="internal_note" rows={2} className="input" defaultValue={req.internal_note ?? ""} />
            </div>
            <button className="btn-secondary">Save</button>
          </form>

          <div className="card space-y-3">
            <h2 className="font-bold">Documents</h2>
            {files.length === 0 ? (
              <p className="text-sm text-slate-500">No documents yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {files.map((d) => (
                  <li key={d.id}>
                    <a href={urlByPath.get(d.storage_path) ?? "#"} target="_blank" rel="noreferrer" className="text-brand-600 underline">{d.file_name}</a>
                    <span className="text-slate-500"> · {DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type} · {displayDate(d.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
            <RequestDocumentUpload requestId={req.id} />
          </div>
        </div>
      </div>

      <div className="card space-y-2">
        <h2 className="font-bold">History</h2>
        <ol className="space-y-2 text-sm">
          {(history ?? []).map((h) => (
            <li key={h.id}>
              <span className="font-medium">{STATUS_LABEL[h.new_status as RequestStatus]}</span>
              <span className="text-slate-500"> · {displayDateTime(h.created_at)}</span>
              {h.note && <p className="mt-0.5 whitespace-pre-line text-slate-600">{h.note}</p>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
