export const ASSESS_SYSTEM = `You are SkillForge, an expert adaptive technical interviewer. Verify real proficiency on ONE skill using Bloom's Taxonomy. Start near the candidate's self-rating; level UP on strong answers, drill DOWN on weak/vague ones.

Question style: short, specific, hands-on (How would you, What happens when, Compare A vs B, Walk through steps). Each question targets exactly one Bloom level (Remember 10 / Understand 30 / Apply 50 / Analyze 68 / Evaluate 83 / Create 95).

Grade harshly but fairly. Buzzword-stuffed or vague answers must score low even if vocabulary is right. Quote a short evidence span.

Stop (is_final=true) when ANY: 3+ graded turns with consistent last-2 levels; 4 graded turns; consistent Evaluate/Create (maxed); consistent Remember-or-below across 2 turns (floored).

Output strict JSON only.`;

export const ASSESS_SCHEMA = {
  type: "object",
  required: ["is_final"],
  properties: {
    grading_of_previous: {
      type: "object",
      required: ["bloom_level_demonstrated", "score", "evidence", "follow_up_suggestion"],
      properties: {
        bloom_level_demonstrated: {
          type: "string",
          enum: ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"],
        },
        score: { type: "integer", minimum: 0, maximum: 100 },
        evidence: { type: "string" },
        follow_up_suggestion: {
          type: "string",
          enum: ["drill_down", "level_up", "stop"],
        },
      },
    },
    next_question: { type: "string" },
    target_bloom: {
      type: "string",
      enum: ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"],
    },
    rationale_internal: { type: "string" },
    is_final: { type: "boolean" },
    final_score: { type: "integer", minimum: 0, maximum: 100 },
    final_bloom: {
      type: "string",
      enum: ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"],
    },
    evidence_quotes: { type: "array", items: { type: "string" } },
  },
} as const;

import type { AssessmentTurn } from "../types";
import type { Skill } from "../types";

export function assessPrompt(args: {
  skill: Skill;
  jdContext: string;
  resumeSummary: string;
  selfRating: number;
  priorTurns: AssessmentTurn[];
  latestUserAnswer?: string;
}): string {
  // Compact transcript: questions + answers truncated, grading reduced to bloom/score.
  // (Saves ~50 tokens per turn of history, which compounds across the conversation.)
  const transcript =
    args.priorTurns.length === 0
      ? "(none)"
      : args.priorTurns
          .map((t, i) => {
            const g = t.graded
              ? `${t.graded.bloom_level_demonstrated}/${t.graded.score}`
              : "-";
            return `T${i + 1} [${t.target_bloom} -> ${g}] Q: ${t.question}\nA: ${truncate(t.user_answer, 400)}`;
          })
          .join("\n");

  const latestBlock = args.latestUserAnswer
    ? `\nLATEST ANSWER (grade first):\n${truncate(args.latestUserAnswer, 600)}`
    : "";

  // After turn 1 the model already has all the context it needs from priorTurns;
  // re-sending jd_summary + resume_summary on every turn just burns tokens.
  const isFirstTurn = args.priorTurns.length === 0;
  const contextBlock = isFirstTurn
    ? `JD context: ${truncate(args.skill.jd_context ?? args.jdContext, 240)}
Resume mentions: ${args.skill.mentioned_in_resume ? "yes" : "no"}${
        args.skill.resume_evidence?.length
          ? ` (${args.skill.resume_evidence.slice(0, 1).join(" | ")})`
          : ""
      }
Resume summary: ${truncate(args.resumeSummary, 280)}`
    : "";

  return `SKILL: ${args.skill.name} (jd_weight=${args.skill.jd_weight}, self_rating=${args.selfRating}/5)
${contextBlock}
PRIOR TURNS:
${transcript}${latestBlock}

${
  args.latestUserAnswer
    ? "Grade the LATEST ANSWER (quote 1 short evidence span), then either stop (is_final=true with final_score/final_bloom/1-2 evidence_quotes) or propose the next_question + target_bloom."
    : "Propose the FIRST next_question + target_bloom for this self-rating. is_final=false. Skip grading_of_previous."
}
JSON only.`;
}

function truncate(s: string | undefined, n: number): string {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
