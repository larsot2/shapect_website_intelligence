import { describe, expect, it } from "vitest";
import { matchCostReference } from "@/lib/demo/cost";
import { applyPatch, emptyState } from "@/lib/demo/state";
import { buildBrief } from "@/components/demo/entries/ProjectReadiness";

describe("cost estimator uses only Passion Built's published references", () => {
  it("matches the exact published case and level", () => {
    const r = matchCostReference("main", "move", "premium");
    expect([r.low, r.high]).toEqual([26, 29]);
    expect(r.rows[0].caseLabel).toBe("Main bathroom with drainage moving");
  });
  it("shows a preference between packages as the span of two published levels, with a note", () => {
    const r = matchCostReference("main", "keep", "comfort");
    expect([r.low, r.high]).toEqual([22, 28]);
    expect(r.notes.join(" ")).toMatch(/not a Passion Built package/);
  });
  it("own fixtures map to the published labour-only reference", () => {
    expect(matchCostReference("ensuite", "keep", "own_fixtures").rows.map((x) => x.levelLabel)).toEqual(["Labour only"]);
  });
});

describe("ProjectState", () => {
  it("stores only confirmed values and remembers where they came from", () => {
    const s = applyPatch(emptyState(), "design", { design: { style: "Warm & Natural", priorities: [] }, project: { roomType: undefined } });
    expect(s.design.style).toBe("Warm & Natural");
    expect(s.design.priorities).toBeUndefined();
    expect(s.project.roomType).toBeUndefined();
    expect(s.sources["design.style"]).toBe("design");
  });
  it("never turns reviewed by-laws into an approval", () => {
    const s = applyPatch(emptyState(), "apartment", { project: { propertyType: "apartment" }, apartment: { strataManaged: "yes", bylawsReviewed: "yes", approvalStatus: "not_confirmed" } });
    const open = buildBrief(s).sections.find((x) => x.title === "Still to confirm")!;
    expect(open.items.map((i) => i.text)).toContain("Strata approval: not confirmed yet");
  });
});
