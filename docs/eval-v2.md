# Website Intelligence V2: frozen-input evaluation

All runs read the same frozen crawl (`data/frozen/v2/<site>`, 10–12 pages per site, captured once). The baseline is the V1 prompts and pipeline running on the same Gemini models. The final run is the last iteration, `v2f`. `scripts/eval.ts <variant>` reproduces any run. The LLM cache makes a re-run with unchanged prompts free.

## Cost and latency (real OpenRouter usage)

| | LLM calls / site | input tokens (4 sites) | output tokens (4 sites) | cost (4 sites) |
|---|---|---|---|---|
| Baseline (V1 prompts) | 2–3 (full understanding replay on follow-up) | 138,852 | 45,318 | **$0.135** |
| V2 full run (`v2c`, all stages uncached) | 3 (understanding, delta, strategy) | 73,793 | 38,651 | **$0.096** |
| V2 strategy-only re-run (`v2f`) | 1 | 24,823 | 10,463 | $0.044 |

Input tokens fell by about 47%. Most of that comes from the delta follow-up, which sends only new pages and fields instead of replaying the whole understanding. Evidence lines are typed and capped (170) and resolved by id, so the model never re-types quotes. There is no budget cap; cost is only measured. Total spend across all V2 iterations was about $0.71.

## Side by side

### Passion Built

| Baseline | Final (V2) |
|---|---|
| 3 entries: *Project & Budget Planner*, *Style & Design Matcher*, *Apartment Renovation Checklist*. The checklist duplicated the planner, so it was redundant. | **1 entry: Bathroom Project Planner**, with variants: **apartment** (floor level, concrete slab, strata, all evidenced) and **bathroom + laundry combo** (appliance layout). House and granny-flat bathrooms differ only in copy and use the common flow. |
| No context model; apartment was the only context surfaced, as its own tool. | 6 contexts considered (house, apartment, bathroom+laundry, granny flat, commercial = unsupported, townhouse = detected stub). |
| The handoff implied that data carries over into the inspection form. | The handoff is `external_link`, and Property type / Suburb are listed as **not passed**. |

Remaining weaknesses:
- The townhouse page is detected but not analysed, and is flagged to the owner.
- The common questions are fairly generic.

### Unique Bathrooms

| Baseline | Final (V2) |
|---|---|
| *Bathroom Style Planner* and *Renovation Readiness Guide*. Both were generic and ignored the existing calculator. | **1 entry** next to the calculator. The calculator is kept, and N-02 blocked a redundant estimator. Variants: **ensuite** (shared bedroom wall: acoustics and ventilation, evidenced) and **general bathroom** (multi-room, plumbing move). |
| Laundry, kitchen and structural pages were mixed into the bathroom pitch. | Laundry, kitchen, structural and general renovation are marked **unsupported for V1** deterministically, with their own decisions recorded. |

Remaining weaknesses:
- The headline "technical precision" is weak copy.
- The general variant overlaps with the common flow.

### Luke's Renovations

| Baseline | Final (V2) |
|---|---|
| *Bathroom Project Planner* [improve] **plus** *Renovation Budget Guide*. Both duplicated the existing multi-step qualification and price guide. | **1 entry, action `improve` on the existing multi-step form.** The rationale says a separate planner would be redundant. It adds questions the current flow lacks: apartment vs house approval, layout change, and fixtures excluded from the $20k "from" price (evidenced). Variants: **standard 2-week bathroom** and **sunroom → bathroom conversion** (existing drainage). |
| — | The multi-step form and the quote form are kept. Earlier V2 runs created a "Bondi bathroom" context from a suburb page; suburb-family pages are now removed deterministically (iteration d). |

Remaining weaknesses:
- The design and waterproofing pages appear only as topic stubs.
- The connection to the improved form is still shown as a link, because there is no integration in V1.

### Monument Bathrooms

| Baseline | Final (V2) |
|---|---|
| One generic *Residential Project Planner*. The booking tool was mislabelled third-party because the first CTA said "Quote". | **1 entry targeting their own booking tool.** The sister domain `monumentprojects` counts as their own. Variants: **apartment/strata**, **accessible / NDIS**, and **luxury**. |
| Context-blind. | 7 contexts. Commercial is unsupported. |

