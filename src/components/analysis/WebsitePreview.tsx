"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Lock, Monitor, Smartphone, Sparkles } from "lucide-react";
import type { AssetAction, BBox, Viewport } from "@/lib/blueprint/schema";
import { Button, Chip } from "@/components/ui";
import { editedText, useAnalysis } from "./AnalysisContext";
import { Shot } from "./Shot";
import { assetKindLabel, proposalLabel, reviewLabel, reviewTone } from "./labels";

type Marker =
  | { kind: "asset"; key: string; assetId: string; placement: string; bbox: BBox; n: number; action?: AssetAction }
  | { kind: "touchpoint"; key: string; suggestionId: string; touchpointId: string; bbox: BBox };

const groupOrder = ["home", "services", "design", "costs", "contact", "trust", "other"] as const;
const groupLabel = { home: "Home", services: "Services", design: "Design", costs: "Costs", contact: "Contact", trust: "Trust", other: "Other" };
const placementLabel = (p: string) => ({ header: "in the header", nav: "in the menu", main: "in the page", footer: "in the footer", hero: "in the hero", "footer-band": "near the bottom", "end-of-article": "end of article" } as Record<string, string>)[p] ?? p;
const MARKED_KINDS = new Set(["cta_link", "contact_form", "multi_step_form", "calculator", "booking", "phone"]);

