#!/usr/bin/env node
/**
 * UI smoke flow (spec §11.1/5): start → results → why → review/edit → reject/undo
 * → claim confirm → preview marker → reload keeps decisions. Desktop + mobile.
 * Usage: start the app (npm run dev / npm start), then `npm run smoke`.
 * Optional: SMOKE_SHOTS=dir to save screenshots.
 */
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";

const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SMOKE_SHOTS;
if (SHOTS) await mkdir(SHOTS, { recursive: true });

const assert = (cond, msg) => { if (!cond) throw new Error(`SMOKE FAIL: ${msg}`); console.log(`  ✓ ${msg}`); };
const visible = async (locator, ms = 6000) => locator.first().waitFor({ state: "visible", timeout: ms }).then(() => true, () => false);
const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });

const browser = await chromium.launch();
try {
  console.log("desktop");
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // reset stored review decisions for the fixture so the run is repeatable
  await fetch(`${BASE}/api/reviews/fixture-northwind`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ scanId: "fixture-northwind", snapshotVersion: "fixture-2026-11-16.1", decisions: {} }) });

  await page.goto(`${BASE}/studio/website`);
  assert(await page.getByRole("heading", { name: /understand your website/i }).isVisible(), "start screen renders");
  await page.getByLabel("Your website address").fill("example.com.au");
  await page.getByRole("button", { name: /Analyse website/ }).click();
  assert(await page.getByText(/confirm you're allowed/i).isVisible(), "scan requires the permission confirmation");
  await page.getByRole("link", { name: /Northwind Bathrooms/ }).click();
  await page.waitForURL(/fixture-northwind$/);
  assert(await page.getByText("Demo fixture").first().isVisible(), "fixture is clearly labelled");
  assert(await visible(page.getByRole("heading", { name: /What we recommend — at a glance/ })), "overview with recommendations at a glance");
  await shot(page, "01-results");
  await page.getByRole("tab", { name: /Recommended experiences/ }).click();
  assert(await visible(page.getByRole("heading", { name: "Recommended experiences" })), "recommendations tab");

  const planner = page.getByTestId("card-sx-project-planner");
  assert(await planner.getByText("Proposed experience").isVisible(), "recommendation shows a proposed experience flow");
  await planner.getByRole("button", { name: "See why" }).click();
  assert(await page.getByRole("dialog").getByRole("heading", { name: /What we know/ }).isVisible(), "why panel separates what we know");
  await shot(page, "02-why");
  await page.keyboard.press("Escape");

  await planner.getByRole("button", { name: "Review suggestion" }).click();
  const dialog = page.getByRole("dialog");
  const hook = dialog.getByRole("textbox").first();
  await hook.fill("Small bathroom? Let's see what fits.");
  await shot(page, "03-review");
  await dialog.getByRole("button", { name: "Confirm with edits" }).click();
  assert(await planner.getByText("Confirmed with your edits").isVisible(), "suggestion confirmed with edits");

  const style = page.getByTestId("card-sx-style-explorer");
  await style.getByRole("button", { name: "Not for us" }).click();
  assert(await style.getByText("marked as not for you").isVisible(), "reject collapses card");

  await page.getByRole("tab", { name: /What we learned/ }).click();
  await page.getByTestId("claim-c-region").getByRole("button", { name: "Confirm" }).click();
  await page.getByRole("tab", { name: /How they work together/ }).click();
  await page.getByTestId("connection-cn-planner-to-form").getByRole("button", { name: "Keep" }).click();
  assert(await page.getByTestId("connection-cn-planner-to-form").getByText("Kept in plan").isVisible(), "connection kept (concept only)");
  await page.getByTestId("connection-cn-planner-to-form").scrollIntoViewIfNeeded();
  await shot(page, "04-connections");

  await page.goto(`${BASE}/studio/website/fixture-northwind?view=recommendations`);
  assert(await visible(page.getByTestId("card-sx-project-planner").getByText("Confirmed with your edits")), "decision survives reload");
  assert(await visible(page.getByTestId("card-sx-style-explorer").getByText("marked as not for you")), "rejection survives reload");
  await page.goto(`${BASE}/studio/website/fixture-northwind?view=verify`);
  assert(await visible(page.getByTestId("claim-c-region").getByText("Confirmed by you")), "claim decision survives reload");

  await page.goto(`${BASE}/studio/website/fixture-northwind/preview?page=small&marker=tp-small-midpage`);
  assert(await page.getByRole("button", { name: /Suggested: Bathroom Project Planner/ }).isVisible(), "touchpoint overlay on screenshot");
  assert(await page.getByRole("heading", { name: "Bathroom Project Planner" }).isVisible(), "marker panel opens from deep link");
  await shot(page, "05-preview-touchpoint");
  await page.goto(`${BASE}/studio/website/fixture-northwind/preview?page=cost-guide`);
  await page.getByRole("button", { name: /Existing: Book a free consultation \(end-of-article\)/ }).click();
  await page.getByRole("radio", { name: /Keep/ }).click();
  assert(await page.getByText("Your choice saved").isVisible(), "asset action changed by user");
  await shot(page, "06-preview-asset");
  // optional: the newest real scan renders with real screenshots
  const scans = await (await fetch(`${BASE}/api/scans`)).json();
  const real = scans.find((x) => x.status === "done");
  if (real) {
    await page.goto(`${BASE}/studio/website/${real.scanId}`);
    assert(await visible(page.getByRole("tab", { name: /Recommended experiences/ })), `real scan renders (${real.businessName})`);
    await page.goto(`${BASE}/studio/website/${real.scanId}/preview`);
    assert(await page.locator("img[alt^='Screenshot of']").first().isVisible(), "real screenshot shown in preview");
    await shot(page, "09-real-preview");
  }
  assert(errors.length === 0, `no page errors (${errors.join("; ")})`);
  await ctx.close();

  console.log("mobile");
  const m = await browser.newContext({ ...devices["iPhone 13"] });
  const mp = await m.newPage();
  await mp.goto(`${BASE}/studio/website/fixture-northwind`);
  assert(await visible(mp.getByRole("heading", { name: /What we recommend — at a glance/ })), "results render on mobile");
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(overflow <= 1, `no horizontal scroll on mobile (overflow ${overflow}px)`);
  await shot(mp, "07-mobile-results");
  await mp.goto(`${BASE}/studio/website/fixture-northwind/preview?vp=mobile&page=home`);
  assert(await mp.getByRole("radio", { name: "Mobile" }).getAttribute("aria-checked") === "true", "mobile preview toggle");
  await shot(mp, "08-mobile-preview");
  await m.close();
  console.log("smoke passed");
} finally {
  await browser.close();
}
