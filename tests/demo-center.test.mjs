// Demo Center (ops/demo.js) — `node --test tests/` (no dependencies).
// Covers: route wiring, KO/EN string parity, badges (text + class, not colour only),
// deep links, HTML escaping, runner client paths against a fake fetch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = p => readFileSync(path.join(ROOT, p), "utf8");
const require = createRequire(import.meta.url);
const DC = require(path.join(ROOT, "ops/demo.js"));

test("ops console wires the demo-center route (link + section + script)", () => {
  const html = read("ops/index.html");
  assert.match(html, /href="#\/demo-center" data-route="demo-center"/);
  assert.match(html, /<section data-screen="demo-center"><div id="demo-center-root"><\/div><\/section>/);
  const iDsx = html.indexOf('<script src="dsx.js"></script>');
  const iDemo = html.indexOf('<script src="demo.js"></script>');
  assert.ok(iDsx > 0 && iDemo > iDsx, "demo.js loads after the shared scripts");
  assert.match(read("shared/i18n-ops.js"), /"데모 센터": "Demo Center"/);
});

test("KO and EN catalogs have the same keys", () => {
  const keys = o => Object.keys(o).sort();
  assert.deepEqual(keys(DC.T.ko), keys(DC.T.en));
  assert.deepEqual(keys(DC.T.ko.state), keys(DC.T.en.state));
  assert.deepEqual(keys(DC.T.ko.verdict), keys(DC.T.en.verdict));
});

