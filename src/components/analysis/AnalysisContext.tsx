"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Blueprint, Viewport } from "@/lib/blueprint/schema";
import {
  decide as decidePure,
  emptyReview,
  loadLocalReview,
  reviewKey,
  saveLocalReview,
  undo as undoPure,
  type ReviewDecision,
  type ReviewState,
  type ReviewTargetKind,
} from "@/lib/review/review";

interface AnalysisValue {
  bp: Blueprint;
  review: ReviewState;
  hydrated: boolean;
  decide: (d: Omit<ReviewDecision, "decidedAt">) => void;
  undo: (kind: ReviewTargetKind, id: string) => void;
  decisionFor: (kind: ReviewTargetKind, id: string) => ReviewDecision | undefined;
  page: (id: string) => Blueprint["pages"][number] | undefined;
  asset: (id: string) => Blueprint["conversionAssets"][number] | undefined;
  suggestion: (id: string) => Blueprint["suggestedExperiences"][number] | undefined;
  screenshot: (pageId: string, vp?: Viewport) => Blueprint["pages"][number]["screenshots"][number] | undefined;
  base: string;
}

const Ctx = createContext<AnalysisValue | null>(null);

export function AnalysisProvider({ bp, children }: { bp: Blueprint; children: React.ReactNode }) {
  const [review, setReview] = useState<ReviewState>(() => emptyReview(bp));
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Local persistence is browser-only; load after mount to avoid hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReview(loadLocalReview(bp));
    setHydrated(true);
  }, [bp]);

  const commit = useCallback(
    (fn: (s: ReviewState) => ReviewState) =>
      setReview((s) => {
        const next = fn(s);
        saveLocalReview(bp, next);
        return next;
      }),
    [bp],
  );

  const value = useMemo<AnalysisValue>(() => {
    const pages = new Map(bp.pages.map((p) => [p.id, p]));
    const assets = new Map(bp.conversionAssets.map((a) => [a.id, a]));
    const suggestions = new Map(bp.suggestedExperiences.map((s) => [s.id, s]));
    return {
      bp,
      review,
      hydrated,
      decide: (d) => commit((s) => decidePure(s, d)),
      undo: (k, id) => commit((s) => undoPure(s, k, id)),
      decisionFor: (k, id) => review.decisions[reviewKey(k, id)],
      page: (id) => pages.get(id),
      asset: (id) => assets.get(id),
      suggestion: (id) => suggestions.get(id),
      screenshot: (pageId, vp = "desktop") => pages.get(pageId)?.screenshots.find((s) => s.viewport === vp),
      base: `/studio/website/${bp.scanId}`,
    };
  }, [bp, review, hydrated, commit]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAnalysis() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAnalysis outside AnalysisProvider");
  return v;
}

/** Current text of an editable suggestion field, respecting the user's edits. */
export function editedText(d: ReviewDecision | undefined, key: string, original: string) {
  return d?.edits?.[key] ?? original;
}
