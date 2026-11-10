// v2 design-infra — F28 헬스 게이트 · F31 Slurm (ops/infra-v2.js), 펌웨어·증명·파이프라인 (ops/phase2.js) — `node --test tests/`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = p => readFileSync(path.join(ROOT, p), "utf8");
const COMPONENTS = ["shared/flow-timeline.js", "shared/kpi-gauge.js", "shared/msg-viewer.js"];

function dom(fetchImpl, { lang = "ko", files = ["ops/infra-v2.js"] } = {}) {
  const els = {};
  const el = id => (els[id] = els[id] || { id, innerHTML: "", value: "", style: {}, dataset: {} });
  const bus = {};
  const ctx = { console, URL, Headers, setTimeout, location: { hash: "#/p2-attest" },
    localStorage: { getItem: k => (k === "nc-lang" ? lang : null), setItem() {} },
    document: { getElementById: el, createElement: () => ({ style: {}, set textContent(v) {} }), querySelector: () => null,
      head: { appendChild() {} }, addEventListener() {} } };
  ctx.window = ctx; ctx.globalThis = ctx;
  ctx.fetch = fetchImpl;
  ctx.NC_I18N = { lang: () => lang };
  ctx.NC = { bus: { on: (e, f) => (bus[e] = bus[e] || []).push(f) }, toast() {} };
  vm.createContext(ctx);
  vm.runInContext(read("shared/nocp-auth.js"), ctx);
  for (const f of COMPONENTS) vm.runInContext(read(f), ctx);
  for (const f of files) vm.runInContext(read(f), ctx);
  return { ctx, els, emit: id => Promise.all((bus.route || []).map(f => f(id))) };
}
const offline = async () => { throw new TypeError("offline"); };
const resp = (status, body) => ({ status, text: async () => typeof body === "string" ? body : JSON.stringify(body) });

test("health gate: offline → deterministic FAIL mock, node × domain matrix, labelled controls", async () => {
  const { els, emit } = dom(offline);
  await emit("p2-attest");
  const h = els["hv-gate-root"].innerHTML;
  assert.match(h, /NOCP 미연동 — mock/);
  assert.match(h, /role="alert"/);
  assert.match(h, /게이트 실패/);
  assert.match(h, /su-2-rack-00-tray-03/);
  assert.equal((h.match(/<th scope="row"/g) || []).length, 18);
  assert.match(h, /CRITICAL/);
  assert.match(h, /<label for="hv-rack"/);
  assert.match(h, /role="img"[^>]*aria-label="[^"]*94\.4/, "gauge carries the value in its accessible name");
  assert.ok(!/<th>/.test(h));
  for (const k of ["hv-eval", "hv-inject", "hv-clear"]) assert.match(h, new RegExp(`<button type="button"[^>]*data-iv="${k}"`));
});

test("health gate: live — readiness rules + evaluate {rack} via NOCP only, PASS banner", async () => {
  const seen = [];
  const nodes = Array.from({ length: 18 }, (_, i) => ({ node: "r-tray-" + String(i).padStart(2, "0"), ready: true, overall_severity: "PASS",
    failing_checks: [], verdict: { severity_by_domain: { xid: "PASS", gpu: "PASS", nvlink: "PASS", infiniband: "PASS", node: "PASS" } } }));
  const { ctx, els, emit } = dom(async (url, init) => {
    seen.push([init.method, url, init.body]);
    if (url.endsWith("/readiness/rules")) return resp(200, { source: "nico", rules: [{ name: "gpu-xid-critical", category: "xid", severity: "CRITICAL", expr: "x", remediation: ["RESET_GPU"] }] });
    if (url.endsWith("/readiness/evaluate")) return resp(200, { ready: true, nodes_total: 18, nodes_failed: [], source: ["nico"], nodes });
    return resp(404, {});
  });
  await emit("p2-attest");
  const h = els["hv-gate-root"].innerHTML;
  assert.match(h, /NOCP 라이브/);
  assert.match(h, /게이트 통과/);
  assert.match(h, /role="status"/);
  const ev = seen.find(s => s[1].endsWith("/readiness/evaluate"));
  assert.equal(ev[0], "POST");
  assert.equal(JSON.parse(ev[2]).rack, "su-2-rack-00");
  assert.ok(seen.every(s => s[1].startsWith("http://127.0.0.1:8000/api/v1/")), seen.map(s => s[1]).join());
  assert.equal(ctx.NC.infraV2.state.hv.calls.length, 1, "evaluate trace kept for the raw viewer");
});

