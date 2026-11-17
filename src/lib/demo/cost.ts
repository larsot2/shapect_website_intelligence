import { PUBLISHED_PRICES, type PriceCase, type PriceLevel } from "./passion";

export type RoomType = "main" | "ensuite";
export type Layout = "keep" | "move" | "not_sure";
export type Finish = "own_fixtures" | "essentials" | "comfort" | "premium";

export interface CostReference {
  /** one row per published case that applies */
  rows: { caseLabel: string; quote: string; levelLabel: string; low: number; high: number }[];
  /** combined span across the rows, in $K inc GST */
  low: number;
  high: number;
  /** honest notes on how the selections were matched */
  notes: string[];
}

const LEVEL_LABEL: Record<PriceLevel, string> = { labour: "Labour only", basic: "Basic fixtures", premium: "Premium fixtures" };

/** Which published fixture levels a preference corresponds to. "Modern comfort" is NOT a published level — it spans Basic and Premium. */
function levelsFor(finish: Finish): PriceLevel[] {
  if (finish === "own_fixtures") return ["labour"];
  if (finish === "essentials") return ["basic"];
  if (finish === "premium") return ["premium"];
  return ["basic", "premium"];
}

function casesFor(room: RoomType, layout: Layout): PriceCase[] {
  if (room === "ensuite") return ["ensuite"];
  if (layout === "keep") return ["main_keep"];
  if (layout === "move") return ["main_move"];
  return ["main_keep", "main_move"];
}

/** Deterministic match of the visitor's selections to Passion Built's own published references. No formula, no invented numbers. */
export function matchCostReference(room: RoomType, layout: Layout, finish: Finish): CostReference {
  const rows = casesFor(room, layout).flatMap((c) => {
    const p = PUBLISHED_PRICES[c];
    return levelsFor(finish).map((l) => ({ caseLabel: p.label, quote: p.quote, levelLabel: LEVEL_LABEL[l], low: p.levels[l][0], high: p.levels[l][1] }));
  });
  const notes: string[] = [];
  if (finish === "comfort") notes.push("“Modern comfort” is your preference, not a Passion Built package — so we show the published Basic and Premium fixture references either side of it.");
  if (finish === "own_fixtures") notes.push("Supplying your own fixtures matches Passion Built's published “Labour only” reference. Your fixtures are on top of that.");
  if (room === "ensuite") notes.push("Passion Built's ensuite references vary with size and don't separate moving the drainage.");
  if (room === "main" && layout === "not_sure") notes.push("You're not sure about the layout yet, so both published cases are shown — with and without moving the drainage.");
  return { rows, low: Math.min(...rows.map((r) => r.low)), high: Math.max(...rows.map((r) => r.high)), notes };
}

export const fmtK = (low: number, high: number) => (low === high ? `$${low}K` : `$${low}–${high}K`);
