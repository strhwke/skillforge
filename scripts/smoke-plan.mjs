// Smoke test for the new split flow:
//   POST /api/plan          -> plan synthesis (items have empty resources)
//   POST /api/resources x N -> sequential resource curation per item

const BASE = process.env.BASE ?? "http://localhost:3000";

const context = {
  job_title: "Senior Full-Stack Engineer at Nimbus (fintech)",
  jd_summary:
    "Senior full-stack engineer for SMB lending platform. React + TypeScript dashboards, Node.js / GraphQL API, PostgreSQL. AWS (ECS, RDS, IAM), system design ownership, mentoring.",
  resume_summary:
    "6 years full-stack. Strong React, TypeScript, Node.js, PostgreSQL. Some AWS ECS. No GraphQL or Kubernetes.",
  candidate_strengths_inferred: ["React", "TypeScript", "Node.js", "PostgreSQL"],
  skills: [],
};

const scores = [
  { name: "React", jd_weight: 3, self_rating_pct: 70, verified_pct: 78, calibration_error: -8, bloom_level: "Analyze", severity: "strength", evidence_quotes: [] },
  { name: "Node.js", jd_weight: 3, self_rating_pct: 70, verified_pct: 72, calibration_error: -2, bloom_level: "Analyze", severity: "strength", evidence_quotes: [] },
  { name: "PostgreSQL", jd_weight: 3, self_rating_pct: 70, verified_pct: 74, calibration_error: -4, bloom_level: "Analyze", severity: "strength", evidence_quotes: [] },
  { name: "GraphQL", jd_weight: 3, self_rating_pct: 10, verified_pct: 18, calibration_error: -8, bloom_level: "Remember", severity: "critical", evidence_quotes: [] },
  { name: "AWS", jd_weight: 2, self_rating_pct: 50, verified_pct: 42, calibration_error: 8, bloom_level: "Apply", severity: "major", evidence_quotes: [] },
  { name: "System Design", jd_weight: 3, self_rating_pct: 70, verified_pct: 38, calibration_error: 32, bloom_level: "Understand", severity: "critical", evidence_quotes: [] },
];

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text.slice(0, 600) }; }
  return { status: res.status, ok: res.ok, json };
}

(async () => {
  console.log("[plan-smoke] 1/2 POST /api/plan ...");
  const t0 = Date.now();
  const planRes = await postJson(`${BASE}/api/plan`, { context, scores });
  console.log(`[plan-smoke]  -> ${planRes.status} in ${Date.now() - t0}ms`);
  if (!planRes.ok) {
    console.error(JSON.stringify(planRes.json, null, 2));
    process.exit(2);
  }
  const plan = planRes.json;
  console.log(`[plan-smoke]  -> ${plan.items.length} items, total_hours=${plan.total_hours}`);
  for (const item of plan.items) {
    console.log(`           - ${item.skill}: adj=${item.adjacency.toFixed(2)}, ${item.hours_estimate}h, ${item.week_window}`);
  }

  console.log(`\n[plan-smoke] 2/2 sequential /api/resources for ${plan.items.length} items ...`);
  let cited = 0;
  let fallback = 0;
  for (const item of plan.items) {
    const t1 = Date.now();
    const r = await postJson(`${BASE}/api/resources`, {
      skill: item.skill,
      currentBloom: scores.find((s) => s.name === item.skill)?.bloom_level ?? "Remember",
      targetBloom: item.bloom_target,
      candidateStrengths: context.candidate_strengths_inferred,
      jobContext: context.job_title + " — " + context.jd_summary.slice(0, 240),
    });
    const ms = Date.now() - t1;
    if (!r.ok) {
      console.log(`           [FAIL ${r.status} in ${ms}ms] ${item.skill}: ${r.json?.error ?? "?"}`);
      continue;
    }
    const { resources, usedFallback } = r.json;
    if (usedFallback) fallback++; else cited++;
    console.log(
      `           [${ms}ms ${usedFallback ? "FALLBACK" : "GROUNDED"}] ${item.skill} -> ${resources.length} resources`,
    );
    for (const res of resources.slice(0, 2)) {
      console.log(`              • [${res.type}] ${res.title.slice(0, 60)} (cited=${!!res.cited}, free=${res.is_free})`);
    }
  }
  console.log(`\n[plan-smoke] DONE — grounded=${cited}, fallback=${fallback}`);
  process.exit(fallback > cited ? 3 : 0);
})().catch((e) => {
  console.error("[plan-smoke] crashed:", e);
  process.exit(1);
});
