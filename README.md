# Shapect · Passion Built Experience Network demo

A deterministic, fully interactive product demo: how Shapect turns a traditional renovation website (Passion Built, Sydney) into a connected network of customer-specific Experiences.

No LLM, no AI pipeline, no backend, no API keys. All content is typed local configuration. There are zero external network requests while the demo runs.

```bash
npm install
npm run dev            # http://localhost:3000 → /demo/passion-built
```

## What it shows

- **Website** — real screenshots of five Passion Built pages (Home, Design, Granny Flat, Apartment, House), each with its Shapect touchpoint inserted at a sensible position. The live site is not modified.
- **Five Entries**, each with its own interaction and outcome:

| Entry | Touchpoint | Interaction | Outcome |
|---|---|---|---|
| Bathroom Cost Estimator | Home, after the hero | four visual steps | Passion Built's **own published** cost references (source-attributed), separated from a real quote |
| Bathroom Design Explorer | Design, after the design service content | image-led choices with real Passion Built project photos, priority ranking | Design Direction with moodboard |
| Granny Flat Bathroom Planner | Granny Flat, after the intro | use-first, adapts to the chosen challenges | plan + questions for the site inspection |
| Apartment Renovation Readiness | Apartment, after the approvals content | short check | Known / Needs clarification / Discuss (no scores) |
| Project Readiness & Quote Brief | House page + continuation of all others | asks only what's missing | renovation brief → Passion Built's existing quotation page |

- **Entry Network** — touchpoints, Bridges (explicit continuations), session reuse (passive memory) and hand-offs to the existing contact/quotation pages. Click any node or connection for details.
- **ProjectState** — typed session memory; only confirmed answers are stored, each with the Experience it came from. Page context never becomes project data; reviewed by-laws never become an approval.
- **Presenter tools** — Guided demo (7 repeatable steps), Project memory panel, Load sample project (fictional), Reset demo.

Hand-offs are honest: they open Passion Built's own page and let the visitor copy/download their summary; nothing is submitted automatically.

## Layout

| Path | Purpose |
|---|---|
| `src/lib/demo/passion.ts` | pages, placements, Entries, connections, verbatim published prices and apartment notes (with source URLs) |
| `src/lib/demo/state.tsx` | ProjectState, provenance, persistence (sessionStorage), reset, sample project |
| `src/lib/demo/cost.ts` | deterministic matching of selections to published references |
| `src/components/demo/` | dashboard, website preview, touchpoints, network, Experience modal, the five Entries |
| `public/demo/passion-built/` | page screenshots and project photos captured from passionbuilt.com.au |

## Checks

```bash
npm run typecheck && npm run lint && npm test && npm run build
npm start & BASE_URL=http://localhost:3000 npm run smoke   # desktop browser walkthrough
```

The previous AI analysis pipeline (crawler, Gemini/GLM strategy, critic) is preserved on the `archive/intelligence-v3` branch.
