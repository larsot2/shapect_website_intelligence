/**
 * Passion Built demo configuration — deterministic, local, typed.
 * Screenshots and project photos were captured from passionbuilt.com.au on 16–17 Nov 2026 for this demo.
 * Nothing on the live website is modified; the preview inserts Shapect touchpoints into screenshots.
 */

export type EntryId = "cost" | "design" | "granny" | "apartment" | "readiness";
export type PageKey = "home" | "design" | "granny" | "apartment" | "house";

export const COMPANY = {
  name: "Passion Built",
  site: "passionbuilt.com.au",
  quoteUrl: "https://www.passionbuilt.com.au/get-a-bathroom-renovation-quotation",
  contactUrl: "https://www.passionbuilt.com.au/contact-passion-built",
  phone: "0424 439 552",
};

export interface DemoPage {
  key: PageKey;
  label: string;
  url: string;
  path: string;
  screenshot: string;
  /** screenshot size in px (1280 wide) and the y where the touchpoint is inserted */
  width: number;
  height: number;
  splitY: number;
  entry: EntryId;
  placement: string;
}

export const PAGES: DemoPage[] = [
  { key: "home", label: "Home", path: "/", url: "https://www.passionbuilt.com.au/", screenshot: "/demo/passion-built/pages/home.jpg", width: 1280, height: 4600, splitY: 1450, entry: "cost", placement: "Homepage · right after the hero, before the service overview" },
  { key: "design", label: "Design", path: "/bathroom-designer-in-sydney", url: "https://www.passionbuilt.com.au/bathroom-designer-in-sydney", screenshot: "/demo/passion-built/pages/design.jpg", width: 1280, height: 4600, splitY: 2595, entry: "design", placement: "Design page · after the design & planning service content" },
  { key: "granny", label: "Granny Flat", path: "/granny-flat-bathroom-renovations-in-sydney", url: "https://www.passionbuilt.com.au/granny-flat-bathroom-renovations-in-sydney", screenshot: "/demo/passion-built/pages/granny.jpg", width: 1280, height: 4600, splitY: 1690, entry: "granny", placement: "Granny Flat page · right after the service introduction" },
  { key: "apartment", label: "Apartment", path: "/apartment-bathroom-renovations-in-sydney", url: "https://www.passionbuilt.com.au/apartment-bathroom-renovations-in-sydney", screenshot: "/demo/passion-built/pages/apartment.jpg", width: 1280, height: 4600, splitY: 2595, entry: "apartment", placement: "Apartment page · after the content on approvals and apartment constraints" },
  { key: "house", label: "House", path: "/bathroom-renovations-in-sydney", url: "https://www.passionbuilt.com.au/bathroom-renovations-in-sydney", screenshot: "/demo/passion-built/pages/house.jpg", width: 1280, height: 4600, splitY: 1940, entry: "readiness", placement: "House page · after “Want a modern look? Need more space?”" },
];

export interface EntryDef {
  id: EntryId;
  name: string;
  short: string;
  /** what the customer wants */
  goal: string;
  /** what the customer leaves with */
  outcome: string;
  interaction: string;
  accent: string; // tailwind-safe hex
  touchpoint: { page: PageKey; headline: string; copy: string; cta: string };
  writes: string[];
  reads: string[];
}

