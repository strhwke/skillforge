"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BookOpen,
  Clock,
  Compass,
  Download,
  ExternalLink,
  GraduationCap,
  Hammer,
  Loader2,
  Sparkles,
  Target,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { loadSession, saveSession } from "@/lib/session";
import type { LearningPlan, LearningPlanItem, ResourceItem, Session } from "@/lib/types";
import { cn } from "@/lib/utils";

export function PlanClient() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resourceProgress, setResourceProgress] = useState<{
    done: number;
    total: number;
    currentSkill: string;
  } | null>(null);

  useEffect(() => {
    const s = loadSession();
    if (!s || !s.context) {
      router.replace("/");
      return;
    }
    if (!s.scores || !s.summary) {
      router.replace("/results");
      return;
    }
    setSession(s);
    setHydrated(true);

    if (!s.plan || !s.plan.items.every((i) => i.resources.length > 0)) {
      generatePlan(s);
    }
  }, [router]);

  async function generatePlan(s: Session) {
    setLoading(true);
    setError(null);
    setResourceProgress(null);
    try {
      let working: Session = s;
      // Step 1: plan synthesis (or reuse if items already exist without resources)
      if (!s.plan) {
        const res = await fetch("/api/plan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ context: s.context, scores: s.scores }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `Plan synthesis failed (${res.status})`);
        }
        const plan = (await res.json()) as LearningPlan;
        working = { ...s, plan };
        saveSession(working);
        setSession(working);
      }

      // Step 2: progressive resource curation, one skill per call.
      // Sequential by design — paces the calls under Gemini's per-minute ceiling
      // and lets the UI fill in cards as each result arrives.
      const itemsNeedingResources =
        working.plan!.items.filter((i) => i.resources.length === 0).length;
      if (itemsNeedingResources === 0) {
        return;
      }
      let done = 0;
      for (let i = 0; i < working.plan!.items.length; i++) {
        const item = working.plan!.items[i];
        if (item.resources.length > 0) continue;
        setResourceProgress({
          done,
          total: itemsNeedingResources,
          currentSkill: item.skill,
        });
        const matchingScore = working.scores!.find((sc) => sc.name === item.skill);
        const res = await fetch("/api/resources", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            skill: item.skill,
            currentBloom: matchingScore?.bloom_level ?? "Remember",
            targetBloom: item.bloom_target,
            candidateStrengths: working.context!.candidate_strengths_inferred ?? [],
            jobContext:
              working.context!.job_title +
              " — " +
              working.context!.jd_summary.slice(0, 240),
          }),
        });
        if (res.ok) {
          const { resources } = (await res.json()) as { resources: typeof item.resources };
          working = {
            ...working,
            plan: {
              ...working.plan!,
              items: working.plan!.items.map((it, idx) =>
                idx === i ? { ...it, resources } : it,
              ),
            },
          };
          saveSession(working);
          setSession(working);
        }
        done++;
        setResourceProgress({
          done,
          total: itemsNeedingResources,
          currentSkill: item.skill,
        });
      }
      setResourceProgress(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Plan generation failed.");
    } finally {
      setLoading(false);
    }
  }

  function exportMarkdown() {
    if (!session?.plan || !session.context || !session.summary) return;
    const md = renderMarkdown(session);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `skillforge-plan-${slugify(session.context.job_title)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!hydrated || !session) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--color-fg-muted)]">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <main className="flex-1">
      <div className="max-w-5xl mx-auto px-6 pt-10 pb-24">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <Badge variant="cyan" className="mb-3">
              <Compass className="w-3 h-3" /> Adjacency-aware plan
            </Badge>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
              Your <span className="gradient-text">closeable</span> path to the role
            </h1>
            <p className="text-[var(--color-fg-muted)] mt-2 max-w-2xl">
              Skills you can realistically reach from where you already are — ordered by leverage,
              with curated resources and time estimates.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => router.push("/results")}>
            <ArrowLeft className="w-3.5 h-3.5" /> Back to report
          </Button>
        </div>

        {loading && !session.plan && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-[var(--color-fg-muted)]">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-sm">Synthesizing your adjacency-aware plan...</p>
            <p className="text-xs text-[var(--color-fg-dim)]">
              Reasoning over your strengths and the JD. ~30 seconds.
            </p>
          </div>
        )}

        {loading && session.plan && resourceProgress && (
          <div className="mb-6 rounded-md border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 px-4 py-3 flex items-center gap-3">
            <Loader2 className="w-4 h-4 animate-spin text-[var(--color-accent)]" />
            <div className="flex-1 min-w-0">
              <div className="text-sm">
                Searching the web for resources on{" "}
                <span className="font-medium gradient-text">{resourceProgress.currentSkill}</span>
                ...
              </div>
              <div className="text-xs text-[var(--color-fg-dim)]">
                {resourceProgress.done} / {resourceProgress.total} skills curated · pacing
                requests under Gemini's free-tier limit
              </div>
            </div>
            <div className="text-xs font-mono text-[var(--color-fg-dim)] tabular-nums">
              {Math.round((resourceProgress.done / resourceProgress.total) * 100)}%
            </div>
          </div>
        )}

        {error && (
          <Card className="border-[var(--color-danger)]/40">
            <CardContent>
              <div className="text-sm text-[var(--color-danger)] mb-3">{error}</div>
              <Button variant="secondary" onClick={() => session && generatePlan(session)}>
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {session.plan && (
          <>
            {/* Top stats */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="grid md:grid-cols-3 gap-4 mb-6"
            >
              <StatCard
                label="Total effort"
                value={`${session.plan.total_hours}h`}
                hint={`across ${session.plan.weeks} week${session.plan.weeks === 1 ? "" : "s"}`}
                icon={<Clock className="w-4 h-4" />}
              />
              <StatCard
                label="Skills targeted"
                value={String(session.plan.items.length)}
                hint="prioritized by leverage"
                icon={<Target className="w-4 h-4" />}
              />
              <StatCard
                label="Resources"
                value={String(
                  session.plan.items.reduce((n, i) => n + i.resources.length, 0),
                )}
                hint="curated and grounded"
                icon={<BookOpen className="w-4 h-4" />}
              />
            </motion.div>

            {/* Narrative */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05 }}
              className="mb-6"
            >
              <Card>
                <CardContent className="space-y-1">
                  <div className="text-xs uppercase tracking-widest text-[var(--color-accent)] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Strategy
                  </div>
                  <p className="text-base leading-relaxed">
                    {session.plan.summary_narrative}
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            {/* Plan items */}
            <div className="space-y-4">
              {session.plan.items.map((item, i) => (
                <PlanItemCard key={item.skill} item={item} index={i} />
              ))}
            </div>

            {/* Footer actions */}
            <div className="mt-10 flex items-center justify-between">
              <div className="text-xs text-[var(--color-fg-dim)]">
                Resources curated live via Gemini grounding. Click cards to open.
              </div>
              <div className="flex items-center gap-3">
                <Button variant="secondary" onClick={exportMarkdown}>
                  <Download className="w-4 h-4" />
                  Export as Markdown
                </Button>
                <Button variant="gradient" onClick={() => router.push("/")}>
                  Start over
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-1">
        <div className="text-xs uppercase tracking-widest text-[var(--color-fg-dim)] flex items-center gap-1.5">
          {icon} {label}
        </div>
        <div className="text-3xl font-semibold tracking-tight">{value}</div>
        <div className="text-xs text-[var(--color-fg-muted)]">{hint}</div>
      </CardContent>
    </Card>
  );
}

function PlanItemCard({ item, index }: { item: LearningPlanItem; index: number }) {
  const adjacencyPct = Math.round(item.adjacency * 100);
  const adjacencyTone =
    item.adjacency >= 0.7 ? "strength" : item.adjacency >= 0.45 ? "cyan" : "warn";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.05 * index }}
    >
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={cn(
                  "w-8 h-8 rounded-md flex items-center justify-center text-xs font-mono shrink-0 border",
                  "border-[var(--color-border)] bg-[var(--color-bg-elev)] text-[var(--color-fg-muted)]",
                )}
              >
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="min-w-0">
                <CardTitle className="truncate">{item.skill}</CardTitle>
                <CardDescription>
                  {item.week_window} · {item.hours_estimate}h to{" "}
                  <span className="text-[var(--color-accent)]">{item.bloom_target}</span>
                </CardDescription>
              </div>
            </div>
            <Badge variant={adjacencyTone}>
              <Compass className="w-3 h-3" /> {adjacencyPct}% adjacent
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Why adjacent */}
          <div className="rounded-md bg-[var(--color-bg-elev)] border border-[var(--color-border)] p-3 text-sm">
            <div className="text-xs uppercase tracking-widest text-[var(--color-fg-dim)] mb-1">
              Why this is adjacent for you
            </div>
            <p className="text-[var(--color-fg-muted)] leading-relaxed">
              {item.adjacency_rationale}
            </p>
          </div>

          {/* Progress visual: current -> target */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-[var(--color-fg-dim)]">
              <span>Current: {item.current_pct}/100</span>
              <span>Target: {item.target_pct}/100</span>
            </div>
            <div className="relative h-1.5 rounded-full bg-[var(--color-bg-elev)] border border-[var(--color-border)] overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-[var(--color-fg-dim)]/60 rounded-full"
                style={{ width: `${item.current_pct}%` }}
              />
              <div
                className="absolute inset-y-0 rounded-full"
                style={{
                  left: `${item.current_pct}%`,
                  width: `${Math.max(0, item.target_pct - item.current_pct)}%`,
                  background:
                    "linear-gradient(90deg, var(--color-accent) 0%, var(--color-accent-2) 100%)",
                }}
              />
            </div>
          </div>

          <Separator />

          {/* Resources */}
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-widest text-[var(--color-fg-dim)]">
              Curated resources
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {item.resources.length === 0
                ? Array.from({ length: 3 }).map((_, i) => <ResourceSkeleton key={i} />)
                : item.resources.map((r) => <ResourceCard key={r.url} r={r} />)}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function ResourceSkeleton() {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-3 flex flex-col gap-2 overflow-hidden relative">
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[shimmer_2.4s_infinite]" />
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-md bg-[var(--color-bg-card)] border border-[var(--color-border)]" />
        <div className="flex-1 h-3 rounded bg-[var(--color-bg-card)]/70" />
      </div>
      <div className="h-4 rounded bg-[var(--color-bg-card)]/70 w-4/5" />
      <div className="h-3 rounded bg-[var(--color-bg-card)]/70 w-full" />
      <div className="h-3 rounded bg-[var(--color-bg-card)]/70 w-1/2" />
    </div>
  );
}

function ResourceCard({ r }: { r: ResourceItem }) {
  const Icon = typeIcon(r.type);
  return (
    <a
      href={r.url}
      target="_blank"
      rel="noreferrer"
      className="group rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-3 hover:border-[var(--color-accent)]/60 hover:bg-[var(--color-bg-card)] transition-all flex flex-col gap-2"
    >
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-md bg-[var(--color-bg-card)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-accent)]">
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="default" className="!text-[10px] !px-1.5 !py-0 capitalize">
            {r.type}
          </Badge>
          {r.is_free ? (
            <Badge variant="success" className="!text-[10px] !px-1.5 !py-0">
              Free
            </Badge>
          ) : (
            <Badge variant="warn" className="!text-[10px] !px-1.5 !py-0">
              Paid
            </Badge>
          )}
          <Badge
            variant={r.cited ? "cyan" : "default"}
            className="!text-[10px] !px-1.5 !py-0"
          >
            {r.cited ? "Web-cited" : "AI-curated"}
          </Badge>
        </div>
      </div>
      <div className="font-medium text-sm leading-snug group-hover:text-[var(--color-fg)] flex items-start gap-1">
        <span className="line-clamp-2">{r.title}</span>
        <ExternalLink className="w-3.5 h-3.5 shrink-0 text-[var(--color-fg-dim)] mt-0.5 group-hover:text-[var(--color-accent)]" />
      </div>
      <div className="text-xs text-[var(--color-fg-muted)] line-clamp-2">{r.why_chosen}</div>
      <div className="flex items-center justify-between text-[10px] text-[var(--color-fg-dim)] uppercase tracking-widest mt-auto">
        <span>{r.provider}</span>
        <span>{r.hours_estimate}h</span>
      </div>
    </a>
  );
}

function typeIcon(t: ResourceItem["type"]) {
  switch (t) {
    case "course":
      return GraduationCap;
    case "tutorial":
      return Wrench;
    case "project":
      return Hammer;
    case "book":
      return BookOpen;
    case "reference":
    default:
      return BookOpen;
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function renderMarkdown(s: Session): string {
  const ctx = s.context!;
  const summary = s.summary!;
  const plan = s.plan!;
  const lines: string[] = [];
  lines.push(`# SkillForge Learning Plan — ${ctx.job_title}\n`);
  lines.push(`**Honesty Score:** ${summary.honesty_score}/100 · **Role Match:** ${summary.overall_match}/100\n`);
  lines.push(`> ${summary.headline_calibration_note}\n`);
  lines.push(`## Strategy\n${plan.summary_narrative}\n`);
  lines.push(`## Plan (${plan.total_hours}h across ${plan.weeks} weeks)\n`);
  for (const [i, item] of plan.items.entries()) {
    lines.push(
      `### ${i + 1}. ${item.skill} — ${item.week_window} (${item.hours_estimate}h, target: ${item.bloom_target})`,
    );
    lines.push(
      `*Adjacency: ${Math.round(item.adjacency * 100)}% — ${item.adjacency_rationale}*\n`,
    );
    for (const r of item.resources) {
      lines.push(
        `- [${r.title}](${r.url}) · ${r.type} · ${r.hours_estimate}h · ${r.is_free ? "free" : "paid"} — ${r.why_chosen}`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}
