import { getSession } from "@/lib/session";
import { ImportWizard } from "./import-wizard";

export default async function ImportPage() {
  const { supabase } = await getSession();
  const { data } = await supabase.from("manufacturers").select("name").order("name");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Import stock list</h1>
        <p className="text-sm text-slate-600">
          Upload an Excel or CSV list from one or several manufacturers. You check the column assignment and a preview before anything
          is saved. Batches already in the catalog are updated, new ones are added.
        </p>
      </div>
      <ImportWizard manufacturers={(data ?? []).map((m) => m.name)} />
    </div>
  );
}
