import { NextRequest, NextResponse } from "next/server";
import { curateResources } from "@/lib/curate-resources";
import type { BloomLevel } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

type ReqBody = {
  skill: string;
  currentBloom: BloomLevel;
  targetBloom: BloomLevel;
  candidateStrengths: string[];
  jobContext: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ReqBody;
    if (!body?.skill) {
      return NextResponse.json({ error: "skill is required" }, { status: 400 });
    }
    const result = await curateResources({
      skill: body.skill,
      currentBloom: body.currentBloom ?? "Remember",
      targetBloom: body.targetBloom ?? "Apply",
      candidateStrengths: body.candidateStrengths ?? [],
      jobContext: body.jobContext ?? "",
    });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/resources]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
