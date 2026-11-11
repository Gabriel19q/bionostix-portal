"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { IMPORT_FIELDS, guessMapping, type ImportFieldKey } from "@/lib/parse";
import { displayDate, eur, today } from "@/lib/format";
import type { ImportPayload, ImportResult, RowResult } from "@/lib/import";
import { applyImport, previewImport } from "./actions";

type Sheet = { headers: string[]; rows: unknown[][] };

const STATUS_LABEL: Record<RowResult["status"], string> = {
  new_product: "New product",
  new_batch: "New batch",
  update: "Update",
  unchanged: "Unchanged",
  error: "Error",
};
const STATUS_STYLE: Record<RowResult["status"], string> = {
  new_product: "bg-emerald-100 text-emerald-900",
  new_batch: "bg-emerald-50 text-emerald-800",
  update: "bg-sky-100 text-sky-900",
  unchanged: "bg-slate-100 text-slate-600",
  error: "bg-red-100 text-red-900",
};

// First row with at least 3 filled cells is taken as the header row
function toSheet(grid: unknown[][]): Sheet {
  const headerIndex = grid.findIndex((r) => r.filter((c) => c !== null && String(c).trim() !== "").length >= 3);
  if (headerIndex < 0) throw new Error("Could not find a header row in this file.");
  const raw = grid[headerIndex];
  const width = Math.max(...grid.slice(headerIndex).map((r) => r.length));
  const headers: string[] = [];
  for (let i = 0; i < width; i++) {
    let h = raw[i] === null || raw[i] === undefined || String(raw[i]).trim() === "" ? `Column ${i + 1}` : String(raw[i]).trim();
    while (headers.includes(h)) h = `${h} (2)`;
    headers.push(h);
  }
  const rows = grid
    .slice(headerIndex + 1)
    .filter((r) => r.some((c) => c !== null && String(c).trim() !== ""));
  return { headers, rows };
}

async function readFile(file: File): Promise<Sheet> {
  if (/\.(csv|txt)$/i.test(file.name)) {
    const text = await file.text();
    const firstLine = text.split(/\r?\n/)[0] ?? "";
    const FS = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
    const wb = XLSX.read(text, { type: "string", FS, raw: true });
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
    return toSheet(grid);
  }
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
  return toSheet(grid);
}

