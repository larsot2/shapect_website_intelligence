"use client";

import { useEffect, useRef } from "react";
import { ArrowRightLeft, Globe2, MonitorPlay, X } from "lucide-react";
import { ENTRIES, PAGES, type EntryId } from "@/lib/demo/passion";
import { useDemo, type Via } from "@/lib/demo/state";
import { CostEstimator } from "./entries/CostEstimator";
import { DesignExplorer } from "./entries/DesignExplorer";
import { GrannyFlatPlanner } from "./entries/GrannyFlatPlanner";
import { ApartmentReadiness } from "./entries/ApartmentReadiness";
import { ProjectReadiness } from "./entries/ProjectReadiness";
import type { EntryProps } from "./entries/types";

const COMPONENTS: Record<EntryId, (p: EntryProps) => React.ReactNode> = {
  cost: CostEstimator, design: DesignExplorer, granny: GrannyFlatPlanner, apartment: ApartmentReadiness, readiness: ProjectReadiness,
};

function viaText(via: Via): string {
  if (via.kind === "touchpoint") return `Started from the ${PAGES.find((p) => p.key === via.page)?.label} page touchpoint`;
  if (via.kind === "bridge") return `Bridge from ${ENTRIES[via.from].short}`;
  return "Opened directly";
}

export function ExperienceModal() {
  const { open, close, launch, state } = useDemo();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { root.current?.scrollTo({ top: 0 }); }, [open?.key]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, close]);

  if (!open) return null;
  const E = ENTRIES[open.entry];
  const Comp = COMPONENTS[open.entry];
  const carried = open.via.kind === "bridge" ? Object.entries(state.sources).filter(([, src]) => src !== open.entry).length : 0;
  const ViaIcon = open.via.kind === "bridge" ? ArrowRightLeft : open.via.kind === "touchpoint" ? Globe2 : MonitorPlay;

  return (
    <div ref={root} className="animate-fade fixed inset-0 z-50 flex flex-col items-center overflow-y-auto bg-ink/55 backdrop-blur-sm sm:px-4 sm:py-6" role="dialog" aria-modal="true" aria-label={E.name} data-testid="experience">
      {/* presenter-facing indicator — not part of the customer experience */}
      <div className="mb-3 hidden w-full max-w-[880px] flex-wrap items-center gap-2 text-[13px] text-white/85 sm:flex">
        <span className="rounded-full bg-white/15 px-3 py-1 font-medium text-white">Live Experience</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1"><span className="size-2 rounded-full" style={{ background: E.accent }} />{E.name}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1"><ViaIcon className="size-3.5" aria-hidden />{viaText(open.via)}</span>
      </div>

      <div className="relative flex w-full max-w-[880px] flex-1 flex-col bg-paper shadow-[0_40px_120px_-40px_rgba(0,0,0,.6)] sm:flex-none sm:rounded-[28px]">
        <header className="flex items-center gap-3 border-b border-line px-5 py-4 sm:px-8">
          <span className="text-[13px] font-extrabold tracking-[0.18em] text-[#4b2a7b]">PASSION<span className="font-medium text-[#8a8f94]"> BUILT</span></span>
          <span className="h-4 w-px bg-line" />
          <span className="truncate text-[14px] font-medium text-ink-soft">{E.short}</span>
          <button type="button" onClick={close} className="ml-auto grid size-9 place-items-center rounded-full text-ink-soft hover:bg-canvas hover:text-ink" aria-label="Close">
            <X className="size-5" aria-hidden />
          </button>
        </header>

        {open.via.kind === "bridge" && (
          <div key={open.key} className="animate-fade mx-5 mt-5 flex items-start gap-3 rounded-2xl border border-go/20 bg-go-soft/60 p-4 sm:mx-8" data-testid="bridge-banner">
            <ArrowRightLeft className="mt-0.5 size-5 shrink-0 text-go" aria-hidden />
            <div className="text-[14px]">
              <p className="font-semibold text-go-ink">Continuing from your {ENTRIES[open.via.from].short}</p>
              <p className="text-go-ink/80">{carried > 0 ? `${carried} answer${carried === 1 ? "" : "s"} came with you — nothing to repeat.` : "You can pick up right here."}</p>
            </div>
          </div>
        )}

        <div className="flex-1 px-5 py-6 sm:px-8 sm:py-7">
          <Comp key={open.key} accent={E.accent} onBridge={(to) => launch(to, { kind: "bridge", from: open.entry })} />
        </div>

        <footer className="border-t border-line px-5 py-3 text-right text-[12px] text-ink-mute sm:px-8">Powered by Shapect</footer>
      </div>
    </div>
  );
}
