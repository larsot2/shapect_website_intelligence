# Shapect — Website Intelligence Analyzer

Enter a renovator's website → Shapect reads it (adaptively, read-only), understands the business with Gemini models via OpenRouter, builds a context & decision matrix, maps the existing conversion paths on real screenshots and proposes 0–3 evidence-backed entry concepts with context variants — with review, correction and persistence. No entries, builder, bridges, pricing or publishing (analysis only).

## Run

```bash
npm install
cp .env.example .env      # OPENROUTER_API_KEY + Gemini model ids (server-side only)
npm run build && npm start   # http://localhost:3000 → Studio › Website
```

Dev: `npm run dev`. Without OPENROUTER_API_KEY the analyzer still crawls and captures, and labels the result as partial.

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
| B Select | score candidates, light-fetch the top ~28, then seeds (home, main CTA target, core service, FAQ, pricing) + greedy coverage/novelty of topics from URL slug + H1 (~8–12 pages) | no |
| C Inspect | deep extraction (boilerplate removed): content blocks, CTAs, forms + fields, calculators (incl. JS widgets), booking, phone/email, prices; Playwright only as fallback for JS pages | no |
| Inventory | deterministic conversion assets across pages | no |
| Evidence | typed verbatim sentences with ids (E1…); the LLM cites ids, never writes quotes | no |
| Understand | 1 call (`google/gemini-3.1-flash-lite-preview`): business, offerings, facts incl. exclusions, conversion, 3–8 customer/project contexts with decisions, constraints, coverage and V1 support; follow-up pages → 1 delta call merged field-wise | yes |
| Capture | desktop + mobile screenshots of ~5 key pages, measured CTA/form/section boxes (runs in parallel with Understand) | no |
| Strategy | 1 call (`google/gemini-3.1-pro-preview`): opportunities per context → consolidation → 0–3 entries with context variants, question plan, project data contract, touchpoints, connection modes | yes |
| Gates | redundant estimator (N-02), unsupported scope per variant, capabilities, forbidden hooks, pricing boundary, field catalog, evidence, established paths kept, handoff honesty, context fidelity | no |

Measured cost (real OpenRouter usage): 3 LLM calls, ~18k input tokens, about $0.024 per site; no model fallback (a failed call yields a labelled partial result). Frozen-input evaluation: `FROZEN_SET=v2 npx tsx scripts/eval.ts <variant>`, results in `docs/eval-v2.md`.

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
