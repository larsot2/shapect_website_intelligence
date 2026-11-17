"use client";

import { useState } from "react";
import { Archive, BookOpen, Columns2, Gem, Heart, Lamp, Layers, PanelTop, Sparkles, Sun, Wrench, Droplets } from "lucide-react";
import { COMPANY, PHOTO } from "@/lib/demo/passion";
import { useDemo } from "@/lib/demo/state";
import { ChoiceCard, Footer, Handoff, StageTitle, Steps } from "../kit";
import type { EntryProps } from "./types";

const STYLES = [
  { id: "Warm & Natural", desc: "Timber, soft neutrals, natural texture", cover: "warm-1", mood: ["warm-1", "warm-2", "warm-3"], line: "warm and natural" },
  { id: "Modern & Minimal", desc: "Clean lines, a light palette, nothing extra", cover: "minimal-3", mood: ["minimal-3", "minimal-1", "minimal-2"], line: "clean, modern and minimal" },
  { id: "Refined Luxury", desc: "Statement vanity, stone looks, black tapware", cover: "luxury-1", mood: ["luxury-1", "luxury-2", "luxury-3"], line: "refined and quietly luxurious" },
  { id: "Bold & Expressive", desc: "Colour, pattern and brushed brass", cover: "tile-terrazzo", mood: ["tile-terrazzo", "bold-2", "bold-3"], line: "bold and expressive" },
];

type Opt = { v: string; img?: string; icon?: React.ReactNode; swatch?: string; desc?: string };
const GROUPS: { key: string; title: string; sub: string; multi?: number; opts: Opt[] }[] = [
  { key: "Shower", title: "Shower or shower-and-bath?", sub: "The biggest decision for how the room works.", opts: [{ v: "Walk-in shower", img: "walkin", desc: "Open, easy to clean" }, { v: "Shower plus bath", img: "showerbath", desc: "Room for a soak" }] },
  { key: "Vanity", title: "Which vanity feels like you?", sub: "It sets the tone of the whole room.", opts: [{ v: "Wall-hung, floating", img: "vanity-wallhung" }, { v: "Timber with storage", img: "vanity-timber" }, { v: "Curved & fluted", img: "vanity-curved" }, { v: "Double basin", img: "vanity-double" }] },
  { key: "Tiles", title: "Pick a tile direction.", sub: "Floors and feature walls.", opts: [{ v: "Marble look", img: "tile-marble" }, { v: "Patterned floor", img: "tile-pattern" }, { v: "Colour feature wall", img: "bold-3" }, { v: "Calm neutral", img: "minimal-2" }] },
  { key: "Lighting", title: "How should it feel at night?", sub: "Lighting changes everything.", opts: [{ v: "Soft & warm", swatch: "linear-gradient(135deg,#f7d9a8,#c98a4b)", icon: <Lamp className="size-5" /> }, { v: "Bright & clear", swatch: "linear-gradient(135deg,#ffffff,#cfe3f2)", icon: <Sun className="size-5" /> }, { v: "Backlit mirror feature", swatch: "linear-gradient(135deg,#2b2b33,#8d8fa8)", icon: <Sparkles className="size-5" /> }] },
  { key: "Storage", title: "Where should things live?", sub: "Choose up to two.", multi: 2, opts: [{ v: "Drawers in the vanity", icon: <Archive className="size-5" /> }, { v: "Mirror cabinet", icon: <PanelTop className="size-5" /> }, { v: "Tall linen cupboard", icon: <Columns2 className="size-5" /> }, { v: "Shower niche & open shelf", icon: <Layers className="size-5" /> }] },
];

const VANITY_PHRASE: Record<string, string> = { "Wall-hung, floating": "a floating wall-hung vanity", "Timber with storage": "a timber vanity with storage", "Curved & fluted": "a curved, fluted vanity", "Double basin": "a double-basin vanity" };

const PRIORITIES = [
  { v: "Easy maintenance", icon: <Droplets className="size-5" /> },
  { v: "More storage", icon: <Archive className="size-5" /> },
  { v: "Modern appearance", icon: <Sparkles className="size-5" /> },
  { v: "Relaxation & comfort", icon: <Heart className="size-5" /> },
  { v: "Practicality", icon: <Wrench className="size-5" /> },
  { v: "Premium finishes", icon: <Gem className="size-5" /> },
];

