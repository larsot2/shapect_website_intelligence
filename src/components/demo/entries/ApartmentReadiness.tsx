"use client";

import { useState } from "react";
import { Building2, CheckCircle2, CircleHelp, MessagesSquare, Quote } from "lucide-react";
import { APARTMENT_SOURCE, COMPANY, PHOTO } from "@/lib/demo/passion";
import { useDemo, type Tri } from "@/lib/demo/state";
import { Chips, Footer, Handoff, Segmented, StageTitle, Steps, toggle } from "../kit";
import type { EntryProps } from "./types";

const TRI = [{ value: "yes" as const, label: "Yes" }, { value: "no" as const, label: "No" }, { value: "unsure" as const, label: "Not sure" }];
const ACCESS = ["Lift access", "Stairs only", "Tight parking or loading", "Strict working hours", "None that I know of"];
const DOCS = ["Copy of the by-laws", "Strata manager's contact details", "Floor plans", "Strata approval for these works", "Nothing yet"];

export function ApartmentReadiness({ onBridge, accent }: EntryProps) {
  const { commit } = useDemo();
  const [stage, setStage] = useState(-1);
  const [strata, setStrata] = useState<Tri>();
  const [bylaws, setBylaws] = useState<Tri>();
  const [layout, setLayout] = useState<Tri>();
  const [access, setAccess] = useState<string[]>([]);
  const [docs, setDocs] = useState<string[]>([]);
  const [contact, setContact] = useState(false);

  const realAccess = access.filter((a) => a !== "None that I know of");
  const realDocs = docs.filter((d) => d !== "Nothing yet");
  const approval = docs.includes("Strata approval for these works") ? "self_reported" : "not_confirmed";

  const known: string[] = [];
  const clarify: string[] = [];
  const discuss: { text: string; quote?: string }[] = [];
  if (strata === "yes") known.push("The apartment is strata-managed.");
  if (strata === "no") known.push("You've told us it isn't strata-managed.");
  if (strata === "unsure") clarify.push("Whether the building is strata-managed.");
  if (bylaws === "yes") known.push("You've reviewed the building's by-laws — that's helpful, but it isn't approval.");
  if ((bylaws === "no" || bylaws === "unsure") && strata !== "no") clarify.push("What the by-laws say about renovations, noise and working hours.");
  if (layout === "yes") known.push("You're considering moving plumbing or changing the layout.");
  if (layout === "no") known.push("You plan to keep the existing layout.");
  if (layout === "unsure") clarify.push("Whether you'll move plumbing — it affects approvals, time and cost.");
  if (realAccess.length) known.push(`Building access: ${realAccess.join(", ").toLowerCase()}.`);
  if (!access.length) clarify.push("Access for trades and materials — lift bookings, parking, loading.");
  if (realDocs.length) known.push(`On hand: ${realDocs.join(", ").toLowerCase()}.`);
  if (approval === "self_reported") known.push("You say strata approval is in place — Passion Built will check what it covers.");
  if (strata !== "no" && approval !== "self_reported") clarify.push("Whether your works need strata approval, and what the application needs.");
  if (!realDocs.length) clarify.push("The strata manager's contact details and a copy of the by-laws.");
  if (layout === "yes" || layout === "unsure") discuss.push({ text: "What can move without cutting into the slab or connecting to a common stack — and what that means for approval.", quote: APARTMENT_SOURCE.common });
  if (strata !== "no") discuss.push({ text: "How Passion Built prepares the strata application with you.", quote: `${APARTMENT_SOURCE.flagged} ${APARTMENT_SOURCE.help}` });
  discuss.push({ text: "Realistic timing — approval lead time before work starts on site.", quote: APARTMENT_SOURCE.timing });
  if (realAccess.includes("Strict working hours") || realAccess.length) discuss.push({ text: "Working hours and access rules in your building.", quote: APARTMENT_SOURCE.hours });

  const text = `My apartment renovation readiness (Passion Built)\nKnown:\n${known.map((k) => `- ${k}`).join("\n")}\nNeeds clarification:\n${clarify.map((k) => `- ${k}`).join("\n")}\nTo discuss:\n${discuss.map((k) => `- ${k.text}`).join("\n")}\n(Preparation only — not legal or regulatory advice.)`;

  const finish = () => {
    commit("apartment", { project: { propertyType: "apartment", layoutIntent: layout === "yes" ? "move" : layout === "no" ? "keep" : undefined }, apartment: { strataManaged: strata, bylawsReviewed: bylaws, layoutChange: layout, accessConstraints: access, documents: docs, approvalStatus: approval } });
    setStage(1);
  };

  if (stage === -1) {
    return (
      <div className="animate-fade grid gap-6 sm:grid-cols-[1fr_220px] sm:items-center">
        <div>
          <p className="flex items-center gap-2 text-[12px] font-semibold tracking-wide uppercase" style={{ color: accent }}><Building2 className="size-4" aria-hidden />Apartment Readiness</p>
          <h3 className="mt-2 text-[26px] leading-tight font-semibold tracking-tight">Planning an apartment bathroom renovation?</h3>
          <p className="mt-3 text-[15px] text-ink-soft">Apartments come with strata, shared plumbing and access rules. Answer five quick questions and get a clear overview of what&apos;s known, what to find out, and what to raise with Passion Built.</p>
          <button type="button" onClick={() => setStage(0)} className="mt-6 inline-flex h-11 items-center rounded-xl px-5 text-[15px] font-semibold text-white" style={{ background: accent }}>Yes — I&apos;m renovating an apartment</button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={PHOTO("apartment")} alt="" className="hidden h-56 w-full rounded-2xl object-cover sm:block" />
      </div>
    );
  }

  return (
    <div>
      <Steps labels={["Five quick questions", "Your readiness overview"]} current={stage} accent={accent} />
      <div className="mt-6 animate-fade" key={stage}>
        {stage === 0 && (
          <>
            <StageTitle title="Where are you up to?" sub="“Not sure” is a perfectly good answer — it just goes on the list to clarify." />
            <div className="divide-y divide-line rounded-2xl border border-line">
              {[
                { q: "Is the apartment strata-managed?", v: strata, set: setStrata },
                { q: "Have you looked at the building's by-laws?", v: bylaws, set: setBylaws },
                { q: "Are you thinking of moving plumbing or changing the layout?", v: layout, set: setLayout },
              ].map((row) => (
                <div key={row.q} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[15px] font-medium">{row.q}</p>
                  <Segmented label={row.q} accent={accent} value={row.v} onChange={row.set} options={TRI} />
                </div>
              ))}
              <div className="p-4">
                <p className="mb-2.5 text-[15px] font-medium">Any building access constraints?</p>
                <Chips accent={accent} options={ACCESS} values={access} onToggle={(v) => setAccess((x) => (v === "None that I know of" ? (x.includes(v) ? [] : [v]) : toggle(x.filter((y) => y !== "None that I know of"), v)))} />
              </div>
              <div className="p-4">
                <p className="mb-2.5 text-[15px] font-medium">What do you already have?</p>
                <Chips accent={accent} options={DOCS} values={docs} onToggle={(v) => setDocs((x) => (v === "Nothing yet" ? (x.includes(v) ? [] : [v]) : toggle(x.filter((y) => y !== "Nothing yet"), v)))} />
              </div>
            </div>
            <Footer accent={accent} onBack={() => setStage(-1)} nextDisabled={!strata || !bylaws || !layout} onNext={finish} nextLabel="See my readiness overview" />
          </>
        )}
        {stage === 1 && (
          <>
            <StageTitle eyebrow="Your readiness overview" title="Here's where your apartment project stands." sub="No scores and no verdicts — just a clear picture to take into your first conversation." />
            <div className="grid gap-3 lg:grid-cols-3 lg:items-start">
              <Column title="Known" icon={<CheckCircle2 className="size-5" />} tone="#1d7a4f" items={known.map((t) => ({ text: t }))} empty="Nothing confirmed yet." />
              <Column title="Needs clarification" icon={<CircleHelp className="size-5" />} tone="#a8660b" items={clarify.map((t) => ({ text: t }))} empty="Nothing open — nice." />
              <Column title="Discuss with Passion Built" icon={<MessagesSquare className="size-5" />} tone={accent} items={discuss} empty="" />
            </div>
            <p className="mt-3 text-[12px] text-ink-mute">Preparation only — not legal or regulatory advice. Quotes are from Passion Built&apos;s apartment page.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <button type="button" onClick={() => onBridge("readiness")} className="inline-flex h-11 items-center rounded-xl px-5 text-[15px] font-semibold text-white" style={{ background: accent }}>Continue to Project Readiness</button>
              <button type="button" onClick={() => setContact(true)} className="inline-flex h-11 items-center rounded-xl border border-line bg-paper px-4 text-[15px] font-medium hover:border-ink-mute">Contact Passion Built</button>
            </div>
            {contact && <div className="mt-4"><Handoff title="Contact Passion Built with your readiness overview" url={COMPANY.contactUrl} text={text} fileName="apartment-readiness.txt" accent={accent} /></div>}
            <Footer accent={accent} onBack={() => setStage(0)} />
          </>
        )}
      </div>
    </div>
  );
}

function Column({ title, icon, tone, items, empty }: { title: string; icon: React.ReactNode; tone: string; items: { text: string; quote?: string }[]; empty: string }) {
  return (
    <div className="rounded-2xl border border-line bg-paper">
      <p className="flex items-center gap-2 border-b border-line px-4 py-3 text-[15px] font-semibold" style={{ color: tone }}>{icon}{title}<span className="ml-auto text-[13px] text-ink-mute">{items.length}</span></p>
      <ul className="space-y-3 p-4">
        {items.length === 0 && empty && <li className="text-[14px] text-ink-mute">{empty}</li>}
        {items.map((it) => (
          <li key={it.text} className="text-[14px] leading-snug">
            {it.text}
            {it.quote && <span className="mt-1.5 flex gap-1.5 rounded-lg bg-canvas p-2 text-[12px] text-ink-soft"><Quote className="mt-0.5 size-3 shrink-0" aria-hidden />{it.quote}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
