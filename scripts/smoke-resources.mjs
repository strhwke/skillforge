// Single-skill validation for /api/resources after switching to flash-lite.
const BASE = process.env.BASE ?? "http://localhost:3000";

const t0 = Date.now();
const res = await fetch(`${BASE}/api/resources`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    skill: "GraphQL",
    currentBloom: "Remember",
    targetBloom: "Apply",
    candidateStrengths: ["Node.js", "TypeScript", "REST APIs"],
    jobContext: "Senior full-stack engineer at a fintech, building Apollo Server APIs.",
  }),
});
const text = await res.text();
let json;
try { json = JSON.parse(text); } catch { json = { _raw: text.slice(0, 600) }; }
console.log(`[res-smoke] -> ${res.status} in ${Date.now() - t0}ms`);
console.log(JSON.stringify(json, null, 2));
process.exit(res.ok && !json.usedFallback ? 0 : 2);
