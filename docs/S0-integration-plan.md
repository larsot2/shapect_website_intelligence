# S0 — Inventory & integration plan (Website Intelligence Analyzer V1)

Status: 2026-11-16 · Slice S0 + S1 complete, waiting for founder review.

## 1. What actually exists (verified, not assumed)

| Item | Finding |
|---|---|
| Session workspace | `/home/user` was empty; the only attached repo is `larsot2/shapect_website_intelligence`. |
| This repo | **Created 2026-11-16 12:38 UTC, empty** (GitHub size 0, no branches/commits) when attached. |
| Existing Shapect codebase (Business Foundation, Offerings, Pricing, Entries, `CLAUDE.md`, ADR-0005, Studio/Auth/Supabase) | **Not available in this session.** It lives in another repo that isn't attached. Nothing about it was assumed or re-implemented. |
| Python uv scraper (`main.py`, `ai_analyzer.py`) + research results | **Not available in this session.** Same reason. |
| Network | Since the founder enabled full access: all 4 reference sites return 200. |
| LLM endpoint | `IAEDU_ENDPOINT` verified with one connectivity call (no site data sent): IAEDU agent-chat stream, POST multipart (`channel_id`, `thread_id`, `user_info`, `message`), header `x-api-key`, response = NDJSON events (`start` → `token`* → `message` → `done`). `message.content.response_metadata` reports `model_provider: "openai"`, `model: "gpt-5.5"`. Model choice lives in the IAEDU agent config, not in our request. |

**Consequence:** this repo is built as a *self-contained analyzer module* with one strict JSON contract, so it can be dropped into / called from the main Shapect Studio without a parallel architecture. No Business Foundation, Offerings, Pricing, Entry, Bridge or ProjectState code exists here, by design.

## 2. Architecture (minimal)

```
Studio UI (Next.js, this repo for now)            ← later: route inside the main Shapect Studio
   │  reads only a validated Blueprint
   ▼
BlueprintSource  (src/lib/blueprint/source.ts)
   ├─ fixtureSource       S1  clearly labelled demo snapshots
   └─ scanSnapshotSource  S2+ snapshots written by the analyzer job
                              (S4: tenant-scoped tables/storage of the main Shapect backend)
   ▲
Python analyzer (analyzer/, uv)                     S2/S3
   crawl (requests+bs4, SSRF-safe) → Playwright captures (3–5 pages) →
   LLM adapter (IAEDU/OpenAI, server-side key) → deterministic gates → Blueprint JSON
```

Switching from demo to real data = adding `scanSnapshotSource` to the `sources` list. The UI, schema and review logic stay untouched.

## 3. Contract

* `src/lib/blueprint/schema.ts`: Zod schema `wib-0.1` (pages, groups, services, claims, conversion assets, strategy, coverage, journeys, ≤3 suggestions, asset actions, connections, opportunities, gate decisions, diagnostics). Observed/inferred claims **must** cite evidence. Pixel positions per viewport only if measured.
* `src/lib/blueprint/validate.ts`: schema plus a cross-reference check. Invalid snapshots are refused and never half-rendered.
* `src/lib/review/review.ts`: review decisions (`confirmed|edited|rejected|deferred`) are stored **separately** from the immutable snapshot and reconciled on load. Persistence is localStorage for S1 only. S4 moves it to `website_analysis_reviews` in the main backend.
* The Python side will emit the same JSON. The Zod schema stays the source of truth, and a JSON Schema export can be generated for Pydantic.

## 4. Reuse plan for the existing scraper (needs repo access)

1. Attach the repo containing `main.py` / `ai_analyzer.py`.
2. Keep requests+BeautifulSoup extraction (title, headings, links), move it into `analyzer/crawl.py`, and add: SSRF guard on every hop and redirect (public IPs only, DNS re-check), robots.txt, ≤2 parallel fetches/host, 429/503 backoff, size/type/time caps, budget of 25 pages, page grouping.
3. Reuse the existing LLM call sites, but route them through one adapter (`analyzer/llm.py`) with provider and model from env, structured JSON output, validation and retry, and provider/model/prompt version logged into `analysis`.
4. Existing research results are converted into the frozen real-scan fixtures used for evaluation.

## 5. Acceptance set (always test these four)

| Site | Expected pattern | Forbidden failure |
|---|---|---|
| Passion Built — passionbuilt.com.au | Consultation-first; content and service segments | Inventing makeovers or online 3D tools |
| Unique Bathrooms — uniquebathrooms.com.au | Calculator-first; existing calculator detected | Recommending a second estimator |
| Luke's Renovations — lukesrenovations.com.au | Guided qualification and upload path | Calling a price anchor a calculator |
| Monument Bathrooms — monumentbathrooms.com.au | Consultation and booking-first | Replacing the existing booking path |

## 6. Next: E2E slice (after review)

URL → SSRF-safe crawl (Python) → 3–5 Playwright captures with bboxes → classification/extraction/recommendation via GPT-5.5 (IAEDU) → gates → Blueprint → `scanSnapshotSource` → same UI. Scan start runs from the Studio as a small job with real phase status. Tests stay small: SSRF, gates (the four sites' negative rules), schema, one smoke flow.

## 7. Risks / open points

* **Rotate the IAEDU key.** It was shared in chat. `.env` is gitignored; the key is only read server-side.
* The IAEDU agent may carry its own system prompt. Verify that it doesn't interfere with strict JSON output at S3.
* Integration target (route inside the main Studio vs. separate service) is decided once the main repo is visible.
