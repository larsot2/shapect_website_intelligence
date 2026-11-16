/**
 * Proposed project data vocabulary (planning only — no runtime ProjectState).
 * The LLM may only use these keys; semantics come from here, never from the
 * model, so "luxury page" can't silently become "premium budget".
 */
export type FieldSemantics = "context" | "preference" | "choice" | "fact" | "derived" | "contact";
export type FieldType = "enum" | "multi_enum" | "boolean" | "number" | "text";

export interface FieldDef {
  semantics: FieldSemantics;
  type: FieldType;
  label: string;
  options?: string[];
  /** must be confirmed by the visitor/business before it can drive anything */
  requiresConfirmation?: boolean;
  /** only meaningful for unsupported scope (kept so opportunities can describe needs) */
  unsupportedScope?: boolean;
}

export const FIELD_CATALOG: Record<string, FieldDef> = {
  "startingContext.page_topic": { semantics: "context", type: "text", label: "Page the visitor started on" },
  "startingContext.property_type": { semantics: "context", type: "enum", label: "Property type suggested by the page (not confirmed)", options: ["house", "apartment", "granny_flat", "townhouse"] },
  "startingContext.quality_perspective": { semantics: "context", type: "enum", label: "Quality angle of the page (not a budget)", options: ["budget", "standard", "luxury"] },
  "property.type": { semantics: "choice", type: "enum", label: "Property type", options: ["house", "apartment", "townhouse", "granny_flat", "other"] },
  "project.room_type": { semantics: "choice", type: "enum", label: "Room", options: ["main_bathroom", "ensuite", "powder_room", "laundry", "bathroom_and_laundry", "other"] },
  "project.scope": { semantics: "choice", type: "enum", label: "Scope of work", options: ["full_renovation", "partial_update", "layout_change", "room_conversion", "not_sure"] },
  "project.layout_change": { semantics: "choice", type: "enum", label: "Layout change", options: ["keep_layout", "change_layout", "not_sure"] },
  "project.plumbing_move": { semantics: "choice", type: "enum", label: "Moving plumbing / drainage", options: ["no", "yes", "not_sure"] },
  "project.room_use": { semantics: "choice", type: "enum", label: "Who uses the room", options: ["family", "guests", "tenants", "elderly_or_accessibility", "other"] },
  "project.space_constraint": { semantics: "fact", type: "text", label: "Space constraints" },
  "project.dimensions_known": { semantics: "fact", type: "boolean", label: "Rough dimensions known" },
  "project.approx_size": { semantics: "fact", type: "number", label: "Approximate size (m²)" },
  "project.access_or_approval_notes": { semantics: "fact", type: "text", label: "Building access / approval notes", requiresConfirmation: true },
  "project.accessibility_needs": { semantics: "choice", type: "multi_enum", label: "Accessibility needs", options: ["step_free_shower", "grab_rails", "wider_access", "seated_use", "not_sure"] },
  "project.priorities": { semantics: "preference", type: "multi_enum", label: "Priorities", options: ["storage", "easy_cleaning", "more_space_feeling", "durability", "look_and_feel", "quick_turnaround"] },
  "project.approval_status": { semantics: "fact", type: "enum", label: "Strata / body-corporate / council approval", options: ["not_needed", "not_started", "in_progress", "approved", "not_sure"], requiresConfirmation: true },
  "project.fixture_supply": { semantics: "choice", type: "enum", label: "Who supplies tiles, fixtures and tapware", options: ["business_supplies", "i_supply_some", "i_supply_all", "not_sure"] },
  "project.funding": { semantics: "context", type: "enum", label: "How the project is funded (not a budget)", options: ["self_funded", "ndis_or_care_package", "insurance", "not_sure"], requiresConfirmation: true },
  "project.timeframe": { semantics: "choice", type: "enum", label: "When to start", options: ["asap", "1_3_months", "3_6_months", "later", "not_sure"] },
  "project.documents_available": { semantics: "fact", type: "multi_enum", label: "Photos / plans available", options: ["photos", "plans", "measurements", "none"] },
  "project.current_condition": { semantics: "fact", type: "text", label: "Current condition / problems" },
  "bathroom.style.preference": { semantics: "preference", type: "multi_enum", label: "Style preference (not a product choice)" },
  "bathroom.inspiration_refs": { semantics: "preference", type: "multi_enum", label: "Liked examples from the business's own projects" },
  "bathroom.quality.preference": { semantics: "preference", type: "enum", label: "Fixture quality preference (not a price)", options: ["basic", "standard", "premium", "not_sure"], requiresConfirmation: true },
  "budget.comfort_with_public_range": { semantics: "preference", type: "enum", label: "Comfort with the published price range", options: ["comfortable", "stretch", "below", "not_sure"], requiresConfirmation: true },
  "calculator.result_reference": { semantics: "derived", type: "text", label: "Result shown by the existing calculator (indicative)", requiresConfirmation: true },
  "contact.suburb": { semantics: "contact", type: "text", label: "Suburb" },
  "contact.preferred_contact": { semantics: "contact", type: "enum", label: "Preferred contact", options: ["phone", "email", "either"] },
  "commercial.business_type": { semantics: "context", type: "text", label: "Type of commercial site", unsupportedScope: true },
};

export const isKnownField = (k: string) => k in FIELD_CATALOG;

export function fieldCatalogText(): string {
  return Object.entries(FIELD_CATALOG)
    .filter(([, f]) => !f.unsupportedScope)
    .map(([k, f]) => `- ${k} (${f.semantics}, ${f.type}${f.options ? `: ${f.options.join("|")}` : ""})${f.requiresConfirmation ? " [needs confirmation]" : ""}`)
    .join("\n");
}
