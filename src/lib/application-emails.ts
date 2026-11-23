import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminEmails, emails, sendEmail } from "@/lib/email";
import { LEGAL_VERSION } from "@/lib/legal";

type Account = {
  company?: { name: string; wants_buy: boolean; wants_sell: boolean; contact_name: string | null; status: string };
  sites?: { country: string }[];
} | null;

// After an application: notify admins, send the applicant a copy of the accepted agreements and,
// if ticked, the newsletter confirmation link (double opt-in).
export async function sendApplicationEmails(supabase: SupabaseClient, email: string) {
  const { data } = await supabase.rpc("get_my_account");
  const account = data as Account;
  const c = account?.company;
  if (!c || c.status !== "applied") return;
  const roles = [c.wants_buy && "buyer", c.wants_sell && "seller"].filter(Boolean).join(" and ") || "buyer";
  const name = c.contact_name ?? "Sir or Madam";
  const acceptedAt = new Date().toLocaleString("en-GB", { timeZone: "Europe/Berlin", dateStyle: "long", timeStyle: "short" });

  await sendEmail({ to: adminEmails(), ...emails.newApplication(c.name, account?.sites?.[0]?.country ?? "", roles) });
  await sendEmail({ to: [email], ...emails.agreementsAccepted(name, LEGAL_VERSION, `${acceptedAt} (Berlin time)`, c.wants_sell) });
  const { data: token } = await supabase.rpc("get_newsletter_token");
  if (typeof token === "string" && token) {
    await sendEmail({ to: [email], ...emails.newsletterConfirm(name, token) });
  }
}