export function WebsitePreview() {
  const { bp, base, screenshot, page, decisionFor } = useAnalysis();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const pagesWithShots = bp.pages.filter((p) => p.screenshots.length > 0);
  const pageId = pagesWithShots.some((p) => p.id === params.get("page")) ? params.get("page")! : pagesWithShots[0]?.id;
  const vp: Viewport = params.get("vp") === "mobile" ? "mobile" : "desktop";
  const selectedKey = params.get("marker");

  const setParams = (next: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) v === null ? sp.delete(k) : sp.set(k, v);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  const markers: Marker[] = (() => {
    if (!pageId) return [];
    const out: Marker[] = [];
    let n = 0;
    for (const a of bp.conversionAssets) {
      if (!MARKED_KINDS.has(a.kind)) continue;
      let perAsset = 0;
      const occs = [...a.occurrences].sort((x, y) => (["main", "hero"].includes(x.placement) ? -1 : 0) - (["main", "hero"].includes(y.placement) ? -1 : 0));
      for (const o of occs) {
        if (o.pageId !== pageId) continue;
        const bbox = o.bboxes.find((b) => b.viewport === vp);
        if (!bbox) continue;
        // keep overlays calm: phone/email once per page, other assets at most twice
        if (++perAsset > (a.kind === "phone" || a.kind === "email" ? 1 : 2)) continue;
        out.push({ kind: "asset", key: `asset:${a.id}:${o.placement}`, assetId: a.id, placement: o.placement, bbox, n: ++n,
          action: bp.assetActions.find((x) => x.assetId === a.id && x.pageId === pageId) });
      }
    }
    for (const s of bp.suggestedExperiences) {
      if (decisionFor("suggestion", s.id)?.status === "rejected") continue;
      for (const t of s.touchpoints) {
        if (t.pageId !== pageId) continue;
        const bbox = t.bboxes.find((b) => b.viewport === vp);
        if (bbox) out.push({ kind: "touchpoint", key: t.id, suggestionId: s.id, touchpointId: t.id, bbox });
      }
    }
    return out;
  })();

  const unverified = bp.suggestedExperiences.flatMap((s) =>
    decisionFor("suggestion", s.id)?.status === "rejected" ? [] :
    s.touchpoints.filter((t) => t.pageId === pageId && !t.bboxes.some((b) => b.viewport === vp)).map((t) => ({ s, t })),
  );
  const selected = markers.find((m) => m.key === selectedKey);
  const shot = pageId ? screenshot(pageId, vp) : undefined;

  // Bring the selected marker into view when arriving from a deep link.
  const stage = useRef<HTMLDivElement>(null);
  const [scrolledFor, setScrolledFor] = useState<string | null>(null);
  useEffect(() => {
    if (!selected || scrolledFor === selected.key + vp) return;
    const el = stage.current?.querySelector(`[data-marker="${selected.key}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScrolledFor(selected.key + vp);
  }, [selected, vp, scrolledFor]);

  if (!pageId || !shot) {
    return <main className="mx-auto max-w-[760px] px-6 py-20 text-ink-soft">No screenshots were captured for this analysis.</main>;
  }

  return (
    <main className="mx-auto max-w-[1400px] px-4 pt-6 pb-20 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link href={base} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-ink-soft hover:bg-paper hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> Results
        </Link>
        <h1 className="text-lg font-semibold tracking-tight">Website preview</h1>
        <span className="hidden text-[13px] text-ink-mute md:inline">A picture of your website with our suggestions on top. Your site isn&apos;t changed.</span>
        <div role="radiogroup" aria-label="Device" className="ml-auto flex rounded-lg border border-line bg-paper p-0.5">
          {(["desktop", "mobile"] as const).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={vp === v} onClick={() => setParams({ vp: v === "desktop" ? null : v })}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium ${vp === v ? "bg-ink text-white" : "text-ink-soft hover:text-ink"}`}>
              {v === "desktop" ? <Monitor className="size-4" aria-hidden /> : <Smartphone className="size-4" aria-hidden />}
              {v === "desktop" ? "Desktop" : "Mobile"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[200px_1fr_340px]">
        {/* page list */}
        <nav aria-label="Pages" className="lg:sticky lg:top-20 lg:self-start">
          <ul className="flex gap-3 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">
            {groupOrder.flatMap((g) => pagesWithShots.filter((p) => p.group === g)).map((p) => (
              <li key={p.id} className="w-36 shrink-0 lg:w-auto">
                <button type="button" onClick={() => setParams({ page: p.id, marker: null })} aria-current={p.id === pageId ? "page" : undefined}
                  className={`w-full rounded-xl border p-1.5 text-left transition-colors ${p.id === pageId ? "border-ink bg-paper shadow-sm" : "border-transparent hover:border-line hover:bg-paper"}`}>
                  <Shot pageId={p.id} vp={vp} className="aspect-[16/10] rounded-lg" sizes="200px" />
                  <span className="block px-1 pt-1.5 text-[13px] font-medium">{p.title}</span>
                  <span className="block px-1 text-[11px] text-ink-mute">{groupLabel[p.group]}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* screenshot stage */}
        <div className="min-w-0">
          <div className={`mx-auto overflow-hidden rounded-2xl border border-line bg-paper shadow-[0_24px_60px_-34px_rgba(18,26,31,.45)] ${vp === "mobile" ? "max-w-[390px]" : ""}`}>
            <div className="flex items-center gap-1.5 border-b border-line px-3 py-2" aria-hidden>
              <span className="size-2.5 rounded-full bg-line" /><span className="size-2.5 rounded-full bg-line" /><span className="size-2.5 rounded-full bg-line" />
              <span className="ml-2 truncate rounded-md bg-canvas px-3 py-0.5 text-[11px] text-ink-mute">{page(pageId)?.url}</span>
            </div>
            <div ref={stage} className="relative" style={{ aspectRatio: `${shot.width} / ${shot.height}` }}>
              <Image src={shot.src} alt={`Screenshot of ${page(pageId)?.title} (${vp})`} fill sizes="(min-width: 1024px) 800px, 100vw" unoptimized={shot.src.startsWith("/api/")} className="object-cover object-top" priority />
              {markers.map((m) => (
                <MarkerBox key={m.key} m={m} w={shot.width} h={shot.height} selected={m.key === selectedKey}
                  onSelect={() => setParams({ marker: m.key === selectedKey ? null : m.key })} />
              ))}
            </div>
          </div>
        </div>

        {/* context panel */}
        <aside className="lg:sticky lg:top-20 lg:self-start" aria-live="polite">
          {selected ? (
            <MarkerPanel m={selected} onClose={() => setParams({ marker: null })} />
          ) : (
            <PageSummary markers={markers} unverified={unverified} onSelect={(k) => setParams({ marker: k })} />
          )}
        </aside>
      </div>
    </main>
  );
}

function MarkerBox({ m, w, h, selected, onSelect }: { m: Marker; w: number; h: number; selected: boolean; onSelect: () => void }) {
  const { asset, suggestion, decisionFor } = useAnalysis();
  const pad = 6;
  const style = {
    left: `${((m.bbox.x - pad) / w) * 100}%`,
    top: `${((m.bbox.y - pad) / h) * 100}%`,
    width: `${((m.bbox.width + pad * 2) / w) * 100}%`,
    height: `${((m.bbox.height + pad * 2) / h) * 100}%`,
  };
  if (m.kind === "asset") {
    const a = asset(m.assetId);
    return (
      <button type="button" data-marker={m.key} onClick={onSelect} style={style} aria-pressed={selected}
        aria-label={`Existing: ${a?.label} (${m.placement})`}
        className={`absolute z-10 rounded-lg border-2 transition-colors ${selected ? "border-sky bg-sky/10" : "border-sky/50 hover:border-sky hover:bg-sky/5"}`}>
        <span className="absolute -top-2.5 -left-2.5 grid size-5 place-items-center rounded-full bg-sky text-[11px] font-semibold text-white shadow">{m.n}</span>
      </button>
    );
  }
  const s = suggestion(m.suggestionId)!;
  const t = s.touchpoints.find((x) => x.id === m.touchpointId)!;
  const d = decisionFor("suggestion", s.id);
  return (
    <button type="button" data-marker={m.key} onClick={onSelect} style={style} aria-pressed={selected}
      aria-label={`Suggested: ${s.label}`}
      className={`absolute z-0 rounded-xl border-2 border-dashed transition-colors ${selected ? "border-go bg-go/15" : "border-go/70 bg-go/[.06] hover:bg-go/10"}`}>
      <span className="absolute -top-3 left-3 inline-flex max-w-[calc(100%-24px)] items-center gap-1 truncate rounded-full bg-go px-2.5 py-0.5 text-[11px] font-medium text-white shadow">
        <Sparkles className="size-3 shrink-0" aria-hidden />
        <span className="truncate">{editedText(d, `touchpoint.${t.id}.headline`, t.headline)}</span>
      </span>
    </button>
  );
}

function PageSummary({ markers, unverified, onSelect }: {
  markers: Marker[];
  unverified: { s: { id: string; label: string }; t: { id: string; headline: string } }[];
  onSelect: (key: string) => void;
}) {
  const { asset, suggestion } = useAnalysis();
  const existing = markers.filter((m) => m.kind === "asset");
  const suggested = markers.filter((m) => m.kind === "touchpoint");
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-paper p-5">
        <h2 className="text-sm font-semibold">On this page</h2>
        <p className="mt-0.5 text-[13px] text-ink-mute">Click a marker to see what exists, what we suggest, and why.</p>
        {suggested.length > 0 && (
          <ul className="mt-4 space-y-2">
            {suggested.map((m) => m.kind === "touchpoint" && (
              <li key={m.key}>
                <button type="button" onClick={() => onSelect(m.key)} className="flex w-full items-center gap-2 rounded-lg border border-dashed border-go/60 bg-go-soft/40 px-3 py-2 text-left text-[13px] hover:bg-go-soft">
                  <Sparkles className="size-3.5 text-go" aria-hidden /><span className="font-medium">{suggestion(m.suggestionId)?.label}</span>
                  <span className="ml-auto text-[11px] text-go-ink">Suggested</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <ul className="mt-2 space-y-1.5">
          {existing.map((m) => m.kind === "asset" && (
            <li key={m.key}>
              <button type="button" onClick={() => onSelect(m.key)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-canvas">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-sky text-[11px] font-semibold text-white">{m.n}</span>
                <span className="truncate">{asset(m.assetId)?.label}</span>
                <span className="ml-auto shrink-0 text-[11px] text-ink-mute">{placementLabel(m.placement)}</span>
              </button>
            </li>
          ))}
        </ul>
        {markers.length === 0 && <p className="mt-3 text-[13px] text-ink-mute">Nothing to mark on this page.</p>}
      </div>
      {unverified.length > 0 && (
        <div className="rounded-2xl border border-dashed border-line bg-paper/60 p-5 text-[13px]">
          <p className="font-medium">Suggested section, exact position not verified</p>
          <ul className="mt-2 space-y-1 text-ink-soft">
            {unverified.map(({ s, t }) => <li key={t.id}>{s.label}: “{t.headline}”</li>)}
          </ul>
        </div>
      )}
      <p className="flex items-center gap-1.5 px-1 text-[12px] text-ink-mute"><Lock className="size-3.5" aria-hidden /> Preview only — nothing is placed on your website.</p>
    </div>
  );
}

function MarkerPanel({ m, onClose }: { m: Marker; onClose: () => void }) {
  return (
    <div className="animate-fade rounded-2xl border border-line bg-paper p-5 shadow-sm">
      {m.kind === "asset" ? <AssetDetail m={m} /> : <TouchpointDetail m={m} />}
      <button type="button" onClick={onClose} className="mt-4 text-[13px] text-ink-mute hover:text-ink">← All markers on this page</button>
    </div>
  );
}

function Step({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-line pb-4 pl-4 last:pb-0">
      <p className="text-[11px] font-semibold tracking-wide text-ink-mute uppercase">{label}</p>
      <div className="mt-1 text-[14px]">{children}</div>
    </div>
  );
}

function AssetDetail({ m }: { m: Extract<Marker, { kind: "asset" }> }) {
  const { asset, page, decisionFor, decide, undo } = useAnalysis();
  const a = asset(m.assetId)!;
  const action = m.action;
  const d = action ? decisionFor("assetAction", action.id) : undefined;
  const current = (d?.edits?.proposal as AssetAction["proposal"] | undefined) ?? action?.proposal;
  const target = a.targetPageId ? page(a.targetPageId) : undefined;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-full bg-sky text-[12px] font-semibold text-white">{m.n}</span>
        <h2 className="font-semibold">{a.label}</h2>
      </div>
      <Step label="What exists">{assetKindLabel[a.kind]} · {placementLabel(m.placement)}{a.siteWide ? " · on most pages" : ""}{a.fields?.length ? <span className="mt-1 block text-[13px] text-ink-mute">Asks for: {a.fields.slice(0, 8).map((f) => f.replace(/\s*\(.*\)$/, "")).join(", ")}</span> : null}</Step>
      <Step label="What we suggest">
        {action ? (
          <>
            <div role="radiogroup" aria-label="Proposed action" className="mt-1 flex flex-wrap gap-1.5">
              {(Object.keys(proposalLabel) as AssetAction["proposal"][]).map((p) => (
                <button key={p} type="button" role="radio" aria-checked={current === p}
                  onClick={() => decide({ targetKind: "assetAction", targetId: action.id, status: p === action.proposal ? "confirmed" : "edited", edits: p === action.proposal ? undefined : { proposal: p } })}
                  className={`rounded-full border px-3 py-1 text-[12px] font-medium ${current === p ? "border-ink bg-ink text-white" : "border-line text-ink-soft hover:border-ink-mute"}`}>
                  {proposalLabel[p]}{p === action.proposal ? " · ours" : ""}
                </button>
              ))}
            </div>
            {d ? (
              <p className="mt-2 flex items-center gap-2 text-[12px]">
                <Chip tone={reviewTone[d.status]}>{d.status === "rejected" ? "Dismissed" : d.status === "edited" ? "Your choice saved" : "Confirmed"}</Chip>
                <button type="button" className="text-ink-mute hover:text-ink" onClick={() => undo("assetAction", action.id)}>Undo</button>
              </p>
            ) : (
              <p className="mt-2 text-[12px] text-ink-mute">Unconfirmed. Choosing an option saves it as your decision — nothing changes on your site.</p>
            )}
          </>
        ) : (
          <span className="text-ink-soft">No change suggested.</span>
        )}
      </Step>
      {action && <Step label="Why">{action.rationale}</Step>}
      <Step label="Where it leads">{target ? target.title : a.targetUrl ?? a.observedOutcome ?? "—"}{a.observedOutcome && target ? <span className="block text-[13px] text-ink-mute">{a.observedOutcome}</span> : null}</Step>
    </div>
  );
}

function TouchpointDetail({ m }: { m: Extract<Marker, { kind: "touchpoint" }> }) {
  const { suggestion, asset, decisionFor, decide, undo } = useAnalysis();
  const s = suggestion(m.suggestionId)!;
  const t = s.touchpoints.find((x) => x.id === m.touchpointId)!;
  const d = decisionFor("suggestion", s.id);
  const key = `touchpoint.${t.id}.headline`;
  const [text, setText] = useState(editedText(d, key, t.headline));
  const near = t.assetId ? asset(t.assetId) : undefined;
  const target = s.conversionTargetAssetId ? asset(s.conversionTargetAssetId) : undefined;
  const save = (status: "confirmed" | "rejected") => {
    const edits = { ...(d?.edits ?? {}) };
    if (text.trim() && text.trim() !== t.headline) edits[key] = text.trim();
    else delete edits[key];
    const hasEdits = Object.keys(edits).length > 0;
    decide({ targetKind: "suggestion", targetId: s.id, status: status === "confirmed" && hasEdits ? "edited" : status, edits });
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Chip tone="go"><Sparkles className="size-3" aria-hidden /> Suggested</Chip>
        <h2 className="font-semibold">{s.label}</h2>
      </div>
      <Step label="What exists">{near ? `${near.label} (${assetKindLabel[near.kind].toLowerCase()})` : "Page content — no interactive help here yet."}</Step>
      <Step label="What we suggest">
        <label className="block">
          <span className="sr-only">Headline</span>
          <input value={text} maxLength={140} onChange={(e) => setText(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line px-3 py-1.5 text-[14px] outline-none focus:border-go" />
        </label>
        <p className="mt-1 text-[12px] text-ink-mute">Exact position measured on the rendered page.</p>
      </Step>
      <Step label="Why">{s.reasoning[0]}</Step>
      <Step label="Where it leads"><span className="inline-flex items-center gap-1.5">{s.label} <ArrowRight className="size-3.5" aria-hidden /> {target?.label ?? "—"}</span></Step>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {d ? (
          <>
            <Chip tone={reviewTone[d.status]}>{reviewLabel[d.status]}</Chip>
            <Button size="sm" variant="primary" onClick={() => save("confirmed")} disabled={text.trim() === editedText(d, key, t.headline)}>Save text</Button>
            <Button size="sm" variant="ghost" onClick={() => undo("suggestion", s.id)}>Undo</Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="primary" onClick={() => save("confirmed")}>Confirm</Button>
            <Button size="sm" variant="quiet-danger" onClick={() => save("rejected")}>Not for us</Button>
          </>
        )}
      </div>
    </div>
  );
}
