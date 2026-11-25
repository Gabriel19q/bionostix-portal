"use server";

import { getSession } from "@/lib/session";
import { sendApplicationEmails } from "@/lib/application-emails";

// After the marketplace application: notify admins, send the applicant a copy of the accepted
// agreements and, if ticked, the newsletter confirmation link (double opt-in).
export async function afterApplication() {
  const { supabase, user } = await getSession();
  if (user?.email) await sendApplicationEmails(supabase, user.email);
}