export const ENTRIES: Record<EntryId, EntryDef> = {
  cost: {
    id: "cost", name: "Bathroom Cost Estimator", short: "Cost Estimator",
    goal: "“I want an idea of renovation costs before contacting a builder.”",
    outcome: "Passion Built's own published cost references that match the project — clearly separated from a real quote.",
    interaction: "Four quick visual steps · published references, no invented formula",
    accent: "#0f766e",
    touchpoint: { page: "home", headline: "Curious what your bathroom renovation might cost?", copy: "Explore renovation cost expectations based on your project.", cta: "Explore Renovation Costs" },
    writes: ["Scope", "Room type", "Room size", "Layout intent", "Finish preference", "Cost reference"],
    reads: [],
  },
  design: {
    id: "design", name: "Bathroom Design Explorer", short: "Design Explorer",
    goal: "“I know what I like when I see it — help me put it into words.”",
    outcome: "A visual Design Direction: style, moodboard, preferred features and ranked priorities.",
    interaction: "Image-led choices · moodboard · priority ranking",
    accent: "#8a4f7d",
    touchpoint: { page: "design", headline: "Discover your bathroom style.", copy: "Explore real Passion Built bathrooms and build a design direction in a few taps.", cta: "Explore Bathroom Styles" },
    writes: ["Style", "Preferred features", "Design priorities"],
    reads: [],
  },
  granny: {
    id: "granny", name: "Granny Flat Bathroom Planner", short: "Granny Flat Planner",
    goal: "“The space is small and it has to work for whoever lives there.”",
    outcome: "A granny-flat plan: intended use, main challenges, priority features and questions for the site inspection.",
    interaction: "Use-first planning · adapts to the challenges you pick",
    accent: "#b45309",
    touchpoint: { page: "granny", headline: "Small space. Big possibilities.", copy: "Plan a granny flat bathroom around the people who'll use it and the space you have.", cta: "Plan My Granny Flat Bathroom" },
    writes: ["Property type", "Intended use", "Challenges", "Priority features"],
    reads: [],
  },
  apartment: {
    id: "apartment", name: "Apartment Renovation Readiness", short: "Apartment Readiness",
    goal: "“What do I need to sort out with my building before a renovation?”",
    outcome: "A readiness overview: what's known, what needs clarifying, what to discuss with Passion Built.",
    interaction: "Short check · Known / Needs clarification / Discuss",
    accent: "#2d5f8a",
    touchpoint: { page: "apartment", headline: "Planning an apartment bathroom renovation?", copy: "Check what to have ready for strata, access and your first consultation.", cta: "Check My Renovation Readiness" },
    writes: ["Property type", "Strata managed", "By-laws reviewed", "Layout changes", "Access constraints", "Documents", "Approval status"],
    reads: [],
  },
  readiness: {
    id: "readiness", name: "Project Readiness & Quote Brief", short: "Project Readiness",
    goal: "“I'm ready to talk to a builder — let's get my project clear.”",
    outcome: "A renovation brief for Passion Built's free site inspection — without repeating anything already answered.",
    interaction: "Asks only what's missing · reviewable, copyable brief",
    accent: "#1d4f3d",
    touchpoint: { page: "house", headline: "Let's shape your bathroom renovation.", copy: "Put your ideas, needs and timing into one clear brief before the site inspection.", cta: "Prepare My Renovation Brief" },
    writes: ["Location", "Goals", "Timeline", "Constraints to discuss"],
    reads: ["Everything the other Experiences confirmed"],
  },
};

export const ENTRY_ORDER: EntryId[] = ["cost", "design", "granny", "apartment", "readiness"];

export type ConnectionKind = "touchpoint" | "bridge" | "reuse" | "handoff";
export interface Connection {
  id: string;
  kind: ConnectionKind;
  from: EntryId | PageKey;
  to: EntryId | "quote" | "contact";
  label: string;
  fields: string[];
  behaviour: string;
}

export const CONNECTIONS: Connection[] = [
  { id: "t-home", kind: "touchpoint", from: "home", to: "cost", label: "Homepage invitation", fields: [], behaviour: "Shown right after the hero. Opens the Cost Estimator; the existing “Get Quote” button stays where it is." },
  { id: "t-design", kind: "touchpoint", from: "design", to: "design", label: "Design page invitation", fields: [], behaviour: "Sits after Passion Built's design & planning content, where visitors are already thinking about style." },
  { id: "t-granny", kind: "touchpoint", from: "granny", to: "granny", label: "Granny Flat invitation", fields: [], behaviour: "Directly after the service introduction, before the long service copy." },
  { id: "t-apartment", kind: "touchpoint", from: "apartment", to: "apartment", label: "Apartment invitation", fields: [], behaviour: "Next to the content about approvals and apartment constraints." },
  { id: "t-house", kind: "touchpoint", from: "house", to: "readiness", label: "House page invitation", fields: [], behaviour: "A contextual way into the shared Project Readiness Experience — not a separate House Entry." },
  { id: "b-cost", kind: "bridge", from: "cost", to: "readiness", label: "Turn this into a renovation plan", fields: ["Scope", "Room type", "Room size", "Layout intent", "Finish preference", "Cost reference"], behaviour: "Offered on the cost result. Project Readiness skips every question already answered and shows the cost reference in the brief." },
  { id: "b-design", kind: "bridge", from: "design", to: "readiness", label: "Continue planning", fields: ["Style", "Preferred features", "Design priorities"], behaviour: "Offered on the Design Direction. Style and features are preferences — never treated as product selections." },
  { id: "b-granny", kind: "bridge", from: "granny", to: "readiness", label: "Continue to Project Readiness", fields: ["Property type", "Intended use", "Challenges", "Priority features"], behaviour: "Granny-flat context, challenges and site-inspection questions carry into the brief." },
  { id: "b-apartment", kind: "bridge", from: "apartment", to: "readiness", label: "Continue to Project Readiness", fields: ["Property type", "Strata managed", "By-laws reviewed", "Layout changes", "Access constraints", "Approval status"], behaviour: "Only confirmed answers carry over. Unknown approval stays “not confirmed” — it is never inferred." },
  { id: "b-granny-design", kind: "bridge", from: "granny", to: "design", label: "Explore design preferences (optional)", fields: ["Property type", "Priority features"], behaviour: "An optional detour for granny-flat visitors who want to think about the look as well. They can still go straight to the brief." },
  { id: "r-state", kind: "reuse", from: "cost", to: "readiness", label: "Session reuse via ProjectState", fields: ["Any confirmed field"], behaviour: "If a visitor later opens Project Readiness on their own (e.g. from the House page), it reuses what they already confirmed in this visit. No Bridge is offered — it's simply remembered." },
  { id: "h-design", kind: "handoff", from: "design", to: "contact", label: "I'm ready — contact Passion Built", fields: [], behaviour: "Opens Passion Built's existing contact page. The Design Brief can be copied; nothing is sent automatically — there is no integration." },
  { id: "h-readiness", kind: "handoff", from: "readiness", to: "quote", label: "Request a free site inspection", fields: [], behaviour: "Opens Passion Built's existing quotation page. The brief can be copied or downloaded to bring along; no data is submitted automatically." },
];

