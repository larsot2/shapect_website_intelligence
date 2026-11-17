"use client";

import { useState } from "react";
import { ArrowRight, Check, Database, ExternalLink, Globe2 } from "lucide-react";
import { COMPANY, CONNECTIONS, ENTRIES, ENTRY_ORDER, PAGES, type Connection, type ConnectionKind, type EntryId, type PageKey } from "@/lib/demo/passion";
import { memoryRows, useDemo } from "@/lib/demo/state";

type Sel = { t: "entry"; id: EntryId } | { t: "page"; id: PageKey } | { t: "conn"; id: string } | { t: "state" } | { t: "biz"; id: "quote" | "contact" } | null;
type Box = { x: number; y: number; w: number; h: number };

const PAGE_BOX = (i: number): Box => ({ x: 20, y: 34 + i * 112, w: 180, h: 64 });
const ENTRY_BOX: Record<Exclude<EntryId, "readiness">, Box> = {
  cost: { x: 320, y: 26, w: 260, h: 84 }, design: { x: 320, y: 140, w: 260, h: 84 }, granny: { x: 320, y: 254, w: 260, h: 84 }, apartment: { x: 320, y: 368, w: 260, h: 84 },
};
const READY: Box = { x: 690, y: 196, w: 260, h: 116 };
const QUOTE: Box = { x: 1022, y: 214, w: 172, h: 80 };
const CONTACT: Box = { x: 1022, y: 70, w: 172, h: 80 };
const STATE: Box = { x: 320, y: 530, w: 630, h: 70 };
const box = (id: string): Box => (id === "readiness" ? READY : id === "quote" ? QUOTE : id === "contact" ? CONTACT : id in ENTRY_BOX ? ENTRY_BOX[id as keyof typeof ENTRY_BOX] : PAGE_BOX(PAGES.findIndex((p) => p.key === id)));
const R = (b: Box) => ({ x: b.x + b.w, y: b.y + b.h / 2 });
const L = (b: Box) => ({ x: b.x, y: b.y + b.h / 2 });
const curve = (a: { x: number; y: number }, b: { x: number; y: number }) => `M${a.x},${a.y} C${(a.x + b.x) / 2},${a.y} ${(a.x + b.x) / 2},${b.y} ${b.x},${b.y}`;

const KIND: Record<ConnectionKind, { label: string; color: string; dash?: string; width: number; meaning: string }> = {
  touchpoint: { label: "Touchpoint", color: "#9aa4aa", width: 1.6, meaning: "Where an Experience starts on the website. Not a Bridge — just an invitation on a page." },
  bridge: { label: "Bridge", color: "#1d7a4f", width: 3, meaning: "An explicit offer to continue from one independent Experience into another, carrying confirmed answers." },
  reuse: { label: "Session reuse", color: "#6b7280", dash: "2 6", width: 2.2, meaning: "No offer, no click — a later Experience simply remembers what the visitor already confirmed in this visit." },
  handoff: { label: "Hand-off", color: "#121a1f", dash: "8 6", width: 2.2, meaning: "A transition into Passion Built's existing process. It opens their page; nothing is submitted automatically." },
};

function geometry(c: Connection): { d: string; mid: { x: number; y: number } } {
  if (c.kind === "reuse") return { d: `M${STATE.x + 440},${STATE.y} L${STATE.x + 440},${READY.y + READY.h + 6}`, mid: { x: STATE.x + 440, y: (STATE.y + READY.y + READY.h) / 2 + 8 } };
  if (c.id === "b-granny-design") {
    // short vertical arrow between the two stacked boxes
    const x = ENTRY_BOX.granny.x + 200;
    return { d: `M${x},${ENTRY_BOX.granny.y} L${x},${ENTRY_BOX.design.y + ENTRY_BOX.design.h + 4}`, mid: { x: x - 92, y: (ENTRY_BOX.granny.y + ENTRY_BOX.design.y + ENTRY_BOX.design.h) / 2 } };
  }
  const a = R(box(c.from)), b = L(box(c.to));
  // labels sit where they can't collide: bridges right after their source, the long hand-off near its target
  const mid = c.kind === "bridge" ? { x: a.x + 40, y: a.y } : c.id === "h-design" ? { x: b.x - 42, y: b.y } : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return { d: curve(a, { x: b.x - 4, y: b.y }), mid };
}

