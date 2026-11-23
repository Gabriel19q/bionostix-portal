"use client";

import { useId, useRef, useState } from "react";
import { ACCEPTED_TYPES, MAX_UPLOAD_BYTES } from "@/lib/upload";

// File field that accepts a click ("Choose file") or a file dragged onto it.
export function FileDrop({
  label,
  hint,
  required,
  file,
  onChange,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function take(f: File | undefined | null) {
    if (!f) return;
    if (!ACCEPTED_TYPES.split(",").includes(f.type)) {
      setError("Please use a PDF, PNG or JPG file.");
      return;
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      setError("The file is larger than 10 MB.");
      return;
    }
    setError(null);
    onChange(f);
  }

  return (
    <div>
      <label className="label" htmlFor={id}>
        {label} {required ? <span className="text-danger">*</span> : <span className="font-normal text-slate-500">(optional)</span>}
      </label>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files?.[0]);
        }}
        className={`flex flex-wrap items-center gap-3 rounded-md border-2 border-dashed px-4 py-3 text-sm ${
          over ? "border-brand-600 bg-brand-50" : file ? "border-slate-300 bg-white" : "border-slate-300 bg-slate-50"
        }`}
      >
        <button type="button" className="btn-secondary" onClick={() => input.current?.click()}>
          Choose file
        </button>
        <span className="min-w-0 flex-1 truncate text-slate-600">
          {file ? file.name : "or drag the file here (PDF, PNG or JPG, up to 10 MB)"}
        </span>
        {file && (
          <button type="button" className="text-sm text-slate-500 underline" onClick={() => onChange(null)}>
            Remove
          </button>
        )}
        <input
          ref={input}
          id={id}
          type="file"
          accept={ACCEPTED_TYPES}
          className="sr-only"
          onChange={(e) => {
            take(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
