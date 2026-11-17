"use client";

import dynamic from "next/dynamic";

/** The demo is purely client-side (local state, no backend), so it renders in the browser only. */
export const ClientDemo = dynamic(() => import("./DemoApp").then((m) => m.DemoApp), {
  ssr: false,
  loading: () => <div className="grid min-h-screen place-items-center text-[14px] text-ink-mute">Loading the Passion Built demo…</div>,
});
