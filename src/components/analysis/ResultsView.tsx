"use client";

import { Disclosure } from "@/components/ui";
import { SnapshotHero } from "./SnapshotHero";
import { Recommendations } from "./Recommendations";
import { HowItWorks } from "./HowItWorks";
import { BusinessFacts } from "./BusinessFacts";
import { ConnectionMap } from "./ConnectionMap";
import { ScanDetails } from "./ScanDetails";
import { ReviewProgress } from "./ReviewProgress";
import { PartialNotice } from "./PartialNotice";
import { useAnalysis } from "./AnalysisContext";

/**
 * Main view answers three questions — what we found, what we recommend, how it
 * could work. Deeper facts and evidence are one click away, not on the page.
 */
export function ResultsView() {
  const { bp, decisionFor } = useAnalysis();
  const critical = bp.businessClaims.filter((c) => c.critical);
  const open = critical.filter((c) => !decisionFor("claim", c.id)).length;
  return (
    <main className="mx-auto max-w-[1180px] space-y-14 px-4 pt-8 pb-28 sm:px-6 lg:pt-12">
      <PartialNotice />
      <SnapshotHero />
      <Recommendations />
      <ConnectionMap />
      <div className="space-y-3">
        <p className="text-[13px] font-medium text-ink-mute">Details & evidence</p>
        {critical.length > 0 && (
          <Disclosure id="business" title="Is this right about your business?" summary={`${critical.length} facts from your website${bp.services.length ? ` · ${bp.services.length} services and areas` : ""}`}
            badge={open > 0 ? <span className="rounded-full bg-amber-soft px-2.5 py-0.5 text-[12px] font-medium text-amber">{open} to confirm</span> : <span className="rounded-full bg-go-soft px-2.5 py-0.5 text-[12px] font-medium text-go-ink">All reviewed</span>}>
            <BusinessFacts embedded />
          </Disclosure>
        )}
        <Disclosure id="how" title="How your website works today" summary={`${bp.conversionStrategy.label} · ${bp.journeys.length} path${bp.journeys.length === 1 ? "" : "s"} · ${bp.gateDecisions.length} things we deliberately don't suggest`}>
          <HowItWorks embedded />
        </Disclosure>
        <Disclosure id="pages" title="What we read" summary={`${bp.diagnostics.scannedPageCount} pages read · ${bp.pages.filter((p) => p.screenshots.length).length} with screenshots${bp.unsupportedOpportunities.length ? ` · ${bp.unsupportedOpportunities.length} ideas noted for later` : ""}`}>
          <ScanDetails embedded />
        </Disclosure>
      </div>
      <ReviewProgress />
    </main>
  );
}
