"use client";

import { useMemo, useState } from "react";
import { Check, ClipboardCheck, Copy, Download, FileText, Pencil } from "lucide-react";
import { COMPANY, ENTRIES, type EntryId } from "@/lib/demo/passion";
import { LABELS, useDemo, type ProjectState, type PropertyType } from "@/lib/demo/state";
import type { Layout, RoomType } from "@/lib/demo/cost";
import { Chips, Footer, Handoff, Segmented, StageTitle, Steps, copyText, downloadText, toggle } from "../kit";
import type { EntryProps } from "./types";

const GOALS = ["A modern look", "More space", "Better storage", "Easier to use", "Fix wear and tear", "Add value to the property"];
const TIMING = ["As soon as possible", "In 1–3 months", "In 3–6 months", "Just exploring"];
const DISCUSS = ["Access or parking", "Strata or approvals", "Working around family or tenants", "A fixed deadline", "Older home or heritage", "Nothing in particular"];
const SOURCE_NAME: Record<EntryId, string> = { cost: "your cost guide", design: "your design direction", granny: "your granny flat plan", apartment: "your apartment readiness check", readiness: "this brief" };

export function ProjectReadiness({ accent }: EntryProps) {
  const { state, commit } = useDemo();
  const p = state.project;
  const [stage, setStage] = useState(0);
  const [propertyType, setPropertyType] = useState<PropertyType | undefined>(p.propertyType);
  const [roomType, setRoomType] = useState<RoomType | undefined>(p.roomType);
  const [scope, setScope] = useState<"complete" | "not_sure" | undefined>(p.scope);
  const [layout, setLayout] = useState<Layout | undefined>(p.layoutIntent);
  const [location, setLocation] = useState(p.location ?? "");
  const [goals, setGoals] = useState<string[]>(p.goals ?? []);
  const [timeline, setTimeline] = useState<string | undefined>(p.timeline);
  const [discuss, setDiscuss] = useState<string[]>(p.constraints ?? []);
  const [handoff, setHandoff] = useState(false);
  const [copied, setCopied] = useState(false);

  // what other Experiences already confirmed (asked again only if missing)
  const known = useMemo(() => ({ propertyType: !!p.propertyType, roomType: !!p.roomType, scope: !!p.scope, layout: !!p.layoutIntent }), [p.propertyType, p.roomType, p.scope, p.layoutIntent]);
  const carriedFrom = [...new Set(Object.values(state.sources))].filter((e) => e !== "readiness");
  const missingBasics = !known.propertyType || !known.roomType || !known.scope || !known.layout;

  const save = () => {
    commit("readiness", { project: { propertyType: known.propertyType ? undefined : propertyType, roomType: known.roomType ? undefined : roomType, scope: known.scope ? undefined : scope, layoutIntent: known.layout ? undefined : layout, location: location.trim() || undefined, goals, timeline, constraints: discuss.filter((d) => d !== "Nothing in particular") } });
    setStage(2);
  };

  const view: ProjectState = { ...state, project: { ...state.project, propertyType: p.propertyType ?? propertyType, roomType: p.roomType ?? roomType, scope: p.scope ?? scope, layoutIntent: p.layoutIntent ?? layout, location: location.trim() || p.location, goals, timeline, constraints: discuss.filter((d) => d !== "Nothing in particular") } };
  const brief = buildBrief(view);
  const briefText = briefToText(brief);

  return (
    <div>
      <Steps labels={["Your project", "Goals & timing", "Your brief"]} current={stage} accent={accent} />
      <div className="mt-6 animate-fade" key={stage}>
        {stage === 0 && (
          <>
            <StageTitle eyebrow="Project Readiness" title={carriedFrom.length ? "You've already done the hard part." : "Let's get your renovation clear."} sub={carriedFrom.length ? "Here's what we know from your earlier answers. We'll only ask for what's missing." : "A few quick questions to prepare for Passion Built's free site inspection."} />
            {carriedFrom.length > 0 && (
              <div className="mb-6 rounded-2xl border border-go/25 bg-go-soft/40 p-4">
                <p className="flex items-center gap-2 text-[14px] font-semibold text-go-ink"><ClipboardCheck className="size-4" aria-hidden />Already known — you won&apos;t be asked again</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {brief.knownChips.map((c) => (
                    <span key={c.label} className="inline-flex items-center gap-1.5 rounded-full bg-paper px-3 py-1 text-[13px] shadow-sm ring-1 ring-go/15">
                      <Check className="size-3.5 text-go" aria-hidden /><span className="text-ink-mute">{c.label}:</span> <span className="font-medium">{c.value}</span>
                    </span>
                  ))}
                </div>
                <p className="mt-2.5 text-[12px] text-go-ink/80">From {carriedFrom.map((e) => SOURCE_NAME[e]).join(", ")}.</p>
              </div>
            )}
            {missingBasics ? (
              <div className="space-y-5">
                {!known.propertyType && <Field label="What kind of property is it?"><Segmented label="Property" accent={accent} value={propertyType} onChange={setPropertyType} options={(["house", "apartment", "granny_flat", "townhouse", "other"] as PropertyType[]).map((v) => ({ value: v, label: LABELS.propertyType[v] }))} /></Field>}
                {!known.roomType && <Field label="Which room?"><Segmented label="Room" accent={accent} value={roomType} onChange={setRoomType} options={[{ value: "main", label: "Main bathroom" }, { value: "ensuite", label: "Ensuite" }]} /></Field>}
                {!known.scope && <Field label="How much are you changing?"><Segmented label="Scope" accent={accent} value={scope} onChange={setScope} options={[{ value: "complete", label: "Complete renovation" }, { value: "not_sure", label: "Not sure yet" }]} /></Field>}
                {!known.layout && <Field label="Shower, toilet and vanity"><Segmented label="Layout" accent={accent} value={layout} onChange={setLayout} options={[{ value: "keep", label: "Keep where they are" }, { value: "move", label: "Move some" }, { value: "not_sure", label: "Not sure" }]} /></Field>}
              </div>
            ) : (
              <p className="rounded-2xl bg-canvas p-4 text-[15px]">Your property, room, scope and layout are already clear. On to goals and timing.</p>
            )}
            <Footer accent={accent} onNext={() => setStage(1)} nextDisabled={(!known.propertyType && !propertyType) || (!known.roomType && !roomType)} />
          </>
        )}
        {stage === 1 && (
          <>
            <StageTitle title="What should the renovation achieve — and when?" sub={state.design.priorities?.length ? "Your design priorities are already in the brief — add anything else that matters." : undefined} />
            <div className="space-y-6">
              <Field label="Main goals (up to three)"><Chips accent={accent} options={GOALS} values={goals} onToggle={(v) => setGoals((x) => toggle(x, v, 3))} max={3} /></Field>
              <Field label="Timing"><Segmented label="Timing" accent={accent} value={timeline} onChange={setTimeline} options={TIMING.map((t) => ({ value: t, label: t }))} /></Field>
              <Field label="Anything to discuss at the site inspection?"><Chips accent={accent} options={DISCUSS} values={discuss} onToggle={(v) => setDiscuss((x) => (v === "Nothing in particular" ? (x.includes(v) ? [] : [v]) : toggle(x.filter((y) => y !== "Nothing in particular"), v)))} /></Field>
              <Field label="Suburb (optional)">
                <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Marrickville" maxLength={40} className="h-11 w-full max-w-[320px] rounded-xl border border-line bg-paper px-3.5 text-[15px] outline-none focus:border-ink-mute" />
                <p className="mt-1 text-[12px] text-ink-mute">Demo only — nothing you type is stored on a server or sent anywhere.</p>
              </Field>
            </div>
            <Footer accent={accent} onBack={() => setStage(0)} onNext={save} nextDisabled={!timeline} nextLabel="Create my brief" />
          </>
        )}
        {stage === 2 && (
          <>
            <div className="rounded-3xl p-6 text-white sm:p-8" style={{ background: `linear-gradient(135deg, ${accent}, #0f2c23)` }}>
              <p className="flex items-center gap-2 text-[13px] font-medium text-white/70"><FileText className="size-4" aria-hidden />Renovation brief · for Passion Built</p>
              <h3 className="mt-2 text-[30px] leading-tight font-semibold tracking-tight sm:text-[36px]">Your Renovation Brief Is Ready.</h3>
              <p className="mt-2 max-w-[560px] text-[15px] text-white/85">{brief.headline}</p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {brief.sections.map((s) => (
                <section key={s.title} className={`rounded-2xl border border-line bg-paper p-5 ${s.wide ? "sm:col-span-2" : ""}`}>
                  <h4 className="text-[13px] font-semibold tracking-wide text-ink-mute uppercase">{s.title}</h4>
                  <ul className="mt-2.5 space-y-2">
                    {s.items.map((it) => (
                      <li key={it.text} className="flex items-start justify-between gap-3 text-[14px]">
                        <span>{it.text}</span>
                        {it.source && <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium text-white" style={{ background: ENTRIES[it.source].accent }}>{ENTRIES[it.source].short}</span>}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setHandoff(true)} className="inline-flex h-12 items-center rounded-xl px-6 text-[15px] font-semibold text-white shadow-sm" style={{ background: accent }}>Request a Free Site Inspection</button>
              <button type="button" onClick={() => setStage(0)} className="inline-flex h-12 items-center gap-1.5 rounded-xl border border-line bg-paper px-4 text-[15px] font-medium hover:border-ink-mute"><Pencil className="size-4" aria-hidden />Edit My Brief</button>
              <button type="button" onClick={async () => setCopied(await copyText(briefText))} className="inline-flex h-12 items-center gap-1.5 rounded-xl px-3 text-[14px] font-medium text-ink-soft hover:text-ink">{copied ? <Check className="size-4 text-go" aria-hidden /> : <Copy className="size-4" aria-hidden />}{copied ? "Copied" : "Copy"}</button>
              <button type="button" onClick={() => downloadText("renovation-brief.txt", briefText)} className="inline-flex h-12 items-center gap-1.5 rounded-xl px-3 text-[14px] font-medium text-ink-soft hover:text-ink"><Download className="size-4" aria-hidden />Download</button>
            </div>
            {handoff && <div className="mt-4"><Handoff title="Request your free site inspection" url={COMPANY.quoteUrl} text={briefText} fileName="renovation-brief.txt" accent={accent} /></div>}
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><p className="mb-2 text-[14px] font-medium">{label}</p>{children}</div>;
}

type Item = { text: string; source?: EntryId };
export interface Brief { headline: string; knownChips: { label: string; value: string }[]; sections: { title: string; items: Item[]; wide?: boolean }[] }

/** Deterministic brief from ProjectState — only confirmed information, unknowns stay unknown. */
export function buildBrief(s: ProjectState): Brief {
  const p = s.project, src = (k: string) => s.sources[k];
  const overview: Item[] = [];
  const push = (arr: Item[], text: string | undefined, key?: string) => { if (text) arr.push({ text, source: key ? src(key) : undefined }); };
  push(overview, p.propertyType && LABELS.propertyType[p.propertyType], "project.propertyType");
  push(overview, p.roomType && LABELS.roomType[p.roomType], "project.roomType");
  push(overview, p.scope && LABELS.scope[p.scope], "project.scope");
  push(overview, p.roomSize && LABELS.roomSize[p.roomSize], "project.roomSize");
  push(overview, p.layoutIntent && LABELS.layoutIntent[p.layoutIntent], "project.layoutIntent");
  push(overview, p.location && `Suburb: ${p.location}`, "project.location");
  push(overview, p.timeline && `Timing: ${p.timeline}`, "project.timeline");

  const design: Item[] = [];
  push(design, s.design.style && `Style: ${s.design.style}`, "design.style");
  for (const f of s.design.features ?? []) push(design, `${f.label}: ${f.value}`, "design.features");
  push(design, p.finish && `Finish preference: ${LABELS.finish[p.finish]}`, "project.finish");

  const goals: Item[] = [];
  (s.design.priorities ?? []).forEach((x, i) => push(goals, `${i + 1}. ${x}`, "design.priorities"));
  for (const g of p.goals ?? []) push(goals, g, "project.goals");
  push(goals, s.grannyFlat.intendedUse && `For: ${s.grannyFlat.intendedUse.toLowerCase()}`, "grannyFlat.intendedUse");
  for (const g of s.grannyFlat.priorities ?? []) push(goals, g, "grannyFlat.priorities");

  const cost: Item[] = [];
  push(cost, p.costReference && p.costReference.text, "project.costReference");
  if (p.costReference) cost.push({ text: "A fixed-price written quote follows the free site inspection." });

  const open: Item[] = [];
  const a = s.apartment;
  if (p.propertyType === "apartment" || a.strataManaged) {
    if (a.approvalStatus !== "self_reported" && a.strataManaged !== "no") open.push({ text: "Strata approval: not confirmed yet", source: src("apartment.approvalStatus") });
    if (a.strataManaged === "unsure") open.push({ text: "Whether the building is strata-managed", source: src("apartment.strataManaged") });
    if (a.bylawsReviewed !== "yes" && a.strataManaged !== "no") open.push({ text: "By-laws not reviewed yet", source: src("apartment.bylawsReviewed") });
  }
  if (p.layoutIntent === "not_sure") open.push({ text: "Layout not decided — affects cost and approvals", source: src("project.layoutIntent") });
  if (!p.timeline) open.push({ text: "Timing not decided" });

  const talk: Item[] = [];
  for (const q of s.grannyFlat.questions ?? []) push(talk, q, "grannyFlat.questions");
  if (p.layoutIntent === "move" && p.propertyType === "apartment") talk.push({ text: "What can move without cutting the slab or connecting to a common stack", source: src("apartment.layoutChange") });
  for (const c of a.accessConstraints?.filter((x) => x !== "None that I know of") ?? []) push(talk, `Building access: ${c.toLowerCase()}`, "apartment.accessConstraints");
  for (const c of p.constraints ?? []) push(talk, c, "project.constraints");

  const sections = [
    { title: "Project overview", items: overview },
    { title: "Design preferences", items: design },
    { title: "Goals & priorities", items: goals },
    { title: "Cost reference", items: cost },
    { title: "Still to confirm", items: open },
    { title: "To discuss at the site inspection", items: talk, wide: true },
  ].filter((x) => x.items.length);

  const what = [p.roomType && LABELS.roomType[p.roomType].toLowerCase(), p.propertyType && `in a ${LABELS.propertyType[p.propertyType].toLowerCase()}`].filter(Boolean).join(" ");
  const headline = `${what ? `A ${what}` : "A bathroom renovation"}${s.design.style ? `, ${s.design.style.toLowerCase()} in style` : ""}${p.timeline ? ` — ${p.timeline.toLowerCase()}` : ""}. Everything below comes from your own answers.`;
  const knownChips = [
    p.propertyType && { label: "Property", value: LABELS.propertyType[p.propertyType] },
    p.roomType && { label: "Room", value: LABELS.roomType[p.roomType] },
    p.scope && { label: "Scope", value: p.scope === "complete" ? "Complete renovation" : "Not sure yet" },
    p.layoutIntent && { label: "Layout", value: LABELS.layoutIntent[p.layoutIntent] },
    p.finish && { label: "Finish", value: LABELS.finish[p.finish] },
    p.costReference && { label: "Cost reference", value: `$${p.costReference.low}–${p.costReference.high}K` },
    s.design.style && { label: "Style", value: s.design.style },
    s.design.priorities?.length && { label: "Priorities", value: s.design.priorities.slice(0, 2).join(", ") },
    s.grannyFlat.intendedUse && { label: "For", value: s.grannyFlat.intendedUse },
    s.grannyFlat.challenges?.length && { label: "Challenges", value: s.grannyFlat.challenges.join(", ") },
    s.apartment.strataManaged && { label: "Strata", value: LABELS.tri[s.apartment.strataManaged] },
  ].filter(Boolean) as { label: string; value: string }[];
  return { headline, knownChips, sections };
}

export function briefToText(b: Brief): string {
  return [`Renovation brief for Passion Built`, b.headline, ...b.sections.flatMap((s) => ["", s.title.toUpperCase(), ...s.items.map((i) => `- ${i.text}`)]), "", "Prepared with Shapect (demo). Preferences are not product selections; cost references are Passion Built's published figures, not a quote."].join("\n");
}
