"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";

/** URL entry → POST /api/scans → live progress page. */
export function ScanForm({ initialUrl = "" }: { initialUrl?: string }) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [allowed, setAllowed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/.*)?$/i.test(url.trim());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return setError("Please enter your website address, e.g. yourbusiness.com.au");
    if (!allowed) return setError("Please confirm you're allowed to have this website analysed.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/scans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: url.trim(), authorized: true }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      router.push(`/studio/website/run/${data.scanId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-10 rounded-2xl border border-line bg-paper p-2 shadow-[0_18px_50px_-30px_rgba(18,26,31,.35)]" noValidate>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="site-url">Your website address</label>
        <input id="site-url" type="text" inputMode="url" autoComplete="url" placeholder="yourbusiness.com.au" value={url} onChange={(e) => { setUrl(e.target.value); setError(null); }}
          className="h-12 flex-1 rounded-xl px-4 text-[17px] outline-none placeholder:text-ink-mute" aria-invalid={!!error} aria-describedby="scan-help" />
        <button type="submit" disabled={busy}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-go px-6 text-[15px] font-medium text-white transition-colors hover:bg-go-ink disabled:opacity-60">
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Analyse website {!busy && <ArrowRight className="size-4" aria-hidden />}
        </button>
      </div>
      <label className="flex items-start gap-2.5 px-3 pt-2 pb-2 text-[13px] text-ink-soft">
        <input type="checkbox" checked={allowed} onChange={(e) => { setAllowed(e.target.checked); setError(null); }} className="mt-0.5 size-4 accent-[var(--color-go)]" />
        This is my business&apos;s website and I&apos;m allowed to have it analysed.
      </label>
      <p id="scan-help" className={`px-3 pb-2 text-[12px] ${error ? "text-rose" : "text-ink-mute"}`} role={error ? "alert" : undefined}>
        {error ?? "We read public pages only — no logins, no forms submitted. Takes about 3 minutes."}
      </p>
    </form>
  );
}
