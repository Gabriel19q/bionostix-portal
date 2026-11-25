import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, isApprovedSeller } from "@/lib/session";
import { listingToDraft, type Draft } from "@/lib/listing";
import type { Category } from "@/lib/categories";
import { UploadWizard } from "./upload-wizard";

export default async function UploadOffersPage({ searchParams }: { searchParams: Promise<{ edit?: string; manual?: string; drafts?: string }> }) {
  const { edit, manual, drafts } = await searchParams;
  const { supabase, user, account } = await getSession();
  if (!user) redirect("/login");
  if (!isApprovedSeller(account)) redirect("/portal/sell");
  const approved = (account?.categories ?? [])
    .filter((c) => c.role === "sell" && c.status === "approved").map((c) => c.category as Category);

  let initial: Draft[] | null = null;
  if (edit) {
    const { data } = await supabase.rpc("get_my_listings");
    const found = ((data ?? []) as Record<string, unknown>[]).find((l) => l.id === edit);
    if (!found) redirect("/portal/sell");
    initial = [listingToDraft(found)];
  } else if (drafts) {
    // Offers Bionostix prepared for this seller: check and publish
    const { data } = await supabase.rpc("get_my_listings");
    const prepared = ((data ?? []) as Record<string, unknown>[]).filter((l) => l.status === "draft");
    if (prepared.length === 0) redirect("/portal/sell");
    initial = prepared.map(listingToDraft);
  } else if (manual) {
    initial = [{ category: approved.length === 1 ? approved[0] : "", values: {}, country_prices: [] }];
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portal/sell" className="text-sm text-brand-600 underline">← My offers</Link>
        <h1 className="mt-2 text-2xl font-bold">{edit ? "Edit offer" : drafts ? "Offers prepared by Bionostix" : manual ? "Add an offer" : "Upload your list"}</h1>
      </div>
      <UploadWizard approved={approved} initial={initial} />
    </div>
  );
}
