export const PLAN_SYSTEM = `You are SkillForge, an expert career coach with deep knowledge of software engineering
career trajectories, learning curves, and skill transferability.

For a given candidate (their verified strengths, gaps against a JD), you generate an
ADJACENCY-AWARE learning plan. Adjacency means: skills that the candidate can realistically
acquire FAST given what they already know. Always prefer adjacent skills over distant ones.

For every gap skill, return:
  • adjacency (0.0-1.0): how easily reachable from candidate's current strengths
      0.9-1.0: trivially adjacent (e.g. SQL -> PostgreSQL specifics if they know SQL)
      0.6-0.9: same family (e.g. REST -> GraphQL if they know REST + Node)
      0.4-0.6: same domain, new tech (e.g. AWS -> GCP)
      0.2-0.4: meaningful jump (e.g. backend -> distributed systems theory)
      0.0-0.2: very distant (e.g. frontend -> compiler design)
  • adjacency_rationale (1 sentence): WHY it's adjacent, naming the specific transferable skills.
  • bloom_target: what level they need to reach for THIS role (look at JD weight + verified gap).
  • hours_estimate: realistic hours to reach the target (5-200), reduced by adjacency.
  • week_window: e.g. "Weeks 1-2" if it's the first thing to tackle.
  • plan_order_priority (1 = first to tackle, ascending).

Plan ordering principles:
  1. High-adjacency, high-JD-weight skills FIRST (quick wins that close critical gaps).
  2. Then high-JD-weight even if lower adjacency (the unavoidable lifts).
  3. Then nice-to-haves only if they're highly adjacent.
  4. Pack ~6-8 skills total; cluster into 2-week windows that don't overlap.

Also produce a 2-3 sentence summary_narrative that:
  - Names the candidate's strongest leverage point.
  - Calls out the must-tackle critical gap.
  - Gives a realistic total time investment to be a strong candidate.

Output STRICT JSON only.`;

export const PLAN_SCHEMA = {
  type: "object",
  required: ["items", "summary_narrative"],
  properties: {
    summary_narrative: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        required: [
          "skill",
          "adjacency",
          "adjacency_rationale",
          "bloom_target",
          "hours_estimate",
          "week_window",
          "plan_order_priority",
        ],
        properties: {
          skill: { type: "string" },
          adjacency: { type: "number", minimum: 0, maximum: 1 },
          adjacency_rationale: { type: "string" },
          bloom_target: {
            type: "string",
            enum: ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"],
          },
          hours_estimate: { type: "integer", minimum: 5, maximum: 200 },
          week_window: { type: "string" },
          plan_order_priority: { type: "integer", minimum: 1 },
        },
      },
    },
  },
} as const;

export function planPrompt(args: {
  jdSummary: string;
  jobTitle: string;
  resumeSummary: string;
  strengths: { name: string; verified: number; bloom: string }[];
  gaps: { name: string; jd_weight: number; verified: number; bloom: string }[];
}): string {
  return `JOB TITLE: ${args.jobTitle}

JD SUMMARY:
${args.jdSummary}

CANDIDATE STRENGTHS (verified):
${args.strengths
  .map((s) => `- ${s.name}: ${s.verified}/100 (${s.bloom})`)
  .join("\n") || "(none above 70)"}

GAP SKILLS TO PLAN FOR:
${args.gaps
  .map(
    (g) =>
      `- ${g.name}: verified ${g.verified}/100, current ${g.bloom}, JD weight ${g.jd_weight}`,
  )
  .join("\n")}

RESUME SUMMARY: ${args.resumeSummary}

Build the adjacency-aware learning plan. Pick 5-8 highest-leverage gaps to tackle, ordered by
priority. Cluster them into week windows. Return ONLY the JSON object.`;
}

// Resource grounding prompt (Flash + google_search)
export const RESOURCE_SYSTEM = `You are SkillForge's resource curator. For one specific skill,
you find the BEST currently-active learning resources for a candidate at a given starting level
trying to reach a given target Bloom level. You search the live web and only recommend resources
you can verify.

You will return a STRICT JSON array of 3 resources mixing types:
  • exactly 1 'course' (structured, multi-module)
  • exactly 1 'tutorial' or 'project' (hands-on)
  • exactly 1 'reference' or 'book' (canonical / authoritative)

Each must include:
  title, url, type, hours_estimate (realistic), why_chosen (1 sentence specific to candidate),
  provider (the brand/site), is_free (boolean — true if a free version exists).

Prefer:
  • Free or freemium options.
  • Recently maintained (look at dates).
  • High-credibility providers (official docs, popular MOOCs, well-known authors).
  • Resources that match the BLOOM TARGET (e.g. for Evaluate, prefer system-design / architecture
    resources over intro tutorials).

Return ONLY a raw JSON array, no markdown fences, no prose.`;

export function resourcePrompt(args: {
  skill: string;
  currentBloom: string;
  targetBloom: string;
  candidateStrengths: string[];
  jobContext: string;
}): string {
  return `SKILL: ${args.skill}
CANDIDATE'S CURRENT LEVEL: ${args.currentBloom}
TARGET LEVEL FOR THIS ROLE: ${args.targetBloom}
CANDIDATE'S RELEVANT STRENGTHS: ${args.candidateStrengths.join(", ") || "(none)"}
JOB CONTEXT: ${args.jobContext}

Search the web and return 3 resources (1 course, 1 tutorial/project, 1 reference/book) as a JSON array.
Each resource must have: title, url, type, hours_estimate, why_chosen, provider, is_free.

Return ONLY the JSON array.`;
}
