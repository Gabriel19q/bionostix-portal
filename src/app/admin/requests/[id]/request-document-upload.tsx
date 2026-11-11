"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DOC_TYPE_LABEL } from "@/lib/status";
import { registerRequestDocument } from "../actions";

const TYPES = ["proforma", "invoice", "shipping", "coa", "other"] as const;

export function RequestDocumentUpload({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<(typeof TYPES)[number]>("proforma");
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onUpload() {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setError("File is larger than 20 MB.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
      const path = `request/${requestId}/${Date.now()}-${safeName}`;
      const { error: upErr } = await createClient().storage.from("documents").upload(path, file, { contentType: file.type });
      if (upErr) throw new Error(upErr.message);
      await registerRequestDocument({ requestId, path, fileName: file.name, docType, notify });
      setFile(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-2 border-t border-slate-100 pt-3">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label">Type</label>
          <select className="input" value={docType} onChange={(e) => setDocType(e.target.value as typeof docType)}>
            {TYPES.map((t) => <option key={t} value={t}>{DOC_TYPE_LABEL[t]}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <label className="label">File</label>
          <input type="file" className="input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <button className="btn-secondary" disabled={!file || busy} onClick={onUpload}>
          {busy ? "Uploading…" : "Upload"}
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Email the customer
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
