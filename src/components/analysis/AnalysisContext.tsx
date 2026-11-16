"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Blueprint, Viewport } from "@/lib/blueprint/schema";
import {
  decide as decidePure,
  emptyReview,
  loadReview,
  reviewKey,
  saveReview,
  undo as undoPure,
  type ReviewDecision,
  type ReviewState,
  type ReviewTargetKind,
} from "@/lib/review/review";

interface AnalysisValue {
  bp: Blueprint;
  review: ReviewState;
  hydrated: boolean;
  saveState: "idle" | "saving" | "saved" | "error";
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

/** Display-only label cleanup for older snapshots ("Form: “SUBMIT”" → "Enquiry form"); the snapshot itself is untouched. */
function displayLabel(a: Blueprint["conversionAssets"][number]): string {
  const generic = /^(form|calculator)\s*[:(]|^(submit|send|go)$/i.test(a.label.trim());
  if (!generic) return a.label === a.label.toUpperCase() && /[A-Z]{3}/.test(a.label) ? a.label.charAt(0) + a.label.slice(1).toLowerCase() : a.label;
  return ({ contact_form: "Enquiry form", multi_step_form: "Multi-step enquiry", calculator: "Calculator", upload: "Upload form" } as Record<string, string>)[a.kind] ?? a.label;
}

export function AnalysisProvider({ bp: raw, children }: { bp: Blueprint; children: React.ReactNode }) {
  const bp = useMemo(() => ({ ...raw, conversionAssets: raw.conversionAssets.map((a) => ({ ...a, label: displayLabel(a) })) }), [raw]);
  const [review, setReview] = useState<ReviewState>(() => emptyReview(bp));
  const [hydrated, setHydrated] = useState(false);
  const [saveState, setSaveState] = useState<AnalysisValue["saveState"]>("idle");
  const pending = useRef<ReviewState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    loadReview(bp).then((r) => {
      if (!alive) return;
      setReview(r);
      setHydrated(true);
    });
    return () => {
      alive = false;
    };
  }, [bp]);

  const flush = useCallback(async () => {
    const s = pending.current;
    if (!s) return;
    pending.current = null;
    setSaveState("saving");
    setSaveState((await saveReview(bp, s)) ? "saved" : "error");
  }, [bp]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); void flush(); }, [flush]);

  // Leaving or reloading the page must not lose the last decision.
  useEffect(() => {
    const onHide = () => {
      const s = pending.current;
      if (!s) return;
      pending.current = null;
      navigator.sendBeacon?.(`/api/reviews/${bp.scanId}`, new Blob([JSON.stringify(s)], { type: "application/json" }));
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [bp.scanId]);

  const commit = useCallback(
    (fn: (s: ReviewState) => ReviewState) =>
      setReview((s) => {
        const next = fn(s);
        pending.current = next;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void flush(), 250);
        return next;
      }),
    [flush],
  );

  const value = useMemo<AnalysisValue>(() => {
    const pages = new Map(bp.pages.map((p) => [p.id, p]));
    const assets = new Map(bp.conversionAssets.map((a) => [a.id, a]));
    const suggestions = new Map(bp.suggestedExperiences.map((s) => [s.id, s]));
    return {
      bp,
      review,
      hydrated,
      saveState,
      decide: (d) => commit((s) => decidePure(s, d)),
      undo: (k, id) => commit((s) => undoPure(s, k, id)),
      decisionFor: (k, id) => review.decisions[reviewKey(k, id)],
      page: (id) => pages.get(id),
      asset: (id) => assets.get(id),
      suggestion: (id) => suggestions.get(id),
      screenshot: (pageId, vp = "desktop") => pages.get(pageId)?.screenshots.find((s) => s.viewport === vp),
      base: `/studio/website/${bp.scanId}`,
    };
  }, [bp, review, hydrated, saveState, commit]);

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
