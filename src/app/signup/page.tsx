import Link from "next/link";
import { ApplicationForm } from "../portal/application-form";

// Registration on one page: account, company, roles, sites and documents; email confirmation at the end.
export default function SignupPage() {
  return (
    <div className="space-y-4">
      <ApplicationForm withAccount />
      <p className="text-center text-sm text-slate-600">
        Already have an account? <Link href="/login" className="text-brand-600 underline">Sign in</Link>
      </p>
    </div>
  );
}
