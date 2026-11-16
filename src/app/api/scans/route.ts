import { NextResponse } from "next/server";
import { startScan } from "@/lib/analyzer/runner";
import { listJobs } from "@/lib/analyzer/store";
import { BlockedUrlError } from "@/lib/analyzer/net/ssrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const jobs = await listJobs();
  return NextResponse.json(jobs.map(({ scanId, url, status, businessName, createdAt, finishedAt }) => ({ scanId, url, status, businessName, createdAt, finishedAt })));
}

export async function POST(req: Request) {
  let body: { url?: unknown; authorized?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (body.authorized !== true) return NextResponse.json({ error: "Please confirm you're allowed to have this website analysed." }, { status: 400 });
  if (typeof body.url !== "string" || body.url.length > 300) return NextResponse.json({ error: "Please enter a website address." }, { status: 400 });
  try {
    const job = await startScan(body.url);
    return NextResponse.json({ scanId: job.scanId }, { status: 202 });
  } catch (e) {
    const msg = e instanceof BlockedUrlError ? e.message : "That doesn't look like a public website address.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
