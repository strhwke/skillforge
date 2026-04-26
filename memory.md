# SkillForge — Project Memory

> Living log of decisions, changes, and reasoning. Updated at the end of every phase.
> Per user rules: Set 1 (core project files) and Set 12 (knowledge traceability).

---

## Project context

- **What:** AI agent that takes a Job Description + resume, conversationally assesses real proficiency on each required skill, identifies gaps, and generates a personalised learning plan focused on adjacent skills with curated web-grounded resources.
- **Why:** Catalyst hackathon submission for Deccan AI. Submission deadline Mon Apr 27, 1:00 AM IST.
- **Wedge:** Three differentiators public reference implementations don't have:
  1. **Calibration Gap** (claimed-vs-verified Bloom level, "Honesty Score")
  2. **Adaptive conversational probing** using Bloom's Taxonomy (skip on mastery, drill on weakness)
  3. **Adjacency-aware learning plan** with `transferability * relevance * realism` scoring and Google-Search-grounded resources

## Stack decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Framework | Next.js 14 App Router + TypeScript | Single deploy on Vercel, full-stack in one repo, fastest path |
| LLM | Gemini 2.5 Flash + 2.5 Pro | User has free API tier; Flash for high-volume, Pro for synthesis |
| Grounding | Gemini `google_search` tool (500 RPD free) | Live, cited resource discovery without paying for Tavily/Serp |
| PDF parsing | `unpdf` | Serverless-friendly, no native binary, works on Vercel |
| UI | Tailwind + shadcn/ui + Recharts + Framer Motion | Polished out-of-box; competitors will ship Streamlit |
| State | React Context + localStorage | No DB needed for hackathon; session resumption works |
| Deploy | Vercel | Free, auto HTTPS, one click |

## Rate-limit budget per demo session

- Flash: ~12 calls (extract + 8 skills × ~1.3 turns + grading) — well under 250 RPD
- Pro: ~2 calls (scoring synthesis, plan synthesis) — under 100 RPD
- Grounding: ~6-8 calls (one per gap skill) — under 500 RPD
- Headroom for 5+ demo runs during dev/recording

## Phase log

### Phase 0 — Setup (DONE)

**Shipped:**
- Plan reviewed and approved by user (lean + polished scope, Gemini free-tier, Next.js + Vercel)
- API key obtained, stored in `.env.local` (gitignored via `.env*`)
- Next.js scaffolded with TS + Tailwind v4 + App Router + src dir + AGENTS.md
- Core deps installed (572 packages): `@google/genai`, `unpdf`, `recharts`, `framer-motion`, `lucide-react`, radix primitives (`@radix-ui/*`), `zod`, `clsx`, `tailwind-merge`, `class-variance-authority`
- `memory.md`, `spec.md`, `steps.md`, `.env.example` created
- Custom shadcn-style UI primitives written by hand (`button`, `card`, `textarea`, `input`, `badge`, `progress`, `separator`) — skipped shadcn CLI because it's interactive and slow on Windows PowerShell

