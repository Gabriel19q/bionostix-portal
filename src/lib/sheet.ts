import * as XLSX from "xlsx";

// A seller's or manufacturer's own list: header row and data rows.
export type Sheet = { headers: string[]; rows: unknown[][] };

// First row with at least 3 filled cells is taken as the header row
export function toSheet(grid: unknown[][]): Sheet {
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

// Reads the first worksheet of an Excel or CSV file in the browser
export async function readSheetFile(file: File): Promise<Sheet> {
  if (/\.(csv|txt)$/i.test(file.name)) {
    const text = await file.text();
    const firstLine = text.split(/\r?\n/)[0] ?? "";
    const FS = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
    const wb = XLSX.read(text, { type: "string", FS, raw: true });
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
    return toSheet(grid);
  }
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  // The Bionostix template has the field guide first: use "Upload template" when present
  const name = wb.SheetNames.find((n) => n.toLowerCase() === "upload template") ?? wb.SheetNames[0];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null });
  return toSheet(grid);
}
