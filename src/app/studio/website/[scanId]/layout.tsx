import { notFound } from "next/navigation";
import { loadBlueprint } from "@/lib/blueprint/source";
import { AnalysisProvider } from "@/components/analysis/AnalysisContext";
import { FixtureBanner } from "@/components/analysis/FixtureBanner";

export default async function AnalysisLayout({ children, params }: { children: React.ReactNode; params: Promise<{ scanId: string }> }) {
  const { scanId } = await params;
  const res = await loadBlueprint(scanId);
  if (!res) notFound();
  if (!res.ok) {
    return (
      <main className="mx-auto max-w-[760px] px-4 py-16 sm:px-6">
        <h1 className="text-2xl font-semibold">This analysis can&apos;t be shown</h1>
        <p className="mt-2 text-ink-soft">The saved snapshot failed validation, so we won&apos;t show half-checked results.</p>
        <ul className="mt-6 space-y-1 rounded-xl border border-line bg-paper p-4 font-mono text-[12px] text-rose">
          {res.errors.slice(0, 20).map((e) => <li key={e}>{e}</li>)}
        </ul>
      </main>
    );
  }
  return (
    <AnalysisProvider bp={res.blueprint}>
      {res.blueprint.source.kind === "fixture" && <FixtureBanner note={res.blueprint.source.note} />}
      {children}
    </AnalysisProvider>
  );
}
