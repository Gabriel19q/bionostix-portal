import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, isApprovedBuyer } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { displayDate, eur } from "@/lib/format";
import { CATEGORY_LABEL, type Category } from "@/lib/categories";
import { SOURCING_STATUS, type SourcingStatus } from "@/lib/sourcing";
import { SubmitButton } from "@/components/submit-button";
import { orderTerms } from "@/lib/wanted";
import { closeProductRequestsAction } from "../sell/actions";

type Request = {
  id: string; number: string; product_name: string; note: string | null; needed_by: string | null;
  delivery_country: string; status: SourcingStatus; reply: string | null; category: Category | null;
  active_ingredients: string | null; dosage_form: string | null; test_parameter: string | null; method: string | null;
  product_type: string | null; size_variant: string | null; units_per_pack: number | null; unit: string | null;
  quantity: number | null; quantity_text: string | null; target_price: number | null; target_price_text: string | null;
  order_type: string | null; delivery_schedule: string | null; partial_deliveries: boolean | null;
  registration_planned: boolean | null; required_documents: string[] | null;
  created_at: string;
};
type Offer = {
  id: string; product_name: string; name_on_pack: string | null; brand: string; active_ingredients: string | null;
  dosage_form: string | null; test_parameter: string | null; method: string | null; product_type: string | null;
  size_variant: string | null; units_per_pack: number | null; unit: string; quantity: number; moq: number | null;
  price: number; expiry_date: string | null; min_shelf_life_months: number | null; incoterm: string;
  incoterm_place: string; valid_until: string; seller_code: string;
};
type Match = { request_id: string; kind: "exact" | "similar"; offer: Offer };

