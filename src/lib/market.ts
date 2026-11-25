// An offer as buyers see it (get_market_catalog / listing_for_buyer): no seller name, no country lists, no commission.
import type { Category } from "@/lib/categories";

export type MarketOffer = {
  id: string; category: Category; product_name: string; name_on_pack: string | null; brand: string;
  active_ingredients: string | null; dosage_form: string | null; test_parameter: string | null; method: string | null;
  ce_marking: boolean | null; ivdr_class: string | null; sample_type: string | null; product_type: string | null;
  size_variant: string | null; material: string | null; units_per_pack: number; unit: string; national_code: string | null;
  ean: string | null; packaging_language: string; quantity: number; moq: number | null; price: number;
  expiry_date: string | null; min_shelf_life_months: number | null; incoterm: string; incoterm_place: string;
  lead_time_days: number | null; valid_until: string; registered_in: string[] | null; documents_available: string[] | null;
  seller_code: string; seller_country: string; updated_at: string;
};

// Remaining shelf life in whole months (expiry date) or the guaranteed minimum
export function shelfLifeMonths(o: Pick<MarketOffer, "expiry_date" | "min_shelf_life_months">, today = new Date()) {
  if (o.expiry_date) {
    const e = new Date(o.expiry_date);
    return (e.getFullYear() - today.getFullYear()) * 12 + (e.getMonth() - today.getMonth());
  }
  return o.min_shelf_life_months ?? null;
}

export function offerHeading(o: MarketOffer) {
  return o.active_ingredients || o.test_parameter || o.product_type || o.product_name;
}

export function offerSpec(o: MarketOffer) {
  return [o.dosage_form, o.method, o.size_variant, o.material, `${o.units_per_pack} ${o.unit}`].filter(Boolean).join(" · ");
}
