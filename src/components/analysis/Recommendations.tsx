"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, CircleHelp, Clock, Eye, Lock, RotateCcw, Sparkles, ThumbsDown, Wrench, Link2 } from "lucide-react";
import type { ExperienceSuggestion } from "@/lib/blueprint/schema";
import { Button, Chip, Disclosure, Drawer, SectionHeading } from "@/components/ui";
import { editedText, useAnalysis } from "./AnalysisContext";
import { EvidenceList } from "./Evidence";
import { Shot } from "./Shot";
import { actionLabel, fieldUsageLabel, reviewLabel, reviewTone } from "./labels";
import { incompleteParts } from "./PartialNotice";
import { experienceSteps, placementVerdicts, priorityOf } from "@/lib/blueprint/derive";

const capabilityText: Record<string, string> = {
  guided_questions: "Guided questions", scope_summary: "Project summary", style_choices: "Style choices", preference_summary: "Preference summary",
  budget_reference: "Your public price references", project_checklist: "Consultation checklist", existing_form_handoff: "Hands over to your form",
  existing_booking_handoff: "Links to your booking", form_improvement_advice: "Form advice", cta_placement_advice: "Button advice",
};

const actionHint: Record<string, string> = {
  add: "Adds a step your website doesn't offer yet",
  improve: "Makes something you already have work better",
  connect: "Adds a step that leads into something you already have",
  reposition: "Moves an existing entry point to a better place",
  none: "Keep as it is",
};

type Panel = { kind: "review" | "why"; id: string } | null;

export function Recommendations() {
  const { bp } = useAnalysis();
  const [panel, setPanel] = useState<Panel>(null);
  const list = bp.suggestedExperiences;
  const active = panel ? list.find((s) => s.id === panel.id) : undefined;

  return (
    <section aria-labelledby="rec-title">
      <div id="recommendations" className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="rec-title" className="text-[26px] font-semibold tracking-tight">Recommended experiences</h2>
          <p className="mt-1 text-ink-soft">{list.length ? `${list.length} idea${list.length > 1 ? "s" : ""}, most useful first. You decide — nothing is built.` : ""}</p>
        </div>
        {list.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-mute" aria-label="What the labels mean">
            <li title="Something your website doesn't offer yet"><Sparkles className="mr-1 inline size-3 text-go" aria-hidden />New = adds a missing step</li>
            <li title="Makes something you already have work better"><Wrench className="mr-1 inline size-3 text-sky" aria-hidden />Improve = upgrades what you have</li>
            <li title="Links a new step with what you already have"><Link2 className="mr-1 inline size-3 text-go" aria-hidden />Connect = adds a step before your existing one</li>
          </ul>
        )}
      </div>
      {list.length === 0 && incompleteParts(bp).recommendations ? (
        <div className="rounded-2xl border border-dashed border-line bg-paper/60 p-8">
          <p className="text-lg font-semibold">No recommendations yet.</p>
          <p className="mt-1 text-ink-soft">The AI part of this scan didn&apos;t finish, so we won&apos;t guess. Scan again to get recommendations.</p>
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-line bg-paper p-8">
          <p className="text-lg font-semibold">Keep what you have.</p>
          <p className="mt-1 text-ink-soft">{bp.diagnostics.limitations.find((l) => l.startsWith("Keep what you have:"))?.replace("Keep what you have: ", "") ?? "Your website already covers the decisions visitors need to make. We don't suggest adding anything."}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {list.map((s, i) => (
            <RecommendationCard key={s.id} s={s} index={i} onReview={() => setPanel({ kind: "review", id: s.id })} onWhy={() => setPanel({ kind: "why", id: s.id })} />
          ))}
        </div>
      )}
      <ContextsConsidered />
      {active && panel?.kind === "review" && <ReviewDrawer s={active} onClose={() => setPanel(null)} onWhy={() => setPanel({ kind: "why", id: active.id })} />}
      {active && panel?.kind === "why" && <WhyDrawer s={active} onClose={() => setPanel(null)} onReview={() => setPanel({ kind: "review", id: active.id })} />}
    </section>
  );
}

