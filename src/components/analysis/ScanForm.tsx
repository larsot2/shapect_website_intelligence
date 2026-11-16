"use client";

import { useState } from "react";

/**
 * URL entry. S1: input + permission check are real, starting a live scan is
 * not wired yet (S2/S4) — the button says so instead of pretending.
 */
export function ScanForm() {
  const [url, setUrl] = useState("");
  const [allowed, setAllowed] = useState(false);
  const valid = /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(url.trim());
  return (
    <form className="mt-10 rounded-2xl border border-line bg-paper p-2 shadow-[0_18px_50px_-30px_rgba(18,26,31,.35)]" onSubmit={(e) => e.preventDefault()}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="site-url">Your website address</label>
        <input id="site-url" type="text" inputMode="url" autoComplete="url" placeholder="yourbusiness.com.au" value={url} onChange={(e) => setUrl(e.target.value)}
          className="h-12 flex-1 rounded-xl px-4 text-[17px] outline-none placeholder:text-ink-mute" />
        <button type="submit" disabled title="Live scans arrive in the next build step"
          className="h-12 rounded-xl bg-go px-6 text-[15px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">
          Analyse website
        </button>
      </div>
      <label className="flex items-start gap-2.5 px-3 pt-2 pb-2 text-[13px] text-ink-soft">
        <input type="checkbox" checked={allowed} onChange={(e) => setAllowed(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-go)]" />
        This is my business&apos;s website and I&apos;m allowed to have it analysed.
      </label>
      <p className="px-3 pb-2 text-[12px] text-amber" role="note">
        {valid && allowed ? "Ready — " : ""}Live scanning isn&apos;t switched on in this build yet. Open the demo analysis below to try the results.
      </p>
    </form>
  );
}