export function ImportWizard({ manufacturers }: { manufacturers: string[] }) {
  const [fileName, setFileName] = useState("");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<ImportFieldKey, string>>>({});
  const [manufacturer, setManufacturer] = useState("");
  const [stockAsOf, setStockAsOf] = useState(today());
  const [incoterm, setIncoterm] = useState("EXW");
  const [defaultMoq, setDefaultMoq] = useState(1);
  const [isRx, setIsRx] = useState(true);
  const [hideMissing, setHideMissing] = useState(false);
  const [parseNames, setParseNames] = useState(true);
  const [coaDefault, setCoaDefault] = useState<"keep" | "yes" | "no">("keep");
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const [filter, setFilter] = useState<RowResult["status"] | "all">("all");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    setError(null);
    setPreview(null);
    setDone(null);
    if (!file) return;
    try {
      const s = await readFile(file);
      setSheet(s);
      setFileName(file.name);
      const guessed = guessMapping(s.headers);
      // An unnamed column full of text is usually a notes column
      if (!guessed.note) {
        const noteCol = s.headers.findIndex((h, i) => h.startsWith("Column ") &&
          s.rows.filter((r) => typeof r[i] === "string" && isNaN(Number(r[i]))).length >= Math.min(3, s.rows.length));
        if (noteCol >= 0) guessed.note = s.headers[noteCol];
      }
      setMapping(guessed);
    } catch (err) {
      setSheet(null);
      setError(err instanceof Error ? err.message : "Could not read this file.");
    }
  }

  const payload = useMemo<ImportPayload | null>(() => {
    if (!sheet) return null;
    const idx = Object.fromEntries(
      Object.entries(mapping).filter(([, h]) => h).map(([k, h]) => [k, sheet.headers.indexOf(h as string)]),
    );
    const rows = sheet.rows.map((r) => Object.fromEntries(Object.entries(idx).map(([k, i]) => [k, r[i] ?? null])));
    return { manufacturer, stockAsOf, incoterm, defaultMoq, isRx, hideMissing, parseNames, coaDefault, rows };
  }, [sheet, mapping, manufacturer, stockAsOf, incoterm, defaultMoq, isRx, hideMissing, parseNames, coaDefault]);

  const missingRequired: string[] = IMPORT_FIELDS.filter((f) => f.required && !mapping[f.key]).map((f) => f.label);
  if (!mapping.manufacturer && !manufacturer.trim()) missingRequired.push("Manufacturer (column or name below)");

  async function onPreview() {
    if (!payload) return;
    setBusy(true);
    setError(null);
    const res = await previewImport(payload);
    setBusy(false);
    if (res.ok) {
      setPreview(res.result);
      setFilter(res.result.counts.error ? "error" : "all");
    } else setError(res.error);
  }

  async function onApply() {
    if (!payload) return;
    setBusy(true);
    setError(null);
    const res = await applyImport(payload);
    setBusy(false);
    if (res.ok) setDone(res.result);
    else setError(res.error);
  }

  if (done) {
    const c = done.counts;
    return (
      <div className="card space-y-3">
        <h2 className="text-lg font-bold">Import finished</h2>
        <p className="text-sm text-slate-700">
          {c.new_product} new product(s), {c.new_batch} new batch(es), {c.update} updated, {c.unchanged} unchanged
          {c.hidden ? `, ${c.hidden} hidden` : ""}{c.error ? `, ${c.error} row(s) skipped because of errors` : ""}.
        </p>
        <div className="flex gap-2">
          <Link href="/admin/catalog" className="btn-primary">Open catalog</Link>
          <button className="btn-secondary" onClick={() => { setDone(null); setSheet(null); setPreview(null); setFileName(""); }}>
            Import another list
          </button>
        </div>
      </div>
    );
  }

  const visibleRows = preview?.rows.filter((r) => filter === "all" || r.status === filter) ?? [];

  return (
    <div className="space-y-6">
      <div className="card space-y-3">
        <h2 className="font-bold">1. Choose file</h2>
        <input type="file" accept=".xlsx,.xls,.csv,.txt" className="input" onChange={(e) => onFile(e.target.files?.[0])} />
        {sheet && (
          <p className="text-sm text-slate-600">
            {fileName}: {sheet.rows.length} rows, {sheet.headers.length} columns. First sheet only.
          </p>
        )}
      </div>

      {sheet && (
        <div className="card space-y-4">
          <h2 className="font-bold">2. Check the columns</h2>
          <p className="text-sm text-slate-600">We guessed which column is which. Please check, especially price and quantity.</p>
          <div className="grid gap-3 md:grid-cols-2">
            {IMPORT_FIELDS.map((f) => {
              const header = mapping[f.key];
              const col = header ? sheet.headers.indexOf(header) : -1;
              const samples = col >= 0 ? sheet.rows.slice(0, 3).map((r) => r[col]).filter((v) => v !== null && v !== undefined) : [];
              return (
                <div key={f.key}>
                  <label className="label">
                    {f.label}
                    {f.required && <span className="text-red-600"> *</span>}
                  </label>
                  <select
                    className="input"
                    value={header ?? ""}
                    onChange={(e) => { setMapping({ ...mapping, [f.key]: e.target.value || undefined }); setPreview(null); }}
                  >
                    <option value="">— not in list —</option>
                    {sheet.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                  {samples.length > 0 && (
                    <p className="mt-1 truncate text-xs text-slate-500">e.g. {samples.map(String).join(" · ")}</p>
                  )}
                </div>
              );
            })}
          </div>

          <h2 className="pt-2 font-bold">3. Details for the whole list</h2>
          <datalist id="import-manufacturers">
            {manufacturers.map((m) => <option key={m} value={m} />)}
          </datalist>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="label">
                {mapping.manufacturer ? "Manufacturer for rows without one (optional)" : <>Manufacturer <span className="text-red-600">*</span></>}
              </label>
              <input className="input" list="import-manufacturers" value={manufacturer}
                onChange={(e) => { setManufacturer(e.target.value); setPreview(null); }} />
            </div>
            <div>
              <label className="label">Stock checked on</label>
              <input type="date" className="input" value={stockAsOf} onChange={(e) => setStockAsOf(e.target.value)} />
            </div>
            <div>
              <label className="label">Incoterm</label>
              <input className="input" value={incoterm} onChange={(e) => setIncoterm(e.target.value)} />
            </div>
            {!mapping.coa_available && (
              <div>
                <label className="label">COA for all rows</label>
                <select className="input" value={coaDefault}
                  onChange={(e) => { setCoaDefault(e.target.value as typeof coaDefault); setPreview(null); }}>
                  <option value="keep">Not specified</option>
                  <option value="yes">COA available</option>
                  <option value="no">No COA</option>
                </select>
              </div>
            )}
            <div>
              <label className="label">Default MOQ</label>
              <input type="number" min={1} className="input" value={defaultMoq}
                onChange={(e) => setDefaultMoq(Number(e.target.value) || 1)} />
            </div>
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={parseNames} onChange={(e) => { setParseNames(e.target.checked); setPreview(null); }} />
              Detect active ingredient, strength, dosage form and pack size from the product name
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={isRx} onChange={(e) => setIsRx(e.target.checked)} />
              New products are prescription only (Rx)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={hideMissing} onChange={(e) => { setHideMissing(e.target.checked); setPreview(null); }} />
              Hide batches of these manufacturers that are not on the list (sold out)
            </label>
          </div>

          {missingRequired.length > 0 && (
            <p className="text-sm text-amber-700">Still missing: {missingRequired.join(", ")}.</p>
          )}
          <button className="btn-primary" disabled={busy || missingRequired.length > 0} onClick={onPreview}>
            {busy && !preview ? "Checking…" : "Show preview"}
          </button>
        </div>
      )}

      {preview && (
        <div className="card space-y-4">
          <h2 className="font-bold">4. Preview: nothing is saved yet</h2>
          {preview.newManufacturers.length > 0 && (
            <p className="text-sm text-amber-700">New manufacturer(s) will be created: {preview.newManufacturers.join(", ")}.</p>
          )}
          <div className="flex flex-wrap gap-2 text-sm">
            {(["all", "new_product", "new_batch", "update", "unchanged", "error"] as const).map((s) => (
              <button key={s} onClick={() => setFilter(s)}
                className={`rounded-full px-3 py-1 ${filter === s ? "ring-2 ring-brand-600" : ""} ${s === "all" ? "bg-white border border-slate-300" : STATUS_STYLE[s]}`}>
                {s === "all" ? `All ${preview.rows.length}` : `${STATUS_LABEL[s]} ${preview.counts[s]}`}
              </button>
            ))}
            {preview.counts.hidden > 0 && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-900">{preview.counts.hidden} batch(es) will be hidden</span>
            )}
          </div>
          <div className="max-h-96 overflow-auto rounded border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Row</th><th className="px-3 py-2">Product</th><th className="px-3 py-2">Manufacturer</th>
                  <th className="px-3 py-2">Ingredient · strength · pack</th><th className="px-3 py-2">Batch</th>
                  <th className="px-3 py-2">Expiry</th><th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">MOQ</th><th className="px-3 py-2 text-right">Purchase</th>
                  <th className="px-3 py-2">COA</th>
                  <th className="px-3 py-2">Result</th><th className="px-3 py-2">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.slice(0, 500).map((r) => (
                  <tr key={r.line}>
                    <td className="px-3 py-1.5 text-slate-500">{r.line}</td>
                    <td className="px-3 py-1.5">{r.product}</td>
                    <td className="px-3 py-1.5">{r.manufacturer}</td>
                    <td className="px-3 py-1.5 text-xs text-slate-600">{[r.ingredient, r.strength, r.pack].filter(Boolean).join(" · ") || "–"}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{r.batch || "–"}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{r.expiry ? displayDate(r.expiry) : <span className="text-slate-400">open</span>}</td>
                    <td className="px-3 py-1.5 text-right">{r.qty ?? <span className="text-slate-400">on request</span>}</td>
                    <td className="px-3 py-1.5 text-right">{r.moq}</td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">{r.price !== null ? eur(r.price) : <span className="text-slate-400">on request</span>}</td>
                    <td className="px-3 py-1.5">{r.coa === true ? "yes" : r.coa === false ? "no" : <span className="text-slate-400">–</span>}</td>
                    <td className="px-3 py-1.5"><span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
                    <td className="px-3 py-1.5 text-xs text-slate-600">{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.counts.error > 0 && (
            <p className="text-sm text-slate-600">Rows with errors are skipped. You can fix them in the file and import again later.</p>
          )}
          <button className="btn-primary" disabled={busy} onClick={onApply}>
            {busy ? "Importing…" : `Import ${preview.rows.length - preview.counts.error} row(s)`}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