export default async function ProductRequestsPage({ searchParams }: { searchParams: Promise<{ closed?: string }> }) {
  const { closed } = await searchParams;
  const { supabase, user, profile, account } = await getSession();
  if (!user) redirect("/login");
  if (profile?.role === "admin") redirect("/admin/sourcing");
  if (!account?.company || account.company.status !== "approved") redirect("/portal");
  if (!isApprovedBuyer(account)) {
    return (
      <div className="card mx-auto max-w-2xl space-y-2">
        <h1 className="text-xl font-bold">Product requests</h1>
        <p className="text-sm text-slate-600">Product requests are for approved buyers. Your buyer access is not active.</p>
      </div>
    );
  }

  const [{ data: reqData }, { data: matchData }] = await Promise.all([
    supabase.rpc("get_my_product_requests"),
    supabase.rpc("get_my_request_matches"),
  ]);
  await logActivity(supabase, "view_sourcing", "/portal/sourcing");
  const all = (reqData ?? []) as Request[];
  const drafts = all.filter((r) => r.status === "draft");
  const active = all.filter((r) => r.status !== "draft" && r.status !== "closed");
  const done = all.filter((r) => r.status === "closed");
  const matches = (matchData ?? []) as Match[];
  const matchesFor = (id: string) => matches.filter((m) => m.request_id === id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Product requests</h1>
          <p className="max-w-2xl text-sm text-slate-600">
            Tell us which products you are looking for. The portal shows you matching offers from verified sellers right
            away: exact matches and similar ones (for example another pack size or strength). We also check your requests
            with our manufacturers.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/portal/sourcing/upload?manual=1" className="btn-secondary">Add one product request</Link>
          <Link href="/portal/sourcing/upload" className="btn-primary">+ Upload your list</Link>
        </div>
      </div>

      {closed && <p className="notice-success">Product request(s) closed.</p>}
      {drafts.length > 0 && (
        <div className="notice-attention flex flex-wrap items-center justify-between gap-3">
          <span>
            Bionostix prepared {drafts.length} product request(s) from your list. They are not active until you check
            and confirm them.
          </span>
          <Link href="/portal/sourcing/upload?drafts=1" className="btn-primary">Check and confirm</Link>
        </div>
      )}

      {active.length === 0 ? (
        <div className="card text-sm text-slate-600">
          No open product requests. Upload your list of wanted products as it is (Excel or CSV, e.g. a tender list): the
          portal reads it and shows what is still missing.
        </div>
      ) : (
        <form action={closeProductRequestsAction} className="space-y-3">
          {active.map((r) => <RequestCard key={r.id} r={r} matches={matchesFor(r.id)} />)}
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton pendingText="Closing…" className="btn-secondary">Close selected requests</SubmitButton>
            <span className="text-xs text-slate-600">Close requests you no longer need.</span>
          </div>
        </form>
      )}

      {done.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer font-bold">Closed product requests ({done.length})</summary>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {done.map((r) => (
              <li key={r.id} className="py-2">
                {r.product_name} <span className="text-xs text-slate-600">· {r.number} · {displayDate(r.created_at)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function spec(r: { active_ingredients: string | null; dosage_form: string | null; test_parameter: string | null; method: string | null; product_type: string | null; size_variant: string | null; units_per_pack: number | null; unit: string | null }) {
  const pack = r.units_per_pack ? `${r.units_per_pack} ${r.unit ?? ""}`.trim() : null;
  return [r.active_ingredients, r.dosage_form, r.test_parameter, r.method, r.product_type, r.size_variant, pack]
    .filter(Boolean).join(" · ");
}

function RequestCard({ r, matches }: { r: Request; matches: Match[] }) {
  const st = SOURCING_STATUS[r.status];
  const exact = matches.filter((m) => m.kind === "exact");
  const similar = matches.filter((m) => m.kind === "similar");
  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <label className="flex items-start gap-3">
          <input type="checkbox" name="id" value={r.id} className="mt-1" aria-label={`Select ${r.product_name}`} />
          <span>
            <span className="block font-bold">{r.product_name}</span>
            {spec(r) && <span className="block text-sm text-slate-700">{spec(r)}</span>}
            <span className="block text-xs text-slate-600">
              {r.number} · {r.category ? `${CATEGORY_LABEL[r.category]} · ` : ""}
              {r.quantity ? `${r.quantity} packs${r.order_type === "annual" ? " per year" : ""}` : r.quantity_text ?? ""}
              {r.target_price ? ` · target ${eur(r.target_price)} / pack` : r.target_price_text ? ` · target ${r.target_price_text}` : ""}
              {` · to ${r.delivery_country}`}
            </span>
            {orderTerms(r) && <span className="block text-xs text-slate-600">{orderTerms(r)}</span>}
          </span>
        </label>
        <div className="flex items-center gap-2">
          {r.category && <Link href={`/portal/sourcing/upload?edit=${r.id}`} className="text-sm text-brand-600 underline">Edit</Link>}
          <span className={st.tag}>{st.label}</span>
        </div>
      </div>
      {r.note && <p className="text-sm whitespace-pre-line text-slate-700">{r.note}</p>}
      {r.reply && (
        <div className="notice-info whitespace-pre-line">
          <span className="font-bold">Message from Bionostix Germany:</span>
          {"\n"}{r.reply}
        </div>
      )}
      {matches.length === 0 ? (
        <p className="text-xs text-slate-600">No matching offers in the portal yet. {st.hint}</p>
      ) : (
        <div className="space-y-2">
          {exact.length > 0 && <MatchList title={`Exact matches (${exact.length})`} items={exact} />}
          {similar.length > 0 && <MatchList title={`Similar offers (${similar.length})`} items={similar} hint="Same active ingredient or test, but e.g. another strength, form or pack size." />}
        </div>
      )}
    </div>
  );
}

function MatchList({ title, items, hint }: { title: string; items: Match[]; hint?: string }) {
  return (
    <details open={items.length <= 5} className="rounded-lg border border-slate-200">
      <summary className="cursor-pointer bg-slate-50 px-3 py-2 text-sm font-bold">{title}</summary>
      {hint && <p className="px-3 pt-2 text-xs text-slate-600">{hint}</p>}
      <ul className="divide-y divide-slate-100">
        {items.map(({ offer: o }) => (
          <li key={o.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-sm">
            <div>
              <div className="font-bold">{o.product_name} <span className="font-normal text-slate-600">· {o.brand}</span></div>
              {o.name_on_pack && o.name_on_pack !== o.product_name && (
                <div className="text-xs text-slate-600">Name on pack: {o.name_on_pack}</div>
              )}
              <div className="text-xs text-slate-700">{spec(o)}</div>
              <div className="text-xs text-slate-600">
                {o.quantity} packs available{o.moq ? ` · MOQ ${o.moq}` : ""}
                {o.expiry_date ? ` · expiry ${displayDate(o.expiry_date)}` : o.min_shelf_life_months ? ` · min. ${o.min_shelf_life_months} months shelf life` : ""}
                {` · ${o.incoterm} ${o.incoterm_place} · valid until ${displayDate(o.valid_until)}`}
              </div>
              <div className="text-xs text-slate-600">Seller {o.seller_code} · Licence verified by Bionostix</div>
            </div>
            <div className="text-right font-bold">{eur(o.price)}<span className="block text-xs font-normal text-slate-600">per pack</span></div>
          </li>
        ))}
      </ul>
    </details>
  );
}
