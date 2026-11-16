/**
 * Stage A (discovery), Stage B (selection) and Stage C (deep inspection).
 * Heuristics only — no LLM. Budgets come from config.
 */
import { config } from "./config";
import { classifyHeuristic, detectClusters, GROUP_WEIGHT, type Cluster, type PageGroup } from "./classify";
import { extractBlocks, extractSignals, removeSiteWideBlocks, type PageDigest, type PageSignals } from "./extract";
import { politeFetch, type FetchStats } from "./net/fetcher";
import { assertPublicHttpUrl } from "./net/ssrf";
import { allowAll, parseRobots, type Robots } from "./robots";
import { renderHtml } from "./browser";
import { dedupeKey, isCrawlablePage, isSameSite, normalizeUrl } from "./urls";

export interface Candidate {
  url: string;
  texts: string[];
  areas: Set<string>;
  inlinks: number;
  ctaLinked: boolean;
  fromSitemap: boolean;
  group: PageGroup;
  clusterId?: string;
  score: number;
  signals?: PageSignals;
  html?: string;
  rendered?: boolean;
  fetchError?: string;
}

export interface CrawlState {
  startUrl: string;
  homeUrl: string;
  rootHost: string;
  robots: Robots;
  candidates: Map<string, Candidate>; // key: dedupeKey
  clusters: Cluster[];
  selected: string[]; // dedupe keys
  digests: Map<string, PageDigest>;
  skipped: { url: string; reason: string }[];
  stats: FetchStats;
  renderedCount: number;
  warnings: string[];
}

export type Progress = (p: { phase: "discover" | "select" | "inspect"; message: string; detail?: Record<string, number> }) => void;

export function normalizeStartUrl(input: string): URL {
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  const url = assertPublicHttpUrl(s);
  url.hash = "";
  return url;
}

function addCandidate(st: CrawlState, url: string, text: string, area: string, from: "home" | "page" | "sitemap", cta = false) {
  if (!isSameSite(url, st.rootHost) || !isCrawlablePage(url)) return;
  const u = new URL(url);
  if (!st.robots.isAllowed(u.pathname + u.search)) {
    if (!st.skipped.some((s) => s.url === url)) st.skipped.push({ url, reason: "robots.txt" });
    return;
  }
  const key = dedupeKey(url);
  let c = st.candidates.get(key);
  if (!c) {
    if (st.candidates.size >= config.maxDiscoveredUrls) return;
    c = { url, texts: [], areas: new Set(), inlinks: 0, ctaLinked: false, fromSitemap: false, group: "other", score: 0 };
    st.candidates.set(key, c);
  }
  if (from === "sitemap") c.fromSitemap = true;
  else c.inlinks++;
  if (text && !c.texts.includes(text) && c.texts.length < 6) c.texts.push(text);
  if (area) c.areas.add(area);
  if (cta) c.ctaLinked = true;
}

function absorbLinks(st: CrawlState, signals: PageSignals, from: "home" | "page") {
  const ctaHrefs = new Set(signals.ctas.filter((c) => c.kind === "internal").map((c) => c.href));
  for (const l of signals.links) addCandidate(st, l.url, l.text, from === "home" ? l.area : "page", from, ctaHrefs.has(l.url));
}

async function fetchHtml(st: CrawlState, url: string) {
  const r = await politeFetch(url, st.stats, { accept: "html" });
  if (r.status !== 200 || !r.body) throw new Error(`HTTP ${r.status}`);
  return r;
}

// ------------------------------------------------------------------ Stage A