test("slurm: offline mock — NVL72 blocks, legend, jobs table, history timeline", async () => {
  const { els, emit } = dom(offline);
  await emit("nvke-sched");
  const h = els["slurm-ops-root"].innerHTML;
  assert.match(h, /Slurm 잡 · Slinky \(F31\)/);
  assert.equal((h.match(/class="sl-block"/g) || []).length, 2);
  assert.equal((h.match(/class="sl-c /g) || []).length, 36 + 5, "36 node cells + 5 legend swatches");
  assert.match(h, /sl-c crit/);
  assert.match(h, /sl-c warn/);
  assert.match(h, /NODE_FAIL/);
  assert.match(h, /class="ft-step fail"/);
  assert.match(h, /<label for="sl-cluster"/);
  assert.match(h, /aria-pressed="true"/);
  assert.match(h, /topology\.conf/);
  assert.ok(!/<th>/.test(h));
});

test("slurm: live — jobs, slurmrestd nodes, topology.conf all through NOCP; DRAIN wins over IDLE", async () => {
  const seen = [];
  const { els, emit } = dom(async (url) => {
    seen.push(url);
    if (url.endsWith("/slurm/clusters")) return resp(200, [{ id: "slurm-001", name: "t", slurmrestd: "v0.0.42", racks: ["a"], nodes_total: 2, gpus_total: 8,
      nodes_by_state: { IDLE: 1, DRAIN: 1 } }]);
    if (url.endsWith("/jobs")) return resp(200, { jobs: [{ job_id: 1, name: "j", job_state: ["COMPLETED"], "x-neocloud": { history: [{ state: "COMPLETED", message: "exit 0" }], prolog: [] } }] });
    if (url.endsWith("/nodes")) return resp(200, { nodes: [{ name: "gpu-000", state: ["IDLE"], "x-neocloud": { block: "a" } },
      { name: "gpu-001", state: ["IDLE", "DRAIN"], reason: "prolog", "x-neocloud": { block: "a" } }] });
    if (url.endsWith("/topology.conf")) return resp(200, "BlockName=a Nodes=gpu-[000-001]");
    return resp(404, {});
  });
  await emit("nvke-sched");
  const h = els["slurm-ops-root"].innerHTML;
  assert.match(h, /NOCP 라이브/);
  assert.match(h, /sl-c warn[^>]*title="gpu-001 · DRAIN/);
  assert.match(h, /BlockName=a/);
  assert.ok(seen.some(u => u.endsWith("/api/v1/slurm/clusters/slurm-001/slurm/v0.0.42/nodes")));
  assert.ok(seen.every(u => u.startsWith("http://127.0.0.1:8000/api/v1/slurm/")), seen.join());
});

test("infra-v2: EN render has no Korean left (both panels)", async () => {
  const { els, emit } = dom(offline, { lang: "en" });
  await emit("p2-attest"); await emit("nvke-sched");
  for (const id of ["hv-gate-root", "slurm-ops-root"]) {
    const text = els[id].innerHTML.replace(/<[^>]+>/g, " ");
    assert.ok(!/[가-힣]/.test(text), id + ": " + (text.match(/[^ ]*[가-힣][^ ]*/g) || []).slice(0, 5).join(" | "));
  }
  assert.match(els["hv-gate-root"].innerHTML, /Gate failed/);
});

test("infra-v2: every Korean literal sits in an L(ko, en) pair", () => {
  const code = read("ops/infra-v2.js").replace(/\/\*[\s\S]*?\*\//g, "");
  const ko = code.match(/"[^"\n]*[가-힣][^"\n]*"/g) || [];
  const paired = (code.match(/L\("[^"\n]*[가-힣][^"\n]*",\s*"[^"\n]*"\)/g) || []).length;
  const table = (code.match(/\["(?:ok|info|warn|crit)", "[A-Z]", "[^"]*[가-힣][^"]*", "[a-z ]+"\]/g) || []).length;  /* NODE_ST 행: KO·EN 같이 */
  assert.equal(ko.length, paired + table, "unpaired KO strings");
});

test("phase2 v2: firmware apply-order timeline, attestation tray tiles + gauge, pipeline state flow (mock)", async () => {
  const { els, emit } = dom(offline, { files: ["ops/phase2.js"] });
  for (const r of ["p2-firmware", "p2-attest", "p2-pipeline"]) await emit(r);
  const fw = els["p2-firmware-root"].innerHTML, at = els["p2-attest-root"].innerHTML, pl = els["p2-pipeline-root"].innerHTML;
  assert.match(fw, /class="ft ft--h"/);
  assert.match(fw, /BMC \(iDRAC\)/);
  assert.match(fw, /role="progressbar"/);
  assert.equal((at.match(/class="at-t /g) || []).length, 18);
  assert.equal((at.match(/class="at-t bad"/g) || []).length, 1);
  assert.match(at, /kg-svg/);
  assert.match(pl, /aria-label="랙 상태 흐름"/);
  assert.match(pl, /class="ft-step fail"/);
  for (const h of [fw, at, pl]) assert.ok(!/<th>/.test(h));
});

test("i18n: KO literals in bringup.js / phase2.js translate to EN with no Korean left", () => {
  const c = { window: {} };
  vm.runInNewContext(read("shared/i18n-ops.js"), c);
  const { dict, patterns } = c.window.NC_I18N;
  const tr = s => dict[s] != null ? dict[s] : (patterns.find(p => p[0].test(s)) ? s.replace(...patterns.find(p => p[0].test(s))) : s);
  const NEW = ["재결선 완료 → 재시도", "케이블 불일치", "15단계 파이프라인", "실패 — 이후 11단계 차단", "담당 NICo",
    "04 LLDP 케이블 검증", "13 헬스 검증 (DCGM · NVLink · IB · NCCL)", "랙 3", "대상 18대 · 제외 0대", "적용 순서 vr-2026.05",
    "증명 통과율", "트레이별 증명 상태", "04 케이블 검증 등 — 15단계 보기"];
  const left = NEW.map(s => [s, tr(s)]).filter(([, e]) => /[가-힣]/.test(e));
  assert.deepEqual(left, []);
});

test("ops console: infra-v2 mounts and script order (after nvke-scheduler, before mk8s)", () => {
  const s = read("ops/index.html");
  assert.match(s, /data-screen="p2-attest"><div id="p2-attest-root"><\/div>.*<div id="hv-gate-root"><\/div><\/section>/);
  assert.match(s, /data-screen="nvke-sched"><div id="nvke-sched-ops-root"><\/div>.*<div id="slurm-ops-root"><\/div><\/section>/);
  const i = s.indexOf('src="infra-v2.js"');
  assert.ok(i > s.indexOf('src="../shared/nvke-scheduler.js"') && i < s.indexOf('src="mk8s.js"'));
});
