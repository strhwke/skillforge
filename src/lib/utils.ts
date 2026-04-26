import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function clamp(n: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, n));
}

export function pctToBloom(pct: number): BloomLevel {
  if (pct <= 20) return "Remember";
  if (pct <= 40) return "Understand";
  if (pct <= 60) return "Apply";
  if (pct <= 75) return "Analyze";
  if (pct <= 90) return "Evaluate";
  return "Create";
}

export function bloomToPct(b: BloomLevel): number {
  return BLOOM_CENTER_PCT[b];
}

export const BLOOM_LEVELS = [
  "Remember",
  "Understand",
  "Apply",
  "Analyze",
  "Evaluate",
  "Create",
] as const;

export type BloomLevel = (typeof BLOOM_LEVELS)[number];

const BLOOM_CENTER_PCT: Record<BloomLevel, number> = {
  Remember: 10,
  Understand: 30,
  Apply: 50,
  Analyze: 68,
  Evaluate: 83,
  Create: 95,
};

export function selfRatingToPct(rating1to5: number): number {
  // 1->10, 2->30, 3->50, 4->70, 5->90 (centers of bands)
  const map = [10, 30, 50, 70, 90];
  return map[clamp(rating1to5, 1, 5) - 1];
}

export function severityFromScore(
  verifiedPct: number,
  jdRequired: boolean,
  jdWeight: 0 | 1 | 2 | 3,
): "critical" | "major" | "minor" | "strength" | "ok" {
  if (!jdRequired) return verifiedPct >= 60 ? "ok" : "ok";
  if (verifiedPct < 40 && jdWeight >= 2) return "critical";
  if (verifiedPct < 60) return "major";
  if (verifiedPct < 75) return "minor";
  return "strength";
}

export function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    // attempt to extract first {...} or [...] block
    const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (!match) return null;
    try {
      return JSON.parse(match[1]) as T;
    } catch {
      return null;
    }
  }
}
