/**
 * End-to-end analysis (V2):
 *   collect (crawl A/B/C + inventory + captures, no LLM)
 *   → Understanding (Gemini Flash Lite): facts, offerings with facets, context matrix
 *   → optional delta follow-up (only newly read pages, merged deterministically)
 *   → Strategy (Gemini Flash): opportunity inventory, 0–3 entry concepts with context variants
 *   → deterministic gates → Blueprint.
 * Every stage degrades gracefully into an honest partial result.
 */
import path from "node:path";
import { BLUEPRINT_SCHEMA_VERSION, type Blueprint, type Evidence } from "../blueprint/schema";
import { validateBlueprint } from "../blueprint/validate";
import { config, PROMPT_VERSION } from "./config";
import type { InvAsset, SitePage } from "./inventory";
import { addPages, collectSite, type Collected } from "./collect";
import { completeJson, llmConfigured, newUsage, type LlmUsage } from "./llm/client";
import { buildCritiquePrompt, buildRevisionPrompt, buildDeltaPrompt, buildStrategyPrompt, buildUnderstandingPrompt } from "./llm/prompts";
import { CritiqueSchema, StrategySchema, UnderstandingDeltaSchema, UnderstandingSchema, type Critique, type Strategy, type Understanding, type UnderstandingDelta } from "./llm/schemas";
import type { PageCapture } from "./capture";
import { applyEntryGates, contextFidelity } from "./gates";
import { buildEvidence, type EvidenceItem } from "./evidence";
import { checkContent } from "./content-check";
import { ground } from "./grounding";
import { FIELD_CATALOG } from "./fields";
import { SUPPORTED_SCOPE_RE, UNSUPPORTED_SCOPE_RE } from "./capabilities";
import { networkMode, newFetchStats } from "./net/fetcher";
import { closeBrowser } from "./browser";
import { PHASES, saveBlueprint, saveDebug, saveJob, scanDir, type JobState, type PhaseKey } from "./store";
import { dedupeKey } from "./urls";
import { pageTopics } from "./crawl";

export const SCHEMA_VERSION_LLM = "wia-schema-v3";

const slug = (s: string, max = 40) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/, "") || "x";
const prettyLabel = (s: string) => (s === s.toUpperCase() && /[A-Z]{3}/.test(s) ? s.charAt(0) + s.slice(1).toLowerCase() : s).replace(/^Form: “(.*)”$/, "Form ($1)");
const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…");
const opt = <T,>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);

export function newJob(scanId: string, url: string): JobState {
  const now = new Date().toISOString();
  return {
    scanId, url, status: "queued", phase: null,
    phases: Object.fromEntries(PHASES.map((p) => [p.key, { status: "pending" }])) as JobState["phases"],
    activity: [], counts: {}, createdAt: now, updatedAt: now,
  };
}

export async function runScan(job: JobState): Promise<void> {
  const t0 = Date.now();
  const stats = newFetchStats();
  const usage = newUsage();
  const warnings: string[] = [];
  let lastSave = 0;
  const save = async (force = false) => {
    if (!force && Date.now() - lastSave < 400) return;
    lastSave = Date.now();
    await saveJob(job);
  };
  const log = (line: string) => {
    job.activity = [...job.activity, line].slice(-12);
    save().catch(() => {});
  };
  const enter = async (key: PhaseKey) => {
    if (job.phase) job.phases[job.phase].status = job.phases[job.phase].status === "failed" ? "failed" : "done";
    job.phase = key;
    job.phases[key].status = "active";
    await save(true);
  };

  job.status = "running";
  await save(true);
  try {
    await enter("reading");
    const { collected, captureTask } = await collectSite(job.url, stats, {
      log,
      counts: (c) => {
        for (const [k, v] of Object.entries(c)) if (v != null) (job.counts as Record<string, number>)[k] = v;
        save().catch(() => {});
      },
      scanDir: scanDir(job.scanId),
    });
    job.phases.reading.detail = `${collected.pages.length} pages read closely · ${collected.candidateCount} found`;
    log(`Read ${collected.pages.length} pages closely`);

    const result = await analyze(collected, {
      scanId: job.scanId, usage, warnings, stats, t0, log, captureTask,
      phase: async (key, detail, failed) => {
        if (detail && job.phase) job.phases[job.phase].detail = detail;
        if (failed && job.phase) job.phases[job.phase].status = "failed";
        if (key) await enter(key);
      },
    });
    await saveDebug(job.scanId, "llm-usage", usage);
    await saveBlueprint(job.scanId, result.blueprint);
    job.phases.recommending.detail = `${result.blueprint.suggestedExperiences.length} recommendation${result.blueprint.suggestedExperiences.length === 1 ? "" : "s"}`;
    if (job.phase) job.phases[job.phase].status = job.phases[job.phase].status === "failed" ? "failed" : "done";
    job.status = result.understandingOk && result.strategyOk ? "done" : "partial";
    job.businessName = result.blueprint.website.businessName;
    log(job.status === "done" ? "Analysis ready" : "Partial analysis ready");
  } catch (e) {
    job.status = "failed";
    job.error = humanError(e as Error);
    if (job.phase) job.phases[job.phase].status = "failed";
  } finally {
    job.finishedAt = new Date().toISOString();
    await save(true);
    await closeBrowser();
  }
}

export interface AnalyzeOptions {
  scanId: string;
  usage: LlmUsage;
  warnings: string[];
  stats: { requests: number; cacheHits: number };
  t0: number;
  log: (line: string) => void;
  captureTask?: Promise<void>;
  phase?: (key: PhaseKey | null, detail?: string, failed?: boolean) => Promise<void>;
}

function mergeDelta(u: Understanding, d: UnderstandingDelta): Understanding {
  const facts = [...u.facts];
  for (const f of d.facts) if (!facts.some((x) => x.label.toLowerCase() === f.label.toLowerCase())) facts.push(f);
  const offerings = [...u.offerings];
  for (const o of d.offerings) if (!offerings.some((x) => x.label.toLowerCase() === o.label.toLowerCase())) offerings.push(o);
  const contexts = [...u.contexts];
  for (const c of d.contexts) {
    const i = contexts.findIndex((x) => x.id === c.id);
    if (i < 0) { contexts.push(c); continue; }
    // field-wise: a delta answer often repeats a context in short form — empty fields must not wipe real data
    const old = contexts[i];
    const pick = <T,>(a: T, b: T): T => (Array.isArray(b) ? ((b as unknown[]).length ? b : a) : b == null || b === "" ? a : b);
    contexts[i] = {
      ...old,
      label: pick(old.label, c.label),
      sourcePageIds: [...new Set([...old.sourcePageIds, ...c.sourcePageIds])],
      facets: { ...old.facets, ...Object.fromEntries(Object.entries(c.facets ?? {}).filter(([, v]) => v)) },
      customerIntent: pick(old.customerIntent, c.customerIntent),
      unresolvedDecisions: pick(old.unresolvedDecisions, c.unresolvedDecisions),
      specificConstraints: pick(old.specificConstraints, c.specificConstraints),
      existingCoverage: c.existingCoverage?.level && c.existingCoverage.level !== "unknown" ? c.existingCoverage : old.existingCoverage,
      requiredFieldKeys: pick(old.requiredFieldKeys, c.requiredFieldKeys),
      conversionGoalAssetId: pick(old.conversionGoalAssetId, c.conversionGoalAssetId),
      evidenceIds: [...new Set([...old.evidenceIds, ...c.evidenceIds])],
    };
  }
  const pages = [...u.pages.filter((p) => !d.pages.some((x) => x.pageId === p.pageId)), ...d.pages];
  const resolved = d.resolvedUncertainties.map((x) => x.toLowerCase());
  return { ...u, facts: facts.slice(0, 18), offerings: offerings.slice(0, 20), contexts: contexts.slice(0, 10), pages, uncertainties: u.uncertainties.filter((x) => !resolved.some((r) => x.toLowerCase().includes(r.slice(0, 30)))) };
}

/**
 * Deterministic post-processing of the context matrix:
 *  - commercial / kitchen-only contexts are never "supported" in V1, whatever the model says
 *  - contexts without page references get them by keyword from the pages we read
 */