function RecommendationCard({ s, index, onReview, onWhy }: { s: ExperienceSuggestion; index: number; onReview: () => void; onWhy: () => void }) {
  const { bp, asset, page, decisionFor, decide, undo, screenshot } = useAnalysis();
  const d = decisionFor("suggestion", s.id);
  const target = s.conversionTargetAssetId ? asset(s.conversionTargetAssetId) : undefined;
  const ActionIcon = s.action === "improve" ? Wrench : s.action === "connect" ? Link2 : Sparkles;
  const pr = priorityOf(index, s);

  if (d?.status === "rejected") {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-line bg-paper/60 px-5 py-4 text-sm" data-testid={`card-${s.id}`}>
        <ThumbsDown className="size-4 text-ink-mute" aria-hidden />
        <span className="font-medium text-ink-soft">{s.label}</span>
        <span className="text-ink-mute">— marked as not for you</span>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => undo("suggestion", s.id)}>
          <RotateCcw className="size-3.5" aria-hidden /> Undo
        </Button>
      </div>
    );
  }

  const steps = experienceSteps(s, bp);
  const lead = s.pageContexts.find((c) => screenshot(c.pageId)) ?? s.pageContexts[0];
  return (
    <article
      id={`card-${s.id}`}
      data-testid={`card-${s.id}`}
      className={`grid scroll-mt-32 overflow-hidden rounded-2xl border bg-paper lg:grid-cols-[1fr_280px] ${index === 0 ? "border-go/40 shadow-[0_18px_50px_-30px_rgba(18,26,31,.4)] ring-1 ring-go/15" : "border-line"}`}
    >
      <div className="flex flex-col p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span title={pr.hint}><Chip tone={pr.tone} className="font-semibold">{index === 0 && pr.tone === "go" ? "★ " : ""}{pr.label}</Chip></span>
          <span title={actionHint[s.action]}><Chip><ActionIcon className="size-3" aria-hidden /> {actionLabel[s.action]}</Chip></span>
          {d && <Chip tone={reviewTone[d.status]}>{reviewLabel[d.status]}</Chip>}
        </div>
        <h3 className="mt-3 text-[20px] font-semibold tracking-tight">{s.label}</h3>
        <p className="mt-1 max-w-[620px] text-[15px] leading-relaxed text-ink-soft">{s.headline}</p>

        {/* proposed experience — a conceptual visitor flow, not a generated experience */}
        <div className="mt-4">
          <p className="text-[11px] font-semibold tracking-wide text-ink-mute uppercase">Proposed experience</p>
          <ol className={`mt-2 grid gap-2 ${steps.length >= 4 ? "sm:grid-cols-4" : steps.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            {steps.map((st, i) => (
              <li key={i} className={`rounded-xl px-3 py-2.5 ${i === steps.length - 1 ? "bg-go-soft/60 ring-1 ring-go/20" : "bg-canvas ring-1 ring-line"}`}>
                <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                  <span className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] ${i === steps.length - 1 ? "bg-go text-white" : "bg-paper text-ink-soft ring-1 ring-line"}`}>{i + 1}</span>
                  {st.title}
                </p>
                <p className="mt-1 text-[12px] leading-snug text-ink-soft">{st.detail}</p>
              </li>
            ))}
          </ol>
          <p className="mt-1.5 text-[11px] text-ink-mute">Concept flow — nothing is generated or activated.</p>
        </div>

        {s.contextVariants.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[12px]" data-testid={`variants-${s.id}`}>
            <span className="text-ink-mute">Adapts to</span>
            {s.contextVariants.map((v) => (
              <span key={v.contextId} title={v.focus ?? v.startingHook} className="rounded-md bg-sky-soft px-2 py-0.5 font-medium text-sky">{contextLabel(bp, v.contextId)}</span>
            ))}
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
          <span className="text-ink-mute">On</span>
          {s.pageContexts.slice(0, 4).map((c) => (
            <span key={c.pageId} className="rounded-md bg-canvas px-2 py-0.5 font-medium text-ink-soft">{page(c.pageId)?.title}</span>
          ))}
          {s.pageContexts.length > 4 && <span className="text-ink-mute">+{s.pageContexts.length - 4}</span>}
          {target && (
            <>
              <ArrowRight className="size-3.5 text-ink-mute" aria-label="leads to" />
              <span className="rounded-md bg-go-soft px-2 py-0.5 font-medium text-go-ink">{target.label}</span>
            </>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="primary" onClick={onReview}>Review suggestion</Button>
          <Button variant="secondary" onClick={onWhy}>
            <CircleHelp className="size-4" aria-hidden /> See why
          </Button>
          <Button variant="quiet-danger" onClick={() => decide({ targetKind: "suggestion", targetId: s.id, status: "rejected" })}>
            Not for us
          </Button>
        </div>
      </div>

      <div className="border-t border-line bg-canvas/70 p-4 lg:border-t-0 lg:border-l">
        {lead && screenshot(lead.pageId) ? (
          <figure>
            <Shot pageId={lead.pageId} className="aspect-[4/3] rounded-lg border border-line shadow-sm" />
            <figcaption className="mt-2 text-[12px] leading-snug text-ink-soft">
              <span className="font-medium text-ink">{page(lead.pageId)?.title}:</span> “{editedText(d, `pageContext.${lead.pageId}.startingHook`, lead.startingHook)}”
            </figcaption>
          </figure>
        ) : (
          <p className="text-[12px] text-ink-soft">“{lead ? editedText(d, `pageContext.${lead.pageId}.startingHook`, lead.startingHook) : ""}”</p>
        )}
        {s.pageContexts.length > 1 && <p className="mt-2 text-[11px] text-ink-mute">Same experience on {s.pageContexts.length} pages, each with its own opening line.</p>}
      </div>
    </article>
  );
}

function ReviewDrawer({ s, onClose, onWhy }: { s: ExperienceSuggestion; onClose: () => void; onWhy: () => void }) {
  const { bp, page, asset, decisionFor, decide, undo, base } = useAnalysis();
  const verdicts = placementVerdicts(bp);
  const d = decisionFor("suggestion", s.id);
  const originals: Record<string, string> = Object.fromEntries([
    ...s.pageContexts.map((c) => [`pageContext.${c.pageId}.startingHook`, c.startingHook]),
    ...s.touchpoints.map((t) => [`touchpoint.${t.id}.headline`, t.headline]),
  ]);
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(originals).map(([k, v]) => [k, d?.edits?.[k] ?? v])),
  );
  const changed = Object.fromEntries(Object.entries(draft).filter(([k, v]) => v.trim() && v.trim() !== originals[k]).map(([k, v]) => [k, v.trim()]));
  const hasEdits = Object.keys(changed).length > 0;
  const target = s.conversionTargetAssetId ? asset(s.conversionTargetAssetId) : undefined;
  const save = (status: "confirmed" | "deferred" | "rejected") => {
    decide({ targetKind: "suggestion", targetId: s.id, status: status === "confirmed" && hasEdits ? "edited" : status, edits: changed });
    onClose();
  };

  const field = (key: string, label: string) => (
    <label className="block">
      <span className="text-[12px] text-ink-mute">{label}</span>
      <input
        value={draft[key]}
        maxLength={140}
        onChange={(e) => setDraft((x) => ({ ...x, [key]: e.target.value }))}
        className={`mt-1 w-full rounded-lg border bg-paper px-3 py-2 text-[14px] outline-none focus:border-go ${draft[key] !== originals[key] ? "border-go/60" : "border-line"}`}
      />
    </label>
  );

  return (
    <Drawer
      open
      onClose={onClose}
      title={s.label}
      subtitle={<span>{s.headline}</span>}
      footer={
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => save("confirmed")}>
              <Check className="size-4" aria-hidden /> {hasEdits ? "Confirm with edits" : "Confirm suggestion"}
            </Button>
            <Button onClick={() => save("deferred")}>
              <Clock className="size-4" aria-hidden /> Decide later
            </Button>
            <Button variant="quiet-danger" onClick={() => save("rejected")}>Not for us</Button>
            {d && (
              <Button variant="ghost" onClick={() => { undo("suggestion", s.id); onClose(); }}>
                <RotateCcw className="size-3.5" aria-hidden /> Reset
              </Button>
            )}
          </div>
          <p className="flex items-center gap-1.5 text-[12px] text-ink-mute">
            <Lock className="size-3.5" aria-hidden /> Saves your decision in this analysis only. Nothing is built, published or changed on your website.
          </p>
        </div>
      }
    >
      <div className="space-y-7">
        <div className="grid gap-3 rounded-xl bg-canvas p-4 text-[14px] sm:grid-cols-2">
          <div>
            <p className="text-[12px] text-ink-mute">For your visitors</p>
            <p className="mt-0.5">{s.customerNeed}</p>
          </div>
          <div>
            <p className="text-[12px] text-ink-mute">For you</p>
            <p className="mt-0.5">{s.businessGoal}</p>
          </div>
          {s.currentState && (
            <div className="sm:col-span-2">
              <p className="text-[12px] text-ink-mute">What your website does today</p>
              <p className="mt-0.5">{s.currentState}</p>
            </div>
          )}
          <div className="sm:col-span-2">
            <p className="text-[12px] text-ink-mute">What happens next</p>
            <p className="mt-0.5">{s.whatHappensNext}{target ? ` → ${target.label}` : ""}</p>
          </div>
        </div>

        <section>
          <h3 className="text-sm font-semibold">How it could work for a visitor</h3>
          <ol className="mt-2 space-y-2">
            {experienceSteps(s, bp).map((st, i) => (
              <li key={i} className="flex gap-3 text-[14px]">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-go-soft text-[12px] font-semibold text-go-ink">{i + 1}</span>
                <span><span className="font-medium">{st.title}</span><span className="block text-[13px] text-ink-soft">{st.detail}</span></span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[12px] text-ink-mute">A concept for discussion — no experience has been generated or activated.</p>
        </section>

        {s.contextVariants.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold">How this adapts to your website</h3>
            <p className="mt-0.5 text-[13px] text-ink-mute">One experience, with a few different questions depending on the visitor&apos;s situation.</p>
            <div className="mt-3 space-y-2.5">
              {s.contextVariants.map((v) => (
                <div key={v.contextId} className="rounded-xl border border-line p-3 text-[14px]">
                  <p className="font-medium">{contextLabel(bp, v.contextId)}</p>
                  <p className="mt-0.5 text-ink-soft">“{v.startingHook}”</p>
                  {v.focus && <p className="mt-1 text-[13px] text-ink-mute">Focus: {v.focus}</p>}
                  {v.additionalQuestions.length > 0 && (
                    <ul className="mt-2 space-y-1 text-[13px]">
                      {v.additionalQuestions.map((q) => <li key={q.question} className="flex gap-2"><span className="text-sky">+</span><span>{q.question}{q.when && <span className="text-ink-mute"> ({q.when})</span>}</span></li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {s.questionPlan.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold">What we&apos;d ask everyone</h3>
            <ol className="mt-2 space-y-1.5 text-[14px]">
              {s.questionPlan.map((q, i) => (
                <li key={q.question} className="flex gap-2">
                  <span className="w-5 shrink-0 text-right text-ink-mute tabular-nums">{i + 1}.</span>
                  <span>{q.question}{q.condition && <span className="text-[12px] text-ink-mute"> · only if {q.condition}</span>}{q.options?.length ? <span className="block text-[12px] text-ink-mute">{q.options.join(" · ")}</span> : null}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {s.consolidationRationale && (
          <section className="rounded-xl bg-canvas p-3 text-[14px]">
            <h3 className="text-sm font-semibold">Why one experience instead of several?</h3>
            <p className="mt-1 text-ink-soft">{s.consolidationRationale}</p>
          </section>
        )}

        <section>
          <h3 className="text-sm font-semibold">How it could start on each page</h3>
          <p className="mt-0.5 text-[13px] text-ink-mute">One experience, framed for the page it&apos;s on. You can reword the opening line.</p>
          <div className="mt-3 space-y-3">
            {s.pageContexts.map((c) => (
              <div key={c.pageId} className="flex gap-3">
                <Shot pageId={c.pageId} className="h-16 w-20 shrink-0 rounded-md border border-line" sizes="80px" />
                <div className="min-w-0 flex-1">{field(`pageContext.${c.pageId}.startingHook`, page(c.pageId)?.title ?? c.pageId)}</div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold">Where it would appear</h3>
          <div className="mt-3 space-y-3">
            {s.touchpoints.map((t) => (
              <div key={t.id} className="rounded-xl border border-line p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
                  <span className="font-medium">{page(t.pageId)?.title}</span>
                  {t.positionVerified && verdicts.get(t.id)?.quality !== "review" ? (
                    <Link href={`${base}/preview?page=${t.pageId}&marker=${t.id}`} className="ml-auto inline-flex items-center gap-1 font-medium text-go hover:underline">
                      <Eye className="size-3.5" aria-hidden /> See on page
                    </Link>
                  ) : t.positionVerified ? (
                    <Link href={`${base}/preview?page=${t.pageId}`} className="ml-auto inline-flex items-center gap-1 font-medium text-amber hover:underline">
                      <Eye className="size-3.5" aria-hidden /> Check spot
                    </Link>
                  ) : (
                    <span className="ml-auto text-ink-mute">Suggested section, exact position not verified</span>
                  )}
                </div>
                {verdicts.get(t.id) && verdicts.get(t.id)!.quality !== "unverified" && (
                  <p className={`mb-2 text-[12px] ${verdicts.get(t.id)!.quality === "good" ? "text-go-ink" : "text-amber"}`}>{verdicts.get(t.id)!.note}</p>
                )}
                {field(`touchpoint.${t.id}.headline`, "Headline")}
              </div>
            ))}
          </div>
        </section>

        {s.possibleProjectFields.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold">Information it could ask for</h3>
            <p className="mt-0.5 text-[13px] text-ink-mute">A plan only — nothing is collected or passed on yet.</p>
            <ul className="mt-3 divide-y divide-line rounded-xl border border-line text-[14px]">
              {s.possibleProjectFields.map((f) => (
                <li key={f.key} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span>{f.label}{f.semantics === "preference" && <span className="text-ink-mute"> · preference</span>}</span>
                  <Chip tone={f.usage === "needs_confirmation" ? "amber" : "neutral"}>{fieldUsageLabel[f.usage]}</Chip>
                </li>
              ))}
            </ul>
          </section>
        )}

        {s.prerequisites.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold">Before anything is built, you&apos;d confirm</h3>
            <ul className="mt-2 space-y-1.5 text-[14px] text-ink-soft">
              {s.prerequisites.map((q) => <li key={q} className="flex gap-2"><span className="text-go">✓</span>{q}</li>)}
            </ul>
          </section>
        )}

        {s.capabilityKeys.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold">What it would use</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {s.capabilityKeys.map((k) => <Chip key={k}>{capabilityText[k] ?? k.replace(/_/g, " ")}</Chip>)}
            </div>
          </section>
        )}

        {s.openQuestions.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold">Questions for you</h3>
            <ul className="mt-2 space-y-1.5 text-[14px] text-ink-soft">
              {s.openQuestions.map((q) => <li key={q} className="flex gap-2"><span className="text-amber">?</span>{q}</li>)}
            </ul>
          </section>
        )}

        <button type="button" onClick={onWhy} className="inline-flex items-center gap-1.5 text-sm font-medium text-go hover:underline">
          <CircleHelp className="size-4" aria-hidden /> Why we suggest this
        </button>
      </div>
    </Drawer>
  );
}

function WhyDrawer({ s, onClose, onReview }: { s: ExperienceSuggestion; onClose: () => void; onReview: () => void }) {
  return (
    <Drawer
      open
      onClose={onClose}
      title={`Why “${s.label}”?`}
      subtitle="What we know from your website, and what we suggest because of it."
      footer={<Button variant="primary" onClick={onReview}>Review suggestion</Button>}
    >
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Eye className="size-4 text-go" aria-hidden /> What we know <span className="font-normal text-ink-mute">— quoted from your website</span></h3>
      <EvidenceList items={s.evidence} />
      {s.currentState && (
        <p className="mt-4 flex gap-2 rounded-xl border border-dashed border-ink-mute/40 px-3 py-2.5 text-[14px] text-ink-soft">
          <span className="shrink-0 text-[11px] font-semibold tracking-wide text-ink-mute uppercase">We infer</span>{s.currentState}
        </p>
      )}
      <h3 className="mt-7 mb-3 flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-go" aria-hidden /> What we suggest — and why</h3>
      <ol className="space-y-2.5">
        {s.reasoning.map((r, i) => (
          <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-go-soft text-[12px] font-semibold text-go-ink">{i + 1}</span>
            {r}
          </li>
        ))}
      </ol>
      <p className="mt-6 text-[12px] text-ink-mute">The quotes are observed. The recommendation is our suggestion — you decide.</p>
    </Drawer>
  );
}

function contextLabel(bp: { contexts: { id: string; label: string }[] }, id: string) {
  return bp.contexts.find((c) => c.id === id)?.label ?? id.replace(/[-_]/g, " ");
}

const supportText: Record<string, { label: string; tone: "go" | "amber" | "neutral" }> = {
  supported: { label: "Fits", tone: "go" },
  partial: { label: "Partly fits", tone: "amber" },
  owner_review: { label: "Needs your input", tone: "amber" },
  unsupported: { label: "Not in scope yet", tone: "neutral" },
};

/** The context & decision matrix behind the recommendations — including what is NOT covered. */
function ContextsConsidered() {
  const { bp, page, suggestion } = useAnalysis();
  if (!bp.contexts.length) return null;
  const other = bp.opportunityInventory.filter((o) => !o.entryId);
  const merged = bp.opportunityInventory.filter((o) => o.entryId);
  const uncovered = bp.contexts.filter((c) => c.support !== "unsupported" && !c.addressedBy.length).length;
  const count = bp.recommendationCount;
  return (
    <div className="mt-8 space-y-3" data-testid="contexts-considered">
      <Disclosure
        id="contexts"
        title={`We considered ${bp.contexts.length} customer situations`}
        summary={[count ? `${count.count} recommendation${count.count === 1 ? "" : "s"}` : "", uncovered ? `${uncovered} not covered yet` : ""].filter(Boolean).join(" · ")}
      >
        {count?.rationale && <p className="mb-4 text-[14px] text-ink-soft">{count.rationale}</p>}
        <ul className="divide-y divide-line rounded-xl border border-line text-[14px]">
          {bp.contexts.map((c) => {
            const sp = supportText[c.support] ?? supportText.owner_review;
            return (
              <li key={c.id} className="px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.label}</span>
                  <Chip tone={sp.tone}>{sp.label}</Chip>
                  <span className="ml-auto text-[12px] text-ink-mute">
                    {c.addressedBy.length ? `Covered by ${c.addressedBy.join(", ")}` : c.support === "unsupported" ? "" : "Not covered by a recommendation yet"}
                  </span>
                </div>
                {(c.visitorDecisions.length > 0 || c.uniqueConstraints.length > 0) && (
                  <p className="mt-1 text-[12px] text-ink-soft">
                    {c.visitorDecisions.length > 0 && <>Visitors decide: {c.visitorDecisions.map((x) => x.replace(/_/g, " ")).join(", ")}. </>}
                    {c.uniqueConstraints.slice(0, 2).map((u) => `${u.text}${u.status === "to_confirm" ? " (to confirm)" : ""}`).join(" · ")}
                  </p>
                )}
                {c.sourcePageIds.length > 0 && <p className="mt-0.5 text-[11px] text-ink-mute">From: {c.sourcePageIds.slice(0, 3).map((id) => page(id)?.title ?? id).join(" · ")}</p>}
              </li>
            );
          })}
        </ul>
      </Disclosure>
      {other.length > 0 && (
        <Disclosure id="other-opps" title="Other opportunities we noted" summary={`${other.length} not turned into a recommendation`}>
          <ul className="space-y-2 text-[14px]">
            {other.map((o) => (
              <li key={o.id}>
                <span className="font-medium">{o.label}</span>
                <span className="text-ink-soft"> — {o.note ?? o.decisionGap}</span>
              </li>
            ))}
          </ul>
          {merged.length > 0 && (
            <p className="mt-3 text-[12px] text-ink-mute">
              Merged into a recommendation: {merged.map((o) => `${o.label} → ${suggestion(o.entryId!)?.label ?? "—"}`).join("; ")}
            </p>
          )}
        </Disclosure>
      )}
    </div>
  );
}
