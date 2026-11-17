"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { EntryId, PageKey } from "./passion";
import type { Finish, Layout, RoomType } from "./cost";

export type Tri = "yes" | "no" | "unsure";
export type PropertyType = "house" | "apartment" | "granny_flat" | "townhouse" | "other";

/** Session-level project information. Only fields a visitor actually confirmed or selected are ever set. */
export interface ProjectState {
  project: {
    propertyType?: PropertyType;
    roomType?: RoomType;
    scope?: "complete" | "not_sure";
    roomSize?: "compact" | "average" | "large";
    layoutIntent?: Layout;
    finish?: Finish;
    costReference?: { text: string; low: number; high: number };
    location?: string;
    goals?: string[];
    timeline?: string;
    constraints?: string[];
    notes?: string;
  };
  design: { style?: string; features?: { label: string; value: string }[]; priorities?: string[] };
  grannyFlat: { intendedUse?: string; challenges?: string[]; priorities?: string[]; questions?: string[] };
  apartment: { strataManaged?: Tri; bylawsReviewed?: Tri; layoutChange?: Tri; accessConstraints?: string[]; documents?: string[]; approvalStatus?: "self_reported" | "not_confirmed" };
  /** field path → Experience that confirmed it */
  sources: Record<string, EntryId>;
  completed: EntryId[];
}

export const emptyState = (): ProjectState => ({ project: {}, design: {}, grannyFlat: {}, apartment: {}, sources: {}, completed: [] });

type Section = "project" | "design" | "grannyFlat" | "apartment";
export type Patch = { [K in Section]?: Partial<ProjectState[K]> };

/** Pure merge: set only defined values, remember which Experience confirmed each field. */
export function applyPatch(s: ProjectState, entry: EntryId, patch: Patch): ProjectState {
  const next: ProjectState = { ...s, project: { ...s.project }, design: { ...s.design }, grannyFlat: { ...s.grannyFlat }, apartment: { ...s.apartment }, sources: { ...s.sources }, completed: [...s.completed] };
  for (const sec of Object.keys(patch) as Section[]) {
    for (const [k, v] of Object.entries(patch[sec] ?? {})) {
      if (v === undefined || (Array.isArray(v) && v.length === 0) || v === "") continue;
      (next[sec] as Record<string, unknown>)[k] = v;
      next.sources[`${sec}.${k}`] = entry;
    }
  }
  if (!next.completed.includes(entry)) next.completed.push(entry);
  return next;
}

export type Via = { kind: "touchpoint"; page: PageKey } | { kind: "bridge"; from: EntryId } | { kind: "direct" };
export interface OpenEntry { entry: EntryId; via: Via; key: number }

interface DemoCtx {
  state: ProjectState;
  commit: (entry: EntryId, patch: Patch) => void;
  view: "website" | "network";
  setView: (v: "website" | "network") => void;
  page: PageKey;
  setPage: (p: PageKey) => void;
  open: OpenEntry | null;
  launch: (entry: EntryId, via: Via) => void;
  close: () => void;
  reset: () => void;
  loadSample: () => void;
}

const Ctx = createContext<DemoCtx | null>(null);
const KEY = "shapect-passion-demo-v1";

/** A clearly labelled, fictional sample project (used only when the presenter loads it). */
export const SAMPLE: { entry: EntryId; patch: Patch }[] = [
  { entry: "cost", patch: { project: { scope: "complete", roomType: "main", roomSize: "average", layoutIntent: "keep", finish: "comfort", costReference: { text: "$22–28K inc GST · main bathroom with no drainage moving · basic to premium fixtures (Passion Built published reference)", low: 22, high: 28 } } } },
  { entry: "design", patch: { design: { style: "Warm & Natural", features: [{ label: "Shower", value: "Walk-in shower" }, { label: "Vanity", value: "Timber with storage" }, { label: "Tiles", value: "Calm neutral" }, { label: "Lighting", value: "Soft & warm" }, { label: "Storage", value: "Drawers in the vanity, Mirror cabinet" }], priorities: ["Easy maintenance", "More storage", "Relaxation & comfort"] } } },
];

function loadSaved(): { state: ProjectState; view: "website" | "network"; page: PageKey } | null {
  try {
    const raw = typeof window === "undefined" ? null : sessionStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { state: ProjectState; view: "website" | "network"; page: PageKey };
    return { state: { ...emptyState(), ...saved.state }, view: saved.view ?? "website", page: saved.page ?? "home" };
  } catch {
    return null; // storage unavailable — start fresh
  }
}