export function normaliseContexts(u: Understanding, pages?: SitePage[]): Understanding {
  const kw = (x: Understanding["contexts"][number]) => {
    const f = x.facets ?? {};
    return [f.propertyType, f.roomType, f.perspective, f.functionalNeed, f.segment === "commercial" ? "commercial" : null, /design|style/i.test(x.label) ? "design" : null, ...x.label.toLowerCase().split(/[^a-z]+/)]
      .filter((v): v is string => !!v && v.length > 3 && !["bathroom", "renovation", "renovations", "residential", "project", "projects", "house", "home"].includes(v.toLowerCase()));
  };
  return {
    ...u,
    contexts: u.contexts.map((x) => {
      const commercial = x.facets?.segment === "commercial" || /\bcommercial|office|hospitality|retail\b/i.test(`${x.label} ${x.id}`);
      const name = `${x.label} ${x.id} ${x.facets?.roomType ?? ""} ${x.facets?.coreService ?? ""}`;
      // V1 scope = residential bathroom family; laundry/kitchen/structural/whole-home alone are not
      const outsideBathroom = /\b(kitchen|laundr\w*|structural|extension|full[- ]home|whole[- ]home|home renovation|general renovation)\b/i.test(name) && !/\b(bath\w*|ensuite|shower|toilet|wet ?room|sunroom)\b/i.test(name);
      const kitchenOnly = outsideBathroom;
      const validIds = pages ? x.sourcePageIds.filter((id) => pages.some((p) => p.id === id)) : x.sourcePageIds;
      let sourcePageIds = validIds;
      if (!sourcePageIds.length && pages) {
        const words = kw(x).map((w) => w.toLowerCase().replace(/_/g, " "));
        sourcePageIds = pages.filter((p) => words.some((w) => p.path.toLowerCase().replace(/[-_/]+/g, " ").includes(w))).map((p) => p.id).slice(0, 4);
      }
      return commercial || kitchenOnly ? { ...x, sourcePageIds, support: "unsupported" as const, differsBy: "unsupported" as const } : { ...x, sourcePageIds };
    }),
  };
}

/** Every fact, constraint and content object keeps only evidence that supports it (re-anchored if mis-cited). */
export function groundUnderstanding(u: Understanding, evidence: EvidenceItem[]): Understanding {
  return {
    ...u,
    facts: u.facts.map((f) => {
      const g = ground(`${f.label} ${f.value}`, f.evidenceIds, evidence, { commercial: f.topic === "segment" || /commercial/i.test(`${f.label} ${f.value}`) });
      return { ...f, evidenceIds: g.ids, status: g.ids.length ? f.status : "inferred" };
    }),
    contexts: u.contexts.map((x) => {
      const commercial = x.support === "unsupported" && /commercial/i.test(`${x.label} ${x.id}`);
      return {
        ...x,
        specificConstraints: x.specificConstraints.map((k) => { const g = ground(k.text, k.evidenceIds, evidence, { commercial }); return { ...k, evidenceIds: g.ids, status: g.ids.length ? k.status : "to_confirm" }; }),
        evidenceIds: ground(`${x.label} ${x.customerIntent ?? ""} ${x.unresolvedDecisions.join(" ")}`, x.evidenceIds, evidence, { commercial, max: 4 }).ids,
      };
    }),
    contentAssets: u.contentAssets.map((a) => ({ ...a, evidenceIds: ground(`${a.label} ${a.whatItShows}`, a.evidenceIds, evidence).ids })),
  };
}

/** Contexts that are only suburb/SEO pages or project case studies are not customer contexts. */
function dropNonContexts(u: Understanding, pages: SitePage[], clusterKeys: Set<string> = new Set()): Understanding {
  // members of page families (suburb variants, project pages) are examples/geography, not contexts
  const groupOf = (id: string) => { const p = pages.find((x) => x.id === id); return p && clusterKeys.has(p.key) ? "location" : p?.group; };
  return {
    ...u,
    contexts: u.contexts.filter((x) => {
      const groups = x.sourcePageIds.map(groupOf).filter(Boolean) as string[];
      const onlyNoise = groups.length > 0 && groups.every((g) => ["location", "projects", "blog", "other", "reviews", "about"].includes(g));
      const named = /\b(showcase|case study|project in|service area|suburb)\b/i.test(`${x.label} ${x.id}`);
      return !(onlyNoise || named);
    }),
  };
}

/** A page topic the model skipped becomes a clearly marked stub context (detected, not analysed) — never silently lost. */
function addTopicStubs(u: Understanding, pages: SitePage[]): Understanding {
  const mapped = new Set(u.contexts.flatMap((x) => x.sourcePageIds));
  const covers = (topic: string) => u.contexts.some((x) => `${x.label} ${x.id} ${Object.values(x.facets ?? {}).join(" ")}`.toLowerCase().includes(topic.replace(/_/g, " ")));
  const stubs: Understanding["contexts"] = [];
  for (const p of pages.slice(1)) {
    if (mapped.has(p.id) || !["service", "design", "commercial"].includes(p.group)) continue;
    for (const t of pageTopics(p.url, p.digest.h1[0])) {
      if (covers(t) || stubs.some((s2) => s2.id === `topic-${t}`)) continue;
      stubs.push({
        id: `topic-${t}`, label: `${t.replace(/_/g, " ").replace(/^./, (ch) => ch.toUpperCase())} (from its own page)`, sourcePageIds: [p.id],
        facets: {}, customerIntent: null, unresolvedDecisions: [], specificConstraints: [], existingCoverage: { level: "unknown", note: null, assetIds: [] },
        requiredFieldKeys: [], conversionGoalAssetId: null, support: /commercial|kitchen|laundry|structural/.test(t) ? "unsupported" : "owner_review",
        differsBy: "questions", evidenceIds: [],
      });
    }
  }
  return stubs.length ? { ...u, contexts: [...u.contexts, ...stubs.slice(0, 5)], uncertainties: [...u.uncertainties, `Topics with their own page but no worked-out context yet: ${stubs.map((x) => x.id.slice(6)).join(", ")}`].slice(0, 6) } : u;
}

/** Service/design pages the context matrix doesn't account for (context fidelity input). */
function unmappedPages(u: Understanding, pages: SitePage[]): string[] {
  const mapped = new Set(u.contexts.flatMap((x) => x.sourcePageIds));
  return pages.filter((p) => ["service", "design", "commercial"].includes(p.group) && !mapped.has(p.id)).map((p) => p.id);
}

/** LLM stages + gates + assembly on a (possibly frozen) Collected package. */
export interface StrategyTrail { initial: Strategy | null; critique: Critique | null; revised: Strategy | null; finalCritique: Critique | null }