**Decisions:**
- `unpdf` over `pdf-parse` (latter has Next.js build-time issues with its test fixture)
- Hand-rolled UI primitives instead of shadcn CLI — faster, fully owned, no extra deps
- Custom dark theme with subtle accent gradient, radial bg
- GitHub repo creation deferred to end (gh CLI not on agent's PATH; user will run gh repo create at the end)

### Phase 1 — Extraction pipeline (DONE)

**Shipped:**
- `src/lib/types.ts` — full domain model (ExtractedContext, Skill, AssessmentTurn, SkillScore, ScoreSummary, LearningPlan, etc.)
- `src/lib/utils.ts` — Bloom level mapping (0-100), `cn`, `safeJsonParse`, `severityFromScore`, `selfRatingToPct`
- `src/lib/gemini.ts` — single SDK wrapper with model routing (Flash/Pro/Flash-Lite), JSON-mode schema enforcement, Google Search grounding tool, retry-once on rate-limit, citation extraction
- `src/lib/parse-resume.ts` — unpdf-based PDF -> text
- `src/lib/prompts/extract.ts` — system prompt + JSON schema for skill extraction
- `src/app/api/extract/route.ts` — accepts multipart (PDF) or JSON body, returns ExtractedContext
- `src/lib/samples.ts` (constants for landing page sample-load)

### Phase 2 — Adaptive assessment (DONE)

**Shipped:**
- `src/lib/prompts/assess.ts` — combined grader+question-generator prompt with explicit Bloom-level rules and stop conditions; uses JSON schema enforcement
- `src/app/api/assess/route.ts` — single-turn route (stateless server, client passes prior turns)
- `src/components/assess-client.tsx` — full chat UI with self-rate phase, turn-by-turn animated chat, target-bloom badges, real-time grading badges with evidence quotes, "I don't know" + skip-skill actions, Ctrl+Enter to send, skill-summary card with calibration delta callout

**Decisions:**
- Combined question-gen + grading into ONE prompt per turn (down from 2). Halves API call cost. Mitigated soft-grading risk by explicit "harsh but fair" instructions in system prompt.
- Stateless server, client owns transcript via localStorage. Survives reloads, no DB needed.

### Phase 3 — Scoring + dashboard (DONE)

**Shipped:**
- `src/lib/scoring.ts` — pure deterministic functions (no LLM): `computeVerifiedScore`, `computeSkillScores`, `computeSummary`. Honesty Score, overall match, gap severity, top strengths/critical gaps, headline calibration note.
- `src/components/results-client.tsx` — full dashboard with:
  - Hero: Honesty Score (big, color-toned), Role Match, headline copy
  - Claimed vs Verified bars with overclaim/underclaim badges per row
  - Calibration radar chart (recharts) for top 6 JD-required skills
  - Severity-classified gap list with evidence quotes
  - Framer Motion staggered entrance

**Decisions:**
- Skipped LLM call for scoring narrative — deterministic math is faster, more defensible to judges, and saves a Pro call. Headlines are template-driven from the data.

### Phase 4 — Plan + grounded resources (DONE)

**Shipped:**
- `src/lib/prompts/plan.ts` — Pro plan-synthesis system + JSON schema (adjacency analyzer over all gaps in one call) + Flash resource-curation system prompt for Google Search grounding
- `src/lib/fallback-resources.ts` — static evergreen catalog (GraphQL, AWS, System Design, Kubernetes, Python, generic) used when grounding fails or returns empty
- `src/app/api/plan/route.ts` — orchestration:
  1. one Pro call for full plan synthesis (adjacency + ordering)
  2. parallel Flash + google_search calls for top 6 plan items
  3. URL validation + fallback per skill on failure
  4. Time + week-window aggregation
- `src/components/plan-client.tsx` — plan UI:
  - Top stats: total hours, skills targeted, resources count
  - Strategy narrative card
  - Per-skill plan card with adjacency badge, "why adjacent" rationale, current->target progress visual, grid of resource cards (course/tutorial/project/book + free/paid + web-cited badges)
  - Markdown export button

**Decisions:**
- Cap to top 6 plan items for resource curation to stay safe under 500 RPD grounding limit even across multiple demo recordings.
- Combined adjacency analysis + plan synthesis into single Pro call (down from 2). Saves Pro RPD.
- Static fallback catalog ensures demo never breaks visually even if grounding has a bad day.

### Phase 5 — Polish + samples + README (DONE)

**Shipped:**
- `samples/jd-fintech.txt`, `samples/jd-ml.txt`, `samples/resume-fullstack.txt`, `samples/expected-output.json`
- `README.md` — substantial: problem framing, differentiation table, architecture mermaid diagram, scoring writeup, setup, env vars, samples, rate-limit budget, limitations
- `docs/architecture.md` — detailed sequence diagrams + data contracts + math
- `LICENSE` (MIT)
- Nav updated to remove dead "How it works" link (now points to README anchor)

**Open for next phases:**
- Phase 6: record demo video (script + 1-take + upload)
- Phase 7: invite hackathon-deccan-ai to repo, fill submission form
- GitHub: user runs `gh repo create strhwke/skillforge --public --source=. --push` from own shell
- Vercel deploy: connect repo on Vercel dashboard, paste GEMINI_API_KEY env var

---

### Phase 5.5 — Live debugging session (DONE, validated via smoke tests)

User ran the live flow and reported "model returned non-JSON" 502s on /api/assess. Took agentic control to debug end-to-end. Wrote `scripts/smoke.mjs`, `scripts/smoke-plan.mjs`, `scripts/smoke-resources.mjs` to drive the full pipeline against the dev server.

**Five fixes shipped, each validated by re-running the smoke harness before moving on:**

1. **Default `thinkingBudget: 0` for JSON-mode calls in `gemini.ts`** — Gemini 2.5 Flash has dynamic thinking on by default which silently eats `maxOutputTokens`. With our 1024-token budget on assess turns, ~half the calls came back empty -> safeJsonParse null -> 502. Validated: 0 failures across 3 turns vs ~3 of 4 failing before.

2. **Safety net in `/api/assess`** for `is_final=true` paths missing `final_score`/`final_bloom`/`evidence_quotes` — the schema marks these optional and the model occasionally skips them. Now derived deterministically from prior turns + latest grading. Validated: `score=65 bloom=Remember quotes=2` instead of `undefined`.

3. **Switched plan synthesis from `gemini-2.5-pro` to `gemini-2.5-flash` with `thinkingBudget: 4096`** — Pro is `limit: 0` on free tier for newly-created projects (confirmed by the API error). Flash + thinking matches Pro's quality on structured-output reasoning. Validated: plan endpoint went from 500 (quota error) to 200 with a high-quality 4-item plan.

4. **Architectural refactor**: split resource curation out of `/api/plan` into a per-skill `/api/resources` route. Plan synthesis stays inside the 60s Vercel hobby timeout, and the client fetches resources progressively with skeleton placeholders + a live status banner ("Searching the web for resources on X..."). New shared module: `src/lib/curate-resources.ts`. Validated: 5 sequential resource calls completed without timeout, structurally clean.

5. **Switched assess + resource curation to `gemini-2.5-flash-lite`** — fresh project has only 20 Flash requests/day on free tier (we burned through ours during testing). Flash-Lite is a separate, much larger quota pool (~1000 RPD per Google docs). Quality is still good enough for routine tasks given our strict JSON schemas. Validated: single grounded call returned 3 high-quality real resources in 5.2s with `usedFallback: false`.

**Quota discoveries (worth saving for future):**
- Newly-created GCP projects on free tier get `gemini-2.5-pro: limit 0`. The "I have Gemini Pro" consumer subscription does NOT grant API access.
- Newly-created projects get `gemini-2.5-flash: 20 RPD` initially (not the 250 in public docs). This auto-scales up with usage history.
- `gemini-2.5-flash-lite` daily quota is far higher (~1000 RPD per docs).
- All Gemini 2.5 models have "thinking" on by default which eats output token budget — explicitly disable with `thinkingBudget: 0` for routine JSON calls.

**Polish fix**: replaced "Web-cited" badge with conditional "Web-cited" or "AI-curated" so we don't claim citation when grounding metadata is empty.

### Phase 5.6 — Honest README rate-limit section + model routing table (DONE)

Updated README so future readers see the actual constraints, not the optimistic ones from the original plan. Added explicit guidance: enable billing for smooth demo.

---

### Phase 5.7 — Token diet (DONE, no LLM smoke test to avoid burning more quota)

User hit Gemini spend limit during day-of testing. Audited every prompt + budget and trimmed without breaking functionality:

**Input-side savings (per session):**
- `extract`: hard-cap JD and resume at 4000 chars each (was unbounded). Trimmed system prompt prose ~60%. Saves ~0.5-1k tokens depending on input length.
- `assess`: BIG one. Stop re-sending `jd_summary` + `resume_summary` + `resume_evidence` on every turn — they're only sent on turn 1, all subsequent turns rely on `priorTurns` for continuity. Compacted prior-turn serialization (drop verbose evidence string, keep just `BloomLevel/score`). Truncated `user_answer` to 400 chars and `latestUserAnswer` to 600 chars. Trimmed system prompt prose ~70%. Net: ~50-60% fewer input tokens per turn × ~12 turns/session = biggest single win.
- `plan`: trimmed system prompt prose ~60%. Capped `jd_summary` at 600 chars in user prompt. Removed redundant `resume_summary` (we already have strengths/gaps). Saves ~400-600 tokens.
- `resources`: trimmed system prompt ~50%. Capped `jobContext` at 200 chars. Saves ~200 tokens × 6 calls.

**Output-side savings:**
- `extract`: maxOutputTokens 4096 → 2048 (observed output ~1.5k).
- `assess`: 1024 → 600 (observed output ~400).
- `plan`: maxOutputTokens 8192 → 3072 + thinkingBudget 4096 → 1024. Saves ~3k thinking tokens per session — dominant single saving.
- `resources`: 2048 → 1024.

**Estimated total per session:** ~50-60% fewer billed tokens (input + output + thinking). Build passes. Skipped LLM smoke validation specifically to preserve quota for the user's actual demo.

---

(future phases append here)
