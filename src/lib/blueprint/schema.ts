/**
 * Website Intelligence Blueprint — the single JSON contract between the
 * analyzer (Python, S2/S3) and the Studio UI.
 *
 * Rules encoded here (spec §4.6, §6):
 *  - every meaningful claim carries status (observed|inferred|suggested),
 *    confidence and evidence; `suggested` items may be evidence-light but
 *    observed/inferred claims MUST cite evidence.
 *  - references use stable ids (pageId, assetId, conceptId) and are checked
 *    on load (see validate.ts).
 *  - nothing here is a runtime Entry, Bridge, ProjectState or price.
 */
import { z } from "zod";

export const BLUEPRINT_SCHEMA_VERSION = "wib-0.1";

const id = z.string().regex(/^[a-z0-9][a-z0-9_-]{1,63}$/, "stable id: lowercase, digits, - or _");
const confidence = z.number().min(0).max(1);
const shortText = z.string().min(1).max(280);

export const ViewportSchema = z.enum(["desktop", "mobile"]);
export type Viewport = z.infer<typeof ViewportSchema>;

export const BBoxSchema = z.object({
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  width: z.number().positive(),
  height: z.number().positive(),
  viewport: ViewportSchema,
});
export type BBox = z.infer<typeof BBoxSchema>;

