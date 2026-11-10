// v2 design-ops screens — `node --test tests/` (no deps).
// ops/ops-viz.js: auto-recovery 7 phases · grid curtailment flow · leak response · status page · OOB/power tie-in.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = p => readFileSync(path.join(ROOT, p), "utf8");
const require = createRequire(import.meta.url);
const O = require(path.join(ROOT, "ops/ops-viz.js"));
const F = require(path.join(ROOT, "shared/flow-timeline.js"));

const st = (name, state, at, extra = {}) => ({ name, state, at, ...extra });
/* live NOCP shapes (integration/v2 remediation.py step names) */
const XID = { id: "rem-0001", state: "completed", outcome: "replaced", mttr_min: 22, trigger: { kind: "xid" }, detected_at: "2026-11-10T23:17:49+00:00",
  steps: [st("detect", "Succeeded", "2026-11-10T23:17:49+00:00"), st("quarantine", "Succeeded", "2026-11-10T23:18:49+00:00"),
    st("drain", "Succeeded", "2026-11-10T23:22:49+00:00"), st("gpu_reset", "Failed", "2026-11-10T23:25:49+00:00"),
    st("validate", "Failed", "2026-11-10T23:29:49+00:00"), st("replace", "Succeeded", "2026-11-10T23:39:49+00:00"),
    st("rma_open", "Succeeded", "2026-11-10T23:40:49+00:00"), st("isolate", "Succeeded", "2026-11-10T23:42:49+00:00"),
    st("repair", "Succeeded", "2026-11-11T00:12:49+00:00"), st("burn_in", "Succeeded", "2026-11-11T00:57:49+00:00"),
    st("pool_return", "Succeeded", "2026-11-11T00:59:49+00:00")] };
const LEAK = { id: "rem-0002", state: "completed", outcome: "replaced", mttr_min: 15, trigger: { kind: "leak" }, detected_at: "2026-11-10T23:17:55+00:00",
  steps: [st("detect", "Succeeded", "2026-11-10T23:17:55+00:00"), st("quarantine", "Succeeded", "2026-11-10T23:18:55+00:00"),
    st("drain", "Succeeded", "2026-11-10T23:22:55+00:00"), st("replace", "Succeeded", "2026-11-10T23:32:55+00:00"),
    st("rma_open", "Succeeded", "2026-11-10T23:33:55+00:00"), st("isolate", "Succeeded", "2026-11-10T23:35:55+00:00")] };
const status = run => Object.fromEntries(O.runPhases(run).map(p => [p.id, p.status]));

test("recovery: seven phases in order detect → cordon → drain → reset → replace → burn-in → return", () => {
  assert.deepEqual(O.PHASES.map(p => p.id), ["detect", "cordon", "drain", "reset", "replace", "burnin", "return"]);
  const ph = O.runPhases(XID);
  assert.equal(ph.length, 7);
  assert.deepEqual(status(XID), { detect: "done", cordon: "done", drain: "done", reset: "warn", replace: "done", burnin: "done", return: "done" });
  assert.equal(ph.find(p => p.id === "drain").minutes, 4);
  assert.equal(ph.find(p => p.id === "reset").minutes, 7);        /* gpu_reset 3 + validate 4 */
  assert.equal(ph.find(p => p.id === "burnin").minutes, 78);
  assert.ok(ph.find(p => p.id === "reset").note, "failed reset that escalated carries a note");
});

test("recovery: leak skips GPU reset and waits at RMA; recovered runs skip replace", () => {
  const s = status(LEAK);
  assert.equal(s.reset, "skip");
  assert.equal(s.return, "pending");
  assert.match(O.runPhases(LEAK).find(p => p.id === "reset").note.en, /leak/);
  const rec = { state: "completed", outcome: "recovered", steps: [st("detect", "Succeeded", "2026-11-10T00:00:00Z"), st("quarantine", "Succeeded", "2026-11-10T00:01:00Z"),
    st("drain", "Succeeded", "2026-11-10T00:05:00Z"), st("gpu_reset", "Succeeded", "2026-11-10T00:08:00Z"), st("validate", "Succeeded", "2026-11-10T00:12:00Z"),
    st("uncordon", "Succeeded", "2026-11-10T00:13:00Z")] };
  assert.deepEqual(status(rec), { detect: "done", cordon: "done", drain: "done", reset: "done", replace: "skip", burnin: "skip", return: "done" });
  assert.equal(O.downtime(rec).rma, 0);
});

test("recovery: running run marks next phase active; failed last phase is fail; mock step names map", () => {
  const run = { state: "running", outcome: null, steps: [st("cordon", "running", "2026-11-10T00:00:00Z")] };
  const s = status(run);
  assert.equal(s.cordon, "active"); assert.equal(s.drain, "pending"); assert.equal(s.detect, "skip", "unrecorded phase before a recorded one");
  const run2 = { state: "running", outcome: null, steps: [st("cordon", "Succeeded", "2026-11-10T00:00:00Z")] };
  assert.equal(status(run2).drain, "active");
  const bad = { state: "completed", outcome: "failed", steps: [st("detect", "Succeeded", "2026-11-10T00:00:00Z"), st("replace", "Failed", "2026-11-10T00:10:00Z")] };
  assert.equal(status(bad).replace, "fail");
  assert.equal(O.downtime(XID).customer, 22);
  assert.equal(O.downtime(XID).rma, 80);
});

