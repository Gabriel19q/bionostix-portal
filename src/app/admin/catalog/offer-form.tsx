import { SELLER_LABEL } from "@/lib/status";
import Link from "next/link";
import { today } from "@/lib/format";
import { saveOffer } from "./actions";
import { COUNTRIES } from "@/lib/countries";

export type OfferFormValues = {
  offer_id?: string;
  product_id?: string;
  manufacturer?: string;
  trade_name?: string;
  active_ingredient?: string | null;
  strength?: string | null;
  dosage_form?: string | null;
  pack_size?: string | null;
  pzn?: string | null;
  is_rx?: boolean;
  is_cold_chain?: boolean;
  is_narcotic?: boolean;
  seller?: string | null;
  batch?: string;
  expiry_date?: string | null;
  available_qty?: number | null;
  moq?: number;
  purchase_price?: number | null;
  internal_note?: string | null;
  coa_available?: boolean | null;
  markup_override_pct?: number | null;
  incoterm?: string;
  stock_as_of?: string;
  is_active?: boolean;
  valid_until?: string | null;
  market_mode?: string;
  market_countries?: string[];
};

function Field({ label, name, defaultValue, required, type = "text", hint, list }: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  required?: boolean;
  type?: string;
  hint?: string;
  list?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <input id={name} name={name} type={type} className="input" required={required} list={list}
        defaultValue={defaultValue ?? ""} />
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function OfferForm({ values, manufacturers }: { values: OfferFormValues; manufacturers: string[] }) {
  const v = values;
  return (
    <form action={saveOffer} className="space-y-6">
      <input type="hidden" name="offer_id" value={v.offer_id ?? ""} />
      <input type="hidden" name="product_id" value={v.product_id ?? ""} />
      <datalist id="manufacturers">
        {manufacturers.map((m) => <option key={m} value={m} />)}
      </datalist>

      <div className="card space-y-4">
        <h2 className="font-bold">Product</h2>
        {v.product_id && (
          <p className="text-xs text-slate-600">Changes to the product apply to all its batches.</p>
        )}
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Manufacturer" name="manufacturer" defaultValue={v.manufacturer} required list="manufacturers" />
          <Field label="Product name" name="trade_name" defaultValue={v.trade_name} required />
          <Field label="Active ingredient" name="active_ingredient" defaultValue={v.active_ingredient} />
          <Field label="Strength" name="strength" defaultValue={v.strength} hint="e.g. 500 mg" />
          <Field label="Dosage form" name="dosage_form" defaultValue={v.dosage_form} hint="e.g. tablets" />
          <Field label="Pack size" name="pack_size" defaultValue={v.pack_size} hint="e.g. 20 tablets" />
          <Field label="PZN" name="pzn" defaultValue={v.pzn} />
          <div>
            <label className="label" htmlFor="seller">Seller (contract partner)</label>
            <select id="seller" name="seller" className="input" defaultValue={v.seller ?? "sanicura"}>
              {Object.entries(SELLER_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-6 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="is_rx" defaultChecked={v.is_rx ?? true} /> Prescription only (Rx)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="is_cold_chain" defaultChecked={v.is_cold_chain ?? false} /> Cold chain
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="is_narcotic" defaultChecked={v.is_narcotic ?? false} /> Narcotic (BtM)
          </label>
        </div>
      </div>

      <div className="card space-y-4">
        <h2 className="font-bold">Batch and price</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Batch" name="batch" defaultValue={v.batch} hint="Leave empty if unknown." />
          <Field label="Expiry date" name="expiry_date" type="date" defaultValue={v.expiry_date} hint="Leave empty if unknown." />
          <Field label="Stock checked on" name="stock_as_of" type="date" defaultValue={v.stock_as_of ?? today()} />
          <Field label="Available quantity (packs)" name="available_qty" type="number" defaultValue={v.available_qty}
            hint="Empty = on request." />
          <Field label="Minimum order quantity" name="moq" type="number" defaultValue={v.moq ?? 1} />
          <Field label="Incoterm" name="incoterm" defaultValue={v.incoterm ?? "EXW"} />
          <Field label="Purchase price per pack (EUR)" name="purchase_price" defaultValue={v.purchase_price}
            hint="Only visible to admins. Empty = price on request." />
          <Field label="Own markup % (optional)" name="markup_override_pct" defaultValue={v.markup_override_pct}
            hint="Leave empty to use the customer group's markup." />
          <div>
            <label className="label" htmlFor="coa_available">Certificate of analysis (COA)</label>
            <select id="coa_available" name="coa_available" className="input"
              defaultValue={v.coa_available === true ? "yes" : v.coa_available === false ? "no" : ""}>
              <option value="">Not specified</option>
              <option value="yes">Available</option>
              <option value="no">Not available</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <Field label="Internal note (admins only)" name="internal_note" defaultValue={v.internal_note}
              hint="e.g. price from August, check before offering" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_active" defaultChecked={v.is_active ?? true} /> Visible to customers
        </label>
      </div>

      <div className="card space-y-4">
        <div>
          <h2 className="font-bold">Offer validity and markets</h2>
          <p className="text-xs text-slate-600">
            Protects the manufacturer&apos;s distributors: buyers in excluded countries do not see this offer, and orders
            for delivery into an excluded country are refused.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Offer valid until" name="valid_until" type="date" defaultValue={v.valid_until}
            hint="Empty = no end date. After this date the offer disappears for customers." />
          <div>
            <label className="label" htmlFor="market_mode">Markets</label>
            <select id="market_mode" name="market_mode" className="input" defaultValue={v.market_mode ?? "all"}>
              <option value="all">All countries</option>
              <option value="only">Only these countries</option>
              <option value="except">All countries except these</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="market_countries">Countries</label>
            <input id="market_countries" name="market_countries" className="input" list="countries"
              defaultValue={(v.market_countries ?? []).join(", ")} placeholder="e.g. Iraq, Lebanon" />
            <datalist id="countries">
              {COUNTRIES.map((c) => <option key={c} value={c} />)}
            </datalist>
            <p className="mt-1 text-xs text-slate-500">Separate with commas. English country names.</p>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button className="btn-primary">Save</button>
        <Link href="/admin/catalog" className="btn-secondary">Cancel</Link>
      </div>
    </form>
  );
}
