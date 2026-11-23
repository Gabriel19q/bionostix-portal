import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

// Double opt-in: the link from the confirmation email lands here.
export default async function NewsletterConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const { supabase, user } = await getSession();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/newsletter/confirm?token=${token}`)}`);

  const valid = /^[0-9a-f-]{36}$/i.test(token);
  const { data: confirmed } = valid ? await supabase.rpc("confirm_newsletter", { p_token: token }) : { data: false };

  return (
    <div className="card mx-auto max-w-xl space-y-3">
      <h1 className="text-xl font-bold">{confirmed ? "Subscription confirmed" : "Link not valid"}</h1>
      <p className="text-sm text-slate-600">
        {confirmed
          ? "Thank you. You will receive news and offers from Bionostix Germany by email. You can unsubscribe at any time."
          : "This confirmation link is not valid for your account or has already been withdrawn. Please sign in with the account you registered with."}
      </p>
      <Link href="/portal" className="btn-secondary">Go to the portal</Link>
    </div>
  );
}
