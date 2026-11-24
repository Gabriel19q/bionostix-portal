import Link from "next/link";
import { getSession } from "@/lib/session";
import { CATEGORY_LABEL, type Category } from "@/lib/categories";
import { displayDate, eur } from "@/lib/format";

type Row = {
  id: string; category: Category; product_name: string; name_on_pack: string | null; brand: string;
  active_ingredients: string | null; units_per_pack: number; unit: string; quantity: number; price: number;
  expiry_date: string | null; min_shelf_life_months: number | null; valid_until: string; status: "active" | "ended" | "draft";
  updated_at: string; companies: { name: string; seller_code: string | null } | null;
};

const STATUS: Record<Row["status"], [string, string]> = {
  active: ["Active", "tag-success"],
  draft: ["Waiting for seller", "tag-attention"],
  ended: ["Ended", "tag-neutral"],
};

// Product offering: every offer of every seller (admins see the seller's name; buyers never do)
export default async function ProductOfferingPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { status = "active", q = "" } = await searchParams;
  const { supabase } = await getSession();
  let query = supabase.from("listings")
    .select("id, category, product_name, name_on_pack, brand, active_ingredients, units_per_pack, unit, quantity, price, expiry_date, min_shelf_life_months, valid_until, status, updated_at, companies(name, seller_code)")
    .order("updated_at", { ascending: false }).limit(500);
  if (status !== "all") query = query.eq("status", status);
  if (q.trim()) query = query.or(`product_name.ilike.%${q.trim().replace(/[%,()]/g, "")}%,active_ingredients.ilike.%${q.trim().replace(/[%,()]/g, "")}%`);
  const { data } = await query.returns<Row[]>();
  const rows = data ?? [];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Product offering</h1>
          <p className="text-sm text-slate-600">All offers of all sellers. Sellers manage their offers themselves.</p>
        </div>
        <form className="flex flex-wrap items-end gap-2">
          <input name="q" className="input w-56" placeholder="Product or ingredient" defaultValue={q} />
          <select name="status" className="input w-48" defaultValue={status}>
            <option value="active">Active</option>
            <option value="draft">Waiting for seller</option>
            <option value="ended">Ended</option>
            <option value="all">All</option>
          </select>
          <button className="btn-secondary">Filter</button>
        </form>
      </div>
      {rows.length === 0 ? (
        <div className="card text-sm text-slate-600">
          No offers here. Sellers add offers under “My offers”, or you import a list for them under{" "}
          <Link href="/admin/import" className="text-brand-600 underline">Import stock for seller</Link>.
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-600">
              <tr>
                <th className="p-3">Product</th><th className="p-3">Seller</th><th className="p-3">Category</th>
                <th className="p-3 text-right">Quantity</th><th className="p-3 text-right">Price / pack</th>
                <th className="p-3">Expiry</th><th className="p-3">Valid until</th><th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const [label, cls] = r.status === "active" && r.valid_until < today ? ["Validity passed", "tag-attention"] : STATUS[r.status];
                return (
                  <tr key={r.id}>
                    <td className="p-3">
                      <div className="font-bold">{r.product_name}</div>
                      <div className="text-xs text-slate-500">
                        {r.brand}{r.active_ingredients ? ` · ${r.active_ingredients}` : ""} · {r.units_per_pack} {r.unit}
                        {r.name_on_pack ? ` · on pack: ${r.name_on_pack}` : ""}
                      </div>
                    </td>
                    <td className="p-3">{r.companies?.name}<div className="text-xs text-slate-500">{r.companies?.seller_code}</div></td>
                    <td className="p-3">{CATEGORY_LABEL[r.category]}</td>
                    <td className="p-3 text-right">{r.quantity}</td>
                    <td className="p-3 text-right">{eur(r.price)}</td>
                    <td className="p-3">{r.expiry_date ? displayDate(r.expiry_date) : `min ${r.min_shelf_life_months} months`}</td>
                    <td className="p-3">{displayDate(r.valid_until)}</td>
                    <td className="p-3"><span className={cls}>{label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
