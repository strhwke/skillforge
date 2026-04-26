# SkillForge — Implementation Steps

> Numbered actions derived from `spec.md`. Mirror of the Cursor plan todos.

## Phase 0 — Setup

0.1 Verify toolchain (git, node, npm)
0.2 Scaffold Next.js TS + Tailwind + App Router project
0.3 Install dependencies (`@google/genai`, `unpdf`, `recharts`, `framer-motion`, `lucide-react`, radix primitives, `zod`)
0.4 Configure `.env.local` and `.env.example`; verify `.env*` is gitignored
0.5 Initialize `memory.md`, `spec.md`, `steps.md`
0.6 Initialize shadcn/ui and install core components
0.7 Create GitHub repo, push initial commit
0.8 Connect Vercel and verify hello-world deploy

## Phase 1 — Extraction pipeline

1.1 Define shared types in `src/lib/types.ts`
1.2 Build Gemini SDK wrapper in `src/lib/gemini.ts` with model routing (flash vs pro vs grounded)
1.3 PDF resume parser using `unpdf` in `src/lib/parse-resume.ts`
1.4 JD parser (plain text) with light cleanup
1.5 Skill extraction prompt (Flash, structured JSON output) in `src/lib/prompts/extract.ts`
1.6 `/api/extract` route accepting JD text + resume text/PDF, returning structured Skill[]
1.7 Sample inputs in `samples/jd-fintech.txt` and `samples/resume-fullstack.txt`

## Phase 2 — Adaptive assessment

2.1 Bloom level state machine in `src/lib/assessment/state.ts`
2.2 Question generator prompt + grader prompt in `src/lib/prompts/`
2.3 `/api/assess/turn` route handling turn-by-turn state
2.4 Chat UI at `src/app/assess/page.tsx` (shadcn chat, current-skill chip, progress bar, skip-skill action)
2.5 LocalStorage persistence

## Phase 3 — Scoring + dashboard

3.1 Scoring math in `src/lib/scoring.ts` (Bloom mapping, aggregation, calibration)
3.2 `/api/score` route to synthesize SkillScore[] from assessment transcript (Pro for narrative)
3.3 Dashboard at `src/app/results/page.tsx`: Honesty Score hero, claimed-vs-verified bars, radar chart, gap list

## Phase 4 — Plan + resources

4.1 Adjacency analyzer in `src/lib/adjacency.ts` (single Pro call for all gaps)
4.2 Resource curator with `google_search` grounding in `src/lib/resources.ts`
4.3 Static fallback catalog in `src/lib/fallback-resources.ts`
4.4 `/api/plan` route stitching adjacency + resources
4.5 Plan UI at `src/app/plan/page.tsx` (timeline, resource cards, why-adjacent rationale, export)

## Phase 5 — Polish + deploy

5.1 README with architecture diagram (mermaid + PNG), scoring writeup, setup, sample I/O section
5.2 Architecture PNG in `docs/architecture.png`
5.3 MIT LICENSE
5.4 Production Vercel deploy
5.5 Invite `hackathon-deccan-ai` to repo

## Phase 6 — Demo video

6.1 Script the fintech-full-stack use case
6.2 Record 3–5 min walkthrough
6.3 Upload to Loom/YouTube unlisted

## Phase 7 — Submit

7.1 Fill Catalyst submission form before 1 AM IST Apr 27
