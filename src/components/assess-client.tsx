"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Bot,
  Loader2,
  SkipForward,
  Sparkles,
  User as UserIcon,
  CheckCircle2,
  XCircle,
  Award,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { loadSession, saveSession } from "@/lib/session";
import type { AssessmentTurn, Session, SkillAssessment } from "@/lib/types";
import type { BloomLevel } from "@/lib/utils";
import { BLOOM_LEVELS, cn } from "@/lib/utils";

type AssessApiResponse = {
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

const BLOOM_COLOR: Record<BloomLevel, string> = {
  Remember: "var(--color-fg-dim)",
  Understand: "#6e7d8e",
  Apply: "var(--color-accent-2)",
  Analyze: "#60a5fa",
  Evaluate: "var(--color-accent)",
  Create: "var(--color-success)",
};

export function AssessClient() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [phase, setPhase] = useState<"self_rate" | "interview" | "skill_done" | "all_done">(
    "self_rate",
  );
  const [selfRating, setSelfRating] = useState<number>(3);
  const [currentQuestion, setCurrentQuestion] = useState<string>("");
  const [currentTargetBloom, setCurrentTargetBloom] = useState<BloomLevel>("Apply");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestGrading, setLatestGrading] = useState<AssessApiResponse["grading_of_previous"] | null>(
    null,
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  // Hydrate
  useEffect(() => {
    const s = loadSession();
    if (!s || !s.context) {
      router.replace("/");
      return;
    }
    setSession(s);
    setHydrated(true);
  }, [router]);

  // Scroll-to-bottom on new content
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [currentQuestion, latestGrading, phase]);

  const skills = session?.context?.skills ?? [];
  const idx = session?.current_skill_index ?? 0;
  const currentSkill = skills[idx];
  const currentAssessment: SkillAssessment | undefined = useMemo(() => {
    if (!session) return undefined;
    return session.assessments.find((a) => a.skill === currentSkill?.name);
  }, [session, currentSkill]);

  if (!hydrated || !session) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--color-fg-muted)]">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (!currentSkill) {
    // All skills done
    return <AllDoneState session={session} router={router} />;
  }

  function persist(next: Session) {
    setSession(next);
    saveSession(next);
  }

  async function startInterview() {
    if (!currentSkill || !session) return;
    setLoading(true);
    setError(null);
    setLatestGrading(null);
    setDraft("");
    try {
      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          skill: currentSkill,
          jdContext: session.context!.jd_summary ?? "",
          resumeSummary: session.context!.resume_summary ?? "",
          selfRating,
          priorTurns: [],
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Interview start failed (${res.status})`);
      }
      const data = (await res.json()) as AssessApiResponse;
      if (!data.next_question) throw new Error("Model did not propose a question.");
      setCurrentQuestion(data.next_question);
      setCurrentTargetBloom(data.target_bloom ?? "Apply");
      // initialize assessment record
      const next: Session = { ...session };
      const existing = next.assessments.find((a) => a.skill === currentSkill.name);
      if (!existing) {
        next.assessments.push({
          skill: currentSkill.name,
          self_rating: selfRating,
          turns: [],
        });
      }
      persist(next);
      setPhase("interview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start interview.");
    } finally {
      setLoading(false);
    }
  }

  async function submitAnswer() {
    if (!currentSkill || !session) return;
    if (!draft.trim()) {
      setError("Please type an answer (or click 'I don't know' to skip).");
      return;
    }
    await sendAnswer(draft.trim());
  }

  async function dontKnow() {
    if (!currentSkill || !session) return;
    await sendAnswer("I don't know.");
  }

  async function sendAnswer(answer: string) {
    if (!currentSkill || !session) return;
    setLoading(true);
    setError(null);
    try {
      const assessment = session.assessments.find((a) => a.skill === currentSkill.name);
      if (!assessment) throw new Error("Lost assessment state.");
      const priorTurns = assessment.turns;

      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          skill: currentSkill,
          jdContext: session.context!.jd_summary ?? "",
          resumeSummary: session.context!.resume_summary ?? "",
          selfRating: assessment.self_rating,
          priorTurns,
          latestUserAnswer: answer,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Turn failed (${res.status})`);
      }
      const data = (await res.json()) as AssessApiResponse;

      // Save the turn we just completed
      const newTurn: AssessmentTurn = {
        turn_index: priorTurns.length,
        question: currentQuestion,
        target_bloom: currentTargetBloom,
        user_answer: answer,
        graded: data.grading_of_previous
          ? {
              bloom_level_demonstrated: data.grading_of_previous.bloom_level_demonstrated,
              score: data.grading_of_previous.score,
              evidence: data.grading_of_previous.evidence,
              follow_up_suggestion: data.grading_of_previous.follow_up_suggestion,
            }
          : undefined,
      };
      const updatedAssessment: SkillAssessment = {
        ...assessment,
        turns: [...priorTurns, newTurn],
      };
      const next: Session = {
        ...session,
        assessments: session.assessments.map((a) =>
          a.skill === currentSkill.name ? updatedAssessment : a,
        ),
      };

      setLatestGrading(data.grading_of_previous ?? null);
      setDraft("");

      if (data.is_final) {
        // Finalize this skill
        updatedAssessment.final_score = data.final_score;
        updatedAssessment.final_bloom = data.final_bloom;
        updatedAssessment.evidence_quotes = data.evidence_quotes;
        next.assessments = next.assessments.map((a) =>
          a.skill === currentSkill.name ? updatedAssessment : a,
        );
        persist(next);
        setPhase("skill_done");
      } else {
        if (!data.next_question) {
          setError("Model did not propose the next question.");
          persist(next);
          return;
        }
        setCurrentQuestion(data.next_question);
        setCurrentTargetBloom(data.target_bloom ?? currentTargetBloom);
        persist(next);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function nextSkill() {
    if (!session) return;
    const next: Session = { ...session, current_skill_index: idx + 1 };
    persist(next);
    setPhase("self_rate");
    setSelfRating(3);
    setCurrentQuestion("");
    setLatestGrading(null);
    setDraft("");
    setError(null);
  }

  function skipSkill() {
    if (!session || !currentSkill) return;
    // record an empty assessment (no turns) marked as skipped
    const next: Session = { ...session };
    const existing = next.assessments.find((a) => a.skill === currentSkill.name);
    if (!existing) {
      next.assessments.push({
        skill: currentSkill.name,
        self_rating: selfRating,
        turns: [],
        final_score: 0,
        final_bloom: "Remember",
        evidence_quotes: ["(skipped by candidate)"],
      });
    }
    next.current_skill_index = idx + 1;
    persist(next);
    setPhase("self_rate");
    setSelfRating(3);
    setCurrentQuestion("");
    setLatestGrading(null);
    setDraft("");
    setError(null);
  }

  const overallProgress = (idx / Math.max(1, skills.length)) * 100;
  const turnCount = currentAssessment?.turns.length ?? 0;
  const turnProgress = Math.min(100, ((turnCount + (phase === "interview" ? 0.5 : 0)) / 4) * 100);

  return (
    <main className="flex-1">
      <div className="max-w-4xl mx-auto px-6 pt-8 pb-24">
        {/* Top bar: skill chip + progress */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <Badge variant="accent">
              <Sparkles className="w-3 h-3" />
              Skill {idx + 1} / {skills.length}
            </Badge>
            <h1 className="text-xl font-semibold tracking-tight truncate">{currentSkill.name}</h1>
            {currentSkill.jd_weight >= 3 && <Badge variant="critical">Critical</Badge>}
            {currentSkill.jd_weight === 2 && <Badge variant="major">Required</Badge>}
            {currentSkill.jd_weight === 1 && <Badge variant="minor">Nice-to-have</Badge>}
            {currentSkill.jd_weight === 0 && <Badge variant="default">Adjacent</Badge>}
          </div>
          <Button variant="ghost" size="sm" onClick={skipSkill} disabled={loading}>
            <SkipForward className="w-3.5 h-3.5" /> Skip
          </Button>
        </div>
        <Progress value={overallProgress} className="mb-2" />
        <div className="flex items-center justify-between text-xs text-[var(--color-fg-dim)] mb-8">
          <span>
            {currentSkill.jd_context ?? `Probing your real proficiency on ${currentSkill.name}.`}
          </span>
          {phase === "interview" && (
            <span>
              Turn {turnCount + 1} · target: {currentTargetBloom}
            </span>
          )}
        </div>

        {/* Body */}
        <div ref={scrollRef} className="space-y-4">
          {phase === "self_rate" && (
            <SelfRate
              skill={currentSkill.name}
              value={selfRating}
              onChange={setSelfRating}
              onStart={startInterview}
              loading={loading}
            />
          )}

          {(phase === "interview" || phase === "skill_done") && (
            <Conversation
              turns={currentAssessment?.turns ?? []}
              currentQuestion={phase === "interview" ? currentQuestion : ""}
              currentTargetBloom={currentTargetBloom}
              latestGrading={latestGrading}
            />
          )}

          {phase === "skill_done" && currentAssessment?.final_score !== undefined && (
            <SkillSummary
              score={currentAssessment.final_score}
              bloom={currentAssessment.final_bloom ?? "Apply"}
              quotes={currentAssessment.evidence_quotes ?? []}
              selfRating={currentAssessment.self_rating}
              onNext={nextSkill}
              isLast={idx + 1 >= skills.length}
            />
          )}
        </div>

        {/* Composer */}
        {phase === "interview" && currentQuestion && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mt-6"
          >
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Progress value={turnProgress} className="flex-1" />
                <span className="text-[10px] uppercase tracking-widest text-[var(--color-fg-dim)]">
                  {turnCount}/~4 turns
                </span>
              </div>
              <Textarea
                placeholder="Type your answer in your own words. Be concrete — examples, trade-offs, edge cases."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={5}
                disabled={loading}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    submitAnswer();
                  }
                }}
              />
              <div className="flex items-center justify-between mt-3">
                <div className="text-xs text-[var(--color-fg-dim)]">
                  <kbd className="px-1.5 py-0.5 rounded bg-[var(--color-bg-elev)] border border-[var(--color-border)] text-[10px]">
                    Ctrl/⌘ + Enter
                  </kbd>{" "}
                  to send
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={dontKnow} disabled={loading}>
                    I don&apos;t know
                  </Button>
                  <Button variant="gradient" onClick={submitAnswer} disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Grading...
                      </>
                    ) : (
                      <>
                        Send <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {error && (
          <div className="mt-4 p-3 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 text-sm text-[var(--color-danger)]">
            {error}
          </div>
        )}
      </div>
    </main>
  );
}

