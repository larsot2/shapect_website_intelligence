/**
 * Run ONLY the LLM stages (+ gates + assembly) on frozen inputs:
 *   npx tsx scripts/eval.ts <variant> [site ...]
 * Each result is stored as a normal scan (visible in the Studio) and under
 * data/eval/<variant>/<site>.json with the full call log.
 */
import "./env";
import fs from "node:fs/promises";
import path from "node:path";
import { loadFrozen } from "../src/lib/analyzer/collect";
import { analyze, newJob } from "../src/lib/analyzer/pipeline";
import { newUsage } from "../src/lib/analyzer/llm/client";
import { deleteScan, saveBlueprint, saveJob, scanDir } from "../src/lib/analyzer/store";
import { config } from "../src/lib/analyzer/config";

const [variant = "dev", ...only] = process.argv.slice(2);
const sites = only.length ? only : ["passionbuilt-com-au", "uniquebathrooms-com-au", "lukesrenovations-com-au", "monumentbathrooms-com-au"];
let total = 0;

for (const site of sites) {
  const { collected, shotsDir } = await loadFrozen(site);
  const scanId = `scan-eval-${variant}-${site}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 62);
  await deleteScan(scanId);
  await fs.cp(shotsDir, path.join(scanDir(scanId), "shots"), { recursive: true }).catch(() => {});
  const usage = newUsage();
  const t0 = Date.now();
  const res = await analyze(structuredClone(collected), { scanId, usage, warnings: [], stats: collected.stats, t0, log: () => {} });
  const job = newJob(scanId, collected.homeUrl);
  job.status = res.understandingOk && res.strategyOk ? "done" : "partial";
  job.businessName = `${res.blueprint.website.businessName} · eval ${variant}`;
  job.finishedAt = new Date().toISOString();
  await saveBlueprint(scanId, res.blueprint);
  await saveJob(job);
  const outDir = path.join(config.dataDir, "eval", variant);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, `${site}.json`), JSON.stringify({ site, scanId, usage, understanding: res.understanding, strategy: res.strategy, blueprint: res.blueprint }, null, 1));
  total += usage.costUsd;
  const bp = res.blueprint as typeof res.blueprint & { contexts?: unknown[] };
  console.log(`\n=== ${site} (${variant}) ${job.status} · ${usage.calls} calls · in ${usage.inputTokens} · out ${usage.outputTokens} · reasoning ${usage.reasoningTokens} · $${usage.costUsd.toFixed(4)}${usage.costKnown ? "" : " (partly unknown)"} · ${Math.round((Date.now() - t0) / 1000)}s`);
  console.log(`strategy: ${bp.conversionStrategy.label} | contexts: ${bp.contexts?.length ?? "-"} | entries: ${bp.suggestedExperiences.map((s) => `${s.label} [${s.action}]`).join("; ")}`);
  if (usage.failures.length) console.log("failures:", usage.failures);
}
console.log(`\nTOTAL cost: $${total.toFixed(4)}`);
process.exit(0);
