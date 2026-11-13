"use client";

import { useRouter } from "next/navigation";

// Adds a batch with its minimum order quantity to the order request (same browser storage as the catalog)
// and opens the catalog, where the order request can be completed.
export function AddToOrder({ offerId, moq }: { offerId: string; moq: number }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn-secondary w-full"
      onClick={() => {
        try {
          const cart = JSON.parse(localStorage.getItem("bnx-cart") ?? "{}") as Record<string, number>;
          if (!cart[offerId]) cart[offerId] = moq;
          localStorage.setItem("bnx-cart", JSON.stringify(cart));
        } catch {
          // storage unavailable: the catalog still opens
        }
        router.push("/portal/catalog");
      }}
    >
      Add to order
    </button>
  );
}
