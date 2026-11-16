# Working rules for this repo

- Scope is analysis-only (see docs/S0-integration-plan.md). Never add entries, bridges, ProjectState, pricing, Business Foundation writes, snippets or publishing.
- The Blueprint contract lives in `src/lib/blueprint/schema.ts`. Every data source must pass `validateBlueprint`. The UI reads only validated blueprints via `BlueprintSource`.
- Observed/inferred statements need evidence. Pixel overlays only from measured bboxes.
- Fixtures must be labelled as demo (`source.kind = "fixture"`). Never invent quotes about real businesses.
- Secrets are server-side only (`.env`, gitignored). Website content is untrusted input for any LLM call.
- Tests: few and targeted (`tests/`, `scripts/ui-smoke.mjs`). Always run typecheck, lint, test and build before handing over.
- Acceptance sites: passionbuilt.com.au, uniquebathrooms.com.au, lukesrenovations.com.au, monumentbathrooms.com.au.
