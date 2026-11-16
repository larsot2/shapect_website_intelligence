/**
 * Cheap heuristic page classification from URL, link text, title and headings.
 * It only prioritises the crawl — final page meaning comes from the LLM pass
 * with real page content. Navigation items are never treated as services here.
 */
import { slugTokens } from "./urls";

export type PageGroup =
  | "home" | "service" | "commercial" | "pricing" | "calculator" | "design" | "projects"
  | "quote" | "contact" | "booking" | "faq" | "advice" | "location" | "industry" | "about"
  | "reviews" | "blog" | "legal" | "careers" | "other";

const RULES: [PageGroup, RegExp][] = [
  ["calculator", /\b(calculator|calculate|estimator|estimate[- ]?tool|price[- ]?guide[- ]?tool|cost[- ]?estimator)\b/],
  ["pricing", /\b(price|prices|pricing|cost|costs|packages?|rates?|budget[- ]guide|how much)\b/],
  ["booking", /\b(book|booking|bookings|appointments?|schedule|consultations?|showroom visit)\b/],
  ["quote", /\b(quote|quotes|quotation|estimate|enquir\w*|inquir\w*|get[- ]started|free[- ]?advice|request)\b/],
  ["contact", /\b(contact|contact[- ]us|get in touch|reach us)\b/],
  ["commercial", /\b(commercial|strata|office|retail|hospitality|industrial|aged[- ]care|childcare|schools?|body[- ]corporate|fit[- ]?outs?)\b/],
  ["industry", /\b(industr\w*|sectors?|builders|developers|real[- ]estate|property[- ]managers?)\b/],
  ["design", /\b(design|designs|designer|designers|inspiration|ideas|styles?|trends|mood|showroom|3d|render)\b/],
  ["projects", /\b(gallery|portfolio|projects?|our[- ]work|examples|before[- ]and[- ]after|case[- ]stud\w*|completed)\b/],
  ["faq", /\b(faq|faqs|questions)\b/],
  ["advice", /\b(guide|guides|advice|tips|how[- ]to|checklist|process|what to expect|resources?)\b/],
  ["reviews", /\b(reviews?|testimonials?|ratings?)\b/],
  ["about", /\b(about|about[- ]us|team|our[- ]story|who we are|why[- ]us|why choose|licen[cs]e|warranty|insurance|awards?)\b/],
  ["blog", /\b(blog|news|articles?|posts?|journal)\b/],
  ["careers", /\b(careers?|jobs|employment|join our team|subcontract\w*|trades wanted)\b/],
  ["legal", /\b(privacy|terms|policy|disclaimer|cookies?)\b/],
  ["service", /\b(renovations?|remodel\w*|bathrooms?|ensuites?|laundr\w*|kitchens?|toilets?|showers?|wet[- ]?rooms?|tiling|waterproofing|plumbing|accessib\w*|disabled|ndis|small|luxury|budget|apartment|house|granny|services?|extensions?|structural)\b/],
];

/** Weight of a group for deep inspection (higher = more decision-relevant). */
export const GROUP_WEIGHT: Record<PageGroup, number> = {
  home: 100, calculator: 9, pricing: 8, quote: 8, booking: 8, service: 6, commercial: 6, contact: 6,
  design: 5, projects: 5, faq: 5, about: 4, advice: 3, industry: 4, reviews: 3, location: 2,
  blog: 1, careers: -6, legal: -10, other: 0,
};

export function classifyHeuristic(url: string, texts: string[], extra = ""): PageGroup {
  const u = new URL(url);
  if (u.pathname === "/" || u.pathname === "") return "home";
  const tokens = slugTokens(url).join(" ");
  const hay = `${tokens} ${texts.join(" ")} ${extra}`.toLowerCase();
  for (const [group, re] of RULES) if (re.test(tokens)) return group; // URL first: most reliable
  for (const [group, re] of RULES) if (re.test(hay)) return group;
  if (/\/blog\/|\/news\/|\/\d{4}\/\d{2}\//.test(u.pathname)) return "blog";
  return "other";
}

/** Detect families of near-identical pages (suburb pages, blog posts, project pages). */
export interface Cluster {
  id: string;
  pattern: string;
  members: string[];
  kind: "location" | "blog" | "projects" | "similar";
}

const SERVICE_WORD = /^(bathroom|bathrooms|renovation|renovations|ensuite|laundry|kitchen|small|luxury|budget|accessible|commercial|design|services?|tiling|waterproofing|remodel|remodelling|in|near|me|sydney|nsw|melbourne|brisbane)$/;

export function detectClusters(urls: string[]): Cluster[] {
  const buckets = new Map<string, string[]>();
  for (const url of urls) {
    const u = new URL(url);
    const segs = u.pathname.split("/").filter(Boolean);
    if (!segs.length) continue;
    const parent = segs.slice(0, -1).join("/");
    const last = segs[segs.length - 1].toLowerCase().split(/[-_]+/);
    // Strategy 1: same parent folder with many children (blog/x, projects/y, areas/z)
    if (parent) {
      const k = `dir:${parent}/*`;
      buckets.set(k, [...(buckets.get(k) ?? []), url]);
    }
    // Strategy 2: shared slug prefix with a varying tail (bathroom-renovations-bondi)
    for (const cut of [1, 2]) {
      if (last.length - cut < 1) continue;
      const head = last.slice(0, last.length - cut);
      const tail = last.slice(last.length - cut);
      if (tail.every((t) => SERVICE_WORD.test(t))) continue;
      if (!head.some((t) => SERVICE_WORD.test(t))) continue;
      const k = `slug:${parent}/${head.join("-")}-*`;
      buckets.set(k, [...(buckets.get(k) ?? []), url]);
    }
  }
  const clusters: Cluster[] = [];
  const used = new Set<string>();
  const sorted = [...buckets.entries()].filter(([, m]) => new Set(m).size >= 4).sort((a, b) => b[1].length - a[1].length);
  for (const [key, members] of sorted) {
    const fresh = [...new Set(members)].filter((m) => !used.has(m));
    if (fresh.length < 4) continue;
    if (key.startsWith("dir:")) {
      // a /services/* folder of distinct service pages is NOT a cluster
      const serviceLike = fresh.filter((m) => {
        const toks = new URL(m).pathname.split("/").filter(Boolean).pop()!.toLowerCase().split(/[-_]+/);
        return toks.every((t) => SERVICE_WORD.test(t) || /^(and|the|for|of|walk|wet|room|rooms|house|apartment|granny|flat|ndis|disabled|toilet|shower|structural|general|extension|extensions|outdoor|full|partial|renovate|remodeling)$/.test(t));
      }).length;
      if (serviceLike / fresh.length > 0.4 && !/blog|news|project|gallery|portfolio|area|suburb|location/i.test(key)) continue;
    }
    fresh.forEach((m) => used.add(m));
    const pattern = key.replace(/^(dir|slug):/, "/");
    const kind: Cluster["kind"] = /blog|news|article|post|\d{4}/i.test(pattern) ? "blog"
      : /project|gallery|portfolio|case|work/i.test(pattern) ? "projects"
      : key.startsWith("slug:") || /area|suburb|location|service-area|region/i.test(pattern) ? "location" : "similar";
    clusters.push({ id: `cluster-${clusters.length + 1}`, pattern, members: fresh, kind });
  }
  return clusters;
}
