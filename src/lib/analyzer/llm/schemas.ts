/** Lenient output schemas for the two LLM passes (validated, then gated deterministically). */
import { z } from "zod";

/** Lenient text: trims and clips instead of rejecting long model output. */
const clipTo = (v: string, max: number) => (v.length <= max ? v : v.slice(0, max - 1).replace(/\s+\S*$/, "") + "…");
const s = (max: number) => z.string().trim().min(1).transform((v) => clipTo(v, max));
const optText = (max: number) => z.string().trim().transform((v) => clipTo(v, max)).optional().nullable();
/** Lenient array: keeps the first n items instead of rejecting. */
const upTo = <T extends z.ZodTypeAny>(item: T, n: number) => z.array(item).transform((a) => a.slice(0, n));
const quoteRef = z.object({ pageId: z.string(), quote: z.string().transform((v) => v.slice(0, 400)) });

export const UnderstandingSchema = z.object({
  business: z.object({
    name: s(120),
    summary: s(400),
    residential: z.boolean(),
    commercial: z.boolean(),
    commercialNote: optText(240),
  }),
  services: z.array(z.object({
    label: s(80),
    dimension: z.enum(["core_service", "room_type", "property_type", "perspective", "region"]).catch("core_service"),
    scope: z.enum(["residential", "commercial", "unknown"]).catch("unknown"),
    pageIds: upTo(z.string(), 8).default([]),
    quote: optText(300),
  })).transform((a) => a.slice(0, 24)),
  claims: z.array(z.object({
    topic: z.enum(["identity", "service", "segment", "region", "process", "exclusion", "price_reference", "license", "warranty", "contact"]).catch("process"),
    label: s(60),
    value: s(200),
    critical: z.boolean().catch(false),
    status: z.enum(["observed", "inferred"]).catch("inferred"),
    evidence: upTo(quoteRef, 3).default([]),
  })).transform((a) => a.slice(0, 16)),
  pages: z.array(z.object({
    pageId: z.string(),
    title: s(60),
    pageType: z.enum(["home", "service", "variant", "geo", "gallery", "project", "pricing", "calculator", "article", "faq", "about", "reviews", "contact", "quotation", "booking", "other"]).catch("other"),
    group: z.enum(["home", "services", "design", "costs", "trust", "contact", "other"]).catch("other"),
    customerIntent: z.enum(["inspiration", "feasibility", "scope", "budget", "trust", "consultation", "quotation"]).optional().nullable().catch(null),
    perspective: optText(40),
  })),
  assets: z.array(z.object({
    assetId: z.string(),
    label: optText(40),
    role: z.enum(["primary", "secondary", "minor", "not_a_conversion"]).catch("minor"),
    isRealCalculator: z.boolean().optional().nullable(),
    observedOutcome: optText(200),
  })).default([]),
  conversionStrategy: z.object({
    value: z.enum(["consultation", "calculation", "qualification", "appointment", "routing", "mixed", "unknown"]).catch("unknown"),
    label: s(60),
    rationale: s(300),
    evidence: upTo(quoteRef, 4).default([]),
  }),
  coverage: z.array(z.object({
    capability: z.enum(["cost_guidance", "design_inspiration", "qualification", "booking", "direct_contact", "upload"]),
    level: z.enum(["covered", "partial", "none", "unknown"]).catch("unknown"),
    note: s(200),
    assetIds: z.array(z.string()).default([]),
  })).transform((a) => a.slice(0, 6)),
  journeys: z.array(z.object({
    label: s(50),
    primary: z.boolean().catch(false),
    steps: z.array(z.object({
      label: s(60),
      kind: z.enum(["pages", "content", "asset", "outcome"]).catch("pages"),
      pageIds: z.array(z.string()).default([]),
      assetId: z.string().optional().nullable(),
      basis: z.enum(["observed", "inferred"]).catch("inferred"),
    })).min(2).transform((a) => a.slice(0, 6)),
  })).min(1).transform((a) => a.slice(0, 4)),
  visitorDecisions: z.array(z.object({
    decision: s(160),
    pageIds: z.array(z.string()).default([]),
    coverage: z.enum(["covered", "partial", "none"]).catch("partial"),
  })).transform((a) => a.slice(0, 8)).default([]),
  needMorePages: z.array(z.object({ id: z.string(), reason: s(160) })).transform((a) => a.slice(0, 6)).default([]),
});
export type Understanding = z.infer<typeof UnderstandingSchema>;

