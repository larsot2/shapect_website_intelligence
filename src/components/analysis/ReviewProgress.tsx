"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CheckCircle2 } from "lucide-react";
import { useAnalysis } from "./AnalysisContext";

/** Small floating pill (bottom-right). It only speaks up briefly after a decision. */
export function ReviewProgress() {
  const { bp, review, hydrated, saveState } = useAnalysis();
  const [flash, setFlash] = useState(false);
  const count = Object.keys(review.decisions).length;
  const prev = useRef(count);
  useEffect(() => {
    if (!hydrated) return;
    if (count !== prev.current) {
      prev.current = count;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 2200);
      return () => clearTimeout(t);
    }
  }, [count, hydrated]);
  if (!hydrated) return null;
  const total = bp.suggestedExperiences.length + bp.businessClaims.filter((c) => c.critical).length;
  const done = Object.values(review.decisions).filter(
    (d) => d.targetKind === "suggestion" || (d.targetKind === "claim" && bp.businessClaims.find((c) => c.id === d.targetId)?.critical),
  ).length;
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-20" role="status" aria-live="polite">
      <div className={`pointer-events-auto flex items-center gap-2 rounded-full border border-line bg-paper/95 py-1.5 pr-3 pl-2 text-[12px] shadow-md backdrop-blur transition-all ${saveState === "error" ? "border-rose/40" : ""}`}>
        <CheckCircle2 className={`size-4 ${done ? "text-go" : "text-ink-mute"}`} aria-hidden />
        <span className="tabular-nums"><b className="font-semibold">{done}</b>/{total} reviewed</span>
        {saveState === "error" ? (
          <span className="text-rose">· not saved</span>
        ) : flash ? (
          <span className="flex items-center gap-1 text-go-ink"><Check className="size-3" aria-hidden />{saveState === "saving" ? "Saving…" : "Saved · your website isn't changed"}</span>
        ) : null}
      </div>
    </div>
  );
}
