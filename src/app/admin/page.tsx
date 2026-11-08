import { getSession } from "@/lib/session";
import { approveCompany, assignUser, deleteCompany, setCompanyStatus } from "./actions";

type Company = {
  id: string;
  name: string;
  country: string;
  address: string | null;
  customer_type: "eu_wholesaler" | "importer";
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: "applied" | "approved" | "suspended" | "rejected";
  customer_group_id: string | null;
  license_expires_on: string | null;
  verified_on: string | null;
  internal_note: string | null;
  created_at: string;
};

type User = { id: string; email: string; full_name: string | null; company_id: string | null; created_at: string };
type Doc = { id: string; company_id: string; file_name: string; doc_type: string; storage_path: string };

const STATUS_ORDER = ["applied", "approved", "suspended", "rejected"] as const;
const STATUS_STYLE: Record<Company["status"], string> = {
  applied: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-900",
  suspended: "bg-slate-200 text-slate-800",
  rejected: "bg-red-100 text-red-900",
};
const TYPE_LABEL = { eu_wholesaler: "EU wholesaler", importer: "Importer" };

function daysUntil(date: string) {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
}

export default async function AdminPage() {
  const { supabase } = await getSession();

  const [{ data: companies }, { data: groups }, { data: docs }, { data: users }, { data: requestCompanies }] = await Promise.all([
    supabase.from("companies").select("*").order("created_at", { ascending: false }).returns<Company[]>(),
    supabase.from("customer_groups").select("id, name, default_markup_pct").order("name"),
    supabase
      .from("documents")
      .select("id, company_id, file_name, doc_type, storage_path")
      .not("company_id", "is", null)
      .returns<Doc[]>(),
    supabase.from("profiles").select("id, email, full_name, company_id, created_at").eq("role", "customer")
      .order("created_at").returns<User[]>(),
    supabase.from("requests").select("company_id"),
  ]);
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
      <div>
        <h1 className="text-2xl font-semibold">Customers</h1>
        <p className="text-sm text-slate-600">
          {openCount === 0 ? "No applications waiting." : `${openCount} application(s) waiting for review.`}
        </p>
      </div>

      {sorted.length === 0 && <div className="card text-sm text-slate-600">No customers yet.</div>}

      {usersWithoutCompany.length > 0 && (
        <div className="card space-y-2">
          <h2 className="font-semibold">Registered, no company yet</h2>
          <p className="text-sm text-slate-600">
            These users confirmed their email but have not entered company details. If one belongs to an existing
            customer, assign them here.
          </p>
          {usersWithoutCompany.map((u) => (
            <UserRow key={u.id} user={u} companies={companyOptions} />
          ))}
        </div>
      )}

      {sorted.map((c) => {
        const companyDocs = (docs ?? []).filter((d) => d.company_id === c.id);
        const expiresIn = c.license_expires_on ? daysUntil(c.license_expires_on) : null;
        return (
          <div key={c.id} className="card space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">{c.name}</h2>
                <p className="text-sm text-slate-600">
                  {TYPE_LABEL[c.customer_type]} · {c.country}
                  {c.address ? ` · ${c.address}` : ""}
                </p>
                <p className="text-sm text-slate-600">
                  {c.contact_name} · {c.contact_email}
                  {c.contact_phone ? ` · ${c.contact_phone}` : ""}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLE[c.status]}`}>
                  {c.status}
                </span>
                {expiresIn !== null && expiresIn <= 30 && (
                  <span className="text-xs font-medium text-red-700">
                    {expiresIn < 0 ? "Licence expired" : `Licence expires in ${expiresIn} days`}
                  </span>
                )}
              </div>
            </div>

            <div>
              <h3 className="mb-1 text-sm font-medium">Documents</h3>
              {companyDocs.length === 0 ? (
                <p className="text-sm text-amber-700">No documents uploaded.</p>
              ) : (
                <ul className="text-sm">
                  {companyDocs.map((d) => (
                    <li key={d.id}>
                      <a
                        href={urlByPath.get(d.storage_path) ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-700 underline"
                      >
                        {d.file_name}
                      </a>{" "}
                      <span className="text-slate-500">({d.doc_type})</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-xs text-slate-500">
                EU licences can be checked in EudraGMDP (eudragmdp.ema.europa.eu).
              </p>
            </div>

            <form action={approveCompany} className="grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-4">
              <input type="hidden" name="company_id" value={c.id} />
              <div>
                <label className="label">Customer group</label>
                <select
                  name="customer_group_id"
                  className="input"
                  required
                  defaultValue={c.customer_group_id ?? ""}
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {(groups ?? []).map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} (+{g.default_markup_pct}%)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Licence valid until</label>
                <input
                  type="date"
                  name="license_expires_on"
                  className="input"
                  defaultValue={c.license_expires_on ?? ""}
                />
              </div>
              <div className="md:col-span-2">
                <label className="label">Internal note</label>
                <input name="internal_note" className="input" defaultValue={c.internal_note ?? ""} />
              </div>
              <div className="flex flex-wrap gap-2 md:col-span-4">
                <button className="btn-primary">{c.status === "approved" ? "Save" : "Approve"}</button>
              </div>
            </form>

            <div className="flex flex-wrap gap-2">
              {c.status === "approved" && (
                <form action={setCompanyStatus}>
                  <input type="hidden" name="company_id" value={c.id} />
                  <input type="hidden" name="status" value="suspended" />
                  <button className="btn-secondary">Suspend</button>
                </form>
              )}
              {c.status === "applied" && (
                <form action={setCompanyStatus}>
                  <input type="hidden" name="company_id" value={c.id} />
                  <input type="hidden" name="status" value="rejected" />
                  <button className="btn-danger">Reject</button>
                </form>
              )}
              {(c.status === "suspended" || c.status === "rejected") && (
                <form action={setCompanyStatus}>
                  <input type="hidden" name="company_id" value={c.id} />
                  <input type="hidden" name="status" value="applied" />
                  <button className="btn-secondary">Move back to review</button>
                </form>
              )}
            </div>
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
                <button className="text-xs text-red-700 underline">Delete this company (no users, no requests)</button>
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
