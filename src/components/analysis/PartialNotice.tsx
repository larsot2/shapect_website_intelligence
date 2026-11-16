"use client";

import { AlertTriangle } from "lucide-react";
import type { Blueprint } from "@/lib/blueprint/schema";
import { useAnalysis } from "./AnalysisContext";
import { RescanButton } from "./RescanButton";

/** Which parts of the AI analysis didn't complete (never pretend a full result). */
export function incompleteParts(bp: Blueprint) {
  const w = (bp.run?.warnings ?? []).join(" ");
  return {
    understanding: /AI understanding failed|not configured/i.test(w),
    recommendations: /Recommendations failed|AI understanding failed|not configured/i.test(w),
  };
}

export function PartialNotice() {
  const { bp } = useAnalysis();
  if (bp.source.kind !== "scan") return null;
  const inc = incompleteParts(bp);
  if (!inc.understanding && !inc.recommendations) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber/25 bg-amber-soft px-5 py-4 text-[14px] text-amber" role="status">
      <AlertTriangle className="size-5 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Partial analysis.</span>{" "}
        {inc.understanding
          ? "We read your pages and found your contact paths, but the AI analysis didn't complete (the AI service was busy). Business facts and recommendations are missing."
          : "We understood your website, but couldn't prepare recommendations this time (the AI service was busy)."}
      </p>
      <RescanButton url={bp.website.url} />
    </div>
  );
}
