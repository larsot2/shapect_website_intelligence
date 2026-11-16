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
const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });

const browser = await chromium.launch();
try {
  console.log("desktop");
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(`${BASE}/studio/website`);
  assert(await page.getByRole("heading", { name: /understand your website/i }).isVisible(), "start screen renders");
  assert(await page.getByRole("button", { name: "Analyse website" }).isDisabled(), "live scan button honestly disabled");
  await page.getByRole("link", { name: /Northwind Bathrooms/ }).click();
  await page.waitForURL(/fixture-northwind$/);
  assert(await page.getByText("Demo fixture").first().isVisible(), "fixture is clearly labelled");
  assert(await page.getByRole("heading", { name: "What we recommend" }).isVisible(), "recommendations section");
  await shot(page, "01-results");

  const planner = page.getByTestId("card-sx-project-planner");
  await planner.getByRole("button", { name: "See why" }).click();
  assert(await page.getByRole("dialog").getByText("Seen on your website").isVisible(), "why panel shows evidence");
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

  await page.getByTestId("claim-c-region").getByRole("button", { name: "Confirm" }).click();
  await page.getByTestId("connection-cn-planner-to-form").getByRole("button", { name: "Keep" }).click();
  assert(await page.getByTestId("connection-cn-planner-to-form").getByText("Kept in plan").isVisible(), "connection kept (concept only)");
  await page.getByTestId("connection-cn-planner-to-form").scrollIntoViewIfNeeded();
  await shot(page, "04-connections");

  await page.reload();
  assert(await page.getByTestId("card-sx-project-planner").getByText("Confirmed with your edits").isVisible(), "decision survives reload");
  assert(await page.getByTestId("card-sx-style-explorer").getByText("marked as not for you").isVisible(), "rejection survives reload");
  assert(await page.getByTestId("claim-c-region").getByText("Confirmed by you").isVisible(), "claim decision survives reload");

  await page.goto(`${BASE}/studio/website/fixture-northwind/preview?page=small&marker=tp-small-midpage`);
  assert(await page.getByRole("button", { name: /Suggested: Bathroom Project Planner/ }).isVisible(), "touchpoint overlay on screenshot");
  assert(await page.getByRole("heading", { name: "Bathroom Project Planner" }).isVisible(), "marker panel opens from deep link");
  await shot(page, "05-preview-touchpoint");
  await page.goto(`${BASE}/studio/website/fixture-northwind/preview?page=cost-guide`);
  await page.getByRole("button", { name: /Existing: Book a free consultation \(end-of-article\)/ }).click();
  await page.getByRole("radio", { name: /Keep/ }).click();
  assert(await page.getByText("Your choice saved").isVisible(), "asset action changed by user");
  await shot(page, "06-preview-asset");
  assert(errors.length === 0, `no page errors (${errors.join("; ")})`);
  await ctx.close();

  console.log("mobile");
  const m = await browser.newContext({ ...devices["iPhone 13"] });
  const mp = await m.newPage();
  await mp.goto(`${BASE}/studio/website/fixture-northwind`);
  assert(await mp.getByRole("heading", { name: "What we recommend" }).isVisible(), "results render on mobile");
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
