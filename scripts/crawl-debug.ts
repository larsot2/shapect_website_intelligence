import { discover, selectPages, inspect } from "../src/lib/analyzer/crawl";
import { newFetchStats } from "../src/lib/analyzer/net/fetcher";
import { closeBrowser } from "../src/lib/analyzer/browser";

const url = process.argv[2];
const t0 = Date.now();
const stats = newFetchStats();
const st = await discover(url, stats, (p) => console.log(`[${p.phase}] ${p.message}`, p.detail ?? ""));
await selectPages(st, (p) => console.log(`[${p.phase}] ${p.message}`, p.detail ?? ""));
await inspect(st, st.selected, () => {});
console.log("\nclusters:", st.clusters.map((c) => `${c.kind} ${c.pattern} (${c.members.length})`));
console.log("\nselected:");
for (const k of st.selected) {
  const c = st.candidates.get(k)!; const d = st.digests.get(k);
  console.log(` ${c.group.padEnd(10)} ${c.score.toFixed(1).padStart(6)} ${c.url}  forms=${d?.forms.length} ctas=${d?.ctas.length} blocks=${d?.blocks.length} chars=${d?.blocks.join(" ").length} prices=${d?.priceMentions.length} tools=${d?.tools.map(t=>t.name).join(",")}`);
}
const groups: Record<string, number> = {};
for (const c of st.candidates.values()) groups[c.group] = (groups[c.group] ?? 0) + 1;
console.log("\ngroups:", groups, "\nstats:", { ...stats, errors: stats.errors.length }, "rendered", st.renderedCount, "ms", Date.now() - t0, "skipped", st.skipped.slice(0, 5));
await closeBrowser();
