import Link from "next/link";
import { displayDate, eur } from "@/lib/format";
import { ORDER_STATUS, OPEN_STATUSES, productLine, type Order } from "@/lib/orders";

// Orders of one side as a table: open ones first, closed ones below.
export function OrderList({ orders, side, empty }: { orders: Order[]; side: "buyer" | "seller"; empty: React.ReactNode }) {
  const base = side === "buyer" ? "/portal/requests/" : "/portal/sell/orders/";
  if (orders.length === 0) return <div className="card text-sm text-slate-600">{empty}</div>;
  const open = orders.filter((o) => OPEN_STATUSES.includes(o.status));
  const closed = orders.filter((o) => !OPEN_STATUSES.includes(o.status) );
  const todo = (o: Order) => (side === "seller" && o.status === "requested") || (side === "buyer" && o.status === "countered");
  const table = (list: Order[]) => (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-600">
          <tr>
            <th className="p-3">Order</th><th className="p-3">Product</th><th className="p-3 text-right">Quantity</th>
            <th className="p-3 text-right">Total</th><th className="p-3">{side === "buyer" ? "Seller" : "Buyer from"}</th>
            <th className="p-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {list.map((o) => (
            <tr key={o.id} className={todo(o) ? "bg-sand" : ""}>
              <td className="p-3"><Link href={base + o.id} className="font-bold text-brand-600 underline">{o.number}</Link>
                <span className="block text-xs text-slate-500">{displayDate(o.created_at)}</span></td>
              <td className="p-3"><span className="font-medium">{o.product.product_name}</span>
                <span className="block text-xs text-slate-500">{productLine(o.product)}</span></td>
              <td className="p-3 text-right">{o.quantity}</td>
              <td className="p-3 text-right">{eur(o.total)}</td>
              <td className="p-3">{side === "buyer" ? (o.seller.name ?? `Seller ${o.seller.code}`) : (o.buyer?.name ?? o.buyer?.country)}</td>
              <td className="p-3"><span className={ORDER_STATUS[o.status].tag}>{ORDER_STATUS[o.status].label}</span>
                {todo(o) && <span className="block text-xs font-bold text-attention">Your answer is needed</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="space-y-4">
      {open.length > 0 ? table(open) : <div className="card text-sm text-slate-600">No open orders.</div>}
      {closed.length > 0 && (
        <details>
          <summary className="cursor-pointer font-bold">Closed ({closed.length})</summary>
          <div className="mt-3">{table(closed)}</div>
        </details>
      )}
    </div>
  );
}
