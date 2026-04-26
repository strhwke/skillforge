export const PLAN_SYSTEM = `You are SkillForge, an expert career coach. Generate an ADJACENCY-AWARE learning plan: prefer skills the candidate can acquire fast given what they already know.

For each gap skill output:
- adjacency (0-1): 0.9+ trivially adjacent, 0.6-0.9 same family, 0.4-0.6 same domain new tech, 0.2-0.4 meaningful jump, <0.2 very distant.
- adjacency_rationale (1 sentence): name the specific transferable skills.
- bloom_target: required level for this role.
- hours_estimate (5-200): realistic hours, reduced by adjacency.
- week_window: e.g. "Weeks 1-2".
- plan_order_priority (1=first).

Order: high-adjacency + high-JD-weight first; then unavoidable high-weight lifts; nice-to-haves last only if highly adjacent. Pick 5-8 skills, cluster into non-overlapping 2-week windows.

summary_narrative (2-3 sentences): name strongest leverage point, must-tackle critical gap, realistic total time investment.

Strict JSON only.`;

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
  return `ROLE: ${args.jobTitle}
JD: ${args.jdSummary.slice(0, 600)}

STRENGTHS:
${args.strengths.map((s) => `- ${s.name} ${s.verified} (${s.bloom})`).join("\n") || "(none above 70)"}

GAPS:
${args.gaps.map((g) => `- ${g.name} verified=${g.verified} current=${g.bloom} weight=${g.jd_weight}`).join("\n")}

Build the adjacency-aware plan (5-8 items). JSON only.`;
}

export const RESOURCE_SYSTEM = `You are SkillForge's resource curator. Use web search; only recommend resources you can verify exist.

Return a strict JSON array of exactly 3 items: 1 'course' (multi-module), 1 'tutorial' or 'project' (hands-on), 1 'reference' or 'book' (authoritative).

Each item: {title, url, type, hours_estimate, why_chosen (1 sentence specific to candidate), provider, is_free}.

Prefer free/freemium, recently maintained, high-credibility (official docs, popular MOOCs, known authors). Match the bloom target (e.g. Evaluate -> system-design over intro tutorials).

Raw JSON array only, no markdown fences.`;

export function resourcePrompt(args: {
  skill: string;
  currentBloom: string;
  targetBloom: string;
  candidateStrengths: string[];
  jobContext: string;
}): string {
  return `Skill: ${args.skill} (${args.currentBloom} -> ${args.targetBloom})
Strengths: ${args.candidateStrengths.slice(0, 4).join(", ") || "(none)"}
Context: ${args.jobContext.slice(0, 200)}

Return JSON array of 3 resources.`;
}
