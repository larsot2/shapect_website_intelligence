"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertTriangle, Check, Globe, Loader2 } from "lucide-react";

const PHASES = [
  { key: "reading", label: "Reading your website" },
  { key: "understanding", label: "Understanding your business" },
  { key: "mapping", label: "Mapping existing customer journeys" },
  { key: "recommending", label: "Preparing recommendations" },
] as const;

interface Job {
  scanId: string;
  url: string;
  status: "queued" | "running" | "done" | "partial" | "failed";
  phase: string | null;
  phases: Record<string, { status: "pending" | "active" | "done" | "failed"; detail?: string }>;
  activity: string[];
  counts: { found?: number; selected?: number; read?: number; captured?: number };
  error?: string;
  businessName?: string;
  queuePosition?: number;
  createdAt: string;
}

/** Real job status from the server — phases, counts and log lines; no invented percentages. */
export function ScanProgress({ scanId }: { scanId: string }) {
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [missing, setMissing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    let t: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await fetch(`/api/scans/${scanId}`, { cache: "no-store" });
        if (res.status === 404) return alive && setMissing(true);
        const j = (await res.json()) as Job;
        if (!alive) return;
        setJob(j);
        setNow(Date.now());
        if (j.status === "done" || j.status === "partial") {
          t = setTimeout(() => router.replace(`/studio/website/${scanId}`), 900);
          return;
        }
        if (j.status === "failed") return;
      } catch {
        /* transient — keep polling */
      }
      t = setTimeout(poll, 1200);
    };
    poll();
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [scanId, router]);

  if (missing) {
    return (
      <main className="mx-auto max-w-[640px] px-4 py-24 sm:px-6">
        <h1 className="text-2xl font-semibold">We can&apos;t find this analysis.</h1>
        <Link href="/studio/website" className="mt-4 inline-block text-go hover:underline">Start a new one</Link>
      </main>
    );
  }

  const host = job ? new URL(job.url).hostname.replace(/^www\./, "") : "";
  const elapsed = job ? Math.max(0, Math.round((now - Date.parse(job.createdAt)) / 1000)) : 0;
  const finished = job && (job.status === "done" || job.status === "partial");

  return (
    <main className="mx-auto max-w-[680px] px-4 pt-16 pb-24 sm:px-6 sm:pt-24">
      <div className="flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-2xl bg-paper shadow-sm ring-1 ring-line">
          <Globe className="size-5 text-go" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium">{job?.businessName ?? host ?? "…"}</p>
          <p className="text-[13px] text-ink-mute">{host}</p>
        </div>
      </div>
      <h1 className="mt-8 text-[30px] leading-tight font-semibold tracking-tight sm:text-[36px]">
        {job?.status === "failed" ? "The analysis couldn't finish." : finished ? "Your analysis is ready." : "We're reading your website."}
      </h1>
      <p className="mt-2 text-ink-soft">
        {job?.status === "failed" ? job.error : finished ? "Opening your results…" : "Public pages only. Nothing on your website changes."}
      </p>

      <ol className="mt-10 space-y-1" aria-live="polite">
        {PHASES.map((p) => {
          const st = job?.phases?.[p.key]?.status ?? "pending";
          const detail = job?.phases?.[p.key]?.detail;
          return (
            <li key={p.key} className={`flex items-start gap-4 rounded-xl px-4 py-3.5 ${st === "active" ? "bg-paper shadow-sm ring-1 ring-line" : ""}`}>
              <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${st === "done" ? "bg-go text-white" : st === "failed" ? "bg-rose-soft text-rose" : st === "active" ? "bg-go-soft text-go" : "bg-canvas text-ink-mute ring-1 ring-line"}`}>
                {st === "done" ? <Check className="size-3.5" aria-hidden /> : st === "failed" ? <AlertTriangle className="size-3.5" aria-hidden /> : st === "active" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
              </span>
              <div className="min-w-0">
                <p className={`text-[15px] ${st === "pending" ? "text-ink-mute" : "font-medium"}`}>{p.label}</p>
                {st === "active" && job?.activity.at(-1) && <p className="mt-0.5 text-[13px] text-ink-soft">{job.activity.at(-1)}</p>}
                {st !== "active" && detail && <p className="mt-0.5 text-[13px] text-ink-mute">{detail}</p>}
              </div>
            </li>
          );
        })}
      </ol>

      {job && !finished && job.status !== "failed" && (
        <p className="mt-8 text-[13px] text-ink-mute tabular-nums">
          {job.status === "queued" ? `Waiting for another scan to finish${job.queuePosition && job.queuePosition > 0 ? ` (#${job.queuePosition + 1} in line)` : ""}. ` : ""}
          {[job.counts.found && `${job.counts.found} pages found`, job.counts.selected && `${job.counts.selected} chosen to read`, job.counts.captured && `${job.counts.captured} captured`].filter(Boolean).join(" · ")}
          {job.counts.found ? " · " : ""}{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
        </p>
      )}
      {job?.status === "failed" && (
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={`/studio/website?url=${encodeURIComponent(job.url)}`} className="inline-flex h-10 items-center rounded-lg bg-ink px-4 text-sm font-medium text-white">Try again</Link>
          <Link href="/studio/website" className="inline-flex h-10 items-center rounded-lg border border-line bg-paper px-4 text-sm font-medium">Back</Link>
        </div>
      )}
    </main>
  );
}
