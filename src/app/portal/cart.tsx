"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { eur } from "@/lib/format";
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
  const [comment, setComment] = useState("");
  const [country, setCountry] = useState(defaultCountry);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lines = items.filter((i) => cart[i.offer_id]);
  if (lines.length === 0) return null;

  const problems = lines.filter((i) => cart[i.offer_id] < i.moq || cart[i.offer_id] > i.available_qty);
  const total = lines.reduce((sum, i) => sum + cart[i.offer_id] * Number(i.unit_price), 0);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    const res = await submitRequestAction({
      items: lines.map((i) => ({ offer_id: i.offer_id, qty: cart[i.offer_id] })),
      comment,
      deliveryCountry: country,
    });
    if (res.ok) {
      clear();
      router.push(`/portal/requests/${res.id}?sent=1`);
    } else {
      setError(res.error);
      setBusy(false);
    }
  }

  return (
    <div className="card sticky bottom-4 space-y-4 border-brand-600 shadow-lg">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Your request</h2>
        <button className="text-sm text-slate-500 underline" onClick={clear}>Clear</button>
      </div>
      <table className="min-w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="py-1">Product</th><th className="py-1">Batch</th>
            <th className="py-1 text-right">Packs</th><th className="py-1 text-right">Price</th>
            <th className="py-1 text-right">Total</th><th></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {lines.map((i) => {
            const qty = cart[i.offer_id];
            const bad = qty < i.moq || qty > i.available_qty;
            return (
              <tr key={i.offer_id}>
                <td className="py-1.5">{i.trade_name} <span className="text-xs text-slate-500">{i.strength} {i.pack_size}</span></td>
                <td className="py-1.5 font-mono text-xs">{i.batch}</td>
                <td className="py-1.5 text-right">
                  <input type="number" min={i.moq} max={i.available_qty} value={qty}
                    onChange={(e) => setQty(i.offer_id, Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                    className={`input w-24 text-right ${bad ? "border-red-400" : ""}`} />
                  {bad && <div className="text-xs text-red-700">{i.moq}–{i.available_qty}</div>}
                </td>
                <td className="py-1.5 text-right">{eur(i.unit_price)}</td>
                <td className="py-1.5 text-right">{eur(qty * Number(i.unit_price))}</td>
                <td className="py-1.5 text-right">
                  <button className="text-xs text-slate-500 underline" onClick={() => setQty(i.offer_id, 0)}>Remove</button>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className="pt-2 text-right font-medium">Indicative total</td>
            <td className="pt-2 text-right font-semibold">{eur(total)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="label" htmlFor="country">Delivery country</label>
          <input id="country" className="input" value={country} onChange={(e) => setCountry(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor="comment">Comment (optional)</label>
          <input id="comment" className="input" value={comment} onChange={(e) => setComment(e.target.value)}
            placeholder="e.g. needed by end of month, partial delivery OK" />
        </div>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={busy || !canRequest || problems.length > 0} onClick={onSubmit}>
          {busy ? "Sending…" : "Send request"}
        </button>
        <p className="text-xs text-slate-500">
          This is a non-binding request. We confirm availability and prices in an offer.
        </p>
      </div>
    </div>
  );
}
