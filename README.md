# Shapect — Website Intelligence Analyzer

Enter a renovator's website → Shapect reads it (adaptively, read-only), understands the business with GPT-5.5, maps the existing conversion paths on real screenshots and proposes 0–3 evidence-backed experiences — with review, correction and persistence. No entries, builder, bridges, pricing or publishing (analysis only).

## Run

```bash
npm install
cp .env.example .env      # IAEDU_API_KEY, IAEDU_CHANNEL_ID, IAEDU_ENDPOINT (server-side only)
npm run build && npm start   # http://localhost:3000 → Studio › Website
```

Dev: `npm run dev`. Without the IAEDU variables the analyzer still crawls and captures, and labels the result as partial.

CLI (same pipeline, no UI):

```bash
npm run scan -- https://www.example.com.au/
```

Checks:

```bash
npm run typecheck && npm run lint && npm test && npm run build
npm start & npm run smoke
```

## How a scan works

| Stage | What | LLM? |
|---|---|---|
| A Discover | homepage, robots.txt, sitemaps, nav/footer/body links, URL normalisation, dedupe, clustering of suburb/blog/project pages, heuristic page groups | no |
| B Select | score candidates, light-fetch the top ~28 (title, headings, forms, tools, prices), second-level links, pick ~8–15 pages with group coverage | no |
| C Inspect | deep extraction (boilerplate removed): content blocks, CTAs, forms + fields, calculators (incl. JS widgets), booking, phone/email, prices; Playwright only as fallback for JS pages | no |
| Inventory | deterministic conversion assets across pages | no |
| Understand | 1 bundled GPT-5.5 call: business, services, claims (verbatim quotes), page meaning, strategy, coverage, journeys, visitor decisions; may request ≤4 follow-up pages (one extra round) | yes |
| Capture | desktop + mobile screenshots of ~5 key pages, measured CTA/form/section boxes (runs in parallel with Understand) | no |
| Strategy | 1 bundled GPT-5.5 call: ≤3 experiences, starting contexts, touchpoints (section/CTA ids), asset actions, connections, opportunities | yes |
| Gates | no second calculator, unsupported scope (commercial/kitchen/laundry…), unsupported capabilities, forbidden hooks, unverifiable quotes, suburb pages collapsed, max 3 | no |

Typical cost: 2–3 LLM calls, ~30–50k tokens, about 2–3 minutes per site. Budgets live in `src/lib/analyzer/config.ts` (env-overridable).

## Layout

| Path | Purpose |
|---|---|
| `src/lib/analyzer/` | crawler, extraction, inventory, captures, LLM client and prompts, gates, pipeline, job runner, file store |
| `src/lib/blueprint/` | Blueprint contract (Zod) and validation; pluggable sources (live scans, demo fixture) |
| `src/lib/review/` | review decisions, stored separately from snapshots |
| `src/app/api/` | `scans`, `scans/[id]`, `scans/[id]/shots/[file]`, `reviews/[id]` |
| `src/components/analysis/` | results, progress, preview, review UI |
| `data/` (gitignored) | scans (job, blueprint, screenshots), reviews, HTTP/LLM caches |

See `docs/S0-integration-plan.md` for the original plan and `docs/acceptance.md` for the reference-site evaluation.
