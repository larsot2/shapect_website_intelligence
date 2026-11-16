/** Deterministic URL normalisation and filtering — no LLM involved. */

const TRACKING = /^(utm_|gclid|fbclid|msclkid|mc_|_ga|ref$|source$|hsa_)/i;
const NON_PAGE_EXT = /\.(jpe?g|png|gif|webp|avif|svg|ico|pdf|docx?|xlsx?|pptx?|zip|rar|mp4|mov|webm|mp3|wav|css|js|json|xml|txt|woff2?|ttf|eot)$/i;
const JUNK_PATH = /(\/wp-(admin|login|json|includes|content)\b|\/feed\/?$|\/(cart|checkout|my-account|account|login|signin|sign-in|register|logout)\b|\/xmlrpc|\/cdn-cgi\/|\/(tag|author|category)\/|\/page\/\d+|\/amp\/?$|\?replytocom=|\/comments?\/|\/search\b|\/privacy|\/terms|\/cookie|\/disclaimer|\/sitemap)/i;

export const siteKey = (host: string) => host.toLowerCase().replace(/^www\./, "");

export function normalizeUrl(href: string, base: string | URL): string | null {
  let u: URL;
  try {
    u = new URL(href.trim(), base);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  u.username = "";
  u.password = "";
  u.hostname = u.hostname.toLowerCase();
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  u.search = u.searchParams.toString() ? `?${u.searchParams.toString()}` : "";
  let p = u.pathname.replace(/\/{2,}/g, "/").replace(/\/(index|default)\.(html?|php|aspx?)$/i, "/");
  if (p.length > 1) p = p.replace(/\/+$/, "");
  u.pathname = p || "/";
  return u.href;
}

export function isSameSite(url: string, rootHost: string): boolean {
  try {
    return siteKey(new URL(url).hostname) === siteKey(rootHost);
  } catch {
    return false;
  }
}

/** Key that treats http/https and www/non-www variants as the same page. */
export const dedupeKey = (url: string) => {
  const u = new URL(url);
  return `${siteKey(u.hostname)}${u.pathname}${u.search}`.toLowerCase();
};

export function isCrawlablePage(url: string): boolean {
  const u = new URL(url);
  if (NON_PAGE_EXT.test(u.pathname)) return false;
  if (JUNK_PATH.test(u.pathname + u.search)) return false;
  if (u.search.length > 60) return false;
  return true;
}

export const pathOf = (url: string) => {
  const u = new URL(url);
  return (u.pathname + u.search) || "/";
};

export const slugTokens = (url: string) =>
  new URL(url).pathname.toLowerCase().split(/[\/\-_.]+/).filter((t) => t && !/^(html?|php|aspx?)$/.test(t));
