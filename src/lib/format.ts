const eurFormatter = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });

export function eur(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "–";
  return eurFormatter.format(Number(value));
}

export function sellPrice(purchase: number, overridePct: number | null, groupPct: number) {
  const pct = overridePct ?? groupPct;
  return Math.round(purchase * (1 + pct / 100) * 100) / 100;
}

// "2027-03-31" -> "31 Mar 2027"
export function displayDate(iso: string | null | undefined) {
  if (!iso) return "–";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[m - 1]} ${y}`;
}

export function monthsUntil(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const now = new Date();
  return (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth()) + (d < now.getDate() ? -1 : 0);
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}
