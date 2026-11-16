/**
 * Polite, SSRF-safe HTTP fetcher with per-host concurrency, backoff, size/type
 * limits and a small disk cache.
 *
 * Two network modes:
 *  - direct (default in production): undici Agent whose connect-time DNS lookup
 *    refuses private/reserved addresses → covers redirects and DNS rebinding.
 *  - proxied (HTTPS_PROXY set, e.g. sandboxed dev): DNS happens at the egress
 *    proxy; every hop is still checked syntactically (scheme, port, local names,
 *    IP literals) and, when local DNS can resolve the host, by address.
 */
import { Agent, ProxyAgent, fetch as undiciFetch, type Dispatcher } from "undici";
import crypto from "node:crypto";
import dns from "node:dns";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config";
import { BlockedUrlError, assertPublicHttpUrl, isBlockedIp, safeLookup } from "./ssrf";

export interface FetchResult {
  url: string; // final URL after redirects
  status: number;
  contentType: string;
  body: string;
  fromCache: boolean;
  redirected: boolean;
}

export interface FetchStats {
  requests: number;
  cacheHits: number;
  bytes: number;
  errors: { url: string; message: string }[];
}

const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
let dispatcher: Dispatcher | undefined;
function getDispatcher(): Dispatcher {
  dispatcher ??= proxyUrl
    ? new ProxyAgent({ uri: proxyUrl })
    : new Agent({ connect: { lookup: safeLookup as never }, headersTimeout: config.requestTimeoutMs, bodyTimeout: config.requestTimeoutMs });
  return dispatcher;
}
export const networkMode = proxyUrl ? "proxied" : "direct";

async function checkHop(url: URL) {
  assertPublicHttpUrl(url.href);
  if (!proxyUrl) return; // direct mode: enforced at connect time by safeLookup
  try {
    const addrs = await dns.promises.lookup(url.hostname, { all: true });
    if (addrs.some((a) => isBlockedIp(a.address))) throw new BlockedUrlError(`Blocked address for ${url.hostname}`);
  } catch (e) {
    if (e instanceof BlockedUrlError) throw e;
    // local resolver can't see the host — resolution is delegated to the egress proxy
  }
}

// ---------------------------------------------------------------- per-host limiter

const hostState = new Map<string, { active: number; queue: (() => void)[]; last: number }>();
async function withHostSlot<T>(host: string, fn: () => Promise<T>): Promise<T> {
  const s = hostState.get(host) ?? { active: 0, queue: [], last: 0 };
  hostState.set(host, s);
  if (s.active >= config.perHostConcurrency) await new Promise<void>((r) => s.queue.push(r));
  s.active++;
  const wait = s.last + config.minDelayMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  s.last = Date.now();
  try {
    return await fn();
  } finally {
    s.active--;
    s.queue.shift()?.();
  }
}

// ---------------------------------------------------------------- cache

const cacheDir = () => path.join(config.dataDir, "cache", "http");
const cacheFile = (url: string) => path.join(cacheDir(), crypto.createHash("sha256").update(url).digest("hex").slice(0, 32) + ".json");

async function readCache(url: string): Promise<FetchResult | null> {
  try {
    const raw = JSON.parse(await fs.readFile(cacheFile(url), "utf8")) as FetchResult & { at: number };
    if (Date.now() - raw.at > config.httpCacheTtlMs) return null;
    return { ...raw, fromCache: true };
  } catch {
    return null;
  }
}
async function writeCache(url: string, r: FetchResult) {
  await fs.mkdir(cacheDir(), { recursive: true });
  await fs.writeFile(cacheFile(url), JSON.stringify({ ...r, at: Date.now() }));
}

// ---------------------------------------------------------------- fetch

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function politeFetch(
  rawUrl: string,
  stats: FetchStats,
  opts: { accept?: "html" | "xml" | "text"; useCache?: boolean } = {},
): Promise<FetchResult> {
  const accept = opts.accept ?? "html";
  if (opts.useCache !== false) {
    const hit = await readCache(rawUrl);
    if (hit) {
      stats.cacheHits++;
      return hit;
    }
  }
  let current = new URL(rawUrl);
  for (let hop = 0; hop <= config.maxRedirects; hop++) {
    await checkHop(current);
    const res = await withHostSlot(current.host, () => requestWithBackoff(current, accept, stats));
    if (res.status >= 300 && res.status < 400 && res.location) {
      current = new URL(res.location, current);
      continue;
    }
    const result: FetchResult = { url: current.href, status: res.status, contentType: res.contentType, body: res.body, fromCache: false, redirected: hop > 0 };
    if (res.status === 200 && opts.useCache !== false) await writeCache(rawUrl, result).catch(() => {});
    return result;
  }
  throw new Error("Too many redirects");
}

async function requestWithBackoff(url: URL, accept: string, stats: FetchStats) {
  for (let attempt = 0; ; attempt++) {
    const r = await requestOnce(url, accept, stats);
    if ((r.status === 429 || r.status === 503) && attempt < 2) {
      const retryAfter = Math.min(Number(r.retryAfter) || 2 ** attempt * 2, 10);
      await sleep(retryAfter * 1000);
      continue;
    }
    return r;
  }
}

async function requestOnce(url: URL, accept: string, stats: FetchStats) {
  stats.requests++;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.requestTimeoutMs);
  try {
    const res = await undiciFetch(url.href, {
      dispatcher: getDispatcher(),
      redirect: "manual",
      signal: ctrl.signal,
      headers: {
        "user-agent": config.userAgent,
        accept: accept === "xml" ? "application/xml,text/xml;q=0.9,*/*;q=0.5" : accept === "text" ? "text/plain,*/*;q=0.5" : "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        "accept-language": "en-AU,en;q=0.9",
      },
    });
    const contentType = res.headers.get("content-type") ?? "";
    const location = res.headers.get("location") ?? undefined;
    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel();
      return { status: res.status, contentType, body: "", location, retryAfter: null };
    }
    const okType =
      accept === "html" ? /html|xhtml/i.test(contentType) || contentType === "" :
      accept === "xml" ? /xml|text\/plain/i.test(contentType) || contentType === "" : true;
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (!okType || declared > config.maxBytes) {
      await res.body?.cancel();
      return { status: okType ? 413 : 415, contentType, body: "", location, retryAfter: null };
    }
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > config.maxBytes) {
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
    stats.bytes += size;
    return { status: res.status, contentType, body: Buffer.concat(chunks).toString("utf8"), location, retryAfter: res.headers.get("retry-after") };
  } finally {
    clearTimeout(timer);
  }
}

export const newFetchStats = (): FetchStats => ({ requests: 0, cacheHits: 0, bytes: 0, errors: [] });
