import { Suspense } from "react";
import { WebsitePreview } from "@/components/analysis/WebsitePreview";

export default function PreviewPage() {
  return (
    <Suspense>
      <WebsitePreview />
    </Suspense>
  );
}
