import { discover } from "../src/lib/analyzer/crawl";
import { newFetchStats } from "../src/lib/analyzer/net/fetcher";
const st = await discover(process.argv[2], newFetchStats(), () => {});
for (const c of st.candidates.values()) if (["other","design","projects"].includes(c.group) || c.areas.has("nav")) console.log(c.group.padEnd(9), [...c.areas].join(",").padEnd(16), c.url.replace(/^https:\/\/[^/]+/,""), "|", c.texts.join(" / ").slice(0,60));
