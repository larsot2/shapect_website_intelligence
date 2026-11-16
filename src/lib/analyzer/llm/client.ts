/**
 * LLM adapter. Domain code only calls `completeJson({ stage, ... })`.
 * Provider and model per stage come from env; keys are read server-side and
 * never logged, returned or written into a blueprint.
 *
 * Provider: OpenRouter chat completions. Stage → model:
 *      understanding → OPENROUTER_UNDERSTANDING_MODEL (google/gemini-3.1-flash-lite-preview)
 *      strategy      → OPENROUTER_STRATEGY_MODEL      (google/gemini-3-flash-preview)
 *    No cross-model fallback: a repair or retry always uses the stage's own model.
 *    If the model is unavailable the call fails and the scan ends as partial.
 *
 * Every call is recorded (tokens, cost, latency, retries, validity) — real
 * numbers when the provider reports them, otherwise explicitly marked estimates.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fetch as undiciFetch, ProxyAgent, type Dispatcher } from "undici";
import { z } from "zod";
import { config } from "../config";

export type LlmStage = "understanding" | "strategy";

export interface LlmCallRecord {
  stage: LlmStage;
  task: string;
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cachedInputTokens: number | null;
  costUsd: number | null;
  estimated: boolean;
  inputBytes: number;
  outputBytes: number;
  latencyMs: number;
  cacheHit: boolean;
  retries: number;
  valid: boolean;
  structuredOutput: "json_schema" | "json_object" | "none";
}

export interface LlmUsage {
  /** raw text of answers that failed validation (debug only, never shown in UI) */
  rejected?: { task: string; errors: string; text: string }[];
  log: LlmCallRecord[];
  calls: number;
  cacheHits: number;
  inputChars: number;
  outputChars: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  costUsd: number;
  costKnown: boolean;
  tokensEstimated: boolean;
  durationMs: number;
  failures: string[];
  model?: string;
  provider?: string;
  models: Partial<Record<LlmStage, string>>;
}

export const newUsage = (): LlmUsage => ({
  log: [], calls: 0, cacheHits: 0, inputChars: 0, outputChars: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0,
  costUsd: 0, costKnown: true, tokensEstimated: false, durationMs: 0, failures: [], models: {},
});

interface RawCompletion {
  text: string;
  truncated?: boolean;
  model?: string;
  provider?: string;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  costUsd?: number;
  structuredOutput?: LlmCallRecord["structuredOutput"];
}

// ---------------------------------------------------------------- configuration

const env = (k: string, d = "") => process.env[k] ?? d;
export function modelFor(stage: LlmStage): string {
  return stage === "understanding"
    ? env("OPENROUTER_UNDERSTANDING_MODEL", "google/gemini-3.1-flash-lite-preview")
    : env("OPENROUTER_STRATEGY_MODEL", "google/gemini-3-flash-preview");
}

/** USD per 1M tokens (OpenRouter list prices 2026-11-16) — only used to estimate cost when the provider doesn't report it. */
const PRICES: Record<string, { in: number; out: number }> = {
  "google/gemini-3.1-flash-lite-preview": { in: 0.25, out: 1.5 },
  "google/gemini-3-flash-preview": { in: 0.5, out: 3.0 },
};

export function llmConfigured(): boolean {
  return Boolean(env("OPENROUTER_API_KEY"));
}

let dispatcher: Dispatcher | undefined;
const getDispatcher = () => {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!proxy) return undefined;
  dispatcher ??= new ProxyAgent({ uri: proxy, bodyTimeout: config.llmTimeoutMs, headersTimeout: config.llmTimeoutMs });
  return dispatcher;
};

class ProviderError extends Error {
  constructor(message: string, public status: number, public retryAfterSec?: number) {
    super(message);
  }
}

// ---------------------------------------------------------------- providers

