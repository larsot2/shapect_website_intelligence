"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { Chip, Disclosure } from "@/components/ui";
import { SnapshotHero } from "./SnapshotHero";
import { Recommendations } from "./Recommendations";
import { HowItWorks } from "./HowItWorks";
import { BusinessFacts } from "./BusinessFacts";
import { ConnectionMap } from "./ConnectionMap";
import { ScanDetails } from "./ScanDetails";
import { ReviewProgress } from "./ReviewProgress";
import { PartialNotice } from "./PartialNotice";
import { useAnalysis } from "./AnalysisContext";
import { experienceSteps, priorityOf } from "@/lib/blueprint/derive";
import { reviewLabel } from "./labels";

export type View = "overview" | "recommendations" | "together" | "verify";

/**
 * Four focused views instead of one long page:
 * Overview → Recommended experiences → How they work together → What we learned (verify).
 */
export function ResultsView() {
  const { bp, decisionFor } = useAnalysis();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("view");
  const view: View = raw === "recommendations" || raw === "together" || raw === "verify" ? raw : "overview";
  const go = (v: View, anchor?: string) => {
    router.replace(v === "overview" ? pathname : `${pathname}?view=${v}`, { scroll: false });
    requestAnimationFrame(() => {
      const el = anchor ? document.getElementById(anchor) : null;
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      else window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };
  const critical = bp.businessClaims.filter((c) => c.critical);
  const openFacts = critical.filter((c) => !decisionFor("claim", c.id)).length;
  const live = bp.suggestedExperiences.filter((s) => decisionFor("suggestion", s.id)?.status !== "rejected");

  const tabs: { key: View; label: string; badge?: React.ReactNode }[] = [
    { key: "overview", label: "Overview" },
    { key: "recommendations", label: "Recommended experiences", badge: <span className="text-ink-mute">{live.length}</span> },
    { key: "together", label: "How they work together" },
    { key: "verify", label: "What we learned", badge: openFacts > 0 ? <span className="rounded-full bg-amber-soft px-1.5 text-[11px] text-amber">{openFacts}</span> : undefined },
  ];

  return (
    <>
      <nav aria-label="Analysis sections" className="sticky top-14 z-20 border-b border-line bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] gap-1 overflow-x-auto px-4 sm:px-6" role="tablist">
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={view === t.key} onClick={() => go(t.key)}
              className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-[14px] font-medium transition-colors ${view === t.key ? "border-ink text-ink" : "border-transparent text-ink-mute hover:text-ink"}`}>
              {t.label} {t.badge}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-[1180px] px-4 pt-8 pb-24 sm:px-6 lg:pt-10">
        {view === "overview" && (
          <div className="space-y-10">
            <PartialNotice />
            <SnapshotHero onSeeRecommendations={() => go("recommendations")} />
            {live.length > 0 && (
              <section aria-labelledby="glance-title">
                <h2 id="glance-title" className="mb-3 text-[13px] font-medium text-ink-mute">What we recommend — at a glance</h2>
                <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper">
                  {live.map((s) => {
                    const i = bp.suggestedExperiences.indexOf(s);
                    const pr = priorityOf(i, s);
                    const d = decisionFor("suggestion", s.id);
                    return (
                      <li key={s.id}>
                        <button type="button" onClick={() => go("recommendations", `card-${s.id}`)} className="group flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 text-left hover:bg-canvas/60">
                          <Chip tone={pr.tone}>{pr.label}</Chip>
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold">{s.label}</span>
                            <span className="block truncate text-[13px] text-ink-mute">{experienceSteps(s, bp).map((x) => x.title).join(" → ")}</span>
                          </span>
                          {d && <span className="text-[12px] text-go-ink">{reviewLabel[d.status]}</span>}
                          <ArrowRight className="size-4 text-ink-mute transition-transform group-hover:translate-x-0.5" aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}
            {critical.length > 0 && (
              <button type="button" onClick={() => go("verify")} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-paper px-5 py-4 text-left hover:border-ink-mute">
                <ClipboardCheck className={`size-5 ${openFacts ? "text-amber" : "text-go"}`} aria-hidden />
                <span className="flex-1">
                  <span className="block font-semibold">{openFacts ? `${openFacts} facts about your business to confirm` : "All key facts reviewed"}</span>
                  <span className="block text-[13px] text-ink-mute">What we read on your website — confirm, correct or reject. Nothing is changed anywhere.</span>
                </span>
                <ArrowRight className="size-4 text-ink-mute" aria-hidden />
              </button>
            )}
          </div>
        )}

        {view === "recommendations" && <Recommendations />}

        {view === "together" && (
          <div>
            <h2 className="text-[26px] font-semibold tracking-tight">How they work together</h2>
            <p className="mt-1 mb-6 max-w-[720px] text-ink-soft">Where each experience appears, how visitors could move between them without repeating themselves, and where they hand over to what you already have.</p>
            <ConnectionMap />
          </div>
        )}

        {view === "verify" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-[26px] font-semibold tracking-tight">What we learned</h2>
              <p className="mt-1 text-ink-soft">Confirm, correct or reject what we read. It only affects this analysis.</p>
            </div>
            {critical.length > 0 && <BusinessFacts embedded />}
            <div className="space-y-3">
              <Disclosure id="how" title="How your website works today" summary={`${bp.conversionStrategy.label} · ${bp.journeys.length} path${bp.journeys.length === 1 ? "" : "s"} · ${bp.gateDecisions.length} things we deliberately don't suggest`}>
                <HowItWorks embedded />
              </Disclosure>
              <Disclosure id="pages" title="What we read" summary={`${bp.diagnostics.scannedPageCount} pages read · ${bp.pages.filter((p) => p.screenshots.length).length} with screenshots${bp.unsupportedOpportunities.length ? ` · ${bp.unsupportedOpportunities.length} ideas noted for later` : ""}`}>
                <ScanDetails embedded />
              </Disclosure>
            </div>
          </div>
        )}
      </main>
      <ReviewProgress />
    </>
  );
}
