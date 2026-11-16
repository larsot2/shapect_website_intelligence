"use client";

import Link from "next/link";
import { Info, Layers } from "lucide-react";
import { Chip, SectionHeading } from "@/components/ui";
import { useAnalysis } from "./AnalysisContext";
import { Shot } from "./Shot";

const opportunityLabel = {
  unsupported_scope: "Outside what we support yet",
  missing_capability: "Not possible yet",
  weak_evidence: "Not enough evidence",
  needs_owner_input: "Your call",
} as const;

export function ScanDetails() {
  const { bp, base, screenshot } = useAnalysis();
  return (
    <section aria-labelledby="scan-title" className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <SectionHeading id="pages" eyebrow={`${bp.diagnostics.scannedPageCount} read · ${bp.diagnostics.skippedPageCount} grouped or skipped`} title="What we read" />
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {bp.pages.filter((p) => screenshot(p.id)).map((p) => (
            <li key={p.id}>
              <Link href={`${base}/preview?page=${p.id}`} className="group block rounded-xl border border-line bg-paper p-1.5 hover:border-ink-mute">
                <Shot pageId={p.id} className="aspect-[4/3] rounded-lg" sizes="200px" />
                <p className="px-1.5 pt-2 text-[13px] font-medium">{p.title}</p>
                <p className="truncate px-1.5 pb-1 text-[12px] text-ink-mute">{p.path}</p>
              </Link>
            </li>
          ))}
        </ul>
        {bp.pages.some((p) => !screenshot(p.id)) && (
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-paper">
            {bp.pages.filter((p) => !screenshot(p.id)).map((p) => (
              <li key={p.id} className="flex items-baseline gap-3 px-4 py-2 text-[13px]">
                <span className="font-medium">{p.title}</span>
                <span className="truncate text-ink-mute">{p.path}</span>
                <span className="ml-auto shrink-0 text-[11px] text-ink-mute">read, no screenshot</span>
              </li>
            ))}
          </ul>
        )}
        {bp.pageGroups.map((g) => (
          <p key={g.id} className="mt-3 flex gap-2 rounded-xl bg-paper px-4 py-3 text-[13px] text-ink-soft">
            <Layers className="mt-0.5 size-4 shrink-0 text-ink-mute" aria-hidden />
            <span><span className="font-medium text-ink">{g.label} ({g.totalCount})</span> — {g.reason}</span>
          </p>
        ))}
      </div>

      <div className="space-y-5">
        {bp.unsupportedOpportunities.length > 0 && (
          <div className="rounded-2xl border border-line bg-paper p-6">
            <h3 className="text-sm font-semibold">Noted for later</h3>
            <p className="mt-0.5 text-[13px] text-ink-mute">Ideas we saw, but don&apos;t recommend as a Shapect experience right now.</p>
            <ul className="mt-4 space-y-3">
              {bp.unsupportedOpportunities.map((o) => (
                <li key={o.id} className="text-[14px]">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{o.label}</span><Chip>{opportunityLabel[o.reason]}</Chip></div>
                  <p className="mt-0.5 text-[13px] text-ink-soft">{o.note}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="rounded-2xl border border-line bg-paper p-6 text-[13px] text-ink-soft">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink"><Info className="size-4 text-ink-mute" aria-hidden /> About this analysis</h3>
          <ul className="mt-3 list-disc space-y-1 pl-4">
            {bp.diagnostics.limitations.map((l) => <li key={l}>{l}</li>)}
            <li>We only read public pages. We never submit forms, book, log in or change your website.</li>
          </ul>
          {bp.run && (
            <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4 text-center">
              {[
                [bp.run.discoveredUrls, "pages found"],
                [bp.diagnostics.scannedPageCount, "read closely"],
                [bp.run.capturedPages, "captured"],
                [bp.run.llmCalls, bp.run.llmCalls === 1 ? "AI call" : "AI calls"],
                [`${bp.run.tokensEstimated ? "~" : ""}${Math.round((bp.run.inputTokens + bp.run.outputTokens) / 1000)}k`, "tokens"],
                [`${Math.floor(bp.run.durationMs / 60000)}:${String(Math.round((bp.run.durationMs % 60000) / 1000)).padStart(2, "0")}`, "minutes"],
              ].map(([v, l]) => (
                <div key={String(l)}>
                  <dd className="text-[17px] font-semibold tabular-nums text-ink">{v}</dd>
                  <dt className="text-[11px] text-ink-mute">{l}</dt>
                </div>
              ))}
            </dl>
          )}
          <p className="mt-3 text-[12px] text-ink-mute">{bp.source.kind === "scan" ? `Analysed with ${bp.analysis.model}` : "Demo fixture"} · {new Date(bp.analysis.finishedAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}</p>
        </div>
      </div>
    </section>
  );
}
