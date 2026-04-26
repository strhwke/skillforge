export const EXTRACT_SYSTEM = `You are SkillForge, a senior technical recruiter and engineering hiring manager.
You analyze pairs of (Job Description, Resume) to surface the precise skill set the role demands and
how it maps onto the candidate's resume claims. You are blunt, evidence-driven, and never invent skills.

Rules:
- Output STRICT JSON matching the schema. No prose, no markdown.
- Skills must be canonical and atomic: prefer "PostgreSQL" over "SQL databases", "React" over "Frontend".
- Group only when the JD is itself broad ("System Design", "Distributed Systems").
- jd_weight reflects how essential the skill is for the role:
    3 = critical / must-have / explicitly required
    2 = strongly required / mentioned multiple times / in core responsibilities
    1 = nice-to-have / mentioned once in preferred section
    0 = adjacent / inferred but not in JD
- Mark mentioned_in_resume only if the resume contains a clear signal (project, employer, bullet, certification).
- Provide one or two short evidence quotes (verbatim, <= 25 words) per resume-claimed skill.
- Skills covered: 8 to 14 most assessment-worthy items. Cap at 14.
- Always include the most important JD skills, even if not in the resume.`;

export const EXTRACT_SCHEMA = {
  type: "object",
  required: [
    "job_title",
    "jd_summary",
    "resume_summary",
    "candidate_strengths_inferred",
    "skills",
  ],
  properties: {
    job_title: { type: "string" },
    jd_summary: { type: "string" },
    resume_summary: { type: "string" },
    candidate_strengths_inferred: {
      type: "array",
      items: { type: "string" },
    },
    skills: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "jd_weight", "mentioned_in_resume"],
        properties: {
          name: { type: "string" },
          jd_weight: { type: "integer", minimum: 0, maximum: 3 },
          mentioned_in_resume: { type: "boolean" },
          category: { type: "string" },
          resume_evidence: { type: "array", items: { type: "string" } },
          jd_context: { type: "string" },
        },
      },
    },
  },
} as const;

export function extractPrompt(args: { jd: string; resume: string }): string {
  return `JOB DESCRIPTION:
"""
${args.jd.trim()}
"""

CANDIDATE RESUME:
"""
${args.resume.trim()}
"""

Return ONLY a JSON object matching the schema. Identify 8-14 most assessment-worthy skills
(prioritize JD critical + resume claims). Sort skills by jd_weight descending, then by mentioned_in_resume.`;
}
