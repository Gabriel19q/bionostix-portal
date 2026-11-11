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

// Colour per CI v1.9 page 13: it shows what the status means for the viewer.
// Sand = the viewer has to act, blue = informational, green = confirmed, red = declined, grey = closed.
type Viewer = "admin" | "customer";
export function statusTone(status: RequestStatus, viewer: Viewer): string {
  switch (status) {
    case "new":
      return viewer === "admin" ? "tag-attention" : "tag-info";
    case "offer_sent":
      return viewer === "customer" ? "tag-attention" : "tag-info";
    case "in_review":
      return "tag-info";
    case "accepted":
    case "proforma_sent":
    case "paid":
    case "shipped":
    case "completed":
      return "tag-success";
    case "declined":
      return "tag-danger";
    case "cancelled":
      return "tag-neutral";
  }
}

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

export function StatusBadge({ status, viewer }: { status: RequestStatus; viewer: Viewer }) {
  return <span className={statusTone(status, viewer)}>{STATUS_LABEL[status]}</span>;
}
