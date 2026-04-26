"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Loader2,
  Target,
  Sparkles,
  AlertTriangle,
  ShieldCheck,
  Compass,
  Eye,
} from "lucide-react";
import {
  Radar,
  RadarChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadSession, saveSession } from "@/lib/session";
import type { ScoreSummary, Session, SkillScore } from "@/lib/types";
import { computeSkillScores, computeSummary } from "@/lib/scoring";
import { cn } from "@/lib/utils";

const SEVERITY_VARIANT: Record<SkillScore["severity"], "critical" | "major" | "minor" | "strength" | "default"> = {
  critical: "critical",
  major: "major",
  minor: "minor",
  strength: "strength",
  ok: "default",
};

const SEVERITY_LABEL: Record<SkillScore["severity"], string> = {
  critical: "Critical gap",
  major: "Major gap",
  minor: "Minor gap",
  strength: "Strength",
  ok: "Adequate",
};

export function ResultsClient() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const s = loadSession();
    if (!s || !s.context) {
      router.replace("/");
      return;
    }
    if (s.assessments.length === 0) {
      router.replace("/assess");
      return;
    }
    // Compute scores deterministically
    const scores = computeSkillScores(s.context, s.assessments);
    const summary = computeSummary(s.context, scores, s.assessments);
    const updated: Session = { ...s, scores, summary };
    saveSession(updated);
    setSession(updated);
    setHydrated(true);
  }, [router]);

  const scoresByImportance = useMemo(() => {
    if (!session?.scores) return [];
    return [...session.scores].sort(
      (a, b) => b.jd_weight - a.jd_weight || a.verified_pct - b.verified_pct,
    );
  }, [session]);

  const radarData = useMemo(() => {
    if (!session?.scores) return [];
    const top = [...session.scores]
      .sort((a, b) => b.jd_weight - a.jd_weight)
      .slice(0, 6);
    return top.map((s) => ({
      skill: s.name.length > 12 ? s.name.slice(0, 11) + "…" : s.name,
      Claimed: s.self_rating_pct,
      Verified: s.verified_pct,
    }));
  }, [session]);

  if (!hydrated || !session?.summary || !session?.scores) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--color-fg-muted)]">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  const { summary, scores } = session;

  return (
    <main className="flex-1">
      <div className="max-w-6xl mx-auto px-6 pt-10 pb-24">
        {/* Heading */}
        <div className="mb-8">
          <Badge variant="accent" className="mb-3">
            <Sparkles className="w-3 h-3" /> Verified report
          </Badge>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
            Your skill profile vs the role
          </h1>
          <p className="text-[var(--color-fg-muted)] mt-2">
            {session.context?.job_title}
          </p>
        </div>

        {/* HERO: Honesty Score + Overall Match */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="grid md:grid-cols-3 gap-5 mb-8"
        >
          <HeroNumber
            label="Honesty Score"
            value={summary.honesty_score}
            description="100 = perfectly calibrated. Lower = bigger gap between claimed and demonstrated."
            icon={<ShieldCheck className="w-5 h-5" />}
            tone={
              summary.honesty_score >= 85 ? "success" : summary.honesty_score >= 65 ? "warn" : "danger"
            }
            big
          />
          <HeroNumber
            label="Role match"
            value={summary.overall_match}
            description="Weighted by JD importance of each skill."
            icon={<Target className="w-5 h-5" />}
            tone={summary.overall_match >= 70 ? "success" : summary.overall_match >= 50 ? "warn" : "danger"}
          />
          <Card className="md:col-span-1">
            <CardContent className="space-y-2">
              <div className="text-xs uppercase tracking-widest text-[var(--color-fg-dim)] flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5" /> Headline
              </div>
              <p className="text-base font-medium leading-relaxed">
                {summary.headline_calibration_note}
              </p>
              {summary.top_strengths.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {summary.top_strengths.map((s) => (
                    <Badge key={s} variant="strength">
                      {s}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Authenticity strip — surfaced only when behavioural telemetry was captured.
            Pairs with the Honesty Score: Honesty = self-perception accuracy,
            Authenticity = whether the answers themselves look human-typed. */}
        {typeof summary.authenticity_score === "number" && (
          <AuthenticityStrip
            score={summary.authenticity_score}
            note={summary.authenticity_note ?? ""}
            flagged={summary.flagged_skills ?? []}
          />
        )}

        {/* Charts row: claimed vs verified bars + radar */}
        <div className="grid md:grid-cols-5 gap-5 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="md:col-span-3"
          >
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Claimed vs Verified</CardTitle>
                <CardDescription>
                  Each row is one skill. The blue bar is what you said. The accent bar is what you
                  showed.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {scoresByImportance.map((s) => (
                  <SkillRow key={s.name} score={s} />
                ))}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="md:col-span-2"
          >
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Calibration radar</CardTitle>
                <CardDescription>Top 6 most-required skills.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="w-full h-[320px]">
                  <ResponsiveContainer>
                    <RadarChart data={radarData} outerRadius="75%">
                      <PolarGrid stroke="var(--color-border)" />
                      <PolarAngleAxis
                        dataKey="skill"
                        tick={{ fill: "var(--color-fg-muted)", fontSize: 11 }}
                      />
                      <PolarRadiusAxis
                        domain={[0, 100]}
                        tick={false}
                        axisLine={false}
                      />
                      <Radar
                        name="Claimed"
                        dataKey="Claimed"
                        stroke="#22d3ee"
                        fill="#22d3ee"
                        fillOpacity={0.18}
                      />
                      <Radar
                        name="Verified"
                        dataKey="Verified"
                        stroke="#7c5cff"
                        fill="#7c5cff"
                        fillOpacity={0.35}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center justify-center gap-4 text-xs text-[var(--color-fg-muted)]">
                  <LegendDot color="#22d3ee" label="Claimed" />
                  <LegendDot color="#7c5cff" label="Verified" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Gap list */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mb-8"
        >
          <Card>
            <CardHeader>
              <CardTitle>Gap analysis</CardTitle>
              <CardDescription>
                Severity weighted by JD importance and demonstrated proficiency.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {scores.map((s) => (
                <GapRow key={s.name} score={s} />
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* CTA */}
        <div className="flex justify-end">
          <Button variant="gradient" size="lg" onClick={() => router.push("/plan")}>
            Build my learning plan <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </main>
  );
}

function AuthenticityStrip({
  score,
  note,
  flagged,
}: {
  score: number;
  note: string;
  flagged: string[];
}) {
  const tone =
    score >= 85 ? "success" : score >= 65 ? "warn" : "danger";
  const toneRing =
    tone === "success"
      ? "ring-[color:var(--color-success)]/30 bg-[color:var(--color-success)]/8"
      : tone === "warn"
        ? "ring-[color:var(--color-warn)]/30 bg-[color:var(--color-warn)]/8"
        : "ring-[color:var(--color-danger)]/30 bg-[color:var(--color-danger)]/8";
  const toneText =
    tone === "success"
      ? "text-[color:var(--color-success)]"
      : tone === "warn"
        ? "text-[color:var(--color-warn)]"
        : "text-[color:var(--color-danger)]";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 }}
      className={cn(
        "mb-8 rounded-xl ring-1 px-5 py-4 flex flex-col md:flex-row md:items-center gap-4",
        toneRing,
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn("w-10 h-10 rounded-lg grid place-items-center bg-[var(--color-bg)]/60", toneText)}>
          <Eye className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-widest text-[var(--color-fg-dim)]">
            Authenticity Score
          </div>
          <div className="flex items-baseline gap-2">
            <span className={cn("text-2xl font-semibold tabular-nums", toneText)}>{score}</span>
            <span className="text-xs text-[var(--color-fg-muted)]">/ 100</span>
          </div>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--color-fg)] leading-snug">{note}</p>
        {flagged.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className="text-[10px] uppercase tracking-widest text-[var(--color-fg-dim)]">
              Flagged
            </span>
            {flagged.slice(0, 4).map((s) => (
              <Badge key={s} variant="critical">
                {s}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <div className="text-[11px] text-[var(--color-fg-dim)] md:max-w-[14rem] md:text-right leading-snug">
        Computed from typing telemetry (paste ratio, WPM, focus loss). 100 = behaviour
        consistent with authentic human effort.
      </div>
    </motion.div>
  );
}

function HeroNumber({
  label,
  value,
  description,
  icon,
  tone,
  big,
}: {
  label: string;
  value: number;
  description: string;
  icon: React.ReactNode;
  tone: "success" | "warn" | "danger";
  big?: boolean;
}) {
  const colorVar =
    tone === "success" ? "var(--color-success)" : tone === "warn" ? "var(--color-warn)" : "var(--color-danger)";
  return (
    <Card className={cn("relative overflow-hidden", big ? "md:col-span-1" : "")}>
      <div
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          background: `radial-gradient(120% 80% at 100% 0%, ${colorVar}33, transparent 60%)`,
        }}
      />
      <CardContent className="relative space-y-2">
        <div className="text-xs uppercase tracking-widest text-[var(--color-fg-dim)] flex items-center gap-1.5">
          {icon} {label}
        </div>
        <div className="flex items-baseline gap-2">
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 20 }}
            className={cn("font-semibold tracking-tight", big ? "text-6xl" : "text-5xl")}
            style={{ color: colorVar }}
          >
            {value}
          </motion.div>
          <span className="text-[var(--color-fg-dim)]">/100</span>
        </div>
        <p className="text-xs text-[var(--color-fg-muted)] leading-relaxed">{description}</p>
      </CardContent>
    </Card>
  );
}

function SkillRow({ score }: { score: SkillScore }) {
  const delta = score.calibration_error;
  const overclaim = delta >= 15;
  const underclaim = delta <= -15;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium truncate">{score.name}</span>
          {score.jd_weight >= 3 && <Badge variant="critical">Critical</Badge>}
          {score.jd_weight === 2 && <Badge variant="major">Required</Badge>}
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--color-fg-dim)] shrink-0">
          {overclaim && (
            <Badge variant="danger" className="!text-[10px] !px-2 !py-0">
              +{Math.round(delta)} overclaimed
            </Badge>
          )}
          {underclaim && (
            <Badge variant="cyan" className="!text-[10px] !px-2 !py-0">
              {Math.round(delta)} underclaimed
            </Badge>
          )}
          <span style={{ color: "var(--color-accent)" }} className="font-mono">
            {score.verified_pct}
          </span>
          <span>/</span>
          <span className="font-mono">{score.self_rating_pct}</span>
        </div>
      </div>
      <div className="relative h-2 rounded-full bg-[var(--color-bg-elev)] border border-[var(--color-border)] overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-[#22d3ee]/40 rounded-full"
          style={{ width: `${score.self_rating_pct}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${score.verified_pct}%`,
            background: "linear-gradient(90deg, var(--color-accent) 0%, var(--color-accent-2) 100%)",
          }}
        />
      </div>
    </div>
  );
}

function GapRow({ score }: { score: SkillScore }) {
  const variant = SEVERITY_VARIANT[score.severity];
  const label = SEVERITY_LABEL[score.severity];
  return (
    <div className="flex items-start gap-3 p-3 rounded-md bg-[var(--color-bg-elev)] border border-[var(--color-border)]">
      <Badge variant={variant} className="shrink-0 mt-0.5">
        {label}
      </Badge>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium">{score.name}</span>
          <span className="text-xs font-mono text-[var(--color-fg-dim)]">
            {score.bloom_level} · {score.verified_pct}/100
          </span>
        </div>
        {score.evidence_quotes[0] && (
          <p className="text-xs text-[var(--color-fg-muted)] italic mt-1">
            &ldquo;{score.evidence_quotes[0]}&rdquo;
          </p>
        )}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
