import type { ReviewStatus } from "@/lib/review/review";

export const actionLabel = {
  add: "New",
  improve: "Improve",
  connect: "Connect",
  reposition: "Reposition",
  none: "Keep as is",
} as const;

export const reviewLabel: Record<ReviewStatus, string> = {
  confirmed: "Confirmed by you",
  edited: "Confirmed with your edits",
  rejected: "Not for us",
  deferred: "Decide later",
};

export const reviewTone: Record<ReviewStatus, "go" | "rose" | "amber"> = {
  confirmed: "go",
  edited: "go",
  rejected: "rose",
  deferred: "amber",
};

export const coverageLabel = { covered: "Covered", partial: "Partly", none: "Not yet", unknown: "Unknown" } as const;
export const coverageTone = { covered: "go", partial: "amber", none: "neutral", unknown: "neutral" } as const;

export const capabilityLabel = {
  cost_guidance: "Cost guidance",
  design_inspiration: "Design inspiration",
  qualification: "Understanding the project",
  booking: "Booking",
  direct_contact: "Direct contact",
  upload: "Photo sharing",
} as const;

export const claimStatusText = {
  observed: "Seen on your website",
  inferred: "Our interpretation",
  suggested: "Our suggestion",
} as const;

export const proposalLabel = {
  keep: "Keep",
  replace: "Replace",
  redirect: "Redirect",
  bridge: "Bridge",
  remove: "Remove",
} as const;

export const fieldUsageLabel = {
  may_collect: "May collect",
  could_reuse_later: "Could reuse later",
  needs_confirmation: "Needs confirmation",
} as const;

export const assetKindLabel = {
  cta_link: "Button",
  contact_form: "Form",
  multi_step_form: "Multi-step form",
  calculator: "Calculator",
  booking: "Booking",
  phone: "Phone",
  email: "Email",
  chat: "Chat",
  upload: "Upload",
  third_party: "Third-party tool",
} as const;
