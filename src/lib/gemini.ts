import { GoogleGenAI } from "@google/genai";
import { safeJsonParse } from "./utils";
import { groqGenerate, isGroqAvailable } from "./groq";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  // We don't throw at import time so the app can still render the landing page
  // without a key (useful for previewing the static site). Routes will throw.
  // eslint-disable-next-line no-console
  console.warn(
    "[skillforge] GEMINI_API_KEY is not set. API routes will fail until you add it to .env.local",
  );
}

export const ai = new GoogleGenAI({ apiKey: apiKey ?? "missing" });

export const Models = {
  // Routine: extraction, per-turn question/grading, resource curation
  flash: "gemini-2.5-flash",
  // Heavy reasoning: scoring synthesis, adjacency analysis, plan generation
  pro: "gemini-2.5-pro",
  // High-volume fallback (15 RPM, 1000 RPD)
  flashLite: "gemini-2.5-flash-lite",
} as const;

export type ModelName = (typeof Models)[keyof typeof Models];

type GenOpts = {
  model: ModelName;
  prompt: string;
  systemInstruction?: string;
  json?: boolean;
  /** Pass an OpenAPI/JSON schema for strict structured output */
  responseSchema?: Record<string, unknown>;
  /** Enable Google Search grounding (Flash family only on free tier) */
  googleSearch?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  thinkingBudget?: number;
};

export type GenResult<T = unknown> = {
  text: string;
  json: T | null;
  groundingMetadata?: GroundingMetadata;
  raw: unknown;
};

export type GroundingMetadata = {
  webSearchQueries?: string[];
  groundingChunks?: Array<{
    web?: { uri: string; title: string };
  }>;
  groundingSupports?: Array<{
    segment?: { startIndex?: number; endIndex?: number; text?: string };
    groundingChunkIndices?: number[];
  }>;
};

/**
 * Single Gemini call with structured-output and grounding helpers.
 * Retries once on transient errors.
 */
export async function generate<T = unknown>(opts: GenOpts): Promise<GenResult<T>> {
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY missing. Add it to .env.local — get one at https://aistudio.google.com/apikey",
    );
  }

  const config: Record<string, unknown> = {
    temperature: opts.temperature ?? 0.4,
    maxOutputTokens: opts.maxOutputTokens ?? 2048,
  };

  if (opts.systemInstruction) {
    config.systemInstruction = opts.systemInstruction;
  }

  if (opts.json) {
    config.responseMimeType = "application/json";
    if (opts.responseSchema) {
      config.responseSchema = opts.responseSchema;
    }
  }

  if (opts.googleSearch) {
    // Cannot combine googleSearch + JSON mime type per Gemini API constraints
    // The caller is responsible for asking for JSON in the prompt itself.
    config.tools = [{ googleSearch: {} }];
    delete config.responseMimeType;
    delete config.responseSchema;
  }

  if (typeof opts.thinkingBudget === "number") {
    config.thinkingConfig = { thinkingBudget: opts.thinkingBudget };
  } else if (opts.json) {
    // Gemini 2.5 has "thinking" on by default. For routine JSON-schema calls
    // (extract, per-turn assess, grading) the schema enforces structure so we
    // don't need extended thinking — and thinking tokens otherwise eat into
    // maxOutputTokens, often producing empty/truncated responses ("model
    // returned non-JSON" 502s). Heavy-reasoning callers (plan synthesis on Pro)
    // pass their own thinkingBudget explicitly and override this default.
    config.thinkingConfig = { thinkingBudget: 0 };
  }

  const callOnce = async () => {
    return await ai.models.generateContent({
      model: opts.model,
      contents: opts.prompt,
      config,
    });
  };

  let response;
  try {
    response = await callOnce();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isQuota = /429|RESOURCE_EXHAUSTED|UNAVAILABLE|deadline/i.test(msg);
    if (!isQuota) throw err;

    // Groq fallback for non-grounded calls. Gemini's free-tier daily quotas
    // are tight (flash 20 RPD, pro 0); Groq's Llama 3.3 70B serves ~14k RPD
    // with native JSON mode, so the demo never goes dark mid-flow.
    // Grounded calls (googleSearch) cannot fall back here — Groq has no
    // web-search tool — so we let those propagate to the per-route static
    // fallback (e.g. fallback-resources.ts).
    if (!opts.googleSearch && isGroqAvailable()) {
      // eslint-disable-next-line no-console
      console.warn("[skillforge] Gemini quota hit, falling back to Groq Llama 3.3 70B");
      // Groq's json_object mode produces valid JSON but doesn't enforce a
      // schema like Gemini's responseSchema does, so optional-looking fields
      // (jd_summary, resume_summary, etc.) get dropped silently and crash
      // downstream consumers. Injecting the schema into the prompt forces
      // Llama to emit every required field.
      const schemaHint = opts.responseSchema
        ? `\n\nReturn ONLY a JSON object that exactly matches this schema (every required field MUST be present, never null/undefined):\n${JSON.stringify(opts.responseSchema)}`
        : "";
      const groq = await groqGenerate<T>({
        prompt: opts.prompt + schemaHint,
        systemInstruction: opts.systemInstruction,
        json: opts.json,
        temperature: opts.temperature,
        maxOutputTokens: opts.maxOutputTokens,
      });
      return { text: groq.text, json: groq.json, raw: groq.raw };
    }

    // No fallback path — single in-process retry then surface the error.
    await new Promise((r) => setTimeout(r, 1500));
    response = await callOnce();
  }

  const text = (response.text ?? "").trim();
  const json = opts.json ? safeJsonParse<T>(text) : null;

  // Grounding metadata extraction (best-effort, shape varies between SDK versions)
  let groundingMetadata: GroundingMetadata | undefined;
  const candidates = (response as unknown as { candidates?: Array<Record<string, unknown>> })
    .candidates;
  if (candidates && candidates[0]?.groundingMetadata) {
    groundingMetadata = candidates[0].groundingMetadata as GroundingMetadata;
  }

  return { text, json, groundingMetadata, raw: response };
}

/** Quick helper for grounded calls that just want the text + cited URLs */
export function extractCitations(meta: GroundingMetadata | undefined): Array<{
  uri: string;
  title: string;
}> {
  if (!meta?.groundingChunks) return [];
  return meta.groundingChunks
    .map((c) => c.web)
    .filter((w): w is { uri: string; title: string } => Boolean(w?.uri));
}
