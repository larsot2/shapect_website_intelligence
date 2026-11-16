/**
 * Minimal in-process job runner (one scan at a time, FIFO). Jobs persist as
 * files, so the UI can poll and results survive restarts; a job interrupted by
 * a restart is reported as failed instead of hanging forever.
 */
import { normalizeStartUrl } from "./crawl";
import { newJob, runScan } from "./pipeline";
import { newScanId, readJob, saveJob, type JobState } from "./store";

interface RunnerState { queue: JobState[]; active: string | null }
const g = globalThis as unknown as { __shapectRunner?: RunnerState };
const state: RunnerState = (g.__shapectRunner ??= { queue: [], active: null });

export async function startScan(rawUrl: string): Promise<JobState> {
  const url = normalizeStartUrl(rawUrl); // throws BlockedUrlError for unsafe input
  const job = newJob(newScanId(url.hostname), url.href);
  await saveJob(job);
  state.queue.push(job);
  void pump();
  return job;
}

async function pump() {
  if (state.active) return;
  const job = state.queue.shift();
  if (!job) return;
  state.active = job.scanId;
  try {
    await runScan(job);
  } catch {
    /* runScan records its own failure */
  } finally {
    state.active = null;
    void pump();
  }
}

const STALE_MS = 3 * 60_000;

export async function getJob(scanId: string): Promise<JobState | null> {
  const job = await readJob(scanId);
  if (!job) return null;
  const inMemory = state.active === scanId || state.queue.some((j) => j.scanId === scanId);
  if ((job.status === "running" || job.status === "queued") && !inMemory && Date.now() - Date.parse(job.updatedAt) > STALE_MS) {
    job.status = "failed";
    job.error = "This scan was interrupted (the server restarted). Please start it again.";
    await saveJob(job);
  }
  return job;
}

export const queuePosition = (scanId: string) => state.queue.findIndex((j) => j.scanId === scanId);
