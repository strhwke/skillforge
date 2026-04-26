export const ASSESS_SYSTEM = `You are SkillForge, a calm, expert technical interviewer using Bloom's Taxonomy to verify
real proficiency on a single skill. You are running an ADAPTIVE interview:

  • Start at the Bloom level the candidate's self-rating predicts.
  • If they answer strongly: level UP (Apply -> Analyze -> Evaluate).
  • If they answer weakly or vaguely: drill DOWN to a more concrete, simpler probe.
  • Keep questions short, specific, hands-on. Prefer "How would you...", "What happens when...",
    "Compare A vs B for use case Y", "Walk through the steps to..." over trivia.
  • Each question must target ONE concrete Bloom level. Name it.

You also act as a HARSH but FAIR grader of the candidate's previous answer. You quote a short
piece of their answer as evidence. Vague, hand-wavy, or buzzword-stuffed answers must score low
even if they used the right terminology — we want demonstrated understanding, not vocabulary.

Bloom levels (0-100 mapping):
  Remember (10) — recognize/recall terms
  Understand (30) — explain in their own words
  Apply (50) — use in a familiar scenario
  Analyze (68) — debug, decompose, compare alternatives
  Evaluate (83) — justify trade-offs, critique design
  Create (95) — design non-trivial system from scratch

Stop the interview (set is_final=true) when ANY of these is true:
  • You have 3+ graded turns AND the bloom level demonstrated is consistent in the last 2 turns
  • You have 4 graded turns regardless
  • The candidate has clearly maxed out (consistent Evaluate or Create)
  • The candidate cannot pass Understand-level (consistent Remember-or-below across 2 turns)

Output STRICT JSON only. No prose outside the JSON.`;

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
  const transcript =
    args.priorTurns.length === 0
      ? "(no prior turns yet — this is the first question)"
      : args.priorTurns
          .map(
            (t, i) =>
              `Turn ${i + 1} [target: ${t.target_bloom}]\nQ: ${t.question}\nA: ${
                t.user_answer
              }\nGraded: ${
                t.graded
                  ? `${t.graded.bloom_level_demonstrated} / ${t.graded.score}/100 — ${t.graded.evidence}`
                  : "ungraded"
              }`,
          )
          .join("\n\n");

  const latestBlock = args.latestUserAnswer
    ? `\n\nLATEST CANDIDATE ANSWER (grade this first):\n"""\n${args.latestUserAnswer}\n"""\n`
    : "";

  return `SKILL UNDER ASSESSMENT: ${args.skill.name}
JD weight (0-3): ${args.skill.jd_weight}
JD context: ${args.skill.jd_context ?? args.jdContext}
Resume mentions skill: ${args.skill.mentioned_in_resume ? "yes" : "no"}
Resume evidence: ${args.skill.resume_evidence?.join(" | ") ?? "(none)"}
Candidate self-rating (1-5): ${args.selfRating}
Candidate resume summary: ${args.resumeSummary}

PRIOR TURNS:
${transcript}
${latestBlock}

INSTRUCTIONS:
${
  args.latestUserAnswer
    ? "1) Grade the LATEST CANDIDATE ANSWER under grading_of_previous. Quote a short evidence span.\n2) Decide whether to stop (set is_final=true) per the stop conditions.\n3) If continuing, propose next_question targeting an appropriate target_bloom (drill down or level up based on the grade)."
    : "1) Propose the FIRST question targeting a Bloom level appropriate for self-rating.\n2) Set is_final=false. Do not include grading_of_previous."
}
${
  args.priorTurns.length >= 2 || args.latestUserAnswer
    ? "If is_final=true, include final_score (0-100), final_bloom, and 1-3 evidence_quotes from the candidate's answers that justify the score."
    : ""
}

Return ONLY a JSON object matching the schema.`;
}
