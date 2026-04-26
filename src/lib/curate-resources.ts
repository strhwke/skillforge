import { extractCitations, generate, Models } from "./gemini";
import { RESOURCE_SYSTEM, resourcePrompt } from "./prompts/plan";
import { getFallbackResources } from "./fallback-resources";
import { safeJsonParse } from "./utils";
import type { ResourceItem } from "./types";
import type { BloomLevel } from "./utils";

export async function curateResources(args: {
  skill: string;
  currentBloom: BloomLevel;
  targetBloom: BloomLevel;
  candidateStrengths: string[];
  jobContext: string;
}): Promise<{ resources: ResourceItem[]; usedFallback: boolean }> {
  try {
    const result = await generate<ResourceItem[]>({
      // High-volume path: ~6 grounded calls per plan. Use flash-lite to
      // preserve the lower flash quota for plan synthesis + extraction.
      model: Models.flashLite,
      systemInstruction: RESOURCE_SYSTEM,
      prompt: resourcePrompt({
        skill: args.skill,
        currentBloom: args.currentBloom,
        targetBloom: args.targetBloom,
        candidateStrengths: args.candidateStrengths,
        jobContext: args.jobContext,
      }),
      googleSearch: true,
      temperature: 0.3,
      maxOutputTokens: 1024,
    });

    const parsed = safeJsonParse<ResourceItem[]>(result.text);
    if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
      return { resources: getFallbackResources(args.skill), usedFallback: true };
    }

    const citations = extractCitations(result.groundingMetadata);
    const citedUrls = new Set(citations.map((c) => c.uri));

    const resources = parsed
      .filter(
        (r): r is ResourceItem =>
          !!r && typeof r.url === "string" && /^https?:\/\//i.test(r.url) && !!r.title,
      )
      .slice(0, 4)
      .map((r) => ({
        ...r,
        cited: citedUrls.has(r.url) || citations.length > 0,
        is_free: typeof r.is_free === "boolean" ? r.is_free : true,
        hours_estimate: clampHours(r.hours_estimate),
        provider: r.provider || hostnameOf(r.url),
        type: normalizeResourceType(r.type),
      }));

    if (resources.length === 0) {
      return { resources: getFallbackResources(args.skill), usedFallback: true };
    }
    return { resources, usedFallback: false };
  } catch (err) {
    console.warn(`[resources] curation failed for ${args.skill}:`, err);
    return { resources: getFallbackResources(args.skill), usedFallback: true };
  }
}

function clampHours(n: unknown): number {
  const x = typeof n === "number" ? n : parseFloat(String(n ?? "10"));
  if (!Number.isFinite(x)) return 10;
  return Math.max(2, Math.min(80, Math.round(x)));
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "web";
  }
}

function normalizeResourceType(t: unknown): ResourceItem["type"] {
  const s = String(t ?? "").toLowerCase();
  if (s.includes("book")) return "book";
  if (s.includes("course")) return "course";
  if (s.includes("project")) return "project";
  if (s.includes("ref") || s.includes("doc")) return "reference";
  return "tutorial";
}
