import { ScanProgress } from "@/components/analysis/ScanProgress";

export default async function RunPage({ params }: { params: Promise<{ scanId: string }> }) {
  const { scanId } = await params;
  return <ScanProgress scanId={scanId} />;
}