async function readSitemaps(st: CrawlState, origin: string): Promise<string[]> {
  const queue = [...new Set([...st.robots.sitemaps, `${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/wp-sitemap.xml`])].slice(0, 5);
  const seen = new Set<string>();
  const urls: string[] = [];
  let fetched = 0;
  while (queue.length && fetched < 8 && urls.length < config.maxSitemapUrls) {
    const sm = queue.shift()!;
    if (seen.has(sm)) continue;
    seen.add(sm);
    try {
      assertPublicHttpUrl(sm);
      if (!isSameSite(sm, st.rootHost)) continue;
      fetched++;
      const r = await politeFetch(sm, st.stats, { accept: "xml" });
      if (r.status !== 200) continue;
      const locs = [...r.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, "&"));
      if (/<sitemapindex/i.test(r.body)) {
        // prefer page/post sitemaps; skip images/products/taxonomies
        const children = locs.filter((l) => !/image|product|tag|category|author|attachment|media/i.test(l));
        children.sort((a, b) => Number(/page/i.test(b)) - Number(/page/i.test(a)));
        queue.push(...children.slice(0, 6));
      } else {
        urls.push(...locs.slice(0, config.maxSitemapUrls - urls.length));
      }
      if (!/<sitemapindex/i.test(r.body) && urls.length) break; // one urlset is usually enough beyond index children
    } catch {
      /* missing sitemap is normal */
    }
  }
  return urls;
}

export async function discover(input: string, stats: FetchStats, onProgress: Progress): Promise<CrawlState> {
  const start = normalizeStartUrl(input);
  const st: CrawlState = {
    startUrl: start.href, homeUrl: start.href, rootHost: start.hostname, robots: allowAll,
    candidates: new Map(), clusters: [], selected: [], digests: new Map(), skipped: [], stats, renderedCount: 0, warnings: [],
  };
  onProgress({ phase: "discover", message: "Reading your homepage" });
  try {
    const rb = await politeFetch(`${start.origin}/robots.txt`, stats, { accept: "text" });
    if (rb.status === 200 && rb.body.length < 200_000 && !/<html/i.test(rb.body)) st.robots = parseRobots(rb.body);
  } catch {
    /* no robots.txt */
  }
  if (!st.robots.isAllowed(start.pathname)) throw new Error("This website's robots.txt doesn't allow automated reading of this page.");

  const home = await fetchHtml(st, start.href);
  st.homeUrl = normalizeUrl(home.url, home.url) ?? home.url;
  st.rootHost = new URL(home.url).hostname;
  let html = home.body;
  let signals = extractSignals(html, st.homeUrl);
  let rendered = false;
  if (signals.mainTextLength < config.renderFallbackMinChars || signals.links.length < 3) {
    html = await renderHtml(st.homeUrl);
    signals = extractSignals(html, st.homeUrl);
    rendered = true;
    st.renderedCount++;
  }
  const homeKey = dedupeKey(st.homeUrl);
  st.candidates.set(homeKey, { url: st.homeUrl, texts: ["Home"], areas: new Set(["home"]), inlinks: 99, ctaLinked: false, fromSitemap: false, group: "home", score: 1000, signals, html, rendered });
  absorbLinks(st, signals, "home");
  onProgress({ phase: "discover", message: "Looking at your navigation and sitemap", detail: { links: st.candidates.size } });

  const sitemapUrls = await readSitemaps(st, new URL(st.homeUrl).origin);
  for (const u of sitemapUrls) {
    const n = normalizeUrl(u, st.homeUrl);
    if (n) addCandidate(st, n, "", "", "sitemap");
  }
  st.clusters = detectClusters([...st.candidates.values()].map((c) => c.url).filter((u) => u !== st.homeUrl));
  for (const cl of st.clusters) for (const m of cl.members) {
    const c = st.candidates.get(dedupeKey(m));
    if (c) c.clusterId = cl.id;
  }
  for (const c of st.candidates.values()) if (c.group !== "home") c.group = classifyHeuristic(c.url, c.texts);
  for (const cl of st.clusters) if (cl.kind === "location") for (const m of cl.members) { const c = st.candidates.get(dedupeKey(m)); if (c && c.group === "service") c.group = "location"; }
  onProgress({ phase: "discover", message: "Found your pages", detail: { pages: st.candidates.size, groups: st.clusters.length, sitemap: sitemapUrls.length } });
  return st;
}

// ------------------------------------------------------------------ Stage B

