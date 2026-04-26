import { NextRequest, NextResponse } from "next/server";
import { generate, Models } from "@/lib/gemini";
import { PLAN_SCHEMA, PLAN_SYSTEM, planPrompt } from "@/lib/prompts/plan";
import type {
  ExtractedContext,
  LearningPlan,
  LearningPlanItem,
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

    // Step 1: plan synthesis (one call, all gaps).
    // We use Flash + a large thinking budget instead of Pro: Gemini 2.5 Pro
    // is not available on the free tier (quota limit: 0). Flash with thinking
    // hits the same quality bar for structured-output reasoning and keeps the
    // whole app on the free tier.
    const planResult = await generate<PlanFromModel>({
      model: Models.flash,
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
      maxOutputTokens: 8192,
      thinkingBudget: 4096,
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

    // /api/plan only does the plan synthesis. Resource curation is split off
    // to /api/resources (one skill per call) so the client can fetch them
    // sequentially with progressive UI updates. This keeps each route under
    // the 60s Vercel hobby timeout AND lets us pace requests so we stay under
    // Gemini 2.5 Flash's ~20-RPM free-tier ceiling without parallel collisions.
    const enriched: LearningPlanItem[] = itemsForResources.map((item) => {
      const matchingScore = body.scores.find((s) => s.name === item.skill);
      const currentPct = matchingScore?.verified_pct ?? 0;
      const targetPct = bloomTargetToPct(item.bloom_target);
      return {
        skill: item.skill,
        current_pct: currentPct,
        target_pct: targetPct,
        bloom_target: item.bloom_target,
        adjacency: item.adjacency,
        adjacency_rationale: item.adjacency_rationale,
        hours_estimate: item.hours_estimate,
        week_window: item.week_window,
        resources: [],
      };
    });

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
  const total = items.reduce((s, i) => s + i.hours_estimate, 0);
  return Math.max(1, Math.ceil(total / 8));
}
