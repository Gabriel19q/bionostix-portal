// Product categories of the marketplace and the documents each role needs (SPEC.md, Marktplatz-Modell).
export type Category = "pharma" | "ivd" | "supplements" | "health";

export const CATEGORIES: { value: Category; label: string }[] = [
  { value: "pharma", label: "Pharmaceuticals" },
  { value: "ivd", label: "In-vitro diagnostics (IVD)" },
  { value: "supplements", label: "Food supplements" },
  { value: "health", label: "Health products (e.g. gloves, dressings)" },
];

export const CATEGORY_LABEL: Record<Category, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c.label]),
) as Record<Category, string>;

export type DocKind =
  | "registry_extract" | "wholesale_licence" | "manufacturing_licence" | "import_licence"
  | "gdp_certificate" | "iso13485" | "food_registration" | "md_import_licence" | "other";

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  registry_extract: "Commercial register extract or business registration",
  wholesale_licence: "Wholesale licence or import licence (pharmaceuticals)",
  manufacturing_licence: "Manufacturing authorisation",
  import_licence: "Import licence",
  gdp_certificate: "GDP certificate",
  iso13485: "ISO 13485 certificate",
  food_registration: "Registration as food business",
  md_import_licence: "Import licence for medical devices / IVD",
  other: "Other document",
};

// One upload field in the application form. siteIndex: the licence belongs to that site.
export type DocSlot = { key: string; kind: DocKind; label: string; hint?: string; required: boolean; siteIndex?: number; category?: Category };

export function docSlots(opts: {
  wantsBuy: boolean;
  wantsSell: boolean;
  buyCats: Category[];
  sellCats: Category[];
  sites: { country: string }[];
}): DocSlot[] {
  const { wantsBuy, wantsSell, buyCats, sellCats, sites } = opts;
  const slots: DocSlot[] = [
    { key: "registry", kind: "registry_extract", label: DOC_KIND_LABEL.registry_extract, required: true },
  ];
  const pharma = (wantsBuy && buyCats.includes("pharma")) || (wantsSell && sellCats.includes("pharma"));
  if (pharma) {
    sites.forEach((s, i) =>
      slots.push({
        key: `pharma-licence-${i}`,
        kind: "wholesale_licence",
        label: sites.length > 1 ? `Pharmaceutical licence for ${s.country || `site ${i + 1}`}` : "Pharmaceutical licence",
        hint: wantsSell && sellCats.includes("pharma")
          ? "Wholesale distribution authorisation or manufacturing authorisation; outside the EU your national import licence."
          : "Wholesale distribution authorisation (EU) or your national import licence.",
        required: true,
        siteIndex: i,
        category: "pharma",
      }),
    );
  }
  if (wantsSell && sellCats.includes("pharma")) {
    slots.push({ key: "gdp", kind: "gdp_certificate", label: DOC_KIND_LABEL.gdp_certificate, required: false, category: "pharma" });
  }
  if (wantsSell && sellCats.includes("ivd")) {
    slots.push({ key: "iso", kind: "iso13485", label: DOC_KIND_LABEL.iso13485, required: false, category: "ivd" });
  }
  if (wantsBuy && buyCats.includes("ivd")) {
    sites.forEach((s, i) =>
      slots.push({
        key: `ivd-import-${i}`,
        kind: "md_import_licence",
        label: sites.length > 1 ? `Import licence for medical devices / IVD – ${s.country || `site ${i + 1}`}` : "Import licence for medical devices / IVD",
        hint: "Only if your country requires one.",
        required: false,
        siteIndex: i,
        category: "ivd",
      }),
    );
  }
  if (wantsSell && sellCats.includes("supplements")) {
    slots.push({ key: "food", kind: "food_registration", label: DOC_KIND_LABEL.food_registration, required: false, category: "supplements" });
  }
  return slots;
}
