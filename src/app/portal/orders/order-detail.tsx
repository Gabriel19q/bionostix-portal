import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { CATEGORY_LABEL } from "@/lib/categories";
import { DOC_KIND_LABEL, type DocKind } from "@/lib/categories";
import { displayDate, displayDateTime, eur } from "@/lib/format";
import { EVENT_LABEL, ORDER_DOC_KIND, ORDER_STATUS, productLine, type Order } from "@/lib/orders";
import { SubmitButton } from "@/components/submit-button";
import { answerCounterAction, respondOrderAction, setProgressAction, withdrawOrderAction } from "./actions";
import { OrderUpload } from "./order-upload";

const DEAL = ["accepted", "paid", "shipped", "completed"];

// One order, as the buyer or the seller sees it. The database decides what each side may see.
export async function OrderDetail({ id, side, sent, error }: { id: string; side: "buyer" | "seller"; sent?: boolean; error?: string }) {
  const { supabase } = await getSession();
  const { data } = await supabase.rpc("get_my_order", { p_id: id });
  const o = data as Order | null;
  if (!o || o.side !== side) notFound();

  const paths = [...o.documents.map((d) => d.storage_path), ...(o.buyer?.documents ?? []).map((d) => d.storage_path)];
  const { data: signed } = paths.length ? await supabase.storage.from("documents").createSignedUrls(paths, 600) : { data: [] };
  const url = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const st = ORDER_STATUS[o.status];
  const p = o.product;
  const back = side === "buyer" ? { href: "/portal/requests", label: "My orders" } : { href: "/portal/sell/orders", label: "Incoming orders" };
  const isDeal = DEAL.includes(o.status);

  return (
    <div className="space-y-6">
      {sent && <div className="notice-success">Your binding request was sent. The seller will accept, decline or make a counter-offer. We inform you by email.</div>}
      {error && <div className="notice-error">{error}</div>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={back.href} className="text-sm text-brand-600 underline">← {back.label}</Link>
          <h1 className="mt-2 text-2xl font-bold">{p.product_name}</h1>
          <p className="text-sm text-slate-600">{o.number} · {CATEGORY_LABEL[o.category]} · sent {displayDate(o.created_at)}</p>
        </div>
        <span className={st.tag}>{st.label}</span>
      </div>

      {/* What to do now */}
      {side === "buyer" && o.status === "countered" && (
        <div className="card space-y-3 bg-sand">
          <h2 className="font-bold">Counter-offer from the seller</h2>
          <p className="text-sm">
            {o.counter_quantity ?? o.quantity} packs at {eur(o.counter_price ?? o.unit_price)} per pack
            {" "}= <strong>{eur((o.counter_quantity ?? o.quantity) * (o.counter_price ?? o.unit_price))}</strong>
            {" "}(your request: {o.quantity} packs at {eur(o.unit_price)})
          </p>
          {o.counter_note && <p className="text-sm whitespace-pre-line text-slate-700">“{o.counter_note}”</p>}
          <p className="text-xs text-slate-600">
            If you accept, the contract is concluded on these terms and according to the{" "}
            <Link href="/terms" target="_blank" className="text-brand-600 underline">terms and conditions</Link>.
          </p>
          <div className="flex flex-wrap gap-2">
            <form action={answerCounterAction}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="accept" value="yes" />
              <SubmitButton pendingText="Accepting…">Accept counter-offer</SubmitButton></form>
            <form action={answerCounterAction}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="accept" value="no" />
              <SubmitButton pendingText="Declining…" className="btn-secondary">Decline</SubmitButton></form>
          </div>
        </div>
      )}
      {side === "seller" && o.status === "requested" && (
        <div className="card space-y-4 bg-sand">
          <h2 className="font-bold">Answer this binding request</h2>
          <p className="text-sm text-slate-600">
            If you accept, the contract is concluded according to the{" "}
            <Link href="/terms" target="_blank" className="text-brand-600 underline">terms and conditions</Link> and you receive the
            buyer&apos;s company name, address and licences.
            Please then issue your invoice or order confirmation to this company and upload it here.
          </p>
          <form action={respondOrderAction}>
            <input type="hidden" name="id" value={o.id} /><input type="hidden" name="action" value="accept" />
            <SubmitButton pendingText="Accepting…">Accept – {o.quantity} packs at {eur(o.unit_price)}</SubmitButton>
          </form>
          <details className="rounded-lg border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-bold">Make a counter-offer</summary>
            <form action={respondOrderAction} className="mt-3 grid gap-3 md:grid-cols-3">
              <input type="hidden" name="id" value={o.id} /><input type="hidden" name="action" value="counter" />
              <div><label className="label" htmlFor="c-qty">Quantity (packs)</label>
                <input id="c-qty" name="quantity" className="input" inputMode="numeric" defaultValue={o.quantity} /></div>
              <div><label className="label" htmlFor="c-price">Price per pack (EUR)</label>
                <input id="c-price" name="price" className="input" inputMode="decimal" defaultValue={o.unit_price} /></div>
              <div className="md:col-span-3"><label className="label" htmlFor="c-note">Message to the buyer (optional)</label>
                <input id="c-note" name="note" className="input" maxLength={1000} placeholder="e.g. Only 800 packs left at this expiry" /></div>
              <label className="flex items-center gap-2 text-sm md:col-span-3">
                <input type="checkbox" name="update_listing" /> Also update my offer in the catalog with this quantity and price
              </label>
              <div className="md:col-span-3"><SubmitButton pendingText="Sending…" className="btn-secondary">Send counter-offer</SubmitButton></div>
            </form>
          </details>
          <details className="rounded-lg border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-bold">Decline</summary>
            <form action={respondOrderAction} className="mt-3 space-y-3">
              <input type="hidden" name="id" value={o.id} /><input type="hidden" name="action" value="decline" />
              <div><label className="label" htmlFor="d-reason">Reason (optional, the buyer sees it)</label>
                <input id="d-reason" name="reason" className="input" maxLength={1000} placeholder="e.g. Sold out" /></div>
              <SubmitButton pendingText="Declining…" className="btn-secondary">Decline request</SubmitButton>
            </form>
          </details>
        </div>
      )}
      {side === "seller" && o.status === "countered" && (
        <div className="notice-info">Your counter-offer ({o.counter_quantity} packs at {eur(o.counter_price ?? 0)}) is waiting for the buyer.</div>
      )}
      {side === "buyer" && o.status === "requested" && (
        <div className="notice-info flex flex-wrap items-center justify-between gap-3">
          <span>Waiting for the seller. You can withdraw your request until the seller accepts it.</span>
          <form action={withdrawOrderAction}><input type="hidden" name="id" value={o.id} />
            <SubmitButton pendingText="Withdrawing…" className="btn-secondary">Withdraw request</SubmitButton></form>
        </div>
      )}
      {side === "buyer" && o.status === "accepted" && !o.seller.name && (
        <div className="notice-success">The seller accepted. The contract is concluded. The seller will send you the invoice or order confirmation here.</div>
      )}
      {o.status === "declined" && o.decline_reason && <div className="notice-info">Reason: {o.decline_reason}</div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card space-y-3 lg:col-span-2">
          <h2 className="font-bold">Order</h2>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2"><dt className="text-xs font-bold text-slate-600">Product</dt>
              <dd>{p.product_name} · {p.brand}{p.name_on_pack && p.name_on_pack !== p.product_name ? ` (on pack: ${p.name_on_pack})` : ""}<br />
                <span className="text-slate-600">{productLine(p)}</span></dd></div>
            <div><dt className="text-xs font-bold text-slate-600">Quantity</dt><dd>{o.quantity} packs</dd></div>
            <div><dt className="text-xs font-bold text-slate-600">Price per pack</dt><dd>{eur(o.unit_price)}</dd></div>
            <div><dt className="text-xs font-bold text-slate-600">Total</dt><dd className="font-bold">{eur(o.total)}</dd></div>
            <div><dt className="text-xs font-bold text-slate-600">Delivery terms</dt><dd>{p.incoterm} {p.incoterm_place}</dd></div>
            <div><dt className="text-xs font-bold text-slate-600">Expiry</dt>
              <dd>{p.expiry_date ? displayDate(p.expiry_date) : p.min_shelf_life_months ? `min. ${p.min_shelf_life_months} months` : "–"}</dd></div>
            <div><dt className="text-xs font-bold text-slate-600">Packaging</dt><dd>{p.packaging_language ?? "–"}</dd></div>
            <div><dt className="text-xs font-bold text-slate-600">Delivery country</dt><dd>{o.delivery_country}</dd></div>
            <div><dt className="text-xs font-bold text-slate-600">Final destination</dt><dd>{o.final_destination}</dd></div>
            <div><dt className="text-xs font-bold text-slate-600">Needed by</dt><dd>{o.needed_by ? displayDate(o.needed_by) : "–"}</dd></div>
            <div><dt className="text-xs font-bold text-slate-600">Documents required</dt><dd>{o.required_documents.join(", ") || "–"}</dd></div>
            {o.tracking && <div><dt className="text-xs font-bold text-slate-600">Tracking</dt><dd>{o.tracking}</dd></div>}
            {o.comment && <div className="sm:col-span-2"><dt className="text-xs font-bold text-slate-600">Comment from the buyer</dt><dd className="whitespace-pre-line">{o.comment}</dd></div>}
          </dl>
        </div>

        <div className="card space-y-2 text-sm">
          {side === "buyer" ? (
            <>
              <h2 className="font-bold">Seller</h2>
              {o.seller.name ? (
                <>
                  <p className="font-bold">{o.seller.name}</p>
                  <p className="whitespace-pre-line text-slate-700">{o.seller.address}</p>
                  <p className="text-slate-700">{o.seller.country}{o.seller.vat_id ? ` · VAT ${o.seller.vat_id}` : ""}</p>
                  {o.seller.contact_email && <p><a href={`mailto:${o.seller.contact_email}`} className="text-brand-600 underline">{o.seller.contact_email}</a></p>}
                  {o.seller.contact_phone && <p>{o.seller.contact_phone}</p>}
                  <p className="text-xs text-slate-600">Please pay the seller directly as stated on the invoice.</p>
                </>
              ) : (
                <>
                  <p>Seller {o.seller.code} · {o.seller.country}</p>
                  <p className="text-xs text-slate-600">Licence verified by Bionostix. You will see the seller&apos;s name with the invoice or order confirmation.</p>
                </>
              )}
            </>
          ) : (
            <>
              <h2 className="font-bold">Buyer</h2>
              {o.buyer?.name ? (
                <>
                  <p className="font-bold">{o.buyer.name}</p>
                  <p className="whitespace-pre-line text-slate-700">{o.buyer.address}</p>
                  <p className="text-slate-700">{o.buyer.country}{o.buyer.vat_id ? ` · VAT ${o.buyer.vat_id}` : ""}</p>
                  {o.buyer.contact_name && <p>{o.buyer.contact_name}</p>}
                  {o.buyer.contact_email && <p><a href={`mailto:${o.buyer.contact_email}`} className="text-brand-600 underline">{o.buyer.contact_email}</a></p>}
                  {o.buyer.contact_phone && <p>{o.buyer.contact_phone}</p>}
                  {(o.buyer.documents ?? []).length > 0 && (
                    <div className="pt-2">
                      <p className="text-xs font-bold text-slate-600">Licences and company documents</p>
                      <ul className="space-y-1">
                        {o.buyer.documents!.map((d) => (
                          <li key={d.storage_path}>
                            <a href={url.get(d.storage_path) ?? "#"} target="_blank" rel="noreferrer" className="text-brand-600 underline">{d.file_name}</a>
                            <span className="text-xs text-slate-500"> · {d.kind ? DOC_KIND_LABEL[d.kind as DocKind] ?? d.kind : "Document"}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="pt-2 text-xs text-slate-600">Please issue your invoice or order confirmation to this company.</p>
                </>
              ) : (
                <>
                  <p>Licence verified by Bionostix{o.buyer?.licence_valid_until ? `, valid until ${displayDate(o.buyer.licence_valid_until)}` : ""}</p>
                  <p>Based in {o.buyer?.country}</p>
                  <p>{o.buyer?.completed_deals ?? 0} completed deal(s) on the platform</p>
                  <p className="text-xs text-slate-600">After you accept, you receive the company name, address and licence documents.</p>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {side === "seller" && ["accepted", "paid", "shipped"].includes(o.status) && (
        <div className="card space-y-3">
          <h2 className="font-bold">Progress</h2>
          <div className="flex flex-wrap items-end gap-3">
            {o.status === "accepted" && (
              <form action={setProgressAction}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="status" value="paid" />
                <SubmitButton pendingText="Saving…" className="btn-secondary">Payment received</SubmitButton></form>
            )}
            {["accepted", "paid"].includes(o.status) && (
              <form action={setProgressAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={o.id} /><input type="hidden" name="status" value="shipped" />
                <div><label className="label" htmlFor="tracking">Tracking number (optional)</label>
                  <input id="tracking" name="tracking" className="input" maxLength={200} /></div>
                <SubmitButton pendingText="Saving…" className="btn-secondary">Shipped</SubmitButton>
              </form>
            )}
            {o.status === "shipped" && (
              <form action={setProgressAction}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="status" value="completed" />
                <SubmitButton pendingText="Saving…" className="btn-secondary">Completed</SubmitButton></form>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card space-y-3">
          <h2 className="font-bold">Documents</h2>
          {o.documents.length === 0 ? <p className="text-sm text-slate-600">No documents yet.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {o.documents.map((d) => (
                <li key={d.id} className="flex justify-between gap-3 py-2">
                  <a href={url.get(d.storage_path) ?? "#"} target="_blank" rel="noreferrer" className="truncate text-brand-600 underline">{d.file_name}</a>
                  <span className="shrink-0 text-xs text-slate-500">{ORDER_DOC_KIND[d.kind] ?? d.kind} · {displayDate(d.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
          {isDeal ? <OrderUpload orderId={o.id} side={side} />
            : <p className="text-xs text-slate-600">Documents can be exchanged after the request is accepted.</p>}
        </div>
        <div className="card space-y-3">
          <h2 className="font-bold">History</h2>
          <ol className="space-y-2 text-sm">
            {(o.events ?? []).map((e, i) => (
              <li key={i}>
                <span className="font-medium">{EVENT_LABEL[e.event] ?? e.event}</span>
                <span className="text-xs text-slate-500"> · {displayDateTime(e.created_at)}</span>
                {e.note && <span className="block text-xs text-slate-600">{e.note}</span>}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
