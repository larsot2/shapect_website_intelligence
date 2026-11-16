/**
 * Stage A–C + inventory + captures, producing a serialisable `Collected`
 * package. The LLM stages only ever see this package, so the same frozen
 * input can be re-analysed (evaluation, prompt changes) without re-crawling.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { discover, followUpCandidates, inspect, selectPages, type CrawlState } from "./crawl";
import { assignPageIds, buildInventory, type InvAsset, type SitePage } from "./inventory";
import { capturePages, type PageCapture } from "./capture";
import type { Cluster } from "./classify";
import { politeFetch, type FetchStats } from "./net/fetcher";
import { extractBlocks, extractSignals, type PageDigest } from "./extract";
import { dedupeKey } from "./urls";

export interface Collected {
  version: 1;
  collectedAt: string;
  startUrl: string;
  homeUrl: string;
  rootHost: string;
  pages: SitePage[];
  assets: InvAsset[];
  clusters: Cluster[];
  candidateCount: number;
  fetchedCount: number;
  renderedCount: number;
  skipped: { url: string; reason: string }[];
  /** not read in detail — summarised for the LLM */
  notRead: string;
  /** candidates the LLM may ask for (F1…) */
  followUps: { id: string; url: string; label: string; group: string }[];
  /** potentially important pages we did not read closely (shown to the owner) */
  importantUninspected: { url: string; label: string; group: string; reason: string }[];
  captures: PageCapture[];
  stats: { requests: number; cacheHits: number; bytes: number };
}

export interface CollectHooks {
  log: (line: string) => void;
  counts: (c: { found?: number; selected?: number; read?: number; captured?: number }) => void;
  scanDir: string;
}

export async function collectSite(url: string, stats: FetchStats, hooks: CollectHooks): Promise<{ collected: Collected; st: CrawlState; captureTask: Promise<void> }> {
  const st = await discover(url, stats, (p) => {
    if (p.detail?.pages) hooks.counts({ found: p.detail.pages });
    hooks.log(p.message + (p.detail?.pages ? ` · ${p.detail.pages} pages found` : ""));
  });
  await selectPages(st, (p) => {
    hooks.counts({ found: p.detail?.found, selected: p.detail?.selected });
    hooks.log(p.message + (p.detail?.selected ? ` · ${p.detail.selected} of ${p.detail.found}` : ""));
  });
  await inspect(st, st.selected, (p) => hooks.counts({ read: p.detail?.read }));
  const pages = toSitePages(st);
  if (!pages.length) throw new Error("We couldn't read any page of this website.");
  const assets = buildInventory(pages);
  const collected: Collected = {
    version: 1,
    collectedAt: new Date().toISOString(),
    startUrl: st.startUrl,
    homeUrl: st.homeUrl,
    rootHost: st.rootHost,
    pages,
    assets,
    clusters: st.clusters,
    candidateCount: st.candidates.size,
    fetchedCount: [...st.candidates.values()].filter((c) => c.html).length,
    renderedCount: st.renderedCount,
    skipped: st.skipped,
    notRead: notReadSummary(st),
    followUps: followUpCandidates(st, 24).map((f, i) => ({ id: `F${i + 1}`, url: f.url, label: f.label, group: f.group })),
    importantUninspected: importantUninspected(st),
    captures: [],
    stats: { requests: stats.requests, cacheHits: stats.cacheHits, bytes: stats.bytes },
  };
  // screenshots run in parallel with the first LLM call
  const captureTask = capturePages(hooks.scanDir, pickCapturePages(pages, assets), assets, (_pid, i) => hooks.counts({ captured: Math.floor(i / 2) }))
    .then((c) => { collected.captures = c; })
    .catch((e) => { collected.captures = []; hooks.log(`Screenshots failed (${(e as Error).message.slice(0, 120)})`); });
  return { collected, st, captureTask };
}

/** Read extra pages (follow-up requests) into a Collected package — works on frozen input via the HTTP cache. */
export async function addPages(c: Collected, urls: string[], stats: FetchStats): Promise<SitePage[]> {
  const digests: { key: string; digest: PageDigest; group: string }[] = [];
  for (const url of urls) {
    try {
      const r = await politeFetch(url, stats, { accept: "html" });
      if (r.status !== 200 || !r.body) continue;
      const sg = extractSignals(r.body, url);
      const { $, ...signals } = sg;
      digests.push({ key: dedupeKey(url), digest: { url, ...signals, blocks: extractBlocks($) }, group: c.followUps.find((f) => f.url === url)?.group ?? "other" });
    } catch {
      /* skip */
    }
  }
  const all = assignPageIds([...c.pages.map((p) => ({ key: p.key, digest: p.digest, group: p.group })), ...digests.filter((d) => !c.pages.some((p) => p.key === d.key))]);
  c.pages = all;
  c.assets = buildInventory(all);
  return all.filter((p) => digests.some((d) => d.key === p.key));
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

const IMPORTANT_GROUPS = new Set(["calculator", "pricing", "quote", "booking", "service", "commercial", "design", "faq"]);
function importantUninspected(st: CrawlState) {
  const readPaths = [...st.digests.values()].map((d) => new URL(d.url).pathname.replace(/\/$/, ""));
  // a child of a page we read (e.g. /apartment-renovations/randwick) is an area variant, not a missed topic
  const isChildOfRead = (u: string) => { const p = new URL(u).pathname.replace(/\/$/, ""); return readPaths.some((r) => r.length > 1 && p.startsWith(r + "/")); };
  return [...st.candidates.values()]
    .filter((c) => !st.digests.has(dedupeKey(c.url)) && IMPORTANT_GROUPS.has(c.group) && !c.clusterId && !c.fetchError && c.group !== "location" && !isChildOfRead(c.url))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((c) => ({ url: c.url, label: c.signals?.title || c.texts[0] || c.url, group: c.group, reason: "Possibly relevant, not read closely (page budget)" }));
}

export function pickCapturePages(pages: SitePage[], assets: InvAsset[]): SitePage[] {
  const primary = assets.find((a) => a.kind === "cta_link" && a.targetPageId);
  const out: SitePage[] = [pages[0]];
  const push = (p?: SitePage) => { if (p && !out.includes(p) && out.length < config.capturePages) out.push(p); };
  push(pages.find((p) => p.id === primary?.targetPageId));
  for (const groups of [["calculator"], ["pricing"], ["service"], ["design", "projects"], ["quote", "booking", "contact"], ["advice", "faq"], ["commercial"]]) {
    push(pages.find((p) => !out.includes(p) && groups.includes(p.group)));
  }
  for (const p of pages) push(p);
  return out;
}

// ---------------------------------------------------------------- frozen inputs (evaluation)

const frozenDir = () => path.join(config.dataDir, "frozen", process.env.FROZEN_SET ?? "v1");
export const frozenName = (host: string) => host.replace(/^www\./, "").replace(/[^a-z0-9]+/gi, "-");

export async function freeze(c: Collected, scanDir: string) {
  const dir = path.join(frozenDir(), frozenName(c.rootHost));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "collected.json"), JSON.stringify(c));
  await fs.cp(path.join(scanDir, "shots"), path.join(dir, "shots"), { recursive: true }).catch(() => {});
}

export async function loadFrozen(name: string): Promise<{ collected: Collected; shotsDir: string }> {
  const dir = path.join(frozenDir(), name);
  return { collected: JSON.parse(await fs.readFile(path.join(dir, "collected.json"), "utf8")), shotsDir: path.join(dir, "shots") };
}
