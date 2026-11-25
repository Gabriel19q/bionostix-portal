import type { Metadata } from "next";
import localFont from "next/font/local";
import Image from "next/image";
import Link from "next/link";
import { IMPRINT_URL, WEBSITE_URL } from "@/content/company";
import "./globals.css";
import { getSession, isApprovedSeller } from "@/lib/session";
import { NavLink } from "@/components/nav-link";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Bionostix Germany · Partner Portal",
  description: "EU-sourced pharmaceuticals for licensed wholesalers and importers.",
  robots: { index: false, follow: false },
};

// Montserrat, self-hosted (SIL Open Font License, see fonts/OFL.txt).
const montserrat = localFont({
  src: [
    { path: "./fonts/Montserrat-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Montserrat-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-montserrat",
  display: "swap",
});

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { user, profile, account } = await getSession();
  const seller = isApprovedSeller(account);

  return (
    <html lang="en" className={montserrat.variable}>
      <body className="flex min-h-screen flex-col">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-3">
            {/* Bionostix Germany wordmark (CI): leads to the company website; "Partner Portal" leads to the portal home */}
            <div className="flex items-center gap-4">
              <a href={WEBSITE_URL} className="p-[11px]" aria-label="Bionostix Germany website">
                <Image src="/brand/Bionostix-Germany-Colour.svg" alt="" width={176} height={60} priority className="h-auto w-[140px] sm:w-[176px]" />
              </a>
              <Link href="/" className="hidden border-l border-slate-200 py-2 pl-4 text-sm font-bold text-slate-900 hover:text-brand-600 sm:block">
                Partner Portal
              </Link>
            </div>
            <nav className="flex flex-wrap items-center gap-3 text-sm">
              {user ? (
                <>
                  {profile?.role === "admin" ? (
                    <NavLink href="/admin/requests" match="/admin">Admin</NavLink>
                  ) : (
                    <>
                      <NavLink href="/portal" exact>Overview</NavLink>
                      <NavLink href="/portal/catalog">Product offering</NavLink>
                      <NavLink href="/portal/requests">My orders</NavLink>
                      <NavLink href="/portal/sourcing">Product requests</NavLink>
                      {seller && <NavLink href="/portal/sell" not="/portal/sell/orders">My offers</NavLink>}
                      {seller && <NavLink href="/portal/sell/orders">Incoming orders</NavLink>}
                    </>
                  )}
                  <form action="/auth/signout" method="post">
                    <button className="btn-secondary">Sign out</button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/login" className="btn-secondary">
                    Sign in
                  </Link>
                  <Link href="/signup" className="btn-primary">
                    Request access
                  </Link>
                </>
              )}
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>
        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-6 py-4 text-xs text-slate-500">
            <span>Bionostix Germany · The European trading arm of the Bionostix Group</span>
            <span className="flex gap-4">
              <span>For licensed pharmaceutical wholesalers and importers only.</span>
              <Link href="/terms" className="underline hover:text-brand-600">Terms &amp; conditions</Link>
              <a href={IMPRINT_URL} className="underline hover:text-brand-600">Legal notice</a>
            </span>
          </div>
        </footer>
        <Toaster />
      </body>
    </html>
  );
}
