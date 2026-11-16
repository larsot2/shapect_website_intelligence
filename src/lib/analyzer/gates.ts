/**
 * Deterministic post-processing gates for V2 strategy output (spec §4.5, §10.4).
 * Pure functions — unit tested. The model proposes; these rules decide what may
 * be shown as a recommendation.
 */
import { isSupportedCapability } from "./capabilities";
import { FIELD_CATALOG, isKnownField } from "./fields";
import type { StrategyEntry } from "./llm/schemas";

export interface GateContext {
  hasRealCalculator: boolean;
  calculatorAssetIds: string[];
  /** context id → support level from the (validated) context matrix */
  contextSupport: Map<string, "supported" | "partial" | "unsupported" | "owner_review">;
  /** context id → label (for fidelity notes) */
  contextLabels: Map<string, string>;
  locationPageIds: Set<string>;
  knownPageIds: Set<string>;
  knownAssetIds: Set<string>;
  knownEvidenceIds: Set<string>;
  /** context id → its verified evidence ids (an entry inherits these if it cites none) */
  contextEvidence?: Map<string, string[]>;
}

export interface GateDecision { rule: string; label: string; note: string }
export interface GateOpportunity { label: string; reason: "unsupported_scope" | "missing_capability" | "weak_evidence" | "needs_owner_input"; note: string }

export interface GateResult {
  entries: StrategyEntry[];
  decisions: GateDecision[];
  opportunities: GateOpportunity[];
}

export const FORBIDDEN_HOOK_RE = /\b(guarantee[sd]?|guaranteed|instant(ly)?\s+(quote|price|estimate)|exact\s+(price|cost|quote)|binding\s+quote|fixed[- ]price\s+(quote\s+)?in\s+\d|in\s+(\d+|a few|two|three|five)\s+(minutes?|seconds?)\s+.*\b(quote|price)|(quote|price)\s+in\s+(\d+|a few)\s+(minutes?|seconds?)|cheapest|best price|no\.?\s?1|#1)\b/i;
/** wording that implies Shapect calculates a price/estimate (not allowed without a confirmed pricing basis) */
const PRICING_CLAIM_RE = /\b(estimate (your|the) (cost|price|budget)|calculate (your|the)? ?(cost|price|budget|quote)|your (price|quote|estimate) (is|will be)|get (a|your) (price|estimate) (now|instantly)|how much (it|this) will cost you|based on (your|the) (size|answers?|room|choices?)[^.?]{0,60}(cost|price|range|\$)|\{\{[^}]+\}\})/i;
const ESTIMATOR_RE = /\b(estimat\w*|calculat\w*|cost\s+(planner|checker|tool)|price\s+(checker|tool|finder)|quote\s+(tool|builder|generator)|budget\s+(tool|calculator|estimator))\b/i;

