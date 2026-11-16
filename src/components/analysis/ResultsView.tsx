"use client";

import { SnapshotHero } from "./SnapshotHero";
import { Recommendations } from "./Recommendations";
import { HowItWorks } from "./HowItWorks";
import { BusinessFacts } from "./BusinessFacts";
import { ConnectionMap } from "./ConnectionMap";
import { ScanDetails } from "./ScanDetails";
import { ReviewProgress } from "./ReviewProgress";
import { PartialNotice } from "./PartialNotice";

export function ResultsView() {
  return (
    <main className="mx-auto max-w-[1240px] space-y-20 px-4 pt-10 pb-28 sm:px-6 lg:pt-14">
      <PartialNotice />
      <SnapshotHero />
      <Recommendations />
      <HowItWorks />
      <BusinessFacts />
      <ConnectionMap />
      <ScanDetails />
      <ReviewProgress />
    </main>
  );
}