function baseScore(st: CrawlState, c: Candidate): number {
  if (c.group === "home") return 1000;
  let s = GROUP_WEIGHT[c.group] * 2;
  if (c.areas.has("nav") || c.areas.has("header")) s += 6;
  if (c.areas.has("main")) s += 2;
  if (c.areas.has("footer")) s += 1;
  if (c.ctaLinked) s += 7;
  s += Math.min(c.inlinks, 8) * 0.6;
  if (c.fromSitemap && c.inlinks === 0) s -= 3;
  const depth = new URL(c.url).pathname.split("/").filter(Boolean).length;
  s -= Math.max(0, depth - 2) * 1.5;
  if (c.clusterId) s -= 6;
  return s;
}

function signalBonus(c: Candidate): number {
  const sg = c.signals;
  if (!sg) return 0;
  let s = 0;
  if (sg.forms.some((f) => f.looksLikeCalculator)) s += 14;
  if (sg.forms.some((f) => f.fields.length >= 4)) s += 5;
  if (sg.forms.some((f) => f.multiStep || f.hasUpload)) s += 4;
  if (sg.tools.some((t) => t.presence === "embedded" && (t.kind === "booking" || t.kind === "calculator" || t.kind === "design"))) s += 8;
  if (sg.priceMentions.length) s += 3 + Math.min(sg.priceMentions.length, 3);
  if (sg.mainTextLength > 2500) s += 2;
  if (/commercial|strata|office/i.test(sg.title + sg.h1.join(" "))) s += 3;
  return s;
}

const QUOTAS: Partial<Record<PageGroup, number>> = {
  service: 5, commercial: 2, pricing: 2, calculator: 2, quote: 2, contact: 1, booking: 1, design: 1,
  projects: 1, faq: 1, about: 1, advice: 1, reviews: 1, industry: 1, location: 1, blog: 1, other: 2,
};