function SelfRate({
  skill,
  value,
  onChange,
  onStart,
  loading,
}: {
  skill: string;
  value: number;
  onChange: (n: number) => void;
  onStart: () => void;
  loading: boolean;
}) {
  const labels: Record<number, string> = {
    1: "Aware of it",
    2: "Used it a little",
    3: "Comfortable",
    4: "Strong",
    5: "Expert",
  };
  return (
    <Card>
      <CardContent className="space-y-5">
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-widest text-[var(--color-accent)]">Self-rate</div>
          <h2 className="text-2xl font-semibold tracking-tight">
            How would you rate your <span className="gradient-text">{skill}</span> proficiency?
          </h2>
          <p className="text-sm text-[var(--color-fg-muted)]">
            Be honest — we&apos;ll verify it next. We compare your claim with what you demonstrate.
          </p>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => onChange(n)}
              className={cn(
                "rounded-md py-3 px-2 text-center border transition-all focus-ring",
                value === n
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-fg)]"
                  : "border-[var(--color-border)] bg-[var(--color-bg-elev)] text-[var(--color-fg-muted)] hover:border-[var(--color-border-strong)]",
              )}
            >
              <div className="text-2xl font-semibold">{n}</div>
              <div className="text-[10px] mt-1 uppercase tracking-wider">{labels[n]}</div>
            </button>
          ))}
        </div>
        <div className="pt-2">
          <Button variant="gradient" size="lg" onClick={onStart} disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Preparing your interview...
              </>
            ) : (
              <>
                Start interview <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Conversation({
  turns,
  currentQuestion,
  currentTargetBloom,
  latestGrading,
}: {
  turns: AssessmentTurn[];
  currentQuestion: string;
  currentTargetBloom: BloomLevel;
  latestGrading: AssessApiResponse["grading_of_previous"] | null;
}) {
  return (
    <div className="space-y-3">
      {turns.map((t, i) => (
        <div key={i} className="space-y-3">
          <Bubble role="bot" targetBloom={t.target_bloom}>
            {t.question}
          </Bubble>
          <Bubble role="user">{t.user_answer}</Bubble>
          {t.graded && (
            <GradeBadge
              grading={{
                bloom_level_demonstrated: t.graded.bloom_level_demonstrated,
                score: t.graded.score,
                evidence: t.graded.evidence,
                follow_up_suggestion: t.graded.follow_up_suggestion,
              }}
            />
          )}
        </div>
      ))}
      {currentQuestion && (
        <AnimatePresence>
          <motion.div
            key={currentQuestion}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Bubble role="bot" targetBloom={currentTargetBloom}>
              {currentQuestion}
            </Bubble>
          </motion.div>
        </AnimatePresence>
      )}
      {latestGrading && !currentQuestion && (
        <GradeBadge grading={latestGrading} />
      )}
    </div>
  );
}

function Bubble({
  role,
  children,
  targetBloom,
}: {
  role: "bot" | "user";
  children: React.ReactNode;
  targetBloom?: BloomLevel;
}) {
  const isBot = role === "bot";
  return (
    <div className={cn("flex gap-3", isBot ? "" : "flex-row-reverse")}>
      <div
        className={cn(
          "w-8 h-8 rounded-full shrink-0 flex items-center justify-center",
          isBot
            ? "bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] text-white"
            : "bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-fg-muted)]",
        )}
      >
        {isBot ? <Bot className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
      </div>
      <div className={cn("flex flex-col gap-1.5 max-w-[80%]", isBot ? "" : "items-end")}>
        {isBot && targetBloom && (
          <Badge variant="default" className="self-start">
            <span className="opacity-60">probing:</span>
            <span style={{ color: BLOOM_COLOR[targetBloom] }} className="font-medium">
              {targetBloom}
            </span>
          </Badge>
        )}
        <div
          className={cn(
            "rounded-lg px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
            isBot
              ? "bg-[var(--color-bg-card)] border border-[var(--color-border)]"
              : "bg-[var(--color-accent)]/15 border border-[var(--color-accent)]/30",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function GradeBadge({
  grading,
}: {
  grading: NonNullable<AssessApiResponse["grading_of_previous"]>;
}) {
  const tone =
    grading.score >= 70 ? "success" : grading.score >= 45 ? "warn" : "danger";
  const Icon =
    grading.score >= 70 ? CheckCircle2 : grading.score >= 45 ? Sparkles : XCircle;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="ml-11 flex items-start gap-2 text-xs text-[var(--color-fg-muted)]"
    >
      <Badge variant={tone}>
        <Icon className="w-3 h-3" />
        {grading.bloom_level_demonstrated} · {grading.score}/100
      </Badge>
      <span className="italic mt-0.5 max-w-md">&ldquo;{grading.evidence}&rdquo;</span>
    </motion.div>
  );
}

function SkillSummary({
  score,
  bloom,
  quotes,
  selfRating,
  onNext,
  isLast,
}: {
  score: number;
  bloom: BloomLevel;
  quotes: string[];
  selfRating: number;
  onNext: () => void;
  isLast: boolean;
}) {
  const selfPct = [10, 30, 50, 70, 90][selfRating - 1];
  const delta = score - selfPct;
  const tone =
    Math.abs(delta) <= 10 ? "success" : delta > 10 ? "warn" : "danger";
  const note =
    Math.abs(delta) <= 10
      ? "Well calibrated"
      : delta > 10
        ? "Underclaimed — you're stronger than you said"
        : "Overclaimed — gap between claim and reality";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mt-2"
    >
      <Card>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] flex items-center justify-center">
              <Award className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-[var(--color-fg-dim)]">
                Skill verified
              </div>
              <div className="text-lg font-semibold">
                {bloom} · <span className="gradient-text">{score}/100</span>
              </div>
            </div>
            <div className="ml-auto">
              <Badge variant={tone}>{note}</Badge>
            </div>
          </div>
          {quotes.length > 0 && (
            <div className="space-y-1.5 text-xs text-[var(--color-fg-muted)]">
              <div className="text-[10px] uppercase tracking-widest text-[var(--color-fg-dim)]">
                Evidence
              </div>
              {quotes.map((q, i) => (
                <div key={i} className="italic">
                  &ldquo;{q}&rdquo;
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end">
            <Button variant="gradient" onClick={onNext}>
              {isLast ? "See full report" : "Next skill"} <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function AllDoneState({
  session,
  router,
}: {
  session: Session;
  router: ReturnType<typeof useRouter>;
}) {
  useEffect(() => {
    router.replace("/results");
  }, [router]);
  return (
    <main className="flex-1 flex items-center justify-center text-[var(--color-fg-muted)]">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Synthesizing your report...
    </main>
  );
}

// Use BLOOM_LEVELS constant somewhere to avoid unused import warning
void BLOOM_LEVELS;
