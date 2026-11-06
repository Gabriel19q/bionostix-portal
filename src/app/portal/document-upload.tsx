"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ACCEPTED_TYPES, uploadCompanyDocument } from "@/lib/upload";

// Lets an applicant add or replace licence documents while waiting for approval.
export function DocumentUpload({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<"license" | "gdp_certificate" | "other">("license");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onUpload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadCompanyDocument(createClient(), companyId, file, docType);
      setFile(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="label" htmlFor="doctype">Document type</label>
        <select
          id="doctype"
          className="input"
          value={docType}
          onChange={(e) => setDocType(e.target.value as typeof docType)}
        >
          <option value="license">Licence</option>
          <option value="gdp_certificate">GDP certificate</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="flex-1">
        <label className="label" htmlFor="file">File</label>
        <input
          id="file"
          type="file"
          accept={ACCEPTED_TYPES}
          className="input"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>
      <button className="btn-secondary" disabled={!file || busy} onClick={onUpload}>
        {busy ? "Uploading…" : "Upload"}
      </button>
      {error && <p className="w-full text-sm text-red-700">{error}</p>}
    </div>
  );
}
