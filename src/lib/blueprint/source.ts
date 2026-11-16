import "server-only";
import { validateBlueprint, type ValidationResult } from "./validate";
import northwind from "../../../fixtures/blueprints/northwind.blueprint.json";

/**
 * The UI never knows where a blueprint comes from. Every source returns raw
 * JSON that is validated against the same contract (schema.ts + validate.ts)
 * before rendering. Switching from demo data to real scans = registering a new
 * source here; no UI change.
 *
 * Planned sources:
 *   - FixtureSource      (S1, now)  — clearly marked demo/fixture snapshots
 *   - ScanSnapshotSource (S2–S4)    — snapshots written by the Python analyzer,
 *                                     later tenant-scoped storage in the existing
 *                                     Shapect backend (to be confirmed in that repo)
 */
export interface BlueprintSummary {
  scanId: string;
  businessName: string;
  url: string;
  kind: "fixture" | "scan";
  note?: string;
}

export interface BlueprintSource {
  list(): Promise<BlueprintSummary[]>;
  /** Raw, unvalidated snapshot JSON, or null if this source doesn't know the id. */
  get(scanId: string): Promise<unknown | null>;
}

const fixtureSnapshots: Record<string, unknown> = { "fixture-northwind": northwind };

export const fixtureSource: BlueprintSource = {
  async list() {
    return [{ scanId: "fixture-northwind", businessName: "Northwind Bathrooms", url: "northwind-bathrooms.example", kind: "fixture", note: "Fictional demo business" }];
  },
  async get(scanId) {
    return fixtureSnapshots[scanId] ?? null;
  },
};

const sources: BlueprintSource[] = [fixtureSource];

export async function listBlueprints(): Promise<BlueprintSummary[]> {
  return (await Promise.all(sources.map((s) => s.list()))).flat();
}

export async function loadBlueprint(scanId: string): Promise<ValidationResult | null> {
  for (const s of sources) {
    const raw = await s.get(scanId);
    if (raw) return validateBlueprint(raw);
  }
  return null;
}
