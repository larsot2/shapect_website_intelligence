#!/usr/bin/env node
/**
 * Fixture builder (S1). Renders the FICTIONAL demo website in fixtures/demo-site
 * with Playwright, takes desktop + mobile screenshots, measures the real
 * bounding boxes of CTAs (data-shapect-asset) and suggestion anchors
 * (data-shapect-anchor), collects page text, and writes the final blueprint:
 *
 *   fixtures/blueprints/northwind.source.json   (hand-authored analysis)
 *   → public/fixtures/northwind/*.jpg            (screenshots)
 *   → fixtures/blueprints/northwind.blueprint.json  (validated snapshot)
 *   → fixtures/blueprints/northwind.pagetext.json   (for quote verification)
 *
 * Only local file:// pages are opened — this is not the S2 crawler.
 */
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteDir = path.join(root, "fixtures/demo-site");
const outDir = path.join(root, "public/fixtures/northwind");
const srcFile = path.join(root, "fixtures/blueprints/northwind.source.json");
const outFile = path.join(root, "fixtures/blueprints/northwind.blueprint.json");
const textFile = path.join(root, "fixtures/blueprints/northwind.pagetext.json");

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const round = (n) => Math.round(n * 10) / 10;

const bp = JSON.parse(await readFile(srcFile, "utf8"));
await mkdir(outDir, { recursive: true });
const capturedAt = new Date().toISOString();
const measurements = {}; // pageId -> viewport -> { assets: [{asset, placement, bbox}], anchors: {name: bbox} }
const pageText = {};

const browser = await chromium.launch();
try {
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
    const page = await ctx.newPage();
    for (const p of bp.pages) {
      await page.goto(pathToFileURL(path.join(siteDir, p.fixtureFile)).href, { waitUntil: "load" });
      const m = await page.evaluate(() => {
        const box = (el) => {
          const r = el.getBoundingClientRect();
          return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
        };
        const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        return {
          height: document.documentElement.scrollHeight,
          text: document.body.innerText,
          assets: [...document.querySelectorAll("[data-shapect-asset]")].filter(visible).map((el) => ({
            asset: el.dataset.shapectAsset,
            placement: el.dataset.shapectPlacement || (el.closest("footer") ? "footer" : el.closest("header") ? "header" : "main"),
            bbox: box(el),
          })),
          anchors: Object.fromEntries([...document.querySelectorAll("[data-shapect-anchor]")].filter(visible).map((el) => [el.dataset.shapectAnchor, box(el)])),
        };
      });
      if (vpName === "desktop") pageText[p.id] = m.text;
      (measurements[p.id] ??= {})[vpName] = m;
      if (!p.skipScreenshot) {
        const file = `${p.id}-${vpName}.jpg`;
        await page.screenshot({ path: path.join(outDir, file), fullPage: true, type: "jpeg", quality: 82 });
        p.screenshots = [...(p.screenshots ?? []), { viewport: vpName, src: `/fixtures/northwind/${file}`, width: vp.width, height: m.height, capturedAt }];
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

const toBBox = (b, viewport) => ({ x: round(b.x), y: round(b.y), width: round(b.width), height: round(b.height), viewport });

// Merge measured geometry into the blueprint.
for (const a of bp.conversionAssets) {
  for (const o of a.occurrences) {
    o.bboxes = [];
    for (const vp of Object.keys(VIEWPORTS)) {
      const hit = measurements[o.pageId]?.[vp]?.assets.find((x) => x.asset === a.id && x.placement === o.placement);
      if (hit) o.bboxes.push(toBBox(hit.bbox, vp));
    }
  }
}
for (const s of bp.suggestedExperiences) {
  for (const t of s.touchpoints) {
    t.bboxes = [];
    for (const vp of Object.keys(VIEWPORTS)) {
      const m = measurements[t.pageId]?.[vp];
      const b = t.measureAnchor ? m?.anchors[t.measureAnchor] : t.measureAsset ? m?.assets.find((x) => x.asset === t.measureAsset)?.bbox : undefined;
      if (b) t.bboxes.push(toBBox(b, vp));
    }
    t.positionVerified = t.bboxes.length > 0;
    delete t.measureAnchor;
    delete t.measureAsset;
  }
}
for (const p of bp.pages) {
  delete p.fixtureFile;
  delete p.skipScreenshot;
}

await writeFile(outFile, JSON.stringify(bp, null, 2) + "\n");
await writeFile(textFile, JSON.stringify(pageText, null, 2) + "\n");
const shots = bp.pages.reduce((n, p) => n + (p.screenshots?.length ?? 0), 0);
console.log(`wrote ${path.relative(root, outFile)} (${shots} screenshots in ${path.relative(root, outDir)})`);
