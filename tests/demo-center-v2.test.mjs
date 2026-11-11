// Demo Center v2 showcase (ops/demo.js) — `node --test tests/` (no dependencies).
// Covers: presenter spotlight + step strip, progress bar, result summary card, swimlane lanes,
// raw request/response viewer (local and NC.msg), showcase grouping, KO/EN talk track, deep-link targets.
// Fixture: a live run of c-xid-remediation (NOCP integration/v2) with bodies trimmed.
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
const FX = JSON.parse(read("tests/fixtures/demo-run-c-xid.json"));
const RUN = FX.run;
const SC = { id: RUN.scenario_id, title_ko: RUN.title_ko, title_en: RUN.title_en, summary_ko: "요약", summary_en: "summary", steps: [] };
const SHOWCASE = ["a-signup-to-invoice", "b-token-api", "c-xid-remediation", "d-grid-curtailment",
  "e-leak-workload-move", "f-rack-bringup", "g-nvke-clique", "h-bmaas-baseline"];

test("KO/EN talk track covers all 8 showcase scenarios", () => {
  for (const id of SHOWCASE) {
    assert.ok(DC.TALK[id], id);
    assert.ok(DC.TALK[id].ko.length > 10 && DC.TALK[id].en.length > 10, id);
    assert.ok(DC.isShowcase(id), id);
  }
  assert.equal(DC.isShowcase("f23-rack-bringup"), false);
  const k = o => Object.keys(o).sort();
  assert.deepEqual(k(DC.T.ko), k(DC.T.en));
});

test("swimlane lanes come from the upstream request path", () => {
  const lane = id => DC.laneOf(RUN.steps.find(s => s.id === id));
  assert.equal(lane("01-tenant"), "identity");
  assert.equal(lane("02-order"), "bmaas");
  assert.equal(lane("04-inject-xid"), "inject");
  assert.equal(lane("06-rma"), "recovery");
  assert.equal(lane("08-sla-report"), "recovery");
  assert.equal(lane("08b-metered-hours"), "metering");
  assert.equal(lane("09-invoice-run"), "billing");
  assert.equal(DC.laneOf({ request: { service: "nocp", url: "http://nocp.demo/v1/chat/completions" } }), "token");
  assert.equal(DC.laneOf({ request: { service: "nocp", url: "http://nocp.demo/api/v1/power/flex-events" } }), "power");
  assert.equal(DC.laneOf({ request: { service: "nocp", url: "http://nocp.demo/api/v1/nvke/clusters" } }), "nvke");
  const lanes = DC.lanesFor(RUN.steps).map(l => l.id);
  assert.deepEqual(lanes, ["identity", "bmaas", "recovery", "inject", "metering", "billing"], "order of first appearance");
});

