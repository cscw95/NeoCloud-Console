// Phase 2 ops screens (ops/phase2.js) — `node --test tests/`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = p => readFileSync(path.join(ROOT, p), "utf8");
const ROUTES = ["p2-grid", "p2-pipeline", "p2-firmware", "p2-attest", "p2-finops", "p2-notices", "p2-metrics"];

function dom(fetchImpl) {
  const els = {};
  const el = id => (els[id] = els[id] || { id, innerHTML: "", value: "", style: {}, dataset: {} });
  const bus = {};
  const ctx = { console, URL, Headers, location: { hash: "#/p2-grid" },
    localStorage: { getItem: () => null, setItem() {} },
    document: { getElementById: el, createElement: () => ({ style: {}, set textContent(v) {} }),
      head: { appendChild() {} }, addEventListener() {} } };
  ctx.window = ctx; ctx.globalThis = ctx;
  ctx.fetch = fetchImpl;
  ctx.NC = { bus: { on: (e, f) => (bus[e] = bus[e] || []).push(f) }, toast() {} };
  vm.createContext(ctx);
  vm.runInContext(read("shared/nocp-auth.js"), ctx);
  vm.runInContext(read("ops/phase2.js"), ctx);
  return { ctx, els, emit: id => Promise.all((bus.route || []).map(f => f(id))) };
}
const resp = (status, body) => ({ status, text: async () => typeof body === "string" ? body : JSON.stringify(body) });

test("phase2: offline → every screen renders deterministic mock with mock badge", async () => {
  const { els, emit } = dom(async () => { throw new TypeError("fetch failed"); });
  for (const r of ROUTES) {
    await emit(r);
    const h = els[r + "-root"].innerHTML;
    assert.match(h, /NOCP 미연동 — mock/, r);
    assert.match(h, /<table class="tbl">|p2-cols|<pre>/, r);
  }
  assert.match(els["p2-finops-root"].innerHTML, /₩14,668,541,020/);
  assert.match(els["p2-attest-root"].innerHTML, /증명 실패/);
  assert.match(els["p2-pipeline-root"].innerHTML, /sellable/);
});

test("phase2: live — calls only NOCP (no emulator ports), renders live data", async () => {
  const urls = [];
  const live = {
    "/api/v1/finops/cost": { period: "2026-10", by: "tenant", power_source: "model", items: [{ key: "tnt-a", kind: "tenant", racks: 4,
      energy_kwh: 10, energy_cost_krw: 1850, depreciation_krw: 100, total_cost_krw: 1950 }],
      totals: { total_cost_krw: 1950, energy_cost_krw: 1850, depreciation_krw: 100, energy_kwh: 10, dr_incentive_krw: 0, net_cost_krw: 1950 },
      assumptions: { tariff_krw_per_kwh: 185, pue: 1.25, depreciation: { years: 5 } } },
    "/api/v1/finops/dr-settlements": { source: "f21-curtailment", items: [], totals: { count: 0, kwh: 0, incentive_krw: 0 } },
    "/api/v1/status/notices": { items: [{ id: "ntc-0007", kind: "maintenance", components: ["Storage"], state: "scheduled", start: "x" }] },
    "/metrics": "# HELP nocp_sla_target_ratio t\n# TYPE nocp_sla_target_ratio gauge\nnocp_sla_target_ratio 0.999\n",
  };
  const { els, emit } = dom(async (u) => {
    urls.push(u);
    const p = new URL(u).pathname;
    return live[p] ? resp(200, live[p]) : resp(404, { detail: "Not Found" });
  });
  for (const r of ROUTES) await emit(r);
  assert.ok(urls.length > 10);
  for (const u of urls) {
    assert.ok(u.startsWith("http://127.0.0.1:8000/"), u);
    assert.ok(!/:9100|:9000/.test(u), u);
  }
  assert.match(els["p2-finops-root"].innerHTML, /NOCP 라이브/);
  assert.match(els["p2-finops-root"].innerHTML, /tnt-a/);
  assert.match(els["p2-notices-root"].innerHTML, /ntc-0007/);
  assert.match(els["p2-metrics-root"].innerHTML, /NOCP 라이브/);
  assert.ok(urls.some(u => u.includes("/api/v1/finops/cost?by=tenant&period=")));
});

test("phase2: demo run shows step progress with real requests/responses", async () => {
  const seen = [];
  const { ctx, els } = dom(async (u, o) => {
    const p = new URL(u).pathname;
    seen.push((o && o.method) + " " + p);
    if (p === "/api/v1/status/notices" && o.method === "POST") {
      const b = JSON.parse(o.body);
      return resp(201, { id: b.kind === "maintenance" ? "ntc-1" : "ntc-2", state: b.kind === "maintenance" ? "scheduled" : "active" });
    }
    if (p === "/api/v1/status") return resp(200, { notices: [{}, {}] });
    if (p.endsWith("/resolve")) return resp(200, { state: "resolved" });
    if (p === "/api/v1/status/notices") return resp(200, { items: [] });
    return resp(200, { removed: 0 });
  });
  await ctx.NC.phase2.runDemo("p2-notices");
  const h = els["p2-notices-root"].innerHTML;
  assert.equal((h.match(/<li>/g) || []).length, 5);
  assert.equal((h.match(/st green">passed/g) || []).length, 5, h);
  assert.ok(seen.includes("POST /api/v1/status/notices/ntc-2/resolve"));
});

test("phase2: wired in ops/index.html (menu, sections, script order)", () => {
  const s = read("ops/index.html");
  for (const r of ROUTES) {
    assert.match(s, new RegExp(`data-route="${r}"`));
    assert.match(s, new RegExp(`data-screen="${r}"><div id="${r}-root">`));
  }
  assert.ok(s.indexOf('src="phase2.js"') > s.indexOf('src="dsx.js"'));
  assert.ok(s.indexOf('src="phase2.js"') < s.indexOf('<script src="app.js">'));
});

test("phase2: every Korean literal has an EN entry (i18n-ops)", () => {
  const c = { window: {} };
  vm.runInNewContext(read("shared/i18n-ops.js"), c);
  const { dict, patterns } = c.window.NC_I18N;
  const js = read("ops/phase2.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const miss = [];
  for (const m of js.matchAll(/[^<>"'`]*[가-힣][^<>"'`]*/g)) {
    const s = m[0].trim();
    if (/[가-힣]/.test(s) && !dict[s] && !patterns.some(p => p[0].test(s))) miss.push(s);
  }
  for (const s of ["운영 견고화 · 그리드", "그리드 이벤트 · 감축", "FinOps 원가 · 정산", "관측 지표 (Prometheus)"]) if (!dict[s]) miss.push(s);
  assert.deepEqual(miss, []);
});

test("phase2: accessible controls — labelled inputs, buttons, scoped headers", async () => {
  const { els, emit } = dom(async () => { throw new TypeError("offline"); });
  for (const r of ["p2-finops", "p2-notices", "p2-attest"]) await emit(r);
  const all = ["p2-finops", "p2-notices", "p2-attest"].map(r => els[r + "-root"].innerHTML).join("");
  for (const id of [...all.matchAll(/<(?:input|select)[^>]*id="([^"]+)"/g)].map(m => m[1]))
    assert.match(all, new RegExp(`<label for="${id}"`), id);
  assert.ok(!/<th>/.test(all));
  assert.match(all, /<button type="button"/);
});
