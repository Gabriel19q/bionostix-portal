import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { NavLink } from "@/components/nav-link";

const tabs = [
  { href: "/admin/requests", label: "Orders" },
  { href: "/admin/sourcing", label: "Product requests" },
  { href: "/admin", label: "Companies" },
  { href: "/admin/catalog", label: "Product offering" },
  { href: "/admin/import", label: "Import stock for seller" },
  { href: "/admin/activity", label: "Activity" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await getSession();
  if (profile?.role !== "admin") redirect("/portal");

  return (
    <div className="space-y-6">
      <nav aria-label="Admin" className="flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <NavLink key={t.href} href={t.href} exact={t.href === "/admin"} className="-mb-px px-4 text-sm">
            {t.label}
          </NavLink>
        ))}
      </nav>
      {children}
    </div>
  );
}
