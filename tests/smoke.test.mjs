// Console smoke tests — `node --test tests/` (Node ≥ 18, no dependencies).
// Covers: JS syntax, NOCP-only routing (no direct :9100/:9000), dsx-api live/mock
// contract (PLAN.md §C paths, auth headers, error surfacing), screen wiring, i18n.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = p => readFileSync(path.join(ROOT, p), "utf8");
const require = createRequire(import.meta.url);
const dsxMod = require(path.join(ROOT, "shared/dsx-api.js"));

const PLAN_MATRIX = { dsx_os: "2026.05", nico: "2.3.0", nvke: "0.23.1", dps: "0.10",
  mission_control: "2.5", doca: "3.x", gpu_operator: "AICR recipe", k8s: ["1.33", "1.34"],
  platform: "Vera Rubin NVL72" };

function jsFiles() {
  const out = [];
  for (const d of ["shared", "ops", "customer", "biz"]) {
    for (const f of readdirSync(path.join(ROOT, d))) if (f.endsWith(".js")) out.push(`${d}/${f}`);
  }
  return out;
}

/* fake fetch — records calls, answers by route table */
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, opt = {}) => {
    calls.push({ url, method: opt.method || "GET", headers: opt.headers || {}, body: opt.body });
    const u = new URL(url);
    const key = (opt.method || "GET") + " " + u.pathname;
    let hit = routes[key];
    if (hit === undefined) for (const k of Object.keys(routes)) {
      const [m, p] = k.split(" ");
      if (m === (opt.method || "GET") && p.endsWith("*") && u.pathname.startsWith(p.slice(0, -1))) { hit = routes[k]; break; }
    }
    if (hit === undefined) return { ok: false, status: 404, text: async () => '{"detail":"Not Found"}' };
    const [status, body] = hit && hit.__status ? [hit.__status, hit.body] : [200, hit];
    return { ok: status < 400, status, text: async () => JSON.stringify(body) };
  };
  fn.calls = calls;
  return fn;
}
const offline = async () => { throw new TypeError("fetch failed"); };

/* ── 1. syntax ─────────────────────────────────────────────── */
test("all console JS files parse (node --check)", () => {
  const files = jsFiles();
  assert.ok(files.length >= 15);
  for (const f of files) execFileSync(process.execPath, ["--check", path.join(ROOT, f)]);
});

/* ── 2. layering: console → NOCP only ──────────────────────── */
test("no direct AI-Infra (:9100) / NICo (:9000) URLs in console sources", () => {
  const files = jsFiles().concat(["ops/index.html", "customer/index.html", "biz/index.html"]);
  for (const f of files) {
    const s = read(f);
    assert.doesNotMatch(s, /(127\.0\.0\.1|localhost):9(100|000)/, f);
  }
});

test("ops obs layer routes through NOCP /api/v1/infra proxy", () => {
  const s = read("ops/app.js");
  assert.match(s, /OBS_ROOT = NOCP_ROOT \+ "\/api\/v1\/infra"/);
  assert.match(s, /OBS_BASE = OBS_ROOT \+ "\/emulator\/v1\/obs"/);
});

