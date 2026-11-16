import fs from "node:fs/promises";
import { isScanId } from "@/lib/analyzer/store";
import { scanShotPath } from "@/lib/analyzer/pipeline";

export const runtime = "nodejs";

const FILE_RE = /^[a-z0-9][a-z0-9-]{0,80}-(desktop|mobile)\.jpg$/;

export async function GET(_: Request, { params }: { params: Promise<{ scanId: string; file: string }> }) {
  const { scanId, file } = await params;
  if (!isScanId(scanId) || !FILE_RE.test(file)) return new Response("Not found", { status: 404 });
  try {
    const data = await fs.readFile(scanShotPath(scanId, file));
    return new Response(new Uint8Array(data), { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=86400, immutable" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
