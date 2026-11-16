import Link from "next/link";
import { ArrowRight, Globe } from "lucide-react";
import { fixtureSource } from "@/lib/blueprint/source";
import { listJobs } from "@/lib/analyzer/store";
import { ScanForm } from "@/components/analysis/ScanForm";

export const dynamic = "force-dynamic";

const statusChip: Record<string, { label: string; cls: string }> = {
  queued: { label: "Waiting", cls: "bg-canvas text-ink-soft" },
  running: { label: "Analysing…", cls: "bg-sky-soft text-sky" },
  done: { label: "Ready", cls: "bg-go-soft text-go-ink" },
  partial: { label: "Partial", cls: "bg-amber-soft text-amber" },
  failed: { label: "Failed", cls: "bg-rose-soft text-rose" },
};

export default async function WebsiteStart({ searchParams }: { searchParams: Promise<{ url?: string }> }) {
  const { url } = await searchParams;
  const [jobs, demos] = await Promise.all([listJobs(), fixtureSource.list()]);
  const fmt = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <main className="mx-auto max-w-[760px] px-4 pt-16 pb-24 sm:px-6 sm:pt-24">
      <div className="grid size-12 place-items-center rounded-2xl bg-paper shadow-sm ring-1 ring-line">
        <Globe className="size-6 text-go" aria-hidden />
      </div>
      <h1 className="mt-6 text-[36px] leading-tight font-semibold tracking-tight sm:text-[44px]">Let&apos;s understand your website.</h1>
      <p className="mt-3 text-[17px] text-ink-soft">We analyse your public website. We won&apos;t change anything.</p>

      <ScanForm initialUrl={url ?? ""} />

      {jobs.length > 0 && (
        <section className="mt-14">
          <h2 className="text-[13px] font-medium text-ink-mute">Your analyses</h2>
          <ul className="mt-3 space-y-2">
            {jobs.slice(0, 20).map((j) => {
              const host = new URL(j.url).hostname.replace(/^www\./, "");
              const href = j.status === "done" || j.status === "partial" ? `/studio/website/${j.scanId}` : `/studio/website/run/${j.scanId}`;
              const chip = statusChip[j.status];
              return (
                <li key={j.scanId}>
                  <Link href={href} className="group flex items-center gap-4 rounded-xl border border-line bg-paper px-4 py-3 hover:border-ink-mute">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{j.businessName ?? host}</p>
                      <p className="truncate text-[13px] text-ink-mute">{host} · {fmt.format(new Date(j.createdAt))}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium ${chip.cls}`}>{chip.label}</span>
                    <ArrowRight className="size-4 text-ink-mute transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="mt-12">
        <h2 className="text-[13px] font-medium text-ink-mute">Demo</h2>
        <ul className="mt-3 space-y-2">
          {demos.map((a) => (
            <li key={a.scanId}>
              <Link href={`/studio/website/${a.scanId}`} className="group flex items-center gap-4 rounded-xl border border-dashed border-line bg-paper/60 px-4 py-3 hover:border-ink-mute">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{a.businessName}</p>
                  <p className="truncate text-[13px] text-ink-mute">{a.note} — not a real scan</p>
                </div>
                <span className="rounded-full bg-amber-soft px-2.5 py-0.5 text-[12px] font-medium text-amber">Demo fixture</span>
                <ArrowRight className="size-4 text-ink-mute" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
