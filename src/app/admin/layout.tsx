import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

const tabs = [
  { href: "/admin/requests", label: "Requests" },
  { href: "/admin", label: "Customers" },
  { href: "/admin/catalog", label: "Catalog" },
  { href: "/admin/import", label: "Import stock list" },
  { href: "/admin/groups", label: "Customer groups" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await getSession();
  if (profile?.role !== "admin") redirect("/portal");

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="rounded-t-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-white hover:text-brand-700"
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