Remaining weaknesses, flagged honestly in the output rather than hidden:
- **Small bathroom** and **ensuite** are supported contexts, but no recommendation adapts to them yet.
- **Budget** is a detected stub.
- The luxury variant's question ("primary focus") is thin.

## What changed (root cause → fix)

| Failure in baseline or early V2 | Root cause | Fix |
|---|---|---|
| Key pages missing (apartment, FAQ, pricing) | crawl selection | coverage/novelty selection: seeds, topic tags only from slug + H1 |
| Redundant second and third tools | strategy | one entry with context variants, plus consolidation rationale and recommendationCount |
| Duplicating an existing qualification | strategy | "improve the existing form, or none" rule; established paths are kept |
| Monument booking labelled third party | inventory | upgrade on any occurrence, sister-domain ownership |
| Commercial or kitchen marked supported | understanding | deterministic `normaliseContexts` |
| Delta merge wiped decisions (a tolerant schema hid empty fields) | schema/merge | field-wise merge; empty delta fields keep their value |
| Suburb pages became contexts | understanding | cluster members and suburb pages dropped from contexts |
| Contexts silently uncovered | gates | context fidelity: being named in an opportunity is not coverage. Copy-only contexts use the common flow; everything else is flagged. |
| Size → price question without a calculator | strategy | pricing-boundary gate, plus the calculator field only where a calculator exists |

## Do the tolerant schemas hide errors?

The relaxed parts are optional prose (`optText`) and enum fallbacks (`.catch(...)`). We checked each one:
- **Critical fields are not tolerant.** Evidence ids must resolve, or the item is dropped and listed as `weak_evidence`. Field keys must exist in `FIELD_CATALOG`. Page and asset ids are filtered against the crawl. A context with no valid pages falls back to keyword matching or is dropped.
- **Enum fallbacks default to the cautious value** (`owner_review`, `partial`, `needs_review`), never to `supported`.
- **One real case where tolerance hid an error:** delta contexts with empty arrays replaced full contexts. The field-wise merge fixed it.
- **Contexts with no decisions are still visible.** Passion's house and granny-flat contexts, and Monument's small and ensuite contexts, have empty `unresolvedDecisions`. They show up in the output as contexts without decisions rather than being filled in. This is a remaining weakness of the understanding stage.

## Do the selection heuristics generalise?

Selection only, no LLM, on three non-evaluation sites:
- **vividbathrooms:** picked small, apartment, luxury, commercial, packages and quote. A `/home-page` duplicate of the home page was found and is now filtered.
- **bellebathrooms:** 7 pages read. Apart from 81 suburb pages it has few candidates; the suburb pages were correctly clustered and not read.
- **beaureno:** picked 3D drawings, apartment, cost and FAQ.

The heuristics use generic topic tags (property type, room type, design, pricing, FAQ, booking), not site-specific rules. The one bathroom-specific seed (`/bathroom-renovation*`) matches the product scope.

## Gate status

| Gate | Status |
|---|---|
| Redundancy (N-02, one entry per goal) | **passed** on all 4 sites (Unique: estimator blocked) |
| Unsupported scope (commercial/kitchen/laundry/structural) | **passed** (deterministic) |
| Evidence on every constraint and entry | **passed** (unresolved ids dropped) |
| Established paths kept (calculator, booking, multi-step) | **passed** |
| Handoff honesty (no implied data transfer) | **passed**: every connection to an existing form is `external_link` with unavailable fields listed. No `session_reuse` appears because each site has one entry. |
| Context fidelity | **unresolved** on Monument (small and ensuite not adapted) and partly on Passion and Luke's (topic stubs not analysed). Reported in the output, not hidden. |
| Non-generic recommendations | **partially resolved**: context variants are specific and evidenced, but the common question plan (property type / room / layout / timeframe) is nearly identical across sites. |
| Run-to-run stability | **unresolved**: temperature is now 0, but earlier runs differed (Monument v2b produced a separate Style & Budget Finder). One run per variant was used to save credit. |
