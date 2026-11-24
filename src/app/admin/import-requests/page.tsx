import Link from "next/link";
import { getSession } from "@/lib/session";
import type { Category } from "@/lib/categories";
import { UploadWizard } from "../../portal/sell/upload/upload-wizard";

type Buyer = { id: string; name: string };

// Help for buyers: Bionostix uploads a buyer's list of wanted products. The requests become drafts that the buyer confirms.
export default async function ImportForBuyerPage({ searchParams }: { searchParams: Promise<{ buyer?: string; done?: string }> }) {
  const { buyer, done } = await searchParams;
  const { supabase } = await getSession();
  const { data } = await supabase.from("companies").select("id, name")
    .eq("wants_buy", true).eq("buy_status", "approved").eq("status", "approved").order("name").returns<Buyer[]>();
  const buyers = data ?? [];
  const chosen = buyers.find((b) => b.id === buyer);
  let approved: Category[] = [];
  if (chosen) {
    const { data: cats } = await supabase.from("company_categories").select("category")
      .eq("company_id", chosen.id).eq("role", "buy").eq("status", "approved");
    approved = (cats ?? []).map((c) => c.category as Category);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Import product requests for buyer</h1>
        <p className="text-sm text-slate-600">
          Upload a buyer&apos;s list of wanted products for them. The product requests are not active yet: they wait under
          the buyer&apos;s “Product requests” until the buyer has checked and confirmed them. The buyer gets an email.
        </p>
      </div>
      {done && <p className="notice-success">{done} product request(s) sent to the buyer for confirmation.</p>}
      <form className="card flex flex-wrap items-end gap-3">
        <div className="min-w-72">
          <label className="label" htmlFor="buyer">Buyer</label>
          <select id="buyer" name="buyer" className="input" defaultValue={chosen?.id ?? ""} required>
            <option value="" disabled>Select…</option>
            {buyers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <button className="btn-secondary">Choose</button>
        {buyers.length === 0 && (
          <p className="w-full text-sm text-slate-600">No approved buyers yet. Approve one under <Link href="/admin" className="underline">Companies</Link>.</p>
        )}
      </form>
      {chosen && (approved.length === 0
        ? <p className="notice-attention">{chosen.name} has no approved category yet.</p>
        : <UploadWizard key={chosen.id} mode="requests" approved={approved} initial={null} buyerCompanyId={chosen.id} />)}
    </div>
  );
}
