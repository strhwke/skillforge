// End-to-end smoke test for SkillForge dev server.
// Hits /api/extract, then loops /api/assess for one skill until is_final.

import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SAMPLES = path.resolve("samples");

const jd = fs.readFileSync(path.join(SAMPLES, "jd-fintech.txt"), "utf8");
const resume = fs.readFileSync(path.join(SAMPLES, "resume-fullstack.txt"), "utf8");

const ANSWERS = [
  "Indexing in Postgres builds a B-tree (or hash/GIN/etc) on the column so lookups become O(log n) instead of a full scan. I'd add a partial index on status='active' for the loan-officer dashboard since most queries filter that. Trade-off: writes get slower because the index has to be maintained, and very low-cardinality columns aren't worth indexing.",
  "I'd start with EXPLAIN ANALYZE on the slow query to see if it's doing a seq scan, a bad join order, or losing an index. If the planner picks the wrong plan I'd check pg_stats and run ANALYZE; if it's an N+1 from the ORM I'd batch with a JOIN or DataLoader-style aggregation. For a hot read path I'd consider a materialized view refreshed incrementally.",
  "For real-time risk scoring you don't want every loan officer's request blocking on the model. I'd put the inference behind a queue — the API enqueues to SQS, an ECS service consumes, writes the score back to Postgres with a notify, and the UI subscribes via SSE. Trade-off is freshness vs throughput; for 'while you wait' UX I'd cap the queue wait at 800ms and fall back to a cached score.",
  "I don't know much about that one honestly.",
];

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text.slice(0, 500) };
  }
  return { status: res.status, ok: res.ok, json };
}

(async () => {
  console.log("[smoke] 1/2 POST /api/extract ...");
  const t0 = Date.now();
  const ext = await postJson(`${BASE}/api/extract`, { jd, resume });
  console.log(`[smoke]  -> ${ext.status} in ${Date.now() - t0}ms`);
  if (!ext.ok) {
    console.error("[smoke] EXTRACT FAILED:", JSON.stringify(ext.json, null, 2));
    process.exit(1);
  }
  const skills = ext.json?.skills ?? [];
  console.log(`[smoke]  -> ${skills.length} skills extracted, top 3:`);
  for (const s of skills.slice(0, 3)) {
    console.log(`           - ${s.name} (jd_weight=${s.jd_weight})`);
  }

  // Pick highest-weight skill to interview on
  const target = [...skills].sort((a, b) => b.jd_weight - a.jd_weight)[0];
  if (!target) {
    console.error("[smoke] no skills extracted to assess.");
    process.exit(1);
  }
  console.log(`\n[smoke] 2/2 multi-turn assess on '${target.name}' ...`);

  const priorTurns = [];
  let pendingQuestion = null;
  let pendingTargetBloom = null;
  let turn = 0;
  let failures = 0;
  let successes = 0;

  while (turn < 6) {
    const body = {
      skill: target,
      jdContext: ext.json.jd_summary,
      resumeSummary: ext.json.resume_summary,
      selfRating: 3,
      priorTurns,
      latestUserAnswer: pendingQuestion ? ANSWERS[turn % ANSWERS.length] : undefined,
    };
    const t1 = Date.now();
    const r = await postJson(`${BASE}/api/assess`, body);
    const ms = Date.now() - t1;
    if (!r.ok) {
      failures++;
      console.log(`[smoke]   turn ${turn + 1}: ${r.status} in ${ms}ms (FAIL) error=${r.json?.error ?? "(none)"}`);
      if (r.json?.raw) console.log(`             raw: ${String(r.json.raw).slice(0, 200)}`);
      break;
    }
    successes++;
    const j = r.json;
    if (pendingQuestion) {
      // we just sent an answer; record the completed turn
      priorTurns.push({
        turn_index: priorTurns.length,
        question: pendingQuestion,
        target_bloom: pendingTargetBloom,
        user_answer: ANSWERS[turn % ANSWERS.length],
        graded: j.grading_of_previous,
      });
    }
    console.log(
      `[smoke]   turn ${turn + 1}: ${r.status} in ${ms}ms — graded=${
        j.grading_of_previous
          ? `${j.grading_of_previous.bloom_level_demonstrated}/${j.grading_of_previous.score}`
          : "(first turn)"
      } next_target=${j.target_bloom ?? "-"} is_final=${j.is_final}`,
    );
    if (j.is_final) {
      console.log(
        `[smoke]   FINAL: score=${j.final_score} bloom=${j.final_bloom} quotes=${
          (j.evidence_quotes ?? []).length
        }`,
      );
      break;
    }
    if (!j.next_question) {
      console.log("[smoke]   no next_question and not final, aborting.");
      break;
    }
    pendingQuestion = j.next_question;
    pendingTargetBloom = j.target_bloom;
    turn++;
  }

  console.log(
    `\n[smoke] DONE — ${successes} succeeded, ${failures} failed across ${turn + 1} turn calls.`,
  );
  process.exit(failures > 0 ? 2 : 0);
})().catch((e) => {
  console.error("[smoke] crashed:", e);
  process.exit(1);
});
