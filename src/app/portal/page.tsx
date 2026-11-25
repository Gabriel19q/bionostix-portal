import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { sendApplicationEmails } from "@/lib/application-emails";
import { CATEGORY_LABEL, DOC_KIND_LABEL, type Category, type DocKind } from "@/lib/categories";
import { ApplicationForm } from "./application-form";
import { Overview } from "./overview";

type Account = {
  company: { wants_buy: boolean; wants_sell: boolean } | null;
  sites: { id: string; country: string }[];
  categories: { role: "buy" | "sell"; category: Category }[];
  documents: { id: string; file_name: string; kind: DocKind | null; site_id: string | null }[];
};

export default async function PortalPage() {
  const { supabase, user, profile, company } = await getSession();
  if (!user) redirect("/login");
  if (profile?.role === "admin") redirect("/admin/requests");

  if (!company) {
    // Confirmed on another device: the application from the registration page is still waiting
    const { data: claimed } = await supabase.rpc("claim_pending_application");
    if (claimed) {
      if (user.email) await sendApplicationEmails(supabase, user.email);
      redirect("/portal");
    }
    return <ApplicationForm defaultName={profile?.full_name ?? ""} />;
  }

  if (company.status === "applied") {
    const { data } = await supabase.rpc("get_my_account");
    const account = data as Account | null;
    const docs = account?.documents ?? [];
    const sites = account?.sites ?? [];
    const siteName = (id: string | null) => sites.find((s) => s.id === id)?.country;

    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="card space-y-2">
          <h1 className="text-xl font-bold">Your application is being reviewed</h1>
          <p className="text-sm text-slate-600">
            Thank you, {company.contact_name ?? "there"}. We are verifying <strong>{company.name}</strong>. You will
            receive an email as soon as your access is active.
          </p>
          {account?.company && (
            <p className="text-sm text-slate-600">
              Applied as {[account.company.wants_buy && "buyer", account.company.wants_sell && "seller"].filter(Boolean).join(" and ")}
              {account.categories.length > 0 && (
                <> · {account.categories.map((c) => `${c.role === "buy" ? "buy" : "sell"}: ${CATEGORY_LABEL[c.category]}`).join(", ")}</>
              )}
            </p>
          )}
        </div>
        <div className="card space-y-4">
          <h2 className="font-bold">Submitted documents</h2>
          <p className="text-sm text-slate-600">
            If we need anything else, we will contact you by email.
          </p>
          {docs.length > 0 ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {docs.map((d) => (
                <li key={d.id} className="flex justify-between gap-4 py-2">
                  <span className="truncate">{d.file_name}</span>
                  <span className="shrink-0 text-right text-slate-500">
                    {d.kind ? DOC_KIND_LABEL[d.kind] : "Document"}
                    {siteName(d.site_id) ? ` · ${siteName(d.site_id)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-600">No documents received.</p>
          )}
        </div>
      </div>
    );
  }

  if (company.status === "rejected" || company.status === "suspended") {
    return (
      <div className="card mx-auto max-w-2xl space-y-2">
        <h1 className="text-xl font-bold">Access not active</h1>
        <p className="text-sm text-slate-600">
          Access for {company.name} is currently not active. Please contact us at {process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "info@bionostix-germany.de"}.
        </p>
      </div>
    );
  }

  return <Overview />;
}
