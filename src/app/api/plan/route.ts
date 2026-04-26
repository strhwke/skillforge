import { NextRequest, NextResponse } from "next/server";
import { extractCitations, generate, Models } from "@/lib/gemini";
import { PLAN_SCHEMA, PLAN_SYSTEM, planPrompt, RESOURCE_SYSTEM, resourcePrompt } from "@/lib/prompts/plan";
import { getFallbackResources } from "@/lib/fallback-resources";
import { safeJsonParse } from "@/lib/utils";
import type {
  ExtractedContext,
  LearningPlan,
  LearningPlanItem,
  ResourceItem,
  SkillScore,
} from "@/lib/types";
import type { BloomLevel } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

type ReqBody = {
  context: ExtractedContext;
  scores: SkillScore[];
};

type PlanItemFromModel = {
  skill: string;
  adjacency: number;
  adjacency_rationale: string;
  bloom_target: BloomLevel;
  hours_estimate: number;
  week_window: string;
  plan_order_priority: number;
};

type PlanFromModel = {
  summary_narrative: string;
  items: PlanItemFromModel[];
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ReqBody;
    if (!body?.scores?.length || !body?.context) {
      return NextResponse.json({ error: "scores + context required" }, { status: 400 });
    }

    const strengths = body.scores
      .filter((s) => s.verified_pct >= 70)
      .sort((a, b) => b.verified_pct - a.verified_pct)
      .slice(0, 6)
      .map((s) => ({ name: s.name, verified: s.verified_pct, bloom: s.bloom_level }));

    const gaps = body.scores
      .filter((s) => s.severity === "critical" || s.severity === "major" || s.severity === "minor")
      .sort((a, b) => b.jd_weight - a.jd_weight || a.verified_pct - b.verified_pct)
      .slice(0, 8)
      .map((s) => ({
        name: s.name,
        jd_weight: s.jd_weight,
        verified: s.verified_pct,
        bloom: s.bloom_level,
      }));

    if (gaps.length === 0) {
      // No gaps — produce a celebration plan
      return NextResponse.json({
        total_hours: 0,
        weeks: 0,
        items: [],
        summary_narrative:
          "Your verified profile already meets or exceeds every key requirement in the JD. Focus on the nice-to-have edges and depth in your strongest skills.",
      } satisfies LearningPlan);
    }

    // Step 1: Pro plan synthesis (one call, all gaps)
    const planResult = await generate<PlanFromModel>({
      model: Models.pro,
      systemInstruction: PLAN_SYSTEM,
      prompt: planPrompt({
        jdSummary: body.context.jd_summary,
        jobTitle: body.context.job_title,
        resumeSummary: body.context.resume_summary,
        strengths,
        gaps,
      }),
      json: true,
      responseSchema: PLAN_SCHEMA as unknown as Record<string, unknown>,
      temperature: 0.3,
      maxOutputTokens: 4096,
      thinkingBudget: 1024,
    });

    if (!planResult.json) {
      return NextResponse.json(
        { error: "Plan synthesis returned non-JSON", raw: planResult.text.slice(0, 400) },
        { status: 502 },
      );
    }

    const planRaw = planResult.json;
    const candidateStrengthNames = strengths.map((s) => s.name);

    // Step 2: For each plan item (cap to 6 to stay safe on rate limits), grounded resource curation in parallel
    const itemsForResources = planRaw.items
      .sort((a, b) => a.plan_order_priority - b.plan_order_priority)
      .slice(0, 6);

    const enriched: LearningPlanItem[] = await Promise.all(
      itemsForResources.map(async (item) => {
        const matchingScore = body.scores.find((s) => s.name === item.skill);
        const currentBloom = matchingScore?.bloom_level ?? "Remember";
        const currentPct = matchingScore?.verified_pct ?? 0;
        const targetPct = bloomTargetToPct(item.bloom_target);
        const resources = await curateResources({
          skill: item.skill,
          currentBloom,
          targetBloom: item.bloom_target,
          candidateStrengths: candidateStrengthNames,
          jobContext: body.context.job_title + " — " + body.context.jd_summary.slice(0, 240),
        });
        return {
          skill: item.skill,
          current_pct: currentPct,
          target_pct: targetPct,
          bloom_target: item.bloom_target,
          adjacency: item.adjacency,
          adjacency_rationale: item.adjacency_rationale,
          hours_estimate: item.hours_estimate,
          week_window: item.week_window,
          resources,
        };
      }),
    );

    const totalHours = enriched.reduce((s, i) => s + i.hours_estimate, 0);
    const weeks = estimateWeeks(enriched);

    const finalPlan: LearningPlan = {
      total_hours: totalHours,
      weeks,
      items: enriched,
      summary_narrative: planRaw.summary_narrative,
    };

    return NextResponse.json(finalPlan);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/plan]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function bloomTargetToPct(b: BloomLevel): number {
  const map: Record<BloomLevel, number> = {
    Remember: 20,
    Understand: 40,
    Apply: 60,
    Analyze: 75,
    Evaluate: 88,
    Create: 96,
  };
  return map[b];
}

function estimateWeeks(items: LearningPlanItem[]): number {
  // Assume 8 hours/week of learning effort. Round up to nearest week.
  const total = items.reduce((s, i) => s + i.hours_estimate, 0);
  return Math.max(1, Math.ceil(total / 8));
}

async function curateResources(args: {
  skill: string;
  currentBloom: BloomLevel;
  targetBloom: BloomLevel;
  candidateStrengths: string[];
  jobContext: string;
}): Promise<ResourceItem[]> {
  try {
    const result = await generate<ResourceItem[]>({
      model: Models.flash,
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
      maxOutputTokens: 2048,
    });

    // The response text should be a JSON array; grounded mode disables responseMimeType
    const parsed = safeJsonParse<ResourceItem[]>(result.text);
    if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
      return getFallbackResources(args.skill);
    }

    // Mark as cited if we got grounding metadata back
    const citations = extractCitations(result.groundingMetadata);
    const citedUrls = new Set(citations.map((c) => c.uri));

    return parsed
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
  } catch (err) {
    console.warn(`[plan] resource curation failed for ${args.skill}:`, err);
    return getFallbackResources(args.skill);
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
