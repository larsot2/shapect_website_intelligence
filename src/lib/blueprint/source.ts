import "server-only";
import { validateBlueprint, type ValidationResult } from "./validate";
import northwind from "../../../fixtures/blueprints/northwind.blueprint.json";
import { isScanId, listJobs, readBlueprint } from "../analyzer/store";

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

/** Snapshots written by the analyzer (data/scans/<id>/blueprint.json). */
export const scanSnapshotSource: BlueprintSource = {
  async list() {
    const jobs = await listJobs();
    return jobs
      .filter((j) => j.status === "done" || j.status === "partial")
      .map((j) => ({ scanId: j.scanId, businessName: j.businessName ?? new URL(j.url).hostname, url: new URL(j.url).hostname.replace(/^www\./, ""), kind: "scan" as const, note: j.finishedAt }));
  },
  async get(scanId) {
    return isScanId(scanId) ? readBlueprint(scanId) : null;
  },
};

const sources: BlueprintSource[] = [scanSnapshotSource, fixtureSource];

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
