"use client";

import Link from "next/link";
import { Eye, Quote } from "lucide-react";
import type { Evidence } from "@/lib/blueprint/schema";
import { useAnalysis } from "./AnalysisContext";

/** Sources behind a statement: page, quote, and a jump into the screenshot preview. */
export function EvidenceList({ items }: { items: Evidence[] }) {
  const { page, screenshot, base } = useAnalysis();
  if (!items.length) {
    return <p className="text-sm text-ink-mute">No direct quote — this is a suggestion based on the pages above.</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((e, i) => {
        const p = page(e.pageId);
        return (
          <li key={i} className="rounded-xl border border-line bg-paper p-3.5">
            {e.quote && (
              <p className="flex gap-2 text-[14px] leading-relaxed text-ink">
                <Quote className="mt-1 size-3.5 shrink-0 text-ink-mute" aria-hidden />
                <span>{e.quote}</span>
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-mute">
              <span className="font-medium text-ink-soft">{p?.title ?? e.pageId}</span>
              <span>{p?.path}</span>
              <span>{e.kind === "dom" ? "Page element" : e.kind === "text" ? "Page text" : e.kind}</span>
              {screenshot(e.pageId) && (
                <Link href={`${base}/preview?page=${e.pageId}`} className="ml-auto inline-flex items-center gap-1 font-medium text-go hover:underline">
                  <Eye className="size-3.5" aria-hidden /> Show page
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
