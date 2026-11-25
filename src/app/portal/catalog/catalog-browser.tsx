"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CATEGORY_LABEL, type Category } from "@/lib/categories";
import { displayDate, eur } from "@/lib/format";
import { offerHeading, offerSpec, shelfLifeMonths, type MarketOffer } from "@/lib/market";

const uniq = (list: (string | null | undefined)[]) => [...new Set(list.filter((x): x is string => !!x))].sort();

export function CatalogBrowser({ offers, categories }: { offers: MarketOffer[]; categories: Category[] }) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<Category | "">("");
  const [form, setForm] = useState("");
  const [language, setLanguage] = useState("");
  const [incoterm, setIncoterm] = useState("");
  const [minShelf, setMinShelf] = useState("");
  const [minQty, setMinQty] = useState("");

  const forms = useMemo(() => uniq(offers.map((o) => o.dosage_form ?? o.product_type ?? o.method)), [offers]);
  const languages = useMemo(() => uniq(offers.map((o) => o.packaging_language)), [offers]);
  const incoterms = useMemo(() => uniq(offers.map((o) => o.incoterm)), [offers]);

  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return offers.filter((o) => {
      const hay = [o.product_name, o.name_on_pack, o.brand, o.active_ingredients, o.test_parameter, o.product_type, o.national_code, o.ean]
        .filter(Boolean).join(" ").toLowerCase();
      if (words.some((w) => !hay.includes(w))) return false;
      if (category && o.category !== category) return false;
      if (form && (o.dosage_form ?? o.product_type ?? o.method) !== form) return false;
      if (language && o.packaging_language !== language) return false;
      if (incoterm && o.incoterm !== incoterm) return false;
      if (minShelf && (shelfLifeMonths(o) ?? 0) < Number(minShelf)) return false;
      if (minQty && o.quantity < Number(minQty)) return false;
      return true;
    });
  }, [offers, q, category, form, language, incoterm, minShelf, minQty]);

  const reset = () => { setQ(""); setCategory(""); setForm(""); setLanguage(""); setIncoterm(""); setMinShelf(""); setMinQty(""); };

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
      <aside className="card h-fit space-y-4 text-sm">
        <div>
          <label className="label" htmlFor="q">Search</label>
          <input id="q" className="input" placeholder="Product, ingredient, brand" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {categories.length > 1 && (
          <div>
            <label className="label" htmlFor="f-cat">Category</label>
            <select id="f-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value as Category | "")}>
              <option value="">All</option>
              {categories.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="f-form">Form / type</label>
          <select id="f-form" className="input" value={form} onChange={(e) => setForm(e.target.value)}>
            <option value="">All</option>
            {forms.map((f) => <option key={f}>{f}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-lang">Packaging</label>
          <select id="f-lang" className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="">All</option>
            {languages.map((f) => <option key={f}>{f}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-shelf">Shelf life at least (months)</label>
          <input id="f-shelf" className="input" inputMode="numeric" value={minShelf} onChange={(e) => setMinShelf(e.target.value.replace(/\D/g, ""))} />
        </div>
        <div>
          <label className="label" htmlFor="f-qty">Quantity at least (packs)</label>
          <input id="f-qty" className="input" inputMode="numeric" value={minQty} onChange={(e) => setMinQty(e.target.value.replace(/\D/g, ""))} />
        </div>
        <div>
          <label className="label" htmlFor="f-inco">Delivery terms</label>
          <select id="f-inco" className="input" value={incoterm} onChange={(e) => setIncoterm(e.target.value)}>
            <option value="">All</option>
            {incoterms.map((f) => <option key={f}>{f}</option>)}
          </select>
        </div>
        <button type="button" className="text-sm text-brand-600 underline" onClick={reset}>Reset filters</button>
      </aside>

      <div className="space-y-3">
        <p className="text-sm text-slate-600">{list.length} offer(s)</p>
        {list.length === 0 && (
          <div className="card space-y-2 text-sm">
            <p className="font-bold">No offers found.</p>
            <p className="text-slate-600">Tips: search only the active ingredient (e.g. “Paracetamol”), check the spelling, or reset the filters.</p>
            <p>Not on offer yet? <Link href="/portal/sourcing/upload?manual=1" className="text-brand-600 underline">Add a product request</Link> – we show you matching offers as soon as they come in.</p>
          </div>
        )}
        {list.map((o) => {
          const shelf = shelfLifeMonths(o);
          return (
            <div key={o.id} className="card space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold">{offerHeading(o)}</h2>
                  <p className="text-sm text-slate-700">{offerSpec(o)}</p>
                  <p className="text-sm text-slate-600">
                    {o.product_name} · {o.brand}{o.name_on_pack && o.name_on_pack !== o.product_name ? ` · on pack: ${o.name_on_pack}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold">{eur(o.price)}</div>
                  <div className="text-xs text-slate-600">per pack</div>
                </div>
              </div>
              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 md:grid-cols-4">
                <div><dt className="text-xs font-bold text-slate-600">Available</dt><dd>{o.quantity} packs{o.moq ? ` · MOQ ${o.moq}` : ""}</dd></div>
                <div><dt className="text-xs font-bold text-slate-600">Expiry</dt>
                  <dd>{o.expiry_date ? `${displayDate(o.expiry_date)}${shelf !== null ? ` (${shelf} months)` : ""}` : `min. ${o.min_shelf_life_months} months`}</dd></div>
                <div><dt className="text-xs font-bold text-slate-600">Packaging</dt><dd>{o.packaging_language}</dd></div>
                <div><dt className="text-xs font-bold text-slate-600">Delivery terms</dt><dd>{o.incoterm} {o.incoterm_place}{o.lead_time_days ? ` · ${o.lead_time_days} days` : ""}</dd></div>
                {(o.documents_available ?? []).length > 0 && (
                  <div className="sm:col-span-2"><dt className="text-xs font-bold text-slate-600">Documents on request</dt><dd>{o.documents_available!.join(", ")}</dd></div>
                )}
                {(o.registered_in ?? []).length > 0 && (
                  <div><dt className="text-xs font-bold text-slate-600">Registered in</dt><dd>{o.registered_in!.join(", ")}</dd></div>
                )}
                <div><dt className="text-xs font-bold text-slate-600">Offer valid until</dt><dd>{displayDate(o.valid_until)}</dd></div>
              </dl>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <span className="text-xs text-slate-600">Seller {o.seller_code} · {o.seller_country} · Verified by Bionostix</span>
                <Link href={`/portal/catalog/${o.id}`} className="btn-primary">Send request</Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
