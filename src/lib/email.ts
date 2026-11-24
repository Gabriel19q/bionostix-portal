import "server-only";
import { COMPANY } from "@/content/company";

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

const footer = `\n\nBionostix Germany · The European trading arm of the Bionostix Group\n${COMPANY.owner}, trading as ${COMPANY.name} · ${COMPANY.street}, ${COMPANY.city}, ${COMPANY.country}\n${SITE}`;

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
  newSourcing: (number: string, company: string, product: string) => ({
    subject: `New sourcing request ${number} from ${company}`,
    text: `${company} is looking for: ${product}\n\nOpen it: ${SITE}/admin/sourcing${footer}`,
  }),
  sourcingUpdate: (number: string, product: string, statusLabel: string, reply: string | null) => ({
    subject: `Sourcing request ${number}: ${statusLabel}`,
    text: `Your sourcing request ${number} (${product}) is now: ${statusLabel}.${reply ? `\n\nMessage from Bionostix Germany:\n${reply}` : ""}\n\nView it: ${SITE}/portal/sourcing${footer}`,
  }),
  newApplication: (company: string, country: string, roles = "buyer") => ({
    subject: `New access request: ${company}`,
    text: `${company} (${country}) requested access as ${roles} and uploaded its documents.\n\nReview it: ${SITE}/admin${footer}`,
  }),
  // Copy of what the applicant accepted (proof of consent, SPEC.md Registrierung)
  agreementsAccepted: (name: string, version: string, acceptedAt: string, seller: boolean) => ({
    subject: "Your application and accepted agreements – Bionostix Germany partner portal",
    text:
      `Dear ${name},\n\nthank you for your application. We are now verifying your company and will inform you by email.\n\n` +
      `On ${acceptedAt} you accepted the following agreements (version ${version}):\n` +
      `- Terms of use: ${SITE}/terms\n` +
      `- Confidentiality and non-circumvention agreement: ${SITE}/confidentiality\n` +
      (seller ? `- Commission agreement for sellers: ${SITE}/commission-agreement\n` : "") +
      `\nPlease keep this email for your records.${footer}`,
  }),
  offersPrepared: (count: number) => ({
    subject: `Bionostix prepared ${count} offer(s) for you – please check and publish`,
    text:
      `Bionostix Germany uploaded your stock list for you and prepared ${count} offer(s). They are not visible to buyers yet.\n\n` +
      `Please check them and publish: ${SITE}/portal/sell${footer}`,
  }),
  requestsPrepared: (count: number) => ({
    subject: `Bionostix prepared ${count} product request(s) for you – please confirm`,
    text:
      `Bionostix Germany uploaded your list of wanted products and prepared ${count} product request(s).\n\n` +
      `Please check and confirm them: ${SITE}/portal/sourcing${footer}`,
  }),
  newsletterConfirm: (name: string, token: string) => ({
    subject: "Please confirm your newsletter subscription – Bionostix Germany",
    text:
      `Dear ${name},\n\nyou asked to receive news and offers from Bionostix Germany by email. ` +
      `Please confirm with this link (you may be asked to sign in):\n\n${SITE}/newsletter/confirm?token=${token}\n\n` +
      `If you did not ask for this, simply ignore this email: you will not receive any newsletter.${footer}`,
  }),
};
