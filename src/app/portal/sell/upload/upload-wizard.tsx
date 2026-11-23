"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CATEGORY_LABEL, type Category } from "@/lib/categories";
import {
  DOCUMENTS, FIELDS, FIELD_BY_KEY, guessListingMapping, rowsToDrafts, validateDraft, type Draft, type FieldDef,
} from "@/lib/listing";
import { readSheetFile, type Sheet } from "@/lib/sheet";
import { saveListingsAction } from "../actions";

type Step = "file" | "map" | "mask";

// Fields that make sense to set for all rows at once (often missing in sellers' lists)
const BULK_KEYS = ["incoterm", "incoterm_place", "valid_until", "packaging_language", "expiry", "lead_time_days",
  "buyers", "ship", "documents_available", "unit", "brand"];

export function UploadWizard({ approved, initial }: { approved: Category[]; initial: Draft[] | null }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initial ? "mask" : "file");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [defaultCategory, setDefaultCategory] = useState<Category | "">(approved.length === 1 ? approved[0] : "");
  const [drafts, setDrafts] = useState<Draft[]>(initial ?? []);
  const [open, setOpen] = useState<number | null>(initial ? 0 : null);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [bulkKey, setBulkKey] = useState("incoterm");
  const [bulkValue, setBulkValue] = useState("");
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const errors = useMemo(() => drafts.map((d) => validateDraft(d, approved)), [drafts, approved]);
  const problemCount = errors.filter((e) => Object.keys(e).length > 0).length;

  async function onFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!/\.(xlsx|xls|csv|txt)$/i.test(file.name)) {
      setError("Please use an Excel (.xlsx, .xls) or CSV file.");
      return;
    }
    try {
      const s = await readSheetFile(file);
      // Drop the hint row of the Bionostix template
      s.rows = s.rows.filter((r) => String(r[0] ?? "").trim() !== "Choose from list");
      if (s.rows.length === 0) throw new Error("The list has no rows.");
      if (s.rows.length > 2000) throw new Error("Please upload at most 2,000 rows at once.");
      setSheet(s);
      setFileName(file.name);
      setMapping(guessListingMapping(s.headers));
      setStep("map");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read this file.");
    }
  }

  function toMask() {
    if (!sheet) return;
    const rows = rowsToDrafts(sheet.headers, sheet.rows, mapping, defaultCategory);
    setDrafts(rows);
    setOpen(null);
    setOnlyProblems(rows.some((d) => Object.keys(validateDraft(d, approved)).length > 0));
    setStep("mask");
  }

  function update(i: number, patch: Partial<Draft> | ((d: Draft) => Draft)) {
    setDrafts((list) => list.map((d, j) => (j === i ? (typeof patch === "function" ? patch(d) : { ...d, ...patch }) : d)));
  }
  function setValue(i: number, key: string, value: string) {
    update(i, (d) => ({ ...d, values: { ...d.values, [key]: value } }));
  }

  function applyBulk() {
    setDrafts((list) => list.map((d) => ({ ...d, values: { ...d.values, [bulkKey]: bulkValue } })));
  }

  async function onSave() {
    setBusy(true);
    setError(null);
    const res = await saveListingsAction(drafts);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.push("/portal/sell");
    router.refresh();
  }

  if (step === "file") {
    return (
      <div className="card max-w-3xl space-y-5">
        <p className="text-sm text-slate-600">
          Upload your own stock list as it is (Excel or CSV). The portal reads your columns, fills in the offer form and
          shows what is still missing. Nothing is published before you confirm.
        </p>
        {approved.length > 1 && (
          <div className="max-w-sm">
            <label className="label" htmlFor="defcat">Category of the products in this list</label>
            <select id="defcat" className="input" value={defaultCategory} onChange={(e) => setDefaultCategory(e.target.value as Category)}>
              <option value="">Mixed – set per row</option>
              {approved.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
          </div>
        )}
        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files?.[0]); }}
          className={`flex flex-col items-center gap-3 rounded-md border-2 border-dashed px-6 py-10 text-center text-sm ${
            over ? "border-brand-600 bg-brand-50" : "border-slate-300 bg-slate-50"}`}
        >
          <p className="font-bold">Drag your list here</p>
          <p className="text-slate-500">or</p>
          <label className="btn-secondary cursor-pointer">
            Choose file
            <input type="file" accept=".xlsx,.xls,.csv,.txt" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <p className="text-xs text-slate-500">Excel (.xlsx, .xls) or CSV · first sheet · up to 2,000 rows</p>
        </div>
        <p className="text-sm text-slate-600">
          Optional: <a href="/templates/Bionostix-Offer-Upload-Template.xlsx" className="text-brand-600 underline">download our
          template</a> to see which information we need for each category.
        </p>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }

  if (step === "map" && sheet) {
    const sample = (header: string) => {
      const i = sheet.headers.indexOf(header);
      const v = sheet.rows.find((r) => r[i] !== null && r[i] !== undefined && String(r[i]).trim() !== "")?.[i];
      return v === undefined ? "" : String(v).slice(0, 40);
    };
    const mappable = [{ key: "category", label: "Category" }, ...FIELDS.filter((f) => f.hints.length > 0)];
    return (
      <div className="card space-y-4">
        <div>
          <h2 className="font-bold">Which column is which?</h2>
          <p className="text-sm text-slate-600">
            {fileName}: {sheet.rows.length} row(s). We matched your columns where we could. Check the matches and choose
            “not in my list” for anything your list does not contain – you can add it in the next step.
          </p>
        </div>
        <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
          {mappable.map((f) => (
            <div key={f.key} className="grid grid-cols-[11rem_1fr] items-center gap-2 text-sm">
              <label htmlFor={`map-${f.key}`} className="font-medium">{f.label}</label>
              <div>
                <select id={`map-${f.key}`} className="input py-1" value={mapping[f.key] ?? ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}>
                  <option value="">– not in my list –</option>
                  {sheet.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
                {mapping[f.key] && <p className="truncate text-xs text-slate-500">e.g. {sample(mapping[f.key])}</p>}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setStep("file")}>Back</button>
          <button className="btn-primary" onClick={toMask}>Continue</button>
        </div>
      </div>
    );
  }

  // Mask
  const visible = drafts.map((d, i) => ({ d, i })).filter(({ i }) => !onlyProblems || Object.keys(errors[i]).length > 0);
  return (
    <div className="space-y-4">
      {drafts.length > 1 && (
        <div className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              <strong>{drafts.length}</strong> offer(s) ·{" "}
              {problemCount === 0
                ? <span className="font-bold text-success">all complete</span>
                : <span className="font-bold text-danger">{problemCount} with missing or invalid information</span>}
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
              Show only offers with problems
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3 text-sm">
            <div>
              <label className="label" htmlFor="bulk-key">Set for all offers</label>
              <select id="bulk-key" className="input py-1" value={bulkKey} onChange={(e) => { setBulkKey(e.target.value); setBulkValue(""); }}>
                {BULK_KEYS.map((k) => <option key={k} value={k}>{FIELD_BY_KEY[k].label}</option>)}
              </select>
            </div>
            <div className="min-w-56 flex-1">
              <FieldInput field={FIELD_BY_KEY[bulkKey]} value={bulkValue} onChange={setBulkValue} id="bulk-value" />
            </div>
            <button className="btn-secondary" onClick={applyBulk}>Apply to all</button>
          </div>
        </div>
      )}

      {visible.length === 0 && <div className="card text-sm text-slate-600">No offers with problems.</div>}

      {visible.map(({ d, i }) => {
        const e = errors[i];
        const n = Object.keys(e).length;
        const isOpen = open === i || drafts.length === 1;
        return (
          <div key={i} className={`card space-y-4 ${n > 0 ? "border-danger" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(isOpen ? null : i)}>
                <span className="font-bold">{d.values.product_name || "Untitled offer"}</span>
                <span className="text-sm text-slate-500">
                  {d.category ? ` · ${CATEGORY_LABEL[d.category]}` : ""}{d.values.price ? ` · € ${d.values.price}` : ""}
                </span>
              </button>
              <div className="flex items-center gap-3">
                <span className={n > 0 ? "tag-danger" : "tag-success"}>{n > 0 ? `${n} to fix` : "Complete"}</span>
                {drafts.length > 1 && (
                  <button type="button" className="text-sm text-slate-500 underline"
                    onClick={() => { setDrafts((l) => l.filter((_, j) => j !== i)); setOpen(null); }}>
                    Remove
                  </button>
                )}
              </div>
            </div>

            {isOpen && (
              <div className="space-y-4 border-t border-slate-100 pt-4">
                <div className="max-w-sm">
                  <label className="label" htmlFor={`cat-${i}`}>Category <span className="text-danger">*</span></label>
                  <select id={`cat-${i}`} className={`input ${e.category ? "input-error" : ""}`} value={d.category}
                    onChange={(ev) => update(i, { category: ev.target.value as Category })}>
                    <option value="">Select…</option>
                    {approved.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                  </select>
                  {e.category && <p className="field-error">{e.category}</p>}
                </div>
                {d.category && (
                  <div className="grid gap-4 md:grid-cols-3">
                    {FIELDS.filter((f) => f.need[d.category as Category] !== "N")
                      .filter((f) => !f.key.endsWith("_other") || d.values[f.key.replace(/_other$/, "")] === "Other")
                      .map((f) => (
                        <div key={f.key} className={f.type === "documents" ? "md:col-span-3" : ""}>
                          <label className="label" htmlFor={`f-${i}-${f.key}`}>
                            {f.label} {f.need[d.category as Category] === "R" && <span className="text-danger">*</span>}
                          </label>
                          <FieldInput field={f} value={d.values[f.key] ?? ""} invalid={!!e[f.key]}
                            onChange={(v) => setValue(i, f.key, v)} id={`f-${i}-${f.key}`} />
                          {e[f.key] ? <p className="field-error">{e[f.key]}</p>
                            : f.help && <p className="mt-1 text-xs text-slate-500">{f.help}</p>}
                        </div>
                      ))}
                  </div>
                )}
                {d.category && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Prices for single countries (optional)</h3>
                    <p className="text-xs text-slate-500">Buyers in these countries see this price instead of the standard price.</p>
                    {d.country_prices.map((cp, k) => (
                      <div key={k} className="flex flex-wrap items-center gap-2">
                        <input className="input w-48 py-1" placeholder="Country, e.g. Iraq or IQ" value={cp.country}
                          onChange={(ev) => update(i, (x) => ({ ...x, country_prices: x.country_prices.map((c, m) => m === k ? { ...c, country: ev.target.value } : c) }))} />
                        <input className="input w-32 py-1" placeholder="Price €" inputMode="decimal" value={cp.price}
                          onChange={(ev) => update(i, (x) => ({ ...x, country_prices: x.country_prices.map((c, m) => m === k ? { ...c, price: ev.target.value } : c) }))} />
                        <button type="button" className="text-sm text-slate-500 underline"
                          onClick={() => update(i, (x) => ({ ...x, country_prices: x.country_prices.filter((_, m) => m !== k) }))}>
                          Remove
                        </button>
                        {e[`country_price_${k}`] && <span className="field-error">{e[`country_price_${k}`]}</span>}
                      </div>
                    ))}
                    <button type="button" className="btn-secondary px-3 py-1"
                      onClick={() => update(i, (x) => ({ ...x, country_prices: [...x.country_prices, { country: "", price: "" }] }))}>
                      + Add country price
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-3">
        {!initial && <button className="btn-secondary" onClick={() => setStep(sheet ? "map" : "file")}>Back</button>}
        <button className="btn-primary" disabled={busy || problemCount > 0 || drafts.length === 0} onClick={onSave}>
          {busy ? "Saving…" : drafts.length === 1 ? "Save offer" : `Publish ${drafts.length} offers`}
        </button>
        {problemCount > 0 && <span className="text-sm text-slate-600">Please complete the offers marked in red first.</span>}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

function FieldInput({ field, value, onChange, invalid, id }: {
  field: FieldDef; value: string; onChange: (v: string) => void; invalid?: boolean; id: string;
}) {
  const cls = `input ${invalid ? "input-error" : ""}`;
  if (field.type === "select" || field.type === "bool") {
    const options = field.type === "bool" ? ["Yes", "No"] : field.options ?? [];
    return (
      <select id={id} className={cls} value={options.includes(value) ? value : ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">{value && !options.includes(value) ? `“${value}” – please choose` : "Select…"}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (field.type === "date") {
    return <input id={id} type="date" className={cls} value={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""} onChange={(e) => onChange(e.target.value)} />;
  }
  if (field.type === "documents") {
    const selected = value.split(",").map((s) => s.trim()).filter(Boolean);
    return (
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {DOCUMENTS.map((doc) => (
          <label key={doc} className="flex items-center gap-1.5">
            <input type="checkbox" checked={selected.includes(doc)}
              onChange={() => onChange((selected.includes(doc) ? selected.filter((s) => s !== doc) : [...selected, doc]).join(", "))} />
            {doc}
          </label>
        ))}
      </div>
    );
  }
  return (
    <input id={id} className={cls} value={value} onChange={(e) => onChange(e.target.value)}
      inputMode={field.type === "int" || field.type === "money" ? "decimal" : undefined} />
  );
}