export async function analyze(c: Collected, o: AnalyzeOptions): Promise<{ blueprint: Blueprint; understanding: Understanding | null; strategy: Strategy | null; evidence: EvidenceItem[]; understandingOk: boolean; strategyOk: boolean; trail: StrategyTrail }> {
  const busy = (sec: number) => o.log(`The AI service is busy — trying again in ${sec}s`);
  let evidence = buildEvidence(c.pages);
  await o.phase?.("understanding");
  let understanding: Understanding | null = null;
  if (!llmConfigured()) o.warnings.push("AI analysis is not configured on this server — showing what we could read.");
  else {
    try {
      o.log("Understanding what your business really offers");
      understanding = await completeJson({
        stage: "understanding", task: "understanding", schema: UnderstandingSchema, schemaVersion: SCHEMA_VERSION_LLM, usage: o.usage, promptVersion: PROMPT_VERSION, onWait: busy,
        prompt: buildUnderstandingPrompt(c, evidence),
      });
      const clusterKeys = new Set(c.clusters.flatMap((x) => x.members.map((m) => dedupeKey(m))));
      understanding = groundUnderstanding(addTopicStubs(dropNonContexts(normaliseContexts(understanding, c.pages), c.pages, clusterKeys), c.pages), evidence);
      // targeted follow-up: read only what was asked for, send only the delta
      const wanted = understanding.followUpRequests.map((n) => c.followUps.find((f) => f.id === n.id)?.url).filter(Boolean) as string[];
      const room = config.deepPagesMax - c.pages.length;
      if (wanted.length && room > 0) {
        const extra = wanted.slice(0, Math.min(3, room));
        o.log(`Reading ${extra.length} more page${extra.length > 1 ? "s" : ""} to check details`);
        const added = await addPages(c, extra, newFetchStats());
        if (added.length) {
          const base = evidence.length;
          const newEv = buildEvidence(added, 50).map((e, i) => ({ ...e, id: `E${base + i + 1}` }));
          evidence = [...evidence, ...newEv];
          try {
            const delta = await completeJson({
              stage: "understanding", task: "understanding-delta", schema: UnderstandingDeltaSchema, schemaVersion: SCHEMA_VERSION_LLM, usage: o.usage, promptVersion: PROMPT_VERSION, onWait: busy, maxOutputTokens: 4000,
              prompt: buildDeltaPrompt(c, added, newEv, understanding),
            });
            understanding = groundUnderstanding(addTopicStubs(dropNonContexts(normaliseContexts(mergeDelta(understanding, delta), c.pages), c.pages, clusterKeys), c.pages), evidence);
          } catch (e) {
            o.warnings.push(`Follow-up reading couldn't be analysed (${(e as Error).message}).`);
          }
        }
      }
      await o.phase?.(null, understanding.conversion.label);
      o.log(`Understood: ${understanding.conversion.label} · ${understanding.contexts.length} project contexts`);
    } catch (e) {
      o.warnings.push(`AI understanding failed (${(e as Error).message}). Showing what we could read.`);
      await o.phase?.(null, undefined, true);
    }
  }

  await o.phase?.("mapping");
  o.log("Mapping your conversion paths on real screenshots");
  if (o.captureTask) await o.captureTask;
  const captures = c.captures;
  for (const x of captures) if (x.error) o.warnings.push(`Couldn't capture ${c.pages.find((p) => p.id === x.pageId)?.path}: ${x.error}`);
  await o.phase?.(null, `${captures.filter((x) => x.shots.length).length} pages captured`);

  await o.phase?.("recommending");
  let strategy: Strategy | null = null;
  if (understanding) {
    try {
      o.log("Working out where Shapect could genuinely help");
      strategy = await completeJson({
        stage: "strategy", task: "strategy", schema: StrategySchema, schemaVersion: SCHEMA_VERSION_LLM, usage: o.usage, promptVersion: PROMPT_VERSION, onWait: busy,
        prompt: buildStrategyPrompt({ c, understanding, evidence, sections: sectionsText(captures, c.pages), gateFacts: gateFacts(c.assets, understanding, c.pages), unmappedPages: unmappedPages(understanding, c.pages) }),
      });
    } catch (e) {
      o.warnings.push(`Recommendations failed (${(e as Error).message}).`);
      await o.phase?.(null, undefined, true);
    }
  }

  // independent critic (different model) → one revision by the strategist → final critic ranking.
  // The critic never rewrites anything itself; the strategist decides what to take from it.
  let critique: Critique | null = null;
  const trail: StrategyTrail = { initial: strategy, critique: null, revised: null, finalCritique: null };
  const critic = async (st: Strategy, task: string) => completeJson({
    stage: "critic", task, schema: CritiqueSchema, schemaVersion: SCHEMA_VERSION_LLM, usage: o.usage, promptVersion: PROMPT_VERSION, onWait: busy,
    prompt: buildCritiquePrompt({ c, understanding: understanding!, strategy: st, evidence }),
  });
  if (strategy && understanding && strategy.entries.length && process.env.ANALYZER_CRITIC !== "off") {
    try {
      o.log("Having the ideas critically reviewed");
      critique = await critic(strategy, "critique");
      trail.critique = critique;
      if (process.env.ANALYZER_REVISE !== "off") {
        o.log("Sharpening the ideas with the review");
        try {
          const strategyPrompt = buildStrategyPrompt({ c, understanding, evidence, sections: sectionsText(captures, c.pages), gateFacts: gateFacts(c.assets, understanding, c.pages), unmappedPages: unmappedPages(understanding, c.pages) });
          const revised = await completeJson({
            stage: "strategy", task: "strategy-revision", schema: StrategySchema, schemaVersion: SCHEMA_VERSION_LLM, usage: o.usage, promptVersion: PROMPT_VERSION, onWait: busy,
            prompt: buildRevisionPrompt(strategyPrompt, JSON.stringify(strategy), JSON.stringify(critique)),
          });
          if (revised.entries.length) {
            const first = critique;
            strategy = revised;
            trail.revised = revised;
            critique = await critic(strategy, "critique-final").catch(() => first);
            if (critique !== first) trail.finalCritique = critique;
          }
        } catch (e) {
          o.warnings.push(`Revision after review failed (${(e as Error).message}) — showing the first version with its review.`);
        }
      }
    } catch (e) {
      o.warnings.push(`Critical review failed (${(e as Error).message}) — recommendations are shown unreviewed.`);
    }
  }

  const raw = applyCritique(assemble({ scanId: o.scanId, c, understanding, strategy, captures, evidence, usage: o.usage, stats: o.stats, warnings: o.warnings, t0: o.t0 }), critique, evidence, o.usage.models.critic);
  const names = new Map<string, string>([...raw.pages.map((p) => [p.id, `“${p.title}”`] as const), ...raw.conversionAssets.map((a) => [a.id, `“${a.label}”`] as const)]);
  // a question's basis names its source: E-ids become a short quote there (elsewhere they are removed)
  // basis relevance: a cited line must share real content with the question (a price quote doesn't support a layout question)
  for (const sx of raw.suggestedExperiences) for (const q of sx.questionPlan) {
    if (!q.basis) continue;
    const ids = q.basis.match(/\bE\d{1,4}\b/g) ?? [];
    if (!ids.length) continue;
    const g = ground(`${q.question} ${q.options?.join(" ") ?? ""} ${FIELD_CATALOG[q.fieldKey]?.label ?? ""}`, ids, evidence, { commercial: /commercial/i.test(`${sx.label} ${q.question}`), max: 1 });
    q.basis = g.ids.length ? g.ids[0] : undefined;
  }
  for (const sx of raw.suggestedExperiences) for (const q of sx.questionPlan) {
    if (q.basis) q.basis = q.basis.replace(/\bE\d{1,4}\b/g, (id) => { const t = evidence.find((e) => e.id === id)?.text; return t ? `“${t.length > 100 ? t.slice(0, 99) + "…" : t}”` : id; }).slice(0, 140);
    const fr = raw.frictions.find((f) => f.id === q.basis);
    if (fr) q.basis = `Friction: ${fr.visitorQuestion}`;
  }
  // mechanical checks: placeholders, prices that aren't on the website, duplicate entries, empty bridges
  const siteText = c.pages.map((p) => [p.digest.title, ...p.digest.h1, ...p.digest.headings.map((h) => h.text), ...p.digest.blocks, ...p.digest.priceMentions.map((m) => (typeof m === "string" ? m : JSON.stringify(m)))].join("\n")).join("\n");
  const checked = checkContent(raw, siteText);
  if (checked.removed.length) {
    checked.bp.gateDecisions = [...checked.bp.gateDecisions, { id: `g-${checked.bp.gateDecisions.length + 1}`, rule: "CONTENT", label: `Unfinished or unverifiable wording removed (${checked.removed.length})`, note: clip(checked.removed.slice(0, 3).join("; "), 240), evidence: [] }];
  }
  if (checked.flagged.length) checked.bp.diagnostics.limitations = [...checked.bp.diagnostics.limitations, ...checked.flagged.map((f) => `Check: ${f}`)];
  const bp = stripEvidenceIds(checked.bp, "", names);
  const v = validateBlueprint(bp);
  if (!v.ok) throw new Error(`Blueprint failed validation: ${v.errors.slice(0, 3).join("; ")}`);
  return { blueprint: v.blueprint, understanding, strategy, evidence, understandingOk: !!understanding, strategyOk: !!strategy, trail };
}

const ID_LIST = String.raw`E\d{1,4}(?:(?:\s*,\s*|\s+and\s+|\s*&\s*)E\d{1,4})*`;
/** Internal evidence ids (E12) are for the model only — remove them from owner-facing prose. Verbatim evidence stays untouched. */
export function stripIds(t: string): string {
  return t
    .replace(new RegExp(String.raw`\s*\((?:see |per |cf\. )?${ID_LIST}\)`, "g"), "")
    .replace(new RegExp(String.raw`\b(in|by|from|per|see|under)\s+${ID_LIST}\b`, "g"), "on your website")
    .replace(new RegExp(String.raw`\b${ID_LIST}\b`, "g"), "what your website says")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Prose fields only: ids, keys and verbatim evidence are left alone. */
const NON_PROSE = /^(id|.*Id|.*Ids|key|.*Key|.*Keys|url|path|evidence|quote|kind|group|status|mode|action|proposal|support|scanId)$/;

/** Internal ids (E12, asset/page ids like "multi-step-form-form-continue") are for the model — owner-facing prose gets names instead. */
export function stripEvidenceIds<T>(v: T, key = "", names: Map<string, string> = new Map()): T {
  if (key && NON_PROSE.test(key)) return v;
  if (typeof v === "string") {
    let t = /\bE\d{1,4}\b/.test(v) ? stripIds(v) : v;
    if (names.size && /[a-z0-9]-[a-z0-9]/.test(t) && t.includes(" "))
      t = t.replace(/\(?\b[a-z0-9]+(?:-[a-z0-9]+)+\b\)?/g, (m) => {
        const id = m.replace(/^\(|\)$/g, "");
        const n = names.get(id);
        return n ? (m.startsWith("(") ? `(${n})` : n) : m;
      });
    return t as T;
  }
  if (Array.isArray(v)) return v.map((x) => stripEvidenceIds(x, key, names)) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, stripEvidenceIds(x, k, names)])) as T;
  return v;
}

const GENERIC_WORDS = new Set(["bathroom", "bathrooms", "renovation", "renovations", "renovate", "project", "your", "with", "this", "that", "what", "which", "have", "about", "from", "will", "would", "are", "planning", "looking", "current", "sydney", "home", "space", "their", "they", "them", "more", "help", "also", "make", "need", "needs"]);
/** content stems (first 5 letters of non-generic words) — a cheap relevance check between a claim and its evidence */
export const stems = (t: string) => new Set(t.toLowerCase().match(/[a-z]{4,}/g)?.filter((w) => !GENERIC_WORDS.has(w)).map((w) => w.slice(0, 5)) ?? []);

