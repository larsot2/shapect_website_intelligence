"use client";

import { useState } from "react";
import { Accessibility, Archive, ClipboardList, KeyRound, LayoutGrid, Maximize2, ShowerHead, Users } from "lucide-react";
import { COMPANY, PHOTO } from "@/lib/demo/passion";
import { useDemo } from "@/lib/demo/state";
import { ChoiceCard, Chips, Footer, Handoff, StageTitle, Steps, toggle } from "../kit";
import type { EntryProps } from "./types";

const USES = [
  { v: "Rental property", icon: <KeyRound className="size-5" />, desc: "Tenants live here day to day" },
  { v: "Family or guests", icon: <Users className="size-5" />, desc: "Parents, teenagers or visitors" },
  { v: "Everyday accessibility needs", icon: <Accessibility className="size-5" />, desc: "Easier to use, every day" },
];
const CHALLENGES = [
  { v: "Not enough room", icon: <Maximize2 className="size-5" /> },
  { v: "Poor shower arrangement", icon: <ShowerHead className="size-5" /> },
  { v: "Limited storage", icon: <Archive className="size-5" /> },
  { v: "Awkward layout", icon: <LayoutGrid className="size-5" /> },
];
const IDEAS: Record<string, { title: string; opts: string[] }> = {
  "Not enough room": { title: "Making the most of the space", opts: ["Wall-hung vanity to free up floor", "Compact or corner basin", "Frameless glass instead of a framed screen", "Sliding or cavity door"] },
  "Poor shower arrangement": { title: "Fixing the shower", opts: ["Step-free (hobless) shower", "Swap the bath for a bigger shower", "Recessed shower niche", "Better ventilation"] },
  "Limited storage": { title: "Finding storage", opts: ["Vanity with deep drawers", "Mirror cabinet", "Recessed niche instead of shelves", "Shelving above the toilet"] },
  "Awkward layout": { title: "Rethinking the layout", opts: ["Keep the plumbing where it is", "Move the toilet or shower for better flow", "Combine with laundry space (note for the site visit)"] },
  "Rental property": { title: "Built for tenants", opts: ["Hard-wearing, easy-clean finishes", "Simple, easy-to-replace fixtures", "A neutral look most tenants like"] },
  "Family or guests": { title: "Comfortable for family and guests", opts: ["Warm, welcoming feel", "Space for a guest's things", "Simple for visitors to use"] },
  "Everyday accessibility needs": { title: "Easier everyday use", opts: ["Step-free shower entry", "Room to move and turn", "Provision for grab rails", "A place to sit in the shower", "Lever-style taps"] },
};
const QUESTIONS: Record<string, string> = {
  "Not enough room": "Which fixtures can realistically fit, and where?",
  "Poor shower arrangement": "Can the shower be step-free with the existing floor and drainage?",
  "Limited storage": "Where could storage be recessed into the walls?",
  "Awkward layout": "Is moving the toilet or shower worth it? Passion Built's published figures show drainage moves cost more.",
  "Rental property": "Which finishes hold up best between tenants?",
  "Family or guests": "What would make the room feel welcoming without adding complexity?",
  "Everyday accessibility needs": "What would make the bathroom easier to use day to day — and what does the space allow?",
  "Combine with laundry space (note for the site visit)": "Could laundry space be combined here, and what would it involve?",
};

