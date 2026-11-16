/**
 * Freeze the acceptance inputs once (crawl + inventory + screenshots, NO LLM):
 *   npx tsx scripts/freeze.ts [url ...]
 * Writes data/frozen/<site>/collected.json + shots/.
 */
import "./env";
import path from "node:path";
import { collectSite, freeze, frozenName } from "../src/lib/analyzer/collect";
import { newFetchStats } from "../src/lib/analyzer/net/fetcher";
import { closeBrowser } from "../src/lib/analyzer/browser";
import { config } from "../src/lib/analyzer/config";

const SITES = process.argv.slice(2).length ? process.argv.slice(2) : [
  "https://www.passionbuilt.com.au/",
  "https://www.uniquebathrooms.com.au/",
  "https://lukesrenovations.com.au/",
  "https://www.monumentbathrooms.com.au/",
];

for (const url of SITES) {
  const t0 = Date.now();
  const tmp = path.join(config.dataDir, "frozen-tmp", frozenName(new URL(url).hostname));
  const { collected, captureTask } = await collectSite(url, newFetchStats(), { log: () => {}, counts: () => {}, scanDir: tmp });
  await captureTask;
  await freeze(collected, tmp);
  console.log(`${frozenName(collected.rootHost)}: ${collected.pages.length} pages, ${collected.assets.length} assets, ${collected.captures.filter((c) => c.shots.length).length} captured, ${collected.candidateCount} urls, ${Math.round((Date.now() - t0) / 1000)}s`);
}
await closeBrowser();
process.exit(0);
