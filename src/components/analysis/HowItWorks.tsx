"use client";

import { useState } from "react";
import { ChevronRight, CircleCheck, CircleSlash, FileText, MousePointerClick, PhoneCall } from "lucide-react";
import type { Journey } from "@/lib/blueprint/schema";
import { Chip, Drawer, SectionHeading } from "@/components/ui";
import { useAnalysis } from "./AnalysisContext";
import { EvidenceList } from "./Evidence";
import { capabilityLabel, coverageLabel, coverageTone } from "./labels";
import { stepBasis } from "@/lib/blueprint/derive";

export function HowItWorks({ embedded = false }: { embedded?: boolean }) {
  const { bp, asset } = useAnalysis();
  const [why, setWhy] = useState(false);
  const primary = bp.journeys.find((j) => j.primary) ?? bp.journeys[0];
  const others = bp.journeys.filter((j) => j !== primary);
  const keeps = bp.assetActions.filter((a) => a.proposal === "keep");
  const keptAssets = [...new Map(keeps.map((k) => [k.assetId, k])).values()].slice(0, 4);

  return (
    <section aria-labelledby="how-title">
      {embedded ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] text-ink-mute">Solid boxes are on your website. <span className="rounded border border-dashed border-ink-mute/60 px-1">Dashed</span> boxes are our interpretation.</p>
          <button type="button" onClick={() => setWhy(true)} className="text-sm font-medium text-go hover:underline">How we know</button>
        </div>
      ) : (
        <SectionHeading id="how" eyebrow="How your website works today" title={`${bp.conversionStrategy.label}`}>
          <button type="button" onClick={() => setWhy(true)} className="text-sm font-medium text-go hover:underline">How we know</button>
        </SectionHeading>
      )}

      <div className="rounded-2xl border border-line bg-paper p-6 sm:p-8">
        <JourneyRow j={primary} large />
        {others.length > 0 && (
          <div className="mt-6 grid gap-4 border-t border-line pt-6 md:grid-cols-2">
            {others.map((j) => <JourneyRow key={j.id} j={j} />)}
          </div>
        )}
      </div>

      {bp.visitorDecisions.length > 0 && (
        <div className="mt-5 rounded-2xl border border-line bg-paper p-6">
          <h3 className="text-sm font-semibold">What your visitors are trying to decide</h3>
          <ul className="mt-4 grid gap-x-8 gap-y-3 md:grid-cols-2">
            {bp.visitorDecisions.map((v) => (
              <li key={v.decision} className="flex items-start justify-between gap-3 text-[14px]">
                <span>{v.decision}</span>
                <Chip tone={v.coverage === "covered" ? "go" : v.coverage === "partial" ? "amber" : "neutral"}>
                  {v.coverage === "covered" ? "Well supported" : v.coverage === "partial" ? "Partly" : "Not yet"}
                </Chip>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border border-line bg-paper p-6">
          <h3 className="text-sm font-semibold">What visitors can already do</h3>
          <ul className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {bp.coverage.map((c) => (
              <li key={c.capability} className="text-[14px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{capabilityLabel[c.capability]}</span>
                  <Chip tone={coverageTone[c.level]}>{coverageLabel[c.level]}</Chip>
                </div>
                <p className="mt-0.5 text-[13px] leading-snug text-ink-mute">{c.note}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-5">
          {keptAssets.length > 0 && <div className="rounded-2xl border border-go/20 bg-go-soft/50 p-6">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-go-ink"><CircleCheck className="size-4" aria-hidden /> Keep what works</h3>
            <ul className="mt-3 space-y-2 text-[14px]">
              {keptAssets.map((k) => (
                <li key={k.id}><span className="font-medium">{asset(k.assetId)?.label}</span> <span className="text-ink-soft">— {k.rationale}</span></li>
              ))}
            </ul>
          </div>}
          {bp.gateDecisions.length > 0 && (
            <div className="rounded-2xl border border-line bg-paper p-6">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><CircleSlash className="size-4 text-ink-mute" aria-hidden /> What we deliberately don&apos;t suggest</h3>
              <ul className="mt-3 space-y-2 text-[14px]">
                {bp.gateDecisions.map((g) => (
                  <li key={g.id}><span className="font-medium">{g.label}</span> <span className="text-ink-soft">— {g.note}</span></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <Drawer open={why} onClose={() => setWhy(false)} title={bp.conversionStrategy.label} subtitle="Our interpretation, based on what your pages say and link to. We can't see your enquiry numbers.">
        <EvidenceList items={[...bp.conversionStrategy.evidence, ...bp.journeys.flatMap((j) => j.evidence)]} />
      </Drawer>
    </section>
  );
}

function JourneyRow({ j, large = false }: { j: Journey; large?: boolean }) {
  const { page, asset } = useAnalysis();
  return (
    <div>
      <p className={`mb-3 font-medium ${large ? "text-[13px] text-go" : "text-[13px] text-ink-mute"}`}>{j.label}</p>
      <ol className="flex flex-wrap items-center gap-y-3">
        {j.steps.map((s, i) => {
          const a = s.assetId ? asset(s.assetId) : undefined;
          const Icon = s.kind === "outcome" ? CircleCheck : a?.kind === "phone" ? PhoneCall : a ? MousePointerClick : FileText;
          const inferred = stepBasis(s) === "inferred";
          return (
            <li key={s.id} className="flex items-center">
              <div title={inferred ? "Our interpretation — not shown on your website" : undefined}
                className={`rounded-xl border ${inferred ? "border-dashed border-ink-mute/50 bg-paper" : s.kind === "outcome" ? "border-go/30 bg-go-soft/60" : "border-line bg-canvas/60"} ${large ? "px-4 py-3" : "px-3 py-2"}`}>
                <div className={`flex items-center gap-2 font-medium ${large ? "text-[15px]" : "text-[13px]"}`}>
                  <Icon className={`size-4 shrink-0 ${s.kind === "outcome" ? "text-go" : "text-ink-mute"}`} aria-hidden />
                  {s.label}
                </div>
                {large && s.pageIds.length > 0 && (
                  <p className="mt-0.5 pl-6 text-[12px] text-ink-mute">{s.pageIds.map((p) => page(p)?.title).join(" · ")}</p>
                )}
                {large && a?.siteWide && <p className="mt-0.5 pl-6 text-[12px] text-ink-mute">On most pages</p>}
                {inferred && <p className="mt-0.5 pl-6 text-[11px] text-ink-mute italic">likely — not shown on your website</p>}
              </div>
              {i < j.steps.length - 1 && <ChevronRight className="mx-1.5 size-4 shrink-0 text-ink-mute" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