export function applyEntryGates(raw: StrategyEntry[], ctx: GateContext): GateResult {
  const decisions: GateDecision[] = [];
  const opportunities: GateOpportunity[] = [];
  const out: StrategyEntry[] = [];

  for (const e0 of raw) {
    const e: StrategyEntry = structuredClone(e0);
    const text = `${e.label} ${e.headline}`;

    // references must exist
    e.contextVariants = e.contextVariants.filter((v) => ctx.contextSupport.has(v.contextId)).map((v) => ({ ...v, pageIds: v.pageIds.filter((p) => ctx.knownPageIds.has(p)) }));
    e.touchpoints = e.touchpoints.filter((t) => ctx.knownPageIds.has(t.pageId)).map((t) => ({ ...t, assetId: t.assetId && ctx.knownAssetIds.has(t.assetId) ? t.assetId : null }));
    if (e.conversionTargetAssetId && !ctx.knownAssetIds.has(e.conversionTargetAssetId)) e.conversionTargetAssetId = null;
    e.evidenceIds = e.evidenceIds.filter((x) => ctx.knownEvidenceIds.has(x));

    // capabilities (N-05)
    const unsupported = e.capabilityKeys.filter((k) => !isSupportedCapability(k));
    e.capabilityKeys = e.capabilityKeys.filter(isSupportedCapability);
    if (!e.capabilityKeys.length) {
      opportunities.push({ label: e.label, reason: "missing_capability", note: `Would need something Shapect can't do yet (${unsupported.join(", ").replace(/_/g, " ")}).` });
      continue;
    }
    if (unsupported.length) e.riskFlags = [...e.riskFlags, `Parts need capabilities Shapect doesn't have yet: ${unsupported.join(", ").replace(/_/g, " ")}`].slice(0, 4);

    // calculator: only a redundant estimator is blocked (N-02); improving/connecting around it is fine
    const pointsAtCalculator = !!e.conversionTargetAssetId && ctx.calculatorAssetIds.includes(e.conversionTargetAssetId);
    if (ctx.hasRealCalculator && e.action === "add" && ESTIMATOR_RE.test(text) && !pointsAtCalculator) {
      decisions.push({ rule: "N-02", label: "No second cost calculator", note: "You already have a working calculator, so we don't suggest another one." });
      continue;
    }

    // scope per context (N-04): drop only unsupported variants, keep the rest
    const dropped = e.contextVariants.filter((v) => ctx.contextSupport.get(v.contextId) === "unsupported");
    e.contextVariants = e.contextVariants.filter((v) => ctx.contextSupport.get(v.contextId) !== "unsupported");
    if (dropped.length && e.contextVariants.length) e.riskFlags = [...e.riskFlags, `Not for: ${dropped.map((v) => ctx.contextLabels.get(v.contextId) ?? v.contextId).join(", ")} (outside V1 scope)`].slice(0, 4);
    if (!e.contextVariants.length && dropped.length) {
      opportunities.push({ label: e.label, reason: "unsupported_scope", note: "Outside what Shapect supports for now. Noted, not suggested." });
      continue;
    }

    // one experience per suburb family (N-10)
    let geoSeen = false;
    e.contextVariants = e.contextVariants.map((v) => ({ ...v, pageIds: v.pageIds.filter((p) => !ctx.locationPageIds.has(p) || (!geoSeen && (geoSeen = true))) }));

    // forbidden promises (N-07) and pricing boundary
    if (FORBIDDEN_HOOK_RE.test(e.headline)) {
      decisions.push({ rule: "N-07", label: `“${e.label}” wording removed`, note: "It promised something no one can guarantee (instant or guaranteed quotes)." });
      continue;
    }
    e.contextVariants = e.contextVariants.filter((v) => !FORBIDDEN_HOOK_RE.test(v.startingHook));
    e.touchpoints = e.touchpoints.filter((t) => !FORBIDDEN_HOOK_RE.test(t.headline));
    const beforeQ = e.questionPlan.length;
    e.questionPlan = e.questionPlan.filter((q) => !PRICING_CLAIM_RE.test(q.question) && !FORBIDDEN_HOOK_RE.test(q.question));
    e.commonFlow = e.commonFlow.map((f) => (PRICING_CLAIM_RE.test(`${f.title} ${f.detail}`) ? { ...f, detail: "Shows your published price references only — no calculation." } : f));
    if (e.questionPlan.length < beforeQ) e.riskFlags = [...e.riskFlags, "Removed wording that implied a price calculation."].slice(0, 4);

    // a "calculator result" field only exists where the business has a calculator
    if (!ctx.hasRealCalculator) {
      e.questionPlan = e.questionPlan.filter((q) => q.fieldKey !== "calculator.result_reference");
      e.projectFields = e.projectFields.filter((f) => f.key !== "calculator.result_reference");
    }
    // field semantics come from the catalog only
    e.questionPlan = e.questionPlan.filter((q) => isKnownField(q.fieldKey));
    e.contextVariants = e.contextVariants.map((v) => ({ ...v, additionalQuestions: v.additionalQuestions.filter((q) => isKnownField(q.fieldKey) && !PRICING_CLAIM_RE.test(q.question)) }));
    e.projectFields = e.projectFields.filter((f) => isKnownField(f.key) && !FIELD_CATALOG[f.key].unsupportedScope);

    // evidence (N-08): ≥1 resolvable evidence id — inherited from the contexts it serves if none cited
    if (!e.evidenceIds.length && ctx.contextEvidence) {
      e.evidenceIds = [...new Set(e.contextVariants.flatMap((v) => ctx.contextEvidence!.get(v.contextId) ?? []))].filter((x) => ctx.knownEvidenceIds.has(x)).slice(0, 4);
    }
    if (!e.evidenceIds.length) {
      opportunities.push({ label: e.label, reason: "weak_evidence", note: "Possibly useful, but we couldn't point to clear evidence on your website." });
      continue;
    }
    if (!e.contextVariants.length && !e.touchpoints.length) {
      decisions.push({ rule: "N-00", label: `“${e.label}” dropped`, note: "It referred to pages or contexts we didn't read." });
      continue;
    }
    out.push(e);
  }

  out.sort((a, b) => b.confidence - a.confidence);
  for (const extra of out.slice(3)) decisions.push({ rule: "N-11", label: `“${extra.label}” held back`, note: "We show at most three ideas so the most useful ones stand out." });
  return { entries: out.slice(0, 3), decisions, opportunities };
}

/** Context fidelity: every supported/partial context is either addressed or explicitly noted. */
export function contextFidelity(
  contexts: { id: string; label: string; support: string; existingCoverage: string; differsBy?: string }[],
  entries: StrategyEntry[],
  mentioned: string[],
): { addressedBy: Map<string, string[]>; notes: GateOpportunity[] } {
  const addressedBy = new Map<string, string[]>();
  for (const e of entries) for (const v of e.contextVariants) addressedBy.set(v.contextId, [...(addressedBy.get(v.contextId) ?? []), e.label]);
  const notes: GateOpportunity[] = [];
  const hay = mentioned.join(" ").toLowerCase();
  for (const c of contexts) {
    if (c.support === "unsupported" || addressedBy.has(c.id)) continue;
    // a context that only differs in wording is served by the common flow of a supported entry
    const general = entries.filter((e) => e.support === "supported" || e.support === "partial");
    if (c.differsBy === "copy" && general.length) { addressedBy.set(c.id, general.map((e) => `${e.label} (common flow)`)); continue; }
    if (c.existingCoverage === "covered") continue; // site already handles it — not a gap
    // being named in an opportunity is not coverage — report it, but say it was considered
    const considered = hay.includes(c.id.toLowerCase()) || hay.includes(c.label.toLowerCase());
    notes.push({
      label: c.label, reason: "needs_owner_input",
      note: considered
        ? "Considered as an opportunity, but no recommendation adapts to this context yet."
        : "A distinct context on your site that none of the recommendations covers yet.",
    });
  }
  return { addressedBy, notes };
}

/** Normalised substring check used to verify quotes against real page text. */
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
    const parts = q.split(/\s*(?:\.\.\.|…)\s*/).filter((p) => p.length >= 6);
    return parts.length > 1 && parts.every((p) => t!.includes(p));
  };
}