test("recovery: phases render through NC.flow.timeline with all seven steps", () => {
  const html = F.timeline(O.runPhases(XID).map(p => ({ id: p.id, label: p.label, status: p.status })), { orientation: "horizontal", selectable: true });
  assert.equal((html.match(/data-ft-step=/g) || []).length, 7);
  assert.match(html, /data-status="warn"/);
});

const CURT = O.MOCK.curt.items[0];
test("curtailment: flow target → plan → protect → shrink → notice → restore → settle", () => {
  const f = O.curtFlow(CURT);
  assert.deepEqual(f.map(s => s.id), ["target", "plan", "protect", "shrink", "notice", "restore", "settle"]);
  assert.equal(f.find(s => s.id === "shrink").status, "warn", "shortfall shows warn");
  assert.equal(f.find(s => s.id === "restore").status, "done");
  assert.equal(f.find(s => s.id === "settle").status, "done");
  const act = O.curtFlow({ ...CURT, state: "active", ended_at: null, settlement: null, shortfall_kw: 0 });
  assert.equal(act.find(s => s.id === "restore").status, "active");
  assert.equal(act.find(s => s.id === "settle").status, "pending");
  assert.equal(act.find(s => s.id === "shrink").status, "done");
});

test("curtailment: tier breakdown sums kW per tier (token batch uses est_kw)", () => {
  const tb = O.tierBreakdown(CURT);
  assert.deepEqual(tb.map(t => t.tier), ["token-batch", "spot", "on-demand"]);
  assert.equal(tb[0].kw, 312.4);
  assert.equal(tb[1].kw, 192.1); assert.equal(tb[1].targets, 2);
  assert.deepEqual(O.tierBreakdown({}), []);
});

test("leak: flow starts at the Redfish event and follows the response steps", () => {
  const f = O.leakFlow(O.MOCK.leak.items[0]);
  assert.equal(f[0].id, "redfish");
  assert.deepEqual(f.slice(1).map(s => s.id), ["health-event", "cordon", "drain", "remediation-run", "replace"]);
  assert.ok(f.every(s => s.status === "done"));
});

test("status page: worst active impact per component; resolved notices ignored", () => {
  const cs = O.componentStatus([
    { id: "a", state: "active", impact: "degraded", components: ["bmaas", "token-api"] },
    { id: "b", state: "active", kind: "incident", components: ["bmaas"] },
    { id: "c", state: "resolved", impact: "outage", components: ["Storage"] }], ["bmaas", "Storage", "token-api"]);
  const m = Object.fromEntries(cs.map(c => [c.component, c.impact]));
  assert.deepEqual(m, { bmaas: "partial_outage", Storage: "operational", "token-api": "degraded" });
  assert.equal(O.impactTone("operational"), "ok"); assert.equal(O.impactTone("maintenance"), "info");
  assert.equal(O.impactTone("degraded"), "warn"); assert.equal(O.impactTone("outage"), "crit");
});

test("KO/EN: every Korean literal in ops/ops-viz.js is paired with an EN literal", () => {
  const src = read("ops/ops-viz.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const lit = /"((?:[^"\\]|\\.)*)"/g;
  let m, n = 0; const toks = [];
  while ((m = lit.exec(src))) toks.push({ s: m[1], i: m.index, end: lit.lastIndex });
  toks.forEach((t, k) => {
    if (!/[가-힣]/.test(t.s)) return;
    const next = toks[k + 1];
    const between = next ? src.slice(t.end, next.i) : "";
    const paired = next && /^\s*(\+[^,"]*)?,\s*(en:\s*)?$/.test(between) && !/[가-힣]/.test(next.s);
    assert.ok(paired || /^\s*,\s*message_en:\s*$/.test(between), `Korean literal without EN pair: "${t.s}" → next ${next && JSON.stringify(next.s)}`);
    n++;
  });
  assert.ok(n > 50);
});

test("wiring: ops index loads ops-viz after v2.js; v2.js/phase2.js delegate; CSS uses tokens only", () => {
  const h = read("ops/index.html");
  assert.ok(h.indexOf('src="ops-viz.js"') > h.indexOf('src="v2.js"'));
  assert.ok(h.indexOf('src="ops-viz.js"') > h.indexOf("msg-viewer.js"));
  assert.match(h, /href="ops-viz.css"/);
  assert.match(read("ops/v2.js"), /if \(NC\.opsViz\) return NC\.opsViz\.recovery\(\);/);
  const p2 = read("ops/phase2.js");
  assert.match(p2, /NC\.opsViz\.grid\(\)/); assert.match(p2, /NC\.opsViz\.notices\(\)/);
  for (const id of ["v2-recovery-root", "p2-grid-root", "p2-notices-root", "dsx-oob-root", "dsx-power-root"]) assert.ok(h.includes(`id="${id}"`), id);
  const css = read("ops/ops-viz.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(/i, "no raw colours");
  assert.doesNotMatch(css, /font-size:\s*(?:[0-9]|10)px/, "min 11px");
  const js = read("ops/ops-viz.js");
  for (const id of ["v2-rp-save", "v2-rr-go", "p2-n-create", "data-p2-resolve"]) assert.ok(js.includes(id), "keeps handler id " + id);
});
