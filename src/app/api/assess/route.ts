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
      model: Models.flash,
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

    return NextResponse.json(result.json);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/assess]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
