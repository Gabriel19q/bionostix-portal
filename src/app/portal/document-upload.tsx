"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileDrop } from "@/components/file-drop";
import { DOC_KIND_LABEL, type DocKind } from "@/lib/categories";
import { createClient } from "@/lib/supabase/client";
import { uploadCompanyDocumentV2 } from "@/lib/upload";

// Lets an applicant add documents while waiting for approval.
export function DocumentUpload({ companyId, sites }: { companyId: string; sites: { id: string; country: string }[] }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<DocKind>("wholesale_licence");
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onUpload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadCompanyDocumentV2(createClient(), companyId, file, kind, siteId || null);
      setFile(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="dockind">Document type</label>
          <select id="dockind" className="input" value={kind} onChange={(e) => setKind(e.target.value as DocKind)}>
            {(Object.keys(DOC_KIND_LABEL) as DocKind[]).map((k) => (
              <option key={k} value={k}>{DOC_KIND_LABEL[k]}</option>
            ))}
          </select>
        </div>
        {sites.length > 1 && (
          <div>
            <label className="label" htmlFor="docsite">For site</label>
            <select id="docsite" className="input" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.country}</option>)}
            </select>
          </div>
        )}
      </div>
      <FileDrop label="File" required file={file} onChange={setFile} />
      <button className="btn-secondary" disabled={!file || busy} onClick={onUpload}>
        {busy ? "Uploading…" : "Upload"}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