/** Critic ranking decides the order; rejected ideas are held back WITH the reason (never silently deleted). */
export function applyCritique(bp: Blueprint, cq0: Critique | null, evidence: EvidenceItem[], model?: string): Blueprint {
  if (!cq0) return bp;
  const q = (t: string) => t.replace(/\(?\bE\d{1,4}\b(?:\s*[–,-]\s*E\d{1,4}\b)*\)?/g, (m) => {
    const id = m.match(/E\d{1,4}/)![0];
    const e = evidence.find((x) => x.id === id);
    return e ? `“${e.text.length > 60 ? e.text.slice(0, 59) + "…" : e.text}”` : "";
  });
  const cq: Critique = {
    ...cq0, summary: q(cq0.summary), architectureNote: cq0.architectureNote ? q(cq0.architectureNote) : cq0.architectureNote,
    entries: cq0.entries.map((x) => ({ ...x, issues: x.issues.map(q), fix: x.fix ? q(x.fix) : x.fix })),
    missed: cq0.missed.map((m) => ({ ...m, why: q(m.why) })),
  };
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const find = (label: string) => cq.entries.find((x) => norm(x.label) === norm(label)) ?? cq.entries.find((x) => norm(x.label).includes(norm(label)) || norm(label).includes(norm(x.label)));
  const held: { label: string; reason: string }[] = [];
  let list = bp.suggestedExperiences.map((s) => {
    const r = find(s.label);
    if (!r) return s;
    const scores = Object.fromEntries(Object.entries(r.scores).filter(([, v]) => typeof v === "number")) as Record<string, number>;
    return { ...s, critic: { rank: r.rank, verdict: r.verdict, scores, issues: r.issues, fix: r.fix ?? undefined } };
  });
  list = list.filter((s) => {
    if (s.critic?.verdict !== "reject") return true;
    held.push({ label: s.label, reason: s.critic.issues[0] ?? "Rejected by the critical review." });
    return false;
  });
  list.sort((a, b) => (a.critic?.rank ?? 9) - (b.critic?.rank ?? 9) || (a.priority ?? 9) - (b.priority ?? 9));
  list = list.map((s, i) => ({ ...s, priority: i + 1 }));
  const kept = new Set(list.map((s) => s.id));
  const toEvidence = (ids: string[]) => ids.map((id) => evidence.find((e) => e.id === id)).filter(Boolean).map((e) => ({ kind: "text" as const, pageId: e!.pageId, url: bp.pages.find((p) => p.id === e!.pageId)?.url ?? bp.website.url, quote: e!.text.slice(0, 300) }));
  return {
    ...bp,
    suggestedExperiences: list,
    suggestedConnections: bp.suggestedConnections.filter((cn) => kept.has(cn.fromSuggestionId) && (cn.to.kind !== "suggestion" || kept.has(cn.to.id))),
    assetActions: bp.assetActions.map((a) => (a.relatedSuggestionId && !kept.has(a.relatedSuggestionId) ? { ...a, relatedSuggestionId: undefined } : a)),
    opportunityInventory: bp.opportunityInventory.map((o) => (o.entryId && !kept.has(o.entryId) ? { ...o, entryId: undefined } : o)),
    recommendationCount: bp.recommendationCount ? { ...bp.recommendationCount, count: list.length } : undefined,
    critique: {
      model: model ?? "critic", summary: cq.summary.slice(0, 520), architectureNote: cq.architectureNote?.slice(0, 320) ?? undefined, held,
      missed: cq.missed.map((m) => ({ label: m.label, why: m.why, evidence: toEvidence(m.evidenceIds) })),
    },
  };
}

