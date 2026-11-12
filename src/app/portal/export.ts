import { SELLER_LABEL } from "@/lib/status";
import type { CatalogItem } from "./catalog-table";

// Builds an Excel file of catalog rows in the browser and downloads it.
// The spreadsheet library is loaded only when someone actually exports.
// The file is deliberately neutral (no supplier branding), because customers forward it to their own clients.
export async function downloadCatalogExcel(items: CatalogItem[], opts: { includePrices: boolean }) {
  const XLSX = await import("xlsx");
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const header = [
    "Product", "Active ingredient", "Strength", "Dosage form", "Pack size", "PZN", "Manufacturer", "Seller",
    "Batch", "Expiry date", "Available (packs)", "MOQ (packs)",
    ...(opts.includePrices ? ["Price per pack (EUR)"] : []),
    "Incoterm", "COA", "Rx", "Cold chain", "Narcotic", "Stock as of",
  ];

  const toDate = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`) : "");
  const yesNo = (v: boolean | null, unknown = "") => (v === true ? "yes" : v === false ? "no" : unknown);

  const rows = items.map((i) => [
    i.trade_name, i.active_ingredient ?? "", i.strength ?? "", i.dosage_form ?? "", i.pack_size ?? "", i.pzn ?? "",
    i.manufacturer, SELLER_LABEL[i.seller] ?? i.seller, i.batch || "", toDate(i.expiry_date),
    i.available_qty ?? "on request", i.moq,
    ...(opts.includePrices ? [i.unit_price === null ? "on request" : Number(i.unit_price)] : []),
    i.incoterm, yesNo(i.coa_available, "on request"), yesNo(i.is_rx), yesNo(i.is_cold_chain), yesNo(i.is_narcotic),
    toDate(i.stock_as_of),
  ]);

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows], { cellDates: true });

  // Formats: dates as dates, prices with two decimals
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  const dateCols = [header.indexOf("Expiry date"), header.indexOf("Stock as of")];
  const priceCol = header.indexOf("Price per pack (EUR)");
  for (let r = 1; r <= range.e.r; r++) {
    for (const c of dateCols) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.t === "d") cell.z = "yyyy-mm-dd";
    }
    if (priceCol >= 0) {
      const cell = ws[XLSX.utils.encode_cell({ r, c: priceCol })];
      if (cell && cell.t === "n") cell.z = "#,##0.00";
    }
  }
  ws["!cols"] = header.map((h) => ({
    wch: h === "Product" ? 48 : h === "Active ingredient" || h === "Manufacturer" ? 22 : Math.max(10, h.length + 2),
  }));
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: range.e.r, c: range.e.c } }) };

  const info = XLSX.utils.aoa_to_sheet([
    [`Availability list, exported on ${today}`],
    [""],
    [opts.includePrices ? "Prices per pack in EUR, excluding VAT." : "Prices on request."],
    ["Availability as reported by the manufacturer on the date shown and subject to confirmation."],
    ["Narcotics are supplied only after individual review of permits."],
  ]);
  info["!cols"] = [{ wch: 90 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Products");
  XLSX.utils.book_append_sheet(wb, info, "Info");
  XLSX.writeFile(wb, `availability-${today}.xlsx`, { compression: true });
}
