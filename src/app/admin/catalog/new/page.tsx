import { getSession } from "@/lib/session";
import { OfferForm } from "../offer-form";

export default async function NewOfferPage() {
  const { supabase } = await getSession();
  const { data } = await supabase.from("manufacturers").select("name").order("name");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Add batch</h1>
      <OfferForm values={{}} manufacturers={(data ?? []).map((m) => m.name)} />
    </div>
  );
}
