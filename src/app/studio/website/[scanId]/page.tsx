import { Suspense } from "react";
import { ResultsView } from "@/components/analysis/ResultsView";

export default function AnalysisPage() {
  return (
    <Suspense>
      <ResultsView />
    </Suspense>
  );
}
