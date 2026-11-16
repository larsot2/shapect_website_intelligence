/**
 * Deterministic negative gates applied to the LLM's strategy (spec §4.5).
 * Pure functions — unit tested. Rule ids follow the internal N-xx library.
 */
import { isSupportedCapability, SUPPORTED_SCOPE_RE, UNSUPPORTED_SCOPE_RE } from "./capabilities";
import type { Strategy } from "./llm/schemas";

export type RawSuggestion = Strategy["suggestions"][number];

export interface GateContext {
  hasRealCalculator: boolean;
  calculatorAssetIds: string[];
  commercialPageIds: Set<string>;
  unsupportedServicePageIds: Set<string>; // e.g. kitchen-only pages
  locationPageIds: Set<string>;
  knownPageIds: Set<string>;
  knownAssetIds: Set<string>;
  verifyQuote: (pageId: string, quote: string) => boolean;
}

export interface GateResult {
  suggestions: RawSuggestion[];
  decisions: { rule: string; label: string; note: string }[];
  opportunities: { label: string; reason: "unsupported_scope" | "missing_capability" | "weak_evidence" | "needs_owner_input"; note: string }[];
}

export const FORBIDDEN_HOOK_RE = /\b(guarantee[sd]?|guaranteed|instant(ly)?\s+(quote|price|estimate)|exact\s+(price|cost|quote)|binding\s+quote|fixed[- ]price\s+(quote\s+)?in\s+\d|in\s+(\d+|a few|two|three|five)\s+(minutes?|seconds?)\s+.*\b(quote|price)|(quote|price)\s+in\s+(\d+|a few)\s+(minutes?|seconds?)|cheapest|best price|no\.?\s?1|#1)\b/i;
const ESTIMATOR_RE = /\b(estimat\w*|calculat\w*|cost\s+(guide|planner|checker|tool)|price\s+(guide|checker|tool|finder)|quote\s+(tool|builder|generator)|budget\s+(tool|calculator|estimator))\b/i;

export function applyGates(raw: RawSuggestion[], ctx: GateContext): GateResult {
  const decisions: GateResult["decisions"] = [];
  const opportunities: GateResult["opportunities"] = [];
  const out: RawSuggestion[] = [];

  for (const s0 of raw) {
    const s: RawSuggestion = structuredClone(s0);
    const text = `${s.label} ${s.headline} ${s.customerNeed}`;

    // References must exist
    s.pageContexts = s.pageContexts.filter((c) => ctx.knownPageIds.has(c.pageId));
    s.touchpoints = s.touchpoints.filter((t) => ctx.knownPageIds.has(t.pageId)).map((t) => ({ ...t, assetId: t.assetId && ctx.knownAssetIds.has(t.assetId) ? t.assetId : null }));
    if (s.conversionTargetAssetId && !ctx.knownAssetIds.has(s.conversionTargetAssetId)) s.conversionTargetAssetId = null;
    if (!s.pageContexts.length) {
      decisions.push({ rule: "N-00", label: `“${s.label}” dropped`, note: "It referred to pages we didn't read." });
      continue;
    }

    // N-05 capabilities must be supported
    const unsupported = s.capabilityKeys.filter((k) => !isSupportedCapability(k));
    s.capabilityKeys = s.capabilityKeys.filter(isSupportedCapability);
    if (!s.capabilityKeys.length) {
      opportunities.push({ label: s.label, reason: "missing_capability", note: `Needs something Shapect can't do yet (${unsupported.join(", ").replace(/_/g, " ")}).` });
      continue;
    }

    // N-02 no duplicate estimator when a real calculator exists
    if (ctx.hasRealCalculator && s.action === "add" && ESTIMATOR_RE.test(text)) {
      decisions.push({ rule: "N-02", label: "No second cost calculator", note: "You already have a working calculator, so we don't suggest another one." });
      continue;
    }

    // N-04 unsupported scope (commercial, kitchen, laundry, …)
    const ctxPages = s.pageContexts.map((c) => c.pageId);
    const allCommercial = ctxPages.every((p) => ctx.commercialPageIds.has(p));
    const allUnsupported = ctxPages.every((p) => ctx.commercialPageIds.has(p) || ctx.unsupportedServicePageIds.has(p));
    if (allCommercial || allUnsupported || (UNSUPPORTED_SCOPE_RE.test(s.label) && !SUPPORTED_SCOPE_RE.test(s.label))) {
      opportunities.push({ label: s.label, reason: "unsupported_scope", note: "Outside what Shapect supports for now (residential bathrooms). Noted, not suggested." });
      continue;
    }
    // drop individual unsupported-scope contexts, keep the rest
    s.pageContexts = s.pageContexts.filter((c) => !ctx.commercialPageIds.has(c.pageId));
    s.touchpoints = s.touchpoints.filter((t) => !ctx.commercialPageIds.has(t.pageId));

    // N-10 one experience, not one per suburb page
    let geoSeen = false;
    s.pageContexts = s.pageContexts.filter((c) => {
      if (!ctx.locationPageIds.has(c.pageId)) return true;
      if (geoSeen) return false;
      geoSeen = true;
      return true;
    });

    // N-07 forbidden hooks / promises
    const badHook = (t: string) => FORBIDDEN_HOOK_RE.test(t);
    if (badHook(s.headline)) {
      decisions.push({ rule: "N-07", label: `“${s.label}” wording removed`, note: "It promised something no one can guarantee (instant or guaranteed quotes)." });
      continue;
    }
    s.pageContexts = s.pageContexts.filter((c) => !badHook(c.startingHook));
    s.touchpoints = s.touchpoints.filter((t) => !badHook(t.headline));
    if (!s.pageContexts.length) continue;

    // N-08 evidence must be verifiable
    s.evidence = s.evidence.filter((e) => ctx.knownPageIds.has(e.pageId) && ctx.verifyQuote(e.pageId, e.quote));
    if (!s.evidence.length) {
      s.confidence = Math.min(s.confidence, 0.45);
      opportunities.push({ label: s.label, reason: "weak_evidence", note: "Possibly useful, but we couldn't point to clear evidence on your website." });
      continue;
    }
    out.push(s);
  }

  // max three, strongest first
  out.sort((a, b) => b.confidence - a.confidence);
  for (const extra of out.slice(3)) decisions.push({ rule: "N-11", label: `“${extra.label}” held back`, note: "We show at most three ideas so the most useful ones stand out." });
  return { suggestions: out.slice(0, 3), decisions, opportunities };
}

/** Normalised substring check used to verify LLM quotes against real page text. */
export function makeQuoteVerifier(textByPage: Map<string, string>) {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[‘’ʼ`´]/g, "'").replace(/[“”„]/g, '"').replace(/[–—−]/g, "-").replace(/ /g, " ").replace(/[*_#]+/g, "").replace(/\s+/g, " ").trim();
  const cache = new Map<string, string>();
  return (pageId: string, quote: string) => {
    const q = norm(quote).replace(/^["'“]|["'”.…]+$/g, "").trim();
    if (q.length < 4) return false;
    let t = cache.get(pageId);
    if (t === undefined) {
      t = norm(textByPage.get(pageId) ?? "");
      cache.set(pageId, t);
    }
    if (t.includes(q)) return true;
    // tolerate an ellipsis join of two verbatim fragments
    const parts = q.split(/\s*(?:\.\.\.|…)\s*/).filter((p) => p.length >= 6);
    return parts.length > 1 && parts.every((p) => t!.includes(p));
  };
}
