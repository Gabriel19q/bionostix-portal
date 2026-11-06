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
  customer_type: "eu_wholesaler" | "importer";
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: "applied" | "approved" | "suspended" | "rejected";
  license_expires_on: string | null;
  can_request: boolean;
};

// Who is signed in, their profile and (for customers) their company.
export async function getSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null, company: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, company_id")
    .eq("id", user.id)
    .single<Profile>();

  const { data: company } = await supabase.from("my_company").select("*").maybeSingle<MyCompany>();

  return { supabase, user, profile, company };
}
