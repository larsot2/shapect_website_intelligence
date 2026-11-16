/**
 * CLI: run a full real analysis without the UI.
 *   npm run scan -- https://www.example.com.au/
 * Reads IAEDU_* from .env (server-side only). Writes data/scans/<id>/.
 */
import fs from "node:fs";
for (const line of (fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const { newJob, runScan } = await import("../src/lib/analyzer/pipeline");
const { newScanId, readBlueprint } = await import("../src/lib/analyzer/store");

const url = process.argv[2];
if (!url) { console.error("usage: npm run scan -- <url>"); process.exit(1); }
const host = new URL(/^https?:/.test(url) ? url : `https://${url}`).hostname;
const job = newJob(newScanId(host), url);
let last = "";
const timer = setInterval(async () => {
  const j = JSON.parse(fs.readFileSync(`data/scans/${job.scanId}/job.json`, "utf8"));
  const line = `${j.phase} · ${j.activity.at(-1) ?? ""}`;
  if (line !== last) console.log(line);
  last = line;
}, 1000);
await runScan(job);
clearInterval(timer);
console.log(`\nstatus: ${job.status}${job.error ? ` — ${job.error}` : ""}\nscan: ${job.scanId}`);
const bp = (await readBlueprint(job.scanId)) as any;
if (bp) {
  console.log(`business: ${bp.website.businessName}\nsummary: ${bp.website.summary}\nstrategy: ${bp.conversionStrategy.label}`);
  console.log(`pages: ${bp.pages.length} (${bp.pages.filter((p: any) => p.screenshots.length).length} captured) · assets: ${bp.conversionAssets.map((a: any) => `${a.kind}:${a.label}`).join(" | ")}`);
  console.log(`services: ${bp.services.map((s: any) => `${s.label}[${s.scope}${s.supportedInV1 ? "" : ",unsupported"}]`).join(", ")}`);
  for (const s of bp.suggestedExperiences) console.log(`\n▶ ${s.label} (${s.action}, ${s.confidence}) — ${s.headline}\n   pages: ${s.pageContexts.map((c: any) => c.pageId).join(", ")} → ${s.conversionTargetAssetId}\n   touchpoints: ${s.touchpoints.map((t: any) => `${t.pageId}${t.positionVerified ? "✓" : "?"}`).join(", ")}\n   caps: ${s.capabilityKeys.join(", ")}`);
  console.log(`\nopportunities: ${bp.unsupportedOpportunities.map((o: any) => `${o.label} (${o.reason})`).join("; ")}`);
  console.log(`not suggested: ${bp.gateDecisions.map((g: any) => `${g.rule} ${g.label}`).join("; ")}`);
  console.log(`claims: ${bp.businessClaims.map((c: any) => `${c.label}=${c.value} [${c.status}]`).join(" | ")}`);
  console.log(`run:`, bp.run);
}
process.exit(0);
