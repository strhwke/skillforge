import type { BloomLevel } from "./utils";

export type Skill = {
  /** canonical skill name, e.g. "React", "PostgreSQL", "System Design" */
  name: string;
  /** 0 = optional, 1 = nice-to-have, 2 = required, 3 = critical */
  jd_weight: 0 | 1 | 2 | 3;
  /** whether the resume mentions this skill (any form) */
  mentioned_in_resume: boolean;
  /** short categorisation, e.g. "language", "framework", "infra", "domain" */
  category?: string;
  /** evidence quotes from resume if any */
  resume_evidence?: string[];
  /** a one-line gloss on what this skill means in the JD context */
  jd_context?: string;
};

export type ExtractedContext = {
  job_title: string;
  jd_summary: string;
  resume_summary: string;
  candidate_strengths_inferred: string[];
  skills: Skill[];
};

export type AssessmentTurn = {
  turn_index: number;
  question: string;
  target_bloom: BloomLevel;
  user_answer: string;
  graded?: GradedAnswer;
  /** Behavioural telemetry for cheating-risk scoring. Optional for backwards compat. */
  telemetry?: TurnTelemetry;
};

export type TurnTelemetry = {
  /** Total ms from question render to submit */
  durationMs: number;
  /** Ms from question render to first keystroke (or paste) */
  timeToFirstKeyMs: number;
  /** Final answer length in chars */
  totalChars: number;
  /** Number of paste events */
  pasteEvents: number;
  /** Total characters injected via paste */
  pastedChars: number;
  /** Distinct keystrokes (excluding modifier-only) */
  keystrokes: number;
  /** Tab/window blur events while composing */
  focusLossCount: number;
};

export type GradedAnswer = {
  bloom_level_demonstrated: BloomLevel;
  score: number; // 0-100
  evidence: string;
  follow_up_suggestion: "drill_down" | "level_up" | "stop";
};

export type SkillAssessment = {
  skill: string;
  self_rating: number; // 1-5 from user
  turns: AssessmentTurn[];
  final_score?: number; // 0-100
  final_bloom?: BloomLevel;
  evidence_quotes?: string[];
};

export type SkillScore = {
  name: string;
  jd_weight: 0 | 1 | 2 | 3;
  self_rating_pct: number;
  verified_pct: number;
  calibration_error: number; // signed: positive = overconfident
  bloom_level: BloomLevel;
  severity: "critical" | "major" | "minor" | "strength" | "ok";
  evidence_quotes: string[];
  narrative?: string;
};

export type ScoreSummary = {
  honesty_score: number; // 0-100, higher = better calibrated
  overall_match: number; // 0-100, weighted JD-relevance match
  top_strengths: string[];
  critical_gaps: string[];
  headline_calibration_note: string; // e.g. "Moderate overconfidence on Kubernetes and System Design"
  /** 0-100, higher = behaviour consistent with authentic human effort. Optional for backwards compat. */
  authenticity_score?: number;
  /** Skills whose per-turn telemetry tripped the cheating-risk threshold */
  flagged_skills?: string[];
  /** Human-readable summary line for the authenticity hero card */
  authenticity_note?: string;
};

export type ResourceItem = {
  title: string;
  url: string;
  type: "course" | "tutorial" | "project" | "reference" | "book";
  hours_estimate: number;
  why_chosen: string;
  provider: string;
  is_free: boolean;
  cited?: boolean; // true when from grounded search
};

export type LearningPlanItem = {
  skill: string;
  current_pct: number;
  target_pct: number;
  bloom_target: BloomLevel;
  adjacency: number; // 0-1
  adjacency_rationale: string;
  hours_estimate: number;
  week_window: string; // e.g. "Weeks 1-2"
  resources: ResourceItem[];
};

export type LearningPlan = {
  total_hours: number;
  weeks: number;
  items: LearningPlanItem[];
  summary_narrative: string;
};

export type Session = {
  context: ExtractedContext | null;
  assessments: SkillAssessment[];
  scores: SkillScore[] | null;
  summary: ScoreSummary | null;
  plan: LearningPlan | null;
  current_skill_index: number;
  created_at: string;
};
