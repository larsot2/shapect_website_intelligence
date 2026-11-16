"use client";

import Link from "next/link";
import { ArrowDown, MonitorSmartphone } from "lucide-react";
import { useAnalysis } from "./AnalysisContext";
import { Shot } from "./Shot";

export function SnapshotHero() {
  const { bp, base } = useAnalysis();
  const contactKinds = new Set(
    bp.conversionAssets.filter((a) => ["contact_form", "multi_step_form", "booking", "phone", "email", "chat"].includes(a.kind)).map((a) => a.kind),
  );
  const host = new URL(bp.website.url).host;
  const stats = [
    { value: bp.diagnostics.scannedPageCount, label: "pages read" },
    { value: contactKinds.size, label: "ways to get in touch" },
    { value: bp.suggestedExperiences.length, label: bp.suggestedExperiences.length === 1 ? "recommendation" : "recommendations" },
  ];

  return (
    <section className="grid items-center gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
      <div className="order-2 lg:order-1">
        <p className="text-[13px] font-medium text-go">Your website, understood.</p>
        <h1 className="mt-2 text-[34px] leading-[1.1] font-semibold tracking-tight sm:text-[44px]">{bp.website.businessName}</h1>
        <p className="mt-1 text-sm text-ink-mute">{host}</p>
        <p className="mt-5 max-w-[540px] text-[17px] leading-relaxed text-ink-soft">{bp.website.summary}</p>

        <dl className="mt-7 flex flex-wrap gap-x-8 gap-y-4">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="sr-only">{s.label}</dt>
              <dd className="text-[28px] leading-none font-semibold tabular-nums">{s.value}</dd>
              <dd className="mt-1 text-[13px] text-ink-mute">{s.label}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-8 flex flex-wrap gap-3">
          <a href="#recommendations" className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-ink px-4 text-sm font-medium text-white hover:bg-ink/90">
            See what we found <ArrowDown className="size-4" aria-hidden />
          </a>
          <Link href={`${base}/preview`} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line bg-paper px-4 text-sm font-medium hover:border-ink-mute">
            <MonitorSmartphone className="size-4" aria-hidden /> Website preview
          </Link>
        </div>
      </div>

      <Link href={`${base}/preview`} className="group order-1 block lg:order-2" aria-label="Open website preview">
        <div className="relative rounded-2xl border border-line bg-paper p-2 shadow-[0_24px_60px_-28px_rgba(18,26,31,.35)] transition-transform group-hover:-translate-y-0.5">
          <div className="flex items-center gap-1.5 px-2 pt-1 pb-2" aria-hidden>
            <span className="size-2.5 rounded-full bg-line" /><span className="size-2.5 rounded-full bg-line" /><span className="size-2.5 rounded-full bg-line" />
            <span className="ml-3 truncate rounded-md bg-canvas px-3 py-0.5 text-[11px] text-ink-mute">{host}</span>
          </div>
          <Shot pageId={bp.pages[0].id} className="aspect-[16/10] rounded-lg" sizes="(min-width: 1024px) 560px, 100vw" priority />
        </div>
      </Link>
    </section>
  );
}
