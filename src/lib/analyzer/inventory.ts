/**
 * Deterministic conversion inventory across all inspected pages: CTAs, forms,
 * calculators, booking, phone, email, chat. No LLM — the model only interprets
 * these facts later, it never invents assets.
 */
import type { PageDigest } from "./extract";
import { dedupeKey, pathOf } from "./urls";

export interface SitePage {
  id: string;
  key: string;
  url: string;
  path: string;
  group: string;
  digest: PageDigest;
}

export interface InvAsset {
  id: string;
  kind: "cta_link" | "contact_form" | "multi_step_form" | "calculator" | "booking" | "phone" | "email" | "chat" | "upload" | "third_party";
  label: string;
  targetUrl?: string;
  targetPageId?: string;
  siteWide: boolean;
  occurrences: { pageId: string; area: string; text: string }[];
  fields?: string[];
  submitText?: string;
  provider?: string;
  hasUpload?: boolean;
  multiStep?: boolean;
  /** evidence text that exists verbatim on the page (for quote checks) */
  evidenceText: string;
}

const slug = (s: string, max = 48) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/, "") || "x";

export function assignPageIds(digests: { key: string; digest: PageDigest; group: string }[]): SitePage[] {
  const used = new Set<string>();
  return digests.map(({ key, digest, group }) => {
    const p = pathOf(digest.url);
    let id = p === "/" ? "home" : slug(p.replace(/^\//, ""), 56);
    if (!/^[a-z0-9]/.test(id)) id = `p-${id}`;
    if (id.length < 2) id = `p-${id}`;
    let n = 2;
    const base = id;
    while (used.has(id)) id = `${base.slice(0, 58)}-${n++}`;
    used.add(id);
    return { id, key, url: digest.url, path: p, group, digest };
  });
}

const CALL_RE = /\b(call|phone|ring)\b/i;

export function buildInventory(pages: SitePage[]): InvAsset[] {
  const byKey = new Map(pages.map((p) => [p.key, p]));
  const assets = new Map<string, InvAsset>();
  const total = pages.length;
  const add = (key: string, init: () => Omit<InvAsset, "occurrences">, occ: InvAsset["occurrences"][number]) => {
    let a = assets.get(key);
    if (!a) {
      a = { ...init(), occurrences: [] };
      assets.set(key, a);
    }
    if (!a.occurrences.some((o) => o.pageId === occ.pageId && o.area === occ.area && o.text === occ.text)) a.occurrences.push(occ);
  };

  for (const p of pages) {
    const d = p.digest;
    for (const c of d.ctas) {
      if (c.kind === "tel") {
        add("phone", () => ({ id: "phone", kind: "phone", label: c.text.replace(/\s+/g, " ").slice(0, 40), targetUrl: c.href, siteWide: false, evidenceText: c.text }), { pageId: p.id, area: c.area, text: c.text });
      } else if (c.kind === "mailto") {
        add("email", () => ({ id: "email", kind: "email", label: (c.href ?? "").replace(/^mailto:/i, "").split("?")[0], targetUrl: c.href?.split("?")[0], siteWide: false, evidenceText: c.text }), { pageId: p.id, area: c.area, text: c.text });
      } else if (c.href) {
        const targetKey = c.kind === "internal" ? dedupeKey(c.href) : c.href;
        const target = c.kind === "internal" ? byKey.get(targetKey) : undefined;
        if (target?.id === p.id) continue; // self link
        const external = c.kind === "external";
        const bookingHref = /calendly|acuity|setmore|simplybook|hubspot.*meetings|youcanbook|servicem8|cal\.com|tidycal|\/(book|booking|bookings|appointments?|schedule)(\/|$|\?)/i.test(c.href);
        const bookingText = /\bbook\b.*\b(consult\w*|appointment|visit|call|meeting|time)\b|\bschedule\b/i.test(c.text);
        const isBooking = bookingHref || (external && bookingText);
        const k = `cta:${targetKey}`;
        add(k, () => ({
          id: "", kind: isBooking && (external || bookingHref) ? "booking" : external ? "third_party" : "cta_link", label: c.text, targetUrl: c.href,
          targetPageId: target?.id, siteWide: false, evidenceText: c.text,
        }), { pageId: p.id, area: c.area, text: c.text });
      }
    }
    for (const f of d.forms) {
      const sig = f.fields.map((x) => x.label.toLowerCase()).sort().join("|");
      const kind: InvAsset["kind"] = f.looksLikeCalculator ? "calculator" : f.multiStep ? "multi_step_form" : f.hasUpload && f.fields.length <= 3 ? "upload" : "contact_form";
      add(`form:${kind}:${sig}`, () => ({
        id: "", kind, label: f.submitText ? `${kind === "calculator" ? "Calculator" : "Form"}: “${f.submitText}”` : kind === "calculator" ? "Calculator" : "Enquiry form",
        siteWide: false, fields: f.fields.map((x) => `${x.label}${x.required ? "*" : ""}${x.type === "select" || x.type === "radio" ? ` (${x.type}${x.options?.length ? `: ${x.options.slice(0, 6).join(" / ")}` : ""})` : x.type === "file" ? " (file upload)" : ""}`),
        submitText: f.submitText, provider: f.provider, hasUpload: f.hasUpload, multiStep: f.multiStep, evidenceText: f.submitText ?? f.fields[0]?.label ?? "",
      }), { pageId: p.id, area: "main", text: f.submitText ?? "form" });
    }
    for (const t of d.tools) {
      if (t.presence !== "embedded" || t.kind === "form" || t.kind === "reviews") continue;
      const kind: InvAsset["kind"] = t.kind === "booking" ? "booking" : t.kind === "calculator" ? "calculator" : t.kind === "chat" ? "chat" : "third_party";
      add(`tool:${t.name}`, () => ({ id: "", kind, label: t.name, siteWide: false, provider: t.name, evidenceText: "" }), { pageId: p.id, area: "main", text: t.name });
    }
  }

  // Drop navigation-only internal links that are not real CTAs (must look like an action somewhere outside nav).
  const out: InvAsset[] = [];
  const usedIds = new Set<string>();
  for (const a of assets.values()) {
    if (a.kind === "cta_link" && a.occurrences.every((o) => o.area === "nav") && !/quote|book|consult|estimate|calculat/i.test(a.label)) continue;
    if (a.kind === "cta_link" && CALL_RE.test(a.label) && !a.targetPageId) continue;
    const pagesWith = new Set(a.occurrences.map((o) => o.pageId)).size;
    a.siteWide = total >= 3 && pagesWith / total >= 0.6;
    // most common label wins
    const counts = new Map<string, number>();
    for (const o of a.occurrences) counts.set(o.text, (counts.get(o.text) ?? 0) + 1);
    if (a.kind === "cta_link" || a.kind === "third_party" || a.kind === "booking") a.label = [...counts.entries()].sort((x, y) => y[1] - x[1])[0][0].slice(0, 60);
    let id = a.id || `${a.kind === "cta_link" ? "cta" : a.kind.replace(/_/g, "-")}-${slug(a.label, 32)}`;
    const base = id;
    let n = 2;
    while (usedIds.has(id)) id = `${base}-${n++}`;
    usedIds.add(id);
    a.id = id;
    out.push(a);
  }
  // Keep the inventory compact: strongest CTAs first.
  const rank = (a: InvAsset) => (a.kind === "cta_link" ? 0 : 10) + a.occurrences.length + (/quote|book|consult|estimate|calculat/i.test(a.label) ? 5 : 0);
  return out.sort((a, b) => rank(b) - rank(a)).slice(0, 24);
}
