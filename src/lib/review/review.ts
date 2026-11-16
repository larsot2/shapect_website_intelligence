/**
 * Review decisions are stored separately from the immutable blueprint snapshot
 * (spec §4.6). "confirmed" only means "confirmed by the business in this
 * analysis" — it never writes to Business Foundation, entries or pricing.
 */
import type { Blueprint } from "@/lib/blueprint/schema";

export type ReviewStatus = "confirmed" | "edited" | "rejected" | "deferred";
export type ReviewTargetKind = "suggestion" | "claim" | "connection" | "assetAction";

export interface ReviewDecision {
  targetKind: ReviewTargetKind;
  targetId: string;
  status: ReviewStatus;
  /** Field-level edits to the *proposal* (e.g. touchpoint headline, starting hook, corrected claim value). */
  edits?: Record<string, string>;
  decidedAt: string;
}

export interface ReviewState {
  scanId: string;
  snapshotVersion: string;
  decisions: Record<string, ReviewDecision>;
}

export const reviewKey = (kind: ReviewTargetKind, id: string) => `${kind}:${id}`;

export const emptyReview = (bp: Pick<Blueprint, "scanId" | "snapshotVersion">): ReviewState => ({
  scanId: bp.scanId,
  snapshotVersion: bp.snapshotVersion,
  decisions: {},
});

export function decide(
  state: ReviewState,
  d: Omit<ReviewDecision, "decidedAt"> & { decidedAt?: string },
): ReviewState {
  const edits = d.edits && Object.keys(d.edits).length ? d.edits : undefined;
  const decision: ReviewDecision = { ...d, edits, decidedAt: d.decidedAt ?? new Date().toISOString() };
  return { ...state, decisions: { ...state.decisions, [reviewKey(d.targetKind, d.targetId)]: decision } };
}

export function undo(state: ReviewState, kind: ReviewTargetKind, id: string): ReviewState {
  const decisions = { ...state.decisions };
  delete decisions[reviewKey(kind, id)];
  return { ...state, decisions };
}

/** Ids that may be edited per target kind — anything else in `edits` is dropped. */
function allowedEditKeys(bp: Blueprint, kind: ReviewTargetKind, id: string): Set<string> | null {
  switch (kind) {
    case "suggestion": {
      const s = bp.suggestedExperiences.find((x) => x.id === id);
      if (!s) return null;
      return new Set([
        ...s.touchpoints.map((t) => `touchpoint.${t.id}.headline`),
        ...s.pageContexts.map((c) => `pageContext.${c.pageId}.startingHook`),
      ]);
    }
    case "claim":
      return bp.businessClaims.some((c) => c.id === id) ? new Set(["value"]) : null;
    case "connection":
      return bp.suggestedConnections.some((c) => c.id === id) ? new Set(["note"]) : null;
    case "assetAction":
      return bp.assetActions.some((a) => a.id === id) ? new Set(["proposal"]) : null;
  }
}

const PROPOSALS = new Set(["keep", "replace", "redirect", "bridge", "remove"]);

/**
 * Re-check stored decisions against the snapshot they belong to: decisions for
 * another snapshot, unknown targets or unknown edit fields are discarded.
 */
export function reconcile(bp: Blueprint, raw: unknown): ReviewState {
  const base = emptyReview(bp);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<ReviewState>;
  if (r.scanId !== bp.scanId || r.snapshotVersion !== bp.snapshotVersion || !r.decisions) return base;
  const out: Record<string, ReviewDecision> = {};
  for (const d of Object.values(r.decisions)) {
    if (!d || !["confirmed", "edited", "rejected", "deferred"].includes(d.status)) continue;
    const allowed = allowedEditKeys(bp, d.targetKind, d.targetId);
    if (!allowed) continue;
    const edits = Object.fromEntries(
      Object.entries(d.edits ?? {}).filter(
        ([k, v]) => allowed.has(k) && typeof v === "string" && v.length <= 280 && (k !== "proposal" || PROPOSALS.has(v)),
      ),
    );
    out[reviewKey(d.targetKind, d.targetId)] = { ...d, edits: Object.keys(edits).length ? edits : undefined };
  }
  return { ...base, decisions: out };
}

// ------------------------------------------------------------ persistence
// Stored server-side per scan + snapshot (data/reviews), separate from the snapshot.

export async function loadReview(bp: Blueprint): Promise<ReviewState> {
  try {
    const res = await fetch(`/api/reviews/${bp.scanId}`, { cache: "no-store" });
    if (!res.ok) return emptyReview(bp);
    return reconcile(bp, await res.json());
  } catch {
    return emptyReview(bp);
  }
}

export async function saveReview(bp: Blueprint, state: ReviewState): Promise<boolean> {
  try {
    const res = await fetch(`/api/reviews/${bp.scanId}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(state) });
    return res.ok;
  } catch {
    return false;
  }
}
