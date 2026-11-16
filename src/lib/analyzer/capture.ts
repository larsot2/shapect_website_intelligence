/**
 * Real browser captures for a few important pages: desktop + mobile
 * screenshots, measured CTA/form boxes and section boxes (for touchpoint
 * placement). Only selected pages are rendered — never every SEO page.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { newSafeContext, openAndSettle } from "./browser";
import type { InvAsset, SitePage } from "./inventory";

export type Vp = "desktop" | "mobile";
export interface Box { x: number; y: number; width: number; height: number; viewport: Vp }

export interface PageCapture {
  pageId: string;
  shots: { viewport: Vp; file: string; width: number; height: number; capturedAt: string }[];
  assetBoxes: { assetId: string; area: string; bbox: Box }[];
  sections: { id: string; heading: string; boxes: Box[] }[];
  /** visible text of the rendered page (desktop) — used to verify quotes */
  text: string;
  error?: string;
}

interface Target { assetId: string; kind: string; href?: string; text: string; hint?: string }

const round = (n: number) => Math.round(n * 10) / 10;

export async function capturePages(
  scanDir: string,
  pages: SitePage[],
  assets: InvAsset[],
  onPage: (pageId: string, i: number, total: number) => void,
): Promise<PageCapture[]> {
  const shotsDir = path.join(scanDir, "shots");
  await fs.mkdir(shotsDir, { recursive: true });
  const results: PageCapture[] = pages.map((p) => ({ pageId: p.id, shots: [], assetBoxes: [], sections: [], text: "" }));
  for (const vp of ["desktop", "mobile"] as Vp[]) {
    const ctx = await newSafeContext(vp);
    try {
      for (const [i, p] of pages.entries()) {
        onPage(p.id, i + (vp === "mobile" ? pages.length : 0), pages.length * 2);
        const res = results[i];
        const targets: Target[] = assets
          .filter((a) => a.occurrences.some((o) => o.pageId === p.id))
          .map((a) => ({
            assetId: a.id, kind: a.kind, href: a.targetUrl, text: a.occurrences.find((o) => o.pageId === p.id)?.text ?? a.label,
            hint: a.provider === "Interactive calculator" ? "[class*='calc'], [id*='calc'], [class*='estimat'], [id*='estimat'], [class*='configurator']" : a.kind === "booking" || a.kind === "calculator" ? "iframe" : undefined,
          }));
        const page = await ctx.newPage();
        try {
          await openAndSettle(page, p.url);
          const m = await page.evaluate(measureInPage, { targets, maxH: config.captureMaxHeight[vp] });
          const height = Math.min(m.height, config.captureMaxHeight[vp]);
          const file = `${p.id}-${vp}.jpg`;
          await page.screenshot({ path: path.join(shotsDir, file), fullPage: true, type: "jpeg", quality: 78, clip: { x: 0, y: 0, width: m.width, height } });
          res.shots.push({ viewport: vp, file, width: m.width, height, capturedAt: new Date().toISOString() });
          for (const a of m.assets) res.assetBoxes.push({ assetId: a.assetId, area: a.area, bbox: { ...roundBox(a.box), viewport: vp } });
          m.sections.forEach((s, si) => {
            const id = `s${si + 1}`;
            const existing = res.sections.find((x) => x.heading === s.heading);
            if (existing) existing.boxes.push({ ...roundBox(s.box), viewport: vp });
            else if (vp === "desktop") res.sections.push({ id, heading: s.heading, boxes: [{ ...roundBox(s.box), viewport: vp }] });
          });
          if (vp === "desktop") res.text = m.text;
        } catch (e) {
          res.error = (e as Error).message.slice(0, 160);
        } finally {
          await page.close();
        }
      }
    } finally {
      await ctx.close();
    }
  }
  return results;
}

const roundBox = (b: { x: number; y: number; width: number; height: number }) => ({ x: round(b.x), y: round(b.y), width: round(b.width), height: round(b.height) });

