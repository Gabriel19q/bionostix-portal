import Link from "next/link";
import { getSession, isApprovedBuyer, isApprovedSeller } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { displayDate } from "@/lib/format";
import { ORDER_STATUS, OPEN_STATUSES, type Order } from "@/lib/orders";

type Todo = { href: string; text: string };

// Start page after login: what needs to be done now, for buyers and sellers separately.
export async function Overview() {
  const { supabase, account } = await getSession();
  if (!account?.company) return null;
  const buyer = isApprovedBuyer(account);
  const seller = isApprovedSeller(account);

  const [{ data: orderData }, { data: reqData }, { data: matchData }, { data: listingData }] = await Promise.all([
    supabase.rpc("get_my_orders"),
    buyer ? supabase.rpc("get_my_product_requests") : Promise.resolve({ data: [] }),
    buyer ? supabase.rpc("get_my_request_matches") : Promise.resolve({ data: [] }),
    seller ? supabase.rpc("get_my_listings") : Promise.resolve({ data: [] }),
  ]);
  await logActivity(supabase, "view_requests", "/portal", { overview: true });
  const orders = (orderData ?? []) as Order[];
  const requests = (reqData ?? []) as { id: string; status: string }[];
  const matches = (matchData ?? []) as { request_id: string; kind: string }[];
  const listings = (listingData ?? []) as { status: string; valid_until: string }[];
  const today = new Date().toISOString().slice(0, 10);

  const bought = orders.filter((o) => o.side === "buyer");
  const sold = orders.filter((o) => o.side === "seller");
  const hasInvoice = (o: Order) => o.documents.some((d) => d.mine && ["invoice", "order_confirmation"].includes(d.kind));

  const todos: Todo[] = [];
  for (const o of bought.filter((x) => x.status === "countered")) todos.push({ href: `/portal/requests/${o.id}`, text: `Answer the counter-offer for ${o.number} (${o.product.product_name})` });
  for (const o of sold.filter((x) => x.status === "requested")) todos.push({ href: `/portal/sell/orders/${o.id}`, text: `Answer the request ${o.number} (${o.product.product_name}, ${o.quantity} packs)` });
  for (const o of sold.filter((x) => x.status === "accepted" && !hasInvoice(x))) todos.push({ href: `/portal/sell/orders/${o.id}`, text: `Upload the invoice or order confirmation for ${o.number}` });
  const drafts = requests.filter((r) => r.status === "draft").length;
  if (drafts) todos.push({ href: "/portal/sourcing/upload?drafts=1", text: `Confirm ${drafts} product request(s) prepared by Bionostix` });
  const draftOffers = listings.filter((l) => l.status === "draft").length;
  if (draftOffers) todos.push({ href: "/portal/sell/upload?drafts=1", text: `Check and publish ${draftOffers} offer(s) prepared by Bionostix` });
  const expired = listings.filter((l) => l.status === "active" && l.valid_until < today).length;
  if (expired) todos.push({ href: "/portal/sell", text: `${expired} offer(s) have expired – update the validity` });

  const openBought = bought.filter((o) => OPEN_STATUSES.includes(o.status));
  const openSold = sold.filter((o) => OPEN_STATUSES.includes(o.status));
  const withMatches = new Set(matches.map((m) => m.request_id)).size;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-sm text-slate-600">{account.company.name}</p>
      </div>

      <div className="card space-y-2">
        <h2 className="font-bold">To do</h2>
        {todos.length === 0 ? <p className="text-sm text-slate-600">Nothing to do right now.</p> : (
          <ul className="space-y-1 text-sm">
            {todos.map((t) => <li key={t.href + t.text}><Link href={t.href} className="text-brand-600 underline">{t.text}</Link></li>)}
          </ul>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {buyer && (
          <div className="card space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-bold">Buying</h2>
              <Link href="/portal/catalog" className="btn-primary">Product offering</Link>
            </div>
            <p className="text-sm text-slate-600">
              {openBought.length} open order(s) ·{" "}
              <Link href="/portal/sourcing" className="text-brand-600 underline">
                {requests.filter((r) => ["open", "in_progress", "offered"].includes(r.status)).length} product request(s)
              </Link>
              {withMatches > 0 && <>, {withMatches} with matching offers</>}
            </p>
            <OrderLines orders={openBought.slice(0, 5)} base="/portal/requests/" />
          </div>
        )}
        {seller && (
          <div className="card space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-bold">Selling</h2>
              <Link href="/portal/sell" className="btn-secondary">My offers</Link>
            </div>
            <p className="text-sm text-slate-600">
              {listings.filter((l) => l.status === "active").length} active offer(s) · {openSold.length} open order(s)
            </p>
            <OrderLines orders={openSold.slice(0, 5)} base="/portal/sell/orders/" />
          </div>
        )}
      </div>
    </div>
  );
}

function OrderLines({ orders, base }: { orders: Order[]; base: string }) {
  if (orders.length === 0) return null;
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {orders.map((o) => (
        <li key={o.id} className="flex items-center justify-between gap-3 py-2">
          <Link href={base + o.id} className="min-w-0 truncate text-brand-600 underline">{o.number} · {o.product.product_name}</Link>
          <span className="shrink-0 text-xs text-slate-500">{displayDate(o.updated_at)} <span className={ORDER_STATUS[o.status].tag}>{ORDER_STATUS[o.status].label}</span></span>
        </li>
      ))}
    </ul>
  );
}
