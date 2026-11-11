import type { Metadata } from "next";
import localFont from "next/font/local";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";
import { getSession } from "@/lib/session";
import { NavLink } from "@/components/nav-link";

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
  const { user, profile } = await getSession();

  return (
    <html lang="en" className={montserrat.variable}>
      <body className="flex min-h-screen flex-col">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-3">
            {/* Wordmark: min. 120 px wide, clear space of 1/4 of its height on every side (CI v1.5). */}
            <Link href="/" className="flex items-center gap-4 p-[11px]" aria-label="Bionostix Germany Partner Portal, home">
              <Image src="/brand/Bionostix-Colour.svg" alt="" width={152} height={45} priority className="h-auto w-[152px]" />
              <span className="hidden border-l border-slate-200 pl-4 text-sm leading-tight text-slate-600 sm:block">
                <span className="block font-bold text-slate-900">Bionostix Germany</span>
                Partner Portal
              </span>
            </Link>
            <nav className="flex flex-wrap items-center gap-3 text-sm">
              {user ? (
                <>
                  {profile?.role === "admin" ? (
                    <NavLink href="/admin/requests" match="/admin">Admin</NavLink>
                  ) : (
                    <>
                      <NavLink href="/portal" exact>Catalog</NavLink>
                      <NavLink href="/portal/requests">My requests</NavLink>
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
              <Link href="/legal-notice" className="underline hover:text-brand-700">Legal notice</Link>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
