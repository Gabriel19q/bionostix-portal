import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { OrderDetail } from "../../orders/order-detail";

export default async function BuyerOrderPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const [{ id }, { sent, error }] = await Promise.all([params, searchParams]);
  const { supabase, user } = await getSession();
  if (!user) redirect("/login");
  await logActivity(supabase, "view_request", `/portal/requests/${id}`);
  return <OrderDetail id={id} side="buyer" sent={!!sent} error={error} />;
}
