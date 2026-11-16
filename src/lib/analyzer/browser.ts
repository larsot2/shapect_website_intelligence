/**
 * Shared headless browser for JS fallback rendering and captures. Read-only:
 * every request is checked against the SSRF rules, and non-GET requests
 * (form posts, beacons) are aborted, so nothing is ever submitted.
 */
import { createRequire } from "node:module";
import type { Browser, BrowserContext, Page } from "playwright";
import { config } from "./config";
import { assertPublicHttpUrl } from "./net/ssrf";

const require = createRequire(import.meta.url);

let browserPromise: Promise<Browser> | null = null;

export function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    const { chromium } = require("playwright") as typeof import("playwright");
    const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
    browserPromise = chromium.launch({ proxy: proxy ? { server: proxy } : undefined }).catch((e) => {
      browserPromise = null;
      throw e;
    });
  }
  return browserPromise;
}

export async function closeBrowser() {
  if (!browserPromise) return;
  const b = await browserPromise.catch(() => null);
  browserPromise = null;
  await b?.close().catch(() => {});
}

export async function newSafeContext(viewport: "desktop" | "mobile"): Promise<BrowserContext> {
  const browser = await getBrowser();
  const ctx = await browser.newContext(
    viewport === "desktop"
      ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, userAgent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 ShapectAnalyzer/0.2` }
      : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: `Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 ShapectAnalyzer/0.2` },
  );
  // esbuild/tsx may wrap functions with __name(); make that a no-op inside pages.
  await ctx.addInitScript("window.__name = window.__name || ((f) => f);");
  await ctx.route("**/*", (route) => {
    const req = route.request();
    if (!["GET", "HEAD"].includes(req.method())) return route.abort();
    const url = req.url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
    try {
      assertPublicHttpUrl(url);
    } catch {
      return route.abort();
    }
    if (["media", "websocket", "eventsource"].includes(req.resourceType())) return route.abort();
    return route.continue();
  });
  return ctx;
}

/** Open a page and give lazy content a chance to load (scroll through once). */
export async function openAndSettle(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
  await page.evaluate(async () => {
    const step = Math.max(400, window.innerHeight * 0.8);
    for (let y = 0; y < Math.min(document.body.scrollHeight, 14000); y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 90));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => {});
  await page.waitForTimeout(300);
}

export async function renderHtml(url: string): Promise<string> {
  const ctx = await newSafeContext("desktop");
  try {
    const page = await ctx.newPage();
    await openAndSettle(page, url);
    return await page.content();
  } finally {
    await ctx.close();
  }
}