export async function selectPages(st: CrawlState, onProgress: Progress): Promise<void> {
  for (const c of st.candidates.values()) c.score = baseScore(st, c);
  // Cluster representatives: the best-linked member of each cluster stays eligible.
  const reps = new Set<string>();
  for (const cl of st.clusters) {
    const members = cl.members.map((m) => st.candidates.get(dedupeKey(m))).filter(Boolean) as Candidate[];
    const best = members.sort((a, b) => b.inlinks - a.inlinks || a.url.length - b.url.length)[0];
    if (best && cl.kind !== "blog") reps.add(dedupeKey(best.url));
  }
  const eligible = [...st.candidates.entries()].filter(([k, c]) => c.group !== "home" && (!c.clusterId || reps.has(k)) && GROUP_WEIGHT[c.group] > -5);
  const light = eligible.sort((a, b) => b[1].score - a[1].score).slice(0, config.maxLightFetches);

  onProgress({ phase: "select", message: "Choosing the pages that matter", detail: { candidates: eligible.length, checking: light.length } });
  let done = 0;
  await Promise.all(light.map(async ([, c]) => {
    try {
      const r = await fetchHtml(st, c.url);
      c.html = r.body;
      c.signals = extractSignals(r.body, c.url);
      c.group = classifyHeuristic(c.url, c.texts, `${c.signals.title} ${c.signals.h1.join(" ")}`);
      if (c.clusterId && st.clusters.find((x) => x.id === c.clusterId)?.kind === "location") c.group = "location";
      absorbLinks(st, c.signals, "page"); // second-level discovery (e.g. quote page only linked from services)
    } catch (e) {
      c.fetchError = (e as Error).message;
      st.skipped.push({ url: c.url, reason: c.fetchError });
    }
    done++;
    if (done % 5 === 0) onProgress({ phase: "select", message: "Checking page titles and forms", detail: { checked: done, of: light.length } });
  }));

  // Newly found CTA targets (from second-level links) get one more chance.
  for (const c of st.candidates.values()) if (!c.signals && c.ctaLinked && !c.clusterId) c.score = baseScore(st, c) + 4;
  for (const c of st.candidates.values()) c.score = baseScore(st, c) + signalBonus(c);

  // Near-duplicate titles: keep the higher-scoring page.
  const titleSeen = new Map<string, Candidate>();
  for (const c of [...st.candidates.values()].sort((a, b) => b.score - a.score)) {
    const t = c.signals?.title.toLowerCase().replace(/\s*[|–-].*$/, "").trim();
    if (!t) continue;
    if (titleSeen.has(t)) c.score -= 20;
    else titleSeen.set(t, c);
  }

  const pool = [...st.candidates.entries()]
    .filter(([k, c]) => c.group !== "home" && !c.fetchError && (!c.clusterId || reps.has(k)) && GROUP_WEIGHT[c.group] > -5 && c.score > 0)
    .sort((a, b) => b[1].score - a[1].score);
  const target = Math.min(config.deepPagesMax, Math.max(6, Math.min(config.deepPagesTarget + Math.floor(Math.max(0, st.candidates.size - 60) / 40), config.deepPagesMax - config.followUpMax)));
  // Coverage + novelty selection: start with home + the primary conversion target,
  // then greedily add the page that brings the most NEW decision-relevant dimensions.
  const picked: string[] = [dedupeKey(st.homeUrl)];
  const covered = new Set<string>(coverageTags(st.candidates.get(dedupeKey(st.homeUrl))!, true));
  const used: Partial<Record<PageGroup, number>> = {};
  // A topic mentioned by a blog post, gallery or case study is NOT covered for the offer itself:
  // "/9-small-ensuite-ideas" must not stop us from reading "/small-bathroom-renovations".
  // members of a page family (case studies, suburb variants) are examples of an offer, not the offer
  const isOffer = (c: Candidate) => OFFER_GROUPS.has(c.group) && !c.clusterId && !ARTICLE_SLUG.test(new URL(c.url).pathname.replace(/[-_/]+/g, " "));
  const isTopic = (t: string) => TOPIC_PREFIXES.has(t.split(":")[0]);
  const cover = (c: Candidate) => coverageTags(c).forEach((t) => covered.add(isTopic(t) && !isOffer(c) ? `${t}@content` : t));
  const novelFor = (c: Candidate) => coverageTags(c).filter((t) => !covered.has(t) && (isOffer(c) || !isTopic(t) || !covered.has(`${t}@content`)));
  const ctaTarget = pool.find(([, c]) => c.ctaLinked && ["quote", "contact", "booking", "calculator"].includes(c.group));
  if (ctaTarget) { picked.push(ctaTarget[0]); cover(ctaTarget[1]); used[ctaTarget[1].group] = 1; }
  // the core service page (e.g. /bathroom-renovations) is always read — it defines the main offer
  const core = pool
    .filter(([k, c]) => !picked.includes(k) && c.group === "service" && /bathroom[- ]renovation/i.test(new URL(c.url).pathname) && new URL(c.url).pathname.split("/").filter(Boolean).length <= 2)
    .sort((a, b) => b[1].inlinks - a[1].inlinks || a[1].url.length - b[1].url.length)[0];
  if (core) { picked.push(core[0]); cover(core[1]); used.service = 1; }
  // FAQ and pricing pages carry business rules, exclusions and price references — read the best of each
  for (const g of ["faq", "pricing"] as PageGroup[]) {
    const best = pool.filter(([k, c]) => !picked.includes(k) && c.group === g).sort((a, b) => b[1].score - a[1].score)[0];
    if (best) { picked.push(best[0]); cover(best[1]); used[g] = 1; }
  }
  const homeTitle = st.candidates.get(dedupeKey(st.homeUrl))?.signals?.title?.trim().toLowerCase();
  const isHomeDuplicate = (c: Candidate) => /^\/(home|home-page|homepage|index)\/?$/i.test(new URL(c.url).pathname) || (!!homeTitle && c.signals?.title?.trim().toLowerCase() === homeTitle);
  // context-rich sites may read a few more pages, but only while each still adds a lot
  const stretch = Math.min(config.deepPagesMax - config.followUpMax, target + 2);
  while (picked.length < stretch) {
    let best: { k: string; c: Candidate; gain: number } | null = null;
    for (const [k, c] of pool) {
      if (picked.includes(k)) continue;
      if (isHomeDuplicate(c)) continue;
      if ((used[c.group] ?? 0) >= (QUOTAS[c.group] ?? 1) + 2) continue; // soft cap, novelty decides
      const novel = novelFor(c);
      const relevance = Math.max(0.15, Math.min(1, c.score / 30)) * (GROUP_RELEVANCE[c.group] ?? 0.6);
      const offerNovel = isOffer(c) && novel.some(isTopic);
      // another service page is no repetition when it shows an offer we haven't read yet
      const reusePenalty = offerNovel ? 0 : (used[c.group] ?? 0) * (c.group === "service" ? 2 : 6);
      // articles/galleries only hint at a topic; the offer page is the source
      const gain = novel.reduce((n, t) => n + tagWeight(t) * (isTopic(t) && !isOffer(c) ? 0.5 : 1), 0) * 10 * relevance + c.score * 0.25 - reusePenalty;
      if (!best || gain > best.gain) best = { k, c, gain };
    }
    if (!best || best.gain < 3 || (best.gain < 8 && picked.length >= 8)) break; // nothing new worth a deep read
    if (picked.length >= target && best.gain < 28) break;
    picked.push(best.k);
    cover(best.c);
    used[best.c.group] = (used[best.c.group] ?? 0) + 1;
  }
  st.selected = picked;
  onProgress({ phase: "select", message: "Selected pages to read closely", detail: { selected: picked.length, found: st.candidates.size } });
}

