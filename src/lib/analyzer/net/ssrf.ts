/**
 * SSRF guard. Every hostname is resolved and every resolved address checked
 * at connect time (the undici agent uses `safeLookup`), so redirects and DNS
 * rebinding can't reach private, loopback, link-local or metadata targets.
 */
import dns from "node:dns";
import net from "node:net";

export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedUrlError";
  }
}

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home.arpa", ".corp"];

/** Syntactic checks — no DNS. Returns the normalised URL or throws. */
export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedUrlError("Not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new BlockedUrlError("Only http and https are allowed");
  if (url.username || url.password) throw new BlockedUrlError("URLs with credentials are not allowed");
  if (url.port && url.port !== "80" && url.port !== "443") throw new BlockedUrlError("Only standard web ports are allowed");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) throw new BlockedUrlError("Local hostnames are not allowed");
  const bare = host.replace(/^\[|\]$/g, "");
  if (net.isIP(bare)) {
    if (isBlockedIp(bare)) throw new BlockedUrlError("Private or reserved addresses are not allowed");
  } else if (!host.includes(".")) {
    throw new BlockedUrlError("Hostname must be a public domain");
  }
  return url;
}

function ipv4ToInt(ip: string) {
  return ip.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

const V4_BLOCKS: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const n = ipv4ToInt(ip);
    return V4_BLOCKS.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (ipv4ToInt(base) & mask);
    });
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedIp(mapped[1]);
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(v)) return true; // hex-mapped v4: refuse
    const first = parseInt(v.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
    if ((first & 0xff00) === 0xff00) return true; // multicast
    if (v.startsWith("64:ff9b:") || v.startsWith("2001:db8:") || v.startsWith("100::")) return true;
    if (v.startsWith("2002:")) return true; // 6to4 can embed private v4
    return false;
  }
  return true;
}

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

/** dns.lookup replacement used at connect time: refuses blocked addresses. */
export function safeLookup(hostname: string, options: dns.LookupOptions, cb: LookupCb) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, []);
    const list = addresses as dns.LookupAddress[];
    const bad = list.find((a) => isBlockedIp(a.address));
    if (bad || list.length === 0) {
      const e = new BlockedUrlError(`Blocked address for ${hostname}`) as NodeJS.ErrnoException;
      e.code = "EBLOCKED";
      return cb(e, []);
    }
    if (options.all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}

/** Pre-flight check used before a scan starts (gives the user a clear error). */
export async function assertResolvesPublic(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) return;
  let addrs: dns.LookupAddress[];
  try {
    addrs = await dns.promises.lookup(host, { all: true });
  } catch {
    throw new BlockedUrlError("We couldn't find this website. Check the address.");
  }
  if (!addrs.length || addrs.some((a) => isBlockedIp(a.address))) throw new BlockedUrlError("This address points to a private network");
}
