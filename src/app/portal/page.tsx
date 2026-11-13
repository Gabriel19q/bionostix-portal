import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ApplicationForm } from "./application-form";
import { DocumentUpload } from "./document-upload";
import { Overview } from "./overview";

const DOC_LABELS: Record<string, string> = {
  license: "Licence",
  gdp_certificate: "GDP certificate",
  other: "Other",
};

export default async function PortalPage() {
  const { supabase, user, profile, company } = await getSession();
  if (!user) redirect("/login");
  if (profile?.role === "admin") redirect("/admin/requests");

  if (!company) {
    return <ApplicationForm defaultName={profile?.full_name ?? ""} />;
  }

  if (company.status === "applied") {
    const { data } = await supabase.rpc("get_my_documents").select("id, file_name, doc_type, created_at").order("created_at");
    const docs = data as { id: string; file_name: string; doc_type: string; created_at: string }[] | null;

    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="card space-y-2">
          <h1 className="text-xl font-bold">Your application is being reviewed</h1>
          <p className="text-sm text-slate-600">
            Thank you, {company.contact_name ?? "there"}. We are verifying the licence of{" "}
            <strong>{company.name}</strong>. You will receive an email as soon as your access is active.
          </p>
        </div>
        <div className="card space-y-4">
          <h2 className="font-bold">Submitted documents</h2>
          {docs && docs.length > 0 ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {docs.map((d) => (
                <li key={d.id} className="flex justify-between py-2">
                  <span>{d.file_name}</span>
                  <span className="text-slate-500">{DOC_LABELS[d.doc_type] ?? d.doc_type}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="notice-attention">No licence uploaded yet. Please add it below.</p>
          )}
          <DocumentUpload companyId={company.id} />
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
