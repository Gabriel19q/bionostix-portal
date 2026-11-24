"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { FileDrop } from "@/components/file-drop";
import { CATEGORIES, docSlots, type Category } from "@/lib/categories";
import { COUNTRIES, EU_COUNTRIES } from "@/lib/countries";
import { LEGAL_VERSION } from "@/lib/legal";
import { createClient } from "@/lib/supabase/client";
import { uploadCompanyDocumentV2, uploadPendingDocument } from "@/lib/upload";
import { afterApplication } from "./actions";

type Site = { country: string; address: string };

const FRIENDLY: Record<string, string> = {
  "international format": "Please enter the phone number in international format, starting with + and the country code (e.g. +49 711 1234567).",
  "choose buy and/or sell": "Please choose whether you want to buy, sell or both.",
  "buyers must choose": "Please choose at least one category you want to buy.",
  "sellers must choose": "Please choose at least one category you want to sell.",
  "IVDR": "Please confirm the distributor obligations under the IVDR.",
  "every site needs a country": "Please choose a country for every site.",
};

function friendly(message: string) {
  return Object.entries(FRIENDLY).find(([k]) => message.includes(k))?.[1] ?? message;
}

function toggle<T>(list: T[], value: T) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function ApplicationForm({ defaultName = "", withAccount = false }: { defaultName?: string; withAccount?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);

  const [name, setName] = useState("");
  const [street, setStreet] = useState("");
  const [houseNo, setHouseNo] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const address = [`${street.trim()} ${houseNo.trim()}`.trim(), addressLine2.trim(), `${postalCode.trim()} ${city.trim()}`.trim()]
    .filter(Boolean).join(", ");
  const [vatId, setVatId] = useState("");
  const [firstName, setFirstName] = useState(defaultName.split(" ")[0] ?? "");
  const [lastName, setLastName] = useState(defaultName.split(" ").slice(1).join(" "));
  const contact = `${firstName.trim()} ${lastName.trim()}`.trim();
  const [phone, setPhone] = useState("");
  const [wantsBuy, setWantsBuy] = useState(true);
  const [wantsSell, setWantsSell] = useState(false);
  const [buyCats, setBuyCats] = useState<Category[]>([]);
  const [sellCats, setSellCats] = useState<Category[]>([]);
  const [country, setCountry] = useState("");
  // One site per company (feedback 24.11.2026): the registered address and country
  const sites = useMemo<Site[]>(() => [{ country, address }], [country, address]);
  const [srn, setSrn] = useState("");
  const [ivdr, setIvdr] = useState(false);
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [terms, setTerms] = useState(false);
  const [confidentiality, setConfidentiality] = useState(false);
  const [commission, setCommission] = useState(false);
  const [newsletter, setNewsletter] = useState(false);

  const slots = useMemo(
    () => docSlots({ wantsBuy, wantsSell, buyCats, sellCats, sites }),
    [wantsBuy, wantsSell, buyCats, sellCats, sites],
  );
  const sellsIvd = wantsSell && sellCats.includes("ivd");
  const inEu = EU_COUNTRIES.includes(country);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const missing = slots.filter((s) => s.required && !files[s.key]);
    if (missing.length > 0) {
      setError(`Please add: ${missing.map((m) => m.label).join(", ")}.`);
      return;
    }

    setBusy(true);
    setError(null);
    const supabase = createClient();
    const application = {
      name, address, vat_id: inEu ? vatId : null, contact_name: contact, phone,
      wants_buy: wantsBuy, wants_sell: wantsSell,
      buy_categories: wantsBuy ? buyCats : [],
      sell_categories: wantsSell ? sellCats : [],
      sites,
      eudamed_srn: sellsIvd && inEu ? srn : null,
      ivdr_confirmed: sellsIvd ? ivdr : false,
      version: LEGAL_VERSION,
      consents: { terms, confidentiality, commission: wantsSell && commission, newsletter },
    };
    try {
      if (withAccount) {
        const { data: su, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: contact, application },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/portal`,
          },
        });
        if (signUpError) throw new Error(signUpError.message);
        if (su.user && su.user.identities?.length === 0) {
          throw new Error("An account with this email already exists. Please sign in instead.");
        }
        if (!su.session) {
          // Email confirmation pending: files wait in the new account's pending folder
          for (const slot of slots) {
            const file = files[slot.key];
            if (file) await uploadPendingDocument(supabase, su.user!.id, file, slot.kind, slot.siteIndex ?? null, slot.category ?? null);
          }
          setSent(true);
          setBusy(false);
          return;
        }
      }

      const { data, error: applyError } = await supabase.rpc("apply_for_access_v2", { p: application });
      if (applyError) throw new Error(friendly(applyError.message));
      const { company_id: companyId, site_ids: siteIds } = data as { company_id: string; site_ids: string[] };

      for (const slot of slots) {
        const file = files[slot.key];
        if (!file) continue;
        const siteId = slot.siteIndex !== undefined ? siteIds[slot.siteIndex] : null;
        await uploadCompanyDocumentV2(supabase, companyId, file, slot.kind, siteId, slot.category);
      }
      await afterApplication();
      if (withAccount) router.push("/portal");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? friendly(err.message) : "Something went wrong.");
      setBusy(false);
      router.refresh();
    }
  }

  if (sent) {
    return (
      <div className="card mx-auto max-w-xl space-y-3">
        <h1 className="text-xl font-bold">Please confirm your email</h1>
        <p className="text-sm text-slate-600">
          Thank you, your application is complete. We sent a confirmation link to <strong>{email}</strong>. As soon as
          you open it, your application is submitted and we start verifying your company.
        </p>
      </div>
    );
  }

  return (
    <div className="card mx-auto max-w-3xl">
      <h1 className="mb-1 text-xl font-bold">{withAccount ? "Request access" : "Company details"}</h1>
      <p className="mb-6 text-sm text-slate-600">
        We verify every company before it can buy or sell on the platform. You confirm your email at the end.
      </p>

      <form onSubmit={onSubmit} className="space-y-8">
        {withAccount && (
          <section className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="email">Business email <span className="text-danger">*</span></label>
              <input id="email" type="email" className="input" required autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="password">Password <span className="text-danger">*</span></label>
              <input id="password" type="password" className="input" required minLength={10} autoComplete="new-password"
                value={password} onChange={(e) => setPassword(e.target.value)} />
              <p className="mt-1 text-xs text-slate-500">At least 10 characters.</p>
            </div>
          </section>
        )}

        {/* Company */}
        <section className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="label" htmlFor="company">Company name <span className="text-danger">*</span></label>
            <input id="company" className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-[1fr_7rem] gap-4 md:col-span-2">
            <div>
              <label className="label" htmlFor="street">Street <span className="text-danger">*</span></label>
              <input id="street" className="input" required autoComplete="address-line1" value={street} onChange={(e) => setStreet(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="house-no">No. <span className="text-danger">*</span></label>
              <input id="house-no" className="input" required value={houseNo} onChange={(e) => setHouseNo(e.target.value)} />
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="address-line2">Address line 2</label>
            <input id="address-line2" className="input" autoComplete="address-line2" placeholder="e.g. building, floor, PO box"
              value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} />
          </div>
          <div className="grid grid-cols-[8rem_1fr] gap-4 md:col-span-2">
            <div>
              <label className="label" htmlFor="postal-code">Postal code <span className="text-danger">*</span></label>
              <input id="postal-code" className="input" required autoComplete="postal-code" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="city">City <span className="text-danger">*</span></label>
              <input id="city" className="input" required autoComplete="address-level2" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="country">Country <span className="text-danger">*</span></label>
            <select id="country" className="input" required value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="" disabled>Select…</option>
              {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {inEu ? (
            <div>
              <label className="label" htmlFor="vat">VAT ID <span className="text-danger">*</span></label>
              <input id="vat" className="input" required placeholder="e.g. DE123456789" value={vatId}
                pattern="[A-Za-z]{2}[0-9A-Za-z+*. ]{2,13}" title="EU VAT ID starting with the country code, e.g. DE123456789"
                onChange={(e) => setVatId(e.target.value)} />
            </div>
          ) : <div />}
          <div>
            <label className="label" htmlFor="first-name">First name <span className="text-danger">*</span></label>
            <input id="first-name" className="input" required autoComplete="given-name" value={firstName}
              onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="last-name">Last name <span className="text-danger">*</span></label>
            <input id="last-name" className="input" required autoComplete="family-name" value={lastName}
              onChange={(e) => setLastName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="phone">Phone (international format) <span className="text-danger">*</span></label>
            <input id="phone" type="tel" className="input" required autoComplete="tel" placeholder="+49 711 1234567"
              pattern="\+[1-9][0-9 \(\)\.\/\-]{6,24}" title="Start with + and the country code, e.g. +49 711 1234567"
              value={phone} onChange={(e) => setPhone(e.target.value)} />
            <p className="mt-1 text-xs text-slate-600">Start with + and the country code, e.g. +49 or +964.</p>
          </div>
        </section>

        {/* Roles and categories */}
        <section className="space-y-4">
          <h2 className="font-bold">What do you want to do on the platform? <span className="text-danger">*</span></h2>
          <div className="grid gap-4 md:grid-cols-2">
            <fieldset className="rounded-md border border-slate-200 p-4">
              <label className="flex items-center gap-2 font-bold">
                <input type="checkbox" checked={wantsBuy} onChange={(e) => setWantsBuy(e.target.checked)} />
                I want to buy
              </label>
              {wantsBuy && (
                <div className="mt-3 space-y-2 text-sm">
                  <p className="text-slate-600">Categories you want to buy:</p>
                  {CATEGORIES.map((c) => (
                    <label key={c.value} className="flex items-center gap-2">
                      <input type="checkbox" checked={buyCats.includes(c.value)} onChange={() => setBuyCats((l) => toggle(l, c.value))} />
                      {c.label}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            <fieldset className="rounded-md border border-slate-200 p-4">
              <label className="flex items-center gap-2 font-bold">
                <input type="checkbox" checked={wantsSell} onChange={(e) => setWantsSell(e.target.checked)} />
                I want to sell
              </label>
              {wantsSell && (
                <div className="mt-3 space-y-2 text-sm">
                  <p className="text-slate-600">Categories you want to sell:</p>
                  {CATEGORIES.map((c) => (
                    <label key={c.value} className="flex items-center gap-2">
                      <input type="checkbox" checked={sellCats.includes(c.value)} onChange={() => setSellCats((l) => toggle(l, c.value))} />
                      {c.label}
                    </label>
                  ))}
                  <p className="text-xs text-slate-500">We approve each category separately.</p>
                </div>
              )}
            </fieldset>
          </div>
        </section>

        {/* Seller profile */}
        {sellsIvd && (
          <section className="space-y-4">
            <h2 className="font-bold">IVD</h2>
            {sellsIvd && (
              <>
                {inEu && <div>
                  <label className="label" htmlFor="srn">EUDAMED registration number (SRN)</label>
                  <input id="srn" className="input" value={srn} onChange={(e) => setSrn(e.target.value)} placeholder="e.g. DE-MF-000012345" />
                  <p className="mt-1 text-xs text-slate-500">Only if you are a manufacturer, importer or authorised representative of IVDs.</p>
                </div>}
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={ivdr} onChange={(e) => setIvdr(e.target.checked)} required />
                  <span>
                    We confirm that we fulfil the obligations of distributors under Article 14 of the IVDR
                    (Regulation (EU) 2017/746), e.g. checking CE marking, declaration of conformity and labelling, and
                    keeping storage and transport conditions. <span className="text-danger">*</span>
                  </span>
                </label>
              </>
            )}
          </section>
        )}

        {/* Documents */}
        <section className="space-y-4">
          <div>
            <h2 className="font-bold">Documents</h2>
            <p className="text-sm text-slate-600">We use these documents to verify your company. You can add more later.</p>
          </div>
          {slots.map((slot) => (
            <FileDrop key={slot.key} label={slot.label} hint={slot.hint} required={slot.required}
              file={files[slot.key] ?? null} onChange={(f) => setFiles((m) => ({ ...m, [slot.key]: f }))} />
          ))}
        </section>

        {/* Consents */}
        <section className="space-y-3 text-sm">
          <h2 className="font-bold">Agreements</h2>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" required checked={terms} onChange={(e) => setTerms(e.target.checked)} />
            <span>I accept the <Link href="/terms" target="_blank" className="text-brand-600 underline">terms of use</Link>. <span className="text-danger">*</span></span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" required checked={confidentiality} onChange={(e) => setConfidentiality(e.target.checked)} />
            <span>
              I accept the <Link href="/confidentiality" target="_blank" className="text-brand-600 underline">confidentiality and
              non-circumvention agreement</Link>. <span className="text-danger">*</span>
            </span>
          </label>
          {wantsSell && (
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" required checked={commission} onChange={(e) => setCommission(e.target.checked)} />
              <span>
                I accept the <Link href="/commission-agreement" target="_blank" className="text-brand-600 underline">commission
                agreement for sellers</Link>. <span className="text-danger">*</span>
              </span>
            </label>
          )}
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={newsletter} onChange={(e) => setNewsletter(e.target.checked)} />
            <span>
              Yes, I would like to receive news and offers from Bionostix Germany by email. I can unsubscribe at any time.
              See our <a href="https://www.bionostix-germany.de/en/privacy" target="_blank" rel="noreferrer" className="text-brand-600 underline">privacy policy</a>.
            </span>
          </label>
          <p className="text-xs text-slate-500">You receive a copy of the accepted agreements by email.</p>
          <p className="text-xs text-slate-500"><span className="text-danger">*</span> Mandatory</p>
        </section>

        {error && <p className="text-sm text-danger">{error}</p>}
        <button className="btn-primary" disabled={busy}>
          {busy ? "Submitting…" : withAccount ? "Submit application" : "Submit for verification"}
        </button>
      </form>
    </div>
  );
}
