import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { OfferForm } from "../offer-form";
import { offerAction } from "../actions";
import { ConfirmButton } from "../bulk-controls";

export default async function EditOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getSession();
  const [{ data: offer }, { data: manufacturers }] = await Promise.all([
    supabase
      .from("offers")
      .select("*, products(*, manufacturers(name))")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("manufacturers").select("name").order("name"),
  ]);
  if (!offer) notFound();
  const p = offer.products;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Edit {p.trade_name}{offer.batch ? ` · batch ${offer.batch}` : ""}</h1>
      <OfferForm
        manufacturers={(manufacturers ?? []).map((m) => m.name)}
        values={{
          offer_id: offer.id,
          product_id: p.id,
          manufacturer: p.manufacturers?.name,
          trade_name: p.trade_name,
          active_ingredient: p.active_ingredient,
          strength: p.strength,
          dosage_form: p.dosage_form,
          pack_size: p.pack_size,
          pzn: p.pzn,
          is_rx: p.is_rx,
          is_cold_chain: p.is_cold_chain,
          is_narcotic: p.is_narcotic,
          seller: p.seller,
          batch: offer.batch,
          expiry_date: offer.expiry_date,
          available_qty: offer.available_qty,
          moq: offer.moq,
          purchase_price: offer.purchase_price,
          markup_override_pct: offer.markup_override_pct,
          incoterm: offer.incoterm,
          stock_as_of: offer.stock_as_of,
          is_active: offer.is_active,
          internal_note: offer.internal_note,
          coa_available: offer.coa_available,
        }}
      />
      <form action={offerAction} className="card flex flex-wrap items-center justify-between gap-3">
        <input type="hidden" name="offer_id" value={offer.id} />
        <p className="text-sm text-slate-600">
          Delete this batch permanently. If it appears in a customer request, it is hidden instead.
        </p>
        <ConfirmButton value="delete" className="btn-danger" message="Delete this batch? This cannot be undone.">
          Delete batch
        </ConfirmButton>
      </form>
    </div>
  );
}
