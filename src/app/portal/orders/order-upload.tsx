"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FileDrop } from "@/components/file-drop";
import { ORDER_DOC_KIND } from "@/lib/orders";
import { registerOrderDocumentAction } from "./actions";

// Upload a document to an order (seller: invoice, order confirmation, requested documents; buyer: other documents)
export function OrderUpload({ orderId, side }: { orderId: string; side: "buyer" | "seller" }) {
  const router = useRouter();
  const kinds = side === "seller" ? Object.keys(ORDER_DOC_KIND) : ["other"];
  const [kind, setKind] = useState(kinds[0]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    const path = `order/${orderId}/${Date.now()}-${safe}`;
    const { error: upErr } = await createClient().storage.from("documents").upload(path, file, { contentType: file.type, upsert: false });
    const res = upErr ? { ok: false as const, error: "Upload failed. Please try again." } : await registerOrderDocumentAction(orderId, path, file.name, kind);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setFile(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {kinds.length > 1 && (
        <div className="max-w-xs">
          <label className="label" htmlFor="doc-kind">Type of document</label>
          <select id="doc-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {kinds.map((k) => <option key={k} value={k}>{ORDER_DOC_KIND[k]}</option>)}
          </select>
        </div>
      )}
      <FileDrop label="File" file={file} onChange={setFile} />
      <button type="button" className="btn-primary" disabled={!file || busy} onClick={upload}>{busy ? "Uploading…" : "Upload"}</button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
