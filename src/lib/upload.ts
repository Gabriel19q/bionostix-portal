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
