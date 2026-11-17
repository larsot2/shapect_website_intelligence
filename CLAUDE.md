# Working rules for this repo

- Current phase: deterministic Passion Built demo (`/demo/passion-built`). No LLM calls, no model providers, no backend, no API keys. The previous AI pipeline lives on branch `archive/intelligence-v3` — don't reintroduce it here.
- All demo content is typed local config in `src/lib/demo/`. Never invent Passion Built prices, quotes or rules: prices come verbatim from their published cost article (with source), apartment notes verbatim from their apartment page.
- ProjectState stores only what a visitor confirmed. Page context is not project data; a preference is not a product selection; reviewed by-laws are not an approval.
- Hand-offs open Passion Built's existing pages; never claim data was submitted.
- Don't modify the separate main Shapect application.
- Tests stay few and targeted (`tests/`, `scripts/ui-smoke.mjs`, desktop only). Run typecheck, lint, test and build before handing over.
