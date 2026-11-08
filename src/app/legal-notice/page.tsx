import type { Metadata } from "next";
import { COMPANY } from "@/content/company";

export const metadata: Metadata = { title: "Legal notice · Bionostix Germany" };

export default function LegalNoticePage() {
  const c = COMPANY;
  return (
    <div className="card mx-auto max-w-2xl space-y-6 text-sm leading-relaxed">
      <h1 className="text-2xl font-semibold">Legal notice (Impressum)</h1>
      <section>
        <h2 className="mb-1 font-semibold">Information according to § 5 DDG</h2>
        <p>
          {c.name}
          <br />
          {c.legalForm}
          <br />
          Owner: {c.owner}
          <br />
          {c.street}
          <br />
          {c.city}
          <br />
          {c.country}
        </p>
      </section>
      <section>
        <h2 className="mb-1 font-semibold">Contact</h2>
        <p>
          Email: <a href={`mailto:${c.email}`} className="text-brand-700 underline">{c.email}</a>
          {c.phone && (
            <>
              <br />
              Phone: {c.phone}
            </>
          )}
        </p>
      </section>
      {c.vatId && (
        <section>
          <h2 className="mb-1 font-semibold">VAT ID</h2>
          <p>VAT identification number according to § 27a UStG: {c.vatId}</p>
        </section>
      )}
      <section>
        <h2 className="mb-1 font-semibold">Responsible for content</h2>
        <p>{c.owner}, address as above</p>
      </section>
    </div>
  );
}
