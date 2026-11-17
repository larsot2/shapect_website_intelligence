"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Copy, Download, ExternalLink } from "lucide-react";

export function Steps({ labels, current, accent }: { labels: string[]; current: number; accent: string }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Progress">
      {labels.map((l, i) => (
        <li key={l} className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="h-1 rounded-full transition-colors" style={{ background: i <= current ? accent : "#e6e3dc" }} />
          <span className={`hidden truncate text-[11px] sm:block ${i === current ? "font-medium text-ink" : "text-ink-mute"}`}>{l}</span>
        </li>
      ))}
    </ol>
  );
}

export function StageTitle({ eyebrow, title, sub }: { eyebrow?: string; title: string; sub?: string }) {
  return (
    <div className="mb-5">
      {eyebrow && <p className="text-[12px] font-semibold tracking-wide text-ink-mute uppercase">{eyebrow}</p>}
      <h3 className="mt-1 text-[22px] leading-tight font-semibold tracking-tight sm:text-[26px]">{title}</h3>
      {sub && <p className="mt-1.5 max-w-[560px] text-[15px] text-ink-soft">{sub}</p>}
    </div>
  );
}

/** Big tactile choice: photo or icon, with a clear selected state. */
export function ChoiceCard({ title, desc, image, icon, selected, onClick, accent, badge, compact }: {
  title: string; desc?: string; image?: string; icon?: React.ReactNode; selected: boolean; onClick: () => void; accent: string; badge?: React.ReactNode; compact?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected}
      className={`group relative flex w-full flex-col overflow-hidden rounded-2xl border bg-paper text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-18px_rgba(18,26,31,.45)] ${selected ? "border-transparent" : "border-line"}`}
      style={selected ? { boxShadow: `0 0 0 2px ${accent}, 0 14px 32px -20px ${accent}` } : undefined}>
      {image && (
        <span className={`relative block w-full overflow-hidden bg-canvas ${compact ? "aspect-[4/3]" : "aspect-[5/4]"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" className={`h-full w-full object-cover transition-transform duration-500 ${selected ? "scale-[1.04]" : "group-hover:scale-[1.03]"}`} />
        </span>
      )}
      <span className={`flex flex-1 gap-3 ${compact ? "p-3" : "p-4"}`}>
        {icon && <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: selected ? accent : "#f6f5f1", color: selected ? "#fff" : accent }}>{icon}</span>}
        <span className={`min-w-0 ${image ? "" : "pr-6"}`}>
          <span className={`block font-semibold ${compact ? "text-[14px]" : "text-[15px]"}`}>{title}</span>
          {desc && <span className="mt-0.5 block text-[13px] leading-snug text-ink-soft">{desc}</span>}
        </span>
      </span>
      {badge}
      <span className={`absolute top-2.5 right-2.5 grid size-6 place-items-center rounded-full text-white transition-all ${selected ? "scale-100 opacity-100" : "scale-75 opacity-0"}`} style={{ background: accent }}>
        <Check className="size-3.5" aria-hidden />
      </span>
    </button>
  );
}

export function Segmented<T extends string>({ value, onChange, options, accent, label }: { value?: T; onChange: (v: T) => void; options: { value: T; label: string }[]; accent: string; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-xl bg-canvas p-1">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`rounded-lg px-3.5 py-1.5 text-[14px] font-medium transition-all ${value === o.value ? "text-white shadow-sm" : "text-ink-soft hover:text-ink"}`}
          style={value === o.value ? { background: accent } : undefined}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chips({ options, values, onToggle, accent, max }: { options: string[]; values: string[]; onToggle: (v: string) => void; accent: string; max?: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = values.includes(o);
        const disabled = !on && !!max && values.length >= max;
        return (
          <button key={o} type="button" aria-pressed={on} disabled={disabled} onClick={() => onToggle(o)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[14px] transition-all disabled:opacity-40 ${on ? "border-transparent text-white" : "border-line bg-paper text-ink-soft hover:border-ink-mute"}`}
            style={on ? { background: accent } : undefined}>
            {on && <Check className="size-3.5" aria-hidden />}{o}
          </button>
        );
      })}
    </div>
  );
}

export function Footer({ onBack, onNext, nextLabel = "Continue", nextDisabled, accent, hint }: { onBack?: () => void; onNext?: () => void; nextLabel?: string; nextDisabled?: boolean; accent: string; hint?: string }) {
  return (
    <div className="mt-7 flex items-center justify-between gap-3 border-t border-line pt-5">
      {onBack ? (
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-[14px] font-medium text-ink-soft hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> Back
        </button>
      ) : <span />}
      <div className="flex items-center gap-3">
        {hint && <span className="hidden text-[13px] text-ink-mute sm:inline">{hint}</span>}
        {onNext && (
          <button type="button" onClick={onNext} disabled={nextDisabled}
            className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-[15px] font-semibold text-white shadow-sm transition-opacity disabled:cursor-not-allowed disabled:opacity-35"
            style={{ background: accent }}>
            {nextLabel} <ArrowRight className="size-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

export const toggle = (list: string[], v: string, max?: number) => (list.includes(v) ? list.filter((x) => x !== v) : max && list.length >= max ? list : [...list, v]);

export function copyText(text: string): Promise<boolean> {
  try {
    return navigator.clipboard.writeText(text).then(() => true, () => false);
  } catch {
    return Promise.resolve(false);
  }
}

export function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Hand-over to Passion Built's existing process. Honest: opens their page, sends nothing. */
export function Handoff({ title, url, text, fileName, accent, onDone }: { title: string; url: string; text: string; fileName: string; accent: string; onDone?: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="animate-fade rounded-2xl border border-line bg-canvas p-4 sm:p-5">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-[14px] text-ink-soft">Passion Built&apos;s own page opens in a new tab. Your summary isn&apos;t sent automatically — copy or download it to share it with them.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={async () => { setCopied(await copyText(text)); }} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line bg-paper px-3.5 text-[14px] font-medium hover:border-ink-mute">
          {copied ? <Check className="size-4 text-go" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? "Copied" : "Copy summary"}
        </button>
        <button type="button" onClick={() => downloadText(fileName, text)} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line bg-paper px-3.5 text-[14px] font-medium hover:border-ink-mute">
          <Download className="size-4" aria-hidden /> Download
        </button>
        <a href={url} target="_blank" rel="noreferrer" onClick={onDone} className="inline-flex h-10 items-center gap-1.5 rounded-lg px-4 text-[14px] font-semibold text-white" style={{ background: accent }}>
          Open Passion Built&apos;s page <ExternalLink className="size-4" aria-hidden />
        </a>
      </div>
    </div>
  );
}

/** Small "from your earlier answers" marker inside customer screens. */
export function Carried({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-full bg-go-soft px-2 py-0.5 text-[11px] font-medium text-go-ink"><Check className="size-3" aria-hidden />{children}</span>;
}
