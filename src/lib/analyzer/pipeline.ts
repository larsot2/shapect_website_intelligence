/**
 * End-to-end analysis: crawl (A/B/C) → understanding (LLM 1, optional
 * follow-up round) → captures → strategy (LLM 2) → gates → Blueprint.
 * Each stage degrades gracefully: a failed page or LLM call yields a partial,
 * honest blueprint instead of nothing.
 */
import path from "node:path";
import { BLUEPRINT_SCHEMA_VERSION, type Blueprint, type Evidence } from "../blueprint/schema";
import { validateBlueprint } from "../blueprint/validate";
import { config, PROMPT_VERSION } from "./config";
import { discover, followUpCandidates, inspect, selectPages, type CrawlState } from "./crawl";
import { assignPageIds, buildInventory, type InvAsset, type SitePage } from "./inventory";
import { completeJson, llmConfigured, newUsage, type LlmUsage } from "./llm/client";
import { buildStrategyPrompt, buildUnderstandingPrompt } from "./llm/prompts";
import { StrategySchema, UnderstandingSchema, type Strategy, type Understanding } from "./llm/schemas";
import { capturePages, type PageCapture } from "./capture";
import { applyGates, makeQuoteVerifier } from "./gates";
import { SUPPORTED_SCOPE_RE, UNSUPPORTED_SCOPE_RE } from "./capabilities";
import { networkMode, newFetchStats } from "./net/fetcher";
import { closeBrowser } from "./browser";
import { PHASES, saveBlueprint, saveDebug, saveJob, scanDir, type JobState, type PhaseKey } from "./store";
import { dedupeKey } from "./urls";