/** Rendered client-only (see ClientDemo), so the saved journey can be restored synchronously. */
export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [saved] = useState(loadSaved);
  const [state, setState] = useState<ProjectState>(() => saved?.state ?? emptyState());
  const [view, setView] = useState<"website" | "network">(saved?.view ?? "website");
  const [page, setPage] = useState<PageKey>(saved?.page ?? "home");
  const [open, setOpen] = useState<OpenEntry | null>(null);

  // per-viewer persistence so a refresh during a presentation keeps the journey
  useEffect(() => {
    try { sessionStorage.setItem(KEY, JSON.stringify({ state, view, page })); } catch { /* ignore */ }
  }, [state, view, page]);

  const commit = useCallback((entry: EntryId, patch: Patch) => setState((s) => applyPatch(s, entry, patch)), []);
  const launch = useCallback((entry: EntryId, via: Via) => setOpen({ entry, via, key: Date.now() }), []);
  const close = useCallback(() => setOpen(null), []);
  const reset = useCallback(() => { setState(emptyState()); setOpen(null); setView("website"); setPage("home"); try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } }, []);
  const loadSample = useCallback(() => setState(SAMPLE.reduce((s, x) => applyPatch(s, x.entry, x.patch), emptyState())), []);

  const value = useMemo(() => ({ state, commit, view, setView, page, setPage, open, launch, close, reset, loadSample }), [state, commit, view, page, open, launch, close, reset, loadSample]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDemo(): DemoCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDemo outside DemoProvider");
  return c;
}

/** Human-readable view of everything confirmed so far (presenter panel + brief). */
export const LABELS = {
  propertyType: { house: "House", apartment: "Apartment", granny_flat: "Granny flat", townhouse: "Townhouse", other: "Other" },
  roomType: { main: "Main bathroom", ensuite: "Ensuite" },
  scope: { complete: "Complete bathroom renovation", not_sure: "Not sure yet — exploring a complete renovation" },
  roomSize: { compact: "Compact (around 1 × 2 m)", average: "Average size", large: "Large (around 3 × 3 m)" },
  layoutIntent: { keep: "Keep the existing layout", move: "Move plumbing or drainage", not_sure: "Layout not decided" },
  finish: { own_fixtures: "I'll choose and supply my own fixtures", essentials: "Practical essentials", comfort: "Modern comfort", premium: "Premium finishes" },
  tri: { yes: "Yes", no: "No", unsure: "Not sure" },
} as const;

export function memoryRows(s: ProjectState): { group: string; label: string; value: string; source: EntryId }[] {
  const rows: { group: string; label: string; value: string; source: EntryId }[] = [];
  const add = (group: string, path: string, label: string, value: string | undefined) => { if (value) rows.push({ group, label, value, source: s.sources[path] }); };
  const p = s.project;
  add("Project", "project.propertyType", "Property", p.propertyType && LABELS.propertyType[p.propertyType]);
  add("Project", "project.roomType", "Room", p.roomType && LABELS.roomType[p.roomType]);
  add("Project", "project.scope", "Scope", p.scope && LABELS.scope[p.scope]);
  add("Project", "project.roomSize", "Room size", p.roomSize && LABELS.roomSize[p.roomSize]);
  add("Project", "project.layoutIntent", "Layout", p.layoutIntent && LABELS.layoutIntent[p.layoutIntent]);
  add("Project", "project.finish", "Finish preference", p.finish && LABELS.finish[p.finish]);
  add("Project", "project.costReference", "Cost reference", p.costReference?.text);
  add("Project", "project.location", "Suburb", p.location);
  add("Project", "project.goals", "Main goals", p.goals?.join(", "));
  add("Project", "project.timeline", "Timing", p.timeline);
  add("Project", "project.constraints", "To discuss", p.constraints?.join(", "));
  add("Design", "design.style", "Style", s.design.style);
  add("Design", "design.features", "Features", s.design.features?.map((f) => `${f.label}: ${f.value}`).join(" · "));
  add("Design", "design.priorities", "Priorities", s.design.priorities?.map((x, i) => `${i + 1}. ${x}`).join("  "));
  add("Granny flat", "grannyFlat.intendedUse", "Intended use", s.grannyFlat.intendedUse);
  add("Granny flat", "grannyFlat.challenges", "Challenges", s.grannyFlat.challenges?.join(", "));
  add("Granny flat", "grannyFlat.priorities", "Priority features", s.grannyFlat.priorities?.join(", "));
  const a = s.apartment;
  add("Apartment", "apartment.strataManaged", "Strata-managed", a.strataManaged && LABELS.tri[a.strataManaged]);
  add("Apartment", "apartment.bylawsReviewed", "By-laws reviewed", a.bylawsReviewed && LABELS.tri[a.bylawsReviewed]);
  add("Apartment", "apartment.layoutChange", "Layout changes considered", a.layoutChange && LABELS.tri[a.layoutChange]);
  add("Apartment", "apartment.accessConstraints", "Access", a.accessConstraints?.join(", "));
  add("Apartment", "apartment.documents", "Documents on hand", a.documents?.join(", "));
  add("Apartment", "apartment.approvalStatus", "Strata approval", a.approvalStatus && (a.approvalStatus === "self_reported" ? "Visitor says approval is in place (to be checked)" : "Not confirmed"));
  return rows;
}
