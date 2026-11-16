"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ArrowRightLeft, Check, CircleHelp, Info, Link2Off, Lock, MapPin, RefreshCw, RotateCcw } from "lucide-react";
import type { ConnectionSuggestion } from "@/lib/blueprint/schema";
import { Button, Chip } from "@/components/ui";
import { useAnalysis } from "./AnalysisContext";
import { connectionState, priorityOf, type Mechanism } from "@/lib/blueprint/derive";

type Line = { d: string; kind: "bridge" | "handover"; mid?: { x: number; y: number }; label?: string; id: string };

const mech: Record<Mechanism, { label: string; Icon: typeof Lock }> = {
  bridge: { label: "Bridge", Icon: ArrowRightLeft },
  destination: { label: "Hand-over to your process", Icon: Lock },
  touchpoints: { label: "Same experience, several pages", Icon: MapPin },
};

const modeText: Record<NonNullable<ConnectionSuggestion["mode"]>, { label: string; hint: string }> = {
  session_reuse: { label: "Reuses answers within the same visit", hint: "Both experiences read the same answers while the visitor is on your site." },
  explicit_bridge: { label: "Hands answers over (needs a bridge)", hint: "Answers would be passed on explicitly, only after you approve it." },
  external_link: { label: "Link only — answers are not passed on", hint: "The visitor continues to your existing form and may have to answer again." },
  manual_summary: { label: "Visitor takes a summary along", hint: "The visitor gets a summary to bring along; nothing is transferred." },
};

/**
 * Network view for owners: experiences (with where they appear) on the left,
 * the business's existing process on the right. Dashed = bridge between
 * experiences (with how many answers it could reuse), solid = hand-over into
 * what already exists. Everything is a plan — nothing is connected.
 */
