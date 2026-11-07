"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Reached through the link in the password email: the link has already signed the user in.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== repeat) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(error.message.includes("session") ? "The link has expired. Please request a new one." : error.message);
      return;
    }
    router.push("/portal?password=changed");
    router.refresh();
  }

  return (
    <div className="card mx-auto max-w-md">
      <h1 className="mb-6 text-xl font-semibold">Set a new password</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="password">New password</label>
          <input id="password" type="password" className="input" required minLength={10}
            value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="mt-1 text-xs text-slate-500">At least 10 characters.</p>
        </div>
        <div>
          <label className="label" htmlFor="repeat">Repeat new password</label>
          <input id="repeat" type="password" className="input" required minLength={10}
            value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Saving…" : "Save new password"}</button>
      </form>
    </div>
  );
}
