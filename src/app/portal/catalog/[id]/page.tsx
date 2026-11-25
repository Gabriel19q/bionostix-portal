import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession, isApprovedBuyer } from "@/lib/session";
import { COUNTRIES, matchCountry } from "@/lib/countries";
import { displayDate, eur } from "@/lib/format";
import { offerHeading, offerSpec, type MarketOffer } from "@/lib/market";
import { SubmitButton } from "@/components/submit-button";
import { submitOrderAction } from "../../orders/actions";

// Binding request to one offer (SPEC.md "Anfrage und Vertrag", step 1)
export default async function SendRequestPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }>;
}) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const { supabase, user, account } = await getSession();
  if (!user) redirect("/login");
  if (!isApprovedBuyer(account)) redirect("/portal/catalog");
  const { data } = await supabase.rpc("get_market_catalog");
  const o = ((data ?? []) as MarketOffer[]).find((x) => x.id === id);
  if (!o) notFound();
  const home = matchCountry(account?.sites[0]?.country ?? "");
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/portal/catalog" className="text-sm text-brand-600 underline">← Product offering</Link>
        <h1 className="mt-2 text-2xl font-bold">Send a request</h1>
      </div>
      {error && <div className="notice-error">{error}</div>}
      <div className="card space-y-1 text-sm">
        <p className="text-lg font-bold">{offerHeading(o)}</p>
        <p>{offerSpec(o)} · {o.product_name} · {o.brand}</p>
        <p className="text-slate-600">
          {eur(o.price)} per pack · {o.quantity} packs available{o.moq ? ` · MOQ ${o.moq}` : ""} · {o.incoterm} {o.incoterm_place}
          {" "}· expiry {o.expiry_date ? displayDate(o.expiry_date) : `min. ${o.min_shelf_life_months} months`} · Seller {o.seller_code}
        </p>
      </div>
      <form action={submitOrderAction} className="card space-y-4">
        <input type="hidden" name="listing_id" value={o.id} />
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="quantity">Quantity (packs) <span className="text-danger">*</span></label>
            <input id="quantity" name="quantity" type="number" className="input" required min={o.moq ?? 1} max={o.quantity} defaultValue={o.moq ?? ""} />
            <p className="mt-1 text-xs text-slate-500">{o.moq ? `At least ${o.moq}, ` : ""}at most {o.quantity}</p>
          </div>
          <div>
            <label className="label" htmlFor="needed_by">Latest delivery date</label>
            <input id="needed_by" name="needed_by" type="date" className="input" min={tomorrow} />
          </div>
          <div>
            <label className="label" htmlFor="delivery_country">Delivery country <span className="text-danger">*</span></label>
            <select id="delivery_country" name="delivery_country" className="input" required defaultValue={home}>
              <option value="">Please choose</option>
              {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="final_destination">Final destination (end market)</label>
            <select id="final_destination" name="final_destination" className="input" defaultValue="">
              <option value="">Same as delivery country</option>
              {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <p className="mt-1 text-xs text-slate-500">The country where the goods will finally be sold</p>
          </div>
        </div>
        {(o.documents_available ?? []).length > 0 && (
          <fieldset className="space-y-2">
            <legend className="label">Documents you need</legend>
            <p className="text-xs text-slate-500">Please select only documents you strictly need.</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {o.documents_available!.map((d) => (
                <label key={d} className="flex items-center gap-1.5"><input type="checkbox" name="required_documents" value={d} /> {d}</label>
              ))}
            </div>
          </fieldset>
        )}
        <div>
          <label className="label" htmlFor="comment">Comment for the seller (optional)</label>
          <textarea id="comment" name="comment" className="input min-h-20" maxLength={2000}
            placeholder="e.g. further requirements. Please do not enter your company name – you stay anonymous until the seller accepts." />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" required className="mt-1" />
          <span>
            I understand that this request is <strong>binding</strong>: when the seller accepts it, a contract is concluded directly
            between my company and the seller according to the{" "}
            <Link href="/terms" target="_blank" className="text-brand-600 underline">terms and conditions</Link>. I can withdraw it until the seller accepts.
          </span>
        </label>
        <SubmitButton pendingText="Sending…">Send binding request</SubmitButton>
      </form>
    </div>
  );
}