test("nocp-api reads machines via NOCP /api/v1 first, /fake-nico only as legacy fallback", () => {
  const s = read("shared/nocp-api.js");
  assert.match(s, /hosts: p => nicoRead\("\/machines\?/);
  assert.match(s, /async function nicoRead\(primary, legacy, norm\)/);
});

test("committed zip removed", () => {
  assert.equal(existsSync(path.join(ROOT, "ops/Code analysis request0714.zip")), false);
});

/* ── 3. dsx-api mock fallback ──────────────────────────────── */
test("dsx-api: offline → every getter falls back to mock (live:false)", async () => {
  const D = dsxMod.create({ base: "http://nocp", fetch: offline });
  const getters = ["versions", "catalog", "powerDomains", "powerProfiles", "oobSummary", "oobEvents",
    "rmaList", "firmwareBaseline", "firmwareDrift", "metering", "nvkeReleases", "nvkeClusters", "flexEvents"];
  for (const g of getters) {
    const r = await D[g]();
    assert.equal(r.live, false, g);
    assert.ok(r.data != null, g);
  }
  assert.equal(D.isLive(), false);
});

test("dsx-api: version matrix equals PLAN.md baseline", async () => {
  assert.deepEqual(dsxMod.MATRIX, PLAN_MATRIX);
  const D = dsxMod.create({ base: "http://nocp", fetch: offline });
  assert.deepEqual((await D.versions()).data.matrix, PLAN_MATRIX);
});

test("dsx-api: mock OOB summary has contract A/C fields for 140 racks", async () => {
  const D = dsxMod.create({ base: "http://nocp", fetch: offline });
  const rs = (await D.oobSummary()).data;
  assert.equal(rs.length, 140);
  for (const k of ["rack", "bmc_reachable", "bmc_total", "psu_ok", "psu_total", "leak",
    "max_inlet_c", "sel_critical", "power_kw", "cap_kw"]) assert.ok(k in rs[0], k);
  assert.equal((await D.oobSummary("ansan")).data.length, 104);   // NOCP Phase-1: 36 + 104
  assert.equal(rs[0].psu_total, 24);                                 // 4 shelves × 6 PSU
  const det = (await D.oobRack(rs[0].rack)).data;
  assert.equal(det.trays.length, 18);
  assert.ok(det.power_shelves.length > 0);
});

test("dsx-api: mock power domains are per ComputeBlock with the block budget", async () => {
  const D = dsxMod.create({ base: "http://nocp", fetch: offline });
  const ds = (await D.powerDomains()).data;
  assert.deepEqual(ds.map(d => [d.id, d.site_budget_kw, d.racks]), [
    ["pd-aif-stt-gasan-f1", 6000, 24], ["pd-aif-stt-gasan-f2", 3000, 12],
    ["pd-aif-igis-ansan-f1", 12900, 54], ["pd-aif-igis-ansan-f2", 10400, 50]]);
  const over = await D.updateDomain("pd-aif-stt-gasan-f2", { operating_limit_kw: 3001 });
  assert.ok(over.error && /budget/.test(over.error));
  const ok = await D.updateDomain("pd-aif-stt-gasan-f2", { operating_limit_kw: 2500 });
  assert.ok(!ok.error && ok.data.operating_limit_kw === 2500);
  const t = (await D.powerTelemetry("pd-aif-stt-gasan-f2")).data;
  assert.equal(t.racks.length, 12);
});

test("dsx-api: mock simulate — dynamic (DPS) supports ≥ static racks", async () => {
  const D = dsxMod.create({ base: "http://nocp", fetch: offline });
  const r = await D.simulate({ domain: "pd-gasan", operating_limit_kw: 10000, workload_mix: { training: 0.5, inference: 0.5 } });
  assert.equal(r.live, false);
  for (const side of ["static", "dynamic"])
    for (const k of ["racks_supported", "gpus_supported", "tokens_per_mw", "headroom_kw"]) assert.ok(k in r.data[side]);
  assert.ok(r.data.dynamic.racks_supported >= r.data.static.racks_supported);
  assert.equal(r.data.static.gpus_supported, r.data.static.racks_supported * 72);
});

test("dsx-api: mock RMA workflow advances through 6 stages", async () => {
  const D = dsxMod.create({ base: "http://nocp", fetch: offline });
  const c = (await D.rmaCreate({ machine: "GA-R001-T01" })).data;
  assert.equal(c.stage, "health_event");
  for (let i = 0; i < 7; i++) await D.rmaAdvance(c.id);
  const after = (await D.rmaList()).data.find(x => x.id === c.id);
  assert.equal(after.stage, "pool_return");
  assert.deepEqual(dsxMod.RMA_STAGES, ["health_event", "cordon_drain", "isolate", "replace", "burn_in", "pool_return"]);
});

test("dsx-api: mock NVKE create → running, upgrade → target version, kubeconfig", async () => {
  const D = dsxMod.create({ base: "http://nocp", fetch: offline });
  const c = (await D.nvkeCreate({ name: "t1", tenant_id: "tnt-x", k8s_version: "1.33", node_image: "img",
    nodepools: [{ name: "gpu", instance_type: "vr-nvl72.tray", count: 2 }] })).data;
  assert.equal(c.status, "provisioning");
  D.mockTick();
  assert.equal((await D.nvkeCluster(c.id)).data.status, "running");
  await D.nvkeUpgrade(c.id, { k8s_version: "1.34" });
  for (let i = 0; i < 4; i++) D.mockTick();
  const up = (await D.nvkeCluster(c.id)).data;
  assert.equal(up.k8s_version, "1.34");
  assert.equal(up.status, "running");
  await D.nvkeAddNodepool(c.id, { name: "p2", instance_type: "cpu.c64", count: 1 });
  assert.equal((await D.nvkeNodepools(c.id)).data.length, 2);
  assert.match((await D.nvkeKubeconfig(c.id)).data.kubeconfig, /kind: Config/);
  assert.equal((await D.nvkeClusters("tnt-x")).data.length, 1);
});

/* ── 4. dsx-api live path / contract C ─────────────────────── */
test("dsx-api: live — calls only PLAN §C /api/v1 paths, no hardcoded X-Operator", async () => {
  const f = fakeFetch({
    "GET /api/v1/platform/versions": PLAN_MATRIX,
    "GET /api/v1/catalog": { products: [{ id: "bmaas" }, { id: "managed-k8s" }] },
    "GET /api/v1/power/domains": [{ id: "pd-1", operating_limit_kw: 5000, mode: "dynamic" }],
    "GET /api/v1/power/domains/pd-1": { id: "pd-1" },
    "PATCH /api/v1/power/domains/pd-1": { id: "pd-1", mode: "static" },
    "GET /api/v1/power/profiles": ["max-p", "max-q"],
    "GET /api/v1/power/telemetry": { racks: [] },
    "POST /api/v1/power/simulate": { static: { racks_supported: 1 }, dynamic: { racks_supported: 2 } },
    "POST /api/v1/power/flex-events": { id: "f1" },
    "GET /api/v1/oob/summary": { racks: [{ rack: "R1" }] },
    "GET /api/v1/oob/racks/R1": { rack: "R1", trays: [] },
    "GET /api/v1/oob/events": [{ topic: "leak" }],
    "GET /api/v1/oob/sel/M1": { entries: [{ Id: "1" }] },
    "GET /api/v1/rma": [{ id: "rma-1" }],
    "POST /api/v1/rma": { id: "rma-2" },
    "GET /api/v1/firmware/baseline": { components: [{ component: "BMC" }] },
    "GET /api/v1/firmware/drift": { drift: [] },
    "GET /api/v1/metering/usage": { gpu_hours: 10 },
    "GET /api/v1/isolation/tnt-a": { tenant: "tnt-a", layers: [] },
    "GET /api/v1/nvke/releases": { releases: [{ version: "1.34" }] },
    "GET /api/v1/nvke/clusters": [{ id: "c1" }],
    "POST /api/v1/nvke/clusters": { id: "c2" },
    "GET /api/v1/nvke/clusters/c1/nodepools": [{ id: "np" }],
    "POST /api/v1/nvke/clusters/c1/nodepools": { id: "np2" },
    "GET /api/v1/nvke/clusters/c1/kubeconfig": { kubeconfig: "apiVersion: v1" },
    "POST /api/v1/nvke/clusters/c1/upgrade": { id: "c1", status: "upgrading" },
    "GET /api/v1/nvke/clusters/c1/aicr-recipe": { recipe: "r" },
    "POST /api/v1/racks/R1/power-policy": { ok: true },
  });
  const D = dsxMod.create({ base: "http://nocp", fetch: f });
  const rs = await Promise.all([
    D.versions(), D.catalog(), D.powerDomains(), D.powerDomain("pd-1"), D.updateDomain("pd-1", { mode: "static" }),
    D.powerProfiles(), D.powerTelemetry("pd-1"), D.simulate({ domain: "pd-1" }), D.flexEvent({ domain: "pd-1", reduce_kw: 1, duration_s: 1 }),
    D.oobSummary("gasan"), D.oobRack("R1"), D.oobEvents(5), D.oobSel("M1"), D.rmaList(), D.rmaCreate({ machine: "M1" }),
    D.firmwareBaseline(), D.firmwareDrift(), D.metering("tnt-a"), D.isolation("tnt-a"), D.nvkeReleases(), D.nvkeClusters(),
    D.nvkeCreate({ name: "x" }), D.nvkeNodepools("c1"), D.nvkeAddNodepool("c1", { name: "p" }), D.nvkeKubeconfig("c1"),
    D.nvkeUpgrade("c1", { k8s_version: "1.34" }), D.nvkeAicrRecipe("c1"), D.setRackProfile("R1", "max-q"),
  ]);
  rs.forEach((r, i) => assert.equal(r.live, true, "call #" + i));
  assert.equal(D.isLive(), true);
  for (const c of f.calls) {
    assert.match(c.url, /^http:\/\/nocp\/api\/v1\//);
    assert.equal(c.headers["X-Operator"], undefined);   // no longer hardcoded (security)
    assert.equal(c.headers["X-Tenant-Id"], undefined);
  }
  // normalizers
  assert.deepEqual(rs[9].data, [{ rack: "R1" }]);
  assert.deepEqual(rs[5].data.map(p => p.id), ["max-p", "max-q"]);
  assert.equal(rs[12].data[0].Id, "1");
  assert.deepEqual(rs[0].data.matrix, PLAN_MATRIX);
  assert.equal(rs[7].data.dynamic.racks_supported, 2);
  assert.ok(f.calls.some(c => c.url.endsWith("/oob/summary?site=gasan")));
  assert.ok(f.calls.some(c => c.url.endsWith("/metering/usage?tenant=tnt-a")));
  const rp = f.calls.find(c => c.url.endsWith("/racks/R1/power-policy"));
  assert.deepEqual(JSON.parse(rp.body), { policy: "max-q" });
});

test("dsx-api: customer session → tenant headers, no operator header", async () => {
  const f = fakeFetch({ "GET /api/v1/nvke/clusters": [] });
  const D = dsxMod.create({ base: "http://nocp", fetch: f, session: () => ({ tenant_id: "tnt-fin-corp", role: "admin" }) });
  await D.nvkeClusters("tnt-fin-corp");
  assert.equal(f.calls[0].headers["X-Tenant-Id"], "tnt-fin-corp");
  assert.equal(f.calls[0].headers["X-Tenant-Role"], "admin");
  assert.equal(f.calls[0].headers["X-Operator"], undefined);
  assert.match(f.calls[0].url, /\/nvke\/clusters\?tenant_id=tnt-fin-corp$/);
});

test("dsx-api: 409 on action is surfaced (no mock leak); 404 falls back to mock", async () => {
  const f = fakeFetch({ "POST /api/v1/nvke/clusters": { __status: 409, body: { detail: "quota exceeded" } } });
  const D = dsxMod.create({ base: "http://nocp", fetch: f });
  const r = await D.nvkeCreate({ name: "x" });
  assert.equal(r.live, true);
  assert.equal(r.status, 409);
  assert.equal(r.error, "quota exceeded");
  const m = await D.machineAction("GA-R001-T01", "ac-power-cycle");   // 404 → mock
  assert.equal(m.live, false);
  assert.equal(m.data.accepted, true);
});

test("dsx-api: 403 on getter is reported with error (mock data kept for render)", async () => {
  const f = fakeFetch({ "GET /api/v1/rma": { __status: 403, body: { detail: "operator required" } } });
  const D = dsxMod.create({ base: "http://nocp", fetch: f });
  const r = await D.rmaList();
  assert.equal(r.status, 403);
  assert.equal(r.error, "operator required");
});

/* ── 5. nocp-auth shim ─────────────────────────────────────── */
function runShim(pathname) {
  const seen = [];
  const ctx = {
    location: { pathname },
    localStorage: { getItem: () => null },
    Headers,
    fetch: async (u, init) => { seen.push({ u, h: new Headers((init && init.headers) || {}) }); return {}; },
  };
  ctx.window = ctx;
  vm.runInNewContext(read("shared/nocp-auth.js"), ctx);
  return { ctx, seen };
}
test("nocp-auth: no token → no hardcoded X-Operator; legacy flag opts in", async () => {
  const { ctx, seen } = runShim("/ops/");
  await ctx.window.fetch("http://127.0.0.1:8000/api/v1/spec");
  assert.equal(seen[0].h.get("X-Operator"), null);
  assert.equal(seen[0].h.get("Authorization"), null);
  ctx.window.NOCP_LEGACY_OPERATOR = true;
  await ctx.window.fetch("http://127.0.0.1:8000/api/v1/spec");
  await ctx.window.fetch("http://127.0.0.1:8000/api/v1/x", { headers: { "X-Tenant-Id": "t" } });
  await ctx.window.fetch("https://example.com/a");
  assert.equal(seen[1].h.get("X-Operator"), "true");
  assert.equal(seen[2].h.get("X-Operator"), null);
  assert.equal(seen[3].h.get("X-Operator"), null);
});
test("nocp-auth: Bearer token from window.NOCP_TOKEN, NOCP base only", async () => {
  const { ctx, seen } = runShim("/ops/");
  ctx.window.NOCP_TOKEN = "tok-123";
  await ctx.window.fetch("http://127.0.0.1:8000/api/v1/spec", { headers: { "X-Operator": "true" } });
  await ctx.window.fetch("https://example.com/a");
  assert.equal(seen[0].h.get("Authorization"), "Bearer tok-123");
  assert.equal(seen[0].h.get("X-Operator"), null);        // token replaces legacy headers
  assert.equal(seen[1].h.get("Authorization"), null);     // never leaks to other origins
});
test("nocp-auth: customer pages never get operator header, but do get Bearer", async () => {
  const { ctx, seen } = runShim("/customer/");
  ctx.window.NOCP_LEGACY_OPERATOR = true;
  await ctx.window.fetch("http://127.0.0.1:8000/api/v1/spec");
  assert.equal(seen[0].h.get("X-Operator"), null);
  ctx.window.NOCP_TOKEN = "tenant-tok";
  await ctx.window.fetch("http://127.0.0.1:8000/api/v1/spec");
  assert.equal(seen[1].h.get("Authorization"), "Bearer tenant-tok");
});
test("dsx-api: token option → Authorization Bearer; SSE uses short-lived events token", async () => {
  const auth = require(path.join(ROOT, "shared/nocp-auth.js"));
  assert.equal(auth.HEADERS.AUTH, "Authorization");
  const f = fakeFetch({ "GET /api/v1/nvke/clusters": [] });
  const D = dsxMod.create({ base: "http://nocp", fetch: f, token: "op-tok" });
  await D.nvkeClusters();
  assert.equal(f.calls[0].headers["Authorization"], "Bearer op-tok");
  assert.equal(f.calls[0].headers["X-Operator"], undefined);
  const calls = [];
  const fx = async (u, init) => { calls.push({ u, init }); return { ok: true, json: async () => ({ token: "ev+1" }) }; };
  const url = await auth.eventsUrl("http://nocp/api/v1", fx, null, "op-tok");
  assert.equal(url, "http://nocp/api/v1/events?token=ev%2B1");
  assert.equal(calls[0].u, "http://nocp/api/v1/events/token");
  assert.equal(calls[0].init.headers.Authorization, "Bearer op-tok");
  assert.equal(await auth.eventsUrl("http://nocp/api/v1", fx, null, null), "http://nocp/api/v1/events");
});

/* ── 6. screen wiring ──────────────────────────────────────── */
test("ops console: DSX screens, menus and script order", () => {
  const s = read("ops/index.html");
  for (const id of ["dsx-oob", "dsx-power", "dsx-rma", "dsx-metering", "dsx-versions"]) {
    assert.match(s, new RegExp(`data-screen="${id}"`), id);
    assert.match(s, new RegExp(`data-route="${id}"`), id);
    assert.match(s, new RegExp(`id="${id}-root"`), id);
  }
  const pos = n => s.indexOf(`<script src="${n}"></script>`);
  assert.ok(pos("../shared/nocp-auth.js") > 0 && pos("../shared/nocp-auth.js") < pos("../shared/app.js"));
  assert.ok(pos("../shared/nocp-api.js") < pos("../shared/dsx-api.js"));
  assert.ok(pos("../shared/dsx-api.js") < pos("dsx.js") && pos("dsx.js") < pos("app.js"));
  const js = read("ops/dsx.js");
  for (const id of ["dsx-oob", "dsx-power", "dsx-versions", "dsx-rma", "dsx-metering"]) assert.ok(js.includes(`"${id}"`), id);
});

test("ops console: Managed K8S is live-first (MOCK badge only on fallback)", () => {
  const s = read("ops/index.html");
  assert.doesNotMatch(s, /<span class="bd-txt">MOCK<\/span>/);
  assert.match(s, /라이브 우선 — 실패 시에만 MOCK/);
  assert.doesNotMatch(s, /Managed K8S \(목업\)/);
});

test("customer console: NVKE screen + product selection wired", () => {
  const s = read("customer/index.html");
  assert.match(s, /data-screen="nvke"/);
  assert.match(s, /data-route="nvke"/);
  assert.ok(s.indexOf('src="../shared/dsx-api.js"') < s.indexOf('src="nvke.js"'));
  assert.ok(s.indexOf('src="nvke.js"') < s.indexOf('<script src="app.js">'));
  const js = read("customer/nvke.js");
  for (const k of ["nvkeCreate", "nvkeKubeconfig", "nvkeUpgrade", "metering", "catalog", "create_cluster"]) assert.ok(js.includes(k), k);
});

test("biz console loads nocp-auth before app.js", () => {
  const s = read("biz/index.html");
  assert.ok(s.indexOf("nocp-auth.js") > 0 && s.indexOf("nocp-auth.js") < s.indexOf('src="../shared/app.js"'));
});

/* ── 7. i18n: new strings have EN entries ──────────────────── */
function loadDict(file) {
  const ctx = { window: {} };
  vm.runInNewContext(read(file), ctx);
  return ctx.window.NC_I18N;
}
test("i18n: DSX menu/screen strings translated (ops + customer)", () => {
  const ops = loadDict("shared/i18n-ops.js").dict;
  for (const k of ["OOB 모니터링", "MaxLPS 전력", "RMA · 펌웨어", "미터링 · 격리", "DSX OS 버전 매트릭스",
    "랙 OOB 히트맵", "static vs dynamic 시뮬레이션", "DSX Flex 수요반응", "RMA 워크플로우", "테넌트 격리 매트릭스",
    "● AI Infra Twin 라이브 (NOCP 경유)"]) assert.ok(ops[k], k);
  const cu = loadDict("shared/i18n-customer.js").dict;
  for (const k of ["상품 선택", "Managed K8s (NVKE) 클러스터 생성", "NVKE 클러스터", "① K8s 버전", "클러스터 생성"]) assert.ok(cu[k], k);
});

test("i18n: every Korean text literal in ops/dsx.js has an EN entry or pattern", () => {
  const I = loadDict("shared/i18n-ops.js");
  const dict = I.dict, pats = I.patterns;
  const js = read("ops/dsx.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  // runs of text between quotes/markup ≈ DOM text nodes the i18n engine translates
  const RUNTIME = new Set(["요청 접수 —", "· mock 계산"]);   // concatenated with runtime ids → pattern-backed
  const miss = [];
  for (const m of js.matchAll(/[^<>"'`]*[가-힣][^<>"'`]*/g)) {
    const s = m[0].trim();
    if (!/[가-힣]/.test(s) || RUNTIME.has(s)) continue;
    if (dict[s] || pats.some(p => p[0].test(s))) continue;
    if (pats.some(p => p[0].source.startsWith("^" + s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))) continue;
    miss.push(s);
  }
  assert.deepEqual(miss, []);
});

/* ── 8. renderers execute against a stub DOM (mock data, offline NOCP) ── */
function stubDom(hash) {
  const els = {};
  const el = id => (els[id] = els[id] || { id, innerHTML: "", value: "", style: {}, dataset: {},
    querySelector: () => ({ outerHTML: "<div class=ph></div>" }), scrollIntoView() {} });
  const bus = {};
  const ctx = {
    console, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, URL, Blob,
    location: { hash, pathname: "/ops/" },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: {
      getElementById: el, createElement: () => ({ style: {}, set textContent(v) {} }),
      head: { appendChild() {} }, body: { appendChild() {} },
      addEventListener() {}, querySelector: () => null,
    },
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  ctx.fetch = offline;
  ctx.NC = { bus: { on: (e, f) => (bus[e] = bus[e] || []).push(f) }, toast() {} };
  vm.createContext(ctx);
  vm.runInContext(read("shared/dsx-api.js"), ctx);
  return { ctx, els, emit: id => Promise.all((bus.route || []).map(f => f(id))) };
}
test("ops/dsx.js: all five DSX screens render with mock fallback", async () => {
  const { ctx, els } = stubDom("#/dsx-oob");
  vm.runInContext(read("ops/dsx.js"), ctx);
  for (const id of ["dsx-oob", "dsx-power", "dsx-versions", "dsx-rma", "dsx-metering"]) {
    await ctx.NC.dsxScreens[id]();
    const html = els[id + "-root"].innerHTML;
    assert.ok(html.length > 500, id);
    assert.match(html, /NOCP 미연동 — mock/, id);
  }
  assert.match(els["dsx-oob-root"].innerHTML, /dsx-cell/);
  assert.match(els["dsx-power-root"].innerHTML, /dynamic \(DPS\)/);
  assert.match(els["dsx-versions-root"].innerHTML, /Vera Rubin NVL72/);
});
test("customer/nvke.js: product cards, wizard and usage render", async () => {
  const { ctx, els } = stubDom("#/nvke");
  ctx.NC.session = () => ({ tenant_id: "tnt-fin-corp", role: "admin" });
  vm.runInContext(read("customer/nvke.js"), ctx);
  await ctx.NC.nvkeRender();
  const html = els["nvke-root"].innerHTML;
  for (const k of ["data-nvke-prod=\"bmaas\"", "data-nvke-prod=\"managed-k8s\"", "① K8s 버전", "nvke-fin-01", "K8s node-hour"])
    assert.ok(html.includes(k), k);
});

/* ── security: static server (serve.py) ───────────────────── */
test("serve.py: refuses traversal, dotfiles, source files and non-console paths", () => {
  const script = `
import json, sys
sys.path.insert(0, ${JSON.stringify(ROOT)})
import serve
cases = ["/", "/ops/", "/ops", "/ops/app.js", "/customer/index.html?x=1",
         "/../serve.py", "/serve.py", "/.git/config", "/ops/%2e%2e/serve.py",
         "/shared/../.git/HEAD", "/tests/smoke.test.mjs", "/run.sh", "/ops/..%5c..%5cserve.py",
         "/shared/%00.js", "/docs/"]
print(json.dumps({c: bool(serve.resolve_request(c)) for c in cases}))`;
  const out = JSON.parse(execFileSync("python3", ["-I", "-c", script], { encoding: "utf8" }));
  for (const ok of ["/", "/ops/", "/ops", "/ops/app.js", "/customer/index.html?x=1"]) assert.equal(out[ok], true, ok);
  for (const [k, v] of Object.entries(out)) if (!["/", "/ops/", "/ops", "/ops/app.js", "/customer/index.html?x=1"].includes(k)) assert.equal(v, false, k);
  const src = read("serve.py");
  assert.match(src, /CONSOLE_HOST", "127\.0\.0\.1"/);
  assert.match(src, /X-Content-Type-Options/);
  assert.match(src, /def list_directory/);
});

test("console pages: CSP meta (object-src none, base-uri self) and nocp-auth loaded before API clients", () => {
  for (const p of ["index.html", "ops/index.html", "customer/index.html", "customer/contact.html", "biz/index.html"]) {
    const s = read(p);
    const m = s.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
    assert.ok(m, p + " CSP");
    assert.match(m[1], /default-src 'self'/);
    assert.match(m[1], /object-src 'none'/);
    assert.match(m[1], /base-uri 'self'/);
  }
  for (const p of ["ops/index.html", "customer/index.html", "biz/index.html"]) {
    const s = read(p);
    assert.ok(s.indexOf("shared/nocp-auth.js") > 0 && s.indexOf("shared/nocp-auth.js") < s.indexOf("shared/nocp-api.js"), p);
  }
  for (const f of ["shared/dsx-api.js", "shared/nocp-api.js", "ops/app.js", "biz/app.js", "customer/app.js"]) {
    assert.doesNotMatch(read(f), /["']X-Operator["']\s*:\s*["']true["']/, f + " must not hardcode X-Operator");
  }
});

test("XSS: every esc() helper escapes & < > \" ' (attribute-safe)", () => {
  for (const f of ["ops/app.js", "customer/app.js", "biz/app.js", "ops/mk8s.js", "ops/dsx.js", "customer/nvke.js", "shared/palette.js"]) {
    const src = read(f);
    const i = src.search(/(?:var|const|let|function)\s+esc\b/);
    assert.ok(i >= 0, f + " has esc");
    let j = src.indexOf("{", i), depth = 0;
    if (/^[^{]*=>\s*[^{\s]/.test(src.slice(i, i + 80))) j = src.indexOf(";\n", i) - 1;   // expression arrow
    else for (; j < src.length; j++) { if (src[j] === "{") depth++; else if (src[j] === "}" && --depth === 0) break; }
    const ctx = {};
    vm.runInNewContext(src.slice(i, j + 1).replace(/^(const|let) /, "var ") + ";\nthis.__e = esc;", ctx);
    assert.equal(ctx.__e(`<img src=x onerror="a('b')">&`), "&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;", f);
  }
});

/* ── integration QA: live DPS telemetry shape → screen shape ─── */
test("dsx-api: powerTelemetry flattens NOCP/DPS domains→groups→racks (racks may be a count)", async () => {
  const f = fakeFetch({ "GET /api/v1/power/telemetry": { source: "ai-infra", domains: [{
    id: "pd-gasan", operating_limit_kw: 3000, effective_limit_kw: 2900, measured_kw: 2500.5, racks: 2,
    groups: [{ group_id: "rg-su-1", name: "su-1", priority: 50, min_kw: 0, max_kw: null, cap_kw: 200,
      measured_kw: 160, racks: [{ rack_id: "su-1-rack-00", measured_kw: 80, cap_kw: 94, headroom_kw: 14, profile: "max-p" },
                                { rack_id: "su-1-rack-01", measured_kw: 80, cap_kw: 94, headroom_kw: 14, profile: "inference" }] }] }] } });
  const D = dsxMod.create({ base: "http://nocp", fetch: f, token: null, session: () => null });
  const r = await D.powerTelemetry("pd-gasan");
  assert.equal(r.live, true);
  assert.equal(r.data.used_kw, 2500.5);
  assert.equal(r.data.operating_limit_kw, 2900);
  assert.deepEqual(r.data.racks.map(k => [k.rack, k.power_kw, k.group, k.profile]),
    [["su-1-rack-00", 80, "su-1", "max-p"], ["su-1-rack-01", 80, "su-1", "inference"]]);
  assert.equal(r.data.groups[0].used_kw, 160);
  assert.equal(r.data.groups[0].max_kw, 200);
});

/* ── console-fix (CONSOLE-BUGS.md 1–10): live NOCP shapes → screen shapes, no hardcoded caps/clock ── */
test("dsx-api: live NVKE releases (k8s_minor/k8s_version/node_image) normalise to k8s/version/node_images", async () => {
  const f = fakeFetch({ "GET /api/v1/nvke/releases": { releases: [
    { id: "nvke-0.23.1-k8s-1.34", nvke_version: "0.23.1", k8s_minor: "1.34", k8s_version: "v1.34.1", node_image: "img-134", default: true },
    { id: "nvke-0.23.1-k8s-1.33", nvke_version: "0.23.1", k8s_minor: "1.33", k8s_version: "v1.33.5", node_image: "img-133", default: false }],
    instance_types: ["vr-nvl72"] } });
  const D = dsxMod.create({ base: "http://nocp", fetch: f, token: null, session: () => null });
  const r = await D.nvkeReleases();
  assert.equal(r.live, true);
  assert.deepEqual(r.data.releases.map(x => [x.k8s, x.version, x.node_image]), [["1.34", "v1.34.1", "img-134"], ["1.33", "v1.33.5", "img-133"]]);
  assert.deepEqual(r.data.node_images, ["img-134", "img-133"]);
  assert.deepEqual(r.data.instance_types, ["vr-nvl72"]);
});

test("dsx-api: live catalog units[] → unit, layer → tier; versions live{} → components", async () => {
  const f = fakeFetch({
    "GET /api/v1/catalog": { products: [{ id: "bmaas", name: "BMaaS", layer: "provisioning", units: ["instance-hour", "gpu-hour"] }] },
    "GET /api/v1/platform/versions": Object.assign({}, PLAN_MATRIX, { live: { ai_infra: Object.assign({}, PLAN_MATRIX, { component: "ai-infra-emulator" }) } }) });
  const D = dsxMod.create({ base: "http://nocp", fetch: f, token: null, session: () => null });
  const c = await D.catalog();
  assert.equal(c.data.products[0].unit, "instance-hour · gpu-hour");
  assert.equal(c.data.products[0].tier, "provisioning");
  const v = await D.versions();
  assert.equal(v.live, true);
  assert.equal(v.data.components.ai_infra.component, "ai-infra-emulator");
});

test("ops: power caps come from DPS domains, not hardcoded MW; no static clock / incident in live paths", () => {
  const app = read("ops/app.js"), html = read("ops/index.html");
  for (const lit of ["26200", "19400", ", 6700,", "26180", "계약 캡 26.2MW", "5.87<small> / 26.2"])
    assert.ok(!app.includes(lit), "ops/app.js still hardcodes " + lit);
  assert.ok(!/26\.2 ?MW/.test(html), "ops/index.html hardcodes 26.2MW");
  assert.ok(!html.includes("2026-07-09 10:41 KST"), "static topbar clock");
  assert.match(app, /pwrDomains\(\)/);
  assert.match(app, /operating_limit_kw/);
  assert.match(app, /measured_kw/);
});

test("shell: KPI band keeps all cards on one row on wide screens (no auto-fit wrap)", () => {
  const css = read("shared/shell.css");
  const rule = css.slice(css.indexOf(".kpi-band{"), css.indexOf("}", css.indexOf(".kpi-band{")));
  assert.ok(!/auto-fit/.test(rule), rule);
  assert.match(rule, /grid-auto-flow:column/);
});

test("ops OOB: leaving the screen stops SSE and polling", () => {
  const src = read("ops/dsx.js");
  assert.match(src, /function stopEvents\(\)/);
  assert.match(src, /clearInterval\(oob\.poll\)/);
  assert.match(src, /id !== "dsx-oob"\) stopEvents\(\)/);
});

test("biz: live MRR never shows the mock growth % ", () => {
  const src = read("biz/app.js");
  assert.match(src, /라이브 · 계약 합계 \(성장률 이력 없음\)/);
  assert.match(src, /el\.dataset\.live\) return/);
});

test("i18n: every new console-fix KO string has an EN entry", () => {
  const ctx = { window: { NC_I18N: { dict: {}, patterns: [] } } };
  for (const f of ["shared/i18n-dict.js", "shared/i18n-ops.js", "shared/i18n-biz.js", "shared/i18n-customer.js"])
    vm.runInNewContext(read(f), ctx);
  const { dict, patterns } = ctx.window.NC_I18N;
  const en = s => dict[s] || (patterns.find(p => (p[0] instanceof RegExp ? p[0] : new RegExp(p[0])).test(s)) || [])[1];
  for (const s of ["보고 없음", "실측 / 캡", "열린 인시던트 없음", "사용 내역 없음", "라이브 · 활성 계약 없음",
    "Managed K8s 클러스터 없음 — 주문 승인·K8s 설치 후 표시됩니다", "25,634 kW · 캡 32.3MW · 랙 텔레메트리 합 10.61MW",
    "su-1-rack-00 · 랙 텔레메트리", "캡 32.3MW 기준", "XID 79 감지 — su-1-rack-00-tray-01", "주문 2건 · 월말 예상 $1,200"])
    assert.ok(en(s), "no EN for: " + s);
});

test("dell: firmware mock uses iDRAC10 baseline = AI-Infra IDRAC_FW, no OpenBMC", () => {
  const src = read("shared/dsx-api.js");
  assert.ok(!/OpenBMC/.test(src));
  const dell = path.join(ROOT, "..", "AI-Infra-Emulator", "app", "dell.py");
  const fw = existsSync(dell) ? readFileSync(dell, "utf8").match(/^IDRAC_FW = "([^"]+)"/m)[1] : "1.4.2";
  assert.ok(src.includes(`{ component: "BMC (Dell iDRAC10)", baseline: "${fw}" }`));
  assert.match(src, /component: "BMC \(Dell iDRAC10\)", current: "[^"]+", baseline: "1\.4\.2", severity: "warning"/);
});
