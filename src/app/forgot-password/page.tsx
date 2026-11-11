"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  if (sent) {
    return (
      <div className="card mx-auto max-w-md space-y-3">
        <h1 className="text-xl font-bold">Check your email</h1>
        <p className="text-sm text-slate-600">
          If an account exists for <strong>{email}</strong>, we sent a link to set a new password. It may take a few
          minutes and can end up in your spam folder.
        </p>
        <Link href="/login" className="text-sm text-brand-600 underline">Back to sign in</Link>
      </div>
    );
  }

  return (
    <div className="card mx-auto max-w-md">
      <h1 className="mb-1 text-xl font-bold">Forgot your password?</h1>
      <p className="mb-6 text-sm text-slate-600">Enter your email and we send you a link to set a new one.</p>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Sending…" : "Send link"}</button>
      </form>
      <p className="mt-4 text-center text-sm">
        <Link href="/login" className="text-brand-600 underline">Back to sign in</Link>
      </p>
    </div>
  );
}
