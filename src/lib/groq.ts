import { safeJsonParse } from "./utils";

/**
 * Groq fallback for non-grounded LLM calls.
 *
 * Why: Gemini 2.5 Flash on a fresh GCP free-tier project is capped at 20 RPD,
 * and Pro is limit:0. Groq's free tier serves Llama 3.3 70B at ~14k RPD with
 * native JSON mode — plenty for an entire demo day. We use it automatically
 * whenever Gemini 429s on non-grounded routes (extract, assess, plan synthesis).
 *
 * Limitation: Groq has no web-search tool, so `/api/resources` (googleSearch
 * grounding) cannot fall back here — it falls back to the static catalog
 * in `fallback-resources.ts` instead.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export const GroqModels = {
  // Llama 3.3 70B — best quality on Groq free tier, native JSON mode.
  large: "llama-3.3-70b-versatile",
  // Faster/cheaper if we ever need it.
  fast: "llama-3.1-8b-instant",
} as const;

type GroqOpts = {
  prompt: string;
  systemInstruction?: string;
  json?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  model?: string;
};

export type GroqResult<T = unknown> = {
  text: string;
  json: T | null;
  raw: unknown;
};

export function isGroqAvailable(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

export async function groqGenerate<T = unknown>(opts: GroqOpts): Promise<GroqResult<T>> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY missing");

  const messages: Array<{ role: string; content: string }> = [];
  if (opts.systemInstruction) {
    messages.push({ role: "system", content: opts.systemInstruction });
  }
  messages.push({ role: "user", content: opts.prompt });

  const body: Record<string, unknown> = {
    model: opts.model ?? GroqModels.large,
    messages,
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.maxOutputTokens ?? 2048,
  };
  if (opts.json) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq ${res.status}: ${err.slice(0, 300)}`);
  }

  const raw = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = (raw.choices?.[0]?.message?.content ?? "").trim();
  const json = opts.json ? safeJsonParse<T>(text) : null;
  return { text, json, raw };
}
