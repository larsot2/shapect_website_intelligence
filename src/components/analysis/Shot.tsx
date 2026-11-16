"use client";

import Image from "next/image";
import { ImageOff } from "lucide-react";
import { useAnalysis } from "./AnalysisContext";
import type { Viewport } from "@/lib/blueprint/schema";

/** Cropped top of a real page screenshot, or an honest placeholder. */
export function Shot({ pageId, vp = "desktop", className = "", sizes = "320px", priority = false }: {
  pageId: string;
  vp?: Viewport;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const { screenshot, page } = useAnalysis();
  const shot = screenshot(pageId, vp);
  const p = page(pageId);
  if (!shot) {
    return (
      <div className={`grid place-items-center bg-canvas text-ink-mute ${className}`}>
        <div className="flex flex-col items-center gap-1 text-[12px]">
          <ImageOff className="size-4" aria-hidden />
          <span>No screenshot</span>
        </div>
      </div>
    );
  }
  return (
    <div className={`relative overflow-hidden bg-canvas ${className}`}>
      <Image src={shot.src} alt={`Screenshot of ${p?.title ?? pageId}`} fill sizes={sizes} priority={priority} unoptimized={shot.src.startsWith("/api/")} className="object-cover object-top" />
    </div>
  );
}