export function NetworkView() {
  const { state, launch, setView, setPage } = useDemo();
  const [sel, setSel] = useState<Sel>({ t: "conn", id: "b-design" });
  const active = (c: Connection) => sel?.t === "conn" ? sel.id === c.id : sel?.t === "entry" ? c.from === sel.id || c.to === sel.id : sel?.t === "page" ? c.from === sel.id : sel?.t === "state" ? c.kind === "reuse" : sel?.t === "biz" ? c.to === sel.id : true;
  const dim = (on: boolean) => (sel ? (on ? 1 : 0.22) : 1);
  const showOnSite = (p: PageKey) => { setPage(p); setView("website"); };

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-w-0 rounded-2xl border border-line bg-paper p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[20px] font-semibold tracking-tight">Passion Built · Experience Network</h2>
            <p className="text-[13px] text-ink-soft">Five independent Experiences, connected only where it helps the visitor. Click anything.</p>
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-soft">
            {(Object.keys(KIND) as ConnectionKind[]).map((k) => (
              <li key={k} className="flex items-center gap-1.5"><svg width="26" height="8" aria-hidden><line x1="0" y1="4" x2="26" y2="4" stroke={KIND[k].color} strokeWidth={KIND[k].width} strokeDasharray={KIND[k].dash} /></svg>{KIND[k].label}</li>
            ))}
          </ul>
        </div>
        <div className="overflow-x-auto">
          <svg viewBox="0 0 1210 620" className="min-w-[720px] w-full" role="img" aria-label="Experience network diagram">
            <defs>
              {(Object.keys(KIND) as ConnectionKind[]).map((k) => (
                <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={KIND[k].color} /></marker>
              ))}
            </defs>
            {/* column captions */}
            {[["Website touchpoints", 20], ["Independent Experiences", 320], ["Shared continuation", 690], ["Existing process", 1022]].map(([t, x]) => (
              <text key={t as string} x={x as number} y={16} fontSize="12" fontWeight="600" fill="#7a868d" letterSpacing="0.06em">{(t as string).toUpperCase()}</text>
            ))}

            {/* edges */}
            {CONNECTIONS.map((c) => {
              const g = geometry(c), k = KIND[c.kind], on = active(c);
              return (
                <g key={c.id} opacity={dim(on)} className="cursor-pointer" onClick={() => setSel({ t: "conn", id: c.id })} data-testid={`edge-${c.id}`}>
                  <path d={g.d} fill="none" stroke="transparent" strokeWidth="16" />
                  <path d={g.d} fill="none" stroke={c.kind === "bridge" ? ENTRIES[c.from as EntryId].accent : k.color} strokeWidth={sel?.t === "conn" && sel.id === c.id ? k.width + 1.5 : k.width} strokeDasharray={k.dash} markerEnd={c.kind === "reuse" ? undefined : `url(#arrow-${c.kind})`} />
                  {(c.kind === "bridge" || c.kind === "handoff" || c.kind === "reuse") && (
                    <g transform={`translate(${g.mid.x},${g.mid.y})`}>
                      <rect x={-34} y={-11} width={68} height={22} rx={11} fill="#fff" stroke={c.kind === "bridge" ? ENTRIES[c.from as EntryId].accent : k.color} />
                      <text textAnchor="middle" y={4} fontSize="11" fontWeight="600" fill="#121a1f">{c.kind === "reuse" ? "reuse" : c.id === "b-granny-design" ? "optional" : k.label}</text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* page nodes */}
            {PAGES.map((p, i) => {
              const b = PAGE_BOX(i), on = !sel || (sel.t === "page" && sel.id === p.key) || (sel.t === "entry" && sel.id === p.entry);
              return (
                <g key={p.key} transform={`translate(${b.x},${b.y})`} opacity={sel ? (on ? 1 : 0.45) : 1} className="cursor-pointer" onClick={() => setSel({ t: "page", id: p.key })}>
                  <rect width={b.w} height={b.h} rx={14} fill="#f6f5f1" stroke={sel?.t === "page" && sel.id === p.key ? "#121a1f" : "#e6e3dc"} strokeWidth={sel?.t === "page" && sel.id === p.key ? 2 : 1} />
                  <text x={16} y={27} fontSize="15" fontWeight="600" fill="#121a1f">{p.label}</text>
                  <text x={16} y={47} fontSize="12" fill="#7a868d">{p.label === "Home" ? "passionbuilt.com.au" : p.path.slice(0, 24) + (p.path.length > 24 ? "…" : "")}</text>
                </g>
              );
            })}

            {/* entry nodes */}
            {ENTRY_ORDER.map((id) => {
              const b = box(id), e = ENTRIES[id], isSel = sel?.t === "entry" && sel.id === id;
              const on = !sel || isSel || (sel.t === "conn" && CONNECTIONS.some((c) => c.id === sel.id && (c.from === id || c.to === id))) || (sel.t === "page" && PAGES.find((p) => p.key === sel.id)?.entry === id) || sel.t === "state";
              return (
                <g key={id} transform={`translate(${b.x},${b.y})`} opacity={on ? 1 : 0.45} className="cursor-pointer" onClick={() => setSel({ t: "entry", id })} data-testid={`node-${id}`}>
                  <rect width={b.w} height={b.h} rx={16} fill="#fff" stroke={isSel ? e.accent : "#e6e3dc"} strokeWidth={isSel ? 2.5 : 1} style={{ filter: "drop-shadow(0 8px 18px rgba(18,26,31,.08))" }} />
                  <rect width={6} height={b.h - 24} x={0} y={12} rx={3} fill={e.accent} />
                  <text x={20} y={30} fontSize="15.5" fontWeight="700" fill="#121a1f">{e.short}</text>
                  <text x={20} y={50} fontSize="12" fill="#46535b">{id === "readiness" ? "Works on its own" : e.interaction.split("·")[0].trim()}</text>
                  {id === "readiness" && <text x={20} y={70} fontSize="12" fill="#46535b">and as the shared continuation</text>}
                  {state.completed.includes(id) && (
                    <g transform={`translate(${b.w - 26},14)`}><circle r={10} cx={6} cy={6} fill="#1d7a4f" /><path d="M1.5,6.5 L4.8,9.5 L10.5,3" stroke="#fff" strokeWidth="2" fill="none" /></g>
                  )}
                </g>
              );
            })}

            {/* existing business process */}
            {(["contact", "quote"] as const).map((id) => {
              const b = box(id), isSel = sel?.t === "biz" && sel.id === id;
              return (
                <g key={id} transform={`translate(${b.x},${b.y})`} className="cursor-pointer" onClick={() => setSel({ t: "biz", id })} opacity={!sel || isSel || (sel.t === "conn" && CONNECTIONS.find((c) => c.id === sel.id)?.to === id) ? 1 : 0.45}>
                  <rect width={b.w} height={b.h} rx={14} fill="#121a1f" stroke={isSel ? "#1d7a4f" : "none"} strokeWidth={2} />
                  <text x={14} y={30} fontSize="13.5" fontWeight="700" fill="#fff">{id === "quote" ? "Free site inspection" : "Contact Passion Built"}</text>
                  <text x={14} y={52} fontSize="12" fill="#c9d1d5">{id === "quote" ? "Passion Built quotation page" : "Passion Built contact page"}</text>
                </g>
              );
            })}

            {/* shared ProjectState */}
            <g transform={`translate(${STATE.x},${STATE.y})`} className="cursor-pointer" onClick={() => setSel({ t: "state" })} data-testid="node-state">
              <rect width={STATE.w} height={STATE.h} rx={16} fill="#eef5f1" stroke={sel?.t === "state" ? "#1d7a4f" : "#cfe3d8"} strokeWidth={sel?.t === "state" ? 2 : 1} strokeDasharray="5 4" />
              <text x={20} y={30} fontSize="15" fontWeight="700" fill="#135c3a">Shared ProjectState</text>
              <text x={20} y={51} fontSize="12" fill="#46535b">Session memory · only confirmed answers · {memoryRows(state).length} field{memoryRows(state).length === 1 ? "" : "s"} right now</text>
              {ENTRY_ORDER.slice(0, 4).map((id, i) => <circle key={id} cx={STATE.w - 150 + i * 22} cy={STATE.h / 2} r={7} fill={state.completed.includes(id) ? ENTRIES[id].accent : "#d9e6df"} />)}
            </g>
            {/* write rails from the entries into the state */}
            <path d={`M${ENTRY_BOX.apartment.x + 130},${ENTRY_BOX.apartment.y + ENTRY_BOX.apartment.h} L${ENTRY_BOX.apartment.x + 130},${STATE.y}`} stroke="#9aa4aa" strokeWidth="2" strokeDasharray="2 6" opacity={dim(sel?.t === "state" || !sel)} />
            <text x={ENTRY_BOX.apartment.x + 140} y={STATE.y - 22} fontSize="11" fill="#7a868d" opacity={dim(sel?.t === "state" || !sel)}>each Experience saves what the visitor confirms</text>
          </svg>
        </div>
      </section>

      <aside className="rounded-2xl border border-line bg-paper p-5" data-testid="network-detail">
        <Detail sel={sel} onLaunch={(id) => launch(id, { kind: "direct" })} onShow={showOnSite} />
      </aside>
    </div>
  );
}

function Detail({ sel, onLaunch, onShow }: { sel: Sel; onLaunch: (id: EntryId) => void; onShow: (p: PageKey) => void }) {
  const { state } = useDemo();
  if (!sel) return <p className="text-[14px] text-ink-soft">Select an Experience, a page or a connection.</p>;

  if (sel.t === "entry") {
    const e = ENTRIES[sel.id];
    const page = PAGES.find((p) => p.key === e.touchpoint.page)!;
    const conns = CONNECTIONS.filter((c) => c.kind !== "touchpoint" && (c.from === sel.id || c.to === sel.id));
    return (
      <div className="animate-fade space-y-4">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold text-white" style={{ background: e.accent }}>Entry</span>
          <h3 className="mt-2 text-[20px] font-semibold tracking-tight">{e.name}</h3>
          <p className="mt-1 text-[14px] text-ink-soft">{e.goal}</p>
        </div>
        <Row k="Visitor leaves with" v={e.outcome} />
        <Row k="How it works" v={e.interaction} />
        <Row k="Touchpoint" v={page.placement} />
        <Fields title="Saves to ProjectState" items={e.writes} />
        {e.reads.length > 0 && <Fields title="Reads" items={e.reads} />}
        <div>
          <p className="mb-1.5 text-[12px] font-semibold tracking-wide text-ink-mute uppercase">Connections</p>
          <ul className="space-y-1 text-[13px]">{conns.map((c) => <li key={c.id}><span className="font-medium">{KIND[c.kind].label}</span> · {c.label}</li>)}</ul>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={() => onLaunch(sel.id)} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-[14px] font-semibold text-white" style={{ background: e.accent }}>Launch <ArrowRight className="size-4" aria-hidden /></button>
          <button type="button" onClick={() => onShow(page.key)} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line px-3.5 text-[14px] font-medium hover:border-ink-mute"><Globe2 className="size-4" aria-hidden />Show on website</button>
        </div>
      </div>
    );
  }

  if (sel.t === "conn") {
    const c = CONNECTIONS.find((x) => x.id === sel.id)!;
    const k = KIND[c.kind];
    const name = (id: string) => (id in ENTRIES ? ENTRIES[id as EntryId].short : id === "quote" ? "Free site inspection page" : id === "contact" ? "Contact page" : `${PAGES.find((p) => p.key === id)?.label} page`);
    return (
      <div className="animate-fade space-y-4">
        <div>
          <span className="inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-semibold text-white" style={{ background: c.kind === "bridge" ? ENTRIES[c.from as EntryId].accent : k.color }}>{k.label}</span>
          <h3 className="mt-2 text-[18px] font-semibold tracking-tight">{name(c.from)} <span className="text-ink-mute">→</span> {name(c.to)}</h3>
          <p className="mt-1 text-[14px] text-ink-soft">“{c.label}”</p>
        </div>
        <Row k="What happens" v={c.behaviour} />
        {c.fields.length > 0 && <Fields title={c.kind === "reuse" ? "Reused" : "Carried over"} items={c.fields} />}
        {c.kind === "handoff" && <a href={c.to === "quote" ? COMPANY.quoteUrl : COMPANY.contactUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-soft hover:text-ink">Open Passion Built&apos;s page <ExternalLink className="size-3.5" aria-hidden /></a>}
        <p className="rounded-xl bg-canvas p-3 text-[13px] text-ink-soft"><span className="font-semibold text-ink">{k.label}:</span> {k.meaning}</p>
      </div>
    );
  }

  if (sel.t === "page") {
    const p = PAGES.find((x) => x.key === sel.id)!;
    return (
      <div className="animate-fade space-y-4">
        <span className="inline-flex rounded-full bg-canvas px-2.5 py-0.5 text-[12px] font-semibold text-ink-soft">Website page</span>
        <h3 className="text-[18px] font-semibold tracking-tight">{p.label}</h3>
        <Row k="Touchpoint" v={p.placement} />
        <Row k="Starts" v={ENTRIES[p.entry].name} />
        {p.key === "house" && <p className="rounded-xl bg-canvas p-3 text-[13px] text-ink-soft">House is not a separate Entry — it&apos;s a contextual way into the shared Project Readiness Experience. The page context alone doesn&apos;t confirm the property type; the visitor does.</p>}
        <button type="button" onClick={() => onShow(p.key)} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line px-3.5 text-[14px] font-medium hover:border-ink-mute"><Globe2 className="size-4" aria-hidden />Show on website</button>
      </div>
    );
  }

  if (sel.t === "biz") {
    return (
      <div className="animate-fade space-y-4">
        <span className="inline-flex rounded-full bg-ink px-2.5 py-0.5 text-[12px] font-semibold text-white">Existing process</span>
        <h3 className="text-[18px] font-semibold tracking-tight">{sel.id === "quote" ? "Free site inspection" : "Contact Passion Built"}</h3>
        <p className="text-[14px] text-ink-soft">Passion Built&apos;s own {sel.id === "quote" ? "quotation page" : "contact page"} stays the conversion destination. Shapect prepares the visitor; the business process doesn&apos;t change.</p>
        <p className="rounded-xl bg-canvas p-3 text-[13px] text-ink-soft">No integration is assumed: the visitor&apos;s brief can be copied or downloaded, but nothing is submitted automatically.</p>
        <a href={sel.id === "quote" ? COMPANY.quoteUrl : COMPANY.contactUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-soft hover:text-ink">Open their page <ExternalLink className="size-3.5" aria-hidden /></a>
      </div>
    );
  }

  const rows = memoryRows(state);
  return (
    <div className="animate-fade space-y-4">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-go-soft px-2.5 py-0.5 text-[12px] font-semibold text-go-ink"><Database className="size-3.5" aria-hidden />ProjectState</span>
      <h3 className="text-[18px] font-semibold tracking-tight">Shared session memory</h3>
      <p className="text-[14px] text-ink-soft">Every Experience saves only what the visitor confirmed. Others reuse it, so nobody starts from zero — and nothing is ever inferred from page context.</p>
      {rows.length ? (
        <ul className="divide-y divide-line rounded-xl border border-line text-[13px]">
          {rows.map((r) => <li key={r.group + r.label} className="flex items-start justify-between gap-3 px-3 py-2"><span><span className="text-ink-mute">{r.label}:</span> {r.value}</span>{r.source && <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium text-white" style={{ background: ENTRIES[r.source].accent }}>{ENTRIES[r.source].short}</span>}</li>)}
        </ul>
      ) : <p className="rounded-xl bg-canvas p-3 text-[13px] text-ink-soft">Empty — complete an Experience to see it fill up.</p>}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div><p className="text-[12px] font-semibold tracking-wide text-ink-mute uppercase">{k}</p><p className="mt-0.5 text-[14px]">{v}</p></div>;
}
function Fields({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1.5 text-[12px] font-semibold tracking-wide text-ink-mute uppercase">{title}</p>
      <div className="flex flex-wrap gap-1.5">{items.map((f) => <span key={f} className="inline-flex items-center gap-1 rounded-full bg-canvas px-2.5 py-1 text-[12px]"><Check className="size-3 text-go" aria-hidden />{f}</span>)}</div>
    </div>
  );
}