async function callOpenRouter(args: {
  model: string;
  messages: { role: "user" | "assistant"; content: string }[];
  jsonSchema?: Record<string, unknown>;
  schemaName: string;
  maxTokens: number;
  /** thinking budget — counts against max_tokens on Gemini, so it is capped explicitly */
  reasoningTokens: number;
}): Promise<RawCompletion> {
  const send = async (format: "json_schema" | "json_object"): Promise<RawCompletion> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), config.llmTimeoutMs);
    try {
      const res = await undiciFetch(`${env("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")}/chat/completions`, {
        method: "POST",
        signal: ctrl.signal,
        dispatcher: getDispatcher(),
        headers: { authorization: `Bearer ${env("OPENROUTER_API_KEY")}`, "content-type": "application/json", "x-title": "Shapect Website Intelligence" },
        body: JSON.stringify({
          model: args.model,
          messages: args.messages,
          max_tokens: args.maxTokens + args.reasoningTokens,
          temperature: 0,
          usage: { include: true },
          reasoning: { max_tokens: args.reasoningTokens, exclude: true },
          // only providers that honour the requested parameters (no silent downgrade)
          provider: { require_parameters: true, allow_fallbacks: true },
          response_format: format === "json_schema" && args.jsonSchema
            ? { type: "json_schema", json_schema: { name: args.schemaName, strict: false, schema: args.jsonSchema } }
            : { type: "json_object" },
        }),
      });
      const retryAfter = Number(res.headers.get("retry-after")) || undefined;
      const body = (await res.json().catch(() => ({}))) as Record<string, any>;
      if (!res.ok || body.error) {
        const msg = String(body.error?.message ?? `HTTP ${res.status}`).slice(0, 240);
        throw new ProviderError(`OpenRouter: ${msg}`, Number(body.error?.code) || res.status, retryAfter);
      }
      const choice = body.choices?.[0];
      const u = body.usage ?? {};
      return {
        truncated: choice?.finish_reason === "length" || choice?.native_finish_reason === "MAX_TOKENS",
        text: String(choice?.message?.content ?? ""),
        model: body.model,
        provider: body.provider ? `openrouter/${body.provider}` : "openrouter",
        inputTokens: u.prompt_tokens,
        outputTokens: u.completion_tokens,
        reasoningTokens: u.completion_tokens_details?.reasoning_tokens,
        cachedInputTokens: u.prompt_tokens_details?.cached_tokens,
        costUsd: typeof u.cost === "number" ? u.cost : undefined,
        structuredOutput: format,
      };
    } finally {
      clearTimeout(timer);
    }
  };
  if (!args.jsonSchema) return send("json_object");
  try {
    return await send("json_schema");
  } catch (e) {
    // Same model, simpler JSON mode — only when the schema itself was rejected. Never another model.
    if (e instanceof ProviderError && e.status === 400 && /schema|response_format|json/i.test(e.message)) return send("json_object");
    throw e;
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
async function writeCache(key: string, r: RawCompletion) {
  await fs.mkdir(cacheDir(), { recursive: true });
  await fs.writeFile(path.join(cacheDir(), `${key}.json`), JSON.stringify(r));
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

/** JSON schema for the provider (input shape of the lenient Zod schema). */
function providerSchema(schema: z.ZodType): Record<string, unknown> | undefined {
  try {
    const js = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
    delete js.$schema;
    return JSON.stringify(js).length < 30_000 ? js : undefined;
  } catch {
    return undefined;
  }
}

export interface CompleteOptions<T> {
  stage: LlmStage;
  task: string;
  prompt: string;
  schema: z.ZodType<T>;
  schemaVersion?: string;
  usage: LlmUsage;
  promptVersion: string;
  maxOutputTokens?: number;
  /** called when the provider is busy and we wait before retrying */
  onWait?: (seconds: number) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One structured call: cache → provider (stage model) → JSON
 * → Zod validation → at most one repair with the concrete errors (same model).
 * Throws so the pipeline can return a partial result.
 */
export async function completeJson<T>(o: CompleteOptions<T>): Promise<T> {
  if (!llmConfigured()) throw new Error("LLM is not configured (OPENROUTER_API_KEY missing)");
  const provider = "openrouter";
  const model = modelFor(o.stage);
  o.usage.models[o.stage] = model;
  const schemaVersion = o.schemaVersion ?? "v2";
  const maxOut = o.maxOutputTokens ?? (o.stage === "strategy" ? 10_000 : 7_000);
  // Large nested schemas make Gemini's constrained decoding cut corners (empty arrays), so the
  // strategy uses JSON mode + Zod validation; the compact understanding schema uses json_schema.
  const jsonSchema = o.stage === "understanding" ? providerSchema(o.schema) : undefined;
  const key = crypto.createHash("sha256").update(`${o.promptVersion}\n${provider}\n${model}\n${schemaVersion}\n${jsonSchema ? "json_schema" : "json_object"}\n${o.prompt}`).digest("hex").slice(0, 40);

  const record = (r: RawCompletion | null, extra: Partial<LlmCallRecord>): LlmCallRecord => {
    const estIn = Math.ceil((extra.inputBytes ?? 0) / 4), estOut = Math.ceil((extra.outputBytes ?? 0) / 4);
    const real = r?.inputTokens != null && r?.outputTokens != null;
    const price = PRICES[model];
    const cost = r?.costUsd ?? (real && price ? (r!.inputTokens! * price.in + r!.outputTokens! * price.out) / 1e6 : null);
    const rec: LlmCallRecord = {
      stage: o.stage, task: o.task, provider: r?.provider ?? provider, model: r?.model ?? model, promptVersion: o.promptVersion, schemaVersion,
      inputTokens: real ? r!.inputTokens! : estIn, outputTokens: real ? r!.outputTokens! : estOut,
      reasoningTokens: r?.reasoningTokens ?? null, cachedInputTokens: r?.cachedInputTokens ?? null,
      costUsd: cost, estimated: !real, inputBytes: 0, outputBytes: 0, latencyMs: 0, cacheHit: false, retries: 0, valid: false,
      structuredOutput: r?.structuredOutput ?? "none", ...extra,
    };
    o.usage.log.push(rec);
    return rec;
  };

  const callOnce = async (messages: { role: "user" | "assistant"; content: string }[], cacheKey: string | null): Promise<{ r: RawCompletion; rec: LlmCallRecord }> => {
    const inputBytes = messages.reduce((n, m) => n + Buffer.byteLength(m.content), 0);
    if (cacheKey) {
      const hit = await cached(cacheKey);
      if (hit) {
        o.usage.cacheHits++;
        const rec = record(hit, { inputBytes, outputBytes: Buffer.byteLength(hit.text), cacheHit: true, costUsd: 0 });
        return { r: hit, rec };
      }
    }
    o.usage.calls++;
    const t0 = Date.now();
    let retries = 0;
    let r: RawCompletion;
    for (;;) {
      try {
        r = await callOpenRouter({ model, messages, jsonSchema, schemaName: o.task.replace(/[^a-z0-9_]/gi, "_"), maxTokens: maxOut, reasoningTokens: o.stage === "strategy" ? 2500 : 800 });
        break;
      } catch (e) {
        const pe = e as ProviderError;
        const transient = pe.status === 429 || pe.status === 502 || pe.status === 503 || pe.status === 504 || /ECONNRESET|socket|timeout|abort/i.test(pe.message ?? "");
        if (!transient || retries >= 3) {
          record(null, { inputBytes, latencyMs: Date.now() - t0, retries, valid: false, estimated: true, costUsd: null, inputTokens: null, outputTokens: null });
          o.usage.failures.push(`${o.task}: ${pe.message ?? "provider error"}`);
          throw e;
        }
        retries++;
        o.usage.failures.push(`${o.task}: provider busy (${pe.status ?? "network"}), retry ${retries}`);
        const base = pe.retryAfterSec ? pe.retryAfterSec * 1000 : [5_000, 15_000, 30_000][retries - 1];
        const wait = Math.min(45_000, base) + Math.floor(Math.random() * 1500);
        o.onWait?.(Math.round(wait / 1000));
        await sleep(wait);
      }
    }
    const latencyMs = Date.now() - t0;
    o.usage.durationMs += latencyMs;
    o.usage.inputChars += inputBytes;
    o.usage.outputChars += r.text.length;
    const rec = record(r, { inputBytes, outputBytes: Buffer.byteLength(r.text), latencyMs, retries });
    o.usage.inputTokens += rec.inputTokens ?? 0;
    o.usage.outputTokens += rec.outputTokens ?? 0;
    o.usage.reasoningTokens += rec.reasoningTokens ?? 0;
    if (rec.estimated) o.usage.tokensEstimated = true;
    if (rec.costUsd == null) o.usage.costKnown = false;
    else o.usage.costUsd += rec.costUsd;
    o.usage.model = rec.model;
    o.usage.provider = rec.provider;
    return { r, rec };
  };

  const validate = (text: string): { ok: true; data: T } | { ok: false; errors: string } => {
    try {
      const v = o.schema.safeParse(extractJson(text));
      if (v.success) return { ok: true, data: v.data };
      return { ok: false, errors: v.error.issues.slice(0, 12).map((i) => `${i.path.join(".")}: ${i.message}`).join("\n") };
    } catch (e) {
      return { ok: false, errors: (e as Error).message };
    }
  };

  const first = await callOnce([{ role: "user", content: o.prompt }], key);
  const v1 = validate(first.r.text);
  if (v1.ok) {
    first.rec.valid = true;
    if (!first.rec.cacheHit) await writeCache(key, first.r);
    return v1.data;
  }
  o.usage.failures.push(`${o.task}: first answer invalid`);
  (o.usage.rejected ??= []).push({ task: o.task, errors: v1.errors, text: first.r.text.slice(0, 20000) });
  // one targeted repair, same model
  const second = await callOnce(first.r.truncated || /Unterminated|No JSON/i.test(v1.errors)
    ? [{ role: "user", content: `${o.prompt}\n\nIMPORTANT: your previous answer was cut off. Return a COMPLETE JSON object: be concise — short texts, at most 8 opportunities, at most 3 entries, at most 6 questions each.` }]
    : [
      { role: "user", content: o.prompt },
      { role: "assistant", content: first.r.text.slice(0, 40_000) },
      { role: "user", content: `Your JSON did not match the required schema. Fix ONLY these problems and return the complete corrected JSON object:\n${v1.errors}` },
    ], null);
  const v2 = validate(second.r.text);
  if (!v2.ok) {
    o.usage.failures.push(`${o.task}: repair failed`);
    o.usage.rejected!.push({ task: `${o.task}-repair`, errors: v2.errors, text: second.r.text.slice(0, 20000) });
    throw new Error(`${o.task}: model output did not match the schema`);
  }
  second.rec.valid = true;
  await writeCache(key, second.r);
  return v2.data;
}
