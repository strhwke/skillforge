import type {
  ExtractedContext,
  ScoreSummary,
  SkillAssessment,
  SkillScore,
  TurnTelemetry,
} from "./types";
import { BLOOM_LEVELS, bloomToPct, pctToBloom, selfRatingToPct, severityFromScore, type BloomLevel } from "./utils";

/**
 * Compute the verified_pct for a single skill from its assessment turns.
 * Strategy: take the weighted-tail, favoring recent turns and the highest stable level.
 * - If skipped (no turns), score = 0 with bloom Remember.
 * - Otherwise, score is mostly the max of the last 2 graded scores, lightly tempered by mean of all turns.
 */
export function computeVerifiedScore(a: SkillAssessment): { score: number; bloom: BloomLevel } {
  if (a.turns.length === 0) {
    if (typeof a.final_score === "number") {
      return { score: a.final_score, bloom: a.final_bloom ?? pctToBloom(a.final_score) };
    }
    return { score: 0, bloom: "Remember" };
  }
  const graded = a.turns.filter((t) => t.graded);
  if (graded.length === 0) {
    return { score: 0, bloom: "Remember" };
  }
  const lastTwo = graded.slice(-2).map((t) => t.graded!.score);
  const meanAll = graded.reduce((s, t) => s + t.graded!.score, 0) / graded.length;
  const maxLast = Math.max(...lastTwo);
  const score = Math.round(maxLast * 0.7 + meanAll * 0.3);

  // Choose bloom: highest level demonstrated in last 2 turns
  const lastBlooms = graded.slice(-2).map((t) => t.graded!.bloom_level_demonstrated);
  const bloom = highestBloom(lastBlooms);
  return { score: Math.max(0, Math.min(100, score)), bloom };
}

function highestBloom(levels: BloomLevel[]): BloomLevel {
  if (levels.length === 0) return "Remember";
  const ranks = levels.map((b) => BLOOM_LEVELS.indexOf(b));
  return BLOOM_LEVELS[Math.max(...ranks)];
}

export function computeSkillScores(
  context: ExtractedContext,
  assessments: SkillAssessment[],
): SkillScore[] {
  const scores: SkillScore[] = [];
  for (const skill of context.skills) {
    const assess = assessments.find((a) => a.skill === skill.name);
    if (!assess) continue;
    const { score, bloom } = computeVerifiedScore(assess);
    const selfPct = selfRatingToPct(assess.self_rating);
    const calibrationError = selfPct - score; // positive = overconfident

    const severity = severityFromScore(
      score,
      skill.jd_weight >= 1,
      skill.jd_weight,
    );

    const evidence: string[] = [];
    for (const t of assess.turns) {
      if (t.graded?.evidence) evidence.push(t.graded.evidence);
    }
    if (assess.evidence_quotes) evidence.push(...assess.evidence_quotes);

    scores.push({
      name: skill.name,
      jd_weight: skill.jd_weight,
      self_rating_pct: selfPct,
      verified_pct: score,
      calibration_error: calibrationError,
      bloom_level: bloom,
      severity,
      evidence_quotes: evidence.slice(0, 4),
    });
  }
  return scores;
}

/**
 * Compute a per-turn cheating-risk score (0-100) from behavioural telemetry.
 * Higher = more suspicious. Used to flag possible LLM-assisted answers.
 *
 * Heuristic stack — each signal is independent and additive:
 *   - paste-heavy answers (LLM output gets pasted in)
 *   - super-human typing speed (sustained WPM > 80)
 *   - long idle followed by minimal keystrokes (read-LLM-then-paste pattern)
 *   - tab/window focus loss while composing
 *   - keystrokes-to-chars ratio implies the answer wasn't actually typed
 *
 * Deliberately conservative: short answers (<20 chars) return 0 to avoid
 * false positives on terse "I don't know" replies.
 */
export function computeTurnRisk(t: TurnTelemetry, answerChars: number): number {
  if (answerChars < 20) return 0;

  let risk = 0;

  const pasteRatio = t.pastedChars / Math.max(1, answerChars);
  if (pasteRatio > 0.5) risk += 50;
  else if (pasteRatio > 0.2) risk += 25;

  const minutes = Math.max(0.05, t.durationMs / 60000);
  const wpm = answerChars / 5 / minutes;
  if (wpm > 120) risk += 30;
  else if (wpm > 80) risk += 15;

  if (t.timeToFirstKeyMs > 20000 && t.keystrokes < answerChars * 0.3) {
    risk += 20;
  }

  if (t.focusLossCount >= 2) risk += 15;
  else if (t.focusLossCount === 1) risk += 5;

  const keystrokeRatio = t.keystrokes / Math.max(1, answerChars);
  if (keystrokeRatio < 0.1 && answerChars > 50) risk += 25;

  return Math.min(100, risk);
}