const slug = (s: string, max = 40) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/, "") || "x";
/** "GET A QUOTE" → "Get a quote"; keeps normal casing untouched. */
const prettyLabel = (s: string) => (s === s.toUpperCase() && /[A-Z]{3}/.test(s) ? s.charAt(0) + s.slice(1).toLowerCase() : s).replace(/^Form: “(.*)”$/, "Form ($1)");
const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…");

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
  const deadline = t0 + config.scanDeadlineMs;
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
    if (job.phase) job.phases[job.phase].status = "done";
    job.phase = key;
    job.phases[key].status = "active";
    await save(true);
  };

  job.status = "running";
  await save(true);
  try {
    // ---------------------------------------------------------------- Stage A–C
    await enter("reading");
    const st = await discover(job.url, stats, (p) => {
      if (p.detail?.pages) job.counts.found = p.detail.pages;
      log(p.message + (p.detail?.pages ? ` · ${p.detail.pages} pages found` : ""));
    });
    await selectPages(st, (p) => {
      if (p.detail?.found) job.counts.found = p.detail.found;
      if (p.detail?.selected) job.counts.selected = p.detail.selected;
      log(p.message + (p.detail?.selected ? ` · ${p.detail.selected} of ${p.detail.found}` : ""));
    });
    await inspect(st, st.selected, (p) => {
      job.counts.read = p.detail?.read;
      save().catch(() => {});
    });
    job.phases.reading.detail = `${st.digests.size} pages read closely · ${st.candidates.size} found`;
    log(`Read ${st.digests.size} pages closely`);

    let pages = toSitePages(st);
    let assets = buildInventory(pages);
    if (!pages.length) throw new Error("We couldn't read any page of this website.");

    // ---------------------------------------------------------------- captures ∥ LLM 1
    // Screenshots run in parallel with the understanding call (heuristic page pick), saving a minute.
    await enter("understanding");
    const capturePick = pickCapturePages(pages, assets, null);
    let captures: PageCapture[] = [];
    const captureTask = capturePages(scanDir(job.scanId), capturePick, assets, (pid, i, n) => {
      job.counts.captured = Math.floor(i / 2);
    }).then((c) => {
      captures = c;
      for (const x of c) if (x.error) warnings.push(`Couldn't capture ${pages.find((p) => p.id === x.pageId)?.path}: ${x.error}`);
    }).catch((e) => {
      warnings.push(`Screenshots failed (${(e as Error).message.slice(0, 120)}).`);
    });

    let understanding: Understanding | null = null;
    if (!llmConfigured()) warnings.push("AI analysis is not configured on this server — showing what we could read.");
    else {
      try {
        const followMap = new Map<string, string>();
        const follow = followUpCandidates(st, 24).map((f, i) => {
          followMap.set(`F${i + 1}`, f.key);
          return { id: `F${i + 1}`, url: f.url, label: f.label };
        });
        log("Asking GPT-5.5 what your business really offers");
        understanding = await completeJson({
          task: "understanding", schema: UnderstandingSchema, usage, promptVersion: PROMPT_VERSION,
          prompt: buildUnderstandingPrompt({ host: st.rootHost, pages, assets, notRead: notReadSummary(st), followUps: follow, budgetChars: config.llmMaxInputChars - 9_000 }),
        });
        // adaptive depth: read what the model says is missing, then re-run once
        const wanted = understanding.needMorePages.map((n) => followMap.get(n.id)).filter(Boolean) as string[];
        const room = config.deepPagesMax - st.digests.size;
        if (wanted.length && room > 0 && Date.now() < deadline - 120_000) {
          const extra = wanted.slice(0, Math.min(config.followUpMax, room));
          log(`Reading ${extra.length} more page${extra.length > 1 ? "s" : ""} to check details`);
          await inspect(st, extra, () => {});
          st.selected.push(...extra.filter((k) => st.digests.has(k)));
          pages = toSitePages(st);
          assets = buildInventory(pages);
          understanding = await completeJson({
            task: "understanding-followup", schema: UnderstandingSchema, usage, promptVersion: PROMPT_VERSION,
            prompt: buildUnderstandingPrompt({ host: st.rootHost, pages, assets, notRead: notReadSummary(st), followUps: [], budgetChars: config.llmMaxInputChars - 9_000 }),
          });
        }
        job.businessName = understanding.business.name;
        job.phases.understanding.detail = understanding.conversionStrategy.label;
        log(`Understood: ${understanding.conversionStrategy.label}`);
      } catch (e) {
        warnings.push(`AI understanding failed (${(e as Error).message}). Showing what we could read.`);
        job.phases.understanding.status = "failed";
      }
    }

    await enter("mapping");
    log("Mapping your conversion paths on real screenshots");
    await captureTask;
    job.counts.captured = captures.filter((c) => c.shots.length).length;
    job.phases.mapping.detail = `${job.counts.captured} pages captured`;

    // quotes are verified against static digest text + rendered text
    const textByPage = new Map<string, string>();
    for (const p of pages) {
      const d = p.digest;
      textByPage.set(p.id, [d.title, d.metaDescription, ...d.headings.map((h) => h.text), ...d.blocks, ...d.ctas.map((c) => c.text), ...d.forms.flatMap((f) => [f.submitText ?? "", ...f.fields.map((x) => x.label)]), ...d.priceMentions, captures.find((c) => c.pageId === p.id)?.text ?? ""].join("\n"));
    }
    const verifyQuote = makeQuoteVerifier(textByPage);

    // ---------------------------------------------------------------- LLM 2
    await enter("recommending");
    let strategy: Strategy | null = null;
    if (understanding) {
      try {
        log("Working out where Shapect could genuinely help");
        strategy = await completeJson({
          task: "strategy", schema: StrategySchema, usage, promptVersion: PROMPT_VERSION,
          prompt: buildStrategyPrompt({ host: st.rootHost, understanding, assets, pages, sections: sectionsText(captures, pages), gateFacts: gateFacts(assets, understanding, pages) }),
        });
      } catch (e) {
        warnings.push(`Recommendations failed (${(e as Error).message}).`);
        job.phases.recommending.status = "failed";
      }
    }

    const bp = assemble({ job, st, pages, assets, understanding, strategy, captures, verifyQuote, usage, stats, warnings, t0 });
    await saveDebug(job.scanId, "llm-usage", usage);
    const v = validateBlueprint(bp);
    if (!v.ok) {
      await saveDebug(job.scanId, "invalid-blueprint", { errors: v.errors, bp });
      throw new Error(`Blueprint failed validation: ${v.errors.slice(0, 3).join("; ")}`);
    }
    await saveBlueprint(job.scanId, v.blueprint);
    job.phases.recommending.detail = `${v.blueprint.suggestedExperiences.length} recommendation${v.blueprint.suggestedExperiences.length === 1 ? "" : "s"}`;
    if (job.phase) job.phases[job.phase].status = job.phases[job.phase].status === "failed" ? "failed" : "done";
    job.status = understanding && strategy ? "done" : "partial";
    job.businessName = v.blueprint.website.businessName;
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

function humanError(e: Error): string {
  const m = e.message;
  if (/ENOTFOUND|couldn't find/i.test(m)) return "We couldn't find this website. Check the address.";
  if (/HTTP 40[13]/.test(m)) return "This website refused automated reading (it blocks analysis tools).";
  if (/robots/i.test(m)) return m;
  if (/private|not allowed|Only http|standard web ports|Local hostnames/i.test(m)) return m;
  if (/abort|timeout/i.test(m)) return "The website took too long to respond.";
  return `The analysis stopped: ${m.slice(0, 160)}`;
}

function toSitePages(st: CrawlState): SitePage[] {
  const keys = [dedupeKey(st.homeUrl), ...st.selected.filter((k) => k !== dedupeKey(st.homeUrl))];
  return assignPageIds(keys.filter((k) => st.digests.has(k)).map((k) => ({ key: k, digest: st.digests.get(k)!, group: st.candidates.get(k)?.group ?? "other" })));
}

function notReadSummary(st: CrawlState): string {
  const lines = st.clusters.map((c) => `- ${c.kind} pages ${c.pattern}: ${c.members.length} similar pages (one representative at most)`);
  const unread = [...st.candidates.values()].filter((c) => !st.digests.has(dedupeKey(c.url)));
  const byGroup: Record<string, number> = {};
  for (const c of unread) byGroup[c.group] = (byGroup[c.group] ?? 0) + 1;
  lines.push(`- other unread pages by heuristic group: ${Object.entries(byGroup).map(([g, n]) => `${g} ${n}`).join(", ")}`);
  return lines.join("\n");
}

function pickCapturePages(pages: SitePage[], assets: InvAsset[], u: Understanding | null): SitePage[] {
  const typeOf = (p: SitePage) => u?.pages.find((x) => x.pageId === p.id)?.pageType;
  const primary = assets.find((a) => a.kind === "cta_link" && a.targetPageId);
  const out: SitePage[] = [pages[0]];
  const push = (p?: SitePage) => { if (p && !out.includes(p) && out.length < config.capturePages && !/commercial/i.test(p.path)) out.push(p); };
  push(pages.find((p) => p.id === primary?.targetPageId)); // where the main CTA leads
  // one page per decision type, LLM page type first, heuristic group as fallback
  const wants: [string[], string[]][] = [
    [["calculator"], ["calculator"]], [["pricing"], ["pricing"]], [["service", "variant"], ["service"]],
    [["gallery", "project"], ["design", "projects"]], [["quotation", "booking", "contact"], ["quote", "booking", "contact"]],
    [["article", "faq"], ["advice", "faq"]],
  ];
  for (const [types, groups] of wants) push(pages.find((p) => !out.includes(p) && (types.includes(typeOf(p) ?? "") || groups.includes(p.group))));
  for (const p of pages) push(p);
  return out;
}

function sectionsText(captures: PageCapture[], pages: SitePage[]): string {
  return captures.filter((c) => c.sections.length).map((c) => {
    const p = pages.find((x) => x.id === c.pageId);
    return `${c.pageId} (${p?.path}): ${c.sections.slice(0, 12).map((s) => `${s.id}=“${s.heading}”`).join(", ")}`;
  }).join("\n");
}

function gateFacts(assets: InvAsset[], u: Understanding, pages: SitePage[]): string[] {
  const facts: string[] = [];
  const calc = assets.filter((a) => a.kind === "calculator" || u.assets.some((x) => x.assetId === a.id && x.isRealCalculator));
  facts.push(calc.length ? `A real calculator exists: ${calc.map((c) => c.id).join(", ")} — no second estimator.` : "No working calculator was found on the site (price articles are not calculators).");
  const booking = assets.filter((a) => a.kind === "booking");
  if (booking.length) facts.push(`Online booking exists: ${booking.map((b) => b.id).join(", ")} — preserve it.`);
  if (u.business.commercial) facts.push("The business also does commercial work — commercial is unsupported scope.");
  const linkedOnly = pages.flatMap((p) => p.digest.tools.filter((t) => t.presence === "linked").map((t) => t.name));
  if (linkedOnly.length) facts.push(`Only LINKED third-party tools (not theirs): ${[...new Set(linkedOnly)].join(", ")}.`);
  return facts;
}

// ---------------------------------------------------------------- assembly

interface AssembleArgs {
  job: JobState; st: CrawlState; pages: SitePage[]; assets: InvAsset[];
  understanding: Understanding | null; strategy: Strategy | null; captures: PageCapture[];
  verifyQuote: (pageId: string, quote: string) => boolean; usage: LlmUsage; stats: ReturnType<typeof newFetchStats>; warnings: string[]; t0: number;
}

function assemble(a: AssembleArgs): Blueprint {
  const { job, st, pages, assets, understanding: u, strategy, captures, verifyQuote } = a;
  const pageById = new Map(pages.map((p) => [p.id, p]));
  const urlOf = (pid: string) => pageById.get(pid)!.url;
  const ev = (pageId: string, quote: string | undefined | null, kind: Evidence["kind"] = "text"): Evidence | null => {
    if (!pageById.has(pageId)) return null;
    if (quote && verifyQuote(pageId, quote)) return { pageId, url: urlOf(pageId), kind, quote: clip(quote.trim(), 380) };
    return null;
  };
  const shotSrc = (file: string) => `/api/scans/${job.scanId}/shots/${file}`;

  // pages
  const meta = (pid: string) => u?.pages.find((x) => x.pageId === pid);
  const bpPages: Blueprint["pages"] = pages.map((p) => {
    const m = meta(p.id);
    const cap = captures.find((c) => c.pageId === p.id);
    const fallbackType = ({ home: "home", service: "service", commercial: "service", pricing: "pricing", calculator: "calculator", design: "gallery", projects: "project", quote: "quotation", contact: "contact", booking: "booking", faq: "faq", advice: "article", location: "geo", about: "about", reviews: "reviews", blog: "article" } as Record<string, Blueprint["pages"][number]["pageType"]>)[p.group] ?? "other";
    const fallbackGroup = ({ home: "home", service: "services", commercial: "services", pricing: "costs", calculator: "costs", design: "design", projects: "design", quote: "contact", contact: "contact", booking: "contact", about: "trust", reviews: "trust", faq: "other" } as Record<string, Blueprint["pages"][number]["group"]>)[p.group] ?? "other";
    return {
      id: p.id, url: p.url, path: p.path,
      title: clip(m?.title || p.digest.h1[0] || p.digest.title || p.path, 60),
      pageType: m?.pageType ?? fallbackType,
      group: m?.group ?? fallbackGroup,
      context: { perspective: m?.perspective ?? undefined, customerIntent: m?.customerIntent ?? undefined },
      screenshots: (cap?.shots ?? []).map((s) => ({ viewport: s.viewport, src: shotSrc(s.file), width: s.width, height: s.height, capturedAt: s.capturedAt })),
    };
  });

  // page groups (clusters)
  const pageGroups: Blueprint["pageGroups"] = st.clusters.map((c, i) => {
    const crawled = pages.filter((p) => c.members.some((m) => dedupeKey(m) === p.key)).map((p) => p.id);
    const label = c.kind === "location" ? "Suburb & area pages" : c.kind === "blog" ? "Blog articles" : c.kind === "projects" ? "Project pages" : "Similar pages";
    return {
      id: `group-${i + 1}`, label, pattern: c.pattern, totalCount: c.members.length, crawledPageIds: crawled,
      reason: c.kind === "location" ? `${c.members.length} pages share one template with a different area — ${crawled.length ? "we read one representative" : "we didn't need to read them"}.`
        : c.kind === "blog" ? `${c.members.length} articles — we only read ones that matter for decisions.`
        : `${c.members.length} pages with the same structure — ${crawled.length ? "we read a representative" : "not needed for this analysis"}.`,
    };
  });

  // assets → conversionAssets (with measured boxes)
  const role = (id: string) => u?.assets.find((x) => x.assetId === id);
  const keptAssets = assets.filter((x) => role(x.id)?.role !== "not_a_conversion");
  const conversionAssets: Blueprint["conversionAssets"] = keptAssets.map((x) => {
    const occ = new Map<string, { pageId: string; placement: string }>();
    for (const o of x.occurrences) occ.set(`${o.pageId}|${o.area}`, { pageId: o.pageId, placement: o.area });
    const firstPage = x.occurrences[0].pageId;
    const evid = ev(firstPage, x.evidenceText, "dom") ?? { pageId: firstPage, url: urlOf(firstPage), kind: "dom" as const, locator: x.kind };
    return {
      id: x.id, kind: x.kind, label: clip(role(x.id)?.label || prettyLabel(x.label), 80), targetPageId: x.targetPageId, targetUrl: x.targetUrl, siteWide: x.siteWide,
      occurrences: [...occ.values()].slice(0, 30).map((o) => ({
        ...o,
        bboxes: captures.filter((c) => c.pageId === o.pageId).flatMap((c) => c.assetBoxes.filter((b) => b.assetId === x.id && b.area === o.placement).map((b) => b.bbox)).slice(0, 2),
      })),
      fields: x.fields,
      observedOutcome: role(x.id)?.observedOutcome ?? (x.targetPageId ? `Opens ${bpPages.find((p) => p.id === x.targetPageId)?.title ?? "another page"}.` : undefined),
      status: "observed" as const, confidence: 0.95, evidence: [evid],
    };
  });
  const assetIds = new Set(conversionAssets.map((x) => x.id));
  const primaryCta = conversionAssets.find((x) => x.kind === "cta_link") ?? conversionAssets[0];

  // services & claims
  const services: Blueprint["services"] = (u?.services ?? []).filter((s) => !/\b(examples?|gallery|galleries|reviews?|testimonials?|faqs?|blog|advice|guides?|before and after|portfolio|projects?)\b/i.test(s.label)).map((s, i) => ({
    id: `svc-${slug(s.label, 40)}-${i}`, label: clip(s.label, 60), dimension: s.dimension, scope: s.scope,
    supportedInV1: s.dimension === "region" ? true : s.scope !== "commercial" && SUPPORTED_SCOPE_RE.test(s.label) && !UNSUPPORTED_SCOPE_RE.test(s.label),
    pageIds: s.pageIds.filter((p) => pageById.has(p)),
  }));
  const businessClaims: Blueprint["businessClaims"] = [];
  (u?.claims ?? []).forEach((c, i) => {
    const verified = c.evidence.map((e) => ev(e.pageId, e.quote)).filter(Boolean) as Evidence[];
    const cited = c.evidence.find((e) => pageById.has(e.pageId));
    if (!verified.length && !cited) return;
    const evidence: Evidence[] = verified.length ? verified : [{ pageId: cited!.pageId, url: urlOf(cited!.pageId), kind: "derived" }];
    businessClaims.push({
      id: `c-${slug(c.label, 40)}-${i}`, topic: c.topic, label: clip(c.label, 60), value: clip(c.value, 200), critical: c.critical,
      verification: c.topic === "license" || c.topic === "warranty" ? "website_claim_unverified" : "not_applicable",
      status: verified.length && c.status === "observed" ? "observed" : "inferred",
      confidence: verified.length ? 0.9 : 0.6, evidence,
    });
  });

  // strategy, coverage, journeys
  const fallbackEvidence: Evidence[] = primaryCta ? primaryCta.evidence : [{ pageId: pages[0].id, url: pages[0].url, kind: "derived" }];
  const stratEvidence = (u?.conversionStrategy.evidence ?? []).map((e) => ev(e.pageId, e.quote)).filter(Boolean) as Evidence[];
  const conversionStrategy: Blueprint["conversionStrategy"] = u
    ? { value: u.conversionStrategy.value, label: clip(u.conversionStrategy.label, 60), status: "inferred", confidence: stratEvidence.length ? 0.85 : 0.6, evidence: stratEvidence.length ? stratEvidence : fallbackEvidence }
    : { value: "unknown", label: "Not analysed yet", status: "suggested", confidence: 0.2, evidence: [] };
  const coverage: Blueprint["coverage"] = (u?.coverage ?? []).map((c) => ({ capability: c.capability, level: c.level, note: clip(c.note, 200), assetIds: c.assetIds.filter((x) => assetIds.has(x)) }));

  const journeys: Blueprint["journeys"] = [];
  (u?.journeys ?? []).forEach((j, ji) => {
    const steps = j.steps.map((s, si) => ({
      id: `s${si + 1}`, label: clip(s.label, 60), kind: s.kind, pageIds: s.pageIds.filter((p) => pageById.has(p)),
      assetId: s.assetId && assetIds.has(s.assetId) ? s.assetId : undefined,
    })).filter((s) => s.kind !== "asset" || s.assetId);
    if (steps.length < 2) return;
    const evidence = steps.map((s) => s.assetId && conversionAssets.find((x) => x.id === s.assetId)?.evidence[0]).filter(Boolean) as Evidence[];
    journeys.push({ id: `j-${ji + 1}`, label: clip(j.label, 50), primary: j.primary && !journeys.some((x) => x.primary), steps, evidence: evidence.length ? evidence.slice(0, 3) : fallbackEvidence });
  });
  if (!journeys.length && primaryCta) {
    journeys.push({
      id: "j-1", label: "Most visitors", primary: true, evidence: primaryCta.evidence,
      steps: [
        { id: "s1", label: "Website pages", kind: "pages", pageIds: pages.slice(0, 3).map((p) => p.id) },
        { id: "s2", label: primaryCta.label, kind: "asset", assetId: primaryCta.id, pageIds: [] },
        ...(primaryCta.targetPageId ? [{ id: "s3", label: bpPages.find((p) => p.id === primaryCta.targetPageId)?.title ?? "Contact", kind: "pages" as const, pageIds: [primaryCta.targetPageId] }] : []),
      ],
    });
  }
  if (!journeys.length) {
    journeys.push({ id: "j-1", label: "Website", primary: true, evidence: fallbackEvidence, steps: [{ id: "s1", label: "Homepage", kind: "pages", pageIds: [pages[0].id] }, { id: "s2", label: "No clear enquiry path found", kind: "outcome", pageIds: [] }] });
  }

  // gates + suggestions
  const commercialPageIds = new Set(pages.filter((p) => /commercial|strata|office|retail/i.test(p.path + " " + (meta(p.id)?.title ?? ""))).map((p) => p.id));
  const unsupportedServicePageIds = new Set(pages.filter((p) => UNSUPPORTED_SCOPE_RE.test(p.path) && !SUPPORTED_SCOPE_RE.test(p.path)).map((p) => p.id));
  const locationPageIds = new Set(pages.filter((p) => p.group === "location" || meta(p.id)?.pageType === "geo").map((p) => p.id));
  const calcIds = conversionAssets.filter((x) => x.kind === "calculator" || u?.assets.some((r) => r.assetId === x.id && r.isRealCalculator)).map((x) => x.id);
  const gated = applyGates(strategy?.suggestions ?? [], {
    hasRealCalculator: calcIds.length > 0, calculatorAssetIds: calcIds, commercialPageIds, unsupportedServicePageIds, locationPageIds,
    knownPageIds: new Set(pageById.keys()), knownAssetIds: assetIds, verifyQuote,
  });

  const sxIdByLabel = new Map<string, string>();
  const suggestedExperiences: Blueprint["suggestedExperiences"] = gated.suggestions.map((s, i) => {
    const sid = `sx-${slug(s.label, 36)}-${i + 1}`;
    sxIdByLabel.set(s.label.toLowerCase(), sid);
    return {
      id: sid, label: clip(s.label, 48), action: s.action,
      headline: clip(s.headline, 200), customerNeed: clip(s.customerNeed, 240), businessGoal: clip(s.businessGoal, 240),
      whatHappensNext: clip(s.whatHappensNext, 240), currentState: clip(s.currentState, 240), prerequisites: s.prerequisites.map((x) => clip(x, 220)),
      capabilityKeys: s.capabilityKeys,
      pageContexts: s.pageContexts.map((c) => ({ pageId: c.pageId, perspective: c.perspective ?? undefined, startingHook: clip(c.startingHook, 140) })),
      touchpoints: s.touchpoints.map((t, ti) => {
        const cap = captures.find((c) => c.pageId === t.pageId);
        let bboxes: Blueprint["suggestedExperiences"][number]["touchpoints"][number]["bboxes"] = [];
        if (t.sectionId) bboxes = cap?.sections.find((x) => x.id === t.sectionId)?.boxes ?? [];
        if (!bboxes.length && t.assetId && cap) {
          const boxes = cap.assetBoxes.filter((b) => b.assetId === t.assetId);
          const pick = (vp: "desktop" | "mobile") => boxes.filter((b) => b.bbox.viewport === vp).sort((x, y) => (x.area === "main" ? -1 : 1) - (y.area === "main" ? -1 : 1))[0]?.bbox;
          bboxes = [pick("desktop"), pick("mobile")].filter(Boolean) as typeof bboxes;
        }
        return { id: `tp-${i + 1}-${ti + 1}`, pageId: t.pageId, assetId: t.assetId ?? undefined, placementKind: t.placementKind, headline: clip(t.headline, 140), bboxes, positionVerified: bboxes.length > 0 };
      }),
      conversionTargetAssetId: s.conversionTargetAssetId ?? undefined,
      possibleProjectFields: s.projectFields.map((f) => ({ key: f.key, label: clip(f.label, 60), semantics: f.semantics, usage: f.usage })),
      evidence: s.evidence.map((e) => ev(e.pageId, e.quote)).filter(Boolean) as Evidence[],
      reasoning: s.reasoning.map((r) => clip(r, 240)),
      confidence: s.confidence,
      openQuestions: s.openQuestions.map((q) => clip(q, 220)),
    };
  });
  const sxByLabel = (label?: string | null) => (label ? sxIdByLabel.get(label.toLowerCase()) ?? [...sxIdByLabel.entries()].find(([k]) => k.includes(label.toLowerCase()) || label.toLowerCase().includes(k))?.[1] : undefined);

  const assetActions: Blueprint["assetActions"] = (strategy?.assetActions ?? [])
    .filter((x) => assetIds.has(x.assetId) && pageById.has(x.pageId))
    .map((x, i) => ({ id: `aa-${i + 1}`, assetId: x.assetId, pageId: x.pageId, proposal: x.proposal, rationale: clip(x.rationale, 240), relatedSuggestionId: sxByLabel(x.relatedSuggestion) }));

  const suggestedConnections: Blueprint["suggestedConnections"] = [];
  for (const c of strategy?.connections ?? []) {
    const from = sxByLabel(c.from);
    if (!from) continue;
    const toS = sxByLabel(c.toSuggestion);
    const toA = c.toAssetId && assetIds.has(c.toAssetId) ? c.toAssetId : undefined;
    if (!toS && !toA) continue;
    if (toS === from) continue;
    suggestedConnections.push({
      id: `cn-${suggestedConnections.length + 1}`, fromSuggestionId: from, to: toS ? { kind: "suggestion", id: toS } : { kind: "existing_asset", id: toA! },
      relation: toS ? (c.relation === "existing_destination" ? "suggested_continuation" : c.relation) : "existing_destination",
      intent: c.intent, possibleSharedFields: c.sharedFields.slice(0, 6), requiresValidation: true,
      integrationStatus: toS ? "concept_only" : "link_only", rationale: clip(c.rationale, 240), evidence: [],
    });
  }
  // every suggestion that names an existing target gets a visible destination link
  for (const s of suggestedExperiences) {
    if (s.conversionTargetAssetId && !suggestedConnections.some((c) => c.fromSuggestionId === s.id && c.to.kind === "existing_asset")) {
      suggestedConnections.push({ id: `cn-${suggestedConnections.length + 1}`, fromSuggestionId: s.id, to: { kind: "existing_asset", id: s.conversionTargetAssetId }, relation: "existing_destination", intent: "consult", possibleSharedFields: [], requiresValidation: true, integrationStatus: "link_only", rationale: clip(s.whatHappensNext, 240), evidence: [] });
    }
  }

  const unsupportedOpportunities: Blueprint["unsupportedOpportunities"] = [...(strategy?.opportunities ?? []), ...gated.opportunities]
    .filter((o, i, arr) => arr.findIndex((x) => x.label.toLowerCase() === o.label.toLowerCase()) === i)
    .slice(0, 6).map((o, i) => ({ id: `op-${i + 1}`, label: clip(o.label, 60), reason: o.reason, note: clip(o.note, 240), evidence: [] }));
  const gateDecisions: Blueprint["gateDecisions"] = [
    ...(calcIds.length ? [{ rule: "N-02", label: "No second cost calculator", note: "Your website already has a working calculator — we build around it, not next to it." }] : []),
    ...gated.decisions,
    ...(strategy?.notSuggested ?? []).map((n) => ({ rule: "LLM", label: n.label, note: n.note })),
  ].filter((g, i, arr) => arr.findIndex((x) => x.label.toLowerCase() === g.label.toLowerCase()) === i)
    .slice(0, 6).map((g, i) => ({ id: `g-${i + 1}`, rule: g.rule, label: clip(g.label, 80), note: clip(g.note, 240), evidence: [] }));

  // diagnostics + run metrics
  const limitations = [...a.warnings];
  if (strategy?.keepAsIs && strategy.keepAsIsReason) limitations.unshift(`Keep what you have: ${strategy.keepAsIsReason}`);
  const robotsSkipped = st.skipped.filter((s) => s.reason === "robots.txt").length;
  if (robotsSkipped) limitations.push(`${robotsSkipped} page${robotsSkipped > 1 ? "s were" : " was"} skipped because robots.txt asks tools not to read ${robotsSkipped > 1 ? "them" : "it"}.`);
  const failed = st.skipped.filter((s) => s.reason !== "robots.txt");
  if (failed.length) limitations.push(`${failed.length} page${failed.length > 1 ? "s" : ""} couldn't be read (${[...new Set(failed.map((f) => f.reason))].slice(0, 2).join(", ")}).`);

  const homeName = u?.business.name ?? pages[0].digest.title.split(/[|–-]/)[0].trim() ?? st.rootHost;
  const summary = u?.business.summary ?? `We read ${pages.length} pages of ${st.rootHost}.`;
  const now = new Date().toISOString();
  return {
    schemaVersion: BLUEPRINT_SCHEMA_VERSION,
    scanId: job.scanId,
    snapshotVersion: `scan-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}`,
    source: { kind: "scan", label: "Live scan", note: `Read-only analysis of ${st.rootHost} on ${now.slice(0, 10)}.` },
    website: { url: st.homeUrl, businessName: clip(homeName, 80), summary: clip(summary, 240) },
    analysis: { startedAt: new Date(a.t0).toISOString(), finishedAt: now, provider: a.usage.provider ? `iaedu → ${a.usage.provider}` : "iaedu", model: a.usage.model || (a.usage.calls ? "gpt-5.5" : "none"), promptVersion: PROMPT_VERSION },
    pages: bpPages, pageGroups, services, businessClaims, conversionAssets, conversionStrategy, coverage, journeys,
    suggestedExperiences, assetActions, suggestedConnections, unsupportedOpportunities, gateDecisions,
    visitorDecisions: (u?.visitorDecisions ?? []).map((v) => ({ decision: clip(v.decision, 160), pageIds: v.pageIds.filter((p) => pageById.has(p)), coverage: v.coverage })),
    diagnostics: { scannedPageCount: pages.length, skippedPageCount: Math.max(0, st.candidates.size - pages.length), limitations },
    run: {
      durationMs: Date.now() - a.t0, discoveredUrls: st.candidates.size, fetchedPages: [...st.candidates.values()].filter((c) => c.html).length,
      httpRequests: a.stats.requests, httpCacheHits: a.stats.cacheHits, renderedPages: st.renderedCount, capturedPages: captures.filter((c) => c.shots.length).length,
      llmCalls: a.usage.calls, llmCacheHits: a.usage.cacheHits, inputTokens: a.usage.inputTokens, outputTokens: a.usage.outputTokens, tokensEstimated: a.usage.tokensEstimated,
      networkMode, warnings: [...a.warnings, ...a.usage.failures].slice(0, 10),
    },
  };
}

export const scanShotPath = (scanId: string, file: string) => path.join(scanDir(scanId), "shots", file);
