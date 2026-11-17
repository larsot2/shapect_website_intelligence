import type { Metadata } from "next";
import { ClientDemo } from "@/components/demo/ClientDemo";

export const metadata: Metadata = {
  title: "Passion Built · Shapect Experience Network",
  description: "How Shapect turns a renovation website into a connected network of customer-specific experiences.",
};

export default function PassionBuiltDemo() {
  return <ClientDemo />;
}