test("badges carry a glyph and text, not colour only (WCAG 1.4.1)", () => {
  const b = DC.badge("failed", null, "ko");
  assert.match(b, /nc-badge crit/);
  assert.match(b, /■ 실패/);
  assert.match(DC.badge("passed", null, "en"), /nc-badge ok">● passed/);
  assert.match(DC.badge("pending", "F05", "en"), /pending feature F05/);
  assert.match(DC.verdictBadge("pass_with_pending", "ko"), /통과\(대기 기능 있음\)/);
});

test("deep links: ops hash routes, other consoles by relative path", () => {
  assert.equal(DC.href({ console: "ops", route: "dsx-rma" }), "#/dsx-rma");
  assert.equal(DC.href({ console: "customer", route: "billing" }), "../customer/index.html#/billing");
  assert.equal(DC.href({ console: "biz", route: "contracts" }), "../biz/index.html#/contracts");
});

const SC = {
  id: "a-signup-to-invoice", title_ko: "(a) 가입", title_en: "(a) Signup", summary_ko: "요약", summary_en: "summary",
  feature: "F07/F06/F05", story: "US-01", steps: [
    { id: "01-signup", title_ko: "가입", title_en: "Signup", narration_ko: "나레이션", narration_en: "narration",
      expect_ko: "기대", expect_en: "expect", feature: "F07", pending: true, links: [] },
    { id: "02-order", title_ko: "주문", title_en: "Order", narration_ko: "주문 설명", narration_en: "order note",
      feature: null, pending: false, links: [{ console: "ops", route: "provisioning", label_ko: "프로비저닝", label_en: "Provisioning" }] },
  ],
};

test("detail without a run shows pending/waiting steps and the run buttons", () => {
  const ko = DC.renderDetail(SC, null, "ko", false);
  assert.match(ko, /data-dc-act="run"/);
  assert.match(ko, /data-dc-act="step"/);
  assert.doesNotMatch(ko, /data-dc-act="next"/);
  assert.match(ko, /◌ 기능 대기 F07/);
  assert.match(ko, /○ 대기/);
  assert.match(ko, /href="#\/provisioning"/);
  const en = DC.renderDetail(SC, null, "en", true);
  assert.match(en, /\(a\) Signup/);
  assert.match(en, /order note/);
  assert.match(en, /disabled/);
});

test("run timeline renders assertion, request line, raw block; escapes HTML", () => {
  const run = {
    id: "demo-run-0001", mode: "step", state: "paused", verdict: "running", total_ms: 12.5,
    counts: { passed: 1, failed: 0, pending: 1, skipped: 0 },
    steps: [
      { id: "01-signup", title_ko: "가입", title_en: "Signup", narration_ko: "n", narration_en: "n", feature: "F07",
        state: "pending", fallback: true, assertion: { ok: null, detail_ko: "pending feature F07 — 없음 · 기존 API로 대체 실행", detail_en: "pending feature F07" },
        request: { method: "POST", url: "http://nocp.demo/api/v1/tenants" }, response: { status: 201, summary: "HTTP 201 · {id}" }, duration_ms: 3 },
      { id: "02-order", title_ko: "<b>주문</b>", title_en: "Order", narration_ko: "n", narration_en: "n", state: "passed",
        assertion: { ok: true, detail_ko: "주문 ord-1 → delivered", detail_en: "order ord-1 → delivered" },
        request: { method: "POST", url: "http://nocp.demo/api/v1/orders" }, response: { status: 201, summary: "HTTP 201" }, duration_ms: 9.5 },
    ],
  };
  const html = DC.renderDetail(SC, run, "ko", false);
  assert.match(html, /data-dc-act="next"/);
  assert.match(html, /data-dc-act="cont"/);
  assert.match(html, /POST http:\/\/nocp\.demo\/api\/v1\/orders/);
  assert.match(html, /주문 ord-1 → delivered/);
  assert.match(html, /pending feature F07 — 없음 · 기존 API로 대체 실행/);
  assert.match(html, /<details class="dc-raw">/);
  assert.match(html, /&lt;b&gt;주문&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>주문<\/b>/);
  assert.match(html, /9\.5 ms/);
  const done = DC.renderDetail(SC, { ...run, mode: "step", state: "done", verdict: "pass_with_pending" }, "en", false);
  assert.doesNotMatch(done, /data-dc-act="next"/);
  assert.match(done, /pass \(features pending\)/);
});

test("scenario list marks the selection (aria-pressed) and pending features", () => {
  const html = DC.renderList([{ id: "x", title_ko: "엑스", title_en: "X", feature: "F01", steps: 3, pending_features: ["F01", "F02"] },
    { id: "y", title_ko: "와이", title_en: "Y", feature: "baseline", steps: 8, pending_features: [] }], "x", "en");
  assert.match(html, /data-dc-scn="x" aria-pressed="true"/);
  assert.match(html, /data-dc-scn="y" aria-pressed="false"/);
  assert.match(html, /pending features F01 F02/);
});

test("client talks only to NOCP /api/v1/demo/* with the documented verbs", async () => {
  const calls = [];
  const fetch = async (url, opt) => {
    calls.push([opt.method, url, opt.body ? JSON.parse(opt.body) : undefined]);
    if (url.endsWith("/nope")) return { ok: false, status: 404, text: async () => '{"detail":"scenario not found"}' };
    return { ok: true, status: 200, text: async () => '{"ok":true}' };
  };
  const c = DC.createClient({ fetch, base: "http://127.0.0.1:20162" });
  await c.scenarios();
  await c.scenario("h-bmaas-baseline");
  await c.run("h-bmaas-baseline", "all", 700);
  await c.step("demo-run-0001");
  await c.cont("demo-run-0001", 150);
  await c.get("demo-run-0001");
  await c.reset("all");
  assert.deepEqual(calls.map(c => c[0] + " " + c[1].replace("http://127.0.0.1:20162", "")), [
    "GET /api/v1/demo/scenarios",
    "GET /api/v1/demo/scenarios/h-bmaas-baseline",
    "POST /api/v1/demo/scenarios/h-bmaas-baseline/run",
    "POST /api/v1/demo/runs/demo-run-0001/step",
    "POST /api/v1/demo/runs/demo-run-0001/continue?pace_ms=150",
    "GET /api/v1/demo/runs/demo-run-0001",
    "POST /api/v1/demo/reset",
  ]);
  assert.deepEqual(calls[2][2], { mode: "all", pace_ms: 700 });
  assert.deepEqual(calls[6][2], { scope: "all" });
  assert.equal(c.eventsUrl("demo-run-0001"), "http://127.0.0.1:20162/api/v1/demo/runs/demo-run-0001/events");
  await assert.rejects(c.scenario("nope"), /scenario not found/);
});

test("presenter mode CSS hides the sidebar and scales the text", () => {
  assert.match(DC.CSS, /body\.demo-presenter #nc-sidebar/);
  assert.match(DC.CSS, /--dc-scale:1\.45/);
  assert.doesNotMatch(DC.CSS, /#[0-9a-fA-F]{3,6}\b/, "colours come from shared/tokens.css variables");
});
