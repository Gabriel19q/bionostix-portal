import type { Metadata } from "next";
import { COMPANY } from "@/content/company";
import { LEGAL_VERSION } from "@/lib/legal";

export const metadata: Metadata = { title: "Confidentiality and non-circumvention agreement · Bionostix Germany" };

// Placeholder until the lawyer delivers the text (SPEC.md, Vom Anwalt zu klären).
// When the text changes, update LEGAL_VERSION in src/lib/legal.ts.
export default function ConfidentialityPage() {
  return (
    <div className="card mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Confidentiality and non-circumvention agreement</h1>
        <p className="text-sm text-slate-600">{COMPANY.name} · B2B partner portal · Version {LEGAL_VERSION}</p>
      </div>
      <div className="notice-attention">
        The full text is being finalised and will be published here. Until then, please contact us at{" "}
        <a href={`mailto:${COMPANY.email}`} className="text-brand-600 underline">{COMPANY.email}</a> for a copy.
      </div>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">In short</h2>
        <p className="text-sm">Both buyers and sellers keep information about other members, their offers and their identities confidential, and do not use the platform to contact each other in order to do business around it.</p>
      </section>
    </div>
  );
}
