import Link from "next/link";
import { getSession } from "@/lib/session";
import { displayDate } from "@/lib/format";
import { SOURCING_STATUS, type SourcingRequest } from "@/lib/sourcing";
import { CATEGORY_LABEL, type Category } from "@/lib/categories";
import { eur } from "@/lib/format";
import { SubmitButton } from "@/components/submit-button";
import { updateSourcingAction } from "./actions";

type Row = SourcingRequest & {
  category: Category | null; active_ingredients: string | null; dosage_form: string | null; test_parameter: string | null;
  method: string | null; product_type: string | null; size_variant: string | null; units_per_pack: number | null;
  unit: string | null; quantity_packs: number | null; target_price_eur: number | null;
  internal_note: string | null;
  companies: { name: string; country: string } | null;
  profiles: { email: string; full_name: string | null } | null;
};

export default async function AdminSourcingPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; saved?: string; notified?: string }>;
}) {
  const { show = "open", saved, notified } = await searchParams;
  const { supabase } = await getSession();
  const { data } = await supabase
    .from("sourcing_requests")
    .select("*, companies(name, country), profiles(email, full_name)")
    .order("created_at", { ascending: false })
    .returns<Row[]>();
  const all = data ?? [];
  const rows = show === "all" ? all : all.filter((r) => r.status !== "closed");
  const openCount = all.filter((r) => r.status === "open").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Product requests</h1>
          <p className="text-sm text-slate-600">
            Products customers are looking for. {openCount > 0 && <strong>{openCount} new.</strong>}
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link href="/admin/sourcing" className={show === "all" ? "btn-secondary" : "btn-primary"}>Not closed</Link>
          <Link href="/admin/sourcing?show=all" className={show === "all" ? "btn-primary" : "btn-secondary"}>All</Link>
        </div>
      </div>

      {saved && (
        <div className="notice-success">
          {saved} saved.{notified ? " The customer was notified by email." : ""}
        </div>
      )}

      {rows.length === 0 && <div className="card text-sm text-slate-600">No sourcing requests here.</div>}

      {rows.map((r) => {
        const st = SOURCING_STATUS[r.status];
        return (
          <form key={r.id} id={r.id} action={updateSourcingAction} className="card space-y-3">
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="show" value={show === "all" ? "all" : ""} />
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-lg font-bold">{r.product}</div>
                <div className="text-sm text-slate-600">
                  {r.number} · {displayDate(r.created_at)} · <strong>{r.companies?.name}</strong> ({r.companies?.country})
                  {r.profiles && ` · ${r.profiles.full_name ?? ""} ${r.profiles.email}`}
                </div>
              </div>
              <span className={st.tag}>{st.label}</span>
            </div>

            {r.status === "draft" && <p className="notice-attention">Prepared by Bionostix: waiting for the buyer to confirm.</p>}
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 md:grid-cols-4">
              {r.category && <div><dt className="text-xs font-bold text-slate-600">Category</dt><dd>{CATEGORY_LABEL[r.category]}</dd></div>}
              {specs(r) && <div className="sm:col-span-3"><dt className="text-xs font-bold text-slate-600">Specification</dt><dd>{specs(r)}</dd></div>}
              <div><dt className="text-xs font-bold text-slate-600">Quantity</dt><dd>{r.quantity_packs ? `${r.quantity_packs} packs` : r.quantity ?? "–"}</dd></div>
              <div><dt className="text-xs font-bold text-slate-600">Target price</dt><dd>{r.target_price_eur ? `${eur(r.target_price_eur)} / pack` : r.target_price ?? "–"}</dd></div>
              <div><dt className="text-xs font-bold text-slate-600">Needed by</dt><dd>{r.needed_by ? displayDate(r.needed_by) : "–"}</dd></div>
              <div><dt className="text-xs font-bold text-slate-600">Delivery country</dt><dd>{r.delivery_country}</dd></div>
            </dl>
            {r.details && (
              <details open={r.details.length < 400}>
                <summary className="cursor-pointer text-sm font-bold">Details / list</summary>
                <p className="mt-1 text-sm whitespace-pre-line">{r.details}</p>
              </details>
            )}

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="label" htmlFor={`status-${r.id}`}>Status</label>
                <select id={`status-${r.id}`} name="status" className="input" defaultValue={r.status}>
                  {Object.entries(SOURCING_STATUS).filter(([k]) => k !== "draft" || r.status === "draft").map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="label" htmlFor={`reply-${r.id}`}>Message to the customer</label>
                <textarea id={`reply-${r.id}`} name="reply" className="input min-h-20" defaultValue={r.reply ?? ""}
                  placeholder="e.g. We can offer 5,000 packs, expiry 06/2028, EUR 3.20 per pack EXW." />
              </div>
              <div className="md:col-span-3">
                <label className="label" htmlFor={`note-${r.id}`}>Internal note (admins only)</label>
                <input id={`note-${r.id}`} name="internal_note" className="input" defaultValue={r.internal_note ?? ""}
                  placeholder="e.g. asked Accord on 18 Nov, cost EUR 2.40" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <SubmitButton>Save</SubmitButton>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="notify" /> Notify the customer by email
              </label>
            </div>
          </form>
        );
      })}
    </div>
  );
}

function specs(r: Row) {
  const pack = r.units_per_pack ? `${r.units_per_pack} ${r.unit ?? ""}`.trim() : null;
  return [r.active_ingredients, r.dosage_form, r.test_parameter, r.method, r.product_type, r.size_variant, pack]
    .filter(Boolean).join(" · ");
}
