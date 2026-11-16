/**
 * Blind, independent comparison of the strategist's ORIGINAL vs REVISED proposals (eval only, not in the product).
 * A third model family judges A vs B without knowing which is which (order randomised per site).
 *   npx tsx scripts/judge.ts <variant> [site ...]
 */
import "./env";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { completeJson, newUsage } from "../src/lib/analyzer/llm/client";
import { config } from "../src/lib/analyzer/config";
import type { Strategy, Understanding } from "../src/lib/analyzer/llm/schemas";

const [variant, ...only] = process.argv.slice(2);
const dir = path.join(config.dataDir, "eval", variant);
const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json") && !f.startsWith("judge-") && (!only.length || only.some((o) => f.includes(o))));

const pick = z.enum(["A", "B", "tie"]).catch("tie");
const Verdict = z.object({
  criteria: z.object({ specificity: pick, usefulness: pick, creativity: pick, coherence: pick, evidenceHonesty: pick, simplicity: pick, nonRedundancy: pick }).partial(),
  overall: pick,
  reasons: z.array(z.string()).default([]),
  bestIdea: z.string().default(""),
  weakestIdea: z.string().default(""),
  ownerWouldPayFor: z.string().default(""),
});

const describe = (st: Strategy) => st.entries.map((e, i) => [
  `${i + 1}. ${e.label} (${e.role ?? "?"}, ${e.action}, ${e.interactionType ?? "?"}, readiness ${e.readiness ?? "?"}, stages ${(e.stages ?? []).join("/")})`,
  `   headline: ${e.headline} | promise: ${e.promise ?? "-"} | outcome: ${e.outcome ?? "-"}`,
  `   why this business: ${e.specificToBusiness ?? "-"}`,
  `   flow: ${e.commonFlow.map((f) => f.title).join(" → ")}`,
  `   questions: ${e.questionPlan.map((q) => q.question).join(" | ")}`,
  `   paths: ${e.contextVariants.map((v) => `${v.contextId}: ${v.additionalQuestions.map((q) => q.question).join(" / ") || "(hook only)"}`).join(" || ") || "-"}`,
].join("\n")).join("\n") + `\nconnections: ${st.connections.map((c) => `${c.from} → ${c.toEntry ?? c.toAssetId} (${c.mode})`).join("; ") || "-"}\narchitecture: ${st.architecture?.chosen ?? "-"}`;

let cost = 0;
const tally: Record<string, number> = { original: 0, revised: 0, tie: 0 };
for (const f of files) {
  const d = JSON.parse(await fs.readFile(path.join(dir, f), "utf8")) as { site: string; understanding: Understanding; trail?: { initial: Strategy | null; revised: Strategy | null } };
  if (!d.trail?.initial || !d.trail?.revised) { console.log(`${d.site}: no original/revised pair`); continue; }
  const flip = [...d.site].reduce((n, ch) => n + ch.charCodeAt(0), 0) % 2 === 1;
  const A = flip ? d.trail.revised : d.trail.initial, B = flip ? d.trail.initial : d.trail.revised;
  const u = d.understanding;
  const usage = newUsage();
  const v = await completeJson({
    stage: "judge", task: "blind-judge", schema: Verdict, schemaVersion: "judge-v1", usage, promptVersion: "judge-2026-11-16",
    prompt: `You are an independent, demanding judge with renovation-industry and customer-experience expertise. Two proposals (A and B) for interactive website experiences for the same renovation business follow. Compare them blind. Do not reward length, number of entries, number of questions or polish. Judge what would genuinely help this business's customers and its sales process.

For each criterion pick A, B or tie: specificity (built on THIS business's facts, offers, numbers, content — not generic), usefulness (resolves real visitor decisions at real stages), creativity (better interactions than forms where it matters), coherence (does the set of entries form a sensible, non-overlapping architecture; are connections meaningful), evidenceHonesty (no overclaims: prices, eligibility, diagnosis), simplicity (low friction for visitors relative to value), nonRedundancy (no duplicated entries/questions/existing tools). Then overall, 2–4 reasons, the single best idea across both, the weakest idea, and which idea a renovation business owner would most likely pay for. Return JSON: {"criteria":{…},"overall","reasons":[],"bestIdea","weakestIdea","ownerWouldPayFor"}.

BUSINESS: ${u.business.name} — ${u.business.summary}
KEY FACTS: ${u.facts.map((x) => `${x.label}: ${x.value}`).join(" · ")}
EXISTING TOOLS: ${u.assets.map((a) => `${a.assetId} (${a.role})`).join(", ")}

=== PROPOSAL A ===
${describe(A)}

=== PROPOSAL B ===
${describe(B)}`,
  });
  cost += usage.costUsd;
  const who = (x: string) => (x === "tie" ? "tie" : (x === "A") !== flip ? "original" : "revised");
  const crit = Object.fromEntries(Object.entries(v.criteria).map(([k, x]) => [k, who(x as string)]));
  tally[who(v.overall)]++;
  await fs.writeFile(path.join(dir, `judge-${d.site}.json`), JSON.stringify({ site: d.site, model: usage.models.judge, flip, overall: who(v.overall), criteria: crit, raw: v }, null, 1));
  console.log(`\n=== ${d.site}: overall → ${who(v.overall)} (judge ${usage.models.judge}, $${usage.costUsd.toFixed(4)})`);
  console.log("criteria:", crit);
  console.log("reasons:", v.reasons.map((r) => r.replace(/\bProposal A\b|\bA\b/g, flip ? "REVISED" : "ORIGINAL").replace(/\bProposal B\b|\bB\b/g, flip ? "ORIGINAL" : "REVISED")));
  console.log("best idea:", v.bestIdea, "| owner would pay for:", v.ownerWouldPayFor, "| weakest:", v.weakestIdea);
}
console.log("\nTALLY:", tally, `cost $${cost.toFixed(4)}`);