/** Runs inside the page. Must be self-contained. */
function measureInPage({ targets, maxH }: { targets: Target[]; maxH: number }) {
  const W = document.documentElement.clientWidth;
  const H = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
  const vis = (el: Element) => {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return r.width > 4 && r.height > 4 && st.visibility !== "hidden" && st.display !== "none" && Number(st.opacity) > 0.05;
  };
  const box = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { x: Math.max(0, r.left + window.scrollX), y: Math.max(0, r.top + window.scrollY), width: Math.min(r.width, W), height: r.height };
  };
  const area = (el: Element) => (el.closest("footer,[class*='footer']") ? "footer" : el.closest("nav,[class*='menu']") ? "nav" : el.closest("header,[class*='header']") ? "header" : "main");
  const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, "").replace(/[#?].*$/, "").replace(/\/+$/, "").toLowerCase();
  const txt = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();

  const assets: { assetId: string; area: string; box: { x: number; y: number; width: number; height: number } }[] = [];
  const anchors = [...document.querySelectorAll("a[href], button")].filter(vis);
  const forms = [...document.querySelectorAll("form")].filter((f) => vis(f) && f.querySelectorAll("input:not([type=hidden]),select,textarea").length >= 2);
  let formIdx = 0;
  for (const t of targets) {
    if (t.hint) {
      const el = [...document.querySelectorAll(t.hint)].filter(vis).sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
      if (el) assets.push({ assetId: t.assetId, area: "main", box: box(el) });
      continue;
    }
    if (["contact_form", "multi_step_form", "calculator", "upload"].includes(t.kind) && !t.href) {
      const f = forms[formIdx++];
      if (f) assets.push({ assetId: t.assetId, area: area(f), box: box(f) });
      continue;
    }
    const want = t.href ? (t.href.startsWith("tel:") || t.href.startsWith("mailto:") ? t.href.toLowerCase() : norm(t.href)) : "";
    const label = t.text.toLowerCase();
    const hits = anchors.filter((a) => {
      const href = a.getAttribute("href") ?? "";
      const h = href.startsWith("tel:") || href.startsWith("mailto:") ? href.toLowerCase() : href ? norm(new URL(href, location.href).href) : "";
      if (t.kind === "phone") return href.toLowerCase().startsWith("tel:");
      if (t.kind === "email") return href.toLowerCase().startsWith("mailto:");
      return (want && h === want && (!label || txt(a).includes(label.slice(0, 18)))) || (!want && txt(a) === label);
    });
    const seenAreas = new Set<string>();
    for (const h of hits.slice(0, 8)) {
      const ar = area(h);
      if (seenAreas.has(ar)) continue; // one box per area keeps overlays calm
      seenAreas.add(ar);
      const b = box(h);
      if (b.y < maxH) assets.push({ assetId: t.assetId, area: ar, box: b });
    }
  }

  const sections: { heading: string; box: { x: number; y: number; width: number; height: number } }[] = [];
  const seen = new Set<string>();
  for (const h of [...document.querySelectorAll("h1, h2, h3")].filter(vis)) {
    const heading = (h.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 90);
    if (!heading || seen.has(heading) || h.closest("header, nav, footer")) continue;
    seen.add(heading);
    const hb = h.getBoundingClientRect();
    let el: Element | null = h.parentElement;
    let chosen: Element = h;
    while (el && el !== document.body) {
      const r = el.getBoundingClientRect();
      if (r.height > Math.max(hb.height * 2.2, 140) && r.height < 1300 && r.width > W * 0.45) { chosen = el; break; }
      if (r.height >= 1300) break;
      el = el.parentElement;
    }
    const b = box(chosen);
    if (b.y < maxH - 40) sections.push({ heading, box: b });
    if (sections.length >= 14) break;
  }
  return { width: W, height: H, assets, sections, text: (document.body.innerText || "").slice(0, 60000) };
}
