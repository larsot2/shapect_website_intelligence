import type { EntryId } from "@/lib/demo/passion";

export interface EntryProps {
  /** explicit continuation into another independent Experience */
  onBridge: (to: EntryId) => void;
  accent: string;
}
