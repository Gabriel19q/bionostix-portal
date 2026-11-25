import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, isApprovedSeller } from "@/lib/session";
import { CATEGORY_LABEL, type Category } from "@/lib/categories";
import { displayDate, eur } from "@/lib/format";
import { endListingsAction } from "./actions";

type Listing = {
  id: string; category: Category; product_name: string; brand: string; active_ingredients: string | null;
  dosage_form: string | null; units_per_pack: number; unit: string; quantity: number; price: number;
  expiry_date: string | null; min_shelf_life_months: number | null; valid_until: string; status: "active" | "ended" | "draft";
  country_prices: { country: string; price: number }[];
};

export default async function MyOffersPage() {
  const { supabase, user, account } = await getSession();
  if (!user) redirect("/login");
  if (!isApprovedSeller(account)) {
    return (
      <div className="card mx-auto max-w-2xl space-y-2">
        <h1 className="text-xl font-bold">My offers</h1>
        <p className="text-sm text-slate-600">Your seller access is not active yet. We will inform you by email once it is approved.</p>
      </div>
    );
  }
  const { data } = await supabase.rpc("get_my_listings");
  const listings = (data ?? []) as Listing[];
  const today = new Date().toISOString().slice(0, 10);
  const approved = (account?.categories ?? []).filter((c) => c.role === "sell" && c.status === "approved");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">My offers</h1>
          <p className="text-sm text-slate-600">
            Seller {account?.company.seller_code} · approved for {approved.map((c) => CATEGORY_LABEL[c.category]).join(", ")}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/portal/sell/upload?manual=1" className="btn-secondary">Add one offer</Link>
          <Link href="/portal/sell/upload" className="btn-primary">+ Upload your list</Link>
        </div>
      </div>
      {listings.some((l) => l.status === "draft") && (
        <div className="notice-attention flex flex-wrap items-center justify-between gap-3">
          <span>
            Bionostix prepared {listings.filter((l) => l.status === "draft").length} offer(s) from your list. They are not
            visible to buyers until you check and publish them.
          </span>
          <Link href="/portal/sell/upload?drafts=1" className="btn-primary">Check and publish</Link>
        </div>
      )}
      <p className="notice-info">
        Buyers see your offers without your company name, as “Seller {account?.company.seller_code}”. You are responsible
        for the information in your offers.
      </p>

      {listings.length === 0 ? (
        <div className="card text-sm text-slate-600">
          No offers yet. Upload your own stock list (Excel or CSV): the portal fills in the offer form and shows what is
          still missing.
        </div>
      ) : (
        <form action={endListingsAction} className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-600">
              <tr>
                <th className="p-3"></th>
                <th className="p-3">Product</th>
                <th className="p-3">Category</th>
                <th className="p-3 text-right">Quantity</th>
                <th className="p-3 text-right">Price / pack</th>
                <th className="p-3">Expiry</th>
                <th className="p-3">Valid until</th>
                <th className="p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {listings.map((l) => {
                const expired = l.status === "active" && l.valid_until < today;
                return (
                  <tr key={l.id} className={l.status === "ended" ? "text-slate-400" : ""}>
                    <td className="p-3">
                      {l.status === "active" && <input type="checkbox" name="id" value={l.id} aria-label={`Select ${l.product_name}`} />}
                    </td>
                    <td className="p-3">
                      <div className="font-bold">{l.product_name}</div>
                      <div className="text-xs text-slate-500">
                        {l.brand}{l.active_ingredients ? ` · ${l.active_ingredients}` : ""} · {l.units_per_pack} {l.unit}
                      </div>
                    </td>
                    <td className="p-3">{CATEGORY_LABEL[l.category]}</td>
                    <td className="p-3 text-right">{l.quantity}</td>
                    <td className="p-3 text-right">
                      {eur(l.price)}
                      {l.country_prices.length > 0 && <div className="text-xs text-slate-500">+{l.country_prices.length} country price(s)</div>}
                    </td>
                    <td className="p-3">{l.expiry_date ? displayDate(l.expiry_date) : `min ${l.min_shelf_life_months} months`}</td>
                    <td className="p-3">{displayDate(l.valid_until)}</td>
                    <td className="p-3">
                      <span className={l.status === "ended" ? "tag-neutral" : l.status === "draft" || expired ? "tag-attention" : "tag-success"}>
                        {l.status === "ended" ? "Ended" : l.status === "draft" ? "Prepared – not published" : expired ? "Validity passed" : "Active"}
                      </span>
                    </td>
                    <td className="p-3">
                      <Link href={`/portal/sell/upload?edit=${l.id}`} className="text-brand-600 underline">Edit</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="border-t border-slate-100 p-3">
            <button className="btn-secondary">End selected offers</button>
          </div>
        </form>
      )}
    </div>
  );
}
