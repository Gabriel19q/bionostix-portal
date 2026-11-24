import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, isApprovedBuyer } from "@/lib/session";
import { requestToDraft } from "@/lib/wanted";
import { matchCountry } from "@/lib/countries";
import type { Draft } from "@/lib/listing";
import type { Category } from "@/lib/categories";
import { UploadWizard } from "../../sell/upload/upload-wizard";

export default async function UploadRequestsPage({ searchParams }: { searchParams: Promise<{ edit?: string; manual?: string; drafts?: string }> }) {
  const { edit, manual, drafts } = await searchParams;
  const { supabase, user, account } = await getSession();
  if (!user) redirect("/login");
  if (!isApprovedBuyer(account)) redirect("/portal/sourcing");
  const approved = (account?.categories ?? [])
    .filter((c) => c.role === "buy" && c.status === "approved").map((c) => c.category as Category);

  let initial: Draft[] | null = null;
  if (edit || drafts) {
    const { data } = await supabase.rpc("get_my_product_requests");
    const rows = (data ?? []) as Record<string, unknown>[];
    const picked = edit ? rows.filter((r) => r.id === edit && r.category) : rows.filter((r) => r.status === "draft");
    if (picked.length === 0) redirect("/portal/sourcing");
    initial = picked.map(requestToDraft);
  } else if (manual) {
    initial = [{
      category: approved.length === 1 ? approved[0] : "",
      values: { delivery_country: matchCountry(account?.sites[0]?.country ?? "") },
      country_prices: [],
    }];
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portal/sourcing" className="text-sm text-brand-600 underline">← Product requests</Link>
        <h1 className="mt-2 text-2xl font-bold">
          {edit ? "Edit product request" : drafts ? "Product requests prepared by Bionostix" : manual ? "Add a product request" : "Upload your list of wanted products"}
        </h1>
      </div>
      <UploadWizard mode="requests" approved={approved} initial={initial} />
    </div>
  );
}