export function DesignExplorer({ onBridge, accent }: EntryProps) {
  const { commit } = useDemo();
  const [stage, setStage] = useState(0);
  const [style, setStyle] = useState<string>();
  const [g, setG] = useState(0);
  const [features, setFeatures] = useState<Record<string, string[]>>({});
  const [prio, setPrio] = useState<string[]>([]);
  const [contact, setContact] = useState(false);

  const S = STYLES.find((x) => x.id === style);
  const group = GROUPS[g];
  const pick = (key: string, v: string, multi?: number) => {
    setFeatures((f) => {
      const cur = f[key] ?? [];
      const next = multi ? (cur.includes(v) ? cur.filter((x) => x !== v) : cur.length >= multi ? cur : [...cur, v]) : [v];
      return { ...f, [key]: next };
    });
    if (!multi) setTimeout(() => setG((x) => (x === g ? Math.min(x + 1, GROUPS.length - 1) : x)), 260);
  };
  const featureList = GROUPS.filter((x) => features[x.key]?.length).map((x) => ({ label: x.key, value: features[x.key].join(", ") }));
  const featureImgs = GROUPS.flatMap((x) => (features[x.key] ?? []).map((v) => x.opts.find((o) => o.v === v)?.img).filter(Boolean)) as string[];
  const allPicked = GROUPS.every((x) => features[x.key]?.length);

  const summary = S ? `A ${S.line} bathroom${features.Shower ? ` with a ${features.Shower[0].toLowerCase()}` : ""}${features.Vanity ? ` and ${VANITY_PHRASE[features.Vanity[0]] ?? "a new vanity"}` : ""}${prio.length ? ` — designed first for ${prio.slice(0, 2).join(" and ").toLowerCase()}` : ""}.` : "";
  const briefText = `My Design Direction (Passion Built · Design Explorer)\nStyle: ${style}\n${featureList.map((f) => `${f.label}: ${f.value}`).join("\n")}\nPriorities: ${prio.map((p, i) => `${i + 1}. ${p}`).join(", ")}\n${summary}\n(Preferences only — not product selections.)`;

  const finish = () => {
    commit("design", { design: { style, features: featureList, priorities: prio } });
    setStage(3);
  };

  return (
    <div>
      <Steps labels={["Atmosphere", "Features", "Priorities", "Your design direction"]} current={stage} accent={accent} />
      <div className="mt-6 animate-fade" key={`${stage}-${stage === 1 ? g : ""}`}>
        {stage === 0 && (
          <>
            <StageTitle eyebrow="Real Passion Built bathrooms" title="Which atmosphere draws you in?" sub="Go with your gut — you can refine everything afterwards." />
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {STYLES.map((s) => (
                <button key={s.id} type="button" onClick={() => setStyle(s.id)} aria-pressed={style === s.id}
                  className={`group relative aspect-[4/5] overflow-hidden rounded-3xl text-left transition-all duration-300 sm:aspect-[5/4] ${style && style !== s.id ? "opacity-60 saturate-50" : ""}`}
                  style={style === s.id ? { boxShadow: `0 0 0 3px ${accent}, 0 20px 40px -22px ${accent}` } : undefined}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={PHOTO(s.cover)} alt="" className={`absolute inset-0 h-full w-full object-cover transition-transform duration-700 ${style === s.id ? "scale-105" : "group-hover:scale-105"}`} />
                  <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                  <span className="absolute inset-x-0 bottom-0 p-4 text-white sm:p-5">
                    <span className="block text-[18px] font-semibold sm:text-[22px]">{s.id}</span>
                    <span className="mt-0.5 hidden text-[13px] text-white/80 sm:block">{s.desc}</span>
                  </span>
                  {style === s.id && <span className="absolute top-3 right-3 rounded-full bg-white px-2.5 py-1 text-[12px] font-semibold" style={{ color: accent }}>Selected</span>}
                </button>
              ))}
            </div>
            <Footer accent={accent} nextDisabled={!style} onNext={() => setStage(1)} hint={style ? `${style}` : undefined} />
          </>
        )}

        {stage === 1 && group && (
          <>
            <div className="mb-4 flex items-center gap-1.5">
              {GROUPS.map((x, i) => (
                <button key={x.key} type="button" onClick={() => setG(i)} className={`rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors ${i === g ? "text-white" : features[x.key]?.length ? "bg-go-soft text-go-ink" : "bg-canvas text-ink-mute"}`} style={i === g ? { background: accent } : undefined}>
                  {x.key}
                </button>
              ))}
            </div>
            <StageTitle title={group.title} sub={group.sub} />
            <div className={`grid gap-3 ${group.opts.length === 2 ? "grid-cols-2" : group.opts.length === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4"}`}>
              {group.opts.map((o) => {
                const sel = (features[group.key] ?? []).includes(o.v);
                if (o.swatch) {
                  return (
                    <button key={o.v} type="button" onClick={() => pick(group.key, o.v)} aria-pressed={sel} className="overflow-hidden rounded-2xl border border-line bg-paper text-left transition-all hover:-translate-y-0.5" style={sel ? { boxShadow: `0 0 0 2px ${accent}` } : undefined}>
                      <span className="grid aspect-[4/3] place-items-center" style={{ background: o.swatch }}><span className="grid size-11 place-items-center rounded-full bg-white/80 text-ink">{o.icon}</span></span>
                      <span className="block p-3 text-[14px] font-semibold">{o.v}</span>
                    </button>
                  );
                }
                return <ChoiceCard key={o.v} compact accent={accent} selected={sel} onClick={() => pick(group.key, o.v, group.multi)} image={o.img ? PHOTO(o.img) : undefined} icon={o.img ? undefined : o.icon} title={o.v} desc={o.desc} />;
              })}
            </div>
            <Footer accent={accent}
              onBack={() => (g > 0 ? setG(g - 1) : setStage(0))}
              onNext={() => (g < GROUPS.length - 1 ? setG(g + 1) : setStage(2))}
              nextDisabled={!features[group.key]?.length}
              nextLabel={g < GROUPS.length - 1 ? "Next" : "Continue"}
              hint={!allPicked && g === GROUPS.length - 1 ? "Tap the chips above to revisit" : undefined} />
          </>
        )}

        {stage === 2 && (
          <>
            <StageTitle eyebrow="What matters most" title="Tap your top three, in order." sub="This helps Passion Built understand the trade-offs you'd make." />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {PRIORITIES.map((p) => {
                const rank = prio.indexOf(p.v);
                return (
                  <button key={p.v} type="button" onClick={() => setPrio((x) => (x.includes(p.v) ? x.filter((y) => y !== p.v) : x.length >= 3 ? x : [...x, p.v]))}
                    className={`relative flex items-center gap-3 rounded-2xl border p-4 text-left transition-all ${rank >= 0 ? "border-transparent" : "border-line bg-paper hover:border-ink-mute"} ${rank < 0 && prio.length >= 3 ? "opacity-45" : ""}`}
                    style={rank >= 0 ? { boxShadow: `0 0 0 2px ${accent}`, background: "#fff" } : undefined}>
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: rank >= 0 ? accent : "#f6f5f1", color: rank >= 0 ? "#fff" : accent }}>{rank >= 0 ? <span className="text-[17px] font-bold">{rank + 1}</span> : p.icon}</span>
                    <span className="text-[15px] font-medium">{p.v}</span>
                  </button>
                );
              })}
            </div>
            <Footer accent={accent} onBack={() => { setStage(1); setG(GROUPS.length - 1); }} nextDisabled={prio.length === 0} onNext={finish} nextLabel="Create my design direction" />
          </>
        )}

        {stage === 3 && S && (
          <>
            <div className="overflow-hidden rounded-3xl border border-line">
              <div className="grid grid-cols-4 grid-rows-2 gap-1 bg-paper" style={{ height: 300 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={PHOTO(S.mood[0])} alt="" className="col-span-2 row-span-2 h-full w-full object-cover" />
                {[S.mood[1], ...featureImgs, S.mood[2]].filter((x, i, a) => a.indexOf(x) === i).slice(0, 4).map((src) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={src} src={PHOTO(src)} alt="" className="h-full w-full object-cover" />
                ))}
              </div>
              <div className="p-5 sm:p-7">
                <p className="text-[12px] font-semibold tracking-wide uppercase" style={{ color: accent }}>Your design direction</p>
                <h3 className="mt-1 text-[28px] font-semibold tracking-tight">{S.id}</h3>
                <p className="mt-2 max-w-[600px] text-[16px] leading-relaxed text-ink-soft">{summary}</p>
                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-[13px] font-semibold text-ink-mute">Preferred features</p>
                    <dl className="space-y-1.5 text-[14px]">{featureList.map((f) => <div key={f.label} className="flex gap-2"><dt className="w-20 shrink-0 text-ink-mute">{f.label}</dt><dd className="font-medium">{f.value}</dd></div>)}</dl>
                  </div>
                  <div>
                    <p className="mb-2 text-[13px] font-semibold text-ink-mute">Priorities</p>
                    <ol className="space-y-1.5 text-[14px]">{prio.map((p, i) => <li key={p} className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full text-[12px] font-bold text-white" style={{ background: accent }}>{i + 1}</span>{p}</li>)}</ol>
                  </div>
                </div>
                <p className="mt-5 flex items-center gap-1.5 text-[12px] text-ink-mute"><BookOpen className="size-3.5" aria-hidden />Preferences, not product selections. Photos: Passion Built projects.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => onBridge("readiness")} className="rounded-2xl p-5 text-left text-white transition-transform hover:-translate-y-0.5" style={{ background: accent }}>
                <span className="block text-[16px] font-semibold">Continue to Project Readiness</span>
                <span className="mt-1 block text-[13px] text-white/80">Your style, features and priorities come with you.</span>
              </button>
              <button type="button" onClick={() => setContact(true)} className="rounded-2xl border border-line bg-paper p-5 text-left transition-transform hover:-translate-y-0.5">
                <span className="block text-[16px] font-semibold">I&apos;m ready — contact Passion Built</span>
                <span className="mt-1 block text-[13px] text-ink-soft">Take your design direction straight to the builder.</span>
              </button>
            </div>
            {contact && <div className="mt-4"><Handoff title="Contact Passion Built with your design direction" url={COMPANY.contactUrl} text={briefText} fileName="my-design-direction.txt" accent={accent} /></div>}
            <Footer accent={accent} onBack={() => setStage(2)} />
          </>
        )}
      </div>
    </div>
  );
}
