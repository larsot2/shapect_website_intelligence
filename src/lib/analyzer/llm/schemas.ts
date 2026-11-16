/**
 * V2 output contracts for the two Gemini passes. Lenient (clip instead of
 * reject), id-referential (evidence/asset/page/context/field ids instead of
 * copied objects), then gated deterministically.
 */
import { z } from "zod";

const clipTo = (v: string, max: number) => (v.length <= max ? v : v.slice(0, max - 1).replace(/\s+\S*$/, "") + "…");
const s = (max: number) => z.string().trim().min(1).transform((v) => clipTo(v, max));
/** Optional free text: non-string values (true, 0, {}) become empty instead of failing the whole answer.
 *  Only used for non-critical prose — ids, enums and required fields stay strict. */
const optText = (max: number) => z.preprocess((v) => (typeof v === "string" ? v : undefined), z.string().trim().transform((v) => clipTo(v, max)).optional().nullable());
const upTo = <T extends z.ZodTypeAny>(item: T, n: number) => z.array(item).transform((a) => a.slice(0, n));
const ids = (n = 6) => upTo(z.string(), n).default([]);

const facetsSchema = z.object({
  coreService: optText(40), roomType: optText(30), propertyType: optText(30),
  segment: z.enum(["residential", "commercial", "mixed", "unknown"]).catch("unknown").optional(),
  industry: optText(30), projectScope: optText(40), functionalNeed: optText(40),
  perspective: optText(30), geography: optText(40), capability: optText(40),
}).partial().default({});

// ---------------------------------------------------------------- Understanding

export const ContextSchema = z.object({
  id: z.string().transform((v) => v.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 40)),
  label: s(50),
  sourcePageIds: ids(6),
  facets: facetsSchema,
  customerIntent: optText(140),
  unresolvedDecisions: upTo(s(140), 4).default([]),
  specificConstraints: upTo(z.object({ text: s(160), evidenceIds: ids(3), status: z.enum(["observed", "to_confirm"]).catch("to_confirm") }), 4).default([]),
  existingCoverage: z.object({ level: z.enum(["covered", "partial", "none", "unknown"]).catch("unknown"), note: optText(160), assetIds: ids(4) }).default({ level: "unknown", note: null, assetIds: [] }),
  requiredFieldKeys: ids(8),
  conversionGoalAssetId: z.string().optional().nullable(),
  support: z.enum(["supported", "partial", "unsupported", "owner_review"]).catch("owner_review"),
  differsBy: z.enum(["copy", "questions", "capability", "conversion", "unsupported"]).catch("questions"),
  evidenceIds: ids(6),
});
export type ContextOut = z.infer<typeof ContextSchema>;

const FactSchema = z.object({
  topic: z.enum(["identity", "service", "segment", "region", "process", "exclusion", "condition", "price_reference", "license", "warranty", "contact"]).catch("process"),
  label: s(60),
  value: s(160),
  critical: z.boolean().catch(false),
  status: z.enum(["observed", "inferred"]).catch("inferred"),
  evidenceIds: ids(3),
});

export const UnderstandingSchema = z.object({
  business: z.object({ name: s(120), summary: s(400), residential: z.boolean(), commercial: z.boolean() }),
  offerings: upTo(z.object({
    label: s(80),
    kind: z.enum(["service", "variant", "capability", "region"]).catch("service"),
    facets: facetsSchema,
    pageIds: ids(6),
    evidenceIds: ids(3),
  }), 18).default([]),
  facts: upTo(FactSchema, 16).default([]),
  pages: z.array(z.object({
    pageId: z.string(),
    title: s(60),
    pageType: z.enum(["home", "service", "variant", "geo", "gallery", "project", "pricing", "calculator", "article", "faq", "about", "reviews", "contact", "quotation", "booking", "other"]).catch("other"),
    group: z.enum(["home", "services", "design", "costs", "trust", "contact", "other"]).catch("other"),
    customerIntent: z.enum(["inspiration", "feasibility", "scope", "budget", "trust", "consultation", "quotation"]).optional().nullable().catch(null),
    perspective: optText(40),
  })).default([]),
  assets: upTo(z.object({
    assetId: z.string(),
    label: optText(40),
    role: z.enum(["primary", "secondary", "minor", "not_a_conversion"]).catch("minor"),
    isRealCalculator: z.boolean().optional().nullable(),
    observedOutcome: optText(200),
  }), 24).default([]),
  conversion: z.object({
    primary: z.enum(["consultation", "calculation", "qualification", "appointment", "direct_contact", "mixed", "unknown"]).catch("unknown"),
    secondary: upTo(z.enum(["consultation", "calculation", "qualification", "appointment", "direct_contact"]), 3).default([]),
    label: s(60),
    rationale: s(300),
    certainty: z.enum(["clear", "mixed", "unclear"]).catch("mixed"),
    evidenceIds: ids(4),
  }),
  coverage: upTo(z.object({
    capability: z.enum(["cost_guidance", "design_inspiration", "qualification", "booking", "direct_contact", "upload"]),
    level: z.enum(["covered", "partial", "none", "unknown"]).catch("unknown"),
    note: s(200),
    assetIds: ids(4),
  }), 6).default([]),
  journeys: upTo(z.object({
    label: s(50),
    primary: z.boolean().catch(false),
    steps: z.array(z.object({
      label: s(60),
      kind: z.enum(["pages", "content", "asset", "outcome"]).catch("pages"),
      pageIds: ids(4),
      assetId: z.string().optional().nullable(),
      basis: z.enum(["observed", "inferred"]).catch("inferred"),
    })).min(2).transform((a) => a.slice(0, 6)),
  }), 3).default([]),
  contexts: upTo(ContextSchema, 9).default([]),
  uncertainties: upTo(s(200), 5).default([]),
  followUpRequests: upTo(z.object({ id: z.string(), missing: s(160) }), 3).default([]),
});
export type Understanding = z.infer<typeof UnderstandingSchema>;

