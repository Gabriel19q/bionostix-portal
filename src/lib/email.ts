import "server-only";

// Sends plain-text emails through Resend (https://resend.com).
// Without RESEND_API_KEY nothing is sent and the portal keeps working.
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://portal.bionostix-germany.de";
const FROM = process.env.EMAIL_FROM ?? "Bionostix Germany <portal@bionostix.de>";

export function adminEmails() {
  return (process.env.ADMIN_NOTIFY_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function sendEmail({ to, subject, text }: { to: string[]; subject: string; text: string }) {
  const recipients = [...new Set(to.filter(Boolean))];
  const key = process.env.RESEND_API_KEY;
  if (!key || recipients.length === 0) {
    console.info(`[email skipped${key ? "" : ": no RESEND_API_KEY"}] ${subject} -> ${recipients.join(", ")}`);
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: recipients, subject, text }),
    });
    if (!res.ok) console.error(`[email failed ${res.status}] ${subject}: ${await res.text()}`);
  } catch (err) {
    // A failed email must never break the action the user took
    console.error(`[email failed] ${subject}`, err);
  }
}

const footer = `\n\nBionostix Germany · The European trading arm of the Bionostix Group\n${SITE}`;

export const emails = {
  newRequest: (number: string, company: string, lines: number, id: string) => ({
    subject: `New order request ${number} from ${company}`,
    text: `${company} sent order request ${number} with ${lines} line(s).\n\nOpen it: ${SITE}/admin/requests/${id}${footer}`,
  }),
  customerResponded: (number: string, company: string, accepted: boolean, id: string) => ({
    subject: accepted
      ? `${company} accepted the changes for ${number}: please send the proforma`
      : `${company} cancelled ${number}`,
    text: `${company} ${accepted ? "accepted the proposed changes for" : "cancelled"} request ${number}.\n\nOpen it: ${SITE}/admin/requests/${id}${footer}`,
  }),
  statusChanged: (number: string, statusLabel: string, hint: string, message: string | null, id: string) => ({
    subject: `Request ${number}: ${statusLabel}`,
    text: `Your request ${number} is now: ${statusLabel}.\n${hint}${message ? `\n\nMessage from Bionostix Germany:\n${message}` : ""}\n\nView your request: ${SITE}/portal/requests/${id}${footer}`,
  }),
  counterOffer: (number: string, changes: string, message: string | null, id: string) => ({
    subject: `Request ${number}: please accept the changes`,
    text: `We can supply your order request ${number} with the following changes:\n\n${changes}\n\nAll other lines are confirmed as requested.${message ? `\n\nMessage from Bionostix Germany:\n${message}` : ""}\n\nPlease accept the changes or cancel the request in the portal. After your acceptance we send the proforma invoice, which confirms your order.\n\nOpen your request: ${SITE}/portal/requests/${id}${footer}`,
  }),
  documentAdded: (number: string, docLabel: string, id: string) => ({
    subject: `Request ${number}: new document`,
    text: `A new document (${docLabel}) is available for your request ${number}.\n\nView it: ${SITE}/portal/requests/${id}${footer}`,
  }),
  accessApproved: (company: string) => ({
    subject: "Your access to the Bionostix Germany partner portal is active",
    text: `Your access for ${company} has been approved. You can now sign in and see current availability and prices.\n\nSign in: ${SITE}/login${footer}`,
  }),
  newApplication: (company: string, country: string) => ({
    subject: `New access request: ${company}`,
    text: `${company} (${country}) requested access and uploaded its licence.\n\nReview it: ${SITE}/admin${footer}`,
  }),
};