function humanError(e: Error): string {
  const m = e.message;
  if (/ENOTFOUND|couldn't find/i.test(m)) return "We couldn't find this website. Check the address.";
  if (/HTTP 40[13]/.test(m)) return "This website refused automated reading (it blocks analysis tools).";
  if (/robots/i.test(m)) return m;
  if (/private|not allowed|Only http|standard web ports|Local hostnames/i.test(m)) return m;
  if (/abort|timeout/i.test(m)) return "The website took too long to respond.";
  return `The analysis stopped: ${m.slice(0, 160)}`;
}

function sectionsText(captures: PageCapture[], pages: SitePage[]): string {
  return captures.filter((c) => c.sections.length).map((c) => {
    const p = pages.find((x) => x.id === c.pageId);
    return `${c.pageId} (${p?.path}): ${c.sections.slice(0, 10).map((s) => `${s.id}=“${s.heading.slice(0, 50)}”`).join(", ")}`;
  }).join("\n");
}

function gateFacts(assets: InvAsset[], u: Understanding, pages: SitePage[]): string[] {
  const facts: string[] = [];
  const calc = assets.filter((a) => a.kind === "calculator" || u.assets.some((x) => x.assetId === a.id && x.isRealCalculator));
  facts.push(calc.length ? `A real calculator exists (${calc.map((c) => c.id).join(", ")}): never add another estimator; you may improve the path around it.` : "No working calculator on the site (price articles are not calculators). Shapect may only show the business's published references, never calculate.");
  const booking = assets.filter((a) => a.kind === "booking");
  if (booking.length) facts.push(`Online booking exists (${booking.map((b) => `${b.id}, ${b.ownership ?? "own"}`).join("; ")}): preserve it; no data is transferred to it without an integration.`);
  const multi = assets.filter((a) => a.multiStep || a.kind === "multi_step_form");
  if (multi.length) facts.push(`A guided/multi-step form already exists (${multi.map((m) => m.id).join(", ")}): don't build a competing qualification; improve or connect.`);
  const upload = assets.filter((a) => a.hasUpload);
  if (upload.length) facts.push(`An upload path already exists (${upload.map((m) => m.id).join(", ")}).`);
  if (u.business.commercial) facts.push("The business also does commercial work — commercial contexts are unsupported scope (opportunity only).");
  const linkedOnly = [...new Set(pages.flatMap((p) => p.digest.tools.filter((t) => t.presence === "linked").map((t) => t.name)))];
  if (linkedOnly.length) facts.push(`Only LINKED third-party tools (not the business's own): ${linkedOnly.join(", ")}.`);
  return facts;
}

// ---------------------------------------------------------------- assembly

interface AssembleArgs {
  scanId: string;
  c: Collected;
  understanding: Understanding | null;
  strategy: Strategy | null;
  captures: PageCapture[];
  evidence: EvidenceItem[];
  usage: LlmUsage;
  stats: { requests: number; cacheHits: number };
  warnings: string[];
  t0: number;
}

const SEM_TO_V1: Record<string, "preference" | "fact" | "choice"> = { preference: "preference", choice: "choice", fact: "fact", derived: "fact", context: "fact", contact: "fact" };

function assemble(a: AssembleArgs): Blueprint {
  const { scanId, c, understanding: u, strategy, captures } = a;
  const pages = c.pages;
  const assets = c.assets;
  const pageById = new Map(pages.map((p) => [p.id, p]));
  const urlOf = (pid: string) => pageById.get(pid)!.url;
  const evById = new Map(a.evidence.map((e) => [e.id, e]));
  const toEvidence = (ids: string[] | undefined): Evidence[] =>
    (ids ?? []).map((i) => evById.get(i)).filter(Boolean).filter((e) => pageById.has(e!.pageId)).map((e) =>
      e!.type === "input_requirement" || e!.type === "existing_tool"
        ? { pageId: e!.pageId, url: urlOf(e!.pageId), kind: "dom" as const, locator: clip(e!.text, 190) }
        : { pageId: e!.pageId, url: urlOf(e!.pageId), kind: "text" as const, quote: clip(e!.text, 380) },
    );
  const shotSrc = (file: string) => `/api/scans/${scanId}/shots/${file}`;

  // pages
  const meta = (pid: string) => u?.pages.find((x) => x.pageId === pid);
  const bpPages: Blueprint["pages"] = pages.map((p) => {
    const m = meta(p.id);
    const cap = captures.find((x) => x.pageId === p.id);
    const fallbackType = ({ home: "home", service: "service", commercial: "service", pricing: "pricing", calculator: "calculator", design: "gallery", projects: "project", quote: "quotation", contact: "contact", booking: "booking", faq: "faq", advice: "article", location: "geo", about: "about", reviews: "reviews", blog: "article" } as Record<string, Blueprint["pages"][number]["pageType"]>)[p.group] ?? "other";
    const fallbackGroup = ({ home: "home", service: "services", commercial: "services", pricing: "costs", calculator: "costs", design: "design", projects: "design", quote: "contact", contact: "contact", booking: "contact", about: "trust", reviews: "trust" } as Record<string, Blueprint["pages"][number]["group"]>)[p.group] ?? "other";
    return {
      id: p.id, url: p.url, path: p.path,
      title: clip(m?.title || p.digest.h1[0] || p.digest.title || p.path, 60),
      pageType: m?.pageType ?? fallbackType,
      group: m?.group ?? fallbackGroup,
      context: { perspective: opt(m?.perspective), customerIntent: opt(m?.customerIntent) },
      screenshots: (cap?.shots ?? []).map((s) => ({ viewport: s.viewport, src: shotSrc(s.file), width: s.width, height: s.height, capturedAt: s.capturedAt })),
    };
  });

  const pageGroups: Blueprint["pageGroups"] = c.clusters.map((cl, i) => {
    const crawled = pages.filter((p) => cl.members.some((m) => dedupeKey(m) === p.key)).map((p) => p.id);
    const label = cl.kind === "location" ? "Suburb & area pages" : cl.kind === "blog" ? "Blog articles" : cl.kind === "projects" ? "Project pages" : "Similar pages";
    return {
      id: `group-${i + 1}`, label, pattern: cl.pattern, totalCount: cl.members.length, crawledPageIds: crawled,
      reason: cl.kind === "location" ? `${cl.members.length} pages share one template with a different area — ${crawled.length ? "we read one representative" : "we didn't need to read them"}.`
        : cl.kind === "blog" ? `${cl.members.length} articles — we only read ones that matter for decisions.`
        : `${cl.members.length} pages with the same structure — ${crawled.length ? "we read a representative" : "not needed for this analysis"}.`,
    };
  });

  // conversion assets
  const role = (id: string) => u?.assets.find((x) => x.assetId === id);
  const conversionAssets: Blueprint["conversionAssets"] = assets.filter((x) => role(x.id)?.role !== "not_a_conversion").map((x) => {
    const occ = new Map<string, { pageId: string; placement: string }>();
    for (const o of x.occurrences) occ.set(`${o.pageId}|${o.area}`, { pageId: o.pageId, placement: o.area });
    const firstPage = x.occurrences[0].pageId;
    return {
      id: x.id, kind: x.kind, label: clip(role(x.id)?.label || prettyLabel(x.label), 80), targetPageId: x.targetPageId, targetUrl: x.targetUrl, siteWide: x.siteWide,
      ownership: x.ownership,
      occurrences: [...occ.values()].slice(0, 30).map((o) => ({
        ...o,
        bboxes: captures.filter((cp) => cp.pageId === o.pageId).flatMap((cp) => cp.assetBoxes.filter((b) => b.assetId === x.id && b.area === o.placement).map((b) => b.bbox)).slice(0, 2),
      })),
      fields: x.fields,
      observedOutcome: opt(role(x.id)?.observedOutcome) ?? (x.targetPageId ? `Opens ${bpPages.find((p) => p.id === x.targetPageId)?.title ?? "another page"}.` : undefined),
      status: "observed" as const, confidence: 0.95,
      evidence: [{ pageId: firstPage, url: urlOf(firstPage), kind: "dom" as const, locator: clip(`${x.kind}: ${x.evidenceText || x.label}`, 190) }],
    };
  });
  const assetIds = new Set(conversionAssets.map((x) => x.id));
  const primaryCta = conversionAssets.find((x) => x.kind === "cta_link" || x.kind === "booking") ?? conversionAssets[0];
  const fallbackEvidence: Evidence[] = primaryCta ? primaryCta.evidence : [{ pageId: pages[0].id, url: pages[0].url, kind: "derived" }];

  // offerings → services (facets)
  const services: Blueprint["services"] = (u?.offerings ?? []).filter((o) => !/\b(examples?|gallery|reviews?|testimonials?|faqs?|blog|advice|guides?|portfolio|projects?)\b/i.test(o.label)).map((o, i) => {
    const f = o.facets ?? {};
    const dimension: Blueprint["services"][number]["dimension"] = o.kind === "region" || (f.geography && !f.coreService) ? "region" : f.propertyType && !f.coreService ? "property_type" : f.roomType && !f.coreService ? "room_type" : (f.perspective || f.functionalNeed) && !f.coreService ? "perspective" : "core_service";
    const scope = f.segment === "commercial" ? "commercial" : f.segment === "residential" || f.segment === "mixed" ? "residential" : "unknown";
    return {
      id: `svc-${slug(o.label, 40)}-${i}`, label: clip(o.label, 60), dimension, scope,
      supportedInV1: dimension === "region" ? true : scope !== "commercial" && (SUPPORTED_SCOPE_RE.test(o.label) || SUPPORTED_SCOPE_RE.test(Object.values(f).join(" "))) && !UNSUPPORTED_SCOPE_RE.test(o.label.replace(/bathroom and laundry|bathroom & laundry/i, "bathroom")),
      pageIds: o.pageIds.filter((p) => pageById.has(p)),
    };
  });

  // facts → claims
  const businessClaims: Blueprint["businessClaims"] = [];
  (u?.facts ?? []).forEach((f, i) => {
    const evidence = toEvidence(f.evidenceIds);
    if (!evidence.length) return; // no claim without a resolvable source
    businessClaims.push({
      id: `c-${slug(f.label, 40)}-${i}`, topic: f.topic, label: clip(f.label, 60), value: clip(f.value, 200),
      critical: f.critical || f.topic === "exclusion" || f.topic === "condition",
      verification: f.topic === "license" || f.topic === "warranty" ? "website_claim_unverified" : "not_applicable",
      status: f.status === "observed" && evidence.some((e) => e.kind === "text") ? "observed" : "inferred",
      confidence: f.status === "observed" ? 0.9 : 0.65, evidence,
    });
  });

  const stratEvidence = toEvidence(u?.conversion.evidenceIds);
  const conversionStrategy: Blueprint["conversionStrategy"] = u
    ? { value: u.conversion.primary, label: clip(u.conversion.label, 60), secondary: u.conversion.secondary, certainty: u.conversion.certainty, status: "inferred", confidence: u.conversion.certainty === "clear" ? 0.85 : 0.65, evidence: stratEvidence.length ? stratEvidence : fallbackEvidence }
    : { value: "unknown", label: "Not analysed yet", status: "suggested", confidence: 0.2, evidence: [] };
  const coverage: Blueprint["coverage"] = (u?.coverage ?? []).map((x) => ({ capability: x.capability, level: x.level, note: clip(x.note, 200), assetIds: x.assetIds.filter((y) => assetIds.has(y)) }));

  const journeys: Blueprint["journeys"] = [];
  (u?.journeys ?? []).forEach((j, ji) => {
    const steps = j.steps.map((s, si) => ({
      id: `s${si + 1}`, label: clip(s.label, 60), kind: s.kind, pageIds: s.pageIds.filter((p) => pageById.has(p)),
      assetId: s.assetId && assetIds.has(s.assetId) ? s.assetId : undefined,
      basis: s.kind === "outcome" && s.basis === "observed" && !(s.assetId && assetIds.has(s.assetId)) ? ("inferred" as const) : s.basis,
    })).filter((s) => s.kind !== "asset" || s.assetId);
    if (steps.length < 2) return;
    const evidence = steps.map((s) => s.assetId && conversionAssets.find((x) => x.id === s.assetId)?.evidence[0]).filter(Boolean) as Evidence[];
    journeys.push({ id: `j-${ji + 1}`, label: clip(j.label, 50), primary: j.primary && !journeys.some((x) => x.primary), steps, evidence: evidence.length ? evidence.slice(0, 3) : fallbackEvidence });
  });
  if (!journeys.length) {
    journeys.push(primaryCta
      ? { id: "j-1", label: "Most visitors", primary: true, evidence: primaryCta.evidence, steps: [{ id: "s1", label: "Website pages", kind: "pages", pageIds: pages.slice(0, 3).map((p) => p.id) }, { id: "s2", label: primaryCta.label, kind: "asset", assetId: primaryCta.id, pageIds: [] }] }
      : { id: "j-1", label: "Website", primary: true, evidence: fallbackEvidence, steps: [{ id: "s1", label: "Homepage", kind: "pages", pageIds: [pages[0].id] }, { id: "s2", label: "No clear enquiry path found", kind: "outcome", pageIds: [] }] });
  }

  // gates
  const contextSupport = new Map((u?.contexts ?? []).map((x) => [x.id, x.support] as const));
  const contextLabels = new Map((u?.contexts ?? []).map((x) => [x.id, x.label] as const));
  const calcIds = conversionAssets.filter((x) => x.kind === "calculator" || u?.assets.some((r) => r.assetId === x.id && r.isRealCalculator)).map((x) => x.id);
  const locationPageIds = new Set(pages.filter((p) => p.group === "location" || meta(p.id)?.pageType === "geo").map((p) => p.id));
  const gated = applyEntryGates(strategy?.entries ?? [], {
    hasRealCalculator: calcIds.length > 0, calculatorAssetIds: calcIds, contextSupport, contextLabels, locationPageIds,
    knownPageIds: new Set(pageById.keys()), knownAssetIds: assetIds, knownEvidenceIds: new Set(evById.keys()),
    contextEvidence: new Map((u?.contexts ?? []).map((x) => [x.id, [...x.evidenceIds, ...x.specificConstraints.flatMap((k) => k.evidenceIds)]] as const)),
  });
  const fidelity = contextFidelity((u?.contexts ?? []).map((x) => ({ id: x.id, label: x.label, support: x.support, existingCoverage: x.existingCoverage.level, differsBy: x.differsBy })), gated.entries, [...(strategy?.opportunities ?? []).flatMap((x) => [x.label, ...x.contextIds]), ...(strategy?.notSuggested ?? []).map((x) => `${x.label} ${x.note}`)]);

  // contexts
  const contexts: Blueprint["contexts"] = (u?.contexts ?? []).map((x) => ({
    id: x.id, label: clip(x.label, 60), sourcePageIds: x.sourcePageIds.filter((p) => pageById.has(p)),
    facets: Object.fromEntries(Object.entries(x.facets ?? {}).filter(([, v]) => typeof v === "string" && v)) as Record<string, string>,
    customerIntent: opt(x.customerIntent),
    visitorDecisions: x.unresolvedDecisions,
    uniqueConstraints: x.specificConstraints.map((k) => {
      const ev = toEvidence(k.evidenceIds);
      return { text: k.text, status: k.status === "observed" && ev.length ? ("observed" as const) : ("to_confirm" as const), evidence: ev };
    }),
    requiredFieldKeys: x.requiredFieldKeys.filter((k) => k in FIELD_CATALOG),
    existingCoverage: x.existingCoverage.level,
    coverageNote: opt(x.existingCoverage.note),
    conversionGoalAssetId: x.conversionGoalAssetId && assetIds.has(x.conversionGoalAssetId) ? x.conversionGoalAssetId : undefined,
    support: x.support, differsBy: x.differsBy, evidence: toEvidence(x.evidenceIds),
    addressedBy: fidelity.addressedBy.get(x.id) ?? [],
  }));

  // frictions: "observed" only if every cited id resolves to real page text
  const ctxIds = new Set((u?.contexts ?? []).map((x) => x.id));
  const frictions: Blueprint["frictions"] = (strategy?.diagnosis ?? []).map((f) => {
    f = { ...f, evidenceIds: ground(`${f.visitorQuestion} ${f.whyHardHere}`, f.evidenceIds, a.evidence, { commercial: /commercial/i.test(f.visitorQuestion), max: 4 }).ids };
    const ev = toEvidence(f.evidenceIds);
    return {
      id: f.id, visitorQuestion: clip(f.visitorQuestion, 180), whyHardHere: clip(f.whyHardHere, 260), consequence: f.consequence,
      contextIds: f.contextIds.filter((c) => ctxIds.has(c)),
      status: f.status === "observed" && ev.length > 0 && ev.length === f.evidenceIds.length ? ("observed" as const) : ("inferred" as const),
      evidence: ev,
    };
  });

  // entries → suggestions
  const sxIdByLabel = new Map<string, string>();
  const suggestedExperiences: Blueprint["suggestedExperiences"] = gated.entries.map((e, i) => {
    const sid = `sx-${slug(e.label, 36)}-${i + 1}`;
    sxIdByLabel.set(e.label.toLowerCase(), sid);
    const ctxFacet = (cid: string) => {
      const f = u?.contexts.find((x) => x.id === cid)?.facets ?? {};
      return opt(f.perspective ?? f.propertyType ?? f.functionalNeed ?? f.roomType);
    };
    const pageContexts: Blueprint["suggestedExperiences"][number]["pageContexts"] = [];
    for (const v of e.contextVariants) for (const pid of v.pageIds.slice(0, 2)) if (!pageContexts.some((p) => p.pageId === pid)) pageContexts.push({ pageId: pid, perspective: ctxFacet(v.contextId), startingHook: clip(v.startingHook, 140) });
    for (const t of e.touchpoints) if (!pageContexts.some((p) => p.pageId === t.pageId)) pageContexts.push({ pageId: t.pageId, startingHook: clip(t.headline, 140) });
    if (!pageContexts.length) pageContexts.push({ pageId: pages[0].id, startingHook: clip(e.headline, 140) });
    const fieldKeys = [...new Set([...e.projectFields.map((f) => f.key), ...e.questionPlan.map((q) => q.fieldKey), ...e.contextVariants.flatMap((v) => v.additionalQuestions.map((q) => q.fieldKey))])].filter((k) => k in FIELD_CATALOG);
    const target = e.conversionTargetAssetId ? conversionAssets.find((x) => x.id === e.conversionTargetAssetId) : undefined;
    return {
      id: sid, label: clip(e.label, 48), action: e.action,
      headline: clip(e.headline, 200), customerNeed: clip(e.visitorOutcome, 240), businessGoal: clip(e.businessOutcome, 240),
      whatHappensNext: clip(target ? `Ends in your ${target.label.toLowerCase()} — your process stays the same.` : (e.commonFlow.at(-1)?.detail ?? e.headline), 240),
      currentState: clip(e.currentState, 240), coverageGap: clip(e.coverageGap, 240), consolidationRationale: clip(e.consolidationRationale, 300),
      support: e.support, complexity: e.complexity, riskFlags: e.riskFlags.map((x) => clip(x, 200)),
      prerequisites: e.prerequisites.map((x) => clip(x, 220)),
      experienceSteps: e.commonFlow.map((x) => ({ title: clip(x.title, 60), detail: clip(x.detail, 180) })),
      contextVariants: e.contextVariants.map((v) => ({
        contextId: v.contextId, pageIds: v.pageIds, startingHook: clip(v.startingHook, 160), focus: opt(v.focus) ? clip(v.focus!, 160) : undefined,
        additionalQuestions: v.additionalQuestions.map((q) => ({ question: clip(q.question, 160), fieldKey: q.fieldKey, when: opt(q.when) ? clip(q.when!, 120) : undefined, purpose: q.purpose ?? undefined })),
        fallbackIfUnknown: opt(v.fallbackIfUnknown) ? clip(v.fallbackIfUnknown!, 160) : undefined,
      })),
      questionPlan: e.questionPlan.map((q) => ({ question: clip(q.question, 160), fieldKey: q.fieldKey, answerType: q.answerType, options: q.options?.map((x) => clip(x, 60)) ?? undefined, condition: opt(q.condition) ? clip(q.condition!, 120) : undefined, purpose: q.purpose ?? undefined, basis: opt(q.basis) ? clip(q.basis!, 140) : undefined })),
      resolvesFrictions: e.frictionIds.filter((f) => frictions.some((x) => x.id === f)),
      capabilityKeys: e.capabilityKeys,
      pageContexts,
      touchpoints: e.touchpoints.map((t, ti) => {
        const cap = captures.find((x) => x.pageId === t.pageId);
        let bboxes: Blueprint["suggestedExperiences"][number]["touchpoints"][number]["bboxes"] = [];
        if (t.sectionId) bboxes = cap?.sections.find((x) => x.id === t.sectionId)?.boxes ?? [];
        if (!bboxes.length && t.assetId && cap) {
          const boxes = cap.assetBoxes.filter((b) => b.assetId === t.assetId);
          const pick = (vp: "desktop" | "mobile") => boxes.filter((b) => b.bbox.viewport === vp).sort((x, y) => (x.area === "main" ? -1 : 1) - (y.area === "main" ? -1 : 1))[0]?.bbox;
          bboxes = [pick("desktop"), pick("mobile")].filter(Boolean) as typeof bboxes;
        }
        return { id: `tp-${i + 1}-${ti + 1}`, pageId: t.pageId, assetId: opt(t.assetId), placementKind: t.placementKind, headline: clip(t.headline, 140), bboxes, positionVerified: bboxes.length > 0 };
      }),
      conversionTargetAssetId: opt(e.conversionTargetAssetId),
      possibleProjectFields: fieldKeys.map((k) => {
        const def = FIELD_CATALOG[k];
        const reuse = e.projectFields.find((f) => f.key === k)?.reuseIn;
        return {
          key: k, label: def.label, semantics: SEM_TO_V1[def.semantics], fieldSemantics: def.semantics, requiresConfirmation: !!def.requiresConfirmation,
          usage: def.requiresConfirmation ? ("needs_confirmation" as const) : reuse ? ("could_reuse_later" as const) : ("may_collect" as const), reuseIn: opt(reuse),
        };
      }),
      ...(() => {
        // an entry may only REPLACE an existing asset that shows clear observed weaknesses; otherwise it complements it
        if (e.action !== "replace") return {};
        const targets = [e.conversionTargetAssetId, ...e.touchpoints.map((t) => t.assetId)].filter(Boolean) as string[];
        const weak = (u?.assetReviews ?? []).some((r) => (targets.length ? targets.includes(r.assetId) : true) && (r.weaknesses.length >= 2 || r.contextFit === "mismatch"));
        return weak ? {} : { action: "complement" as const };
      })(),
      role: e.role ?? undefined, priority: e.priority ?? undefined, stages: [...new Set(e.stages ?? [])],
      interactionType: e.interactionType ?? undefined,
      motivation: opt(e.motivation) ? clip(e.motivation!, 220) : undefined, promise: opt(e.promise) ? clip(e.promise!, 220) : undefined,
      decisionsResolved: (e.decisionsResolved ?? []).map((x) => clip(x, 180)), outcome: opt(e.outcome) ? clip(e.outcome!, 240) : undefined,
      implementationReadiness: e.readiness ?? undefined, requirements: (e.requirements ?? []).map((x) => clip(x, 200)),
      whyNotSimpler: opt(e.whyNotSimpler) ? clip(e.whyNotSimpler!, 240) : undefined, whyNotMoreComplex: opt(e.whyNotMoreComplex) ? clip(e.whyNotMoreComplex!, 240) : undefined,
      specificToBusiness: opt(e.specificToBusiness) ? clip(e.specificToBusiness!, 260) : undefined,
      sourceContentIds: e.sourceContentIds.filter((x) => (u?.contentAssets ?? []).some((ca) => ca.id === x)),
      ...(() => {
        // entry evidence must relate to what the entry claims (a commercial page doesn't support a residential price tier)
        const claim = stems(`${e.label} ${e.headline} ${e.promise ?? ""} ${e.motivation ?? ""} ${e.specificToBusiness ?? ""} ${e.coverageGap} ${e.currentState} ${e.questionPlan.map((x) => x.question).join(" ")} ${e.contextVariants.map((v) => v.startingHook).join(" ")}`);
        const entryIsCommercial = /commercial/i.test(`${e.label} ${e.headline}`);
        const related = ground([...claim].join(" ") + ` ${e.label} ${e.headline} ${e.promise ?? ""} ${e.specificToBusiness ?? ""}`, e.evidenceIds, a.evidence, { commercial: entryIsCommercial, max: 4 }).ids;
        return related.length
          ? { evidence: toEvidence(related) }
          : { evidence: toEvidence(e.evidenceIds), riskFlags: [...e.riskFlags.map((x) => clip(x, 200)), "The cited website evidence only loosely supports this idea — check before relying on it."].slice(0, 5) };
      })(),
      reasoning: e.reasoning.map((r) => clip(r, 240)),
      confidence: e.confidence,
      openQuestions: e.openQuestions.map((q) => clip(q, 220)),
    };
  });
  const sxByLabel = (label?: string | null) => (label ? sxIdByLabel.get(label.toLowerCase()) ?? [...sxIdByLabel.entries()].find(([k]) => k.includes(label.toLowerCase()) || label.toLowerCase().includes(k))?.[1] : undefined);
  const fieldLabel = (k: string) => FIELD_CATALOG[k]?.label ?? k.replace(/[._]+/g, " ");

  const assetActions: Blueprint["assetActions"] = (strategy?.assetActions ?? [])
    .filter((x) => assetIds.has(x.assetId) && pageById.has(x.pageId))
    // someone else's linked tool is never bridged/replaced/removed by our proposal
    .filter((x) => conversionAssets.find((y) => y.id === x.assetId)?.ownership !== "linked_third_party" || x.proposal === "keep")
    // established paths may be improved or even replaced — but only on OBSERVED weaknesses (asset review);
    // without them a replace/remove is softened to "improve" (a deliberate owner decision either way)
    .map((x) => {
      const k = conversionAssets.find((y) => y.id === x.assetId)?.kind;
      const asset = conversionAssets.find((y) => y.id === x.assetId);
      const review = u?.assetReviews.find((r) => r.assetId === x.assetId);
      // a free-text field or a short form is not evidence of poor UX: replacing needs ≥2 observed weaknesses or a mismatch
      const observedWeak = (review?.weaknesses.length ?? 0) >= 2 || review?.contextFit === "mismatch";
      if ((x.proposal === "replace" || x.proposal === "remove") && !observedWeak)
        return { ...x, proposal: "improve" as const, rationale: `Improve rather than replace — we couldn't observe clear weaknesses. (${x.rationale})` };
      if ((k === "calculator" || k === "booking" || k === "multi_step_form") && x.proposal === "bridge")
        return { ...x, proposal: "keep" as const, rationale: `Keep the direct path; the new experience can sit beside it. (${x.rationale})` };
      // a bridge inserts a step before the existing destination: only for secondary CTA links,
      // never on forms or on the site-wide main CTA (no mandatory intermediate funnel)
      if (x.proposal === "bridge" && (k !== "cta_link" || asset?.siteWide))
        return { ...x, proposal: "keep" as const, rationale: `Keep it direct; the new experience can sit beside it instead. (${x.rationale})` };
      void k;
      return x;
    })
    .map((x, i) => ({ id: `aa-${i + 1}`, assetId: x.assetId, pageId: x.pageId, proposal: x.proposal, rationale: clip(x.rationale, 240), relatedSuggestionId: sxByLabel(x.relatedEntry) }));

  // connections: legality + handoff honesty
  const suggestedConnections: Blueprint["suggestedConnections"] = [];
  for (const cn of strategy?.connections ?? []) {
    const from = sxByLabel(cn.from);
    if (!from) continue;
    const toS = sxByLabel(cn.toEntry);
    const toA = cn.toAssetId && assetIds.has(cn.toAssetId) ? cn.toAssetId : undefined;
    if ((!toS && !toA) || toS === from) continue;
    const toEntry = !!toS;
    // bridges/reuse only between entries; links to existing assets never transfer data
    const mode = toEntry ? (cn.mode === "external_link" ? "explicit_bridge" : cn.mode) : cn.mode === "manual_summary" ? "manual_summary" : "external_link";
    // bridges carry every semantically compatible answer both entries plan to use (not only what the model listed)
    const fieldsOf = (sid?: string) => new Set(suggestedExperiences.find((s) => s.id === sid)?.possibleProjectFields.map((f) => f.key) ?? []);
    const compatible = toEntry ? [...fieldsOf(from)].filter((k) => fieldsOf(toS).has(k) && !["contact", "context", "derived"].includes(FIELD_CATALOG[k]?.semantics ?? "")) : [];
    const shared = toEntry ? [...new Set([...cn.sharedFieldKeys.filter((k) => k in FIELD_CATALOG), ...compatible])] : [];
    const unavailable = toEntry ? [] : cn.sharedFieldKeys.filter((k) => k in FIELD_CATALOG).map(fieldLabel);
    const constraints = [...cn.constraints.map((x) => clip(x, 200))];
    if (!toEntry && !constraints.some((x) => /transfer|integration|not passed/i.test(x))) constraints.push("A link only — answers are not passed to this form unless an integration is set up.");
    suggestedConnections.push({
      id: `cn-${suggestedConnections.length + 1}`, fromSuggestionId: from, to: toS ? { kind: "suggestion", id: toS } : { kind: "existing_asset", id: toA! },
      relation: toEntry ? "suggested_continuation" : "existing_destination",
      intent: toEntry ? "continue" : "consult",
      possibleSharedFields: shared, missingFields: cn.missingFieldKeys.filter((k) => k in FIELD_CATALOG).map(fieldLabel), constraints: constraints.slice(0, 3),
      mode, feasibility: cn.feasibility, unavailableFields: unavailable,
      requiresValidation: true, integrationStatus: toEntry ? "concept_only" : "link_only", rationale: clip(cn.reason, 240), evidence: [],
      motivation: opt(cn.motivation) ? clip(cn.motivation!, 220) : undefined,
    });
    if (cn.conditions?.length) suggestedConnections.at(-1)!.constraints = [...suggestedConnections.at(-1)!.constraints, ...cn.conditions.map((x) => clip(x, 200))].slice(0, 4);
  }
  for (const s of suggestedExperiences) {
    if (s.conversionTargetAssetId && !suggestedConnections.some((x) => x.fromSuggestionId === s.id && x.to.kind === "existing_asset")) {
      suggestedConnections.push({ id: `cn-${suggestedConnections.length + 1}`, fromSuggestionId: s.id, to: { kind: "existing_asset", id: s.conversionTargetAssetId }, relation: "existing_destination", intent: "consult", possibleSharedFields: [], missingFields: [], constraints: ["A link only — answers are not passed to this form unless an integration is set up."], mode: "external_link", feasibility: "possible", unavailableFields: [], requiresValidation: true, integrationStatus: "link_only", rationale: clip(s.whatHappensNext, 240), evidence: [] });
    }
  }

  // opportunities
  const entryIdByOpp = new Map<string, string>();
  gated.entries.forEach((e, i) => e.opportunityIds.forEach((o) => entryIdByOpp.set(o, suggestedExperiences[i]?.id)));
  const opportunityInventory: Blueprint["opportunityInventory"] = (strategy?.opportunities ?? []).map((x) => ({
    id: slug(x.id, 20), label: clip(x.label, 60), contextIds: x.contextIds, decisionGap: clip(x.decisionGap, 220), action: x.action, support: x.support, note: opt(x.note) ? clip(x.note!, 220) : undefined, entryId: entryIdByOpp.get(x.id),
    sourcePageIds: x.sourcePageIds.filter((p) => pageById.has(p)), sourceAssetIds: x.sourceAssetIds.filter((p) => assetIds.has(p)),
    sourceContentIds: x.sourceContentIds.filter((id) => (u?.contentAssets ?? []).some((ca) => ca.id === id)),
    stage: x.stage ?? undefined, observedSignal: opt(x.observedSignal) ? clip(x.observedSignal!, 240) : undefined,
    visitorIntent: opt(x.visitorIntent) ? clip(x.visitorIntent!, 200) : undefined, transformation: opt(x.transformation) ? clip(x.transformation!, 260) : undefined,
    interactionType: x.interactionType ?? undefined,
    minimumIntervention: opt(x.minimumIntervention) ? clip(x.minimumIntervention!, 220) : undefined, richerAlternative: opt(x.richerAlternative) ? clip(x.richerAlternative!, 220) : undefined,
    value: x.value ?? undefined, readiness: x.support === "unsupported" ? ("future" as const) : (x.readiness ?? undefined),
    requirements: (x.requirements ?? []).map((r) => clip(r, 160)), assumptions: (x.assumptions ?? []).map((r) => clip(r, 160)),
    evidence: toEvidence(x.evidenceIds),
  }));
  const reasonFor = (s: string) => (s === "unsupported" ? "unsupported_scope" : "needs_owner_input") as Blueprint["unsupportedOpportunities"][number]["reason"];
  const unsupportedOpportunities: Blueprint["unsupportedOpportunities"] = [
    ...gated.opportunities,
    ...fidelity.notes,
    ...(strategy?.opportunities ?? []).filter((x) => x.support === "unsupported" && !entryIdByOpp.has(x.id)).map((x) => ({ label: x.label, reason: reasonFor(x.support), note: x.note ?? x.decisionGap })),
  ].filter((o, i, arr) => arr.findIndex((y) => y.label.toLowerCase() === o.label.toLowerCase()) === i)
    .slice(0, 8).map((o, i) => ({ id: `op-${i + 1}`, label: clip(o.label, 60), reason: o.reason, note: clip(o.note, 240), evidence: [] }));

  const gateDecisions: Blueprint["gateDecisions"] = [
    ...gated.decisions,
    ...(strategy?.notSuggested ?? []).map((n) => ({ rule: "LLM", label: n.label, note: n.note })),
  ].filter((g, i, arr) => arr.findIndex((y) => y.label.toLowerCase() === g.label.toLowerCase()) === i)
    .slice(0, 7).map((g, i) => ({ id: `g-${i + 1}`, rule: g.rule, label: clip(g.label, 80), note: clip(g.note, 240), evidence: [] }));

  const limitations = [...a.warnings];
  const robotsSkipped = c.skipped.filter((s) => s.reason === "robots.txt").length;
  if (robotsSkipped) limitations.push(`${robotsSkipped} page${robotsSkipped > 1 ? "s were" : " was"} skipped because robots.txt asks tools not to read ${robotsSkipped > 1 ? "them" : "it"}.`);
  const failed = c.skipped.filter((s) => s.reason !== "robots.txt");
  if (failed.length) limitations.push(`${failed.length} page${failed.length > 1 ? "s" : ""} couldn't be read (${[...new Set(failed.map((f) => f.reason))].slice(0, 2).join(", ")}).`);
  for (const x of (u?.uncertainties ?? []).slice(0, 3)) limitations.push(`Unclear: ${x}`);

  const homeName = u?.business.name ?? pages[0].digest.title.split(/[|–-]/)[0].trim() ?? c.rootHost;
  const summary = u?.business.summary ?? `We read ${pages.length} pages of ${c.rootHost}.`;
  const now = new Date().toISOString();
  return {
    schemaVersion: BLUEPRINT_SCHEMA_VERSION,
    scanId,
    snapshotVersion: `scan-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}`,
    source: { kind: "scan", label: "Live scan", note: `Read-only analysis of ${c.rootHost} on ${now.slice(0, 10)}.` },
    website: { url: c.homeUrl, businessName: clip(homeName, 80), summary: clip(summary, 240) },
    analysis: { startedAt: new Date(a.t0).toISOString(), finishedAt: now, provider: a.usage.provider ?? "openrouter", model: [a.usage.models.understanding, a.usage.models.strategy].filter(Boolean).join(" + ") || "none", promptVersion: PROMPT_VERSION },
    pages: bpPages, pageGroups, services, businessClaims, conversionAssets, conversionStrategy, coverage, journeys,
    suggestedExperiences, assetActions, suggestedConnections, unsupportedOpportunities, gateDecisions,
    contexts, frictions, opportunityInventory,
    architecture: strategy?.architecture ? {
      chosen: clip(strategy.architecture.chosen, 220), rationale: clip(strategy.architecture.rationale, 420),
      alternatives: strategy.architecture.alternatives.map((x) => ({ key: clip(x.key, 20), label: clip(x.label, 80), fit: x.fit, why: clip(x.why, 240) })),
      motivations: strategy.architecture.motivations.map((m) => ({ motivation: clip(m.motivation, 100), pageIds: m.pageIds.filter((p) => pageById.has(p)), servedBy: m.servedBy, entryId: sxByLabel(m.entry), note: clip(m.note, 220) })),
    } : undefined,
    contentAssets: (u?.contentAssets ?? []).filter((x) => pageById.has(x.pageId)).map((x) => ({ id: x.id, pageId: x.pageId, kind: x.kind, label: clip(x.label, 100), whatItShows: clip(x.whatItShows, 200), evidence: toEvidence(x.evidenceIds) })),
    assetReviews: (u?.assetReviews ?? []).filter((x) => assetIds.has(x.assetId)).map((x) => ({
      assetId: x.assetId, strengths: x.strengths.map((t) => clip(t, 170)), weaknesses: x.weaknesses.map((t) => clip(t, 170)),
      contextFit: x.contextFit, contextNote: opt(x.contextNote) ? clip(x.contextNote!, 200) : undefined, evidence: toEvidence(x.evidenceIds),
    })),
    readinessSignals: (u?.readinessSignals ?? []).map((x) => clip(x, 160)),
    recommendationCount: strategy ? { count: suggestedExperiences.length, rationale: clip(strategy.recommendationCount.rationale + (strategy.recommendationCount.count !== suggestedExperiences.length ? ` (${strategy.recommendationCount.count - suggestedExperiences.length} removed by our checks)` : ""), 400) } : undefined,
    importantUninspected: c.importantUninspected,
    visitorDecisions: (u?.contexts ?? []).filter((x) => x.unresolvedDecisions.length).slice(0, 8).map((x) => ({
      decision: clip(`${x.label}: ${x.unresolvedDecisions[0]}`, 160), pageIds: x.sourcePageIds.filter((p) => pageById.has(p)),
      coverage: x.existingCoverage.level === "covered" ? "covered" : x.existingCoverage.level === "none" ? "none" : "partial",
    })),
    diagnostics: { scannedPageCount: pages.length, skippedPageCount: Math.max(0, c.candidateCount - pages.length), limitations },
    run: {
      durationMs: Date.now() - a.t0, discoveredUrls: c.candidateCount, fetchedPages: c.fetchedCount,
      httpRequests: a.stats.requests, httpCacheHits: a.stats.cacheHits, renderedPages: c.renderedCount, capturedPages: captures.filter((x) => x.shots.length).length,
      llmCalls: a.usage.calls, llmCacheHits: a.usage.cacheHits, inputTokens: a.usage.inputTokens, outputTokens: a.usage.outputTokens, tokensEstimated: a.usage.tokensEstimated,
      reasoningTokens: a.usage.reasoningTokens, costUsd: a.usage.costKnown ? Math.round(a.usage.costUsd * 10000) / 10000 : null,
      models: Object.fromEntries(Object.entries(a.usage.models).filter(([, v]) => v)) as Record<string, string>,
      networkMode, warnings: [...a.warnings, ...a.usage.failures].slice(0, 10),
    },
  };
}

export { newUsage };

export const scanShotPath = (scanId: string, file: string) => path.join(scanDir(scanId), "shots", file);
