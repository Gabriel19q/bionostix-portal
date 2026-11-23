import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: "admin" | "customer";
  company_id: string | null;
};

export type MyCompany = {
  id: string;
  name: string;
  country: string;
  address: string | null;
  customer_type: "eu_wholesaler" | "importer" | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: "applied" | "approved" | "suspended" | "rejected";
  license_expires_on: string | null;
  can_request: boolean;
};

// Marketplace view of the own company (get_my_account): roles, categories, sites, documents
export type MyAccount = {
  company: {
    id: string; name: string; status: MyCompany["status"]; wants_buy: boolean; wants_sell: boolean;
    buy_status: "applied" | "approved" | "rejected" | null; sell_status: "applied" | "approved" | "rejected" | null;
    seller_code: string | null; seller_description: string | null; commission_pct: number | null;
    contact_name: string | null;
  };
  sites: { id: string; country: string; address: string | null; status: string; licence_valid_until: string | null }[];
  categories: { role: "buy" | "sell"; category: "pharma" | "ivd" | "supplements" | "health"; status: string }[];
  documents: { id: string; file_name: string; kind: string | null; site_id: string | null }[];
  newsletter: "pending" | "confirmed" | null;
} | null;

export function isApprovedSeller(account: MyAccount) {
  return !!account?.company && account.company.status === "approved" && account.company.wants_sell && account.company.sell_status === "approved";
}

// Who is signed in, their profile and (for customers) their company.
// - cache(): layout, admin layout and page share ONE lookup per request instead of three.
// - getClaims(): checks the signed login token locally (Supabase's recommended way) instead of
//   asking the auth server on every page; it refreshes the session when needed. Database access
//   is still protected by row level security on every query.
// - profile and company are fetched at the same time.
export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return { supabase, user: null, profile: null, company: null, account: null };

  const user = { id: claims.sub, email: (claims.email as string | undefined) ?? null };
  const [{ data: profile }, { data: company }, { data: account }] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, role, company_id").eq("id", user.id).single<Profile>(),
    supabase.rpc("get_my_company").maybeSingle<MyCompany>(),
    supabase.rpc("get_my_account"),
  ]);

  return { supabase, user, profile, company, account: account as MyAccount | null };
});
