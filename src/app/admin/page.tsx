import { getSession } from "@/lib/session";
import { CATEGORIES, CATEGORY_LABEL, DOC_KIND_LABEL, type Category, type DocKind } from "@/lib/categories";
import { COUNTRIES } from "@/lib/countries";
import {
  assignUser, createCompanyAccount, deleteCompany, saveCompanyReview, setCompanyStatus, setStandardCommission,
} from "./actions";

type Approval = "applied" | "approved" | "rejected";
type Company = {
  id: string;
  name: string;
  country: string;
  address: string | null;
  vat_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: "applied" | "approved" | "suspended" | "rejected";
  wants_buy: boolean;
  wants_sell: boolean;
  buy_status: Approval | null;
  sell_status: Approval | null;
  seller_code: string | null;
  seller_description: string | null;
  commission_pct: number | null;
  eudamed_srn: string | null;
  ivdr_duties_confirmed_at: string | null;
  verified_on: string | null;
  internal_note: string | null;
  created_at: string;
};
type Site = { id: string; company_id: string; country: string; address: string | null; status: Approval; licence_valid_until: string | null };
type Cat = { company_id: string; role: "buy" | "sell"; category: Category; status: Approval };
type Consent = { company_id: string | null; kind: string; version: string; accepted_at: string; confirmed_at: string | null; withdrawn_at: string | null };
type User = { id: string; email: string; full_name: string | null; company_id: string | null; created_at: string };
type Doc = { id: string; company_id: string; file_name: string; doc_type: string; kind: DocKind | null; site_id: string | null; storage_path: string };

const STATUS_ORDER = ["applied", "approved", "suspended", "rejected"] as const;
const STATUS_STYLE: Record<Company["status"], string> = {
  applied: "tag-attention",
  approved: "tag-success",
  suspended: "tag-danger",
  rejected: "tag-danger",
};
const CONSENT_LABEL: Record<string, string> = {
  terms: "Terms of use",
  confidentiality: "Confidentiality / non-circumvention",
  commission: "Commission agreement",
  newsletter: "Newsletter",
};

function daysUntil(date: string) {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
}
function fmt(ts: string) {
  return new Date(ts).toLocaleString("en-GB", { timeZone: "Europe/Berlin", dateStyle: "medium", timeStyle: "short" });
}

function ApprovalSelect({ name, value }: { name: string; value: Approval | null }) {
  return (
    <select name={name} className="input py-1" defaultValue={value ?? "applied"}>
      <option value="applied">In review</option>
      <option value="approved">Approved</option>
      <option value="rejected">Rejected</option>
    </select>
  );
}

