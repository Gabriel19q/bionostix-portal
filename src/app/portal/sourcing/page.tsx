import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { displayDate } from "@/lib/format";
import { COUNTRIES, matchCountry } from "@/lib/countries";
import { SOURCING_STATUS, type SourcingRequest } from "@/lib/sourcing";
import { SubmitButton } from "@/components/submit-button";
import { submitSourcingAction } from "./actions";

export default async function SourcingPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; product?: string }>;
}) {
  const { sent, error, product } = await searchParams;
  const { supabase, user, profile, company } = await getSession();
  if (!user) redirect("/login");
  if (profile?.role === "admin") redirect("/admin/sourcing");
  if (!company || company.status !== "approved") redirect("/portal");

  const { data } = await supabase.rpc("get_my_sourcing_requests");
  const rows = (data ?? []) as SourcingRequest[];
  await logActivity(supabase, "view_sourcing", "/portal/sourcing");
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sourcing requests</h1>
        <p className="text-sm text-slate-600">
          Looking for a product that is not in the catalog, or have a tender list? Tell us what you need. We check it with
          our European manufacturers and get back to you.
        </p>
      </div>

      {sent && <div className="notice-success">Thank you, we received your sourcing request {sent !== "1" ? sent : ""}.</div>}
      {error && <div className="notice-error">{error}</div>}

      {company.can_request ? (
        <form action={submitSourcingAction} className="card space-y-4">
          <h2 className="font-bold">New sourcing request</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="label" htmlFor="product">Product <span aria-hidden="true">*</span></label>
              <input id="product" name="product" className="input" required maxLength={300} defaultValue={product ?? ""}
                placeholder="e.g. Metformin 1000 mg film-coated tablets, or: Tender list March 2027" />
            </div>
            <div className="md:col-span-2">
              <label className="label" htmlFor="details">Details or full list</label>
              <textarea id="details" name="details" className="input min-h-32" maxLength={20000}
                placeholder={"Strength, pack size, preferred manufacturer, registration requirements …\nFor several products, paste your list here (one product per line)."} />
            </div>
            <div>
              <label className="label" htmlFor="quantity">Quantity</label>
              <input id="quantity" name="quantity" className="input" maxLength={200} placeholder="e.g. 5,000 packs" />
            </div>
            <div>
              <label className="label" htmlFor="target_price">Target price (optional)</label>
              <input id="target_price" name="target_price" className="input" maxLength={200} placeholder="e.g. max. EUR 3.50 per pack" />
            </div>
            <div>
              <label className="label" htmlFor="needed_by">Needed by (optional)</label>
              <input id="needed_by" name="needed_by" type="date" className="input" min={tomorrow} />
            </div>
            <div>
              <label className="label" htmlFor="delivery_country">Delivery country <span aria-hidden="true">*</span></label>
              <select id="delivery_country" name="delivery_country" className="input" required
                defaultValue={matchCountry(company.country)}>
                <option value="">Please choose</option>
                {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <p className="text-xs text-slate-600">
            A sourcing request is not binding. If we find the product, we send you an offer.
          </p>
          <SubmitButton pendingText="Sending…">Send sourcing request</SubmitButton>
        </form>
      ) : (
        <div className="notice-attention">
          Your licence on file has expired. Please send us the renewed licence to send sourcing requests.
        </div>
      )}

      <div className="space-y-3">
        <h2 className="font-bold">Your sourcing requests</h2>
        {rows.length === 0 ? (
          <div className="card text-sm text-slate-600">No sourcing requests yet.</div>
        ) : (
          rows.map((r) => {
            const st = SOURCING_STATUS[r.status];
            return (
              <div key={r.id} className="card space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-bold">{r.product}</div>
                    <div className="text-xs text-slate-600">
                      {r.number} · sent {displayDate(r.created_at)} · to {r.delivery_country}
                      {r.quantity && ` · ${r.quantity}`}
                      {r.needed_by && ` · needed by ${displayDate(r.needed_by)}`}
                    </div>
                  </div>
                  <span className={st.tag}>{st.label}</span>
                </div>
                {r.details && <p className="text-sm whitespace-pre-line text-slate-700">{r.details}</p>}
                {r.reply ? (
                  <div className="notice-info whitespace-pre-line">
                    <span className="font-bold">Message from Bionostix Germany:</span>
                    {"\n"}{r.reply}
                  </div>
                ) : (
                  <p className="text-xs text-slate-600">{st.hint}</p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
