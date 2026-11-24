import Link from "next/link";
import { getSession } from "@/lib/session";
import type { Category } from "@/lib/categories";
import { UploadWizard } from "../../portal/sell/upload/upload-wizard";

type Seller = { id: string; name: string; seller_code: string | null };

// Help for sellers: Bionostix uploads a seller's list. The offers become drafts that the seller checks and publishes.
export default async function ImportForSellerPage({ searchParams }: { searchParams: Promise<{ seller?: string; done?: string }> }) {
  const { seller, done } = await searchParams;
  const { supabase } = await getSession();
  const { data } = await supabase.from("companies").select("id, name, seller_code")
    .eq("wants_sell", true).eq("sell_status", "approved").eq("status", "approved").order("name").returns<Seller[]>();
  const sellers = data ?? [];
  const chosen = sellers.find((s) => s.id === seller);
  let approved: Category[] = [];
  if (chosen) {
    const { data: cats } = await supabase.from("company_categories").select("category")
      .eq("company_id", chosen.id).eq("role", "sell").eq("status", "approved");
    approved = (cats ?? []).map((c) => c.category as Category);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Import stock for seller</h1>
        <p className="text-sm text-slate-600">
          Upload a seller&apos;s list for them. The offers are not published: they wait under the seller&apos;s “My offers”
          until the seller has checked and published them. The seller gets an email.
        </p>
      </div>
      {done && <p className="notice-success">{done} offer(s) sent to the seller for confirmation.</p>}
      <form className="card flex flex-wrap items-end gap-3">
        <div className="min-w-72">
          <label className="label" htmlFor="seller">Seller</label>
          <select id="seller" name="seller" className="input" defaultValue={chosen?.id ?? ""} required>
            <option value="" disabled>Select…</option>
            {sellers.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.seller_code})</option>)}
          </select>
        </div>
        <button className="btn-secondary">Choose</button>
        {sellers.length === 0 && (
          <p className="w-full text-sm text-slate-600">No approved sellers yet. Approve one under <Link href="/admin" className="underline">Companies</Link>.</p>
        )}
      </form>
      {chosen && (approved.length === 0
        ? <p className="notice-attention">{chosen.name} has no approved category yet.</p>
        : <UploadWizard key={chosen.id} approved={approved} initial={null} sellerCompanyId={chosen.id} />)}
    </div>
  );
}
