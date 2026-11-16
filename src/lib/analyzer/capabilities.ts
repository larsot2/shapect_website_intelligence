/**
 * Shapect V1 capability catalog used by the recommendation pass and gates.
 * ASSUMPTION (standalone repo): this mirrors what a V1 Shapect experience can
 * do; confirm against the product before activation. Anything not "supported"
 * can only appear as an opportunity, never as a suggested capability.
 */
export const CAPABILITIES = {
  guided_questions: { supported: true, label: "Ask a few guided questions about the project" },
  scope_summary: { supported: true, label: "Summarise the visitor's project for the business" },
  style_choices: { supported: true, label: "Let visitors choose styles (using the business's own images)" },
  preference_summary: { supported: true, label: "Summarise style or quality preferences (not product selections)" },
  budget_reference: { supported: true, label: "Show the business's own public price references — no calculation, no quote" },
  project_checklist: { supported: true, label: "Help visitors prepare what to have ready for a consultation" },
  existing_form_handoff: { supported: true, label: "Hand over to the business's existing form or contact path (link only)" },
  existing_booking_handoff: { supported: true, label: "Link to the business's existing booking tool (no integration)" },
  form_improvement_advice: { supported: true, label: "Advisory: suggest clearer questions for an existing form" },
  cta_placement_advice: { supported: true, label: "Advisory: place or reword an existing call to action" },
  // not supported in V1 — opportunity only
  photo_upload: { supported: false, label: "Photo upload" },
  price_calculation: { supported: false, label: "Calculate prices or estimates" },
  instant_quote: { supported: false, label: "Instant or binding quotes" },
  room_planner_3d: { supported: false, label: "3D room planner" },
  calendar_integration: { supported: false, label: "Calendar / booking integration" },
  commercial_scoping: { supported: false, label: "Commercial project scoping" },
  crm_integration: { supported: false, label: "CRM integration / data transfer" },
} as const;

export type CapabilityKey = keyof typeof CAPABILITIES;

export const supportedCapabilities = Object.entries(CAPABILITIES).filter(([, v]) => v.supported).map(([k]) => k as CapabilityKey);

export const isSupportedCapability = (k: string): k is CapabilityKey =>
  k in CAPABILITIES && CAPABILITIES[k as CapabilityKey].supported;

/** Residential bathroom family = supported entry scope in V1. */
export const SUPPORTED_SCOPE_RE = /\b(bath(room)?s?|ensuites?|en-suites?|powder|toilets?|showers?|wet ?rooms?|accessib\w*|disabled|ndis|waterproof\w*|til(e|es|ing)|vanit\w*|small bathroom|luxury|budget|granny flat bathroom|apartment bathroom|house bathroom)\b/i;
export const UNSUPPORTED_SCOPE_RE = /\b(kitchens?|laundr\w*|structural|extensions?|general renovations?|home renovations?|whole home|outdoor|decks?|roofing|commercial|strata|office|retail|hospitality)\b/i;
