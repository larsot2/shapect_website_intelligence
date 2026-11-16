/**
 * Mechanical output validation (no LLM): unfinished wording and unverifiable prices never reach the owner.
 *  - template placeholders ({{x}}, [Tier], <price>, TBD, $X …) are removed
 *  - every dollar amount in a recommendation must appear on the website (normalised: $20K = $20,000)
 *  - near-duplicate entries (same questions, same stage) are flagged; bridges that carry nothing are dropped
 * Pure functions — unit tested.
 */
import type { Blueprint } from "../blueprint/schema";

export const PLACEHOLDER_RE = /\{\{[^}]*\}\}|\[(?:[A-Z][A-Za-z]*(?: [A-Za-z]+){0,2})\]|<(?:[a-z_]+|[A-Z][a-z]+(?: [a-z]+)?)>|\bTBD\b|\bTODO\b|\bX{2,}\b|\$\s?X{1,3}\b|\blorem ipsum\b|\b(?:insert|placeholder) (?:price|amount|name|value)\b/;
const PRICE_RE = /\$\s?\d[\d,]*(?:\.\d+)?\s?(?:k|K|m|M)?\b/g;

/** "$20K" → 20000, "$1.5m" → 1500000, "$19,990" → 19990 */
export function normalisePrice(raw: string): number | null {
  const m = raw.replace(/\s/g, "").match(/^\$([\d,]+(?:\.\d+)?)([kKmM])?$/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * (m[2]?.toLowerCase() === "k" ? 1000 : m[2]?.toLowerCase() === "m" ? 1_000_000 : 1));
}

export function pricesIn(text: string): number[] {
  return (text.match(PRICE_RE) ?? []).map(normalisePrice).filter((n): n is number => n != null);
}

export interface ContentCheckResult { bp: Blueprint; removed: string[]; flagged: string[] }

/** siteText = all text we read on the website (blocks, headings, price mentions). */
export function checkContent(bp: Blueprint, siteText: string): ContentCheckResult {
  const sitePrices = new Set(pricesIn(siteText));
  const removed: string[] = [];
  const flagged: string[] = [];
  const bad = (t?: string) => {
    if (!t) return null;
    if (PLACEHOLDER_RE.test(t)) return "unfinished placeholder";
    const unknown = pricesIn(t).filter((p) => !sitePrices.has(p));
    return unknown.length ? `price not on the website ($${unknown[0].toLocaleString("en-AU")})` : null;
  };
  // prose: drop only the offending sentence
  const prose = (t: string | undefined, where: string) => {
    if (!t || !bad(t)) return t;
    const kept = t.split(/(?<=[.!?])\s+/).filter((s) => { const r = bad(s); if (r) removed.push(`${where}: ${r}`); return !r; }).join(" ");
    return kept || undefined;
  };

  const sx = bp.suggestedExperiences.map((s) => {
    const qp = s.questionPlan.filter((q) => { const r = bad(`${q.question} ${(q.options ?? []).join(" ")}`); if (r) removed.push(`${s.label} question: ${r}`); return !r; });
    const variants = s.contextVariants
      .filter((v) => { const r = bad(v.startingHook); if (r) removed.push(`${s.label} hook: ${r}`); return !r; })
      .map((v) => ({ ...v, additionalQuestions: v.additionalQuestions.filter((q) => { const r = bad(q.question); if (r) removed.push(`${s.label} question: ${r}`); return !r; }) }));
    const pageContexts = s.pageContexts.filter((p) => !bad(p.startingHook));
    return {
      ...s,
      headline: prose(s.headline, `${s.label} headline`) ?? s.label,
      promise: prose(s.promise, `${s.label} promise`), outcome: prose(s.outcome, `${s.label} outcome`),
      specificToBusiness: prose(s.specificToBusiness, `${s.label} rationale`),
      whyNotSimpler: prose(s.whyNotSimpler, s.label), whyNotMoreComplex: prose(s.whyNotMoreComplex, s.label),
      experienceSteps: s.experienceSteps.map((x) => ({ ...x, detail: prose(x.detail, `${s.label} step`) ?? "" })),
      touchpoints: s.touchpoints.filter((t) => !bad(t.headline)),
      reasoning: s.reasoning.map((r) => prose(r, `${s.label} reason`)).filter(Boolean) as string[],
      questionPlan: qp, contextVariants: variants,
      pageContexts: pageContexts.length ? pageContexts : s.pageContexts.slice(0, 1).map((p) => ({ ...p, startingHook: s.label })),
    };
  });

  // near-duplicate entries: same questions for the same stage
  for (const a of sx) for (const b of sx) {
    if (a.id >= b.id) continue;
    const ka = new Set(a.questionPlan.map((q) => q.fieldKey)), kb = new Set(b.questionPlan.map((q) => q.fieldKey));
    const inter = [...ka].filter((k) => kb.has(k)).length, union = new Set([...ka, ...kb]).size;
    const sameStage = a.stages.some((x) => b.stages.includes(x));
    if (union >= 3 && inter / union >= 0.6 && sameStage) {
      flagged.push(`${a.label} ↔ ${b.label}: same questions for the same stage`);
      b.riskFlags = [...new Set([...b.riskFlags, `Overlaps strongly with “${a.label}” (same questions, same stage) — consider merging.`])].slice(0, 5);
    }
  }

  // a bridge between entries that carries no answers and gives no reason to continue is just navigation
  const connections = bp.suggestedConnections.filter((c) => {
    if (c.to.kind !== "suggestion" || c.mode !== "explicit_bridge") return true;
    const empty = !c.possibleSharedFields.length && !c.motivation;
    if (empty) flagged.push(`bridge ${c.fromSuggestionId} → ${c.to.id} dropped: carries nothing`);
    return !empty;
  });

  const frictions = bp.frictions.map((f) => ({ ...f, whyHardHere: prose(f.whyHardHere, "friction") ?? f.whyHardHere.replace(PRICE_RE, "a published price") }));
  const opportunityInventory = bp.opportunityInventory.map((o) => ({ ...o, transformation: prose(o.transformation, `${o.label}`), observedSignal: prose(o.observedSignal, `${o.label}`) }));

  return { bp: { ...bp, suggestedExperiences: sx, suggestedConnections: connections, frictions, opportunityInventory }, removed, flagged };
}