export default async function AdminPage() {
  const { supabase } = await getSession();

  const [{ data: companies }, { data: sites }, { data: cats }, { data: consents }, { data: docs }, { data: users },
    { data: requestCompanies }, { data: setting }] = await Promise.all([
    supabase.from("companies").select("*").order("created_at", { ascending: false }).returns<Company[]>(),
    supabase.from("company_sites").select("id, company_id, country, address, status, licence_valid_until").order("created_at").returns<Site[]>(),
    supabase.from("company_categories").select("company_id, role, category, status").returns<Cat[]>(),
    supabase.from("consents").select("company_id, kind, version, accepted_at, confirmed_at, withdrawn_at").order("accepted_at").returns<Consent[]>(),
    supabase.from("documents").select("id, company_id, file_name, doc_type, kind, site_id, storage_path")
      .not("company_id", "is", null).order("created_at").returns<Doc[]>(),
    supabase.from("profiles").select("id, email, full_name, company_id, created_at").eq("role", "customer")
      .order("created_at").returns<User[]>(),
    supabase.from("requests").select("company_id"),
    supabase.from("app_settings").select("value").eq("key", "standard_commission_pct").maybeSingle(),
  ]);
  const standardPct = setting?.value as number | undefined;
  const allUsers = users ?? [];
  const companiesWithRequests = new Set((requestCompanies ?? []).map((r) => r.company_id as string));
  const companyOptions = [...(companies ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const usersWithoutCompany = allUsers.filter((u) => !u.company_id);

  const paths = (docs ?? []).map((d) => d.storage_path);
  const { data: signed } = paths.length
    ? await supabase.storage.from("documents").createSignedUrls(paths, 600)
    : { data: [] };
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  const sorted = [...(companies ?? [])].sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
  );
  const openCount = sorted.filter((c) => c.status === "applied").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Companies</h1>
          <p className="text-sm text-slate-600">
            {openCount === 0 ? "No applications waiting." : `${openCount} application(s) waiting for review.`}
          </p>
        </div>
        <form action={setStandardCommission} className="flex items-end gap-2">
          <div>
            <label className="label" htmlFor="std-pct">Standard commission for sellers (%)</label>
            <input id="std-pct" name="pct" className="input w-32" inputMode="decimal" required
              defaultValue={standardPct ?? ""} placeholder="e.g. 3" />
          </div>
          <button className="btn-secondary">Save</button>
        </form>
      </div>

      <details className="card">
        <summary className="cursor-pointer font-bold">Create a company account (e.g. Bionostix or Sanicura as seller)</summary>
        <form action={createCompanyAccount} className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="new-name">Company name</label>
            <input id="new-name" name="name" className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="new-country">Country</label>
            <select id="new-country" name="country" className="input" required defaultValue="Germany">
              {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="wants_buy" /> Buyer</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="wants_sell" defaultChecked /> Seller</label>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            {CATEGORIES.map((c) => (
              <label key={c.value} className="flex items-center gap-2">
                <input type="checkbox" name="categories" value={c.value} defaultChecked={c.value === "pharma"} /> {c.label}
              </label>
            ))}
          </div>
          <p className="text-xs text-slate-500 md:col-span-2">
            The account is created as approved. Users register themselves and are then added with “Move”.
          </p>
          <div><button className="btn-primary">Create</button></div>
        </form>
      </details>

      {usersWithoutCompany.length > 0 && (
        <div className="card space-y-2">
          <h2 className="font-bold">Registered, no company yet</h2>
          <p className="text-sm text-slate-600">
            These users confirmed their email but have not entered company details. If one belongs to an existing
            company, assign them here.
          </p>
          {usersWithoutCompany.map((u) => (
            <UserRow key={u.id} user={u} companies={companyOptions} />
          ))}
        </div>
      )}

      {sorted.length === 0 && <div className="card text-sm text-slate-600">No companies yet.</div>}

      {sorted.map((c) => {
        const companySites = (sites ?? []).filter((s) => s.company_id === c.id);
        const companyCats = (cats ?? []).filter((k) => k.company_id === c.id);
        const companyDocs = (docs ?? []).filter((d) => d.company_id === c.id);
        const companyConsents = (consents ?? []).filter((k) => k.company_id === c.id);
        const siteName = (id: string | null) => companySites.find((s) => s.id === id)?.country;
        const soonest = companySites.filter((s) => s.status === "approved" && s.licence_valid_until)
          .map((s) => s.licence_valid_until!).sort()[0];
        const expiresIn = soonest ? daysUntil(soonest) : null;
        return (
          <div key={c.id} className="card space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold">{c.name}</h2>
                <p className="text-sm text-slate-600">
                  {[c.wants_buy && "Buyer", c.wants_sell && `Seller ${c.seller_code ?? ""}`].filter(Boolean).join(" · ")}
                  {c.address ? ` · ${c.address}` : ""}
                  {c.vat_id ? ` · VAT ${c.vat_id}` : ""}
                </p>
                <p className="text-sm text-slate-600">
                  {c.contact_name} · {c.contact_email}
                  {c.contact_phone ? ` · ${c.contact_phone}` : ""}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`capitalize ${STATUS_STYLE[c.status]}`}>{c.status}</span>
                {expiresIn !== null && expiresIn <= 30 && (
                  <span className={`text-xs font-bold ${expiresIn < 0 ? "text-danger" : "mark-attention"}`}>
                    {expiresIn < 0 ? "Licence expired" : `Licence expires in ${expiresIn} days`}
                  </span>
                )}
              </div>
            </div>

            <form action={saveCompanyReview} className="space-y-4 border-t border-slate-100 pt-4">
              <input type="hidden" name="company_id" value={c.id} />

              <div className="grid gap-4 md:grid-cols-2">
                {c.wants_buy && (
                  <div>
                    <label className="label">Buyer access</label>
                    <ApprovalSelect name="buy_status" value={c.buy_status} />
                  </div>
                )}
                {c.wants_sell && (
                  <div>
                    <label className="label">Seller access</label>
                    <ApprovalSelect name="sell_status" value={c.sell_status} />
                  </div>
                )}
              </div>

              {companyCats.length > 0 && (
                <div>
                  <h3 className="mb-1 text-sm font-medium">Categories</h3>
                  <div className="grid gap-2 md:grid-cols-2">
                    {companyCats.map((k) => (
                      <div key={`${k.role}-${k.category}`} className="flex items-center justify-between gap-3 text-sm">
                        <span>{k.role === "buy" ? "Buy" : "Sell"}: {CATEGORY_LABEL[k.category]}</span>
                        <div className="w-40"><ApprovalSelect name={`cat:${k.role}:${k.category}`} value={k.status} /></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="mb-1 text-sm font-medium">Sites</h3>
                <div className="space-y-2">
                  {companySites.map((s) => (
                    <div key={s.id} className="grid items-end gap-2 text-sm md:grid-cols-[1fr_10rem_10rem]">
                      <span>{s.country}{s.address ? ` · ${s.address}` : ""}</span>
                      <ApprovalSelect name={`site_status:${s.id}`} value={s.status} />
                      <input type="date" name={`site_valid:${s.id}`} className="input py-1" aria-label="Licence valid until"
                        defaultValue={s.licence_valid_until ?? ""} />
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-xs text-slate-500">Date = licence of this site valid until. EU licences: EudraGMDP (eudragmdp.ema.europa.eu).</p>
              </div>

              <div>
                <h3 className="mb-1 text-sm font-medium">Documents</h3>
                {companyDocs.length === 0 ? (
                  <p className="notice-attention">No documents uploaded.</p>
                ) : (
                  <ul className="text-sm">
                    {companyDocs.map((d) => (
                      <li key={d.id}>
                        <a href={urlByPath.get(d.storage_path) ?? "#"} target="_blank" rel="noreferrer" className="text-brand-600 underline">
                          {d.file_name}
                        </a>{" "}
                        <span className="text-slate-500">
                          ({d.kind ? DOC_KIND_LABEL[d.kind] : d.doc_type}{siteName(d.site_id) ? ` · ${siteName(d.site_id)}` : ""})
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {c.wants_sell && (
                <div className="grid gap-4 md:grid-cols-[1fr_12rem]">
                  <p className="self-end text-xs text-slate-500">
                    {c.eudamed_srn ? `EUDAMED SRN ${c.eudamed_srn}. ` : ""}
                    {c.ivdr_duties_confirmed_at ? `IVDR distributor obligations confirmed on ${fmt(c.ivdr_duties_confirmed_at)}.` : ""}
                  </p>
                  <div>
                    <label className="label" htmlFor={`pct-${c.id}`}>Commission (%)</label>
                    <input id={`pct-${c.id}`} name="commission_pct" className="input" inputMode="decimal"
                      defaultValue={c.commission_pct ?? ""} placeholder={standardPct !== undefined ? `standard ${standardPct}` : "standard"} />
                    <p className="mt-1 text-xs text-slate-500">Empty = standard rate.</p>
                  </div>
                </div>
              )}

              <div>
                <label className="label" htmlFor={`note-${c.id}`}>Internal note</label>
                <input id={`note-${c.id}`} name="internal_note" className="input" defaultValue={c.internal_note ?? ""} />
              </div>

              <div className="flex flex-wrap gap-2">
                <button className="btn-primary">Save review</button>
                {c.status === "approved" && <button form={`status-${c.id}`} className="btn-secondary">Suspend</button>}
                {c.status === "suspended" && <button form={`status-${c.id}`} className="btn-secondary">Reactivate (back to review)</button>}
              </div>
            </form>

            <form id={`status-${c.id}`} action={setCompanyStatus} hidden>
              <input type="hidden" name="company_id" value={c.id} />
              <input type="hidden" name="status" value={c.status === "approved" ? "suspended" : "applied"} />
            </form>

            {companyConsents.length > 0 && (
              <div className="border-t border-slate-100 pt-3">
                <h3 className="mb-1 text-sm font-medium">Agreements accepted</h3>
                <ul className="text-xs text-slate-600">
                  {companyConsents.map((k, i) => (
                    <li key={i}>
                      {CONSENT_LABEL[k.kind] ?? k.kind} · version {k.version} · {fmt(k.accepted_at)}
                      {k.kind === "newsletter" && (k.withdrawn_at ? " · withdrawn" : k.confirmed_at ? ` · confirmed ${fmt(k.confirmed_at)}` : " · not yet confirmed")}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-1 border-t border-slate-100 pt-3">
              <h3 className="text-sm font-medium">Users</h3>
              {allUsers.filter((u) => u.company_id === c.id).length === 0 && (
                <p className="text-sm text-slate-500">No users.</p>
              )}
              {allUsers.filter((u) => u.company_id === c.id).map((u) => (
                <UserRow key={u.id} user={u} companies={companyOptions} />
              ))}
            </div>
            {allUsers.every((u) => u.company_id !== c.id) && !companiesWithRequests.has(c.id) && (
              <form action={deleteCompany}>
                <input type="hidden" name="company_id" value={c.id} />
                <button className="text-xs text-danger underline">Delete this company (no users, no requests)</button>
              </form>
            )}
            {c.verified_on && <p className="text-xs text-slate-500">Verified on {c.verified_on}</p>}
          </div>
        );
      })}
    </div>
  );
}

// One user line with a "move to company" control
function UserRow({ user, companies }: { user: User; companies: { id: string; name: string }[] }) {
  return (
    <form action={assignUser} className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="user_id" value={user.id} />
      <span className="min-w-56">
        {user.full_name ?? "–"} <span className="text-slate-500">· {user.email}</span>
      </span>
      <select name="company_id" className="input w-64 py-1" defaultValue={user.company_id ?? ""}>
        <option value="">No company</option>
        {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <button className="btn-secondary px-3 py-1">Move</button>
    </form>
  );
}
