"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ACCEPTED_TYPES, uploadCompanyDocument } from "@/lib/upload";
import { notifyNewApplication } from "./actions";

export function ApplicationForm({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const licence = form.get("licence") as File | null;
    const gdp = form.get("gdp") as File | null;
    if (!licence || licence.size === 0) {
      setError("Please attach your licence.");
      return;
    }

    setBusy(true);
    setError(null);
    const supabase = createClient();
    try {
      const { data: companyId, error: applyError } = await supabase.rpc("apply_for_access", {
        p_name: String(form.get("company")),
        p_country: String(form.get("country")),
        p_address: String(form.get("address") || ""),
        p_customer_type: String(form.get("type")),
        p_contact_name: String(form.get("contact")),
        p_contact_phone: String(form.get("phone") || ""),
      });
      if (applyError) throw new Error(applyError.message);

      await uploadCompanyDocument(supabase, companyId as string, licence, "license");
      if (gdp && gdp.size > 0) await uploadCompanyDocument(supabase, companyId as string, gdp, "gdp_certificate");
      await notifyNewApplication();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <div className="card mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold">Company details</h1>
      <p className="mb-6 text-sm text-slate-600">
        Step 2 of 2. We use this information to verify that your company is licensed to trade pharmaceuticals.
      </p>
      <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="label" htmlFor="company">Company name</label>
          <input id="company" name="company" className="input" required />
        </div>
        <div>
          <label className="label" htmlFor="country">Country</label>
          <input id="country" name="country" className="input" required />
        </div>
        <div>
          <label className="label" htmlFor="type">Company type</label>
          <select id="type" name="type" className="input" required defaultValue="">
            <option value="" disabled>
              Select…
            </option>
            <option value="eu_wholesaler">Licensed wholesaler in the EU</option>
            <option value="importer">Licensed importer outside the EU</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="address">Address</label>
          <input id="address" name="address" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="contact">Contact person</label>
          <input id="contact" name="contact" className="input" required defaultValue={defaultName} />
        </div>
        <div>
          <label className="label" htmlFor="phone">Phone</label>
          <input id="phone" name="phone" className="input" />
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="licence">
            Wholesale distribution authorisation or import licence
          </label>
          <input id="licence" name="licence" type="file" accept={ACCEPTED_TYPES} className="input" required />
          <p className="mt-1 text-xs text-slate-500">PDF, PNG or JPG, up to 10 MB.</p>
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="gdp">GDP certificate (optional)</label>
          <input id="gdp" name="gdp" type="file" accept={ACCEPTED_TYPES} className="input" />
        </div>
        {error && <p className="text-sm text-red-700 md:col-span-2">{error}</p>}
        <div className="md:col-span-2">
          <button className="btn-primary" disabled={busy}>
            {busy ? "Submitting…" : "Submit for verification"}
          </button>
        </div>
      </form>
    </div>
  );
}
