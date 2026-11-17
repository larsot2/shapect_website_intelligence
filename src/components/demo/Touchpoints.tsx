"use client";

import { ArrowRight, Building2, CheckCircle2, CircleHelp, FileText, KeyRound, Users, Accessibility } from "lucide-react";
import { ENTRIES, PHOTO, type EntryId } from "@/lib/demo/passion";

/**
 * Touchpoints as they would sit inside Passion Built's pages. Designed at the page's 1280 px scale
 * (the whole page preview is scaled down as one), so proportions match the real site.
 */
export function Touchpoint({ entry, onLaunch, showLabel }: { entry: EntryId; onLaunch: () => void; showLabel: boolean }) {
  const e = ENTRIES[entry];
  const cta = (
    <button type="button" onClick={onLaunch} className="inline-flex h-[54px] items-center gap-2.5 rounded-full px-8 text-[17px] font-semibold text-white shadow-[0_10px_24px_-10px_rgba(0,0,0,.45)] transition-transform hover:-translate-y-0.5" style={{ background: e.accent }}>
      {e.touchpoint.cta}<ArrowRight className="size-5" aria-hidden />
    </button>
  );
  return (
    <div className="relative bg-white px-[90px] py-[56px]" data-testid={`touchpoint-${entry}`}>
      {showLabel && (
        <span className="pointer-events-none absolute top-4 left-[90px] z-10 inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1 text-[13px] font-medium text-white">
          <span className="size-1.5 rounded-full bg-emerald-400" />Shapect touchpoint · {e.short}
        </span>
      )}
      <div className={`relative overflow-hidden rounded-[28px] ${showLabel ? "outline outline-2 outline-offset-[10px] outline-dashed outline-ink/25" : ""}`}>
        {entry === "cost" && (
          <div className="grid grid-cols-[1.15fr_1fr] items-center gap-10 bg-[#f3f7f6] p-12">
            <div>
              <p className="text-[15px] font-semibold tracking-wide uppercase" style={{ color: e.accent }}>Bathroom cost guide</p>
              <h3 className="mt-3 text-[40px] leading-[1.1] font-semibold tracking-tight text-[#1f2a2e]">{e.touchpoint.headline}</h3>
              <p className="mt-4 text-[19px] text-[#4b5a60]">{e.touchpoint.copy} Based on Passion Built&apos;s own published figures.</p>
              <div className="mt-8">{cta}</div>
            </div>
            <div className="rounded-3xl bg-white p-7 shadow-[0_24px_60px_-30px_rgba(15,118,110,.55)]">
              {[["Room", ["Main bathroom", "Ensuite"]], ["Layout", ["Keep it", "Move plumbing"]], ["Finish", ["Essentials", "Comfort", "Premium"]]].map(([label, opts]) => (
                <div key={label as string} className="mb-5">
                  <p className="mb-2 text-[14px] font-medium text-[#6b7a80]">{label as string}</p>
                  <div className="flex gap-2">{(opts as string[]).map((o, i) => <span key={o} className={`rounded-full px-4 py-2 text-[15px] font-medium ${i === 0 ? "text-white" : "bg-[#f1f4f4] text-[#4b5a60]"}`} style={i === 0 ? { background: e.accent } : undefined}>{o}</span>)}</div>
                </div>
              ))}
              <div className="rounded-2xl p-5 text-white" style={{ background: e.accent }}>
                <p className="text-[13px] text-white/75">e.g. main bathroom, layout kept, basic fixtures</p>
                <p className="text-[30px] font-semibold">$22–23K <span className="text-[15px] font-normal text-white/75">inc GST · published</span></p>
              </div>
            </div>
          </div>
        )}
        {entry === "design" && (
          <div className="bg-[#1f1a1e] p-12 text-white">
            <div className="flex items-end justify-between gap-10">
              <div className="max-w-[560px]">
                <p className="text-[15px] font-semibold tracking-wide text-[#e7b8d9] uppercase">Design Explorer</p>
                <h3 className="mt-3 text-[42px] leading-[1.1] font-semibold tracking-tight">{e.touchpoint.headline}</h3>
                <p className="mt-4 text-[19px] text-white/75">{e.touchpoint.copy}</p>
              </div>
              {cta}
            </div>
            <div className="mt-10 grid grid-cols-4 gap-4">
              {[["warm-1", "Warm & Natural"], ["minimal-3", "Modern & Minimal"], ["luxury-1", "Refined Luxury"], ["tile-terrazzo", "Bold & Expressive"]].map(([img, label]) => (
                <button key={img} type="button" onClick={onLaunch} className="group relative aspect-[4/5] overflow-hidden rounded-2xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={PHOTO(img)} alt="" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  <span className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  <span className="absolute bottom-4 left-4 text-[18px] font-semibold">{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {entry === "granny" && (
          <div className="grid grid-cols-[0.9fr_1.1fr] bg-[#fbf4ea]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={PHOTO("granny")} alt="" className="h-full min-h-[380px] w-full object-cover" />
            <div className="p-12">
              <p className="text-[15px] font-semibold tracking-wide uppercase" style={{ color: e.accent }}>Granny Flat Planner</p>
              <h3 className="mt-3 text-[42px] leading-[1.1] font-semibold tracking-tight text-[#2b211a]">{e.touchpoint.headline}</h3>
              <p className="mt-4 text-[19px] text-[#5d4f44]">{e.touchpoint.copy}</p>
              <div className="mt-6 flex gap-3">
                {[[KeyRound, "For tenants"], [Users, "For family"], [Accessibility, "Easier to use"]].map(([Icon, t]) => {
                  const I = Icon as typeof KeyRound;
                  return <span key={t as string} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[15px] font-medium text-[#5d4f44]"><I className="size-4" style={{ color: e.accent }} />{t as string}</span>;
                })}
              </div>
              <div className="mt-8">{cta}</div>
            </div>
          </div>
        )}
        {entry === "apartment" && (
          <div className="grid grid-cols-[1.1fr_0.9fr] items-center gap-10 border border-[#dbe6ef] bg-[#f4f8fb] p-12">
            <div>
              <p className="flex items-center gap-2 text-[15px] font-semibold tracking-wide uppercase" style={{ color: e.accent }}><Building2 className="size-5" />Apartment readiness check</p>
              <h3 className="mt-3 text-[40px] leading-[1.1] font-semibold tracking-tight text-[#1c2a36]">{e.touchpoint.headline}</h3>
              <p className="mt-4 text-[19px] text-[#4a5a68]">{e.touchpoint.copy}</p>
              <div className="mt-8">{cta}</div>
            </div>
            <div className="space-y-3 rounded-3xl bg-white p-7 shadow-[0_24px_60px_-30px_rgba(45,95,138,.5)]">
              {[[CheckCircle2, "#1d7a4f", "Strata-managed building"], [CircleHelp, "#a8660b", "Approval for moving the toilet?"], [CircleHelp, "#a8660b", "Lift booking for trades"], [CheckCircle2, "#1d7a4f", "Copy of the by-laws"]].map(([Icon, c, t]) => {
                const I = Icon as typeof CheckCircle2;
                return <p key={t as string} className="flex items-center gap-3 rounded-xl bg-[#f6f9fb] px-4 py-3 text-[16px] text-[#2c3a46]"><I className="size-5" style={{ color: c as string }} />{t as string}</p>;
              })}
            </div>
          </div>
        )}
        {entry === "readiness" && (
          <div className="grid grid-cols-[1.2fr_0.8fr] items-center gap-10 bg-[#eef3f0] p-12">
            <div>
              <p className="text-[15px] font-semibold tracking-wide uppercase" style={{ color: e.accent }}>Renovation brief</p>
              <h3 className="mt-3 text-[42px] leading-[1.1] font-semibold tracking-tight text-[#14261f]">{e.touchpoint.headline}</h3>
              <p className="mt-4 text-[19px] text-[#46584f]">{e.touchpoint.copy}</p>
              <div className="mt-8">{cta}</div>
            </div>
            <div className="rounded-3xl bg-white p-7 shadow-[0_24px_60px_-30px_rgba(29,79,61,.5)]">
              <p className="flex items-center gap-2 text-[16px] font-semibold text-[#14261f]"><FileText className="size-5" style={{ color: e.accent }} />Your renovation brief</p>
              {["Project overview", "Design preferences", "Goals & priorities", "To discuss on site"].map((t, i) => (
                <div key={t} className="mt-4">
                  <p className="text-[13px] font-medium text-[#6b7c73]">{t}</p>
                  <span className="mt-1.5 block h-2.5 rounded-full bg-[#e3ebe6]" style={{ width: `${88 - i * 14}%` }} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <p className="mt-3 text-right text-[13px] text-[#8a9499]">Powered by Shapect</p>
    </div>
  );
}