export function ConnectionMap() {
  const { bp, page, asset, decisionFor } = useAnalysis();
  const box = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [active, setActive] = useState<string | null>(null);

  const visible = bp.suggestedExperiences.filter((s) => decisionFor("suggestion", s.id)?.status !== "rejected");
  const ids = new Set(visible.map((s) => s.id));
  const connections = bp.suggestedConnections.filter((c) => ids.has(c.fromSuggestionId) && (c.to.kind === "existing_asset" || ids.has(c.to.id)));
  const destIds = [...new Set(connections.filter((c) => c.to.kind === "existing_asset").map((c) => c.to.id))];
  const reuse = (c: ConnectionSuggestion) => connectionState(c, bp).carry.length;
  const key = JSON.stringify(connections.map((c) => [c.id, c.fromSuggestionId, c.to.id, c.to.kind]));

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      if (window.innerWidth < 1024) return setLines([]);
      const root = el.getBoundingClientRect();
      const r = (k: string) => el.querySelector(`[data-node="${k}"]`)?.getBoundingClientRect();
      const out: Line[] = [];
      for (const c of connections) {
        const a = r(`s:${c.fromSuggestionId}`);
        const b = r(c.to.kind === "suggestion" ? `s:${c.to.id}` : `a:${c.to.id}`);
        if (!a || !b) continue;
        if (c.to.kind === "suggestion") {
          const x = a.left - root.left, y1 = a.top + a.height / 2 - root.top, y2 = b.top + b.height / 2 - root.top;
          const bend = 56;
          out.push({ id: c.id, kind: "bridge", d: `M${x},${y1} C${x - bend},${y1} ${x - bend},${y2} ${x},${y2}`, mid: { x: x - bend * 0.75, y: (y1 + y2) / 2 }, label: reuse(c) ? `reuses ${reuse(c)}` : undefined });
        } else {
          const x1 = a.right - root.left, y1 = a.top + a.height / 2 - root.top, x2 = b.left - root.left, y2 = b.top + b.height / 2 - root.top;
          const mx = (x1 + x2) / 2;
          out.push({ id: c.id, kind: "handover", d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}` });
        }
      }
      setLines(out);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!visible.length) return <p className="rounded-2xl border border-line bg-paper p-6 text-ink-soft">No experiences to connect — everything was set aside.</p>;

  return (
    <section aria-label="How they work together" className="space-y-5">
      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-ink-soft">
        <li className="flex items-center gap-1.5"><MapPin className="size-4 text-sky" aria-hidden /> <b className="font-medium text-ink">Appears on</b> — pages where an experience starts</li>
        <li className="flex items-center gap-1.5"><svg width="26" height="8" aria-hidden><path d="M0,4 H26" stroke="#1d7a4f" strokeWidth="2" strokeDasharray="5 4" /></svg> <b className="font-medium text-ink">Bridge</b> — visitors can move on to the next experience</li>
        <li className="flex items-center gap-1.5"><RefreshCw className="size-4 text-go" aria-hidden /> <b className="font-medium text-ink">Reuses answers</b> — nobody is asked twice</li>
        <li className="flex items-center gap-1.5"><Lock className="size-4 text-ink" aria-hidden /> <b className="font-medium text-ink">Your process</b> — stays exactly as it is</li>
      </ul>

      <div className="rounded-2xl border border-line bg-paper p-5 sm:p-7">
        <div ref={box} className="relative grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-28 lg:pl-16">
          <svg className="pointer-events-none absolute inset-0 hidden size-full overflow-visible lg:block" aria-hidden>
            <defs><marker id="cm-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="currentColor" /></marker></defs>
            {lines.map((l) => (
              <path key={l.id} d={l.d} fill="none" markerEnd="url(#cm-arrow)" stroke="currentColor"
                className={l.kind === "bridge" ? "text-go" : "text-ink-soft"} strokeWidth={active === l.id ? 3 : 2} strokeDasharray={l.kind === "bridge" ? "6 5" : undefined} />
            ))}
          </svg>
          {lines.filter((l) => l.mid && l.label).map((l) => (
            <span key={`p-${l.id}`} style={{ left: l.mid!.x, top: l.mid!.y }} className="absolute z-10 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full bg-go px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-white shadow lg:inline-flex">
              <RefreshCw className="size-3" aria-hidden /> {l.label}
            </span>
          ))}

          <div className="space-y-3">
            <p className="text-[12px] font-medium text-ink-mute">Suggested experiences</p>
            {visible.map((s) => {
              const i = bp.suggestedExperiences.indexOf(s);
              const pr = priorityOf(i, s);
              return (
                <div key={s.id} data-node={`s:${s.id}`} className="rounded-xl border border-go/30 bg-go-soft/40 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[15px] font-semibold">{s.label}</p>
                    <Chip tone={pr.tone} className="!text-[11px]">{pr.label}</Chip>
                  </div>
                  <p className="mt-1.5 flex flex-wrap items-center gap-1 text-[12px]">
                    <MapPin className="size-3.5 text-sky" aria-label="Appears on" />
                    {s.pageContexts.slice(0, 3).map((c) => <span key={c.pageId} className="rounded bg-paper px-1.5 py-0.5 text-ink-soft ring-1 ring-line">{page(c.pageId)?.title}</span>)}
                    {s.pageContexts.length > 3 && <span className="text-ink-mute">+{s.pageContexts.length - 3}</span>}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col justify-center space-y-3">
            <p className="text-[12px] font-medium text-ink-mute">Your process</p>
            {destIds.map((a) => (
              <div key={a} data-node={`a:${a}`} className="rounded-xl bg-ink px-4 py-3 text-white shadow-sm">
                <p className="flex items-center gap-2 text-[15px] font-semibold"><Lock className="size-4 opacity-70" aria-hidden /> {asset(a)?.label}</p>
                <p className="mt-0.5 text-[12px] text-white/70">Stays exactly as it is</p>
              </div>
            ))}
            {!destIds.length && <p className="text-[13px] text-ink-mute">No hand-over to an existing form or booking found.</p>}
          </div>
        </div>
      </div>

      <div>
        <p className="mb-2 text-[13px] font-medium text-ink-mute">Each connection · a plan, nothing is connected</p>
        <ul className="grid gap-3 md:grid-cols-2">
          {connections.map((c) => <ConnectionCard key={c.id} c={c} active={active === c.id} onFocus={() => setActive(c.id)} onBlur={() => setActive(null)} />)}
        </ul>
      </div>
    </section>
  );
}

function ConnectionCard({ c, active, onFocus, onBlur }: { c: ConnectionSuggestion; active: boolean; onFocus: () => void; onBlur: () => void }) {
  const { bp, suggestion, asset, decisionFor, decide, undo } = useAnalysis();
  const d = decisionFor("connection", c.id);
  const st = connectionState(c, bp);
  const from = suggestion(c.fromSuggestionId)?.label;
  const to = c.to.kind === "suggestion" ? suggestion(c.to.id)?.label : asset(c.to.id)?.label;
  const [adjusting, setAdjusting] = useState(false);
  const [note, setNote] = useState(d?.edits?.note ?? "");
  const M = mech[st.mechanism];

  return (
    <li onMouseEnter={onFocus} onMouseLeave={onBlur} onFocus={onFocus} onBlur={onBlur} data-testid={`connection-${c.id}`}
      className={`rounded-xl border bg-paper p-4 transition-colors ${active ? "border-go/50" : "border-line"} ${d?.status === "rejected" ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-2 text-[12px] text-ink-mute">
        <M.Icon className={`size-4 ${st.mechanism === "bridge" ? "text-go" : "text-ink"}`} aria-hidden />
        <span className="font-medium text-ink-soft">{M.label}</span>
        <span className="ml-auto inline-flex items-center gap-1"><Link2Off className="size-3" aria-hidden /> not connected yet</span>
      </div>
      <p className="mt-1.5 text-[15px] font-semibold">{from} <span className="text-ink-mute">→</span> {to}</p>
      <p className="mt-1 line-clamp-2 text-[13px] text-ink-soft">{c.rationale}</p>
      {c.mode && <p className="mt-1.5 text-[12px] font-medium text-ink-soft" title={modeText[c.mode].hint}>{modeText[c.mode].label}</p>}
      {c.unavailableFields.length > 0 && <p className="mt-1 text-[12px] text-ink-mute">Not passed on: {c.unavailableFields.join(", ")}</p>}

      {(st.carry.length > 0 || st.missing.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5 text-[12px]">
          {st.carry.map((x) => (
            <span key={`c-${x.label}`} title={x.note ? `Reused as a ${x.note}` : "Could be reused — not asked again"} className="inline-flex items-center gap-1 rounded-full bg-go-soft px-2 py-0.5 text-go-ink">
              <Check className="size-3" aria-hidden /> {x.label}{x.note ? " (preference)" : ""}
            </span>
          ))}
          {st.missing.map((x) => (
            <span key={`m-${x}`} title="Still to ask" className="inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-ink-soft ring-1 ring-line">
              <CircleHelp className="size-3" aria-hidden /> {x}
            </span>
          ))}
        </div>
      )}
      {st.constraints.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {st.constraints.map((x) => <li key={x} className="flex items-start gap-1.5 text-[12px] text-amber"><Info className="mt-0.5 size-3 shrink-0" aria-hidden />{x}</li>)}
        </ul>
      )}
      {d?.status === "edited" && d.edits?.note && <p className="mt-2 rounded-lg bg-canvas px-3 py-1.5 text-[12px]">Your note: {d.edits.note}</p>}
      {adjusting ? (
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); decide({ targetKind: "connection", targetId: c.id, status: note.trim() ? "edited" : "confirmed", edits: note.trim() ? { note: note.trim() } : undefined }); setAdjusting(false); }}>
          <input autoFocus value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="What should be different?" aria-label="Adjustment note"
            className="w-full rounded-lg border border-line px-3 py-1.5 text-[13px] outline-none focus:border-go" />
          <Button type="submit" size="sm" variant="primary">Save</Button>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {d ? (
            <>
              <Chip tone={d.status === "rejected" ? "rose" : "go"}>{d.status === "rejected" ? "Dismissed" : d.status === "edited" ? "Adjusted" : "Kept in plan"}</Chip>
              <Button size="sm" variant="ghost" onClick={() => undo("connection", c.id)}><RotateCcw className="size-3.5" aria-hidden /> Undo</Button>
            </>
          ) : (
            <>
              <Button size="sm" onClick={() => decide({ targetKind: "connection", targetId: c.id, status: "confirmed" })}>Keep</Button>
              <Button size="sm" variant="ghost" onClick={() => setAdjusting(true)}>Adjust</Button>
              <Button size="sm" variant="quiet-danger" onClick={() => decide({ targetKind: "connection", targetId: c.id, status: "rejected" })}>Dismiss</Button>
            </>
          )}
        </div>
      )}
    </li>
  );
}
