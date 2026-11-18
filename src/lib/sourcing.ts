// Sourcing requests: products a customer looks for that are not in the catalog.
export type SourcingStatus = "open" | "in_progress" | "offered" | "closed";

export const SOURCING_STATUS: Record<SourcingStatus, { label: string; tag: string; hint: string }> = {
  open: { label: "Received", tag: "tag-attention", hint: "We have your request and will check availability." },
  in_progress: { label: "Searching", tag: "tag-info", hint: "We are asking our manufacturers." },
  offered: { label: "Offer available", tag: "tag-success", hint: "See our message below." },
  closed: { label: "Closed", tag: "tag-neutral", hint: "This request is closed." },
};

export type SourcingRequest = {
  id: string;
  number: string;
  product: string;
  details: string | null;
  quantity: string | null;
  target_price: string | null;
  needed_by: string | null;
  delivery_country: string;
  status: SourcingStatus;
  reply: string | null;
  created_at: string;
  updated_at: string;
};