export const StrategySchema = z.object({
  keepAsIs: z.boolean().catch(false),
  keepAsIsReason: optText(300),
  suggestions: z.array(z.object({
    label: s(48),
    action: z.enum(["add", "improve", "connect", "reposition", "none"]).catch("add"),
    headline: s(200),
    customerNeed: s(240),
    currentState: s(240),
    businessGoal: s(240),
    whatHappensNext: s(240),
    capabilityKeys: z.array(z.string()).min(1).transform((a) => a.slice(0, 6)),
    pageContexts: z.array(z.object({ pageId: z.string(), perspective: optText(40), startingHook: s(140) })).min(1).transform((a) => a.slice(0, 5)),
    touchpoints: z.array(z.object({
      pageId: z.string(),
      sectionId: z.string().optional().nullable(),
      assetId: z.string().optional().nullable(),
      placementKind: z.enum(["inline_section", "replace_cta", "beside_cta", "hero_secondary", "end_of_article"]).catch("inline_section"),
      headline: s(140),
    })).transform((a) => a.slice(0, 4)).default([]),
    conversionTargetAssetId: z.string().optional().nullable(),
    projectFields: z.array(z.object({
      key: z.string().transform((v) => v.slice(0, 40)),
      label: s(60),
      semantics: z.enum(["preference", "fact", "choice"]).catch("fact"),
      usage: z.enum(["may_collect", "could_reuse_later", "needs_confirmation"]).catch("may_collect"),
    })).transform((a) => a.slice(0, 8)).default([]),
    reasoning: upTo(s(240), 4).refine((a) => a.length > 0),
    evidence: upTo(quoteRef, 4).default([]),
    confidence: z.number().min(0).max(1).catch(0.5),
    openQuestions: upTo(s(220), 4).default([]),
    prerequisites: upTo(s(220), 4).default([]),
    experienceSteps: upTo(z.object({ title: s(60), detail: s(180) }), 4).default([]),
  })).transform((a) => a.slice(0, 4)),
  assetActions: z.array(z.object({
    assetId: z.string(),
    pageId: z.string(),
    proposal: z.enum(["keep", "replace", "redirect", "bridge", "remove"]).catch("keep"),
    rationale: s(240),
    relatedSuggestion: optText(80),
  })).transform((a) => a.slice(0, 10)).default([]),
  connections: z.array(z.object({
    from: z.string(),
    toSuggestion: optText(80),
    toAssetId: z.string().optional().nullable(),
    relation: z.enum(["suggested_continuation", "same_experience_multiple_pages", "existing_destination"]).catch("suggested_continuation"),
    intent: z.enum(["continue", "explore", "consult", "estimate"]).catch("continue"),
    sharedFields: upTo(z.string().transform((v) => v.slice(0, 40)), 6).default([]),
    missingFields: upTo(z.string().transform((v) => v.slice(0, 40)), 6).default([]),
    constraints: upTo(s(200), 3).default([]),
    rationale: s(240),
  })).transform((a) => a.slice(0, 6)).default([]),
  opportunities: z.array(z.object({
    label: s(60),
    reason: z.enum(["unsupported_scope", "missing_capability", "weak_evidence", "needs_owner_input"]).catch("needs_owner_input"),
    note: s(240),
  })).transform((a) => a.slice(0, 5)).default([]),
  notSuggested: z.array(z.object({ label: s(60), note: s(240) })).transform((a) => a.slice(0, 5)).default([]),
});
export type Strategy = z.infer<typeof StrategySchema>;
