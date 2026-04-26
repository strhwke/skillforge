"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Sparkles,
  FileText,
  Upload,
  ArrowRight,
  Loader2,
  ScanLine,
  Target,
  Compass,
  CheckCircle2,
  AlertTriangle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { emptySession, saveSession } from "@/lib/session";
import type { ExtractedContext } from "@/lib/types";
import { SAMPLE_JD, SAMPLE_RESUME } from "@/lib/samples";

export function Landing() {
  const [jd, setJd] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Restore from session if user comes back
  useEffect(() => {
    // no-op for now — we explicitly start fresh on the landing
  }, []);

  function loadSample() {
    setJd(SAMPLE_JD);
    setResumeText(SAMPLE_RESUME);
    setResumeFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleStart() {
    setError(null);
    if (!jd.trim() || jd.trim().length < 80) {
      setError("Paste a full Job Description (at least a few sentences).");
      return;
    }
    if (!resumeFile && resumeText.trim().length < 120) {
      setError("Upload a resume PDF or paste resume text.");
      return;
    }
    setLoading(true);
    try {
      const form = new FormData();
      form.append("jd", jd.trim());
      if (resumeFile) form.append("resumeFile", resumeFile);
      else form.append("resumeText", resumeText.trim());

      const res = await fetch("/api/extract", { method: "POST", body: form });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Extraction failed (${res.status})`);
      }
      const ctx = (await res.json()) as ExtractedContext;
      const session = emptySession();
      session.context = ctx;
      saveSession(session);
      router.push("/assess");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex-1">
      {/* HERO */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-12 text-center">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 mb-6"
        >
          <Badge variant="accent">
            <Sparkles className="w-3 h-3" />
            Catalyst by Deccan AI
          </Badge>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05] max-w-3xl mx-auto"
        >
          A resume tells you what someone <span className="text-[var(--color-fg-dim)] line-through">claims</span>
          <br />
          we tell you what they <span className="gradient-text">actually know.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="text-lg text-[var(--color-fg-muted)] mt-6 max-w-2xl mx-auto"
        >
          SkillForge runs an adaptive Bloom-taxonomy interview against every skill the JD demands,
          surfaces the gap between claimed and demonstrated proficiency, and builds an
          adjacency-aware learning plan with live, web-grounded resources.
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="flex flex-wrap justify-center items-center gap-3 mt-8 text-xs text-[var(--color-fg-dim)]"
        >
          <span className="flex items-center gap-1.5"><ScanLine className="w-3.5 h-3.5" /> Adaptive interview</span>
          <span className="opacity-50">·</span>
          <span className="flex items-center gap-1.5"><Target className="w-3.5 h-3.5" /> Calibration gap</span>
          <span className="opacity-50">·</span>
          <span className="flex items-center gap-1.5"><Compass className="w-3.5 h-3.5" /> Adjacency-aware plan</span>
        </motion.div>
      </section>

      {/* INPUT GRID */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="grid md:grid-cols-2 gap-5"
        >
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[var(--color-accent)]" />
                  Job Description
                </CardTitle>
                <Badge variant="default">{jd.trim().length} chars</Badge>
              </div>
              <CardDescription>Paste the full JD — responsibilities, requirements, nice-to-haves.</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="e.g. Senior Full-Stack Engineer at a fintech...\n\nResponsibilities:\n• Design and ship..."
                value={jd}
                onChange={(e) => setJd(e.target.value)}
                rows={14}
                className="font-mono text-[13px]"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-[var(--color-accent-2)]" />
                  Your Resume
                </CardTitle>
                <Badge variant="default">{resumeFile ? "PDF" : `${resumeText.trim().length} chars`}</Badge>
              </div>
              <CardDescription>Upload a PDF or paste resume text. Stays in your browser.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 mb-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf,.txt,.md"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setResumeFile(f);
                    if (f) setResumeText("");
                  }}
                  className="text-xs text-[var(--color-fg-muted)] file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-[var(--color-border)] file:bg-[var(--color-bg-elev)] file:text-[var(--color-fg)] file:cursor-pointer file:hover:bg-[var(--color-bg-card)]"
                />
                {resumeFile && (
                  <button
                    type="button"
                    onClick={() => {
                      setResumeFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="text-xs text-[var(--color-fg-dim)] hover:text-[var(--color-fg)] flex items-center gap-1"
                  >
                    <X className="w-3 h-3" /> clear
                  </button>
                )}
              </div>
              <Textarea
                placeholder={resumeFile ? `Using uploaded file: ${resumeFile.name}` : "Or paste resume text here..."}
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                disabled={!!resumeFile}
                rows={11}
                className="font-mono text-[13px]"
              />
            </CardContent>
          </Card>
        </motion.div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 flex items-start gap-2 p-3 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 text-sm text-[var(--color-danger)]"
          >
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-[var(--color-fg-dim)]">
            <CheckCircle2 className="w-3.5 h-3.5 text-[var(--color-success)]" />
            Nothing leaves your browser except the analysis call to Gemini.
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={loadSample}>
              Load sample
            </Button>
            <Button
              variant="gradient"
              size="lg"
              disabled={loading}
              onClick={handleStart}
              className="min-w-[200px]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  Begin assessment
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS strip */}
      <section className="border-t border-[var(--color-border)]/60 bg-[var(--color-bg-elev)]/40">
        <div className="max-w-6xl mx-auto px-6 py-14 grid md:grid-cols-3 gap-6">
          <Step
            n="01"
            title="Adaptive interview"
            body="A free-text dialogue that probes deeper on weak skills and skips ahead on mastery, mapping each answer to a level on Bloom's Taxonomy."
          />
          <Step
            n="02"
            title="Calibration & gap report"
            body="An Honesty Score visualizes the delta between claimed and demonstrated level — the literal answer to the problem statement."
          />
          <Step
            n="03"
            title="Adjacency-aware plan"
            body="Live Google-grounded resources curated for skills you can realistically reach from where you already are, with time estimates and rationale."
          />
        </div>
      </section>
    </main>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-mono tracking-widest text-[var(--color-accent)]">{n}</div>
      <div className="text-base font-semibold">{title}</div>
      <div className="text-sm text-[var(--color-fg-muted)]">{body}</div>
    </div>
  );
}