/** Follow-up delta: only additions/updates from the newly read pages (merged deterministically). */
export const UnderstandingDeltaSchema = z.object({
  facts: upTo(FactSchema, 8).default([]),
  offerings: UnderstandingSchema.shape.offerings,
  contexts: upTo(ContextSchema, 6).default([]),
  pages: UnderstandingSchema.shape.pages,
  resolvedUncertainties: upTo(s(200), 5).default([]),
});
export type UnderstandingDelta = z.infer<typeof UnderstandingDeltaSchema>;

// ---------------------------------------------------------------- Strategy

export const StrategySchema = z.object({
  diagnosis: upTo(z.object({
    id: z.string(),
    visitorQuestion: s(160),
    whyHardHere: s(240),
    evidenceIds: ids(4),
    contextIds: ids(4),
    consequence: z.enum(["misfit_lead", "price_shock", "wasted_visit", "delay", "drop_off", "unprepared_consult", "other"]).catch("other"),
    status: z.enum(["observed", "inferred"]).catch("inferred"),
  }), 5).default([]),
  opportunities: upTo(z.object({
    id: z.string(),
    label: s(60),
    contextIds: ids(6),
    decisionGap: s(200),
    action: z.enum(["add", "improve", "connect", "reposition", "none"]).catch("add"),
    support: z.enum(["supported", "partial", "unsupported", "owner_review"]).catch("owner_review"),
    note: optText(200),
  }), 12).default([]),
  recommendationCount: z.object({ count: z.number().int().min(0).max(3).catch(0), rationale: s(300) }),
  entries: upTo(z.object({
    label: s(48),
    opportunityIds: ids(6),
    frictionIds: ids(4),
    action: z.enum(["add", "improve", "connect", "reposition", "none"]).catch("add"),
    headline: s(160),
    businessOutcome: s(200),
    visitorOutcome: s(200),
    currentState: s(200),
    coverageGap: s(200),
    capabilityKeys: z.array(z.string()).min(1).transform((a) => a.slice(0, 7)),
    support: z.enum(["supported", "partial", "unsupported", "owner_review"]).catch("partial"),
    consolidationRationale: s(260),
    commonFlow: upTo(z.object({ title: s(48), detail: s(140) }), 4).default([]),
    contextVariants: upTo(z.object({
      contextId: z.string(),
      pageIds: ids(4),
      startingHook: s(120),
      focus: optText(120),
      additionalQuestions: upTo(z.object({ question: s(140), fieldKey: z.string(), when: optText(100), purpose: z.enum(["route", "expectation", "prepare", "qualify"]).optional().catch(undefined), evidenceIds: ids(2) }), 3).default([]),
      fallbackIfUnknown: optText(120),
    }), 6).default([]),
    questionPlan: upTo(z.object({
      question: s(140),
      fieldKey: z.string(),
      answerType: z.enum(["single_choice", "multi_choice", "yes_no", "text", "number", "unknown_ok"]).catch("single_choice"),
      options: upTo(s(40), 7).optional().nullable(),
      condition: optText(100),
      purpose: z.enum(["route", "expectation", "prepare", "qualify"]).optional().catch(undefined),
      basis: optText(120),
    }), 10).default([]),
    projectFields: upTo(z.object({ key: z.string(), reuseIn: optText(48) }), 10).default([]),
    conversionTargetAssetId: z.string().optional().nullable(),
    touchpoints: upTo(z.object({
      pageId: z.string(),
      sectionId: z.string().optional().nullable(),
      assetId: z.string().optional().nullable(),
      placementKind: z.enum(["inline_section", "replace_cta", "beside_cta", "hero_secondary", "end_of_article"]).catch("inline_section"),
      headline: s(120),
    }), 4).default([]),
    evidenceIds: ids(5),
    reasoning: upTo(s(200), 3).refine((a) => a.length > 0),
    openQuestions: upTo(s(200), 4).default([]),
    prerequisites: upTo(s(200), 4).default([]),
    riskFlags: upTo(s(160), 3).default([]),
    complexity: z.enum(["low", "medium", "high"]).catch("medium"),
    confidence: z.number().min(0).max(1).catch(0.5),
  }), 4).default([]),
  assetActions: upTo(z.object({
    assetId: z.string(),
    pageId: z.string(),
    proposal: z.enum(["keep", "replace", "redirect", "bridge", "remove"]).catch("keep"),
    rationale: s(220),
    relatedEntry: optText(48),
  }), 8).default([]),
  connections: upTo(z.object({
    from: z.string(),
    toEntry: optText(48),
    toAssetId: z.string().optional().nullable(),
    mode: z.enum(["session_reuse", "explicit_bridge", "external_link", "manual_summary"]).catch("external_link"),
    reason: s(220),
    sharedFieldKeys: ids(6),
    missingFieldKeys: ids(6),
    constraints: upTo(s(180), 3).default([]),
    feasibility: z.enum(["possible", "needs_review", "not_supported"]).catch("needs_review"),
  }), 6).default([]),
  notSuggested: upTo(z.object({ label: s(60), note: s(220) }), 5).default([]),
});
export type Strategy = z.infer<typeof StrategySchema>;
export type StrategyEntry = Strategy["entries"][number];
