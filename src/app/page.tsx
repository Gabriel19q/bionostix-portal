import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

const steps = [
  {
    title: "Request access",
    text: "Create an account and upload your wholesale distribution authorisation or import licence.",
  },
  {
    title: "Verification",
    text: "We check your licence and activate your account. You receive an email once access is granted.",
  },
  {
    title: "Browse and request",
    text: "See current stock from European manufacturers with batch, expiry and price, and send requests in a few clicks.",
  },
];

export default async function Home() {
  // Signed-in users (e.g. right after confirming their email) go straight to the portal
  const { user } = await getSession();
  if (user) redirect("/portal");

  return (
    <div className="space-y-14">
      <section className="bg-sand px-6 py-12 md:px-14 md:py-16">
        <div className="max-w-3xl space-y-5">
          <p className="text-base font-bold text-brand-600">Bionostix Germany</p>
          <h1 className="hyphens-auto text-4xl font-bold text-slate-900 md:text-[56px]">
            EU-sourced pharmaceuticals for licensed wholesalers and importers
          </h1>
          <p className="text-base text-slate-700 md:text-lg">
            Current availability from European manufacturers, with batch, expiry date and price, in one place.
            Request quotes directly instead of chasing spreadsheets.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/signup" className="btn-primary">
              Request access
            </Link>
            <Link href="/login" className="btn-secondary">
              Sign in
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.title} className="card">
            <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
              {i + 1}
            </div>
            <h2 className="mb-2 text-xl font-bold">{s.title}</h2>
            <p className="text-base text-slate-600">{s.text}</p>
          </div>
        ))}
      </section>

      <p className="text-xs text-slate-500">
        Product information and prices are available to verified healthcare trade professionals only.
      </p>
    </div>
  );
}
