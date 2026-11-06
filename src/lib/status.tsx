export type RequestStatus =
  | "new" | "in_review" | "offer_sent" | "accepted" | "proforma_sent"
  | "paid" | "shipped" | "completed" | "declined" | "cancelled";

export const STATUS_FLOW: RequestStatus[] = [
  "new", "in_review", "offer_sent", "accepted", "proforma_sent", "paid", "shipped", "completed",
];

export const STATUS_LABEL: Record<RequestStatus, string> = {
  new: "New",
  in_review: "In review",
  offer_sent: "Offer sent",
  accepted: "Accepted",
  proforma_sent: "Proforma sent",
  paid: "Paid",
  shipped: "Shipped",
  completed: "Completed",
  declined: "Declined",
  cancelled: "Cancelled",
};

// What the customer should understand at each step
export const STATUS_HINT: Record<RequestStatus, string> = {
  new: "We have received your request.",
  in_review: "We are checking availability with the manufacturer.",
  offer_sent: "Please review the confirmed quantities and prices and accept the offer.",
  accepted: "Thank you. We are preparing the proforma invoice.",
  proforma_sent: "The proforma invoice is available below. Delivery starts after payment.",
  paid: "Payment received. We are arranging shipment.",
  shipped: "Your goods are on the way. Shipping documents are available below.",
  completed: "This request is completed.",
  declined: "We could not supply this request.",
  cancelled: "This request was cancelled.",
};

export const STATUS_STYLE: Record<RequestStatus, string> = {
  new: "bg-amber-100 text-amber-900",
  in_review: "bg-sky-100 text-sky-900",
  offer_sent: "bg-violet-100 text-violet-900",
  accepted: "bg-emerald-100 text-emerald-900",
  proforma_sent: "bg-emerald-100 text-emerald-900",
  paid: "bg-emerald-100 text-emerald-900",
  shipped: "bg-emerald-100 text-emerald-900",
  completed: "bg-slate-200 text-slate-800",
  declined: "bg-red-100 text-red-900",
  cancelled: "bg-slate-100 text-slate-600",
};

export const SELLER_LABEL: Record<string, string> = {
  bionostix_germany: "Bionostix Germany",
  sanicura: "Sanicura",
  manufacturer: "Manufacturer",
};

export const DOC_TYPE_LABEL: Record<string, string> = {
  license: "Licence",
  gdp_certificate: "GDP certificate",
  coa: "Certificate of analysis",
  proforma: "Proforma invoice",
  invoice: "Invoice",
  shipping: "Shipping document",
  other: "Other",
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
