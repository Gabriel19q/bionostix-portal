import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { sendApplicationEmails } from "@/lib/application-emails";

// Target of the email confirmation link: turns the one-time code into a session.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/portal";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/portal";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await logActivity(supabase, "login", "/auth/callback");
      // Registration on one page: the application waits in the account until the email is confirmed
      const { data: claimed } = await supabase.rpc("claim_pending_application");
      if (claimed) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) await sendApplicationEmails(supabase, user.email);
      }
      // Password reset link that lost its "next" (e.g. Supabase sent it to the start page): go to the reset form
      const { data: auth } = await supabase.auth.getClaims();
      const amr = (auth?.claims?.amr ?? []) as { method?: string }[];
      if (amr.some((a) => a.method === "recovery")) return NextResponse.redirect(`${origin}/reset-password`);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=confirmation`);
}
