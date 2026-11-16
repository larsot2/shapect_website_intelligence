import { NextResponse } from "next/server";
import { loadBlueprint } from "@/lib/blueprint/source";
import { reconcile } from "@/lib/review/review";
import { readReview, saveReview } from "@/lib/analyzer/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function blueprintFor(scanId: string) {
  const res = await loadBlueprint(scanId);
  return res && res.ok ? res.blueprint : null;
}

export async function GET(_: Request, { params }: { params: Promise<{ scanId: string }> }) {
  const { scanId } = await params;
  const bp = await blueprintFor(scanId);
  if (!bp) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(reconcile(bp, await readReview(bp.scanId, bp.snapshotVersion)));
}

/** Decisions are validated against the snapshot they belong to; the snapshot itself is never modified. */
export async function PUT(req: Request, { params }: { params: Promise<{ scanId: string }> }) {
  const { scanId } = await params;
  const bp = await blueprintFor(scanId);
  if (!bp) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const raw = await req.text();
  if (raw.length > 200_000) return NextResponse.json({ error: "Too large" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const clean = reconcile(bp, body);
  await saveReview(bp.scanId, bp.snapshotVersion, clean);
  return NextResponse.json(clean);
}

/** sendBeacon (page unload) can only POST — same semantics as PUT. */
export const POST = PUT;
