/**
 * Deterministic HTML extraction (no LLM): page signals for Stage B and compact
 * page digests for Stage C. Website content is untrusted — we only ever turn
 * it into plain text fields.
 */
import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { normalizeUrl } from "./urls";

export interface Cta {
  text: string;
  href?: string;
  kind: "internal" | "external" | "tel" | "mailto" | "button";
  area: "header" | "nav" | "main" | "footer";
}

export interface FormField {
  label: string;
  type: string;
  required: boolean;
  options?: string[];
}

export interface FormInfo {
  id: string;
  fields: FormField[];
  submitText?: string;
  hasUpload: boolean;
  multiStep: boolean;
  provider?: string; // gravity forms, hubspot, ...
  looksLikeCalculator: boolean;
}

export interface PageSignals {
  title: string;
  metaDescription: string;
  h1: string[];
  headings: { level: number; text: string }[];
  links: { url: string; text: string; area: Cta["area"] }[];
  ctas: Cta[];
  forms: FormInfo[];
  phones: string[];
  emails: string[];
  priceMentions: string[];
  /** embedded = script/iframe/form on the page; linked = only a link to someone else's tool (not the business's own tool). */
  tools: { kind: "booking" | "calculator" | "chat" | "form" | "design" | "reviews"; name: string; evidence: string; presence: "embedded" | "linked" }[];
  imageCount: number;
  mainTextLength: number;
  frameworkHint?: string;
}

export interface PageDigest extends PageSignals {
  url: string;
  blocks: string[]; // de-duplicated main content blocks (plain text)
}

const CTA_RE = /\b(quote|book|booking|consult|consultation|contact|call|enquir|enquiry|inquir|estimate|calculat|get started|free|schedule|appointment|request|talk to|speak|start your|check availability|visit our showroom)\b/i;
const PRICE_RE = /(?:from\s+|starting\s+(?:at|from)\s+|between\s+)?(?:A?\$|AUD\s?)\s?\d{1,3}(?:[,.]\d{3})*(?:\.\d+)?\s?(?:k|K|\+)?(?:\s?(?:-|–|to)\s?(?:A?\$)?\s?\d{1,3}(?:[,.]\d{3})*(?:k|K)?)?/g;

