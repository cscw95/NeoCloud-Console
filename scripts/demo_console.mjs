// Terminal demo of the v2 Phase 1 console flows — same scenarios as the console "▶ 시연 실행" panels.
// Prints each step with the equivalent curl command and a response summary (WAVE-v2.md 시연 요건 3·6).
//   node scripts/demo_console.mjs                       # all scenarios, NOCP at :8000 (MOCK if not running)
//   NOCP_BASE=http://127.0.0.1:20082 node scripts/demo_console.mjs token-api invoice
//   DEMO_LANG=en  NOCP_TOKEN=<op> NOCP_TENANT=tnt-fin-corp node scripts/demo_console.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const V2 = require("../shared/v2-api.js");
const SC = require("../shared/v2-scenarios.js");

const BASE = process.env.NOCP_BASE || "http://127.0.0.1:8000";
const TENANT = process.env.NOCP_TENANT || "tnt-fin-corp";
const EN = process.env.DEMO_LANG === "en";
const CUSTOMER = new Set(["token-api", "invoice", "sla", "nvke-topology"]);
const op = V2.create({ base: BASE, timeoutMs: 8000, token: process.env.NOCP_TOKEN || null, session: () => null, mockDelayMs: 0 });
const cust = V2.create({ base: BASE, timeoutMs: 8000, token: process.env.NOCP_TENANT_TOKEN || process.env.NOCP_TOKEN || null,
  session: () => ({ tenant_id: TENANT, role: "admin" }), mockDelayMs: 0 });

function curl(t) {
  const h = Object.entries(t.req_headers || {}).map(([k, v]) => ` -H '${k}: ${v}'`).join("");
  const d = t.req_body ? ` -d '${String(t.req_body).slice(0, 160)}'` : "";
  return `curl -X ${t.method} '${t.url}'${h}${d}`;
}
function summary(t) {
  const b = String(t.res_body || "").replace(/\s+/g, " ");
  return `HTTP ${t.status}${t.status === "MOCK" ? " (seeded mock — backend not merged/running)" : ""} ${b.slice(0, 180)}${b.length > 180 ? "…" : ""}`;
}

const want = process.argv.slice(2);
let pass = 0, fail = 0, seen = [];
op.onTrace(t => seen.push(t)); cust.onTrace(t => seen.push(t));
for (const api of [cust, op]) {
  for (const sc of SC.build(api, { tenant: () => TENANT })) {
    if ((api === cust) !== CUSTOMER.has(sc.id)) continue;
    if (want.length && !want.includes(sc.id)) continue;
    console.log(`\n━━ ${sc.id} [${sc.feature}] ${EN ? sc.en : sc.ko}`);
    const ctx = {};
    for (const [i, st] of sc.steps.entries()) {
      seen = [];
      let r;
      try { r = await st.run(ctx); } catch (e) { r = { ok: false, ko: "오류 " + e.message, en: "error " + e.message }; }
      console.log(`  ${r.ok ? "✔" : st.soft ? "△" : "✘"} ${i + 1}. ${EN ? st.en : st.ko}`);
      seen.slice(-3).forEach(t => { console.log("     $ " + curl(t)); console.log("     → " + summary(t)); });
      console.log("     = " + (EN ? r.en : r.ko));
      if (r.ok) pass++; else if (!st.soft) { fail++; break; }
    }
  }
}
console.log(`\n${pass} steps passed, ${fail} failed · NOCP ${BASE} · live=${op.isLive() || cust.isLive() ? "yes" : "no (MOCK)"}`);
process.exit(fail ? 1 : 0);
