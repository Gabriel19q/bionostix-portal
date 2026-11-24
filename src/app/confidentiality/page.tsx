import { redirect } from "next/navigation";

// The confidentiality and non-circumvention agreement is part of the terms of use (decision 24.11.2026).
// This address stays so links in earlier emails keep working.
export default function ConfidentialityPage() {
  redirect("/terms#confidentiality");
}
