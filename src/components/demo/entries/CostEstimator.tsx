"use client";

import { useState } from "react";
import { Bath, Brush, ExternalLink, HelpCircle, Hammer, MoveDiagonal, Shrink, Expand, Square, Wrench, Package } from "lucide-react";
import { COMPANY, MAKEOVER_QUOTE, PHOTO, PRICE_SOURCE } from "@/lib/demo/passion";
import { fmtK, matchCostReference, type Finish, type Layout, type RoomType } from "@/lib/demo/cost";
import { LABELS, useDemo } from "@/lib/demo/state";
import { ChoiceCard, Footer, Handoff, Segmented, StageTitle, Steps } from "../kit";
import type { EntryProps } from "./types";

type Scope = "complete" | "not_sure" | "makeover";

/** "Main bathroom with no drainage moving · basic to premium fixtures" */
function describe(rows: { caseLabel: string; levelLabel: string }[]): string {
  const cases = [...new Set(rows.map((r) => r.caseLabel))];
  return cases.map((c) => {
    const levels = rows.filter((r) => r.caseLabel === c).map((r) => r.levelLabel.toLowerCase());
    return `${c.toLowerCase()} · ${levels.length > 1 ? `${levels[0].replace(" fixtures", "")} to ${levels[levels.length - 1]}` : levels[0]}`;
  }).join("; ");
}