const TOOL_PATTERNS: { re: RegExp; kind: PageSignals["tools"][number]["kind"]; name: string }[] = [
  { re: /calendly\.com/i, kind: "booking", name: "Calendly" },
  { re: /acuityscheduling\.com|as\.me\//i, kind: "booking", name: "Acuity" },
  { re: /simplybook\./i, kind: "booking", name: "SimplyBook" },
  { re: /setmore\.com/i, kind: "booking", name: "Setmore" },
  { re: /meetings\.hubspot\.com|hubspot.*meetings/i, kind: "booking", name: "HubSpot Meetings" },
  { re: /youcanbook\.me/i, kind: "booking", name: "YouCanBookMe" },
  { re: /book(?:ing)?\.servicem8|servicem8\.com/i, kind: "booking", name: "ServiceM8" },
  { re: /tidycal|cal\.com\//i, kind: "booking", name: "Cal booking" },
  { re: /calconic|calculoid|involve\.me|outgrow\.(co|us)|convertcalculator|uniquecalc|calculatorbuilder|elfsight.*calculator/i, kind: "calculator", name: "Calculator widget" },
  { re: /typeform\.com/i, kind: "form", name: "Typeform" },
  { re: /jotform\./i, kind: "form", name: "Jotform" },
  { re: /hsforms|hs-scripts|hubspot\.com\/forms/i, kind: "form", name: "HubSpot Forms" },
  { re: /gform_wrapper|gravityforms/i, kind: "form", name: "Gravity Forms" },
  { re: /wpforms/i, kind: "form", name: "WPForms" },
  { re: /wpcf7|contact-form-7/i, kind: "form", name: "Contact Form 7" },
  { re: /elementor-form/i, kind: "form", name: "Elementor form" },
  { re: /tawk\.to/i, kind: "chat", name: "Tawk chat" },
  { re: /intercom/i, kind: "chat", name: "Intercom" },
  { re: /livechatinc|livechat\.com/i, kind: "chat", name: "LiveChat" },
  { re: /drift\.com/i, kind: "chat", name: "Drift" },
  { re: /zopim|zendesk.*chat/i, kind: "chat", name: "Zendesk chat" },
  { re: /fb-customerchat|messenger.*chat/i, kind: "chat", name: "Messenger chat" },
  { re: /roomsketcher|planner5d|kitchen-planner|3d-?planner|roomstyler|floorplanner/i, kind: "design", name: "Online planner" },
  { re: /elfsight.*review|trustindex|google-reviews|reviews\.io|productreview\.com\.au|hipages/i, kind: "reviews", name: "Reviews widget" },
];

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function areaOf($: cheerio.CheerioAPI, el: AnyNode): Cta["area"] {
  // Walk ancestors below <body> only — body/page classes must not decide the area.
  const chain = $(el).parentsUntil("body").addBack();
  if (chain.filter("footer, .footer, #footer, [class*='footer'], [id*='footer']").length) return "footer";
  if (chain.filter("nav, [role='navigation'], .menu, [class*='nav-menu'], [class*='navbar']").length) return "nav";
  if (chain.filter("header, .header, #header, [class*='site-header'], [id*='header']").length) return "header";
  return "main";
}

function labelFor($: cheerio.CheerioAPI, el: Element): string {
  const $el = $(el);
  const id = $el.attr("id");
  const byFor = id ? clean($(`label[for="${id.replace(/"/g, '\\"')}"]`).first().text()) : "";
  const wrap = clean($el.closest("label").text());
  const aria = $el.attr("aria-label") ?? "";
  const ph = $el.attr("placeholder") ?? "";
  const name = ($el.attr("name") ?? "").replace(/[_\-\[\]]+/g, " ").replace(/\b(input|field|form)\b/gi, "").trim();
  return clean(byFor || wrap || aria || ph || name).slice(0, 80);
}

function extractForms($: cheerio.CheerioAPI): FormInfo[] {
  const forms: FormInfo[] = [];
  $("form").each((i, f) => {
    const $f = $(f);
    const fields: FormField[] = [];
    $f.find("input, select, textarea").each((_, el) => {
      const $el = $(el);
      const type = (el.tagName === "input" ? $el.attr("type") ?? "text" : el.tagName).toLowerCase();
      if (["hidden", "submit", "button", "reset", "image"].includes(type)) return;
      if (/captcha|honeypot|nonce|token/i.test(($el.attr("name") ?? "") + ($el.attr("class") ?? ""))) return;
      const label = labelFor($, el as Element);
      if (!label && type !== "file") return;
      const options = el.tagName === "select" ? $el.find("option").map((_, o) => clean($(o).text())).get().filter(Boolean).slice(0, 12) : undefined;
      fields.push({ label: label || "File upload", type, required: $el.is("[required]") || /required/i.test($el.attr("aria-required") ?? ""), options });
    });
    // collapse radio/checkbox groups into one field
    const merged: FormField[] = [];
    for (const fld of fields) {
      const prev = merged.find((m) => m.label === fld.label && m.type === fld.type);
      if (!prev) merged.push(fld);
    }
    const submitText = clean($f.find("button[type='submit'], input[type='submit'], button").last().text() || $f.find("input[type='submit']").attr("value") || "");
    const html = $.html(f) ?? "";
    const provider = TOOL_PATTERNS.find((t) => t.kind === "form" && t.re.test(html))?.name;
    const numeric = merged.filter((m) => ["number", "range"].includes(m.type)).length;
    const looksLikeCalculator = /calculat|estimate your|get (?:an )?estimate/i.test(submitText + " " + clean($f.text()).slice(0, 400)) && (numeric > 0 || merged.filter((m) => m.type === "select" || m.type === "radio").length >= 2);
    if (merged.length === 0) return;
    if (merged.length === 1 && /search/i.test(merged[0].label + ($f.attr("role") ?? "") + ($f.attr("class") ?? ""))) return;
    forms.push({
      id: `form-${i + 1}`,
      fields: merged.slice(0, 25),
      submitText: submitText.slice(0, 60) || undefined,
      hasUpload: merged.some((m) => m.type === "file"),
      multiStep: /step\s*\d|data-step|gform_page|multi-?step|wizard|progress/i.test(html),
      provider,
      looksLikeCalculator,
    });
  });
  return forms;
}

/** Light + full signals from one HTML document. */
export function extractSignals(html: string, pageUrl: string): PageSignals & { $: cheerio.CheerioAPI } {
  const $ = cheerio.load(html);
  const rawHtml = html;
  const title = clean($("title").first().text()).slice(0, 160);
  const metaDescription = clean($('meta[name="description"]').attr("content") ?? $('meta[property="og:description"]').attr("content") ?? "").slice(0, 300);
  const tools: PageSignals["tools"] = [];
  // Embedded tools: anchors are neutralised so a link in an article doesn't count as the business's own tool.
  const embeddedHay = rawHtml.replace(/<a\b[^>]*>/gi, "<a>");
  const linkHay = [...rawHtml.matchAll(/<a\b[^>]*href="([^"]+)"/gi)].map((m) => m[1]).join(" ");
  for (const t of TOOL_PATTERNS) {
    const m = embeddedHay.match(t.re);
    if (m && !tools.some((x) => x.name === t.name)) { tools.push({ kind: t.kind, name: t.name, evidence: m[0].slice(0, 60), presence: "embedded" }); continue; }
    const l = linkHay.match(t.re);
    if (l && !tools.some((x) => x.name === t.name)) tools.push({ kind: t.kind, name: t.name, evidence: l[0].slice(0, 60), presence: "linked" });
  }
  $("script, style, noscript, svg, template, iframe[src*='googletagmanager']").remove();

  const links: PageSignals["links"] = [];
  const ctas: Cta[] = [];
  const phones = new Set<string>();
  const emails = new Set<string>();
  $("a[href]").each((_, a) => {
    const href = ($(a).attr("href") ?? "").trim();
    const text = clean($(a).text() || $(a).attr("aria-label") || $(a).attr("title") || "").slice(0, 90);
    const area = areaOf($, a);
    if (/^tel:/i.test(href)) {
      phones.add(href.replace(/^tel:/i, "").replace(/[^\d+]/g, ""));
      ctas.push({ text: text || href.slice(4), href, kind: "tel", area });
      return;
    }
    if (/^mailto:/i.test(href)) {
      emails.add(href.replace(/^mailto:/i, "").split("?")[0].toLowerCase());
      ctas.push({ text: text || href.slice(7), href, kind: "mailto", area });
      return;
    }
    const url = normalizeUrl(href, pageUrl);
    if (!url) return;
    links.push({ url, text, area });
    if (text && text.length <= 60 && CTA_RE.test(text)) {
      const internal = new URL(url).hostname.replace(/^www\./, "") === new URL(pageUrl).hostname.replace(/^www\./, "");
      ctas.push({ text, href: url, kind: internal ? "internal" : "external", area });
    }
  });
  $("button").each((_, b) => {
    const text = clean($(b).text()).slice(0, 60);
    if (text && CTA_RE.test(text) && !$(b).closest("form").length) ctas.push({ text, kind: "button", area: areaOf($, b) });
  });

  // Interactive widgets outside <form> (custom calculators / estimators / quote builders)
  const loose = $("select, input[type='radio'], input[type='range'], input[type='number'], input[type='checkbox'], [role='radiogroup'], [class*='option-btn'], [class*='size-btn']").filter((_, el) => !$(el).closest("form").length);
  if (loose.length >= 3) {
    const containers = loose.map((_, el) => $(el).closest("[class*='calc'], [id*='calc'], [class*='estimat'], [id*='estimat'], [class*='quote-builder'], [class*='price-tool'], [class*='configurator']").first()).get().filter((c) => c.length);
    const pageSaysCalc = /\b(calculator|estimator|estimate|instant price|real-time price|price estimate)\b/i.test($("h1, h2, h3").text() + " " + $("title").text());
    if (containers.length >= 2 || (pageSaysCalc && loose.length >= 5)) {
      if (!tools.some((t) => t.kind === "calculator")) tools.push({ kind: "calculator", name: "Interactive calculator", evidence: `${loose.length} interactive inputs`, presence: "embedded" });
    }
  }

  const headings = $("h1, h2, h3").map((_, h) => ({ level: Number(h.tagName[1]), text: clean($(h).text()).slice(0, 140) })).get().filter((h) => h.text);
  const forms = extractForms($);
  const bodyText = clean($("main").text() || $("body").text());
  const priceMentions = [...new Set((bodyText.match(PRICE_RE) ?? []).map((p) => p.trim()))].slice(0, 12).map((p) => {
    const i = bodyText.indexOf(p);
    return clean(bodyText.slice(Math.max(0, i - 90), i + p.length + 90));
  });
  const frameworkHint = /__NEXT_DATA__|data-reactroot|ng-version|data-v-app|id="app"><\/div>|wix\.com|squarespace/i.exec(rawHtml)?.[0];
  return {
    $,
    title,
    metaDescription,
    h1: headings.filter((h) => h.level === 1).map((h) => h.text).slice(0, 3),
    headings: headings.slice(0, 40),
    links,
    ctas: dedupeCtas(ctas),
    forms,
    phones: [...phones].filter((p) => p.length >= 8).slice(0, 4),
    emails: [...emails].slice(0, 4),
    priceMentions,
    tools,
    imageCount: $("img").length,
    mainTextLength: bodyText.length,
    frameworkHint,
  };
}

function dedupeCtas(ctas: Cta[]): Cta[] {
  const seen = new Map<string, Cta>();
  for (const c of ctas) {
    const key = `${c.text.toLowerCase()}|${c.href ?? ""}|${c.area}`;
    if (!seen.has(key)) seen.set(key, c);
  }
  return [...seen.values()].slice(0, 40);
}

/** Content blocks with boilerplate (header/nav/footer/cookie) removed. */
export function extractBlocks($: cheerio.CheerioAPI): string[] {
  const $c = cheerio.load($.html());
  // Remove boilerplate containers — but never <body>/<html> or a wrapper holding most of the page
  // (themes put words like "without-breadcrumb" or "has-header" on <body> and page wrappers).
  const bodyLen = $c("body").text().length || 1;
  $c("header, nav, footer, [role='navigation'], [class*='cookie'], [id*='cookie'], [class*='popup'], [class*='modal'], form, .menu, [class*='breadcrumb']").each((_, el) => {
    if (["body", "html", "main"].includes(el.tagName.toLowerCase())) return;
    if ($c(el).text().length > bodyLen * 0.6) return;
    $c(el).remove();
  });
  const blocks: string[] = [];
  const seen = new Set<string>();
  $c("h1, h2, h3, h4, p, li, blockquote, td, dt, dd, figcaption, summary, [class*='accordion'] [class*='title']").each((_, el) => {
    if ($c(el).find("p, li, h1, h2, h3, h4").length) return; // leaf-ish only
    const t = clean($c(el).text());
    if (t.length < 3 || t.length > 900) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const tag = el.tagName.toLowerCase();
    blocks.push(/^h[1-4]$/.test(tag) ? `## ${t}` : tag === "li" ? `- ${t}` : t);
  });
  return blocks;
}

/** Drop blocks that repeat across many pages (site-wide boilerplate). */
export function removeSiteWideBlocks(pages: { blocks: string[] }[]): void {
  if (pages.length < 3) return;
  const freq = new Map<string, number>();
  for (const p of pages) for (const b of new Set(p.blocks)) freq.set(b, (freq.get(b) ?? 0) + 1);
  const limit = Math.max(3, Math.ceil(pages.length * 0.5));
  pages.forEach((p, i) => {
    // keep site-wide blocks once (on the first page, usually home)
    p.blocks = p.blocks.filter((b) => i === 0 || (freq.get(b) ?? 0) < limit);
  });
}

/** Truncate a digest's blocks to a char budget, preferring headings and signal-rich text. */
export function budgetBlocks(blocks: string[], maxChars: number): string[] {
  const out: string[] = [];
  let used = 0;
  const signal = /\$|\bprice|cost|quote|consult|book|warrant|licen|insur|residential|commercial|service|area|suburb|we (?:do|don't|offer|specialise)|include|process|step|design|calculator|estimate|guarantee|years/i;
  const ranked = blocks.map((b, i) => ({ b, i, s: (b.startsWith("##") ? 2 : 0) + (signal.test(b) ? 1 : 0) }));
  const keep = new Set<number>();
  for (const r of [...ranked].sort((a, b) => b.s - a.s || a.i - b.i)) {
    if (used + r.b.length + 1 > maxChars) continue;
    keep.add(r.i);
    used += r.b.length + 1;
  }
  for (const r of ranked) if (keep.has(r.i)) out.push(r.b);
  return out;
}
