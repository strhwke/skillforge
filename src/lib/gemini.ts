import { GoogleGenAI } from "@google/genai";
import { safeJsonParse } from "./utils";

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
    // retry once on rate-limit / transient
    if (/429|RESOURCE_EXHAUSTED|UNAVAILABLE|deadline/i.test(msg)) {
      await new Promise((r) => setTimeout(r, 1500));
      response = await callOnce();
    } else {
      throw err;
    }
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
