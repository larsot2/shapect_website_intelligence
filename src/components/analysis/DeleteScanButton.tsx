"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";

/** Deletes a scan snapshot and its screenshots (review decisions for it become unreachable). */
export function DeleteScanButton({ scanId }: { scanId: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!confirm) {
    return (
      <button type="button" onClick={() => setConfirm(true)} className="inline-flex items-center gap-1.5 text-[12px] text-ink-mute hover:text-rose">
        <Trash2 className="size-3.5" aria-hidden /> Delete this analysis
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-[12px]">
      <span className="text-ink-soft">Delete analysis and screenshots?</span>
      <button type="button" disabled={busy} className="font-medium text-rose hover:underline"
        onClick={async () => {
          setBusy(true);
          const res = await fetch(`/api/scans/${scanId}`, { method: "DELETE" });
          if (res.ok) router.push("/studio/website");
          else setBusy(false);
        }}>Delete</button>
      <button type="button" className="text-ink-mute hover:text-ink" onClick={() => setConfirm(false)}>Cancel</button>
    </span>
  );
}