/**
 * Passion Built's own published cost references, verbatim from
 * https://www.passionbuilt.com.au/renovating-advice/how-much-does-a-bathroom-renovation-cost-in-sydney (captured 16 Nov 2026).
 * Figures are inc GST. They are references, not quotes.
 */
export const PRICE_SOURCE = {
  title: "How much does a bathroom renovation cost in Sydney",
  url: "https://www.passionbuilt.com.au/renovating-advice/how-much-does-a-bathroom-renovation-cost-in-sydney",
  captured: "16 Nov 2026",
};
export type PriceCase = "main_keep" | "main_move" | "ensuite";
export type PriceLevel = "labour" | "basic" | "premium";
export const PUBLISHED_PRICES: Record<PriceCase, { label: string; quote: string; levels: Record<PriceLevel, [number, number]> }> = {
  main_keep: { label: "Main bathroom with no drainage moving", quote: "Main Bathroom with no drainage moving: Labour only – $20K inc gst · Basic fixtures – $22-23K inc gst · Premium fixtures – $25-28K inc gst", levels: { labour: [20, 20], basic: [22, 23], premium: [25, 28] } },
  main_move: { label: "Main bathroom with drainage moving", quote: "Main bathroom with drainage moving: Labour only – $21K inc gst · Basic fixtures – $23-24K inc gst · Premium fixtures – $26-29K inc gst", levels: { labour: [21, 21], basic: [23, 24], premium: [26, 29] } },
  ensuite: { label: "Ensuite (varies based on size)", quote: "Ensuite varies based on size: Labour only – $17-18K inc gst · Basic fixtures – $20-22K inc gst · Premium fixtures – $26-29K inc gst", levels: { labour: [17, 18], basic: [20, 22], premium: [26, 29] } },
};
export const MAKEOVER_QUOTE = "Simple makeovers are minor so they might cost less than $1,000 once you buy some paint, new taps and a new light fitting to freshen up the room, you don't need a bathroom renovation company to do that type of work, a handyman will suffice.";

/** From Passion Built's apartment page (verbatim snippets used as context, not legal advice). */
export const APARTMENT_SOURCE = {
  url: "https://www.passionbuilt.com.au/apartment-bathroom-renovations-in-sydney",
  strata: "In some situations you may require strata approval to renovate.",
  common: "In an apartment the drainage stacks, the floor slab and some walls can be common property or structural. Relocating a vanity, toilet or floor waste can mean cutting into the concrete slab or connecting to a common stack.",
  flagged: "Anything that affects common property is flagged so it can go into your strata application.",
  timing: "Most apartment bathrooms are built in around 21 days on site once we start. On top of that, allow lead time at the front for design, product ordering and strata approval, which varies by building.",
  help: "We can help you with the strata approval process as well.",
  hours: "We work standard hours, typically 7am to 5pm, or whatever hours your strata sets.",
};

export const PHOTO = (name: string) => `/demo/passion-built/photos/${name}.jpg`;