export function GrannyFlatPlanner({ onBridge, accent }: EntryProps) {
  const { commit } = useDemo();
  const [stage, setStage] = useState(-1);
  const [use, setUse] = useState<string>();
  const [challenges, setChallenges] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [contact, setContact] = useState(false);

  const sections = [...challenges, ...(use ? [use] : [])].map((k) => ({ key: k, ...IDEAS[k] })).filter((s) => s.title);
  const questions = [...challenges, ...(use ? [use] : []), ...picked].map((k) => QUESTIONS[k]).filter(Boolean);
  const keepPlumbing = picked.includes("Keep the plumbing where it is");
  const direction = use ? `A space-smart granny flat bathroom for ${use === "Rental property" ? "tenants" : use === "Family or guests" ? "family and guests" : "easier everyday use"}${challenges.length ? ` — focused on ${challenges.map((c) => ({ "Not enough room": "making more of the space", "Poor shower arrangement": "a better shower", "Limited storage": "more storage", "Awkward layout": "a better layout" })[c]).join(" and ")}` : ""}${keepPlumbing ? ", keeping the plumbing where it is" : ""}.` : "";
  const planText = `My granny flat bathroom plan (Passion Built)\nFor: ${use}\nChallenges: ${challenges.join(", ")}\nPriorities: ${picked.join(", ")}\nDirection: ${direction}\nQuestions for the site inspection:\n${questions.map((q) => `- ${q}`).join("\n")}\n(Planning ideas, not a technical assessment.)`;

  const finish = () => {
    commit("granny", { project: { propertyType: "granny_flat" }, grannyFlat: { intendedUse: use, challenges, priorities: picked, questions } });
    setStage(3);
  };

  if (stage === -1) {
    return (
      <div className="animate-fade overflow-hidden rounded-3xl border border-line sm:grid sm:grid-cols-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={PHOTO("granny")} alt="" className="h-48 w-full object-cover sm:h-full" />
        <div className="p-6 sm:p-8">
          <p className="text-[12px] font-semibold tracking-wide uppercase" style={{ color: accent }}>Granny Flat Planner</p>
          <h3 className="mt-2 text-[26px] leading-tight font-semibold tracking-tight">Small space. Big possibilities.</h3>
          <p className="mt-3 text-[15px] text-ink-soft">A granny flat bathroom has to work hard — for tenants, for family, or for someone who needs things easier. Let&apos;s plan around the people who&apos;ll use it.</p>
          <ul className="mt-4 space-y-1.5 text-[14px] text-ink-soft">
            <li>· About two minutes</li><li>· Ends with questions to raise at your site inspection</li>
          </ul>
          <button type="button" onClick={() => setStage(0)} className="mt-6 inline-flex h-11 items-center rounded-xl px-5 text-[15px] font-semibold text-white" style={{ background: accent }}>Yes, let&apos;s plan my granny flat bathroom</button>
          <p className="mt-3 text-[12px] text-ink-mute">Photo: a Passion Built granny flat bathroom.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Steps labels={["Who it's for", "The challenge", "Priorities", "Your plan"]} current={stage} accent={accent} />
      <div className="mt-6 animate-fade" key={stage}>
        {stage === 0 && (
          <>
            <StageTitle eyebrow="Start with people, not tiles" title="Who will use this bathroom most?" />
            <div className="grid gap-3 sm:grid-cols-3">
              {USES.map((u) => <ChoiceCard key={u.v} accent={accent} selected={use === u.v} onClick={() => setUse(u.v)} icon={u.icon} title={u.v} desc={u.desc} />)}
            </div>
            {use === "Everyday accessibility needs" && <p className="mt-3 text-[13px] text-ink-soft">We&apos;ll ask about practical preferences only — no assumptions about anyone&apos;s age or health.</p>}
            <Footer accent={accent} onBack={() => setStage(-1)} nextDisabled={!use} onNext={() => setStage(1)} />
          </>
        )}
        {stage === 1 && (
          <>
            <StageTitle eyebrow="Choose up to two" title="What's the biggest problem with the space?" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {CHALLENGES.map((c) => <ChoiceCard key={c.v} compact accent={accent} selected={challenges.includes(c.v)} onClick={() => setChallenges((x) => toggle(x, c.v, 2))} icon={c.icon} title={c.v} />)}
            </div>
            <Footer accent={accent} onBack={() => setStage(0)} nextDisabled={!challenges.length} onNext={() => setStage(2)} />
          </>
        )}
        {stage === 2 && (
          <>
            <StageTitle eyebrow="Tailored to your answers" title="Which of these would you like to explore?" sub="Ideas to discuss at the site inspection — not promises about what's technically possible." />
            <div className="space-y-5">
              {sections.map((s) => (
                <div key={s.key} className="rounded-2xl border border-line p-4">
                  <p className="mb-3 flex items-center gap-2 text-[15px] font-semibold"><span className="size-2 rounded-full" style={{ background: accent }} />{s.title}<span className="text-[12px] font-normal text-ink-mute">because you chose “{s.key}”</span></p>
                  <Chips accent={accent} options={s.opts} values={picked} onToggle={(v) => setPicked((x) => toggle(x, v))} />
                </div>
              ))}
            </div>
            <Footer accent={accent} onBack={() => setStage(1)} nextDisabled={!picked.length} onNext={finish} nextLabel="Create my plan" />
          </>
        )}
        {stage === 3 && (
          <>
            <div className="overflow-hidden rounded-3xl border border-line bg-paper">
              <div className="flex items-start justify-between gap-4 p-6 sm:p-7" style={{ background: "#fdf6ec" }}>
                <div>
                  <p className="text-[12px] font-semibold tracking-wide uppercase" style={{ color: accent }}>Your granny flat plan</p>
                  <h3 className="mt-1 text-[24px] leading-tight font-semibold tracking-tight sm:text-[28px]">{direction}</h3>
                </div>
                <ClipboardList className="hidden size-10 shrink-0 sm:block" style={{ color: accent }} aria-hidden />
              </div>
              <div className="grid gap-px bg-line sm:grid-cols-3">
                <div className="bg-paper p-5"><p className="text-[12px] font-semibold text-ink-mute uppercase">Intended use</p><p className="mt-1.5 text-[15px] font-medium">{use}</p></div>
                <div className="bg-paper p-5"><p className="text-[12px] font-semibold text-ink-mute uppercase">Main challenges</p><p className="mt-1.5 text-[15px] font-medium">{challenges.join(" · ")}</p></div>
                <div className="bg-paper p-5"><p className="text-[12px] font-semibold text-ink-mute uppercase">Priority features</p><ul className="mt-1.5 space-y-1 text-[14px]">{picked.map((p) => <li key={p}>{p}</li>)}</ul></div>
              </div>
              <div className="p-5 sm:p-6">
                <p className="text-[14px] font-semibold">Questions to clarify at the site inspection</p>
                <ol className="mt-2 space-y-2">{questions.map((q, i) => <li key={q} className="flex gap-3 text-[14px]"><span className="grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-bold text-white" style={{ background: accent }}>{i + 1}</span>{q}</li>)}</ol>
                <p className="mt-4 text-[12px] text-ink-mute">Planning ideas only — Passion Built confirms what&apos;s technically and structurally possible on site.</p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <button type="button" onClick={() => onBridge("readiness")} className="rounded-2xl p-4 text-left text-white" style={{ background: accent }}><span className="block font-semibold">Continue to Project Readiness</span><span className="mt-1 block text-[13px] text-white/80">Your plan comes with you.</span></button>
              <button type="button" onClick={() => onBridge("design")} className="rounded-2xl border border-line bg-paper p-4 text-left"><span className="block font-semibold">Explore the look too</span><span className="mt-1 block text-[13px] text-ink-soft">Optional — find a style you like.</span></button>
              <button type="button" onClick={() => setContact(true)} className="rounded-2xl border border-line bg-paper p-4 text-left"><span className="block font-semibold">Contact Passion Built</span><span className="mt-1 block text-[13px] text-ink-soft">Share your plan directly.</span></button>
            </div>
            {contact && <div className="mt-4"><Handoff title="Contact Passion Built with your granny flat plan" url={COMPANY.contactUrl} text={planText} fileName="granny-flat-bathroom-plan.txt" accent={accent} /></div>}
            <Footer accent={accent} onBack={() => setStage(2)} />
          </>
        )}
      </div>
    </div>
  );
}