export function CostEstimator({ onBridge, accent }: EntryProps) {
  const { commit } = useDemo();
  const [step, setStep] = useState(0);
  const [scope, setScope] = useState<Scope>();
  const [room, setRoom] = useState<RoomType>();
  const [size, setSize] = useState<"compact" | "average" | "large">();
  const [layout, setLayout] = useState<Layout>();
  const [finish, setFinish] = useState<Finish>();
  const [contact, setContact] = useState(false);

  const result = room && layout && finish ? matchCostReference(room, layout, finish) : null;
  const finishResult = () => {
    if (!result || !room || !layout || !finish) return;
    commit("cost", { project: { scope: scope === "makeover" ? undefined : scope, roomType: room, roomSize: size, layoutIntent: layout, finish, costReference: { text: `${fmtK(result.low, result.high)} inc GST · ${describe(result.rows)} (Passion Built published reference)`, low: result.low, high: result.high } } });
    setStep(3);
  };

  if (scope === "makeover" && step === 1) {
    return (
      <div className="animate-fade">
        <StageTitle eyebrow="A quick refresh?" title="This one's probably a job for a handyman." sub="Passion Built focuses on complete bathroom renovations with a fixed-price contract. For paint, new taps or a light fitting, their own advice is refreshingly honest:" />
        <blockquote className="rounded-2xl border-l-4 bg-canvas p-4 text-[15px] leading-relaxed text-ink-soft" style={{ borderColor: accent }}>
          “{MAKEOVER_QUOTE}”
          <a href={PRICE_SOURCE.url} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-1 text-[12px] font-medium text-ink-mute hover:text-ink">Passion Built · {PRICE_SOURCE.title} <ExternalLink className="size-3" aria-hidden /></a>
        </blockquote>
        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" onClick={() => { setScope("complete"); setStep(1); }} className="inline-flex h-11 items-center rounded-xl px-5 text-[15px] font-semibold text-white" style={{ background: accent }}>Explore a complete renovation instead</button>
          <a href={COMPANY.contactUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-line px-4 text-[15px] font-medium hover:border-ink-mute">Ask Passion Built <ExternalLink className="size-4" aria-hidden /></a>
        </div>
        <Footer onBack={() => { setScope(undefined); setStep(0); }} accent={accent} />
      </div>
    );
  }

  return (
    <div>
      <Steps labels={["Your project", "Your bathroom", "Finish", "Cost guide"]} current={step} accent={accent} />
      <div className="mt-6 animate-fade" key={step}>
        {step === 0 && (
          <>
            <StageTitle eyebrow="Step 1 of 3" title="What kind of renovation are you thinking about?" />
            <div className="grid gap-3 sm:grid-cols-3">
              <ChoiceCard accent={accent} selected={scope === "complete"} onClick={() => setScope("complete")} icon={<Hammer className="size-5" />} title="Complete bathroom renovation" desc="Strip out and rebuild — waterproofing, tiling, fixtures." />
              <ChoiceCard accent={accent} selected={scope === "not_sure"} onClick={() => setScope("not_sure")} icon={<HelpCircle className="size-5" />} title="Not sure what I need" desc="We'll show what a complete renovation typically involves." />
              <ChoiceCard accent={accent} selected={scope === "makeover"} onClick={() => setScope("makeover")} icon={<Brush className="size-5" />} title="Minor cosmetic makeover" desc="Paint, new taps, a light fitting." />
            </div>
            <Footer accent={accent} nextDisabled={!scope} onNext={() => setStep(1)} />
          </>
        )}
        {step === 1 && (
          <>
            <StageTitle eyebrow="Step 2 of 3" title="Tell us about the bathroom." sub="Three quick choices — they decide which of Passion Built's published references apply." />
            <div className="space-y-6">
              <div>
                <p className="mb-2 text-[14px] font-medium">Which room?</p>
                <div className="grid grid-cols-2 gap-3">
                  <ChoiceCard compact accent={accent} selected={room === "main"} onClick={() => setRoom("main")} icon={<Bath className="size-5" />} title="Main bathroom" />
                  <ChoiceCard compact accent={accent} selected={room === "ensuite"} onClick={() => setRoom("ensuite")} icon={<Square className="size-5" />} title="Ensuite" />
                </div>
              </div>
              <div>
                <p className="mb-2 text-[14px] font-medium">Roughly how big is it?</p>
                <div className="grid grid-cols-3 gap-3">
                  <ChoiceCard compact accent={accent} selected={size === "compact"} onClick={() => setSize("compact")} icon={<Shrink className="size-5" />} title="Compact" desc="around 1 × 2 m" />
                  <ChoiceCard compact accent={accent} selected={size === "average"} onClick={() => setSize("average")} icon={<Square className="size-5" />} title="Average" />
                  <ChoiceCard compact accent={accent} selected={size === "large"} onClick={() => setSize("large")} icon={<Expand className="size-5" />} title="Large" desc="around 3 × 3 m" />
                </div>
              </div>
              <div>
                <p className="mb-2 text-[14px] font-medium">The layout — shower, toilet and vanity</p>
                <Segmented label="Layout" accent={accent} value={layout} onChange={setLayout} options={[{ value: "keep", label: "Keep where they are" }, { value: "move", label: "Move some of them" }, { value: "not_sure", label: "Not sure yet" }]} />
                {layout === "move" && <p className="mt-2 flex items-center gap-1.5 text-[13px] text-ink-soft"><MoveDiagonal className="size-3.5" aria-hidden />Moving drainage is one of the factors Passion Built prices separately.</p>}
              </div>
            </div>
            <Footer accent={accent} onBack={() => setStep(0)} nextDisabled={!room || !size || !layout} onNext={() => setStep(2)} />
          </>
        )}
        {step === 2 && (
          <>
            <StageTitle eyebrow="Step 3 of 3" title="What level of finish feels right?" sub="This is your preference — not a fixed package." />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <ChoiceCard compact accent={accent} selected={finish === "essentials"} onClick={() => setFinish("essentials")} image={PHOTO("tile-calm")} title="Practical essentials" desc="Durable, simple, done well." />
              <ChoiceCard compact accent={accent} selected={finish === "comfort"} onClick={() => setFinish("comfort")} image={PHOTO("warm-1")} title="Modern comfort" desc="Nicer materials, smart storage." />
              <ChoiceCard compact accent={accent} selected={finish === "premium"} onClick={() => setFinish("premium")} image={PHOTO("luxury-1")} title="Premium finishes" desc="Designer tapware, statement pieces." />
              <ChoiceCard compact accent={accent} selected={finish === "own_fixtures"} onClick={() => setFinish("own_fixtures")} icon={<Package className="size-5" />} title="I'll supply my own fixtures" desc="I want to choose every tap and tile myself." />
            </div>
            <p className="mt-3 text-[12px] text-ink-mute">Photos: Passion Built projects.</p>
            <Footer accent={accent} onBack={() => setStep(1)} nextDisabled={!finish} onNext={finishResult} nextLabel="See my cost guide" />
          </>
        )}
        {step === 3 && result && room && layout && finish && (
          <>
            <div className="overflow-hidden rounded-3xl text-white" style={{ background: `linear-gradient(135deg, ${accent}, #0b3b37)` }}>
              <div className="p-6 sm:p-8">
                <p className="text-[13px] font-medium text-white/70">Passion Built&apos;s published reference for your project</p>
                <p className="mt-2 text-[44px] leading-none font-semibold tracking-tight sm:text-[56px]">{fmtK(result.low, result.high)}<span className="ml-2 text-[16px] font-medium text-white/70">inc GST</span></p>
                <p className="mt-3 text-[15px] text-white/85">{LABELS.roomType[room]} · {LABELS.layoutIntent[layout].toLowerCase()} · {LABELS.finish[finish].toLowerCase()}</p>
              </div>
              <div className="grid gap-px bg-white/15 sm:grid-cols-3">
                {[
                  { k: "Published reference", v: "What you see above — Passion Built's own figures for this kind of room.", on: true },
                  { k: "Illustrative scenario", v: "None used. We don't invent prices or formulas.", on: false },
                  { k: "Actual quotation", v: "A fixed-price written quote after a free site inspection.", on: false },
                ].map((x) => (
                  <div key={x.k} className={`p-4 ${x.on ? "bg-white/12" : "bg-black/10"}`} style={x.on ? { background: "rgba(255,255,255,.14)" } : undefined}>
                    <p className="text-[12px] font-semibold tracking-wide uppercase">{x.k}</p>
                    <p className="mt-1 text-[13px] text-white/80">{x.v}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {result.rows.map((r) => (
                <div key={`${r.caseLabel}${r.levelLabel}`} className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-[14px]">
                  <span><span className="font-medium">{r.caseLabel}</span><span className="text-ink-soft"> · {r.levelLabel}</span></span>
                  <span className="font-semibold tabular-nums">{fmtK(r.low, r.high)}</span>
                </div>
              ))}
              {result.notes.map((n) => <p key={n} className="flex gap-2 text-[13px] text-ink-soft"><Wrench className="mt-0.5 size-3.5 shrink-0" aria-hidden />{n}</p>)}
              {size && <p className="flex gap-2 text-[13px] text-ink-soft"><Wrench className="mt-0.5 size-3.5 shrink-0" aria-hidden />Room size ({LABELS.roomSize[size].toLowerCase()}) isn&apos;t broken out in the published figures — it&apos;s confirmed at the site inspection.</p>}
              <a href={PRICE_SOURCE.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-ink-mute hover:text-ink">Source: Passion Built · “{PRICE_SOURCE.title}” · captured {PRICE_SOURCE.captured} <ExternalLink className="size-3" aria-hidden /></a>
            </div>

            <div className="mt-7 rounded-2xl bg-canvas p-5">
              <p className="text-[18px] font-semibold">Want to turn this into a renovation plan?</p>
              <p className="mt-1 text-[14px] text-ink-soft">Your answers come with you — you won&apos;t be asked again.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => onBridge("readiness")} className="inline-flex h-11 items-center rounded-xl px-5 text-[15px] font-semibold text-white" style={{ background: accent }}>Continue to Project Readiness</button>
                <button type="button" onClick={() => setContact(true)} className="inline-flex h-11 items-center rounded-xl border border-line bg-paper px-4 text-[15px] font-medium hover:border-ink-mute">Contact Passion Built</button>
              </div>
              {contact && (
                <div className="mt-4">
                  <Handoff title="Contact Passion Built" url={COMPANY.contactUrl} accent={accent} fileName="passion-built-cost-guide.txt"
                    text={`My bathroom project (Cost Estimator)\n- ${LABELS.roomType[room]}, ${LABELS.layoutIntent[layout].toLowerCase()}\n- Finish preference: ${LABELS.finish[finish]}\n- Published reference: ${fmtK(result.low, result.high)} inc GST (${describe(result.rows)})\nSource: ${PRICE_SOURCE.url}`} />
                </div>
              )}
            </div>
            <Footer accent={accent} onBack={() => setStep(2)} />
          </>
        )}
      </div>
    </div>
  );
}
