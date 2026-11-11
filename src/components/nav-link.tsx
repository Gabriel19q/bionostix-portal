"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Navigation link that marks the current page (CI v1.9 page 12: active page in blue with a 3 px underline).
export function NavLink({
  href,
  exact = false,
  match,
  className = "",
  children,
}: {
  href: string;
  exact?: boolean;
  /** Path prefix that counts as "current"; defaults to href. */
  match?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const base = match ?? href;
  const active = exact ? path === base : path === base || path.startsWith(base + "/");
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-11 items-center border-b-[3px] font-bold ${
        active ? "border-brand-600 text-brand-600" : "border-transparent text-slate-900 hover:text-brand-600"
      } ${className}`}
    >
      {children}
    </Link>
  );
}
