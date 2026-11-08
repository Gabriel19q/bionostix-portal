import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Bionostix Germany · Partner Portal",
  description: "EU-sourced pharmaceuticals for licensed wholesalers and importers.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { user, profile } = await getSession();

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="text-lg font-semibold text-brand-900">Bionostix Germany</span>
              <span className="text-sm text-slate-500">Partner Portal</span>
            </Link>
            <nav className="flex items-center gap-3 text-sm">
              {user ? (
                <>
                  {profile?.role === "admin" ? (
                    <Link href="/admin/requests" className="text-slate-700 hover:text-brand-700">
                      Admin
                    </Link>
                  ) : (
                    <>
                      <Link href="/portal" className="text-slate-700 hover:text-brand-700">
                        Catalog
                      </Link>
                      <Link href="/portal/requests" className="text-slate-700 hover:text-brand-700">
                        My requests
                      </Link>
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
