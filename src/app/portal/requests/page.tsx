import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, isApprovedBuyer } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import type { Order } from "@/lib/orders";
import { OrderList } from "../orders/order-list";

export default async function MyOrdersPage() {
  const { supabase, user, profile, account } = await getSession();
  if (!user) redirect("/login");
  if (profile?.role === "admin") redirect("/admin/requests");
  if (!isApprovedBuyer(account)) redirect("/portal");
  const { data } = await supabase.rpc("get_my_orders");
  const orders = ((data ?? []) as Order[]).filter((o) => o.side === "buyer");
  await logActivity(supabase, "view_requests", "/portal/requests");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My orders</h1>
        <p className="text-sm text-slate-600">Your binding requests to sellers and the orders concluded from them.</p>
      </div>
      <OrderList orders={orders} side="buyer"
        empty={<>No orders yet. Find products under <Link href="/portal/catalog" className="text-brand-600 underline">Product offering</Link>.</>} />
    </div>
  );
}
