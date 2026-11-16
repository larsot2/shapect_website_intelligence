/**
 * File-based storage for this standalone version: one folder per scan with
 * job status, immutable blueprint snapshot, screenshots and review decisions
 * (kept separate). No tenant model is pretended here — single workspace.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config";

export type PhaseKey = "reading" | "understanding" | "mapping" | "recommending";
export const PHASES: { key: PhaseKey; label: string }[] = [
  { key: "reading", label: "Reading your website" },
  { key: "understanding", label: "Understanding your business" },
  { key: "mapping", label: "Mapping existing customer journeys" },
  { key: "recommending", label: "Preparing recommendations" },
];

export interface JobState {
  scanId: string;
  url: string;
  status: "queued" | "running" | "done" | "partial" | "failed";
  phase: PhaseKey | null;
  phases: Record<PhaseKey, { status: "pending" | "active" | "done" | "failed"; detail?: string }>;
  activity: string[]; // short human log lines (latest last)
  counts: { found?: number; selected?: number; read?: number; captured?: number };
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  error?: string;
  businessName?: string;
}

const SCAN_ID_RE = /^scan-[a-z0-9-]{4,58}$/;
export const isScanId = (id: string) => SCAN_ID_RE.test(id);

export const scansDir = () => path.join(config.dataDir, "scans");
export const scanDir = (id: string) => {
  if (!isScanId(id)) throw new Error("invalid scan id");
  return path.join(scansDir(), id);
};

export function newScanId(host: string): string {
  const h = host.replace(/^www\./, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 30).replace(/-+$/, "");
  const t = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
  return `scan-${h}-${t}-${Math.random().toString(36).slice(2, 6)}`;
}

let tmpSeq = 0;
const chains = new Map<string, Promise<void>>();
/** Atomic write; writes to the same file are serialised. */
function writeJson(file: string, data: unknown): Promise<void> {
  const body = JSON.stringify(data, null, 1);
  const run = async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${++tmpSeq}.tmp`;
    await fs.writeFile(tmp, body);
    await fs.rename(tmp, file);
  };
  const next = (chains.get(file) ?? Promise.resolve()).then(run, run);
  chains.set(file, next.catch(() => {}));
  return next;
}
async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export const saveJob = (j: JobState) => writeJson(path.join(scanDir(j.scanId), "job.json"), { ...j, updatedAt: new Date().toISOString() });
export const readJob = (id: string) => readJson<JobState>(path.join(scanDir(id), "job.json"));
export const saveBlueprint = (id: string, bp: unknown) => writeJson(path.join(scanDir(id), "blueprint.json"), bp);
export const readBlueprint = (id: string) => readJson<unknown>(path.join(scanDir(id), "blueprint.json"));
export const saveDebug = (id: string, name: string, data: unknown) => writeJson(path.join(scanDir(id), "debug", `${name}.json`), data);

export async function listJobs(): Promise<JobState[]> {
  let names: string[] = [];
  try {
    names = await fs.readdir(scansDir());
  } catch {
    return [];
  }
  const jobs = (await Promise.all(names.filter(isScanId).map((n) => readJob(n)))).filter(Boolean) as JobState[];
  // retention: private screenshots and snapshots don't live forever
  const cutoff = Date.now() - config.retentionDays * 86_400_000;
  const keep: JobState[] = [];
  for (const j of jobs) {
    if (Date.parse(j.createdAt) < cutoff && j.status !== "running" && j.status !== "queued") await deleteScan(j.scanId).catch(() => {});
    else keep.push(j);
  }
  return keep.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteScan(id: string) {
  await fs.rm(scanDir(id), { recursive: true, force: true });
}

// ---- review decisions (separate from the snapshot)
const reviewFile = (scanId: string, snapshotVersion: string) =>
  path.join(config.dataDir, "reviews", `${scanId.replace(/[^a-z0-9-]/gi, "")}__${snapshotVersion.replace(/[^a-z0-9.-]/gi, "")}.json`);
export const readReview = (scanId: string, snapshotVersion: string) => readJson<unknown>(reviewFile(scanId, snapshotVersion));
export const saveReview = (scanId: string, snapshotVersion: string, data: unknown) => writeJson(reviewFile(scanId, snapshotVersion), data);
