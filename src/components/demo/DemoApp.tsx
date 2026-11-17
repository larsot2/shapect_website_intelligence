"use client";

import { useState } from "react";
import { Brain, Globe2, ListChecks, Network, PlayCircle, RotateCcw, Sparkles } from "lucide-react";
import { Drawer } from "@/components/ui";
import { ENTRIES, type EntryId, type PageKey } from "@/lib/demo/passion";
import { DemoProvider, memoryRows, useDemo } from "@/lib/demo/state";
import { WebsiteView } from "./WebsiteView";
import { NetworkView } from "./NetworkView";
import { ExperienceModal } from "./ExperienceModal";

export function DemoApp() {
  return (
    <DemoProvider>
      <Shell />
    </DemoProvider>
  );
}

function Shell() {
  const { view, setView, state, reset } = useDemo();
  const [panel, setPanel] = useState<"memory" | "guide" | null>(null);
  const count = memoryRows(state).length;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-ink text-[15px] font-bold text-white">S</span>
            <span className="text-[16px] font-semibold">Shapect</span>
            <span className="h-5 w-px bg-line" />
            <span className="text-[15px] text-ink-soft">Passion Built</span>
            <span className="hidden rounded-full bg-paper px-2 py-0.5 text-[11px] font-medium text-ink-mute ring-1 ring-line sm:inline">Demo</span>
          </div>
          <nav className="order-3 flex w-full gap-1 rounded-xl bg-paper p-1 ring-1 ring-line sm:order-none sm:w-auto" aria-label="Views">
            {([["website", "Website", Globe2], ["network", "Entry Network", Network]] as const).map(([k, label, Icon]) => (
              <button key={k} type="button" onClick={() => setView(k)} aria-pressed={view === k} data-testid={`view-${k}`}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[14px] font-medium transition-colors sm:flex-none ${view === k ? "bg-ink text-white" : "text-ink-soft hover:text-ink"}`}>
                <Icon className="size-4" aria-hidden />{label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <button type="button" onClick={() => setPanel("guide")} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[14px] font-medium text-ink-soft hover:bg-paper hover:text-ink" data-testid="open-guide">
              <PlayCircle className="size-4" aria-hidden /><span className="hidden md:inline">Guided demo</span>
            </button>
            <button type="button" onClick={() => setPanel("memory")} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[14px] font-medium text-ink-soft hover:bg-paper hover:text-ink" data-testid="open-memory">
              <Brain className="size-4" aria-hidden /><span className="hidden md:inline">Project memory</span>
              <span className={`rounded-full px-1.5 text-[12px] ${count ? "bg-go text-white" : "bg-line text-ink-soft"}`}>{count}</span>
            </button>
            <button type="button" onClick={reset} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-paper px-3 text-[14px] font-medium hover:border-ink-mute" data-testid="reset">
              <RotateCcw className="size-4" aria-hidden />Reset demo
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        {view === "website" ? <WebsiteView /> : <NetworkView />}
      </main>

      <ExperienceModal />
      {panel === "memory" && <MemoryPanel onClose={() => setPanel(null)} />}
      {panel === "guide" && <GuidePanel onClose={() => setPanel(null)} />}
    </div>
  );
}

function MemoryPanel({ onClose }: { onClose: () => void }) {
  const { state, reset } = useDemo();
  const rows = memoryRows(state);
  const groups = [...new Set(rows.map((r) => r.group))];
  return (
    <Drawer open onClose={onClose} title="Project memory" subtitle="The shared ProjectState for this visit — only what the visitor confirmed."
      footer={<button type="button" onClick={() => { reset(); onClose(); }} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line px-3.5 text-[14px] font-medium hover:border-ink-mute"><RotateCcw className="size-4" aria-hidden />Reset demo</button>}>
      {rows.length === 0 ? (
        <p className="rounded-xl bg-canvas p-4 text-[14px] text-ink-soft">Nothing yet. Complete any Experience and its confirmed answers appear here — ready to be reused by the next one.</p>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g}>
              <h3 className="mb-2 text-[12px] font-semibold tracking-wide text-ink-mute uppercase">{g}</h3>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {rows.filter((r) => r.group === g).map((r) => (
                  <li key={r.label} className="flex items-start justify-between gap-3 px-3.5 py-2.5 text-[14px]">
                    <span><span className="text-ink-mute">{r.label}</span><span className="block font-medium">{r.value}</span></span>
                    {r.source && <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium text-white" style={{ background: ENTRIES[r.source].accent }}>{ENTRIES[r.source].short}</span>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Drawer>
  );
}

function GuidePanel({ onClose }: { onClose: () => void }) {
  const { setView, setPage, launch, close, state, loadSample, reset } = useDemo();
  const go = (fn: () => void) => { onClose(); fn(); };
  const site = (p: PageKey, e: EntryId) => go(() => { close(); setView("website"); setPage(p); setTimeout(() => launch(e, { kind: "touchpoint", page: p }), 650); });
  const steps: { title: string; note: string; done: boolean; run: () => void }[] = [
    { title: "Homepage → Cost Estimator", note: "Complete renovation, main bathroom, see Passion Built's published cost reference.", done: state.completed.includes("cost"), run: () => site("home", "cost") },
    { title: "Design page → Design Explorer", note: "Pick an atmosphere, tap features, rank priorities, get a Design Direction.", done: state.completed.includes("design"), run: () => site("design", "design") },
    { title: "Bridge → Project Readiness", note: "Style and cost answers are already there — nothing is asked twice.", done: state.completed.includes("readiness"), run: () => go(() => launch("readiness", { kind: "bridge", from: state.completed.includes("design") ? "design" : "cost" })) },
    { title: "Granny Flat page → Planner", note: "A genuinely different journey: tenants or family, small-space challenges.", done: state.completed.includes("granny"), run: () => site("granny", "granny") },
    { title: "Apartment page → Readiness check", note: "Known / Needs clarification / Discuss — no scores, no legal verdicts.", done: state.completed.includes("apartment"), run: () => site("apartment", "apartment") },
    { title: "Open the Entry Network", note: "Touchpoints, Bridges, session reuse and hand-offs in one picture.", done: false, run: () => go(() => { close(); setView("network"); }) },
    { title: "Project Readiness → site inspection", note: "The brief gathers everything; Passion Built's own quotation page stays the destination.", done: false, run: () => go(() => launch("readiness", { kind: "direct" })) },
  ];
  return (
    <Drawer open onClose={onClose} title="Guided demo" subtitle="A repeatable walkthrough. Each step jumps to the right page and opens the Experience."
      footer={
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { loadSample(); onClose(); }} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line px-3.5 text-[14px] font-medium hover:border-ink-mute" data-testid="load-sample"><Sparkles className="size-4" aria-hidden />Load sample project</button>
          <button type="button" onClick={() => { reset(); }} className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-[14px] font-medium text-ink-soft hover:text-ink"><RotateCcw className="size-4" aria-hidden />Reset</button>
          <p className="basis-full text-[12px] text-ink-mute">The sample project is fictional: a cost estimate and a design direction, so you can jump straight to the brief.</p>
        </div>
      }>
      <ol className="space-y-2.5">
        {steps.map((s, i) => (
          <li key={s.title}>
            <button type="button" onClick={s.run} className="flex w-full items-start gap-3 rounded-xl border border-line p-3.5 text-left transition-colors hover:border-ink-mute" data-testid={`guide-${i + 1}`}>
              <span className={`grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-bold ${s.done ? "bg-go text-white" : "bg-canvas text-ink-soft"}`}>{s.done ? <ListChecks className="size-4" aria-hidden /> : i + 1}</span>
              <span><span className="block text-[15px] font-semibold">{s.title}</span><span className="mt-0.5 block text-[13px] text-ink-soft">{s.note}</span></span>
            </button>
          </li>
        ))}
      </ol>
    </Drawer>
  );
}
