/** Minimal robots.txt support: groups for our UA or "*", Allow/Disallow longest match, Sitemap lines. */

export interface Robots {
  isAllowed(path: string): boolean;
  sitemaps: string[];
  crawlDelayMs?: number;
}

export function parseRobots(txt: string): Robots {
  const lines = txt.split(/\r?\n/).map((l) => l.replace(/#.*/, "").trim()).filter(Boolean);
  type Group = { agents: string[]; rules: { allow: boolean; path: string }[]; delay?: number };
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let cur: Group | null = null;
  let lastWasAgent = false;
  for (const line of lines) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const val = line.slice(i + 1).trim();
    if (key === "sitemap") { sitemaps.push(val); continue; }
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === "allow" || key === "disallow") { if (val || key === "allow") cur.rules.push({ allow: key === "allow", path: val }); }
    else if (key === "crawl-delay") cur.delay = Number(val) * 1000;
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && "shapectanalyzer".includes(a)));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  const rules = chosen.flatMap((g) => g.rules);
  const toRe = (p: string) => new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
  const compiled = rules.filter((r) => r.path).map((r) => ({ ...r, re: toRe(r.path), len: r.path.length }));
  return {
    sitemaps,
    crawlDelayMs: chosen.find((g) => g.delay)?.delay,
    isAllowed(path: string) {
      let best: { allow: boolean; len: number } | null = null;
      for (const r of compiled) if (r.re.test(path) && (!best || r.len > best.len || (r.len === best.len && r.allow))) best = r;
      return best ? best.allow : true;
    },
  };
}

export const allowAll: Robots = { isAllowed: () => true, sitemaps: [] };
