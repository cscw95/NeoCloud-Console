// F23 bring-up kanban (ops/bringup.js) — `node --test tests/`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = p => readFileSync(path.join(ROOT, p), "utf8");

function dom(fetchImpl, opts = { components: true }) {
  const els = {};
  const el = id => (els[id] = els[id] || { id, innerHTML: "", value: "", style: {}, addEventListener() {} });
  const bus = {};
  const ctx = { console, URL, Headers, location: { hash: "#/bringup" },
    localStorage: { getItem: () => null, setItem() {} },
    document: { getElementById: el, createElement: () => ({ style: {}, set textContent(v) {} }),
      head: { appendChild() {} }, addEventListener() {} } };
  ctx.window = ctx; ctx.globalThis = ctx;
  ctx.fetch = fetchImpl;
  ctx.NC = { bus: { on: (e, f) => (bus[e] = bus[e] || []).push(f) }, toast() {} };
  vm.createContext(ctx);
  vm.runInContext(read("shared/nocp-auth.js"), ctx);
  if (opts.components) for (const f of ["shared/flow-timeline.js", "shared/kpi-gauge.js", "shared/msg-viewer.js"]) vm.runInContext(read(f), ctx);
  vm.runInContext(read("ops/bringup.js"), ctx);
  return { ctx, els, emit: id => Promise.all((bus.route || []).map(f => f(id))) };
}

test("bringup: offline → deterministic mock, step 04 failed callout + 15-step timeline + mock badge", async () => {
  const { ctx, els } = dom(async () => { throw new TypeError("fetch failed"); });
  await ctx.NC.bringupScreen();
  const h = els["bringup-root"].innerHTML;
  assert.match(h, /NOCP 미연동 — mock/);
  assert.equal((h.match(/data-ft-step="/g) || []).length, 15 * 2, "15 steps in phase timelines + 15 in the swimlane");
  assert.match(h, /class="ft-step fail sel"/, "failed step 04 is the default selection");
  assert.match(h, /role="alert"/);
  assert.match(h, /1 cable mismatch/);
  assert.match(h, /<caption>케이블 불일치<\/caption>/);
  assert.match(h, /swp30/);
  assert.match(h, /role="progressbar"[^>]*aria-valuenow="3"/);
  for (const id of ["bu-demo", "bu-miswire", "bu-clear", "bu-start", "bu-rack", "bu-fix"]) assert.ok(h.includes(`id="${id}"`), id);
  assert.ok(!/<th>/.test(h), "table headers are scoped");
});

test("bringup: renders without shared components (graceful fallback)", async () => {
  const { ctx, els } = dom(async () => { throw new TypeError("fetch failed"); }, { components: false });
  await ctx.NC.bringupScreen();
  const h = els["bringup-root"].innerHTML;
  assert.match(h, /role="alert"/);
  assert.match(h, /class="kpi"/);
});

test("bringup: live NOCP — calls only /api/v1, renders steps and raw upstream calls", async () => {
  const seen = [];
  const run = { rack: "bu-x", state: "sellable", failed_step: null, progress: { passed: 15, total: 15 },
    steps: Array.from({ length: 15 }, (_, i) => ({ no: i + 1, key: "k" + i, status: "passed", detail: "ok", owner: i === 4 ? "nico" : "nocp",
      calls: i === 4 ? [{ method: "POST", url: "http://nico/v2/org/neocloud/nico/expected-rack",
        status: 201, request: { rackId: "bu-x" }, response: { rackId: "bu-x" } }] : [] })) };
  const fetchImpl = async (url) => {
    seen.push(url);
    const body = url.endsWith("/dcim/racks") ? { results: [{ id: "bu-x", serial: "S", state: "sellable" }] }
      : url.endsWith("/dcim/sellable") ? { rack_count: 1, gpu_count: 72 } : run;
    return { status: 200, ok: true, text: async () => JSON.stringify(body) };
  };
  const { ctx, els, emit } = dom(fetchImpl);
  await emit("bringup");
  let h = els["bringup-root"].innerHTML;
  assert.match(h, /NOCP 라이브/);
  assert.match(h, /15단계 모두 통과/);
  ctx.NC.bringupSelect(5);
  h = els["bringup-root"].innerHTML;
  assert.match(h, /원본 요청\/응답 1건/);
  assert.match(h, /expected-rack/);
  assert.match(h, /담당 NICo/);
  assert.ok(seen.every(u => u.startsWith("http://127.0.0.1:8000/api/v1/")), seen.join());
});

test("i18n: every Korean literal in ops/bringup.js has an EN entry or pattern", () => {
  const c = { window: {} };
  vm.runInNewContext(read("shared/i18n-ops.js"), c);
  const { dict, patterns } = c.window.NC_I18N;
  const js = read("ops/bringup.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const RUNTIME = new Set(["건", "요청 실패 — HTTP", "실패 단계", "상태"]);
  const miss = [];
  for (const m of js.matchAll(/[^<>"'`]*[가-힣][^<>"'`]*/g)) {
    const s = m[0].trim();
    if (!/[가-힣]/.test(s) || RUNTIME.has(s) || dict[s] || patterns.some(p => p[0].test(s))) continue;
    miss.push(s);
  }
  assert.deepEqual(miss, []);
  assert.ok(patterns.some(p => p[0].test("원본 요청/응답 3건")));
});

test("ops console: bring-up menu, screen and script wired", () => {
  const s = read("ops/index.html");
  assert.match(s, /data-route="bringup"/);
  assert.match(s, /data-screen="bringup"><div id="bringup-root">/);
  assert.ok(s.indexOf('src="bringup.js"') > s.indexOf("shared/nocp-auth.js"));
});
