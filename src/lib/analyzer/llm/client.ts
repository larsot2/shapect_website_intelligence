/**
 * LLM adapter. Domain code only sees `LlmClient.completeJson` — provider and
 * model come from env. Keys are read server-side and never logged, returned
 * or written into a blueprint.
 *
 * Provider "iaedu": IAEDU agent-chat stream (POST multipart, NDJSON events),
 * which serves OpenAI GPT-5.5 for the configured agent. Each call uses a fresh
 * thread id so no conversation memory leaks between calls or scans.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fetch as undiciFetch, FormData, ProxyAgent, type Dispatcher } from "undici";
import type { z } from "zod";
import { config } from "../config";

export interface LlmUsage {
  /** raw text of answers that failed validation (debug only, never shown in UI) */
  rejected?: { task: string; errors: string; text: string }[];
  calls: number;
  cacheHits: number;
  inputChars: number;
  outputChars: number;
  inputTokens: number; // reported by provider when available, otherwise estimated (chars/4)
  outputTokens: number;
  tokensEstimated: boolean;
  durationMs: number;
  failures: string[];
  model?: string;
  provider?: string;
}

export const newUsage = (): LlmUsage => ({ calls: 0, cacheHits: 0, inputChars: 0, outputChars: 0, inputTokens: 0, outputTokens: 0, tokensEstimated: false, durationMs: 0, failures: [] });

export class LlmBudgetError extends Error {}

interface RawCompletion { text: string; model?: string; provider?: string; inputTokens?: number; outputTokens?: number }

export function llmConfigured(): boolean {
  return Boolean(process.env.IAEDU_API_KEY && process.env.IAEDU_ENDPOINT && process.env.IAEDU_CHANNEL_ID);
}

let dispatcher: Dispatcher | undefined;
const getDispatcher = () => {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!proxy) return undefined;
  dispatcher ??= new ProxyAgent({ uri: proxy, bodyTimeout: config.llmTimeoutMs, headersTimeout: config.llmTimeoutMs });
  return dispatcher;
};

async function callIaedu(message: string): Promise<RawCompletion> {
  const endpoint = process.env.IAEDU_ENDPOINT!;
  const form = new FormData();
  form.set("channel_id", process.env.IAEDU_CHANNEL_ID!);
  form.set("thread_id", `shapect-${crypto.randomUUID()}`);
  form.set("user_info", "{}");
  form.set("message", message);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.llmTimeoutMs);
  try {
    const res = await undiciFetch(endpoint, {
      method: "POST",
      body: form,
      headers: { "x-api-key": process.env.IAEDU_API_KEY! },
      signal: ctrl.signal,
      dispatcher: getDispatcher(),
    });
    if (!res.ok) throw new Error(`LLM endpoint answered HTTP ${res.status}`);
    const raw = await res.text();
    let tokens = "";
    let final: RawCompletion | null = null;
    for (const line of raw.split(/\n+/)) {
      if (!line.trim()) continue;
      let ev: { type?: string; content?: unknown };
      try { ev = JSON.parse(line); } catch { continue; }
      if (ev.type === "token" && typeof ev.content === "string") tokens += ev.content;
      if (ev.type === "error") throw new Error(`LLM stream error: ${String(ev.content).slice(0, 200)}`);
      if (ev.type === "message" && ev.content && typeof ev.content === "object") {
        const c = ev.content as { content?: unknown; response_metadata?: Record<string, unknown>; usage_metadata?: Record<string, number> };
        const meta = c.response_metadata ?? {};
        const usage = (c.usage_metadata ?? (meta.usage as Record<string, number> | undefined)) ?? {};
        final = {
          text: typeof c.content === "string" ? c.content : Array.isArray(c.content) ? c.content.map((p) => (typeof p === "string" ? p : (p as { text?: string }).text ?? "")).join("") : tokens,
          model: String(meta.model_name ?? meta.model ?? ""),
          provider: String(meta.model_provider ?? "iaedu"),
          inputTokens: usage.input_tokens ?? usage.prompt_tokens,
          outputTokens: usage.output_tokens ?? usage.completion_tokens,
        };
      }
    }
    return final ?? { text: tokens };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- cache

const cacheDir = () => path.join(config.dataDir, "cache", "llm");

async function cached(key: string): Promise<RawCompletion | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(cacheDir(), `${key}.json`), "utf8"));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- JSON handling

