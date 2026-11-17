/**
 * Renders all V3 prompt templates (understanding, delta, strategy, critic, revision) with a tiny
 * placeholder site → stdout, for docs/PIPELINE.md. Real inputs for a site: scripts/dump-prompts.ts.
 *   npx tsx scripts/print-prompts.ts
 */
import { buildCritiquePrompt, buildDeltaPrompt, buildRevisionPrompt, buildStrategyPrompt, buildUnderstandingPrompt } from "../src/lib/analyzer/llm/prompts";
import { buildEvidence } from "../src/lib/analyzer/evidence";
import type { Collected } from "../src/lib/analyzer/collect";
import type { Strategy, Understanding } from "../src/lib/analyzer/llm/schemas";

const digest = {
  url: "https://example.com.au/apartment-bathrooms", title: "<page title>", metaDescription: "", h1: ["<h1>"], headings: [{ level: 2, text: "<heading>" }], links: [], ctas: [],
  forms: [{ id: "form-1", fields: [{ label: "Name", type: "text", required: true }, { label: "Timeframe", type: "select", required: false, options: ["<option A>", "<option B>"] }], submitText: "Get a quote", hasUpload: false, multiStep: false, looksLikeCalculator: false }],
  phones: [], emails: [], priceMentions: [], tools: [], imageCount: 0, mainTextLength: 0,
  blocks: ["## <heading>", "<verbatim sentence from the page, typed by regex into an evidence line, e.g. a condition or exclusion>"],
};
const pages = [
  { id: "home", key: "example.com.au/", url: "https://example.com.au/", path: "/", group: "home", digest: { ...digest, url: "https://example.com.au/" } },
  { id: "apartment-bathrooms", key: "example.com.au/apartment-bathrooms", url: digest.url, path: "/apartment-bathrooms", group: "service", digest },
];
const c = {
  version: 1, collectedAt: "", startUrl: "https://example.com.au/", homeUrl: "https://example.com.au/", rootHost: "example.com.au", pages,
  assets: [{ id: "cta-get-a-quote", kind: "cta_link", label: "Get a quote", targetPageId: "contact", siteWide: true, occurrences: [{ pageId: "home", area: "header", text: "Get a quote" }], evidenceText: "Get a quote", ownership: "own" }],
  clusters: [], candidateCount: 40, fetchedCount: 20, renderedCount: 0, skipped: [], notRead: "- other unread pages by heuristic group: <groups>",
  followUps: [{ id: "F1", url: "https://example.com.au/faq", label: "<title of an unread page>", group: "faq" }], importantUninspected: [], captures: [], stats: { requests: 0, cacheHits: 0, bytes: 0 },
} as unknown as Collected;
const evidence = buildEvidence(pages as never);
const u = {
  business: { name: "<name>", summary: "<summary>", residential: true, commercial: false },
  offerings: [{ label: "<offering>", kind: "service", facets: { coreService: "<service>", propertyType: "<type>" }, pageIds: [], evidenceIds: [] }],
  facts: [{ topic: "exclusion", label: "<label>", value: "<value>", critical: true, status: "observed", evidenceIds: ["E1"] }],
  pages: [], assets: [], conversion: { primary: "consultation", secondary: [], label: "<label>", rationale: "<rationale>", certainty: "clear", evidenceIds: [] },
  coverage: [], journeys: [{ label: "<journey>", primary: true, steps: [] }],
  contexts: [{ id: "<context-id>", label: "<context>", sourcePageIds: ["apartment-bathrooms"], facets: {}, customerIntent: "<intent>", unresolvedDecisions: ["<visitor question>"], specificConstraints: [{ text: "<constraint>", evidenceIds: ["E1"], status: "observed" }], existingCoverage: { level: "partial", note: "<note>", assetIds: [] }, requiredFieldKeys: ["property.type"], conversionGoalAssetId: "cta-get-a-quote", support: "supported", differsBy: "questions", dimension: "property_type", evidenceIds: ["E1"] }],
  contentAssets: [{ id: "<content-id>", pageId: "apartment-bathrooms", kind: "project_example", label: "<content object>", whatItShows: "<what it shows>", evidenceIds: [] }],
  assetReviews: [{ assetId: "cta-get-a-quote", strengths: ["<observed strength>"], weaknesses: ["<observed weakness>"], contextFit: "fits", contextNote: null, evidenceIds: [] }],
  readinessSignals: ["<e.g. timeframe option>"],
  uncertainties: [], followUpRequests: [],
} as unknown as Understanding;
const st = {
  diagnosis: [{ id: "f1", visitorQuestion: "<visitor question>", whyHardHere: "<combination of facts>", evidenceIds: ["E1"], contextIds: [], consequence: "price_shock", status: "observed" }],
  opportunities: [{ id: "o1", label: "<opportunity>", contextIds: [], sourcePageIds: [], sourceAssetIds: [], sourceContentIds: [], stage: "consider", decisionGap: "<gap>", transformation: "<source → interaction>", value: "high", readiness: "ready", evidenceIds: ["E1"], action: "add", support: "supported" }],
  architecture: { alternatives: [{ key: "A", label: "<option>", fit: "strong", why: "<why>" }], chosen: "<chosen>", rationale: "<rationale>", motivations: [{ motivation: "<motivation>", pageIds: [], servedBy: "path", entry: "<entry>", note: "<note>" }] },
  recommendationCount: { count: 1, rationale: "<why>" },
  entries: [{ label: "<entry>", role: "main", priority: 1, opportunityIds: ["o1"], frictionIds: ["f1"], sourceContentIds: [], action: "add", stages: ["plan"], interactionType: "brief_builder", motivation: "<motivation>", promise: "<promise>", decisionsResolved: ["<decision>"], outcome: "<outcome>", headline: "<headline>", businessOutcome: "<b>", visitorOutcome: "<v>", currentState: "<c>", coverageGap: "<g>", capabilityKeys: ["guided_questions"], support: "supported", readiness: "ready", requirements: [], whyNotSimpler: "<…>", whyNotMoreComplex: "<…>", specificToBusiness: "<…>", consolidationRationale: "<…>", commonFlow: [{ title: "<phase>", detail: "<detail>" }], contextVariants: [], questionPlan: [{ question: "<question>", fieldKey: "property.type", answerType: "single_choice", purpose: "route", basis: "E1" }], projectFields: [], conversionTargetAssetId: "cta-get-a-quote", touchpoints: [], evidenceIds: ["E1"], reasoning: ["<reason>"], openQuestions: [], prerequisites: [], riskFlags: [], complexity: "low", confidence: 0.7 }],
  assetActions: [], connections: [], notSuggested: [],
} as unknown as Strategy;

const strategyPrompt = buildStrategyPrompt({ c, understanding: u, evidence, sections: "apartment-bathrooms (/apartment-bathrooms): s1=“<heading>”", gateFacts: ["<deterministic facts: calculator / booking / multi-step / upload / commercial / linked-only tools>"], unmappedPages: [] });
console.log("=====UNDERSTANDING=====\n" + buildUnderstandingPrompt(c, evidence));
console.log("=====DELTA=====\n" + buildDeltaPrompt(c, [pages[1]] as never, evidence, u));
console.log("=====STRATEGY=====\n" + strategyPrompt);
console.log("=====CRITIC=====\n" + buildCritiquePrompt({ c, understanding: u, strategy: st, evidence }));
console.log("=====REVISION=====\n" + buildRevisionPrompt("<the full strategy prompt above>", "<previous strategy JSON>", "<critic JSON>"));
