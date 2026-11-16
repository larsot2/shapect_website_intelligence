/**
 * Renders the V2 prompt templates (understanding, delta, strategy) with a tiny
 * placeholder site → stdout, for docs/ANALYZER.md.
 *   npx tsx scripts/print-prompts.ts
 */
import { buildDeltaPrompt, buildStrategyPrompt, buildUnderstandingPrompt } from "../src/lib/analyzer/llm/prompts";
import { buildEvidence } from "../src/lib/analyzer/evidence";
import type { Collected } from "../src/lib/analyzer/collect";
import type { Understanding } from "../src/lib/analyzer/llm/schemas";

const digest = {
  url: "https://example.com.au/apartment-bathrooms", title: "<page title>", metaDescription: "", h1: ["<h1>"], headings: [{ level: 2, text: "<heading>" }], links: [], ctas: [],
  forms: [{ id: "form-1", fields: [{ label: "Name", type: "text", required: true }, { label: "Suburb", type: "text", required: false }], submitText: "Get a quote", hasUpload: false, multiStep: false, looksLikeCalculator: false }],
  phones: [], emails: [], priceMentions: [], tools: [], imageCount: 0, mainTextLength: 0,
  blocks: ["## <heading>", "<verbatim sentence from the page, e.g. a condition or exclusion, typed by regex into an evidence line>"],
};
const pages = [{ id: "home", key: "example.com.au/", url: "https://example.com.au/", path: "/", group: "home", digest: { ...digest, url: "https://example.com.au/" } }, { id: "apartment-bathrooms", key: "example.com.au/apartment-bathrooms", url: digest.url, path: "/apartment-bathrooms", group: "service", digest }];
const c = {
  version: 1, collectedAt: "", startUrl: "https://example.com.au/", homeUrl: "https://example.com.au/", rootHost: "example.com.au", pages,
  assets: [{ id: "cta-get-a-quote", kind: "cta_link", label: "Get a quote", targetPageId: "contact", siteWide: true, occurrences: [{ pageId: "home", area: "header", text: "Get a quote" }], evidenceText: "Get a quote", ownership: "own" }],
  clusters: [], candidateCount: 40, fetchedCount: 20, renderedCount: 0, skipped: [], notRead: "- other unread pages by heuristic group: <groups>",
  followUps: [{ id: "F1", url: "https://example.com.au/faq", label: "<title>", group: "faq" }], importantUninspected: [], captures: [], stats: { requests: 0, cacheHits: 0, bytes: 0 },
} as unknown as Collected;
const evidence = buildEvidence(pages as never);
const u = {
  business: { name: "<name>", summary: "<summary>", residential: true, commercial: false },
  offerings: [{ label: "<offering>", kind: "service", facets: { coreService: "<service>", propertyType: "<type>" }, pageIds: [], evidenceIds: [] }],
  facts: [{ topic: "exclusion", label: "<label>", value: "<value>", critical: true, status: "observed", evidenceIds: ["E1"] }],
  pages: [], assets: [], conversion: { primary: "consultation", secondary: [], label: "<label>", rationale: "<rationale>", certainty: "clear", evidenceIds: [] },
  coverage: [], journeys: [{ label: "<journey>", primary: true, steps: [] }],
  contexts: [{ id: "<context-id>", label: "<context>", sourcePageIds: ["apartment-bathrooms"], facets: {}, customerIntent: "<intent>", unresolvedDecisions: ["<decision>"], specificConstraints: [{ text: "<constraint>", evidenceIds: ["E1"], status: "observed" }], existingCoverage: { level: "partial", note: "<note>", assetIds: [] }, requiredFieldKeys: ["property.type"], conversionGoalAssetId: "cta-get-a-quote", support: "supported", differsBy: "questions", evidenceIds: ["E1"] }],
  uncertainties: [], followUpRequests: [],
} as unknown as Understanding;

console.log("=====UNDERSTANDING=====\n" + buildUnderstandingPrompt(c, evidence));
console.log("=====DELTA=====\n" + buildDeltaPrompt(c, [pages[1]] as never, evidence, u));
console.log("=====STRATEGY=====\n" + buildStrategyPrompt({ c, understanding: u, evidence, sections: "apartment-bathrooms (/apartment-bathrooms): s1=“<heading>”", gateFacts: ["<deterministic facts: calculator / booking / multi-step / upload / commercial / linked-only tools>"], unmappedPages: [] }));
