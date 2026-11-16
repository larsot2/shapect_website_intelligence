import fs from "node:fs";

/** Load .env for CLI scripts (server-side only). */
for (const line of (fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