test("swimlane view: table with row-header lanes and a selectable chip per step + raw messages", () => {
  const html = DC.renderDetail(SC, RUN, "ko", false, { view: "swim", focus: 5 });
  assert.match(html, /<table class="dc-sl">/);
  assert.equal((html.match(/<th scope="row"/g) || []).length, 6);
  assert.equal((html.match(/data-ft-step="/g) || []).length, RUN.steps.length);
  assert.match(html, /data-ft-step="5" aria-pressed="true"/);
  assert.match(html, /data-dc-view="swim" aria-pressed="true"/);
  assert.match(html, /GET \/api\/v1\/rma/, "raw viewer for the focused step");
  assert.match(html, /role="progressbar"[^>]*aria-valuenow="11"/);
});

test("raw viewer shows the upstream message as sent: method, path, Host, headers, body; escapes", () => {
  const st = { id: "x", request: { service: "nocp", method: "POST", url: "http://nocp.demo/api/v1/orders?dry=1",
    headers: { Authorization: "Bearer …(redacted)", "Content-Type": "application/json" }, body: { name: "<b>x</b>" } },
    response: { status: 409, headers: { "content-type": "application/json" }, body: { detail: "exists" } } };
  const h = DC.msgHtml(st, "en");
  assert.match(h, /POST \/api\/v1\/orders\?dry=1/);
  assert.match(h, /Host:<\/span> nocp\.demo/);
  assert.match(h, /Bearer …\(redacted\)/);
  assert.match(h, /&quot;name&quot;: &quot;&lt;b&gt;x&lt;\/b&gt;&quot;/);
  assert.doesNotMatch(h, /<b>x<\/b>/);
  assert.match(h, /nc-badge warn">HTTP 409/);
  assert.match(DC.msgHtml({ id: "i" }, "en"), /no HTTP message/);
});

test("raw viewer uses design-core NC.msg when it is loaded", () => {
  const M = require(path.join(ROOT, "shared/msg-viewer.js"));
  globalThis.NC = { msg: M };
  try {
    const h = DC.msgHtml(RUN.steps[5], "ko");
    assert.match(h, /dc-msg-core/);
    assert.doesNotMatch(h, /class="dc-msg"/);
  } finally { delete globalThis.NC; }
});

test("swimlane and progress use design-core NC.flow when it is loaded", () => {
  const F = require(path.join(ROOT, "shared/flow-timeline.js"));
  globalThis.NC = { flow: F };
  try {
    const html = DC.renderDetail(SC, RUN, "en", false, { view: "swim", focus: 0 });
    assert.match(html, /class="fsl"/);
    assert.match(html, /ft-prog/);
    assert.match(html, /data-ft-step="0" aria-pressed="true"/);
  } finally { delete globalThis.NC; }
});

test("result summary card: verdict, counts, failed step to check, deduped deep links", () => {
  const html = DC.renderDetail(SC, RUN, "ko", false, {});
  assert.match(html, /class="dc-sumcard v-fail"/);
  assert.match(html, /10 \/ 11/);
  assert.match(html, /data-dc-focus="5"/, "failed step 06-rma is listed");
  const links = (html.match(/class="dc-sumcard[\s\S]*?<\/section>/) || [""])[0].match(/class="dc-link"/g) || [];
  const uniq = new Set(RUN.steps.flatMap(s => (s.links || []).map(l => l.console + ":" + l.route)));
  assert.equal(links.length, uniq.size);
  assert.doesNotMatch(DC.renderDetail(SC, { ...RUN, state: "running" }, "ko", true, {}), /dc-sumcard/);
});

test("presenter mode: spotlight with step strip, big talk track, prev/next; no full timeline", () => {
  const ko = DC.renderDetail(SC, RUN, "ko", false, { presenter: true });
  assert.match(ko, /class="dc-spot s-failed"/, "done run spotlights the first failure");
  assert.match(ko, /단계 6 \/ 11/);
  assert.equal((ko.match(/class="dc-dot /g) || []).length, 11);
  assert.match(ko, /data-dc-focus="5" aria-pressed="true"/);
  assert.match(ko, /말할 것/);
  assert.match(ko, /data-dc-act="prev"/);
  assert.doesNotMatch(ko, /class="dc-timeline"/);
  const en = DC.renderDetail(SC, RUN, "en", false, { presenter: true, focus: 0 });
  assert.match(en, /Step 1 \/ 11/);
  assert.match(en, /Talk track/);
  assert.match(en, /data-dc-act="prev" disabled/);
  assert.match(en, new RegExp(RUN.steps[0].narration_en.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("current step is emphasised (aria-current) while a run is in progress", () => {
  const steps = RUN.steps.map((s, i) => ({ ...s, state: i < 3 ? "passed" : i === 3 ? "running" : "waiting" }));
  const html = DC.renderDetail(SC, { ...RUN, state: "running", steps }, "ko", true, {});
  assert.match(html, /data-step="3" aria-current="step"/);
  assert.equal((html.match(/aria-current="step"/g) || []).length, 1);
  assert.equal(DC.currentIndex(steps, { state: "running" }), 3);
});

test("scenario list groups by Day 0/1/2 (DEMO-ORDER), unknown scenarios folded under Other", () => {
  const list = SHOWCASE.concat(["f23-rack-bringup", "f24-firmware-bundle", "zz-unknown"]).map(id => ({ id, title_ko: id, title_en: id, steps: 3 }));
  const h = DC.renderList(list, "c-xid-remediation", "en");
  assert.match(h, /Day 0 Build/); assert.match(h, /Day 1 Onboard/); assert.match(h, /Day 2 Operate/);
  assert.ok(h.indexOf("Day 0 Build") < h.indexOf("f-rack-bringup") && h.indexOf("f-rack-bringup") < h.indexOf("Day 1 Onboard"));
  assert.ok(h.indexOf("h-bmaas-baseline") < h.indexOf("Day 2 Operate") && h.indexOf("c-xid-remediation") > h.indexOf("Day 2 Operate"));
  assert.match(h, /<details class="dc-more">/);
  assert.match(DC.renderList(list, "zz-unknown", "ko"), /<details class="dc-more" open>/);
  assert.match(DC.renderList(list, "zz-unknown", "ko"), /Day 0 구축/);
});

test("every deep link of the 8 showcase scenarios points at a real console screen", () => {
  const html = { ops: read("ops/index.html"), customer: read("customer/index.html"), biz: read("biz/index.html") };
  const js = { ops: read("ops/app.js"), customer: read("customer/app.js"), biz: read("biz/app.js") };
  assert.deepEqual(Object.keys(FX.links).sort(), SHOWCASE);
  for (const [scn, links] of Object.entries(FX.links)) {
    for (const [c, r] of links) {
      const re = new RegExp(`data-(screen|route|page)="${r}"|["']${r}["']`);
      assert.ok(re.test(html[c]) || re.test(js[c]), `${scn}: ${c}#/${r}`);
    }
  }
});
