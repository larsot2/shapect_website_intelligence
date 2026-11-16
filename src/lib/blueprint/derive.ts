/**
 * Pure, deterministic derivations used by the UI. They make older snapshots
 * (without LLM-provided steps / connection state) look as good as new ones,
 * and they never invent facts: everything is built from blueprint data.
 */
import type { BBox, Blueprint, ConnectionSuggestion, ExperienceSuggestion } from "./schema";

type Field = ExperienceSuggestion["possibleProjectFields"][number];
const list = (xs: string[], n = 3) => xs.slice(0, n).join(", ").replace(/, ([^,]*)$/, " and $1");

// ------------------------------------------------------------ 1. proposed experience flow

export function experienceSteps(s: ExperienceSuggestion, bp: Blueprint): { title: string; detail: string }[] {
  if ((s.experienceSteps?.length ?? 0) >= 2) return s.experienceSteps;
  const caps = new Set(s.capabilityKeys);
  const facts = s.possibleProjectFields.filter((f) => f.semantics !== "preference" && f.usage !== "needs_confirmation").map((f) => f.label.toLowerCase());
  const prefs = s.possibleProjectFields.filter((f) => f.semantics === "preference").map((f) => f.label.toLowerCase());
  const target = s.conversionTargetAssetId ? bp.conversionAssets.find((a) => a.id === s.conversionTargetAssetId) : undefined;
  const steps: { title: string; detail: string }[] = [];
  if (caps.has("guided_questions")) steps.push({ title: "Understand the project", detail: facts.length ? `A few questions: ${list(facts)}.` : "A few questions about the room, scope and timing." });
  if (caps.has("style_choices")) steps.push({ title: "Explore styles", detail: "Pick looks they like from your own project photos." });
  else if (caps.has("preference_summary") && prefs.length) steps.push({ title: "Capture preferences", detail: `${list(prefs)} — as preferences, not product choices.` });
  if (caps.has("budget_reference")) steps.push({ title: "See your price references", detail: "Your published price ranges as context — no calculation, no quote." });
  if (caps.has("project_checklist")) steps.push({ title: "Get ready for the visit", detail: "What to have ready: photos, rough measurements, timing." });
  if (caps.has("form_improvement_advice")) steps.push({ title: "Answer clearer questions", detail: "Optional choices in your existing form instead of one blank box." });
  if (caps.has("scope_summary")) steps.push({ title: "Prepare a project brief", detail: "A short, structured summary instead of starting from scratch." });
  const handoff = { title: target ? `Continue to your ${shortAsset(target.label)}` : "Continue as today", detail: "Your existing process stays exactly as it is." };
  const body = steps.slice(0, 3);
  return [...body, handoff];
}

