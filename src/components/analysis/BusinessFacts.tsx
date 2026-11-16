"use client";

import { useState } from "react";
import { Check, Eye, Pencil, Quote, RotateCcw, X } from "lucide-react";
import type { BusinessClaim, Service } from "@/lib/blueprint/schema";
import { Button, Chip, SectionHeading } from "@/components/ui";
import { useAnalysis } from "./AnalysisContext";
import { reviewLabel, reviewTone } from "./labels";

const dimensionLabel: Record<Service["dimension"], string> = {
  core_service: "Services",
  room_type: "Rooms",
  property_type: "Property types",
  perspective: "Specialities",
  region: "Areas",
};

export function BusinessFacts({ embedded = false }: { embedded?: boolean }) {
  const { bp } = useAnalysis();
  const groups = Object.entries(
    bp.services.reduce<Record<string, Service[]>>((acc, s) => ((acc[s.dimension] ??= []).push(s), acc), {}),
  );
  const critical = bp.businessClaims.filter((c) => c.critical);
  const other = bp.businessClaims.filter((c) => !c.critical);
  const scopes = new Set(bp.services.map((s) => s.scope));

  return (
    <section aria-labelledby="facts-title">
      {!embedded && <SectionHeading id="business" eyebrow="What we learned about your business" title="Is this right?" />}
      <div className="grid gap-5 lg:grid-cols-[1fr_1.35fr]">
        <div className="rounded-2xl border border-line bg-paper p-6">
          <div className="mb-5 flex flex-wrap gap-2">
            <Chip tone={scopes.has("residential") ? "dark" : "neutral"}>Residential</Chip>
            <Chip tone={scopes.has("commercial") ? "dark" : "neutral"}>{scopes.has("commercial") ? "Commercial work" : "No commercial work found"}</Chip>
          </div>
          {scopes.has("commercial") && <p className="-mt-2 mb-4 text-[12px] text-ink-mute">We recognised your commercial work. Shapect&apos;s experiences focus on residential bathrooms for now — that&apos;s our limit, not yours.</p>}
          <div className="space-y-5">
            {groups.map(([dim, items]) => (
              <div key={dim}>
                <p className="mb-2 text-[12px] font-medium text-ink-mute">{dimensionLabel[dim as Service["dimension"]]}</p>
                <div className="flex flex-wrap gap-2">
                  {items.map((s) => (
                    <span key={s.id} className={`rounded-lg border px-3 py-1.5 text-[14px] ${s.supportedInV1 ? "border-line bg-canvas/50" : "border-dashed border-line text-ink-mute"}`}>
                      {s.label}
                      {!s.supportedInV1 && <span className="ml-1.5 text-[12px]">· Shapect can&apos;t help here yet</span>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {other.length > 0 && (
            <div className="mt-6 border-t border-line pt-5">
              <p className="mb-2 text-[12px] font-medium text-ink-mute">Also stated on your website</p>
              <ul className="space-y-1.5 text-[14px]">
                {other.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2">
                    <span>{c.value}</span>
                    {c.verification === "website_claim_unverified" && <Chip>Website claim, not verified</Chip>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <ul className="divide-y divide-line rounded-2xl border border-line bg-paper">
          {critical.map((c) => <ClaimRow key={c.id} c={c} />)}
        </ul>
      </div>
    </section>
  );
}

function ClaimRow({ c }: { c: BusinessClaim }) {
  const { decisionFor, decide, undo } = useAnalysis();
  const d = decisionFor("claim", c.id);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(d?.edits?.value ?? c.value);
  const [showSource, setShowSource] = useState(false);
  const shown = d?.edits?.value ?? c.value;

  return (
    <li className="p-5" data-testid={`claim-${c.id}`}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[12px] text-ink-mute">
            {c.label}
            {c.status === "observed"
              ? <span className="inline-flex items-center gap-1 rounded-full bg-go-soft px-1.5 py-px text-[11px] text-go-ink" title="Stated on your website"><Eye className="size-3" aria-hidden />we know</span>
              : <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-ink-mute/50 px-1.5 py-px text-[11px]" title="Our interpretation of your website">we infer</span>}
          </p>
          {editing ? (
            <form
              className="mt-1 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const v = value.trim();
                if (v && v !== c.value) decide({ targetKind: "claim", targetId: c.id, status: "edited", edits: { value: v } });
                else decide({ targetKind: "claim", targetId: c.id, status: "confirmed" });
                setEditing(false);
              }}
            >
              <input autoFocus value={value} maxLength={200} onChange={(e) => setValue(e.target.value)} aria-label={`Correct: ${c.label}`}
                className="w-full rounded-lg border border-go/60 px-3 py-1.5 text-[15px] outline-none" />
              <Button type="submit" size="sm" variant="primary">Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </form>
          ) : (
            <p className={`mt-0.5 text-[16px] font-medium ${d?.status === "rejected" ? "text-ink-mute line-through" : ""}`}>{shown}</p>
          )}
          {c.topic === "price_reference" && <p className="mt-1 text-[12px] text-amber">Public reference from your website — not a configured price.</p>}
          {d?.status === "edited" && <p className="mt-1 text-[12px] text-ink-mute">Website said: “{c.value}”</p>}
          <button type="button" onClick={() => setShowSource((s) => !s)} className="mt-1.5 text-[12px] font-medium text-ink-mute underline-offset-2 hover:text-ink hover:underline" aria-expanded={showSource}>
            {showSource ? "Hide source" : "Source"}
          </button>
          {showSource && (
            <div className="mt-2 space-y-1.5">
              {c.evidence.map((e, i) => (
                <p key={i} className="flex gap-2 rounded-lg bg-canvas px-3 py-2 text-[13px] text-ink-soft">
                  <Quote className="mt-0.5 size-3 shrink-0" aria-hidden />{e.quote} <span className="ml-auto shrink-0 text-ink-mute">{e.url.replace(/^https?:\/\/[^/]+/, "") || "/"}</span>
                </p>
              ))}
            </div>
          )}
        </div>
        {!editing && (
          d ? (
            <div className="flex items-center gap-2">
              <Chip tone={reviewTone[d.status]}>{d.status === "rejected" ? "Not right" : d.status === "edited" ? "Corrected" : reviewLabel[d.status]}</Chip>
              <Button size="sm" variant="ghost" aria-label={`Undo decision for ${c.label}`} onClick={() => { undo("claim", c.id); setValue(c.value); }}>
                <RotateCcw className="size-3.5" aria-hidden />
              </Button>
            </div>
          ) : (
            <div className="flex gap-1.5">
              <Button size="sm" variant="secondary" onClick={() => decide({ targetKind: "claim", targetId: c.id, status: "confirmed" })}>
                <Check className="size-3.5 text-go" aria-hidden /> Confirm
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" aria-hidden /> Correct
              </Button>
              <Button size="sm" variant="quiet-danger" onClick={() => decide({ targetKind: "claim", targetId: c.id, status: "rejected" })}>
                <X className="size-3.5" aria-hidden /> Not right
              </Button>
            </div>
          )
        )}
      </div>
    </li>
  );
}
