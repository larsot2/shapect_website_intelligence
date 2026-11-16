"use client";

import { useState } from "react";
import { FlaskConical } from "lucide-react";

export function FixtureBanner({ note }: { note?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-amber/20 bg-amber-soft text-[13px] text-amber">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:px-6">
        <FlaskConical className="size-4 shrink-0" aria-hidden />
        <span className="font-semibold">Demo fixture</span>
        <span className="text-amber/90">Fictional business. Nothing was scanned, nothing on any website is changed.</span>
        {note && (
          <button type="button" onClick={() => setOpen((o) => !o)} className="ml-auto underline underline-offset-2" aria-expanded={open}>
            {open ? "Hide details" : "What's real?"}
          </button>
        )}
        {open && note && <p className="w-full pb-1 text-amber/90">{note}</p>}
      </div>
    </div>
  );
}
