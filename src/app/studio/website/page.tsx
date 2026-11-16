import Link from "next/link";
import { ArrowRight, Globe } from "lucide-react";
import { listBlueprints } from "@/lib/blueprint/source";
import { ScanForm } from "@/components/analysis/ScanForm";

export default async function WebsiteStart() {
  const analyses = await listBlueprints();
  return (
    <main className="mx-auto max-w-[760px] px-4 pt-16 pb-24 sm:px-6 sm:pt-24">
      <div className="grid size-12 place-items-center rounded-2xl bg-paper shadow-sm ring-1 ring-line">
        <Globe className="size-6 text-go" aria-hidden />
      </div>
      <h1 className="mt-6 text-[36px] leading-tight font-semibold tracking-tight sm:text-[44px]">Let&apos;s understand your website.</h1>
      <p className="mt-3 text-[17px] text-ink-soft">We analyse your public website. We won&apos;t change anything.</p>

      <ScanForm />

      {analyses.length > 0 && (
        <section className="mt-14">
          <h2 className="text-[13px] font-medium text-ink-mute">Analyses</h2>
          <ul className="mt-3 space-y-2">
            {analyses.map((a) => (
              <li key={a.scanId}>
                <Link href={`/studio/website/${a.scanId}`} className="group flex items-center gap-4 rounded-xl border border-line bg-paper px-4 py-3 hover:border-ink-mute">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{a.businessName}</p>
                    <p className="truncate text-[13px] text-ink-mute">{a.url}</p>
                  </div>
                  {a.kind === "fixture" && <span className="rounded-full bg-amber-soft px-2.5 py-0.5 text-[12px] font-medium text-amber">Demo fixture</span>}
                  <ArrowRight className="size-4 text-ink-mute transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
