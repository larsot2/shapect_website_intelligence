/**
 * Deterministic evidence grounding: a claim keeps only evidence lines that actually support it, and a claim whose
 * cited lines don't fit is re-anchored to the line that does (same content words; same dollar amounts for prices).
 * Models mis-cite ids; this makes "evidence = page text that says it" a property of the code, not of the model.
 */
import type { EvidenceItem } from "./evidence";
import { pricesIn } from "./content-check";

const GENERIC = new Set(["bathroom", "bathrooms", "renovation", "renovations", "renovate", "project", "projects", "your", "with", "this", "that", "what", "which", "have", "about", "from", "will", "would", "planning", "looking", "current", "sydney", "home", "space", "their", "they", "them", "more", "help", "also", "make", "need", "needs", "offer", "offers", "provide", "provides", "service", "services", "team", "work", "works", "include", "includes", "based"]);
const stemsOf = (t: string) => new Set(t.toLowerCase().match(/[a-z]{4,}/g)?.filter((w) => !GENERIC.has(w)).map((w) => w.slice(0, 5)) ?? []);
const isCommercialPage = (pageId: string) => /commercial/.test(pageId);

export interface GroundOptions { /** claim is about the commercial segment (otherwise commercial pages can't support it) */ commercial?: boolean; max?: number }

function score(claim: string, cs: Set<string>, cp: number[], e: EvidenceItem, o: GroundOptions): number {
  if (!o.commercial && isCommercialPage(e.pageId) && !/commercial/i.test(claim)) return 0;
  const es = stemsOf(e.text);
  const overlap = [...es].filter((w) => cs.has(w)).length;
  const ep = new Set(pricesIn(e.text));
  const priceHits = cp.filter((p) => ep.has(p)).length;
  // a claim with prices must find those prices; then words decide
  if (cp.length && !priceHits) return Math.min(overlap, 1);
  return overlap + priceHits * 3;
}

/** Returns the ids that support the claim: cited ones that fit, otherwise the best-fitting lines (or none). */
export function ground(claim: string, cited: string[], evidence: EvidenceItem[], o: GroundOptions = {}): { ids: string[]; changed: boolean } {
  const cs = stemsOf(claim), cp = pricesIn(claim);
  const max = o.max ?? 3;
  const ok = cited.filter((id) => { const e = evidence.find((x) => x.id === id); return !!e && score(claim, cs, cp, e, o) >= 2; });
  if (ok.length) return { ids: ok.slice(0, max), changed: ok.length !== cited.length };
  const best = evidence.map((e) => ({ id: e.id, s: score(claim, cs, cp, e, o) })).filter((x) => x.s >= 3).sort((a, b) => b.s - a.s).slice(0, Math.min(2, max)).map((x) => x.id);
  return { ids: best, changed: true };
}