/** Decision-relevant dimensions a page covers (cheap: URL, link text, title, headings, signals). */
const TAG_WEIGHT: Record<string, number> = { prop: 3, persp: 2.5, svc: 2, conv: 3, tool: 3, info: 2, price: 2.5, seg: 3, design: 2.5, trust: 0.5, group: 1 };
const TAG_RULES: [string, RegExp][] = [
  ["prop:house", /\bhouses?\b|\bhome\b(?! renovations)/], ["prop:apartment", /\bapartments?\b|\bunits?\b/], ["prop:granny", /granny/], ["prop:townhouse", /townhouse/],
  ["svc:ensuite", /ensuite/], ["svc:laundry", /laundr/], ["svc:kitchen", /kitchen/], ["svc:waterproof", /waterproof/], ["svc:structural", /structural|extension/], ["svc:design_service", /designer|design service|design consult/],
  ["persp:small", /\bsmall\b|compact/], ["persp:luxury", /luxury|premium/], ["persp:budget", /budget|affordable/], ["persp:accessible", /accessib|disab|ndis|elderly/],
  ["seg:commercial", /commercial|strata|office|hospitality|retail/],
  ["design:design", /design|style|inspiration|gallery|before and after|ideas/], ["svc:bathroom", /bathroom renovation/],
  ["price", /cost|price|pricing|\$|package/], ["info:faq", /faq|question/], ["info:process", /process|how we work|what to expect/],
];
const TOPIC_PREFIXES = new Set(["prop", "persp", "svc", "seg", "design"]);
/** pages that describe an offer (service, segment, design service) — their topics count as "covered" */
const OFFER_GROUPS = new Set<PageGroup>(["service", "commercial", "design"]);
/** listicles, guides and comparisons are content even when filed under services/design */
const ARTICLE_SLUG = /(^| )\d+ |\b(ideas|tips|guide|signs|ways|how|why|what|which|vs|reasons|mistakes|examples|before and after)\b/;
const DECISION_GROUPS = new Set(["pricing", "calculator", "quote", "booking", "contact", "faq", "design", "projects", "service", "commercial"]);
/** group novelty only counts for decision-relevant page types (not blog indexes, about, other) */
const tagWeight = (t: string) => (t.startsWith("group:") ? (DECISION_GROUPS.has(t.slice(6)) ? 1 : 0) : TAG_WEIGHT[t.split(":")[0]] ?? 1);

