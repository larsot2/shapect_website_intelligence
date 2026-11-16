"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";

/** Starts a fresh scan; the old snapshot and its review decisions stay untouched. */
export function RescanButton({ url }: { url: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await fetch("/api/scans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, authorized: true }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            router.push(`/studio/website/run/${data.scanId}`);
          } catch (e) {
            setError((e as Error).message || "Couldn't start a new scan.");
            setBusy(false);
          }
        }}
        className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-ink-soft hover:bg-paper hover:text-ink disabled:opacity-50"
      >
        <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} aria-hidden /> Scan again
      </button>
      {error && <p className="w-full text-[13px] text-rose" role="alert">{error}</p>}
    </>
  );
}
