"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Link2Off, RotateCcw } from "lucide-react";
import type { ConnectionSuggestion } from "@/lib/blueprint/schema";
import { Button, Chip, SectionHeading } from "@/components/ui";
import { useAnalysis } from "./AnalysisContext";

type Edge = { from: string; to: string; style: "page" | "continuation" | "destination"; connectionId?: string };
type Line = Edge & { d: string };

const relationLabel = {
  suggested_continuation: "Suggested continuation",
  same_experience_multiple_pages: "Same experience on several pages",
  existing_destination: "Your existing destination",
} as const;

export function ConnectionMap() {
  const { bp, page, asset, decisionFor } = useAnalysis();
  const box = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [active, setActive] = useState<string | null>(null);

  const visible = bp.suggestedExperiences.filter((s) => decisionFor("suggestion", s.id)?.status !== "rejected");
  const visibleIds = new Set(visible.map((s) => s.id));
  const allPageIds = [...new Set(visible.flatMap((s) => s.pageContexts.map((c) => c.pageId)))];
  const pageIds = allPageIds.slice(0, 6);
  const morePages = allPageIds.length - pageIds.length;
  const connections = bp.suggestedConnections.filter(
    (c) => visibleIds.has(c.fromSuggestionId) && (c.to.kind === "existing_asset" || visibleIds.has(c.to.id)),
  );
  const destIds = [...new Set(connections.filter((c) => c.to.kind === "existing_asset").map((c) => c.to.id))];

  const edges: Edge[] = [
    ...visible.flatMap((s) => s.pageContexts.filter((c) => pageIds.includes(c.pageId)).map((c) => ({ from: `p:${c.pageId}`, to: `s:${s.id}`, style: "page" as const }))),
    ...connections.map((c) => ({
      from: `s:${c.fromSuggestionId}`,
      to: c.to.kind === "suggestion" ? `s:${c.to.id}` : `a:${c.to.id}`,
      style: c.relation === "suggested_continuation" ? ("continuation" as const) : ("destination" as const),
      connectionId: c.id,
    })),
  ];
  const edgeKey = JSON.stringify(edges);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const root = el.getBoundingClientRect();
      const rect = (key: string) => el.querySelector(`[data-node="${key}"]`)?.getBoundingClientRect();
      const out: Line[] = [];
      for (const e of JSON.parse(edgeKey) as Edge[]) {
        const a = rect(e.from), b = rect(e.to);
        if (!a || !b) continue;
        if (e.style === "continuation") {
          // same column: arc on the right side
          const x = a.right - root.left, y1 = a.top + a.height / 2 - root.top, y2 = b.top + b.height / 2 - root.top;
          out.push({ ...e, d: `M${x},${y1} C${x + 48},${y1} ${x + 48},${y2} ${x},${y2}` });
        } else {
          const x1 = a.right - root.left, y1 = a.top + a.height / 2 - root.top;
          const x2 = b.left - root.left, y2 = b.top + b.height / 2 - root.top;
          const mx = (x1 + x2) / 2;
          out.push({ ...e, d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}` });
        }
      }
      setLines(out);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [edgeKey]);

  if (visible.length === 0) return null;

  return (
    <section aria-labelledby="conn-title">
      <SectionHeading id="connections" eyebrow="Planning only — not connected yet" title="How these experiences could work together" />
      <div className="rounded-2xl border border-line bg-paper p-6 sm:p-8">
        <div ref={box} className="relative grid gap-6 lg:grid-cols-[1fr_1.3fr_1fr] lg:gap-20">
          <svg className="pointer-events-none absolute inset-0 hidden size-full overflow-visible lg:block" aria-hidden>
            <defs>
              <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="currentColor" /></marker>
            </defs>
            {lines.map((l, i) => (
              <path
                key={i}
                d={l.d}
                fill="none"
                markerEnd={l.style === "page" ? undefined : "url(#arrow)"}
                className={
                  l.style === "page" ? "text-line" : l.style === "continuation" ? "text-go" : "text-ink-soft"
                }
                stroke="currentColor"
                strokeWidth={l.connectionId && l.connectionId === active ? 3 : l.style === "page" ? 1.5 : 2}
                strokeDasharray={l.style === "continuation" ? "6 5" : undefined}
              />
            ))}
          </svg>

          <Column title="Your pages">
            {pageIds.map((p) => (
              <div key={p} data-node={`p:${p}`} className="rounded-lg border border-line bg-canvas/60 px-3 py-2 text-[13px] font-medium">{page(p)?.title}</div>
            ))}
            {morePages > 0 && <p className="px-1 text-[12px] text-ink-mute">+ {morePages} more page{morePages > 1 ? "s" : ""}</p>}
          </Column>
          <Column title="Suggested experiences">
            {visible.map((s) => (
              <div key={s.id} data-node={`s:${s.id}`} className="rounded-xl border border-go/30 bg-go-soft/40 px-4 py-3">
                <p className="text-[15px] font-semibold">{s.label}</p>
                <p className="text-[12px] text-ink-mute">{s.pageContexts.length > 1 ? `Same experience on ${s.pageContexts.length} pages` : "On 1 page"}</p>
              </div>
            ))}
          </Column>
          <Column title="Already on your website">
            {destIds.map((a) => (
              <div key={a} data-node={`a:${a}`} className="rounded-xl border border-ink/15 bg-paper px-4 py-3 shadow-sm">
                <p className="text-[15px] font-semibold">{asset(a)?.label}</p>
                <p className="text-[12px] text-ink-mute">Stays exactly as it is</p>
              </div>
            ))}
          </Column>
        </div>

        <div className="mt-6 hidden flex-wrap gap-5 border-t border-line pt-4 text-[12px] text-ink-mute lg:flex">
          <span className="flex items-center gap-2"><svg width="28" height="6" aria-hidden><path d="M0,3 H28" stroke="#e6e3dc" strokeWidth="2" /></svg> Same experience on several pages</span>
          <span className="flex items-center gap-2"><svg width="28" height="6" aria-hidden><path d="M0,3 H28" stroke="#1d7a4f" strokeWidth="2" strokeDasharray="6 5" /></svg> Suggested continuation</span>
          <span className="flex items-center gap-2"><svg width="28" height="6" aria-hidden><path d="M0,3 H28" stroke="#46535b" strokeWidth="2" /></svg> Leads to your existing destination</span>
        </div>

        <ul className="mt-6 grid gap-3 md:grid-cols-2">
          {connections.map((c) => (
            <ConnectionCard key={c.id} c={c} active={active === c.id} onFocus={() => setActive(c.id)} onBlur={() => setActive(null)} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="relative flex flex-col justify-center gap-3">
      <p className="text-[12px] font-medium text-ink-mute">{title}</p>
      {children}
    </div>
  );
}

function ConnectionCard({ c, active, onFocus, onBlur }: { c: ConnectionSuggestion; active: boolean; onFocus: () => void; onBlur: () => void }) {
  const { suggestion, asset, decisionFor, decide, undo } = useAnalysis();
  const d = decisionFor("connection", c.id);
  const from = suggestion(c.fromSuggestionId)?.label;
  const to = c.to.kind === "suggestion" ? suggestion(c.to.id)?.label : asset(c.to.id)?.label;
  const [adjusting, setAdjusting] = useState(false);
  const [note, setNote] = useState(d?.edits?.note ?? "");

  return (
    <li
      onMouseEnter={onFocus}
      onMouseLeave={onBlur}
      onFocus={onFocus}
      onBlur={onBlur}
      className={`rounded-xl border p-4 transition-colors ${active ? "border-go/50 bg-go-soft/20" : "border-line"} ${d?.status === "rejected" ? "opacity-60" : ""}`}
      data-testid={`connection-${c.id}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[14px] font-semibold">{from} → {to}</p>
        <Chip className="ml-auto"><Link2Off className="size-3" aria-hidden /> Not connected yet</Chip>
      </div>
      <p className="mt-1 text-[12px] text-ink-mute">{relationLabel[c.relation]}</p>
      <p className="mt-2 text-[14px] text-ink-soft">{c.rationale}</p>
      {c.possibleSharedFields.length > 0 && (
        <p className="mt-2 text-[13px]"><span className="text-ink-mute">Could carry forward:</span> {c.possibleSharedFields.map((f) => f.replace(/_/g, " ")).join(", ")}</p>
      )}
      {d?.status === "edited" && d.edits?.note && <p className="mt-2 rounded-lg bg-canvas px-3 py-2 text-[13px]">Your note: {d.edits.note}</p>}
      {adjusting ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            decide({ targetKind: "connection", targetId: c.id, status: note.trim() ? "edited" : "confirmed", edits: note.trim() ? { note: note.trim() } : undefined });
            setAdjusting(false);
          }}
        >
          <input autoFocus value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="What should be different?" aria-label="Adjustment note"
            className="w-full rounded-lg border border-line px-3 py-1.5 text-[14px] outline-none focus:border-go" />
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
