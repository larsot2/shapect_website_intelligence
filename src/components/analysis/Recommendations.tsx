"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, CircleHelp, Clock, Eye, Lock, RotateCcw, Sparkles, ThumbsDown, Wrench } from "lucide-react";
import type { ExperienceSuggestion } from "@/lib/blueprint/schema";
import { Button, Chip, Drawer, SectionHeading } from "@/components/ui";
import { editedText, useAnalysis } from "./AnalysisContext";
import { EvidenceList } from "./Evidence";
import { Shot } from "./Shot";
import { actionLabel, fieldUsageLabel, reviewLabel, reviewTone } from "./labels";
import { incompleteParts } from "./PartialNotice";

const capabilityText: Record<string, string> = {
  guided_questions: "Guided questions", scope_summary: "Project summary", style_choices: "Style choices", preference_summary: "Preference summary",
  budget_reference: "Your public price references", project_checklist: "Consultation checklist", existing_form_handoff: "Hands over to your form",
  existing_booking_handoff: "Links to your booking", form_improvement_advice: "Form advice", cta_placement_advice: "Button advice",
};

type Panel = { kind: "review" | "why"; id: string } | null;

export function Recommendations() {
  const { bp } = useAnalysis();
  const [panel, setPanel] = useState<Panel>(null);
  const list = bp.suggestedExperiences;
  const active = panel ? list.find((s) => s.id === panel.id) : undefined;

  return (
    <section aria-labelledby="rec-title">
      <SectionHeading id="recommendations" eyebrow={`${list.length} of at most 3`} title="What we recommend" />
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
      {active && panel?.kind === "review" && <ReviewDrawer s={active} onClose={() => setPanel(null)} onWhy={() => setPanel({ kind: "why", id: active.id })} />}
      {active && panel?.kind === "why" && <WhyDrawer s={active} onClose={() => setPanel(null)} onReview={() => setPanel({ kind: "review", id: active.id })} />}
    </section>
  );
}

function RecommendationCard({ s, index, onReview, onWhy }: { s: ExperienceSuggestion; index: number; onReview: () => void; onWhy: () => void }) {
  const { asset, page, decisionFor, decide, undo, screenshot } = useAnalysis();
  const d = decisionFor("suggestion", s.id);
  const target = s.conversionTargetAssetId ? asset(s.conversionTargetAssetId) : undefined;
  const ActionIcon = s.action === "improve" ? Wrench : Sparkles;

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

  return (
    <article
      data-testid={`card-${s.id}`}
      className={`grid overflow-hidden rounded-2xl border bg-paper lg:grid-cols-[1fr_380px] ${index === 0 ? "border-ink/15 shadow-[0_18px_50px_-30px_rgba(18,26,31,.4)]" : "border-line"}`}
    >
      <div className="flex flex-col p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={s.action === "improve" ? "sky" : "go"}>
            <ActionIcon className="size-3" aria-hidden /> {actionLabel[s.action]}
          </Chip>
          {s.confidence < 0.6 && <Chip tone="amber">Optional idea</Chip>}
          {d && <Chip tone={reviewTone[d.status]}>{reviewLabel[d.status]}</Chip>}
        </div>
        <h3 className="mt-4 text-[22px] font-semibold tracking-tight">{s.label}</h3>
        <p className="mt-2 max-w-[560px] text-[16px] leading-relaxed text-ink-soft">{s.headline}</p>

        <div className="mt-6 flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-ink-mute">On</span>
          {s.pageContexts.map((c) => (
            <span key={c.pageId} className="rounded-md bg-canvas px-2 py-0.5 font-medium text-ink-soft">{page(c.pageId)?.title}</span>
          ))}
          {target && (
            <>
              <ArrowRight className="size-3.5 text-ink-mute" aria-label="leads to" />
              <span className="rounded-md bg-go-soft px-2 py-0.5 font-medium text-go-ink">{target.label}</span>
            </>
          )}
        </div>

        <div className="mt-auto flex flex-wrap gap-2 pt-7">
          <Button variant="primary" onClick={onReview}>Review suggestion</Button>
          <Button variant="secondary" onClick={onWhy}>
            <CircleHelp className="size-4" aria-hidden /> See why
          </Button>
          <Button variant="quiet-danger" onClick={() => decide({ targetKind: "suggestion", targetId: s.id, status: "rejected" })}>
            Not for us
          </Button>
        </div>
      </div>

      <div className="relative border-t border-line bg-canvas/70 p-5 lg:border-t-0 lg:border-l">
        {(() => {
          const withShot = s.pageContexts.filter((c) => screenshot(c.pageId));
          const shown = withShot.slice(0, 2);
          const rest = s.pageContexts.filter((c) => !shown.includes(c));
          return (
            <>
              {shown.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {shown.map((c) => (
                    <figure key={c.pageId} className={shown.length === 1 ? "col-span-2" : ""}>
                      <Shot pageId={c.pageId} className={`${shown.length === 1 ? "aspect-[16/10]" : "aspect-[4/5]"} rounded-lg border border-line shadow-sm`} />
                      <figcaption className="mt-2 line-clamp-2 text-[12px] leading-snug text-ink-soft">“{editedText(d, `pageContext.${c.pageId}.startingHook`, c.startingHook)}”</figcaption>
                    </figure>
                  ))}
                </div>
              ) : null}
              {rest.length > 0 && (
                <ul className={`space-y-1.5 ${shown.length ? "mt-3" : ""}`}>
                  {rest.slice(0, shown.length ? 3 : 5).map((c) => (
                    <li key={c.pageId} className="rounded-lg bg-paper px-3 py-2 text-[12px] ring-1 ring-line">
                      <span className="font-medium text-ink">{page(c.pageId)?.title}</span>
                      <span className="block truncate text-ink-mute">“{editedText(d, `pageContext.${c.pageId}.startingHook`, c.startingHook)}”</span>
                    </li>
                  ))}
                </ul>
              )}
              {s.pageContexts.length > 1 && <p className="mt-2 text-[12px] text-ink-mute">One experience on {s.pageContexts.length} pages, framed for each.</p>}
            </>
          );
        })()}
      </div>
    </article>
  );
}

function ReviewDrawer({ s, onClose, onWhy }: { s: ExperienceSuggestion; onClose: () => void; onWhy: () => void }) {
  const { page, asset, decisionFor, decide, undo, base } = useAnalysis();
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
                  {t.positionVerified ? (
                    <Link href={`${base}/preview?page=${t.pageId}&marker=${t.id}`} className="ml-auto inline-flex items-center gap-1 font-medium text-go hover:underline">
                      <Eye className="size-3.5" aria-hidden /> See on page
                    </Link>
                  ) : (
                    <span className="ml-auto text-ink-mute">Suggested section, exact position not verified</span>
                  )}
                </div>
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
      subtitle="What we saw on your website, and how we read it."
      footer={<Button variant="primary" onClick={onReview}>Review suggestion</Button>}
    >
      <ol className="space-y-3">
        {s.reasoning.map((r, i) => (
          <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-go-soft text-[12px] font-semibold text-go-ink">{i + 1}</span>
            {r}
          </li>
        ))}
      </ol>
      <h3 className="mt-8 mb-3 text-sm font-semibold">Seen on your website</h3>
      <EvidenceList items={s.evidence} />
      <p className="mt-6 text-[12px] text-ink-mute">
        The quotes are observed. The recommendation itself is our suggestion — you decide.
      </p>
    </Drawer>
  );
}
