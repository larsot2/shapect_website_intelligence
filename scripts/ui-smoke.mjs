/**
 * Browser walkthrough of the Passion Built demo (desktop).
 *   npm run build && npm start   (in another shell)
 *   BASE_URL=http://localhost:3000 SHOTS=./tmp-smoke node scripts/ui-smoke.mjs
 * Checks: every Entry completes, Bridges carry answers, no external network requests.
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? "  ✓" : "  ✗"} ${msg}`); if (!cond) failed++; };
const shot = async (page, name) => { if (SHOTS) { await page.waitForTimeout(450); await page.screenshot({ path: `${SHOTS}/${name}.png` }); } };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const external = [];
const errors = [];
page.on("request", (r) => { const u = new URL(r.url()); if (!["localhost", "127.0.0.1"].includes(u.hostname)) external.push(r.url()); });
page.on("pageerror", (e) => errors.push(e.message));

const exp = () => page.getByTestId("experience");
const click = (name) => exp().locator("button", { hasText: name }).first().click();

console.log("website");
await page.goto(`${BASE}/demo/passion-built`);
await page.getByTestId("page-home").waitFor();
await page.getByTestId("reset").click();
await page.waitForTimeout(900);
ok(await page.getByTestId("touchpoint-cost").isVisible(), "homepage shows the Cost Estimator touchpoint");
await shot(page, "01-website-home");

console.log("cost estimator");
await page.getByTestId("touchpoint-cost").getByRole("button", { name: "Explore Renovation Costs" }).click();
await exp().waitFor();
await click("Complete bathroom renovation"); await click("Continue");
await click("Main bathroom"); await click("Average"); await click("Keep where they are"); await click("Continue");
await click("Modern comfort"); await click("See my cost guide");
ok(await exp().getByText("$22–28K").first().isVisible(), "shows the published reference span ($22–28K)");
ok(await exp().getByText("Illustrative scenario").first().isVisible(), "distinguishes published / illustrative / actual quote");
await shot(page, "02-cost-result");
await click("Continue to Project Readiness");
ok(await page.getByTestId("bridge-banner").isVisible(), "bridge banner shows on Project Readiness");
ok(await exp().getByText("you won't be asked again").first().isVisible(), "readiness lists already-known answers");
ok(!(await exp().getByText("Which room?").first().isVisible()), "room is not asked again");
await shot(page, "03-readiness-from-cost");
await exp().getByRole("button", { name: "Close" }).click();

console.log("design explorer");
await page.getByTestId("page-design").click();
await page.waitForTimeout(700);
await shot(page, "04-website-design");
await page.getByTestId("launch-current").click();
await exp().getByRole("button", { name: /Warm & Natural/ }).click(); await click("Continue");
for (const v of ["Walk-in shower", "Timber with storage", "Calm neutral", "Soft & warm"]) { await click(v); await page.waitForTimeout(400); }
await click("Drawers in the vanity"); await click("Mirror cabinet");
await shot(page, "05-design-features");
await click("Continue");
for (const v of ["Easy maintenance", "More storage", "Relaxation & comfort"]) await click(v);
await click("Create my design direction");
ok(await exp().getByText("Your design direction").first().isVisible(), "design direction result");
await shot(page, "06-design-result");
await click("Continue to Project Readiness");
ok(await exp().getByText("Warm & Natural").first().isVisible(), "style carried into Project Readiness");
ok(!(await exp().getByText("Which room?").count()), "room still not asked (known from the cost guide)");
await exp().getByRole("radio", { name: "House", exact: true }).click();
await click("Continue");
await click("A modern look"); await exp().getByRole("radio", { name: "In 1–3 months" }).click();
await click("Create my brief");
ok(await exp().getByText("Your Renovation Brief Is Ready.").first().isVisible(), "brief created");
ok(await exp().getByText(/Passion Built published reference/).first().isVisible(), "brief includes the cost reference");
await shot(page, "07-brief");
await click("Request a Free Site Inspection");
ok(await exp().getByText("isn't sent automatically").first().isVisible(), "hand-off is honest (nothing submitted)");
await exp().getByRole("button", { name: "Close" }).click();

console.log("granny flat");
await page.getByTestId("page-granny").click(); await page.waitForTimeout(500);
await page.getByTestId("launch-current").click();
await click("Yes, let's plan"); await click("Rental property"); await click("Continue");
await click("Not enough room"); await click("Limited storage"); await click("Continue");
await click("Wall-hung vanity"); await click("Mirror cabinet"); await click("Hard-wearing");
await shot(page, "08-granny-adaptive");
await click("Create my plan");
ok(await exp().getByText("Questions to clarify at the site inspection").first().isVisible(), "granny flat plan with site-inspection questions");
await shot(page, "09-granny-plan");
await exp().getByRole("button", { name: "Close" }).click();

console.log("apartment");
await page.getByTestId("page-apartment").click(); await page.waitForTimeout(500);
await page.getByTestId("launch-current").click();
await click("I'm renovating an apartment");
const rows = exp().getByRole("radiogroup");
await rows.nth(0).getByRole("radio", { name: "Yes" }).click();
await rows.nth(1).getByRole("radio", { name: "Not sure" }).click();
await rows.nth(2).getByRole("radio", { name: "Yes" }).click();
await click("Lift access"); await click("Copy of the by-laws");
await click("See my readiness overview");
ok(await exp().getByText("Needs clarification").first().isVisible() && await exp().getByText("Discuss with Passion Built").first().isVisible(), "readiness overview has three columns");
ok(!(await exp().getByText(/%/).count()), "no percentage score");
await shot(page, "10-apartment-overview");
await exp().getByRole("button", { name: "Close" }).click();

console.log("network");
await page.getByTestId("view-network").click();
await page.getByTestId("edge-b-design").click();
ok(await page.getByTestId("network-detail").getByText("Carried over").first().isVisible(), "clicking a bridge explains carried fields");
await shot(page, "11-network");
await page.getByTestId("node-state").click();
ok(await page.getByTestId("network-detail").getByText("Shared session memory").first().isVisible(), "ProjectState node lists the session memory");
await page.getByTestId("open-memory").click();
await shot(page, "12-memory");
await page.keyboard.press("Escape");

console.log("independent start + reset");
await page.getByTestId("reset").click();
await page.getByTestId("view-website").click();
await page.getByTestId("page-house").click(); await page.waitForTimeout(500);
await page.getByTestId("launch-current").click();
ok(await exp().getByText("What kind of property is it?").first().isVisible(), "Project Readiness works on its own (asks the basics)");
await exp().getByRole("button", { name: "Close" }).click();

ok(errors.length === 0, `no page errors ${errors.slice(0, 2).join(" | ")}`);
ok(external.length === 0, `no external network requests (${external.length}) ${external.slice(0, 3).join(" ")}`);

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nsmoke passed");
process.exit(failed ? 1 : 0);
