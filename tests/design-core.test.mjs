// v2 design-core shared components — `node --test tests/` (no deps).
// shared/flow-timeline.js · shared/kpi-gauge.js · shared/msg-viewer.js (V2-DESIGN-COMPONENTS.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = p => readFileSync(path.join(ROOT, p), "utf8");
const require = createRequire(import.meta.url);
const F = require(path.join(ROOT, "shared/flow-timeline.js"));
const K = require(path.join(ROOT, "shared/kpi-gauge.js"));
const M = require(path.join(ROOT, "shared/msg-viewer.js"));
const both = (mod, fn) => { mod._lang = "ko"; const ko = fn(); mod._lang = "en"; const en = fn(); mod._lang = "ko"; return { ko, en }; };

test("flow.timeline: ordered list, status classes, aria-current, escaping, KO/EN", () => {
  const steps = [
    { id: "a", label: { ko: "가입", en: "Sign up" }, status: "done" },
    { id: "b", label: "<b>x</b>", status: "active", sub: { ko: "대기", en: "waiting" } },
    { id: "c", label: "c", status: "bogus" }
  ];
  const { ko, en } = both(F, () => F.timeline(steps, { progress: true }));
  assert.match(ko, /<ol class="ft ft--v" aria-label="단계 타임라인">/);
  assert.match(en, /aria-label="Step timeline"/);
  assert.match(ko, /가입/); assert.match(en, /Sign up/); assert.doesNotMatch(en, /가입/);
  assert.match(ko, /class="ft-step active" aria-current="step"/);
  assert.match(ko, /class="ft-step pending"/, "unknown status → pending");
  assert.ok(!ko.includes("<b>x</b>") && ko.includes("&lt;b&gt;x&lt;/b&gt;"));
  assert.match(ko, /role="progressbar"[^>]*aria-valuemax="3" aria-valuenow="1"/);
  assert.match(ko, /완료/); assert.match(en, /in progress/);
});

test("flow.timeline: selectable steps are buttons with aria-pressed; horizontal + big", () => {
  const h = F.timeline([{ id: 1, label: "a" }, { id: 2, label: "b" }], { selectable: true, selected: 2, orientation: "horizontal", big: true });
  assert.equal((h.match(/<button type="button" class="ft-hit" data-ft-step=/g) || []).length, 2);
  assert.match(h, /data-ft-step="2" aria-pressed="true"/);
  assert.match(h, /ft--h/); assert.match(h, /ft-wrap ft--big/);
});

test("flow.swimlane: table with row headers per lane and parallel columns", () => {
  const h = F.swimlane([{ id: "x", label: "NICo" }, { id: "y", label: { ko: "청구", en: "Billing" } }],
    [{ lane: "x", label: "s1", status: "done" }, { lane: "y", label: "s2", status: "fail" }, { lane: "x", label: "s3", col: 1 }]);
  assert.match(h, /<table class="fsl">/);
  assert.equal((h.match(/<th scope="row"/g) || []).length, 2);
  assert.equal((h.match(/<th scope="col" class="tabnum">/g) || []).length, 2, "s3 shares column 2 with s2");
  assert.match(h, /fsl-chip fail/);
  assert.match(h, /role="region" tabindex="0"/, "scroll container is keyboard reachable");
});

test("flow.summary / fromDemo map runner steps", () => {
  const t = F.fromDemo([{ id: "s1", title_ko: "가", title_en: "A", ok: true }, { id: "s2", title_ko: "나", title_en: "B", status: "running" }, { id: "s3", status: "failed" }]);
  assert.deepEqual(t.map(s => s.status), ["done", "active", "fail"]);
  const s = F.summary(t); assert.equal(s.total, 3); assert.equal(s.done, 1); assert.equal(s.fail, 1);
});

test("kpi.tone: higher-better and lower-better thresholds", () => {
  assert.equal(K.tone(99.95, { target: 99.9 }), "ok");
  assert.equal(K.tone(99.0, { target: 99.9, warn: 99.5 }), "crit");
  assert.equal(K.tone(99.6, { target: 99.9, warn: 99.5 }), "warn");
  assert.equal(K.tone(180, { target: 250, lowerBetter: true }), "ok");
  assert.equal(K.tone(280, { target: 250, lowerBetter: true }), "warn");
  assert.equal(K.tone(400, { target: 250, lowerBetter: true }), "crit");
  assert.equal(K.tone(5, {}), "none");
});

