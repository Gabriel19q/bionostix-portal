import { redirect } from "next/navigation";
import { getSession, isApprovedSeller } from "@/lib/session";
import type { Order } from "@/lib/orders";
import { OrderList } from "../../orders/order-list";

export default async function IncomingOrdersPage() {
  const { supabase, user, account } = await getSession();
  if (!user) redirect("/login");
  if (!isApprovedSeller(account)) redirect("/portal/sell");
  const { data } = await supabase.rpc("get_my_orders");
  const orders = ((data ?? []) as Order[]).filter((o) => o.side === "seller");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Incoming orders</h1>
        <p className="text-sm text-slate-600">
          Binding requests from verified buyers for your offers. Buyers stay anonymous until you accept.
        </p>
      </div>
      <OrderList orders={orders} side="seller" empty="No requests yet. Buyers find your offers under Product offering." />
    </div>
  );
}