export const EvidenceSchema = z.object({
  pageId: id,
  url: z.string().url(),
  kind: z.enum(["text", "dom", "screenshot", "derived"]),
  quote: z.string().max(400).optional(),
  locator: z.string().max(200).optional(),
  screenshotRef: z.string().optional(),
  bbox: BBoxSchema.optional(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const ClaimStatusSchema = z.enum(["observed", "inferred", "suggested"]);
export type ClaimStatus = z.infer<typeof ClaimStatusSchema>;

/** A claim must cite evidence unless it is merely a suggestion. */
const withEvidenceRule = <T extends z.ZodRawShape>(shape: T) =>
  z
    .object({
      ...shape,
      status: ClaimStatusSchema,
      confidence,
      evidence: z.array(EvidenceSchema),
    })
    .refine((c) => {
      const claim = c as unknown as { status: ClaimStatus; evidence: unknown[] };
      return claim.status === "suggested" || claim.evidence.length > 0;
    }, {
      message: "observed/inferred claims require at least one evidence item",
      path: ["evidence"],
    });

// ---------------------------------------------------------------- pages

export const PageTypeSchema = z.enum([
  "home", "service", "variant", "geo", "gallery", "project", "pricing", "calculator",
  "article", "faq", "about", "reviews", "contact", "quotation", "booking", "other",
]);

export const ScreenshotSchema = z.object({
  viewport: ViewportSchema,
  src: z.string(), // public path (fixture) or signed URL (later)
  width: z.number().positive(),
  height: z.number().positive(),
  capturedAt: z.string(),
});
export type Screenshot = z.infer<typeof ScreenshotSchema>;

export const PageSchema = z.object({
  id,
  url: z.string().url(),
  path: z.string(),
  title: z.string(),
  pageType: PageTypeSchema,
  group: z.enum(["home", "services", "design", "costs", "trust", "contact", "other"]),
  context: z.object({
    perspective: z.string().optional(), // e.g. "compact" — framing only, never ProjectState
    customerIntent: z.enum(["inspiration", "feasibility", "scope", "budget", "trust", "consultation", "quotation"]).optional(),
  }),
  screenshots: z.array(ScreenshotSchema).default([]),
});
export type Page = z.infer<typeof PageSchema>;

export const PageGroupSchema = z.object({
  id,
  label: z.string(),
  pattern: z.string(),
  totalCount: z.number().int().nonnegative(),
  crawledPageIds: z.array(id),
  reason: shortText,
});
export type PageGroup = z.infer<typeof PageGroupSchema>;

// ---------------------------------------------------------------- business

export const BusinessClaimSchema = withEvidenceRule({
  id,
  topic: z.enum(["identity", "service", "segment", "region", "process", "exclusion", "price_reference", "license", "warranty", "contact"]),
  label: z.string(),
  value: z.string(),
  /** Claim that needs owner confirmation before it could ever be reused. */
  critical: z.boolean().default(false),
  /** License/warranty/legal statements are website claims, never verified facts. */
  verification: z.enum(["website_claim_unverified", "not_applicable"]).default("not_applicable"),
});
export type BusinessClaim = z.infer<typeof BusinessClaimSchema>;

export const ServiceSchema = z.object({
  id,
  label: z.string(),
  dimension: z.enum(["core_service", "room_type", "property_type", "perspective", "region"]),
  scope: z.enum(["residential", "commercial", "unknown"]),
  supportedInV1: z.boolean(),
  pageIds: z.array(id),
});
export type Service = z.infer<typeof ServiceSchema>;

// ---------------------------------------------------------------- conversion

export const ConversionAssetSchema = withEvidenceRule({
  id,
  kind: z.enum(["cta_link", "contact_form", "multi_step_form", "calculator", "booking", "phone", "email", "chat", "upload", "third_party"]),
  label: z.string(),
  targetPageId: id.optional(),
  targetUrl: z.string().optional(),
  siteWide: z.boolean().default(false),
  occurrences: z.array(z.object({ pageId: id, placement: z.string(), bboxes: z.array(BBoxSchema).default([]) })),
  fields: z.array(z.string()).optional(),
  /** What happens after the click — only what is demonstrable. */
  observedOutcome: z.string().optional(),
});
export type ConversionAsset = z.infer<typeof ConversionAssetSchema>;

export const CoverageSchema = z.object({
  capability: z.enum(["cost_guidance", "design_inspiration", "qualification", "booking", "direct_contact", "upload"]),
  level: z.enum(["covered", "partial", "none", "unknown"]),
  note: shortText,
  assetIds: z.array(id).default([]),
});

export const JourneyStepSchema = z.object({
  id,
  label: z.string(),
  kind: z.enum(["pages", "content", "asset", "outcome"]),
  pageIds: z.array(id).default([]),
  assetId: id.optional(),
  /** observed = visible on the website; inferred = plausible but not shown (e.g. internal follow-up). */
  basis: z.enum(["observed", "inferred"]).optional(),
});

export const JourneySchema = z.object({
  id,
  label: z.string(),
  primary: z.boolean().default(false),
  steps: z.array(JourneyStepSchema).min(2),
  evidence: z.array(EvidenceSchema).min(1),
});
export type Journey = z.infer<typeof JourneySchema>;

// ---------------------------------------------------------------- suggestions

export const ProjectFieldSuggestionSchema = z.object({
  key: z.string(),
  label: z.string(),
  semantics: z.enum(["preference", "fact", "choice"]),
  usage: z.enum(["may_collect", "could_reuse_later", "needs_confirmation"]),
});

export const ExperienceSuggestionSchema = z.object({
  id,
  label: z.string(),
  action: z.enum(["add", "improve", "connect", "reposition", "none"]),
  headline: shortText, // one-line customer value
  customerNeed: shortText,
  businessGoal: shortText,
  whatHappensNext: shortText,
  /** What the website already does for this decision today. */
  currentState: shortText.optional(),
  /** What the owner must confirm before this could ever be built. */
  prerequisites: z.array(shortText).default([]),
  /** Conceptual visitor flow of the proposed experience (2–4 steps) — not generated or activated. */
  experienceSteps: z.array(z.object({ title: z.string().min(1).max(60), detail: z.string().max(180) })).max(4).default([]),
  supportedRecipeKey: z.string().optional(),
  capabilityKeys: z.array(z.string()),
  pageContexts: z.array(z.object({ pageId: id, perspective: z.string().optional(), startingHook: z.string().max(140) })).min(1),
  touchpoints: z.array(z.object({
    id,
    pageId: id,
    assetId: id.optional(),
    placementKind: z.enum(["inline_section", "replace_cta", "beside_cta", "hero_secondary", "end_of_article"]),
    headline: z.string().max(140),
    /** Measured on a rendered page, one per viewport. Empty = position not verified. */
    bboxes: z.array(BBoxSchema).default([]),
    positionVerified: z.boolean(),
  })),
  conversionTargetAssetId: id.optional(),
  possibleProjectFields: z.array(ProjectFieldSuggestionSchema).default([]),
  evidence: z.array(EvidenceSchema).min(1),
  reasoning: z.array(shortText).min(1).max(4),
  confidence,
  openQuestions: z.array(shortText).default([]),
});
export type ExperienceSuggestion = z.infer<typeof ExperienceSuggestionSchema>;

export const AssetActionSchema = z.object({
  id,
  assetId: id,
  pageId: id,
  /** bridge = route this CTA into a suggested experience before the existing destination (proposal only). */
  proposal: z.enum(["keep", "replace", "redirect", "bridge", "remove"]),
  rationale: shortText,
  relatedSuggestionId: id.optional(),
});
export type AssetAction = z.infer<typeof AssetActionSchema>;

export const ConnectionSuggestionSchema = z.object({
  id,
  fromSuggestionId: id,
  to: z.object({ kind: z.enum(["suggestion", "existing_asset"]), id }),
  relation: z.enum(["suggested_continuation", "same_experience_multiple_pages", "existing_destination"]),
  intent: z.enum(["continue", "explore", "consult", "estimate"]),
  possibleSharedFields: z.array(z.string()),
  requiresValidation: z.boolean(),
  integrationStatus: z.enum(["concept_only", "link_only", "unknown"]),
  /** Information the target would still need to ask for. */
  missingFields: z.array(z.string()).default([]),
  /** Limits on reuse, e.g. "pricing only with a confirmed pricing basis". */
  constraints: z.array(shortText).default([]),
  rationale: shortText,
  evidence: z.array(EvidenceSchema),
});
export type ConnectionSuggestion = z.infer<typeof ConnectionSuggestionSchema>;

export const OpportunitySchema = z.object({
  id,
  label: z.string(),
  reason: z.enum(["unsupported_scope", "missing_capability", "weak_evidence", "needs_owner_input"]),
  note: shortText,
  evidence: z.array(EvidenceSchema).default([]),
});

/** Outcomes of deterministic negative gates — shown as "what we deliberately didn't suggest". */
export const GateDecisionSchema = z.object({
  id,
  rule: z.string(), // internal rule id, e.g. N-02
  label: z.string(),
  note: shortText,
  evidence: z.array(EvidenceSchema).default([]),
});

// ---------------------------------------------------------------- blueprint

export const BlueprintSchema = z.object({
  schemaVersion: z.literal(BLUEPRINT_SCHEMA_VERSION),
  scanId: id,
  snapshotVersion: z.string(),
  source: z.object({
    kind: z.enum(["fixture", "scan"]),
    label: z.string(),
    note: z.string().optional(),
  }),
  website: z.object({
    url: z.string().url(),
    businessName: z.string(),
    summary: z.string().max(240),
    brand: z.object({ primary: z.string(), accent: z.string().optional() }).optional(),
  }),
  analysis: z.object({
    startedAt: z.string(),
    finishedAt: z.string(),
    provider: z.string(), // "fixture" | e.g. "iaedu-agent"
    model: z.string(),
    promptVersion: z.string(),
  }),
  pages: z.array(PageSchema).min(1),
  pageGroups: z.array(PageGroupSchema).default([]),
  services: z.array(ServiceSchema),
  businessClaims: z.array(BusinessClaimSchema),
  conversionAssets: z.array(ConversionAssetSchema),
  conversionStrategy: withEvidenceRule({
    value: z.enum(["consultation", "calculation", "qualification", "appointment", "routing", "mixed", "unknown"]),
    label: z.string(),
  }),
  coverage: z.array(CoverageSchema),
  journeys: z.array(JourneySchema).min(1),
  suggestedExperiences: z.array(ExperienceSuggestionSchema).max(3),
  assetActions: z.array(AssetActionSchema).default([]),
  suggestedConnections: z.array(ConnectionSuggestionSchema).default([]),
  unsupportedOpportunities: z.array(OpportunitySchema).default([]),
  gateDecisions: z.array(GateDecisionSchema).default([]),
  diagnostics: z.object({
    scannedPageCount: z.number().int().nonnegative(),
    skippedPageCount: z.number().int().nonnegative(),
    limitations: z.array(z.string()),
  }),
  /** Run metrics for transparency (cost, duration, errors). */
  run: z.object({
    durationMs: z.number().nonnegative(),
    discoveredUrls: z.number().int().nonnegative(),
    fetchedPages: z.number().int().nonnegative(),
    httpRequests: z.number().int().nonnegative(),
    httpCacheHits: z.number().int().nonnegative(),
    renderedPages: z.number().int().nonnegative(),
    capturedPages: z.number().int().nonnegative(),
    llmCalls: z.number().int().nonnegative(),
    llmCacheHits: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    tokensEstimated: z.boolean(),
    networkMode: z.string(),
    warnings: z.array(z.string()),
  }).optional(),
  /** Customer decisions visitors try to make, with how well the site supports them. */
  visitorDecisions: z.array(z.object({
    decision: z.string(),
    pageIds: z.array(id),
    coverage: z.enum(["covered", "partial", "none"]),
  })).default([]),
});
export type Blueprint = z.infer<typeof BlueprintSchema>;
