/**
 * Writes the exact LLM inputs for one frozen site to data/prompt-dumps/<site>/ (no LLM call):
 *   FROZEN_SET=v3 npx tsx scripts/dump-prompts.ts <site> <eval-variant-with-understanding>
 */
import "./env";
import fs from "node:fs/promises";
import path from "node:path";
import { loadFrozen } from "../src/lib/analyzer/collect";
import { buildEvidence } from "../src/lib/analyzer/evidence";
import { buildCritiquePrompt, buildStrategyPrompt, buildUnderstandingPrompt } from "../src/lib/analyzer/llm/prompts";
import { gateFacts, groundUnderstanding, sectionsText, unmappedPages } from "../src/lib/analyzer/pipeline";
import { config } from "../src/lib/analyzer/config";

const [site, variant] = process.argv.slice(2);
const { collected: c } = await loadFrozen(site);
const evidence = buildEvidence(c.pages);
const out = path.join(config.dataDir, "prompt-dumps", site);
await fs.mkdir(out, { recursive: true });
const u1 = buildUnderstandingPrompt(c, evidence);
await fs.writeFile(path.join(out, "1-understanding-prompt.txt"), u1);
const d = JSON.parse(await fs.readFile(path.join(config.dataDir, "eval", variant, `${site}.json`), "utf8"));
const u = groundUnderstanding(d.understanding, evidence);
await fs.writeFile(path.join(out, "2-understanding-output.json"), JSON.stringify(u, null, 1));
const sp = buildStrategyPrompt({ c, understanding: u, evidence, sections: sectionsText(c.captures, c.pages), gateFacts: gateFacts(c.assets, u, c.pages), unmappedPages: unmappedPages(u, c.pages) });
await fs.writeFile(path.join(out, "3-strategy-prompt.txt"), sp);
const st = d.trail?.initial ?? d.strategy;
await fs.writeFile(path.join(out, "4-strategy-output.json"), JSON.stringify(st, null, 1));
await fs.writeFile(path.join(out, "5-critic-prompt.txt"), buildCritiquePrompt({ c, understanding: u, strategy: st, evidence }));
for (const f of await fs.readdir(out)) { const s = await fs.stat(path.join(out, f)); console.log(`${f}  ${(s.size / 1024).toFixed(1)} KB  ~${Math.round(s.size / 4 / 1000)}k tokens`); }
