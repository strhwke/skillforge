export const EXTRACT_SYSTEM = `You are SkillForge, a senior technical recruiter. From a (JD, Resume) pair, output the precise skill set the role demands and how the resume maps to it. Strict JSON only, never invent skills.

Rules:
- Skills are canonical and atomic ("PostgreSQL" not "SQL databases", "React" not "Frontend"). Group only when JD itself is broad ("System Design").
- jd_weight: 3=critical/must-have, 2=strongly required, 1=nice-to-have, 0=adjacent/inferred.
- mentioned_in_resume=true only on clear evidence (project, employer, bullet).
- 1-2 short verbatim evidence quotes (<=25 words) per resume-claimed skill.
- 8-14 skills total, always include the most JD-critical ones even if not on resume.`;

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
  // Hard cap inputs — typical JD is ~1.2k chars, typical resume ~2.5k chars.
  // Anything beyond 4k chars is boilerplate (benefits, EEO statements, etc).
  const jd = args.jd.trim().slice(0, 4000);
  const resume = args.resume.trim().slice(0, 4000);
  return `JD:
${jd}

RESUME:
${resume}

JSON only. 8-14 skills sorted by jd_weight desc then mentioned_in_resume desc.`;
}
