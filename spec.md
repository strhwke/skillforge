# SkillForge — Specification

> **Authoritative.** Per user rule Set 13: this file is human-edited only. Cursor must flag conflicts, not auto-modify.

---

## 1. Problem statement (verbatim from Catalyst brief)

> A resume tells you what someone claims to know — not how well they actually know it. Build an agent that takes a Job Description and a candidate's resume, conversationally assesses real proficiency on each required skill, identifies gaps, and generates a personalised learning plan focused on adjacent skills the candidate can realistically acquire — with curated resources and time estimates.

## 2. Required deliverables

- [ ] Working prototype (deployed URL)
- [ ] Public source repo with README
- [ ] 3–5 minute demo video
- [ ] Architecture diagram + brief description of scoring/logic
- [ ] Sample inputs and outputs
- [ ] Repo access shared with `hackathon-deccan-ai`
- [ ] Submission via form before Mon Apr 27, 1:00 AM IST

## 3. Analysis (Essential / Important / Optimal / Optional)

### Essential — must ship

- JD + resume ingestion (paste/upload)
- Skill extraction from both, intersected and prioritized
- Conversational, multi-turn, **adaptive** assessment per skill (free-text answers, not MCQ)
- Per-skill verified proficiency score (0–100, mapped to Bloom)
- Gap identification with severity classification
- Learning plan with curated resources and time estimates
- Deployed prototype + public repo + README + demo video + sample I/O + architecture diagram

### Important — strong differentiation

- **Calibration gap** ("Honesty Score") visualization — direct answer to "claims vs knows"
- **Adjacency analysis** — recommendations weighted by realism given current strengths
- **Live web-grounded resources** with citations (Gemini google_search tool)
- Polished, animated dashboard UI

### Optimal — if time permits

- Radar chart of claimed vs verified across top skills
- Export learning plan as Markdown/PDF
- Localstorage session resumption

### Optional — explicitly out of scope

- Code-eval sandbox for hands-on verification
- Multi-resume comparison
- Auth / users / database persistence
- Resume rewriting / tailoring (other hackathons solve this)
- Recruiter-side dashboard

## 4. Scoring and logic specification

### 4.1 Bloom-mapped proficiency scale (0–100)

| Range | Bloom Level | Meaning |
| --- | --- | --- |
| 0–20 | Remember | Recognize/recall terms; cannot define unprompted |
| 21–40 | Understand | Explain concept in own words |
| 41–60 | Apply | Use in a familiar scenario |
| 61–75 | Analyze | Debug, decompose, compare alternatives |
| 76–90 | Evaluate | Justify trade-offs, critique design |
| 91–100 | Create | Design non-trivial systems from scratch |

### 4.2 Adaptive turn flow per skill (max ~4 turns)

1. Self-rate 1–5 (claimed level)
2. Conceptual probe (target Understand)
3. Applied scenario (target Apply / Analyze)
4. Trade-off probe (target Evaluate) — only if step 3 was strong; otherwise drill back into Understand

Each turn: question generator (Gemini Flash) emits target Bloom level + question; separate grader call emits `{bloom_level_demonstrated, evidence_quote, score_0_100}`. Final per-skill score = weighted blend favoring the highest consistent level demonstrated.

### 4.3 Calibration

Per skill: `calibration_error = |self_rating_pct - verified_pct|`.

Aggregate **Honesty Score** = `100 - mean_overconfidence_only` (underconfidence not penalized; given a small bonus to reward humility).

### 4.4 Gap severity

| Severity | Condition |
| --- | --- |
| Critical | JD-required AND verified < 40 AND JD weight high |
| Major | JD-required AND verified 40–60 |
| Minor | JD-required AND verified 60–75 |
| Strength | verified > 75 |

### 4.5 Adjacency score (0–1)

`adjacency = transferability(known_skills, target) * jd_relevance(target) * realism(time_budget)`

Computed by Gemini 2.5 Pro in a single batched call across all gap skills, returning structured JSON with rationale per skill (this conserves the 100-RPD Pro quota).

### 4.6 Time-to-proficiency estimate

`hours = base_from_resources * (1 - adjacency * 0.5)`, clamped to 5–200 hours per skill. Closer (more adjacent) skills take less time.

### 4.7 Resource curation

Per gap skill, one Gemini 2.5 Flash call with `google_search` tool. Prompt asks for a mix of: 1 structured course, 1 hands-on tutorial/project, 1 reference doc/book. Returns JSON with `title, url, type, hours_estimate, why_chosen, provider_credibility`. Falls back to a static catalog if grounding fails or returns dead links.

## 5. Data contracts (high-level)

```ts
type Skill = { name: string; jd_weight: 0|1|2|3; mentioned_in_resume: boolean }

type AssessmentTurn = {
  skill: string
  question: string
  target_bloom: BloomLevel
  user_answer: string
  graded: { bloom_level_demonstrated: BloomLevel, score: number, evidence: string }
}

type SkillScore = {
  name: string
  self_rating_pct: number
  verified_pct: number
  calibration_error: number
  bloom_level: BloomLevel
  evidence_quotes: string[]
}

type LearningPlanItem = {
  skill: string
  current: number; target: number
  adjacency: number; rationale: string
  hours_estimate: number
  resources: Array<{ title: string; url: string; type: 'course'|'tutorial'|'project'|'reference'; hours: number; why_chosen: string }>
}
```

## 6. Non-goals / explicit constraints

- No PII storage server-side; everything client-side or in-flight only.
- API key only in `.env.local`, never committed.
- Must run within Gemini free-tier rate limits.
- Must work fully without the user creating an account.
