"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "quiet-danger";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-go text-white hover:bg-go-ink shadow-sm",
  secondary: "bg-paper text-ink border border-line hover:border-ink-mute",
  ghost: "text-ink-soft hover:text-ink hover:bg-canvas",
  "quiet-danger": "text-ink-soft hover:text-rose hover:bg-rose-soft",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm"
      } ${variants[variant]} ${className}`}
    />
  );
}

const tones = {
  neutral: "bg-canvas text-ink-soft",
  go: "bg-go-soft text-go-ink",
  amber: "bg-amber-soft text-amber",
  sky: "bg-sky-soft text-sky",
  rose: "bg-rose-soft text-rose",
  dark: "bg-ink text-white",
} as const;

export function Chip({ tone = "neutral", children, className = "" }: { tone?: keyof typeof tones; children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-medium ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function SectionHeading({ id, eyebrow, title, children }: { id?: string; eyebrow?: string; title: string; children?: React.ReactNode }) {
  return (
    <div id={id} className="mb-6 flex scroll-mt-24 flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-1 text-[13px] font-medium text-ink-mute">{eyebrow}</p>}
        <h2 className="text-[26px] font-semibold tracking-tight">{title}</h2>
      </div>
      {children}
    </div>
  );
}

/** Right-hand sheet; Esc and backdrop close it, focus moves in and returns on close. */
export function Drawer({ open, onClose, title, subtitle, children, footer }: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="animate-fade absolute inset-0 bg-ink/30" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="animate-drawer absolute inset-y-0 right-0 flex w-full max-w-[520px] flex-col bg-paper shadow-2xl outline-none"
      >
        <div className="flex items-start gap-4 border-b border-line px-6 py-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            {subtitle && <div className="mt-1 text-sm text-ink-soft">{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-ink-mute hover:bg-canvas hover:text-ink">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="border-t border-line bg-canvas/60 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}
