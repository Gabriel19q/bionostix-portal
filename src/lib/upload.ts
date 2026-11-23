import type { SupabaseClient } from "@supabase/supabase-js";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_TYPES = "application/pdf,image/png,image/jpeg";

// Uploads a licence/certificate into the company's folder and registers it.
export async function uploadCompanyDocument(
  supabase: SupabaseClient,
  companyId: string,
  file: File,
  docType: "license" | "gdp_certificate" | "other",
) {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File is larger than 10 MB.");
  if (!ACCEPTED_TYPES.split(",").includes(file.type)) throw new Error("Please upload a PDF, PNG or JPG file.");

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const path = `company/${companyId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { error: rpcError } = await supabase.rpc("add_company_document", {
    p_storage_path: path,
    p_file_name: file.name,
    p_doc_type: docType,
  });
  if (rpcError) throw new Error(rpcError.message);
}

// Marketplace registration: uploads a document of a given kind, optionally tied to a site and category.
export async function uploadCompanyDocumentV2(
  supabase: SupabaseClient,
  companyId: string,
  file: File,
  kind: string,
  siteId?: string | null,
  category?: string | null,
) {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File is larger than 10 MB.");
  if (!ACCEPTED_TYPES.split(",").includes(file.type)) throw new Error("Please upload a PDF, PNG or JPG file.");

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const path = `company/${companyId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage.from("documents").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { error: rpcError } = await supabase.rpc("add_company_document_v2", {
    p_storage_path: path,
    p_file_name: file.name,
    p_kind: kind,
    p_site_id: siteId ?? null,
    p_category: category ?? null,
  });
  if (rpcError) throw new Error(rpcError.message);
}

// Registration on one page: before the email is confirmed there is no session yet. Files go to
// pending/<new user id>/ and are registered by claim_pending_application() after the first sign-in.
export async function uploadPendingDocument(
  supabase: SupabaseClient,
  userId: string,
  file: File,
  kind: string,
  siteIndex?: number | null,
  category?: string | null,
) {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File is larger than 10 MB.");
  if (!ACCEPTED_TYPES.split(",").includes(file.type)) throw new Error("Please upload a PDF, PNG or JPG file.");
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_").replace(/_+/g, "_").slice(-80);
  const path = `pending/${userId}/${kind}__${siteIndex ?? "x"}__${category ?? "x"}__${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from("documents").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
}
