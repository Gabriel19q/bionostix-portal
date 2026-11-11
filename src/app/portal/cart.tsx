"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { displayDate, eur } from "@/lib/format";
import { COUNTRIES, matchCountry } from "@/lib/countries";
import type { CatalogItem } from "./catalog-table";
import { submitRequestAction } from "./actions";

export type Cart = Record<string, number>; // offer_id -> packs

const KEY = "bnx-cart";

// Remembered per browser so a half-finished request survives a reload
export function useCart(items: CatalogItem[]) {
  const [cart, setCart] = useState<Cart>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Cart;
      const valid = new Set(items.map((i) => i.offer_id));
      setCart(Object.fromEntries(Object.entries(saved).filter(([id, q]) => valid.has(id) && q > 0)));
    } catch {
      // storage unavailable: start empty
    }
    setLoaded(true);
  }, [items]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(cart));
    } catch {
      // ignore
    }
  }, [cart, loaded]);

  return {
    cart,
    set: (offerId: string, qty: number) =>
      setCart((c) => {
        const next = { ...c };
        if (qty > 0) next[offerId] = qty;
        else delete next[offerId];
        return next;
      }),
    clear: () => setCart({}),
  };
}

export function CartPanel({
  items, cart, setQty, clear, canRequest, defaultCountry,
}: {
  items: CatalogItem[];
  cart: Cart;
  setQty: (offerId: string, qty: number) => void;
  clear: () => void;
  canRequest: boolean;
  defaultCountry: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [comment, setComment] = useState("");
  const [country, setCountry] = useState(matchCountry(defaultCountry));
  const [deadline, setDeadline] = useState("");
  const [minExpiry, setMinExpiry] = useState<Record<string, string>>({});
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lines = items.filter((i) => cart[i.offer_id]);
  if (lines.length === 0) return null;

  const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const tooMuch = (i: CatalogItem) => i.available_qty !== null && cart[i.offer_id] > i.available_qty;
  const problems = lines.filter((i) => cart[i.offer_id] < i.moq || tooMuch(i));
  const total = lines.reduce((sum, i) => sum + (i.unit_price === null ? 0 : cart[i.offer_id] * Number(i.unit_price)), 0);
  const openPrices = lines.some((i) => i.unit_price === null);
  const packs = lines.reduce((sum, i) => sum + cart[i.offer_id], 0);
  const ready = canRequest && problems.length === 0 && country !== "" && deadline !== "" && acceptedTerms;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    const res = await submitRequestAction({
      items: lines.map((i) => ({ offer_id: i.offer_id, qty: cart[i.offer_id], min_expiry: minExpiry[i.offer_id] || undefined })),
      comment,
      deliveryCountry: country,
      deliveryDeadline: deadline,
      acceptedTerms,
    });
    if (res.ok) {
      clear();
      router.push(`/portal/requests/${res.id}?sent=1`);
    } else {
      setError(res.error);
      setBusy(false);
    }
  }

  // Closed: a small bar at the bottom; the selection stays.
  if (!open) {
    return (
      <div className="card sticky bottom-4 flex flex-wrap items-center justify-between gap-3 border-brand-600 py-3 shadow-lg">
        <p className="text-sm">
          <span className="font-bold">Your order request:</span> {lines.length} product(s), {packs.toLocaleString("en")} packs
        </p>
        <button type="button" className="btn-primary" onClick={() => setOpen(true)}>Open order request</button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} aria-label="Your order request"
      className="card sticky bottom-4 max-h-[75vh] space-y-4 overflow-y-auto border-brand-600 shadow-lg">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold">Your order request</h2>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Close</button>
      </div>
      <table className="table-stack min-w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="py-1">Product</th><th className="py-1">Batch / expiry</th>
            <th className="py-1 text-right">Packs</th><th className="py-1 text-right">Price</th>
            <th className="py-1 text-right">Total</th><th></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {lines.map((i) => {
            const qty = cart[i.offer_id];
            const bad = qty < i.moq || tooMuch(i);
            return (
              <tr key={i.offer_id}>
                <td className="py-1.5">{i.trade_name} <span className="text-xs text-slate-500">{i.strength} {i.pack_size}</span></td>
                <td className="py-1.5 text-xs" data-label="Batch / expiry">
                  <div>
                    <span className="font-mono">{i.batch || "–"}</span>
                    {i.expiry_date ? (
                      <div className="text-slate-500">exp. {displayDate(i.expiry_date)}</div>
                    ) : (
                      <label className="mt-1 block">
                        <span className="block font-bold text-slate-900">Min. expiry (optional)</span>
                        <input type="date" min={tomorrow} className="input mt-0.5 w-40 py-1 text-sm"
                          value={minExpiry[i.offer_id] ?? ""}
                          onChange={(e) => setMinExpiry({ ...minExpiry, [i.offer_id]: e.target.value })} />
                      </label>
                    )}
                  </div>
                </td>
                <td className="py-1.5 text-right" data-label="Packs">
                  <div>
                    <input type="number" min={i.moq} max={i.available_qty ?? undefined} value={qty} aria-label={`Packs of ${i.trade_name}`}
                      onChange={(e) => setQty(i.offer_id, Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                      className={`input w-24 text-right ${bad ? "input-error" : ""}`} />
                    {bad && <div className="field-error text-xs">{i.available_qty === null ? `min. ${i.moq}` : `${i.moq}–${i.available_qty}`}</div>}
                  </div>
                </td>
                <td className="py-1.5 text-right" data-label="Price">{i.unit_price === null ? "On request" : eur(i.unit_price)}</td>
                <td className="py-1.5 text-right" data-label="Total">{i.unit_price === null ? "–" : eur(qty * Number(i.unit_price))}</td>
                <td className="py-1.5 text-right">
                  <button type="button" className="text-xs text-slate-600 underline" onClick={() => setQty(i.offer_id, 0)}>Remove</button>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className="pt-2 text-right font-bold">
              Total{openPrices && <span className="font-normal text-slate-500"> (plus items with price on request)</span>}
            </td>
            <td className="pt-2 text-right font-bold">{eur(total)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="label" htmlFor="country">Delivery country *</label>
          <select id="country" className="input" required value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">Select…</option>
            {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="deadline">Delivery deadline *</label>
          <input id="deadline" type="date" className="input" required min={tomorrow} value={deadline}
            onChange={(e) => setDeadline(e.target.value)} />
          <p className="mt-1 text-xs text-slate-600">Latest date the goods must arrive.</p>
        </div>
        <div>
          <label className="label" htmlFor="comment">Comment (optional)</label>
          <input id="comment" className="input" value={comment} onChange={(e) => setComment(e.target.value)}
            placeholder="e.g. partial delivery OK" />
        </div>
      </div>
      <p className="text-xs text-slate-600">* Required field</p>
      <div className="notice-info space-y-1">
        <p>
          Your order request is a binding offer to buy on the terms shown. You can cancel it at any time before you
          receive the seller’s order confirmation. Once you receive that confirmation, a contract is formed according
          to our <Link href="/terms" target="_blank" className="text-brand-600 underline">terms &amp; conditions</Link>.
        </p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} required />
        <span>I accept the <Link href="/terms" target="_blank" className="text-brand-600 underline">terms &amp; conditions</Link>.</span>
      </label>
      {error && <p className="field-error">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={busy || !ready}>
          {busy ? "Sending…" : "Send binding order request"}
        </button>
        <button type="button" className="text-sm text-slate-600 underline" onClick={clear}>Remove all products</button>
      </div>
    </form>
  );
}
