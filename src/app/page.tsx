import Link from "next/link";

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

export default function Home() {
  return (
    <div className="space-y-14">
      <section className="max-w-3xl space-y-5">
        <p className="text-sm font-medium uppercase tracking-wide text-brand-600">
          The European trading arm of the Bionostix Group
        </p>
        <h1 className="text-4xl font-semibold leading-tight text-brand-900">
          EU-sourced pharmaceuticals for licensed wholesalers and importers
        </h1>
        <p className="text-lg text-slate-600">
          Current availability from European manufacturers, with batch, expiry date and price, in one place.
          Request quotes directly instead of chasing spreadsheets.
        </p>
        <div className="flex gap-3">
          <Link href="/signup" className="btn-primary">
            Request access
          </Link>
          <Link href="/login" className="btn-secondary">
            Sign in
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.title} className="card">
            <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
              {i + 1}
            </div>
            <h2 className="mb-1 font-semibold">{s.title}</h2>
            <p className="text-sm text-slate-600">{s.text}</p>
          </div>
        ))}
      </section>

      <p className="text-xs text-slate-500">
        Product information and prices are available to verified healthcare trade professionals only.
      </p>
    </div>
  );
}
