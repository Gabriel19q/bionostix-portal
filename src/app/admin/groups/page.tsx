import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";

async function saveGroup(formData: FormData) {
  "use server";
  const { supabase, profile } = await getSession();
  if (profile?.role !== "admin") throw new Error("Admins only");
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const pct = Number(String(formData.get("default_markup_pct") || "").replace(",", "."));
  if (!name || !Number.isFinite(pct) || pct < 0) throw new Error("Please enter a name and a markup of 0 or more.");

  const { error } = id
    ? await supabase.from("customer_groups").update({ name, default_markup_pct: pct }).eq("id", id)
    : await supabase.from("customer_groups").insert({ name, default_markup_pct: pct });
  if (error) throw new Error(error.message);
  revalidatePath("/admin", "layout");
}

export default async function GroupsPage() {
  const { supabase } = await getSession();
  const { data: groups } = await supabase.from("customer_groups").select("id, name, default_markup_pct").order("name");
  const { data: companies } = await supabase.from("companies").select("customer_group_id");
  const countByGroup = new Map<string, number>();
  for (const c of companies ?? []) {
    if (c.customer_group_id) countByGroup.set(c.customer_group_id, (countByGroup.get(c.customer_group_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Customer groups</h1>
        <p className="text-sm text-slate-600">
          Each customer belongs to one group. The group&apos;s markup is added to the purchase price, unless a batch has
          its own markup.
        </p>
      </div>
      <div className="card space-y-4">
        {(groups ?? []).map((g) => (
          <form key={g.id} action={saveGroup} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={g.id} />
            <div className="flex-1">
              <label className="label">Name</label>
              <input name="name" className="input" defaultValue={g.name} required />
            </div>
            <div className="w-40">
              <label className="label">Markup %</label>
              <input name="default_markup_pct" className="input" defaultValue={g.default_markup_pct} required />
            </div>
            <span className="pb-2 text-sm text-slate-500">{countByGroup.get(g.id) ?? 0} customer(s)</span>
            <button className="btn-secondary">Save</button>
          </form>
        ))}
        <form action={saveGroup} className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
          <div className="flex-1">
            <label className="label">New group</label>
            <input name="name" className="input" placeholder="e.g. Export Iraq" required />
          </div>
          <div className="w-40">
            <label className="label">Markup %</label>
            <input name="default_markup_pct" className="input" required />
          </div>
          <button className="btn-primary">Add group</button>
        </form>
      </div>
    </div>
  );
}
