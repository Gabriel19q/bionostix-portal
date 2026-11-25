// Marketplace orders (SPEC.md "Anfrage und Vertrag"): shared labels and types for buyer, seller and admin pages.
import type { Category } from "@/lib/categories";

export type OrderStatus = "requested" | "countered" | "accepted" | "paid" | "shipped" | "completed" | "declined" | "withdrawn";

export const ORDER_STATUS: Record<OrderStatus, { label: string; tag: string }> = {
  requested: { label: "Requested", tag: "tag-attention" },
  countered: { label: "Counter-offer", tag: "tag-attention" },
  accepted: { label: "Accepted", tag: "tag-success" },
  paid: { label: "Payment received", tag: "tag-success" },
  shipped: { label: "Shipped", tag: "tag-info" },
  completed: { label: "Completed", tag: "tag-neutral" },
  declined: { label: "Declined", tag: "tag-neutral" },
  withdrawn: { label: "Withdrawn", tag: "tag-neutral" },
};

export const OPEN_STATUSES: OrderStatus[] = ["requested", "countered", "accepted", "paid", "shipped"];

export const ORDER_DOC_KIND: Record<string, string> = {
  invoice: "Invoice",
  order_confirmation: "Order confirmation",
  delivery_note: "Delivery note",
  document: "Requested document",
  other: "Other document",
};

export const EVENT_LABEL: Record<string, string> = {
  requested: "Request sent",
  countered: "Counter-offer from the seller",
  counter_declined: "Counter-offer declined",
  accepted: "Accepted – contract concluded",
  declined: "Declined by the seller",
  withdrawn: "Withdrawn by the buyer",
  paid: "Payment received",
  shipped: "Shipped",
  completed: "Completed",
  document: "Document uploaded",
};

export type OrderProduct = {
  product_name: string; name_on_pack: string | null; brand: string; active_ingredients: string | null;
  dosage_form: string | null; test_parameter: string | null; product_type: string | null; size_variant: string | null;
  units_per_pack: number | null; unit: string | null; expiry_date: string | null; min_shelf_life_months: number | null;
  incoterm: string; incoterm_place: string; packaging_language: string | null;
};

export type OrderDoc = { id: string; kind: string; file_name: string; storage_path: string; mine: boolean; created_at: string };

export type Order = {
  id: string; number: string; side: "buyer" | "seller"; status: OrderStatus; category: Category;
  product: OrderProduct; unit_price: number; quantity: number; total: number;
  delivery_country: string; final_destination: string; needed_by: string | null; required_documents: string[];
  comment: string | null; counter_quantity: number | null; counter_price: number | null; counter_note: string | null;
  decline_reason: string | null; accepted_at: string | null; tracking: string | null; created_at: string; updated_at: string;
  listing_id: string | null;
  seller: { code: string; country: string; name?: string; address?: string | null; vat_id?: string | null; contact_email?: string | null; contact_phone?: string | null };
  buyer: null | {
    country: string; name?: string; address?: string | null; vat_id?: string | null; contact_name?: string | null;
    contact_email?: string | null; contact_phone?: string | null; licence_valid_until?: string | null; completed_deals?: number;
    documents?: { file_name: string; kind: string | null; storage_path: string }[];
  };
  documents: OrderDoc[];
  events?: { actor: string; event: string; note: string | null; created_at: string }[];
};

export function productLine(p: OrderProduct) {
  const pack = p.units_per_pack ? `${p.units_per_pack} ${p.unit ?? ""}`.trim() : null;
  return [p.active_ingredients, p.dosage_form, p.test_parameter, p.product_type, p.size_variant, pack].filter(Boolean).join(" · ");
}
