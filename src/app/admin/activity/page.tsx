import Link from "next/link";
import { getSession } from "@/lib/session";

type Overview = {
  user_id: string; email: string; full_name: string | null; company_id: string | null; company_name: string | null;
  registered_at: string; last_sign_in_at: string | null; last_seen: string | null;
  visits_7d: number; visits_30d: number; catalog_views_30d: number; exports_30d: number; requests_30d: number;
};
type Event = {
  id: number; event: string; path: string | null; meta: Record<string, unknown> | null; created_at: string;
  profiles: { email: string; full_name: string | null } | null;
  companies: { name: string } | null;
};

const EVENT_LABEL: Record<string, string> = {
  login: "Signed in",
  view_catalog: "Viewed catalog",
  view_requests: "Viewed request list",
  view_request: "Opened a request",
  export: "Downloaded Excel",
  submit_request: "Sent a request",
  respond: "Answered an offer",
};

const berlin = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});
const when = (iso: string | null) => (iso ? berlin.format(new Date(iso)) : "–");

function ago(iso: string | null) {
  if (!iso) return "never";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 2) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

function detail(e: Event) {
  const m = e.meta ?? {};
  if (e.event === "export") return `${m.rows ?? "?"} rows${m.prices === false ? ", without prices" : ""}`;
  if (e.event === "submit_request") return `${m.number ?? ""} · ${m.lines ?? "?"} line(s)`;
  if (e.event === "respond") return `${m.number ?? ""} · ${m.accepted ? "accepted" : "cancelled"}`;
  if (e.event === "view_request") return String(m.number ?? "");
  if (e.event === "view_catalog") return `${m.items ?? "?"} products shown`;
  return "";
}

export default async function ActivityPage() {
  const { supabase } = await getSession();
  const [{ data: overview }, { data: events }] = await Promise.all([
    supabase.rpc("admin_activity_overview"),
    supabase
      .from("activity_log")
      .select("id, event, path, meta, created_at, profiles(email, full_name), companies(name)")
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<Event[]>(),
  ]);
  const users = (overview ?? []) as Overview[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Activity</h1>
        <p className="text-sm text-slate-600">
          How customers use the portal. A visit is a period of activity with no break longer than 30 minutes.
          Admin activity is not recorded. Times in Berlin time.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Customer</th><th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Last active</th><th className="px-3 py-2">Last sign-in</th>
              <th className="px-3 py-2 text-right">Visits 7 days</th><th className="px-3 py-2 text-right">Visits 30 days</th>
              <th className="px-3 py-2 text-right">Catalog views</th><th className="px-3 py-2 text-right">Excel downloads</th>
              <th className="px-3 py-2 text-right">Requests</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-slate-500">No customers yet.</td></tr>
            )}
            {users.map((u) => (
              <tr key={u.user_id}>
                <td className="px-3 py-2 font-medium">{u.company_name ?? <span className="text-slate-400">no company yet</span>}</td>
                <td className="px-3 py-2">{u.full_name}<div className="text-xs text-slate-500">{u.email}</div></td>
                <td className="px-3 py-2">
                  {ago(u.last_seen)}
                  {u.last_seen && <div className="text-xs text-slate-500">{when(u.last_seen)}</div>}
                </td>
                <td className="px-3 py-2 text-xs">{when(u.last_sign_in_at)}</td>
                <td className="px-3 py-2 text-right">{u.visits_7d}</td>
                <td className="px-3 py-2 text-right">{u.visits_30d}</td>
                <td className="px-3 py-2 text-right">{u.catalog_views_30d}</td>
                <td className="px-3 py-2 text-right">{u.exports_30d}</td>
                <td className="px-3 py-2 text-right">{u.requests_30d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Counts cover the last 30 days. Requests are listed in detail under <Link href="/admin/requests" className="underline">Requests</Link>.</p>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Latest activity</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr><th className="px-3 py-2">Time</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">User</th><th className="px-3 py-2">What</th><th className="px-3 py-2">Details</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(events ?? []).length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No activity recorded yet.</td></tr>
              )}
              {(events ?? []).map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-3 py-1.5 text-xs">{when(e.created_at)}</td>
                  <td className="px-3 py-1.5">{e.companies?.name ?? "–"}</td>
                  <td className="px-3 py-1.5 text-xs">{e.profiles?.full_name ?? e.profiles?.email}</td>
                  <td className="px-3 py-1.5">{EVENT_LABEL[e.event] ?? e.event}</td>
                  <td className="px-3 py-1.5 text-xs text-slate-600">{detail(e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
