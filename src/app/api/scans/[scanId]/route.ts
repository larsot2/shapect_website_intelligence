import { NextResponse } from "next/server";
import { getJob, queuePosition } from "@/lib/analyzer/runner";
import { deleteScan, isScanId } from "@/lib/analyzer/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ scanId: string }> }) {
  const { scanId } = await params;
  if (!isScanId(scanId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const job = await getJob(scanId);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ...job, queuePosition: queuePosition(scanId) });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ scanId: string }> }) {
  const { scanId } = await params;
  if (!isScanId(scanId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const job = await getJob(scanId);
  if (job && (job.status === "running" || job.status === "queued")) return NextResponse.json({ error: "Scan is still running" }, { status: 409 });
  await deleteScan(scanId);
  return NextResponse.json({ ok: true });
}
