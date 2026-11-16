/**
 * Analyzer budgets and switches. Everything here is overridable via env so a
 * scan's cost profile can be tuned without code changes.
 */
const num = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

export const config = {
  userAgent: "Mozilla/5.0 (compatible; ShapectAnalyzer/0.2)",
  // ---- crawl
  maxDiscoveredUrls: num("ANALYZER_MAX_DISCOVERED", 400),
  maxSitemapUrls: num("ANALYZER_MAX_SITEMAP_URLS", 600),
  maxLightFetches: num("ANALYZER_MAX_LIGHT_FETCHES", 28), // Stage B: title/headings of top candidates
  deepPagesTarget: num("ANALYZER_DEEP_TARGET", 12), // Stage C: typical
  deepPagesMax: num("ANALYZER_DEEP_MAX", 18), // hard cap incl. follow-ups
  followUpMax: num("ANALYZER_FOLLOWUP_MAX", 4),
  perHostConcurrency: 2,
  minDelayMs: num("ANALYZER_MIN_DELAY_MS", 250),
  requestTimeoutMs: num("ANALYZER_TIMEOUT_MS", 15_000),
  maxBytes: num("ANALYZER_MAX_BYTES", 3_000_000),
  maxRedirects: 5,
  scanDeadlineMs: num("ANALYZER_DEADLINE_MS", 6 * 60_000),
  // ---- render / capture
  capturePages: num("ANALYZER_CAPTURE_PAGES", 5),
  captureMaxHeight: { desktop: 7_000, mobile: 11_000 },
  renderFallbackMinChars: 350, // render with a browser when static HTML has less main text
  // ---- llm
  llmMaxInputChars: num("ANALYZER_LLM_MAX_INPUT_CHARS", 50_000), // per call (~12k tokens)
  llmTimeoutMs: num("ANALYZER_LLM_TIMEOUT_MS", 240_000),
  // ---- storage
  dataDir: process.env.ANALYZER_DATA_DIR ?? "data",
  retentionDays: num("ANALYZER_RETENTION_DAYS", 30), // scans + screenshots are deleted after this
  httpCacheTtlMs: num("ANALYZER_HTTP_CACHE_TTL_MS", 12 * 3600_000),
};

export const PROMPT_VERSION = "wia-prompts-2026-11-16.2";
