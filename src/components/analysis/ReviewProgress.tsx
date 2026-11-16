"use client";

import { CheckCircle2 } from "lucide-react";
import { useAnalysis } from "./AnalysisContext";

/** Small sticky summary — what's decided, and an honest reminder of what isn't changing. */
export function ReviewProgress() {
  const { bp, review, hydrated } = useAnalysis();
  if (!hydrated) return null;
  const total = bp.suggestedExperiences.length + bp.businessClaims.filter((c) => c.critical).length;
  const done = Object.values(review.decisions).filter(
    (d) => d.targetKind === "suggestion" || (d.targetKind === "claim" && bp.businessClaims.find((c) => c.id === d.targetId)?.critical),
  ).length;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-20 flex justify-center px-4" role="status" aria-live="polite">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-line bg-paper/95 py-2 pr-4 pl-3 text-[13px] shadow-lg backdrop-blur">
        <CheckCircle2 className={`size-4 ${done ? "text-go" : "text-ink-mute"}`} aria-hidden />
        <span><span className="font-semibold tabular-nums">{done}/{total}</span> reviewed</span>
        <span className="hidden text-ink-mute sm:inline">· Saved in this analysis. Nothing on your website changes.</span>
      </div>
    </div>
  );
}