/** Deterministic topic of a page (URL slug + H1) — used as context hints for the LLM. */
export function pageTopics(url: string, h1 = ""): string[] {
  const primary = `${new URL(url).pathname.replace(/[-_/]+/g, " ")} ${h1}`.toLowerCase();
  return TAG_RULES.filter(([t, re]) => TOPIC_PREFIXES.has(t.split(":")[0]) && t !== "svc:bathroom" && re.test(primary)).map(([t]) => t.split(":")[1]);
}
const GROUP_RELEVANCE: Partial<Record<PageGroup, number>> = { service: 1, commercial: 1, pricing: 1, calculator: 1, quote: 1, booking: 1, contact: 0.9, design: 0.85, projects: 0.8, faq: 0.9, about: 0.75, advice: 0.6, reviews: 0.6, blog: 0.45, location: 0.4, other: 0.45 };
function coverageTags(c: Candidate, isHome = false): string[] {
  const sg = c.signals;
  // topic tags only from what the page is ABOUT (url, link text, title, h1) — not from things it merely mentions
  // primary topic = URL slug + first H1; titles/link texts carry site-wide marketing words, so only as fallback
  const primary = `${new URL(c.url).pathname.replace(/[-_/]+/g, " ")} ${sg?.h1[0] ?? ""}`.toLowerCase();
  const hasTopic = TAG_RULES.some(([t, re]) => TOPIC_PREFIXES.has(t.split(":")[0]) && re.test(primary));
  const topic = hasTopic ? primary : `${primary} ${c.texts[0] ?? ""} ${(sg?.title ?? "").split(/[|–-]/)[0]}`.toLowerCase();
  const wide = `${topic} ${sg?.headings.slice(0, 10).map((h) => h.text).join(" ") ?? ""}`.toLowerCase();
  const tags = TAG_RULES.filter(([t, re]) => {
    const prefix = t.split(":")[0];
    if (TOPIC_PREFIXES.has(prefix)) return !isHome && re.test(topic);
    if (isHome && (prefix === "info" || prefix === "price")) return false; // the home page only mentions these
    return re.test(wide);
  }).map(([t]) => t);
  if (sg?.forms.some((f) => f.looksLikeCalculator) || sg?.tools.some((t) => t.kind === "calculator" && t.presence === "embedded")) tags.push("tool:calculator");
  if (sg?.tools.some((t) => t.kind === "booking" && t.presence === "embedded")) tags.push("tool:booking");
  if (sg?.forms.some((f) => f.multiStep)) tags.push("conv:multistep");
  if (sg?.forms.some((f) => f.hasUpload)) tags.push("conv:upload");
  if (sg?.forms.some((f) => f.fields.length >= 4)) tags.push("conv:form");
  if (sg?.priceMentions.length) tags.push("price:mentions");
  tags.push(`group:${c.group}`);
  return tags;
}

// ------------------------------------------------------------------ Stage C

export async function inspect(st: CrawlState, keys: string[], onProgress: Progress): Promise<void> {
  let done = 0;
  await Promise.all(keys.map(async (k) => {
    const c = st.candidates.get(k);
    if (!c || st.digests.has(k)) return;
    try {
      if (!c.html) {
        const r = await fetchHtml(st, c.url);
        c.html = r.body;
      }
      let sg = extractSignals(c.html, c.url);
      if (!c.rendered && sg.mainTextLength < config.renderFallbackMinChars) {
        c.html = await renderHtml(c.url);
        c.rendered = true;
        st.renderedCount++;
        sg = extractSignals(c.html, c.url);
      }
      c.signals = sg;
      const { $, ...signals } = sg;
      st.digests.set(k, { url: c.url, ...signals, blocks: extractBlocks($) });
    } catch (e) {
      c.fetchError = (e as Error).message;
      st.skipped.push({ url: c.url, reason: c.fetchError });
    }
    done++;
    onProgress({ phase: "inspect", message: "Reading pages closely", detail: { read: done, of: keys.length } });
  }));
  // Boilerplate removal across everything read so far (home first keeps the site-wide copy once).
  const ordered = [dedupeKey(st.homeUrl), ...[...st.digests.keys()].filter((k) => k !== dedupeKey(st.homeUrl))].map((k) => st.digests.get(k)!).filter(Boolean);
  removeSiteWideBlocks(ordered);
}

/** Candidate list (not yet read) the LLM may request as follow-ups. */
export function followUpCandidates(st: CrawlState, limit = 30) {
  return [...st.candidates.entries()]
    .filter(([k, c]) => !st.digests.has(k) && !c.fetchError && c.group !== "legal" && c.group !== "careers")
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit)
    .map(([k, c]) => ({ key: k, url: c.url, label: c.signals?.title || c.texts[0] || "", group: c.group }));
}
