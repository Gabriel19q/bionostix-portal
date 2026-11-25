import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, isApprovedBuyer } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import type { Category } from "@/lib/categories";
import type { MarketOffer } from "@/lib/market";
import { CatalogBrowser } from "./catalog-browser";

// Product offering for buyers: all offers they may buy (the database applies country rules and country prices)
export default async function ProductOfferingPage() {
  const { supabase, user, profile, account } = await getSession();
  if (!user) redirect("/login");
  if (profile?.role === "admin") redirect("/admin/catalog");
  if (!account?.company || account.company.status !== "approved") redirect("/portal");
  if (!isApprovedBuyer(account)) {
    return (
      <div className="card mx-auto max-w-2xl space-y-2">
        <h1 className="text-xl font-bold">Product offering</h1>
        <p className="text-sm text-slate-600">
          The product offering is for approved buyers. {account.company.wants_buy
            ? "Your buyer access is being reviewed. We will inform you by email."
            : <>Would you like to buy as well? Please contact us at {process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "info@bionostix-germany.de"}.</>}
        </p>
      </div>
    );
  }
  const { data } = await supabase.rpc("get_market_catalog");
  const offers = (data ?? []) as MarketOffer[];
  const approved = account.categories.filter((c) => c.role === "buy" && c.status === "approved").map((c) => c.category as Category);
  await logActivity(supabase, "view_catalog", "/portal/catalog");
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Product offering</h1>
          <p className="text-sm text-slate-600">
            Offers from verified sellers that you may buy. Prices are per pack for your country. Sellers are shown by
            number until the order is concluded.
          </p>
        </div>
        <Link href="/portal/sourcing" className="btn-secondary">Can&apos;t find a product? Add a product request</Link>
      </div>
      <CatalogBrowser offers={offers} categories={approved} />
    </div>
  );
}
