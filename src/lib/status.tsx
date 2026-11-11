// Order flow (SPEC.md): the customer's order request is a binding offer to buy; the contract is formed
// with our order confirmation. If quantities or prices change, the customer accepts the changes first.
export type RequestStatus =
  | "new" | "in_review" | "changes_proposed" | "order_confirmed" | "proforma_sent"
  | "deposit_paid" | "ordered" | "shipped" | "completed" | "declined" | "cancelled";

export const STATUS_FLOW: RequestStatus[] = [
  "new", "in_review", "changes_proposed", "order_confirmed", "proforma_sent", "deposit_paid", "ordered", "shipped", "completed",
];

export const STATUS_LABEL: Record<RequestStatus, string> = {
  new: "New",
  in_review: "In review",
  changes_proposed: "Changes to accept",
  order_confirmed: "Order confirmed",
  proforma_sent: "Proforma sent",
  deposit_paid: "Deposit received",
  ordered: "Ordered from manufacturer",
  shipped: "Shipped",
  completed: "Completed",
  declined: "Declined",
  cancelled: "Cancelled",
};

// What the customer should understand at each step
export const STATUS_HINT: Record<RequestStatus, string> = {
  new: "We have received your order request.",
  in_review: "We are checking availability and reserving the stock with the manufacturer.",
  changes_proposed:
    "We can supply your order with the changes shown below. Please accept them to confirm your order, or cancel the request.",
  order_confirmed: "Your order is confirmed. We are preparing the proforma invoice.",
  proforma_sent: "The proforma invoice is available below. We order from the manufacturer once your deposit is received.",
  deposit_paid: "Deposit received. We are placing the order with the manufacturer.",
  ordered: "Ordered from the manufacturer. We will inform you as soon as the goods are shipped.",
  shipped: "Your goods are on the way. Shipping documents are available below.",
  completed: "This order is completed.",
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
    case "changes_proposed":
      return viewer === "customer" ? "tag-attention" : "tag-info";
    case "in_review":
      return "tag-info";
    case "order_confirmed":
    case "proforma_sent":
    case "deposit_paid":
    case "ordered":
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