/** Extract the first complete top-level JSON object from model text. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const src = fenced ? fenced[1] : text;
  const start = src.indexOf("{");
  if (start < 0) throw new Error("No JSON object in model output");
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return JSON.parse(src.slice(start, i + 1));
  }
  throw new Error("Unterminated JSON in model output");
}

export interface CompleteOptions<T> {
  task: string; // for logs/metrics
  prompt: string;
  schema: z.ZodType<T>;
  usage: LlmUsage;
  promptVersion: string;
  /** called when the provider is busy and we wait before retrying */
  onWait?: (seconds: number) => void;
}

/**
 * One structured call: cache → provider → JSON extract → schema validate →
 * one repair retry with the validation errors. Throws if still invalid so the
 * caller can degrade to a partial result.
 */
export async function completeJson<T>(o: CompleteOptions<T>): Promise<T> {
  if (!llmConfigured()) throw new Error("LLM is not configured (IAEDU_* env vars missing)");
  if (o.prompt.length > config.llmMaxInputChars * 1.25) throw new LlmBudgetError(`Prompt for ${o.task} exceeds the input budget`);
  const key = crypto.createHash("sha256").update(`${o.promptVersion}\n${process.env.IAEDU_ENDPOINT}\n${o.prompt}`).digest("hex").slice(0, 40);

  const attempt = async (prompt: string, cacheKey: string | null): Promise<RawCompletion> => {
    if (cacheKey) {
      const hit = await cached(cacheKey);
      if (hit) {
        o.usage.cacheHits++;
        return hit;
      }
    }
    if (o.usage.calls >= config.llmMaxCalls) throw new LlmBudgetError(`LLM call budget (${config.llmMaxCalls}) reached`);
    o.usage.calls++;
    const t0 = Date.now();
    let r: RawCompletion | undefined;
    for (let tryNo = 0; ; tryNo++) {
      try {
        r = await callIaedu(prompt);
        break;
      } catch (e) {
        const transient = /429|rate limit|503|502|overloaded|ECONNRESET|socket/i.test((e as Error).message);
        if (!transient || tryNo >= 4) throw e;
        o.usage.failures.push(`${o.task}: provider busy, retrying`);
        const wait = [20, 40, 60, 60][tryNo] * 1000;
        o.onWait?.(wait / 1000);
        await new Promise((res) => setTimeout(res, wait));
      }
    }
    o.usage.durationMs += Date.now() - t0;
    o.usage.inputChars += prompt.length;
    o.usage.outputChars += r.text.length;
    if (r.inputTokens && r.outputTokens) {
      o.usage.inputTokens += r.inputTokens;
      o.usage.outputTokens += r.outputTokens;
    } else {
      o.usage.inputTokens += Math.ceil(prompt.length / 4);
      o.usage.outputTokens += Math.ceil(r.text.length / 4);
      o.usage.tokensEstimated = true;
    }
    if (r.model) o.usage.model = r.model;
    if (r.provider) o.usage.provider = r.provider;
    return r;
  };

  let r = await attempt(o.prompt, key);
  let parsed: unknown;
  let errors = "";
  try {
    parsed = extractJson(r.text);
    const v = o.schema.safeParse(parsed);
    if (v.success) {
      await fs.mkdir(cacheDir(), { recursive: true });
      await fs.writeFile(path.join(cacheDir(), `${key}.json`), JSON.stringify(r));
      return v.data;
    }
    errors = v.error.issues.slice(0, 12).map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
  } catch (e) {
    errors = (e as Error).message;
  }
  o.usage.failures.push(`${o.task}: first answer invalid`);
  (o.usage.rejected ??= []).push({ task: o.task, errors, text: r.text.slice(0, 20000) });
  const repair = `${o.prompt}\n\n# YOUR PREVIOUS ANSWER WAS INVALID\nFix these problems and answer again with ONLY the corrected JSON object:\n${errors}`;
  r = await attempt(repair, null);
  parsed = extractJson(r.text);
  const v = o.schema.safeParse(parsed);
  if (!v.success) {
    o.usage.failures.push(`${o.task}: repair failed`);
    o.usage.rejected!.push({ task: `${o.task}-repair`, errors: v.error.issues.slice(0, 12).map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"), text: r.text.slice(0, 20000) });
    throw new Error(`${o.task}: model output did not match the schema`);
  }
  await fs.mkdir(cacheDir(), { recursive: true });
  await fs.writeFile(path.join(cacheDir(), `${key}.json`), JSON.stringify(r));
  return v.data;
}
