import { describe, expect, it } from "vitest";
import fixture from "../fixtures/blueprints/northwind.blueprint.json";
import pageText from "../fixtures/blueprints/northwind.pagetext.json";
import { validateBlueprint } from "@/lib/blueprint/validate";
import { decide, reconcile, emptyReview } from "@/lib/review/review";
import type { Blueprint } from "@/lib/blueprint/schema";

const clone = (): Record<string, any> => structuredClone(fixture) as Record<string, any>;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

describe("blueprint contract", () => {
  it("accepts the fixture and every evidence quote is literally on the captured page", () => {
    const res = validateBlueprint(fixture);
    expect(res.ok ? [] : res.errors).toEqual([]);
    const texts = pageText as Record<string, string>;
    const missing: string[] = [];
    JSON.stringify(fixture, (key, value) => {
      if (value && typeof value === "object" && typeof value.quote === "string" && typeof value.pageId === "string") {
        if (!norm(texts[value.pageId] ?? "").includes(norm(value.quote))) missing.push(`${value.pageId}: ${value.quote}`);
      }
      return value;
    });
    expect(missing).toEqual([]);
  });

  it("rejects an observed claim without evidence", () => {
    const bp = clone();
    bp.businessClaims[0].evidence = [];
    const res = validateBlueprint(bp);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join("\n")).toMatch(/require at least one evidence/);
  });

  it("rejects dangling references and unverified pixel positions", () => {
    const bp = clone();
    bp.suggestedExperiences[0].conversionTargetAssetId = "no-such-asset";
    bp.suggestedConnections[0].to.id = "sx-missing";
    bp.suggestedExperiences[0].touchpoints[0].bboxes = [];
    const res = validateBlueprint(bp);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const all = res.errors.join("\n");
      expect(all).toMatch(/unknown assetId "no-such-asset"/);
      expect(all).toMatch(/unknown to "sx-missing"/);
      expect(all).toMatch(/positionVerified without measured bbox/);
    }
  });

  it("caps suggestions at three", () => {
    const bp = clone();
    bp.suggestedExperiences.push({ ...bp.suggestedExperiences[0], id: "sx-four" });
    expect(validateBlueprint(bp).ok).toBe(false);
  });
});

describe("review state", () => {
  const bp = fixture as unknown as Blueprint;

  it("keeps the snapshot untouched and drops stale or foreign decisions on load", () => {
    const before = JSON.stringify(bp);
    let s = decide(emptyReview(bp), {
      targetKind: "suggestion",
      targetId: "sx-project-planner",
      status: "edited",
      edits: { "touchpoint.tp-small-midpage.headline": "Plan it first", "price": "$0" },
    });
    s = decide(s, { targetKind: "suggestion", targetId: "sx-deleted", status: "confirmed" });
    s = decide(s, { targetKind: "assetAction", targetId: "aa-home-phone", status: "edited", edits: { proposal: "publish" } });

    const loaded = reconcile(bp, JSON.parse(JSON.stringify(s)));
    expect(Object.keys(loaded.decisions).sort()).toEqual(["assetAction:aa-home-phone", "suggestion:sx-project-planner"]);
    expect(loaded.decisions["suggestion:sx-project-planner"].edits).toEqual({ "touchpoint.tp-small-midpage.headline": "Plan it first" });
    expect(loaded.decisions["assetAction:aa-home-phone"].edits).toBeUndefined();
    expect(reconcile(bp, { ...s, snapshotVersion: "other" }).decisions).toEqual({});
    expect(JSON.stringify(bp)).toBe(before);
  });
});

describe("derived views (no LLM needed)", async () => {
  const { experienceSteps, connectionState, placementVerdicts, stepBasis } = await import("@/lib/blueprint/derive");
  const bp = fixture as unknown as Blueprint;

  it("builds a concept flow that ends in the existing process", () => {
    const steps = experienceSteps(bp.suggestedExperiences[0], bp);
    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(steps.at(-1)!.title).toMatch(/consultation request form/i);
  });

  it("separates bridge vs hand-over and marks preferences", () => {
    const bridge = connectionState(bp.suggestedConnections.find((c) => c.to.kind === "suggestion")!, bp);
    expect(bridge.mechanism).toBe("bridge");
    expect(bridge.carry.find((x) => /style/i.test(x.label))?.note).toBe("preference only");
    expect(bridge.constraints.join(" ")).toMatch(/not a product selection/);
    expect(connectionState(bp.suggestedConnections.find((c) => c.to.kind === "existing_asset")!, bp).mechanism).toBe("destination");
  });

  it("flags two suggestions in the same spot instead of stacking them", () => {
    const clone = structuredClone(bp);
    const a = clone.suggestedExperiences[0].touchpoints[0];
    clone.suggestedExperiences[2].touchpoints[0] = { ...clone.suggestedExperiences[2].touchpoints[0], pageId: a.pageId, bboxes: a.bboxes };
    const v = placementVerdicts(clone);
    expect(v.get(clone.suggestedExperiences[2].touchpoints[0].id)?.crowdedBy).toBe(clone.suggestedExperiences[0].label);
    expect(v.get("tp-home-hero")?.quality).toBe("unverified");
  });

  it("treats internal outcomes as inferred unless stated", () => {
    expect(stepBasis({ id: "s1", label: "Call-back", kind: "outcome", pageIds: [] })).toBe("inferred");
    expect(stepBasis({ id: "s2", label: "Form", kind: "asset", pageIds: [], assetId: "x" })).toBe("observed");
  });
});
