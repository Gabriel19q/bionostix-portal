import type { Metadata } from "next";
import { COMPANY, IMPRINT_URL } from "@/content/company";

export const metadata: Metadata = { title: "Terms & conditions · Bionostix Germany" };

// Placeholder until the lawyer delivers the B2B terms (SPEC.md, Compliance).
// The ordering process below describes how the portal works today.
export default function TermsPage() {
  return (
    <div className="card mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Terms &amp; conditions</h1>
        <p className="text-sm text-slate-600">{COMPANY.name} · B2B partner portal</p>
      </div>

      <div className="notice-attention">
        Our full terms &amp; conditions are being finalised and will be published here. Until then, please contact us at{" "}
        <a href={`mailto:${COMPANY.email}`} className="text-brand-600 underline">{COMPANY.email}</a> for a copy.
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">How ordering works</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            Products and prices shown in the portal are a non-binding invitation to make an offer, subject to
            availability.
          </li>
          <li>
            Your order request is a binding offer to buy on the terms shown. You can cancel it at any time before you
            receive our order confirmation.
          </li>
          <li>
            We check availability with the manufacturer. If we can only supply with changes (for example quantity or
            price), we send you the changes for your acceptance.
          </li>
          <li>
            Our proforma invoice is the order confirmation: a contract is formed when you receive it. The proforma
            states the deposit and a payment deadline. If no payment is received by that date, the proforma invoice is
            cancelled.
          </li>
          <li>We place the order with the manufacturer once the deposit is received.</li>
        </ol>
      </section>

      <section id="confidentiality" className="space-y-2">
        <h2 className="text-lg font-bold">Confidentiality and non-circumvention – in short</h2>
        <p className="text-sm">
          Part of these terms of use. Both buyers and sellers keep information about other members, their offers and
          their identities confidential, and do not use the platform to contact each other in order to do business
          around it.
        </p>
      </section>

      <p className="text-sm">
        <a href={IMPRINT_URL} className="text-brand-600 underline">Legal notice</a>
      </p>
    </div>
  );
}
