import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { OrderDetail } from "../../../orders/order-detail";

export default async function SellerOrderPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }>;
}) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const { user } = await getSession();
  if (!user) redirect("/login");
  return <OrderDetail id={id} side="seller" error={error} />;
}
