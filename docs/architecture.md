# SkillForge — Architecture

## High-level system diagram

```mermaid
flowchart TB
    subgraph client [Client - Next.js App Router, React 19]
        Landing["Landing<br/>JD + Resume input"]
        AssessUI["Assess<br/>Adaptive chat UI"]
        ResultsUI["Results<br/>Calibration dashboard"]
        PlanUI["Plan<br/>Learning timeline"]
        Session["lib/session.ts<br/>localStorage state"]
        ScoringClient["lib/scoring.ts<br/>(deterministic math)"]
    end

    subgraph server [Server - Next.js Route Handlers, Node runtime]
        Extract["/api/extract"]
        Assess["/api/assess"]
        Plan["/api/plan"]
    end

    subgraph genai [Google Gemini API]
        Flash["Gemini 2.5 Flash<br/>10 RPM / 250 RPD"]
        Pro["Gemini 2.5 Pro<br/>5 RPM / 100 RPD"]
        Grounded["Gemini 2.5 Flash<br/>+ google_search<br/>500 RPD free"]
    end

    Landing -- "POST jd + resume(PDF or text)" --> Extract
    Extract -- "structured skill JSON" --> Flash
    Extract -- "ExtractedContext" --> Session

    AssessUI -- "POST current skill + answer" --> Assess
    Assess -- "next_question + grading" --> Flash

    Session --> ScoringClient
    ScoringClient --> ResultsUI

    PlanUI -- "POST scores + context" --> Plan
    Plan -- "1 call: plan synthesis" --> Pro
    Plan -- "N calls: 1 per skill" --> Grounded
    Plan -- "fallback if grounding fails" --> Static["fallback-resources.ts"]
```

## Request flow per phase

### 1. Extraction

```mermaid
sequenceDiagram
    participant U as User
    participant L as Landing
    participant E as /api/extract
    participant G as Gemini Flash
    U->>L: paste JD + upload PDF
    L->>E: POST multipart (jd, resumeFile)
    E->>E: unpdf -> text
    E->>G: extraction prompt + JSON schema
    G-->>E: ExtractedContext
    E-->>L: 200 ExtractedContext
    L->>L: save session, route to /assess
```

### 2. Adaptive assessment (per turn)

```mermaid
sequenceDiagram
    participant U as User
    participant A as /assess UI
    participant API as /api/assess
    participant G as Gemini Flash
    A->>U: shows current question
    U->>A: types answer
    A->>API: POST { skill, prior_turns, latest_answer }
    API->>G: assess prompt + JSON schema
    G-->>API: { grading_of_previous, next_question, target_bloom, is_final }
    API-->>A: returns turn result
    A->>A: append to transcript, persist session
    Note over A: if is_final, show summary card,<br/>advance to next skill
```

### 3. Results (deterministic, no LLM)

```mermaid
flowchart LR
    Session --> ScoringClient
    ScoringClient -- "computeSkillScores()" --> Scores["SkillScore[]"]
    Scores -- "computeSummary()" --> Summary["ScoreSummary<br/>(honesty, match, headlines)"]
    Scores --> Bars["claimed-vs-verified bars"]
    Scores --> Radar["calibration radar chart"]
    Scores --> Gaps["severity-classified gap list"]
```

### 4. Plan + grounded resources

```mermaid
sequenceDiagram
    participant P as Plan UI
    participant API as /api/plan
    participant Pro as Gemini 2.5 Pro
    participant Search as Gemini 2.5 Flash<br/>+ google_search
    participant FB as Fallback catalog
    P->>API: POST { context, scores }
    API->>API: filter top 5-8 gaps + strengths
    API->>Pro: plan prompt (1 call, all skills)
    Pro-->>API: { items[], summary_narrative }
    par per top-6 plan items
        API->>Search: resource curation prompt
        Search-->>API: { 3 cited resources }
        API-->>API: validate URLs
        Note over API: on failure or empty, use fallback
        API-->>FB: getFallbackResources(skill)
    end
    API-->>P: complete LearningPlan
    P->>P: render with motion, allow markdown export
```

## Data contracts

See `src/lib/types.ts` for the canonical schema. Highlights:

- `ExtractedContext` — JD title, summary, resume summary, candidate strengths, and the skills array with JD weight (0-3) and resume mention boolean.
- `AssessmentTurn` — one Q+A+grading record.
- `SkillScore` — final per-skill score with calibration error, severity, evidence quotes.
- `ScoreSummary` — Honesty Score, overall match, top strengths, critical gaps, headline note.
- `LearningPlanItem` — one targeted skill with adjacency, rationale, hours, week window, and resources.
- `LearningPlan` — total hours, weeks, items array, summary narrative.

## Scoring math (in plain prose)

1. Each turn produces a graded result `{bloom, score 0-100, evidence}` from a separate grading instruction in the same prompt as the next-question generator.
2. Per-skill final = `0.7 × max(last 2 graded scores) + 0.3 × mean(all graded scores)`.
3. Per-skill bloom = highest level demonstrated in the last 2 turns.
4. Calibration error = `self_rating_pct - verified_pct` (positive means overclaim).
5. **Honesty Score** = `100 - mean(positive_only_calibration_error) + (1.5 × count_of_underclaimers)`. Capped 0-100.
6. **Overall match** = JD-weight-weighted average of verified scores (`weight = jd_weight, or 0.5 for adjacent skills`).
7. **Severity** classification: critical (req + <40 + weight≥2), major (req + 40-60), minor (req + 60-75), strength (>75).
8. **Adjacency** is decided by Gemini 2.5 Pro from a single batched prompt across all gaps, weighted by `transferability × jd_relevance × realism`.
9. **Hours estimate** = `base × (1 - adjacency × 0.5)`, clamped 5-200.

## Rate-limit design

Per typical session:

- Extraction: 1 Flash call
- Assessment: ~8 skills × ~1.3 turns avg = ~10-12 Flash calls
- Plan synthesis: 1 Pro call
- Resource curation: 5-7 grounded Flash calls

Total per session: ~18-22 Flash + 1 Pro + ~6 grounded — comfortably within Gemini free-tier daily limits (Flash 250 RPD, Pro 100 RPD, Grounding 500 RPD).
