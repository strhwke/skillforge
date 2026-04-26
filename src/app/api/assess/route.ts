import { NextRequest, NextResponse } from "next/server";
import { generate, Models } from "@/lib/gemini";
import { ASSESS_SCHEMA, ASSESS_SYSTEM, assessPrompt } from "@/lib/prompts/assess";
import type { AssessmentTurn, Skill } from "@/lib/types";
import type { BloomLevel } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

type ReqBody = {
  skill: Skill;
  jdContext: string;
  resumeSummary: string;
  selfRating: number;
  priorTurns: AssessmentTurn[];
  latestUserAnswer?: string;
};

type AssessResponse = {
  grading_of_previous?: {
    bloom_level_demonstrated: BloomLevel;
    score: number;
    evidence: string;
    follow_up_suggestion: "drill_down" | "level_up" | "stop";
  };
  next_question?: string;
  target_bloom?: BloomLevel;
  rationale_internal?: string;
  is_final: boolean;
  final_score?: number;
  final_bloom?: BloomLevel;
  evidence_quotes?: string[];
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ReqBody;
    if (!body?.skill?.name) {
      return NextResponse.json({ error: "skill is required" }, { status: 400 });
    }

    const result = await generate<AssessResponse>({
      // High-volume path: ~12 calls per session. Use flash-lite to stay
      // inside the per-day free quota (Flash is reserved for extract + plan).
      model: Models.flashLite,
      systemInstruction: ASSESS_SYSTEM,
      prompt: assessPrompt({
        skill: body.skill,
        jdContext: body.jdContext ?? "",
        resumeSummary: body.resumeSummary ?? "",
        selfRating: body.selfRating ?? 3,
        priorTurns: body.priorTurns ?? [],
        latestUserAnswer: body.latestUserAnswer,
      }),
      json: true,
      responseSchema: ASSESS_SCHEMA as unknown as Record<string, unknown>,
      temperature: 0.5,
      maxOutputTokens: 1024,
    });

    if (!result.json) {
      return NextResponse.json(
        { error: "model returned non-JSON", raw: result.text.slice(0, 400) },
        { status: 502 },
      );
    }

    // Safety net: when the model declares is_final=true but skips the final_*
    // fields, derive them deterministically from prior turns + the latest
    // grading so the client never has to render `undefined/100`.
    const out = result.json;
    if (out.is_final) {
      const allTurns = [...(body.priorTurns ?? [])];
      // Append the just-completed turn (using grading_of_previous) for scoring
      const justGraded = out.grading_of_previous;
      const lastQuestion =
        body.priorTurns && body.priorTurns.length > 0
          ? body.priorTurns[body.priorTurns.length - 1]
          : undefined;
      void lastQuestion;
      if (justGraded && body.latestUserAnswer) {
        allTurns.push({
          turn_index: allTurns.length,
          question: "(latest)",
          target_bloom: justGraded.bloom_level_demonstrated,
          user_answer: body.latestUserAnswer,
          graded: justGraded,
        });
      }
      const graded = allTurns.filter((t) => t.graded);
      if (graded.length > 0) {
        const lastTwo = graded.slice(-2).map((t) => t.graded!.score);
        const meanAll = graded.reduce((s, t) => s + t.graded!.score, 0) / graded.length;
        const derivedScore = Math.round(Math.max(...lastTwo) * 0.7 + meanAll * 0.3);
        const lastBloom = graded[graded.length - 1].graded!.bloom_level_demonstrated;
        if (typeof out.final_score !== "number") out.final_score = derivedScore;
        if (!out.final_bloom) out.final_bloom = lastBloom;
        if (!out.evidence_quotes || out.evidence_quotes.length === 0) {
          out.evidence_quotes = graded
            .map((t) => t.graded!.evidence)
            .filter(Boolean)
            .slice(-3);
        }
      } else {
        // Pathological: is_final=true with zero grades. Skipped/empty interview.
        if (typeof out.final_score !== "number") out.final_score = 0;
        if (!out.final_bloom) out.final_bloom = "Remember";
        if (!out.evidence_quotes) out.evidence_quotes = [];
      }
    }

    return NextResponse.json(out);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/assess]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