/**
 * Aggregate per-turn risks into a session-level Authenticity Score.
 * 100 = behaviour consistent with authentic effort. 0 = strong cheating signals.
 */
export function computeAuthenticityScore(assessments: SkillAssessment[]): {
  score: number;
  flagged: string[];
  note: string;
} {
  const perSkill: { skill: string; risk: number }[] = [];
  for (const a of assessments) {
    const risks: number[] = [];
    for (const t of a.turns) {
      if (t.telemetry && t.user_answer.length >= 20) {
        risks.push(computeTurnRisk(t.telemetry, t.user_answer.length));
      }
    }
    if (risks.length > 0) {
      const avg = risks.reduce((s, r) => s + r, 0) / risks.length;
      perSkill.push({ skill: a.skill, risk: avg });
    }
  }

  if (perSkill.length === 0) {
    return {
      score: 100,
      flagged: [],
      note: "No behavioural telemetry captured for this session.",
    };
  }

  const meanRisk = perSkill.reduce((s, x) => s + x.risk, 0) / perSkill.length;
  const score = Math.round(Math.max(0, Math.min(100, 100 - meanRisk)));
  const flagged = perSkill
    .filter((x) => x.risk >= 50)
    .sort((a, b) => b.risk - a.risk)
    .map((x) => x.skill);

  let note: string;
  if (score >= 85) {
    note = "Behavioural signals consistent with authentic effort.";
  } else if (score >= 65) {
    note = "Mostly authentic with minor signals worth a recruiter glance.";
  } else if (flagged.length > 0) {
    note = `Possible LLM-assisted answers on ${flagged.slice(0, 2).join(" and ")}.`;
  } else {
    note = "Multiple behavioural anomalies detected across the session.";
  }

  return { score, flagged, note };
}

export function computeSummary(
  context: ExtractedContext,
  scores: SkillScore[],
  assessments?: SkillAssessment[],
): ScoreSummary {
  // Honesty score: 100 - mean(overconfidence_only). Underconfidence not penalized; small bonus.
  const overconfidence = scores
    .map((s) => Math.max(0, s.calibration_error))
    .reduce((a, b) => a + b, 0) / Math.max(1, scores.length);
  const underconfidenceBonus =
    scores.filter((s) => s.calibration_error < -10).length * 1.5;
  const honesty = Math.round(
    Math.max(0, Math.min(100, 100 - overconfidence + underconfidenceBonus)),
  );

  // Overall match: weighted (by jd_weight) verified score, normalized.
  let weightedSum = 0;
  let totalWeight = 0;
  for (const s of scores) {
    const w = s.jd_weight === 0 ? 0.5 : s.jd_weight;
    weightedSum += s.verified_pct * w;
    totalWeight += w;
  }
  const overallMatch = Math.round(weightedSum / Math.max(1, totalWeight));

  const topStrengths = scores
    .filter((s) => s.verified_pct >= 70)
    .sort((a, b) => b.verified_pct - a.verified_pct)
    .slice(0, 4)
    .map((s) => s.name);

  const criticalGaps = scores
    .filter((s) => s.severity === "critical" || s.severity === "major")
    .sort((a, b) => b.jd_weight - a.jd_weight || a.verified_pct - b.verified_pct)
    .slice(0, 5)
    .map((s) => s.name);

  // Headline calibration note
  const overclaimedSkills = scores
    .filter((s) => s.calibration_error >= 20)
    .sort((a, b) => b.calibration_error - a.calibration_error)
    .slice(0, 2)
    .map((s) => s.name);

  let headline: string;
  if (overclaimedSkills.length === 0 && honesty >= 85) {
    headline = "Strong calibration — you accurately know what you know.";
  } else if (overclaimedSkills.length > 0) {
    headline = `Notable overconfidence on ${overclaimedSkills.join(" and ")}.`;
  } else if (honesty < 60) {
    headline = "Significant gap between claimed and demonstrated proficiency overall.";
  } else {
    headline = "Mostly well-calibrated, with minor overconfidence in a few areas.";
  }

  const summary: ScoreSummary = {
    honesty_score: honesty,
    overall_match: overallMatch,
    top_strengths: topStrengths,
    critical_gaps: criticalGaps,
    headline_calibration_note: headline,
  };

  if (assessments && assessments.length > 0) {
    const auth = computeAuthenticityScore(assessments);
    summary.authenticity_score = auth.score;
    summary.flagged_skills = auth.flagged;
    summary.authenticity_note = auth.note;
  }

  return summary;
}

// Re-export helpers for client convenience
export { bloomToPct, pctToBloom, selfRatingToPct };
