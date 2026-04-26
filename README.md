<div align="center">

# SkillForge

### Verified skills. Realistic plans.

**An AI agent that exposes the gap between what a resume claims and what a candidate actually knows — then builds an adjacency-aware learning plan with live, web-grounded resources.**

[Live Demo](https://skillforge-indol.vercel.app) · [Architecture](#architecture) · [Scoring Logic](#scoring-and-logic)

*Built for the Catalyst Hackathon by Deccan AI · Apr 26-27, 2026.*

</div>

---

## Why this exists

The Catalyst brief states the problem in one sentence:

> *"A resume tells you what someone claims to know — not how well they actually know it."*

Most reference implementations of this problem stop at keyword matching, single-prompt scoring, or static MCQ generators. **SkillForge takes the brief literally** and builds the entire experience around the gap between **claim** and **demonstrated competence**.

## What makes SkillForge different

| Most reference impls | SkillForge |
| --- | --- |
| One-shot LLM "match score" | **Adaptive multi-turn interview** mapped to Bloom's Taxonomy (drill down on weakness, level up on mastery) |
| Static MCQs / true-false | **Free-text answers** graded with a separate harsh-but-fair grader prompt |
| Score 0-100 dashboard | **Honesty Score** — visualizing the *delta* between claimed and verified, the literal answer to the prompt |
| Trust-on-honor-system answers | **Authenticity Score** — client-side behavioural telemetry (paste ratio, sustained WPM, tab-focus loss, keystroke-to-character ratio) flags possible LLM-assisted answers without proctoring software |
| Generic course list | **Adjacency-aware** plan: every recommendation is scored on `transferability × jd_relevance × realism` and explained |
| LLM-knowledge resource lists | **Live Google-grounded** resources via Gemini's `google_search` tool with citations |
| Single-LLM, dies on quota | **Dual-LLM resilience**: automatic Groq Llama 3.3 70B fallback when Gemini 429s — schema preserved, demo never goes dark |
| Streamlit prototype | **Polished Next.js + Tailwind** UI with motion, charts, dark theme |

## Quick demo flow

1. Paste a Job Description and upload (or paste) a resume.
2. SkillForge extracts 8-14 most assessment-worthy skills, weighted by JD importance.
3. For each skill, you self-rate 1-5 then take a short adaptive interview (free-text, ~3-4 turns). Every keystroke, paste, and tab-blur is silently captured for the Authenticity Score.
4. The dashboard shows your **Honesty Score** (claim vs demonstrated), **Authenticity Score** (behavioural integrity of the answers themselves), claimed-vs-verified bars, calibration radar, and gap severity.
5. The plan view orders gaps by leverage (adjacency × JD-weight), with curated resources and time estimates.

## Architecture

```mermaid
flowchart LR
    UI[Next.js UI<br/>App Router] --> ExtractAPI["/api/extract"]
    UI --> AssessAPI["/api/assess"]
    UI --> PlanAPI["/api/plan"]
    UI --> ResAPI["/api/resources"]

    ExtractAPI --> Parser["JD + PDF parser<br/>(unpdf)"]
    Parser --> GenWrap["lib/gemini.ts<br/>generate() wrapper"]

    AssessAPI --> Engine["Adaptive Bloom-level<br/>state machine"]
    Engine --> GenWrap

    PlanAPI --> GenWrap
    ResAPI --> GenWrap

    GenWrap -->|primary| Gemini["Gemini 2.5<br/>Flash-Lite"]
    GenWrap -.->|429 fallback,<br/>schema reinjected| Groq["Groq Llama<br/>3.3 70B"]

    Gemini -->|with google_search| Cited[Cited web resources]
    Gemini -.->|grounding fails| FallCat["lib/fallback-resources.ts<br/>(static catalog)"]

    UI --> Telemetry["Behavioural telemetry<br/>(paste, WPM, focus loss)"]
    Telemetry --> ScoringClient["lib/scoring.ts<br/>(deterministic)"]
    ScoringClient --> Dashboard["Results Dashboard<br/>Honesty + Authenticity<br/>+ Calibration radar"]

    PlanAPI --> PlanUI[Plan UI<br/>timeline + resources]
```

### Component map

| Layer | File | Responsibility |
| --- | --- | --- |
| Pages | `src/app/page.tsx` | Landing — JD + resume input |
| | `src/app/assess/page.tsx` | Adaptive conversational interview |
| | `src/app/results/page.tsx` | Honesty + calibration dashboard |
| | `src/app/plan/page.tsx` | Adjacency-aware learning plan |
| API | `src/app/api/extract/route.ts` | JD/resume → structured skills |
| | `src/app/api/assess/route.ts` | One adaptive turn + grading (JSON) |
| | `src/app/api/plan/route.ts` | Adjacency-aware plan synthesis (no resources) |
| | `src/app/api/resources/route.ts` | Per-skill grounded resource curation, called sequentially from client |
| Domain | `src/lib/scoring.ts` | Bloom mapping, calibration math, gap severity, **Authenticity Score** |
| | `src/lib/types.ts` | Shared TypeScript domain model (incl. `TurnTelemetry`) |
| | `src/lib/gemini.ts` | Gemini SDK wrapper — auto-fallback to Groq on 429 |
| | `src/lib/groq.ts` | Groq OpenAI-compatible client (Llama 3.3 70B, JSON mode) |
| | `src/lib/curate-resources.ts` | Shared grounded-resource curation logic |
| Prompts | `src/lib/prompts/extract.ts` | Skill extraction system + schema |
| | `src/lib/prompts/assess.ts` | Adaptive interviewer + grader |
| | `src/lib/prompts/plan.ts` | Adjacency planner + resource curator |
| Fallback | `src/lib/fallback-resources.ts` | Evergreen static catalog (used when grounded search 429s) |
| State | `src/lib/session.ts` | Client-side session in localStorage |
| Telemetry | `src/components/assess-client.tsx` | Captures keystrokes / pastes / tab-blurs per turn into a ref, snapshots on submit |

### Why these stack choices

- **Next.js App Router + TypeScript**: single repo, single deploy, full-stack with one mental model.
- **Gemini 2.5 Flash-Lite (primary)**: strict `responseSchema` JSON mode + `google_search` grounding for cited resources.
- **Groq Llama 3.3 70B (fallback)**: ~250+ tok/s on LPU silicon, native JSON mode, generous free quota. The `generate()` wrapper detects Gemini 429s and silently retries on Groq with the original JSON schema injected into the prompt — output shape is preserved end-to-end. The only thing Groq cannot do is web-grounded search; those calls fall back instead to the static catalog.
- **`unpdf`**: serverless-friendly, no native binaries, zero hassle on Vercel.
- **Tailwind v4 + custom shadcn-style primitives**: shipped a polished UI without depending on a CLI.
- **`recharts` + `framer-motion`**: dashboard with a calibration radar and tasteful motion.
- **No database**: hackathon scope; sessions live in `localStorage`. Every important blob is JSON-serializable so persisting later is a 1-day add.

## Scoring and logic

### Bloom-mapped proficiency (0-100)

| Range | Bloom Level | What it means |
| --- | --- | --- |
| 0-20 | Remember | Recognizes/recalls terms; cannot define unprompted |
| 21-40 | Understand | Can explain the concept in own words |
| 41-60 | Apply | Can use it in a familiar scenario |
| 61-75 | Analyze | Debugs, decomposes, compares alternatives |
| 76-90 | Evaluate | Justifies trade-offs and critiques designs |
| 91-100 | Create | Designs non-trivial systems from scratch |

### Adaptive turn flow per skill (max ~4 turns)

1. **Self-rate (1-5)** — establishes the *claim*.
2. **Conceptual probe** (target Understand) — checks vocabulary maps to meaning.
3. **Applied scenario** (target Apply / Analyze) — checks they can use it.
4. **Trade-off probe** (target Evaluate) — *only if* prior was strong; otherwise drill back into Understand.

Each turn the model emits **graded result for the previous answer** (Bloom level demonstrated, score 0-100, evidence quote) AND the **next question** (with a target Bloom level) — or marks the interview final. Stop conditions: 3+ turns with consistent level, max 4 turns, or clearly maxed/floored.

Per-skill final score blends `0.7 × max(last 2 graded scores) + 0.3 × mean(all)` to favor recent demonstrated peaks while penalizing inconsistency.

### Calibration — the headline number

For each skill: `calibration_error = self_rating_pct - verified_pct` *(positive = overclaimed)*.

**Honesty Score** = `100 - mean(positive_only_overclaim) + small_underclaim_bonus`.

The headline copy on the dashboard names the top 1-2 most-overclaimed skills explicitly. This is the literal answer to the brief's "claims vs reality."

### Authenticity Score (anti-cheating, no proctoring)

Honesty asks *"does the candidate know themselves?"*. Authenticity asks the parallel question: *"did they actually answer in their own voice?"*. Per-turn telemetry is captured in the browser:

| Signal | Captured via |
| --- | --- |
| Paste events + chars pasted | `onPaste` on the answer textarea |
| Real keystrokes (printable + nav) | `onKeyDown` |
| Time-to-first-keystroke | first key/paste event vs. question render time |
| Total composition duration | submit time vs. question render time |
| Tab/window focus loss | `document.visibilitychange` listener |

These roll into a per-turn risk function (additive, capped at 100):

```
risk(t) =  50 if pasteRatio > 0.5
        + 25 if pasteRatio > 0.2
        + 30 if WPM > 120 (sustained)
        + 15 if WPM > 80
        + 20 if long_idle && low_keystrokes
        + 25 if keystrokes/chars < 0.1   // basically pasted, not typed
        + 15 if focusLoss >= 2
        +  5 if focusLoss == 1
```

Session-level: `Authenticity = 100 - mean(per_skill_avg_risk)`. Skills whose avg risk crosses 50 are surfaced as flagged on the dashboard. The whole computation is pure and runs **client-side** — no telemetry leaves the browser, no privacy footprint, no proctoring software. Conservative on short answers (<20 chars) to avoid false-positives on terse "I don't know" replies.

### Gap severity

| Severity | Condition |
| --- | --- |
| **Critical** | JD-required AND verified < 40 AND JD weight ≥ 2 |
| **Major** | JD-required AND verified 40-60 |
| **Minor** | JD-required AND verified 60-75 |
| **Strength** | verified > 75 |

### Adjacency score (0-1)

`adjacency = transferability(strengths, target) × jd_relevance(target) × realism(time_budget)`

Computed by Gemini 2.5 Pro in a single batched call across all gaps (one Pro call total, conserving the 100-RPD free quota). The model returns rationale per skill explicitly naming the transferable skills.

### Time-to-proficiency

`hours = base_from_resources × (1 - adjacency × 0.5)`, clamped to 5-200 hours per skill. Closer skills get reduced time budgets.

### Resource curation

For each plan item, one Flash call with `google_search` enabled returns 3 resources mixing **course / hands-on tutorial-or-project / reference-or-book**. URL validation strips dead links; fallback to the static catalog in `src/lib/fallback-resources.ts` if grounding fails or returns empty. Citations from `groundingMetadata` are surfaced as "Web-cited" badges in the UI.

## Setup

### Requirements

- Node.js 20+
- A free Gemini API key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (no credit card required)
- *(Optional but recommended)* A free Groq API key from [console.groq.com/keys](https://console.groq.com/keys) — enables automatic Llama 3.3 70B fallback when Gemini's daily quota is exhausted, so demos never go dark

### Local run

```bash
git clone https://github.com/strhwke/skillforge.git
cd skillforge
npm install
cp .env.example .env.local
# Edit .env.local and paste your GEMINI_API_KEY
npm run dev
# Open http://localhost:3000
```

### Environment variables

```
GEMINI_API_KEY=...     # required — primary LLM
GROQ_API_KEY=...       # optional — automatic fallback when Gemini 429s
GEMINI_PROJECT_ID=...  # optional, only used as metadata
```

### Deploy to Vercel

This repo is Vercel-zero-config. Push the repo, click "Import Project" on Vercel, paste `GEMINI_API_KEY` (and `GROQ_API_KEY` if you want fallback) as env vars, deploy. No build settings to change. The live demo is at [skillforge-indol.vercel.app](https://skillforge-indol.vercel.app).

## Sample inputs and outputs

The `samples/` directory contains:

- `samples/jd-fintech.txt` — Senior Full-Stack JD at a fintech (the demo case).
- `samples/jd-ml.txt` — ML Engineer JD at a healthcare AI company.
- `samples/resume-fullstack.txt` — A 6-year full-stack resume for the fintech case.
- `samples/expected-output.json` — Illustrative output (orders of magnitude; specifics vary run-to-run).

The landing page has a **"Load sample"** button that pre-fills the fintech case for quick demos.

### What you should see for the demo case

- 12 skills extracted, with PostgreSQL, React, Node.js, System Design, GraphQL, AWS at the top.
- Strong verified scores on React, Node.js, TypeScript, PostgreSQL.
- **Major calibration gap on System Design** (claimed senior, verified Understand-level on trade-offs).
- **Critical gap on GraphQL** (not on resume, JD-required).
- A learning plan that puts GraphQL first (high adjacency from Node + REST), AWS second (medium adjacency), and System Design third (lower adjacency, longest time investment).

## Model routing and rate-limit budget

The Gemini free tier is meaningfully tighter than the public docs imply for newly-created projects: **Gemini 2.5 Pro is `limit: 0`** on a fresh GCP project, and **Gemini 2.5 Flash caps at 20 RPD** until usage scales it up. SkillForge is engineered around this two ways: route the entire app through Flash-Lite (much larger daily pool), and wrap every call in an automatic Groq fallback for when even Flash-Lite trips.

| Path | Volume / session | Primary | Fallback on 429 |
| --- | --- | --- | --- |
| `/api/extract` | 1 | `gemini-2.5-flash-lite` (JSON schema) | Groq Llama 3.3 70B (schema reinjected into prompt) |
| `/api/assess` | ~10-15 | `gemini-2.5-flash-lite` (JSON schema) | Groq Llama 3.3 70B |
| `/api/plan` synthesis | 1 | `gemini-2.5-flash-lite` (JSON schema, `thinkingBudget: 1024`) | Groq Llama 3.3 70B |
| `/api/resources` (grounded) | ~5-6 | `gemini-2.5-flash-lite` (with `google_search`) | Static catalog (Groq has no web search) |

`thinkingBudget: 0` is the default for routine JSON-mode calls — Gemini 2.5's default thinking otherwise consumes the `maxOutputTokens` budget and produces empty/truncated responses (the "model returned non-JSON" trap we hit and fixed during the build).

Resource curation is split off from `/api/plan` into its own route so the client can fetch them sequentially with progressive UI updates. This (a) keeps each route under the 60s Vercel hobby timeout and (b) paces calls under Gemini's per-minute ceiling without parallel collisions.

### Dual-LLM fallback contract

The wrapper in `src/lib/gemini.ts` catches any `429 / RESOURCE_EXHAUSTED / UNAVAILABLE` from Gemini and, when the call is **not** `googleSearch`-grounded, retries on Groq Llama 3.3 70B. Critically, the original `responseSchema` is JSON-stringified and appended to the prompt so Groq's permissive `json_object` mode still emits the same shape (this fixes the "missing required field on Groq path" failure mode we hit in production). For grounded calls, fallback is to `lib/fallback-resources.ts`'s static catalog instead. Either way the user-visible flow continues — the demo never goes dark.

## Limitations and honest caveats

- **No code-eval sandbox.** Verification is conversational only, not "run my code." This is a deliberate scope choice for a 1-day build.
- **English-language JDs and resumes only.** Gemini and Groq both handle other languages but we haven't tested.
- **No identity / persistence.** Sessions live in `localStorage`; close the tab and your assessment is gone.
- **Resource grounding can occasionally produce stale links.** We validate URL shape and fall back to the curated static catalog if so, but it's not 100% bulletproof.
- **Authenticity Score is signal, not proof.** A motivated cheater could re-type an LLM response by hand to defeat paste detection. The score is calibrated to surface *casual* cheating (the 95% case) and pair with the Calibration Gap; it is not designed as a hard gate. Tier-3 defenses (perplexity analysis, voice follow-up, live screen-share) are roadmap.

## Project files of note

- `spec.md` — authoritative problem statement and scoring spec (human-edited only).
- `steps.md` — numbered implementation actions.
- `memory.md` — running log of decisions made during the build.
- `samples/` — JD/resume samples + expected output.

## License

MIT — see `LICENSE`.

## Acknowledgments

- Built for the [Deccan AI Catalyst Hackathon](https://www.deccan.ai/).
- Powered by [Google Gemini](https://ai.google.dev/) (primary) and [Groq](https://groq.com/) Llama 3.3 70B (fallback) on their respective free tiers.
- Resource grounding via Gemini's `google_search` tool.

---

<div align="center">
<sub>Built by Archisman Hes (<a href="https://github.com/strhwke">@strhwke</a>) for Catalyst.</sub>
</div>