const shortAsset = (label: string) => label.replace(/^(form|button)\s*[:(]\s*/i, "").replace(/[“”")]/g, "").toLowerCase();

// ------------------------------------------------------------ 2. network: mechanisms + ProjectState

export type Mechanism = "bridge" | "destination" | "touchpoints";

export interface ConnectionState {
  mechanism: Mechanism;
  carry: { label: string; note?: string }[];
  missing: string[];
  constraints: string[];
}

export function connectionState(c: ConnectionSuggestion, bp: Blueprint): ConnectionState {
  const from = bp.suggestedExperiences.find((s) => s.id === c.fromSuggestionId);
  const toS = c.to.kind === "suggestion" ? bp.suggestedExperiences.find((s) => s.id === c.to.id) : undefined;
  const toA = c.to.kind === "existing_asset" ? bp.conversionAssets.find((a) => a.id === c.to.id) : undefined;
  const mechanism: Mechanism = c.relation === "same_experience_multiple_pages" ? "touchpoints" : toS ? "bridge" : "destination";
  const srcFields = from?.possibleProjectFields ?? [];
  const tgtFields = toS?.possibleProjectFields ?? [];
  const byKey = new Map<string, Field>([...tgtFields, ...srcFields].map((f) => [norm(f.key), f]));
  const label = (k: string) => byKey.get(norm(k))?.label ?? humanise(k);

  const sharedKeys = c.possibleSharedFields?.length ? c.possibleSharedFields : srcFields.filter((f) => tgtFields.some((t) => norm(t.key) === norm(f.key))).map((f) => f.key);
  const carry = sharedKeys.map((k) => {
    const f = byKey.get(norm(k));
    return { label: label(k), note: f?.semantics === "preference" ? "preference only" : undefined };
  });
  const missing = c.missingFields?.length
    ? c.missingFields.map(label)
    : tgtFields.filter((t) => !sharedKeys.some((k) => norm(k) === norm(t.key))).map((t) => t.label);
  if (toA?.fields?.length && !missing.length) missing.push("Contact details (your form still asks for them)");

  const constraints = [...(c.constraints ?? [])];
  if (carry.some((x) => x.note) && !constraints.some((x) => /preference/i.test(x))) constraints.push("A style or quality preference is not a product selection or a budget.");
  const priceTarget = (toS && (toS.capabilityKeys.includes("budget_reference") || /cost|price|budget/i.test(toS.label))) || /cost|price|budget/i.test(from?.label ?? "");
  if (priceTarget && !constraints.some((x) => /pric/i.test(x))) constraints.push("Prices only from your confirmed price basis — never calculated automatically.");
  return { mechanism, carry, missing: missing.slice(0, 5), constraints: constraints.slice(0, 3) };
}

const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");
const humanise = (k: string) => k.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

// ------------------------------------------------------------ 3. touchpoint quality (not just geometry)

export interface PlacementVerdict {
  quality: "good" | "review" | "unverified";
  note: string;
  /** another suggestion already uses this spot — show one marker only */
  crowdedBy?: string;
}

const iou = (a: BBox, b: BBox) => {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const inter = x * y;
  return inter / (a.width * a.height + b.width * b.height - inter || 1);
};

export function placementVerdicts(bp: Blueprint, rejected: Set<string> = new Set()): Map<string, PlacementVerdict> {
  const out = new Map<string, PlacementVerdict>();
  const placed: { tpId: string; label: string; pageId: string; box: BBox }[] = [];
  for (const s of bp.suggestedExperiences) {
    if (rejected.has(s.id)) continue;
    for (const t of s.touchpoints) {
      const box = t.bboxes.find((b) => b.viewport === "desktop") ?? t.bboxes[0];
      if (!box) {
        out.set(t.id, { quality: "unverified", note: "Suggested section — exact position not verified." });
        continue;
      }
      const clash = placed.find((p) => p.pageId === t.pageId && (iou(p.box, box) > 0.35 || (Math.abs(p.box.y - box.y) < 40 && Math.abs(p.box.x - box.x) < 80)));
      if (clash) {
        out.set(t.id, { quality: "review", note: `Same spot as “${clash.label}”. Only one experience should appear here — this one needs a different place.`, crowdedBy: clash.label });
        continue;
      }
      placed.push({ tpId: t.id, label: s.label, pageId: t.pageId, box });
      const page = bp.pages.find((p) => p.id === t.pageId);
      const shot = page?.screenshots.find((x) => x.viewport === box.viewport);
      const ctaNear = bp.conversionAssets.some((a) => a.occurrences.some((o) => o.pageId === t.pageId && o.placement !== "header" && o.placement !== "nav" && o.bboxes.some((b) => b.viewport === box.viewport && Math.abs(b.y - (box.y + box.height)) < 220)));
      if (t.placementKind === "replace_cta" || t.placementKind === "beside_cta") {
        out.set(t.id, { quality: "good", note: "Works with an existing call to action instead of adding another button." });
      } else if (box.height < 110) {
        out.set(t.id, { quality: "review", note: "Only a heading was measured — it would sit just below this heading. Check that it doesn't push your content down." });
      } else if (page?.pageType === "home" && box.y < 800) {
        out.set(t.id, { quality: "review", note: "Above the fold on your homepage — it would compete with your main call to action." });
      } else if (shot && box.y > shot.height * 0.85) {
        out.set(t.id, { quality: "review", note: "Very low on the page — few visitors may reach it." });
      } else if (ctaNear) {
        out.set(t.id, { quality: "good", note: "Close to where visitors already decide to get in touch." });
      } else {
        out.set(t.id, { quality: "good", note: "In the section where this question comes up." });
      }
    }
  }
  return out;
}

// ------------------------------------------------------------ 5. observed vs inferred

export const stepBasis = (step: Blueprint["journeys"][number]["steps"][number]): "observed" | "inferred" =>
  step.basis ?? (step.kind === "outcome" ? "inferred" : "observed");

// ------------------------------------------------------------ priority (what first, what optional)

export interface Priority { label: string; tone: "go" | "sky" | "amber"; hint: string }

/** Suggestions are already ordered by strength; this turns order + confidence into plain guidance. */
export function priorityOf(index: number, s: ExperienceSuggestion): Priority {
  if (s.confidence < 0.6) return { label: "Only if relevant", tone: "amber", hint: "Weaker evidence — worth it only if it fits how you work." };
  if (index === 0) return { label: "Best first step", tone: "go", hint: "Most value for your visitors with the least change to your process." };
  return { label: "Next layer", tone: "sky", hint: "Builds on the first step once that works." };
}
