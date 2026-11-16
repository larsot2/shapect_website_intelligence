/**
 * DecisionEvidence: typed, verbatim snippets with stable ids (E1, E2, …),
 * extracted deterministically from the page digests. The LLM cites these ids
 * instead of writing its own quotes — cheaper, and quotes can't be invented.
 */
import type { SitePage } from "./inventory";

export type EvidenceType =
  | "service_offering" | "exclusion" | "pricing_reference" | "pricing_condition" | "conversion_promise"
  | "input_requirement" | "process_step" | "design_choice" | "project_constraint" | "trust_claim" | "existing_tool" | "other";

export interface EvidenceItem {
  id: string;
  pageId: string;
  type: EvidenceType;
  text: string; // verbatim (whitespace-normalised), ≤ 240 chars
  heading?: string;
}

const RULES: [EvidenceType, RegExp][] = [
  ["exclusion", /\b(we (do not|don't|dont|no longer|won't)|not (offer|do|provide|available)|only (do|offer|take on) (full|complete)|minimum (job|project|spend)|we don't do|no (makeovers|small jobs|partial))/i],
  ["pricing_condition", /(\$|aud|price|cost|quote)[^.]{0,80}\b(depend|vary|varies|subject to|inc(l|luding)?\.? gst|excl|starting|from|approx|estimate[sd]? only|indicative|fixed[- ]price)|\b(depend|vary|varies)\b[^.]{0,60}(\$|price|cost)/i],
  ["pricing_reference", /(\$\s?\d[\d,.]*\s?(k|K)?|\b\d{2,3},\d{3}\b)/],
  ["conversion_promise", /\b(free (quote|consult\w*|measure|inspection|advice|assessment|design)|no[- ]obligation|within \d+ ?(hours?|business days?|days?)|fixed[- ]price (written )?quot\w*|call(back| you back)|book (a|your) (free )?(consult|measure|appointment))/i],
  ["project_constraint", /\b(strata|body corporate|owners corporation|council|approval|permit|access|lift|parking|apartment|unit block|heritage|asbestos|structural|waterproofing standard|as ?3740|building code|compact|small space|tight)\b/i],
  ["process_step", /\b(step \d|first,|then we|we (will )?(visit|measure|design|inspect|provide|quote|start|finish)|on[- ]site|site (visit|inspection)|timeline|weeks?\b|days on site|project manag)/i],
  ["design_choice", /\b(style|tiles?|vanit(y|ies)|tapware|fixtures?|finish(es)?|colou?r|layout|freestanding|walk-in|niche|3d (design|render)|design (consult\w*|service)|mood|inspiration)\b/i],
  ["trust_claim", /\b(licen[cs]e[d]?|insured|insurance|warrant(y|ies)|guarantee|years'? experience|award|accredited|reviews?|rated|certified|master builder|hia\b)/i],
  ["service_offering", /\b(we (offer|provide|specialise|specialize|renovate|build|do)|our services|services include|renovations? (in|for|across)|ensuite|laundry|kitchen|granny flat|apartment|accessible|ndis|commercial|residential)\b/i],
];

export function classifyText(t: string): EvidenceType {
  for (const [type, re] of RULES) if (re.test(t)) return type;
  return "other";
}

const PER_PAGE: Record<EvidenceType, number> = {
  exclusion: 6, pricing_condition: 5, pricing_reference: 5, conversion_promise: 4, project_constraint: 5, process_step: 4,
  design_choice: 3, trust_claim: 3, service_offering: 6, input_requirement: 0, existing_tool: 0, other: 3,
};

/** Build the evidence inventory. Budget: ~per-page caps by type, total cap. */
export function buildEvidence(pages: SitePage[], totalCap = 170): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  const seen = new Set<string>();
  let n = 0;
  const push = (pageId: string, type: EvidenceType, text: string, heading?: string) => {
    const t = text.replace(/\s+/g, " ").trim().slice(0, 240);
    const key = t.toLowerCase();
    if (t.length < 12 || seen.has(key)) return;
    seen.add(key);
    items.push({ id: `E${++n}`, pageId, type, text: t, heading });
  };
  for (const p of pages) {
    const d = p.digest;
    const counts: Partial<Record<EvidenceType, number>> = {};
    let heading: string | undefined;
    for (const b of d.blocks) {
      if (b.startsWith("## ")) { heading = b.slice(3).slice(0, 90); continue; }
      const text = b.replace(/^- /, "");
      if (text.length < 25) continue;
      const type = classifyText(text);
      if ((counts[type] ?? 0) >= PER_PAGE[type]) continue;
      counts[type] = (counts[type] ?? 0) + 1;
      push(p.id, type, text, heading);
    }
    for (const f of d.forms) {
      const fields = f.fields.map((x) => x.label + (x.options?.length ? ` (${x.options.slice(0, 6).join(" / ")})` : "")).join(", ");
      push(p.id, "input_requirement", `Form${f.multiStep ? " (multi-step)" : ""}${f.hasUpload ? " (with upload)" : ""}: ${fields}${f.submitText ? ` → “${f.submitText}”` : ""}`);
    }
    for (const t of d.tools.filter((x) => x.kind !== "form" && x.kind !== "reviews")) {
      push(p.id, "existing_tool", `${t.name} — ${t.presence === "embedded" ? "on this page" : "only linked (someone else's tool)"}`);
    }
  }
  // keep the most decision-relevant evidence if over budget
  if (items.length <= totalCap) return items;
  const rank: Record<EvidenceType, number> = { exclusion: 9, pricing_condition: 8, conversion_promise: 8, input_requirement: 8, existing_tool: 8, project_constraint: 7, pricing_reference: 6, process_step: 6, service_offering: 6, design_choice: 4, trust_claim: 3, other: 1 };
  const keep = new Set([...items].sort((a, b) => rank[b.type] - rank[a.type]).slice(0, totalCap).map((x) => x.id));
  return items.filter((x) => keep.has(x.id));
}
