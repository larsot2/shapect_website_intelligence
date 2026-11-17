"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, Eye, EyeOff, Lock, RotateCw } from "lucide-react";
import { ENTRIES, PAGES } from "@/lib/demo/passion";
import { useDemo } from "@/lib/demo/state";
import { Touchpoint } from "./Touchpoints";

/**
 * Screenshot-based preview of Passion Built's real pages with the Shapect touchpoint inserted at its
 * planned position. The page (1280 px) is scaled as one unit so the touchpoint keeps true proportions.
 * The live website is not modified.
 */
export function WebsiteView() {
  const { page, setPage, launch, state } = useDemo();
  const P = PAGES.find((x) => x.key === page)!;
  const E = ENTRIES[P.entry];
  const frame = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);
  const [innerH, setInnerH] = useState(0);
  const [labels, setLabels] = useState(true);

  useLayoutEffect(() => {
    const measure = () => {
      if (frame.current) setScale(frame.current.clientWidth / P.width);
      if (inner.current) setInnerH(inner.current.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (frame.current) ro.observe(frame.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, [P.width, page]);

  // bring the touchpoint into view whenever the page changes
  useEffect(() => {
    const t = setTimeout(() => {
      const s = scroller.current;
      if (!s) return;
      const y = Math.max(0, P.splitY * scale - s.clientHeight * 0.18);
      s.scrollTo({ top: y, behavior: "smooth" });
    }, 350);
    return () => clearTimeout(t);
  }, [page, scale, P.splitY]);

  const open = () => launch(P.entry, { kind: "touchpoint", page: P.key });

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
      <aside className="min-w-0">
        <p className="mb-2 px-1 text-[12px] font-semibold tracking-wide text-ink-mute uppercase">Passion Built pages</p>
        <nav className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible" aria-label="Website pages">
          {PAGES.map((x) => {
            const ent = ENTRIES[x.entry];
            const on = x.key === page;
            return (
              <button key={x.key} type="button" onClick={() => setPage(x.key)} data-testid={`page-${x.key}`}
                className={`flex shrink-0 flex-col rounded-xl border px-3.5 py-2.5 text-left transition-all lg:w-full ${on ? "border-ink bg-paper shadow-sm" : "border-transparent hover:bg-paper"}`}>
                <span className="text-[15px] font-semibold">{x.label}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-mute">
                  <span className="size-2 rounded-full" style={{ background: ent.accent }} />{ent.short}
                  {state.completed.includes(x.entry) && <span className="text-go">· done</span>}
                </span>
              </button>
            );
          })}
        </nav>
        <div className="mt-5 hidden rounded-xl border border-line bg-paper p-3.5 text-[13px] text-ink-soft lg:block">
          <p className="font-medium text-ink">What you&apos;re seeing</p>
          <p className="mt-1">Real screenshots of passionbuilt.com.au, with the planned Shapect touchpoint inserted. The live website is unchanged.</p>
        </div>
      </aside>

      <section className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-paper px-4 py-3">
          <span className="grid size-9 place-items-center rounded-xl text-white" style={{ background: E.accent }}><ArrowRight className="size-4" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">{E.name}</p>
            <p className="truncate text-[13px] text-ink-mute">{P.placement}</p>
          </div>
          <button type="button" onClick={() => setLabels((v) => !v)} className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] text-ink-soft hover:bg-canvas sm:inline-flex" aria-pressed={labels}>
            {labels ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}{labels ? "Hide" : "Show"} labels
          </button>
          <button type="button" onClick={open} className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl px-4 text-[14px] font-semibold text-white sm:w-auto" style={{ background: E.accent }} data-testid="launch-current">
            Launch experience <ArrowRight className="size-4" aria-hidden />
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-line bg-paper shadow-[0_30px_70px_-45px_rgba(18,26,31,.6)]">
          <div className="flex items-center gap-3 border-b border-line bg-canvas px-4 py-2.5">
            <span className="flex gap-1.5"><i className="size-3 rounded-full bg-[#ff5f57]" /><i className="size-3 rounded-full bg-[#febc2e]" /><i className="size-3 rounded-full bg-[#28c840]" /></span>
            <span className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-paper px-3 py-1 text-[13px] text-ink-soft">
              <Lock className="size-3 shrink-0" aria-hidden /><span className="truncate">{P.url.replace("https://", "")}</span>
            </span>
            <RotateCw className="hidden size-4 text-ink-mute sm:block" aria-hidden />
          </div>
          <div ref={scroller} className="h-[min(72vh,820px)] overflow-x-hidden overflow-y-auto overscroll-contain">
            <div ref={frame} className="overflow-hidden" style={{ height: innerH * scale }}>
              <div ref={inner} style={{ width: P.width, transform: `scale(${scale})`, transformOrigin: "top left" }}>
                {/* top of the real page */}
                <div className="relative overflow-hidden" style={{ height: P.splitY }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={P.screenshot} alt={`${P.label} page of passionbuilt.com.au`} width={P.width} height={P.height} className="block max-w-none" />
                </div>
                <Touchpoint entry={P.entry} onLaunch={open} showLabel={labels} />
                {/* rest of the real page */}
                <div className="relative overflow-hidden" style={{ height: P.height - P.splitY }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={P.screenshot} alt="" width={P.width} height={P.height} className="block max-w-none" style={{ marginTop: -P.splitY }} />
                </div>
              </div>
            </div>
          </div>
        </div>
        <p className="mt-2 text-[12px] text-ink-mute">Screenshot preview, captured from passionbuilt.com.au for this demo. Passion Built&apos;s own “Get Quote” and contact paths stay exactly where they are.</p>
      </section>
    </div>
  );
}
