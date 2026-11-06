import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Target of the email confirmation link: turns the one-time code into a session.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/portal";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/portal";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?error=confirmation`);
}
