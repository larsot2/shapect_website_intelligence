# Shapect — Website Intelligence Analyzer (V1, analysis-only)

“Your website, understood.” A Studio view that shows what Shapect understood about a renovator's website, 0–3 evidence-backed experience suggestions, the existing conversion journey, business facts to confirm, concept-only connections and a screenshot preview with measured overlays.

**Current slice: S1 on a clearly labelled demo fixture** (fictional *Northwind Bathrooms*). No live scan or LLM is wired into the UI yet. See `docs/S0-integration-plan.md`.

## Run locally

```bash
npm install
npm run dev            # http://localhost:3000 → Studio › Website › Northwind (Demo fixture)
```

Checks:

```bash
npm run typecheck && npm run lint && npm test && npm run build
npm start & npm run smoke     # UI smoke flow (Playwright), desktop + mobile
```

Rebuild the fixture screenshots and positions (renders `fixtures/demo-site` with Playwright):

```bash
npm run fixture:capture
```

## Layout

| Path | Purpose |
|---|---|
| `src/lib/blueprint/` | JSON contract (Zod), reference validation, pluggable `BlueprintSource` |
| `src/lib/review/` | Review decisions, kept separate from the immutable snapshot |
| `src/components/analysis/` | Results UI, review/why drawers, connection map, website preview |
| `src/app/studio/website/` | Start screen, results, `/preview` |
| `fixtures/` | Demo site (fictional), hand-authored analysis source, generated blueprint |
| `scripts/` | Fixture capture, UI smoke |

Hard scope: no entries, builder, bridges, ProjectState, pricing, Business Foundation import, snippets or publishing.