test("kpi.gauge: svg arc + target tick + accessible sentence (KO/EN)", () => {
  const o = { label: { ko: "가용성", en: "Availability" }, value: 99.95, min: 99, max: 100, target: 99.9, unit: "%", digits: 3 };
  const { ko, en } = both(K, () => K.gauge(o));
  assert.match(ko, /role="img" aria-label="가용성 99.95%, 목표 ≥ 99.9% — 목표 충족"/);
  assert.match(en, /aria-label="Availability 99.95%, target ≥ 99.9% — on target"/);
  assert.match(ko, /class="kg-val kg-ok"/); assert.match(ko, /class="kg-target"/);
  assert.match(ko, /<svg[^>]*aria-hidden="true"/);
  assert.doesNotMatch(ko, /#[0-9a-f]{6}/i, "no hard-coded colours");
});

test("kpi.target: lower-better bullet with band and compare", () => {
  const h = K.target({ label: "TTFT p99", value: 320, target: 250, max: 400, unit: "ms", lowerBetter: true, band: [0, 250], compare: { value: 200, label: "p50" } });
  assert.match(h, /data-tone="warn"|data-tone="crit"/);
  assert.match(h, /kb-tick" style="left:62.50%/);
  assert.match(h, /kb-band/); assert.match(h, /kb-cmp/);
  assert.match(h, /목표 ≤ 250 ms/);
});

test("kpi.spark / stack / stat render with aria text", () => {
  const s = K.spark([1, 4, null, 2], { label: "tok/s", area: true, target: 3 });
  assert.match(s, /aria-label="tok\/s 추이: 최소 1, 최대 4, 최근 2"/); assert.match(s, /ks-target/);
  assert.match(K.spark([], { label: "x" }), /데이터 없음/);
  const st = K.stack([{ label: "G1", value: 60 }, { label: "miss", value: 40, tone: "crit" }], { label: "KV", unit: "%", total: 100 });
  assert.match(st, /aria-label="KV: G1 60%, miss 40%"/); assert.match(st, /kg-bg-crit" style="width:40.00%/);
  const t = K.stat({ label: "₩", value: "₩1,000", delta: -2, deltaGoodWhen: "down", spark: [1, 2] });
  assert.match(t, /₩1,000/); assert.match(t, /kt-d kg-t-ok/);
});

test("msg.normalize accepts v2-api trace and demo step; redacts secrets", () => {
  const a = M.normalize({ method: "post", url: "http://n/v1/chat/completions", req_headers: { Authorization: "Bearer sk-1234567890abcdef" }, req_body: "{\"a\":1}", status: 200, res_headers: { "content-type": "application/json" }, res_body: "{}" });
  assert.equal(a.method, "POST"); assert.equal(a.reqHeaders.Authorization, "Bearer sk-12…");
  const b = M.normalize({ request: { method: "GET", path: "/api/v1/x", headers: { Cookie: "s=abcdefghijklmnopq" } }, response: { status: 404, body: { detail: "Not Found" }, summary: "nf" } });
  assert.equal(b.url, "/api/v1/x"); assert.equal(b.status, 404); assert.match(b.resBody, /"detail": "Not Found"/); assert.equal(b.reqHeaders.Cookie, "s=abcdefghij…");
});

test("msg.render: start line, reason phrase, headers, pretty JSON, copy buttons, no raw HTML injection", () => {
  const h = M.render({ method: "POST", url: "http://n/v1/x", req_headers: { "Content-Type": "application/json" }, req_body: "{\"q\":\"<script>\",\"n\":3,\"ok\":true}", status: 429, res_headers: { "retry-after": "2" }, res_body: "{\"error\":{\"message\":\"it's\"}}" }, { open: true });
  assert.match(h, /<details class="mv" open>/);
  assert.match(h, /mv-st mv-warn tabnum">429 Too Many Requests/);
  assert.match(h, /<dt>retry-after<\/dt><dd>2<\/dd>/);
  assert.ok(!h.includes("<script>")); assert.match(h, /&lt;script&gt;/);
  assert.match(h, /<span class="mv-n">3<\/span>/); assert.match(h, /<span class="mv-b">true<\/span>/);
  assert.match(h, /it&#39;s/, "entities survive highlighting");
  assert.equal((h.match(/data-mv-copy="m\d+"/g) || []).length, 4, "curl + raw + 2 bodies");
  assert.match(M.render({ method: "GET", url: "/x", status: "MOCK" }), /mv-mock/);
});

test("msg.curl / pretty truncation / list ordering", () => {
  const c = M.curl({ method: "POST", url: "http://n/v1/x", req_headers: { Authorization: "Bearer zzz", "X-A": "it's" }, req_body: "{\"a\":1}" });
  assert.match(c, /-X POST/); assert.match(c, /Bearer \$TOKEN/); assert.match(c, /'X-A: it'\\''s'/); assert.match(c, /-d '\{"a":1\}'/);
  assert.match(M.pretty("x".repeat(4100)), /mv-cut/);
  const l = M.list([{ method: "GET", url: "/first", status: 200 }, { method: "GET", url: "/second", status: 200 }]);
  assert.ok(l.indexOf("/second") < l.indexOf("/first"), "newest first");
  M._lang = "en"; assert.match(M.list([]), /No requests recorded yet/); M._lang = "ko";
});

test("components load in all three consoles, after v2-ui.js", () => {
  for (const f of ["ops/index.html", "customer/index.html", "biz/index.html"]) {
    const s = read(f);
    const i = s.indexOf("shared/v2-ui.js"), j = s.indexOf("shared/flow-timeline.js");
    assert.ok(i > 0 && j > i, f);
    assert.ok(s.includes("shared/kpi-gauge.js") && s.includes("shared/msg-viewer.js"), f);
  }
});

test("component CSS uses only tokens (no hex colours) and every Korean UI literal has an EN pair", () => {
  for (const m of [F, K, M]) assert.doesNotMatch(m.css, /#[0-9a-f]{3,6}\b/i);
  for (const f of ["shared/flow-timeline.js", "shared/kpi-gauge.js", "shared/msg-viewer.js"]) {
    const code = read(f).replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n");
    const pairs = code.match(/L\("[^"]*[가-힣][^"]*",\s*"[^"]*"\)|\["[^"]*[가-힣][^"]*",\s*"[^"]*"\]/g) || [];
    const ko = (code.match(/"[^"]*[가-힣][^"]*"/g) || []).length;
    assert.equal(ko, pairs.length, f + ": unpaired Korean literal");
  }
});

/* ── 정보 구조 (V2-DESIGN-BRIEF §1): 메뉴 재편 · NEW 배지 · 홈 하이라이트 ── */
import vm from "node:vm";
function dictFor(file) {
  const ctx = { window: {} }; ctx.window.window = ctx.window; vm.createContext(ctx);
  for (const f of ["shared/i18n-dict.js", file, "shared/i18n-design.js"]) vm.runInContext(read(f).replace(/^window\./gm, "window."), ctx);
  return ctx.window.NC_I18N.dict;
}
const navOf = s => s.slice(s.indexOf("<nav"), s.indexOf("</nav>"));
const koTexts = html => (html.replace(/<!--[\s\S]*?-->/g, "").match(/>([^<>]*[가-힣][^<>]*)</g) || []).map(m => m.slice(1, -1).trim()).filter(Boolean);
const CONSOLES = [["ops/index.html", "shared/i18n-ops.js", "overview", 9], ["customer/index.html", "shared/i18n-customer.js", "dashboard", 6], ["biz/index.html", "shared/i18n-biz.js", "dashboard", 3]];

test("IA: every menu route kept once, grouped by product (BMaaS / NVKE / Token API / 계정·계약·청구 / 운영)", () => {
  const want = {
    "ops/index.html": ["overview", "demo-center", "assets", "capacity", "provisioning", "bringup", "network", "power", "telemetry", "incidents", "performance", "security", "change", "orchestration",
      "obs-overview", "obs-gpu", "obs-fabtopo", "obs-rack", "obs-dlc", "obs-fabric", "obs-slo", "obs-alerts", "obs-trayops", "dsx-oob", "dsx-power", "dsx-rma", "dsx-metering",
      "v2-recovery", "v2-token", "v2-billing", "v2-accounts", "dsx-versions", "nvke-capi", "nvke-sched", "p2-grid", "p2-pipeline", "p2-firmware", "p2-attest", "p2-finops", "p2-notices", "p2-metrics"],
    "customer/index.html": ["dashboard", "clusters", "nvke", "nodes", "images", "storage", "network", "monitoring", "alerts", "status", "sla", "billing", "invoices", "support", "security", "api", "token", "marketplace", "settings", "iam"],
    "biz/index.html": ["dashboard", "pipeline", "rfq", "contracts", "revenue", "pricing", "planning", "partners", "compliance", "market", "channel"]
  };
  for (const [f, routes] of Object.entries(want)) {
    const nav = navOf(read(f));
    for (const r of routes) assert.equal(nav.split(`data-route="${r}"`).length - 1, 1, f + " " + r);
    assert.equal((nav.match(/data-route="/g) || []).length, routes.length, f + " no extra routes");
    assert.match(nav, /<nav aria-label="주 메뉴">/);
  }
  const ops = navOf(read("ops/index.html"));
  const order = ["BMaaS · 인프라", "Managed K8s (NVKE)", "Token API", "계정 · 계약 · 청구", "운영 — OOB · 전력 · 전력망 · 복구 · bring-up"].map(g => ops.indexOf(g));
  assert.ok(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])), "ops product groups in brief order");
  assert.ok(ops.indexOf('data-route="v2-token"') > ops.indexOf(">Token API<"));
  assert.ok(ops.indexOf('id="mk8s-sub"') > ops.indexOf('data-route="nvke-sched"'), "mk8s portal sits in the NVKE group");
  assert.match(ops, /id="mk8s-mode-btn"/);
});

test("IA: NEW badges on v2 features only; home highlight cards link to real routes", () => {
  for (const [f, , home, n] of CONSOLES) {
    const s = read(f), nav = navOf(s);
    const news = [...nav.matchAll(/data-route="([^"]+)"[^\n]*bd new/g)].map(m => m[1]);
    assert.ok(news.length >= 2, f);
    for (const r of ["overview", "dashboard", "assets", "support", "pipeline"]) assert.ok(!news.includes(r), f + " " + r + " is not v2");
    const sec = s.slice(s.indexOf(`<section data-screen="${home}">`));
    const hl = sec.slice(sec.indexOf('<section class="v2hl"'), sec.indexOf("</section>", sec.indexOf('<section class="v2hl"')));
    assert.ok(sec.indexOf('<section class="v2hl"') < 4000, f + " highlight near top of home");
    const links = [...hl.matchAll(/class="v2hl-card" href="#\/([^"]+)"/g)].map(m => m[1]);
    assert.equal(links.length, n, f);
    for (const r of links) assert.ok(nav.includes(`data-route="${r}"`), f + " card → menu route " + r);
    assert.match(hl, /aria-labelledby="v2hl-\w+-h"/);
    assert.ok(s.includes("shared/v2-design.css") && s.indexOf("shared/i18n-design.js") < s.indexOf("shared/i18n.js"), f + " assets/load order");
  }
});

test("IA: every Korean string in menus and highlight cards has an EN dictionary entry", () => {
  for (const [f, dict] of CONSOLES) {
    const s = read(f), D = dictFor(dict);
    const hlAt = s.indexOf('<section class="v2hl"');
    const parts = navOf(s) + s.slice(hlAt, s.indexOf("</section>", hlAt));
    const attrs = [...parts.matchAll(/(?:title|aria-label)="([^"]*[가-힣][^"]*)"/g)].map(m => m[1]);
    const miss = [...new Set(koTexts(parts).concat(attrs))].filter(t => !D[t]);
    assert.deepEqual(miss, [], f);
  }
});

test("v2-design.css uses tokens only", () => {
  assert.doesNotMatch(read("shared/v2-design.css"), /#[0-9a-f]{3,6}\b/i);
});

test("component gallery page loads the three components with CSP and day/night/KO/EN controls", () => {
  const s = read("shared/components.html");
  for (const f of ["flow-timeline.js", "kpi-gauge.js", "msg-viewer.js", "tokens.css", "design-mode.js"]) assert.ok(s.includes(`src="${f}"`) || s.includes(`href="${f}"`), f);
  assert.match(s, /Content-Security-Policy/); assert.match(s, /id="nc-main"/);
  assert.match(s, /data-cg-lang="en"/); assert.match(s, /data-cg-theme="legacy"/);
});
