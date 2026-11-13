import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { CatalogTable, type CatalogItem } from "../catalog-table";

export default async function CatalogPage() {
  const { supabase, user, profile, company } = await getSession();
  if (!user) redirect("/login");
  if (profile?.role === "admin") redirect("/admin/catalog");
  if (!company || company.status !== "approved") redirect("/portal");

  const { data: catalog } = await supabase.rpc("get_catalog");
  await logActivity(supabase, "view_catalog", "/portal/catalog", { items: catalog?.length ?? 0 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Available products</h1>
        <p className="text-sm text-slate-600">{company.name}</p>
      </div>
      {!company.can_request && (
        <div className="notice-attention">
          Your licence on file expired on {company.license_expires_on}. Please send us the renewed licence to see current
          stock and to request products.
        </div>
      )}
      <CatalogTable items={(catalog ?? []) as CatalogItem[]} canRequest={company.can_request}
        defaultCountry={company.country} />
    </div>
  );
}
