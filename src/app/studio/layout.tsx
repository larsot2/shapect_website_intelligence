import Link from "next/link";

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-6 px-4 sm:px-6">
          <Link href="/studio/website" className="flex items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-ink text-[13px] text-white">S</span>
            Shapect <span className="font-normal text-ink-mute">Studio</span>
          </Link>
          <nav aria-label="Studio" className="flex items-center gap-1 text-sm">
            <Link href="/studio/website" className="rounded-md bg-canvas px-3 py-1.5 font-medium text-ink">Website</Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
