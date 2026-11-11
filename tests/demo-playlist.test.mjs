// Demo Center Day 0 → Day 1 → Day 2 playlist (ops/demo.js) — `node --test tests/` (no dependencies).
// Covers: built-in order = work/neocloud/DEMO-ORDER.md, NOCP /api/v1/demo/playlist normaliser (tolerant shapes),
// day grouping, presenter day banner, screen-only caption card, client verb, KO/EN strings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const DC = require(path.join(ROOT, "ops/demo.js"));

test("built-in playlist follows DEMO-ORDER: items 1..18 in order, days 0→1→2, screen steps 5 and 7", () => {
  const P = DC.PLAYLIST;
  const ns = [...new Set(P.map(x => x.n))];
  assert.deepEqual(ns, Array.from({ length: 18 }, (_, i) => i + 1));
  for (let i = 1; i < P.length; i++) { assert.ok(P[i].n >= P[i - 1].n); assert.ok(P[i].day >= P[i - 1].day); }
  assert.deepEqual(P.filter(x => x.n <= 5).map(x => x.day), [0, 0, 0, 0, 0]);
  assert.ok(P.filter(x => x.n >= 6 && x.n <= 10).every(x => x.day === 1));
  assert.ok(P.filter(x => x.n >= 11).every(x => x.day === 2));
  assert.deepEqual(P.filter(x => x.kind === "screen").map(x => x.n), [5, 7]);
  assert.equal(P[0].scenario, "f-rack-bringup");
  assert.equal(P.find(x => x.n === 14).scenario, "c-xid-remediation");
  assert.equal(P.find(x => x.n === 16).scenario, "d-grid-curtailment");
  for (const x of P.filter(x => x.kind === "screen")) { assert.ok(x.route && x.title_ko && x.title_en && x.caption_ko && x.caption_en); assert.doesNotMatch(x.title_en + x.caption_en, /[가-힣]/); }
  const ids = P.flatMap(x => [x.scenario, ...(x.also || [])]).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length, "each scenario is placed once");
});

test("normPlaylist: canonical NOCP shape", () => {
  const pl = DC.normPlaylist({ days: [{ day: 0, title_ko: "구축", title_en: "Build" }], items: [
    { order: 1, day: 0, kind: "scenario", scenario_id: "f-rack-bringup" },
    { order: 5, day: 0, kind: "screen", route: "dsx-power", title_ko: "전력", title_en: "Power", caption_ko: "자막", caption_en: "caption" },
    { order: 7, day: 1, kind: "screen", console: "biz", route: "#/contracts" }] });
  assert.equal(pl.source, "nocp");
  assert.deepEqual(pl.items.map(x => [x.n, x.day, x.kind, x.scenario || x.console + "/" + x.route]),
    [[1, 0, "scenario", "f-rack-bringup"], [5, 0, "screen", "ops/dsx-power"], [7, 1, "screen", "biz/contracts"]]);
  assert.equal(DC.dayLabel(pl, 0, "en"), "Day 0 Build");
  assert.equal(DC.dayLabel(pl, 1, "en"), "Day 1 Onboard");
});

test("normPlaylist: tolerant shapes (nested days, bare array, type/scenario, 'Day 1' strings, href routes)", () => {
  const a = DC.normPlaylist({ days: [{ day: "day0", items: [{ type: "scenario", scenario: "f24-firmware-bundle" }] },
    { id: "Day 2", items: [{ type: "navigate", href: "../customer/index.html#/token", narration_en: "n" }] }] });
  assert.deepEqual(a.items.map(x => [x.day, x.kind, x.scenario || x.console + "/" + x.route]), [[0, "scenario", "f24-firmware-bundle"], [2, "screen", "customer/token"]]);
  assert.equal(a.items[1].caption_en, "n");
  const b = DC.normPlaylist(["b-token-api", { id: "c-xid-remediation", day: 2 }]);
  assert.deepEqual(b.items.map(x => x.scenario), ["b-token-api", "c-xid-remediation"]);
  assert.equal(DC.normPlaylist({ items: [] }), null);
  assert.equal(DC.normPlaylist(null), null);
  assert.equal(DC.normPlaylist({ detail: "Not Found" }), null);
  assert.deepEqual(DC.screenRef("/ops/#/p2-grid"), { console: "ops", route: "p2-grid" });
});

test("dayIndex: run items win over also-entries; every Day gets a label in KO and EN", () => {
  const idx = DC.dayIndex(DC.fallbackPlaylist());
  assert.deepEqual([idx["f-rack-bringup"].day, idx["f-rack-bringup"].n, idx["f-rack-bringup"].run], [0, 1, true]);
  assert.deepEqual([idx["f23-rack-bringup"].day, idx["f23-rack-bringup"].run], [0, false]);
  assert.equal(idx["a-signup-to-invoice"].day, 1);
  assert.equal(idx["f34-compliance-evidence"].day, 2);
  assert.deepEqual([0, 1, 2].map(d => DC.dayLabel(null, d, "ko")), ["Day 0 구축", "Day 1 개통", "Day 2 운영"]);
  assert.deepEqual([0, 1, 2].map(d => DC.dayLabel(null, d, "en")), ["Day 0 Build", "Day 1 Onboard", "Day 2 Operate"]);
});

test("list shows screen-only steps with their deep link, and order badges", () => {
  const list = ["f-rack-bringup", "f23-rack-bringup", "f24-firmware-bundle"].map(id => ({ id, title_ko: id, title_en: id, steps: 3 }));
  const h = DC.renderList(list, null, "en");
  assert.match(h, /class="dc-ord mono">1<\/span>f-rack-bringup/);
  assert.match(h, /class="dc-ord mono sub">1<\/span>f23-rack-bringup/);
  assert.match(h, /Screen walkthrough/);
  assert.match(h, /href="#\/dsx-power"/);
  assert.match(h, /href="\.\.\/biz\/index\.html#\/contracts" target="_blank"/);
});

test("presenter: day banner during a playlist run, day chip otherwise; next-item button after the run", () => {
  const pl = DC.fallbackPlaylist();
  const sc = { id: "f07-identity", title_ko: "가입", title_en: "Signup", steps: [{ id: "01", title_ko: "a", title_en: "a" }] };
  const pos = pl.items.findIndex(x => x.scenario === "f07-identity");
  const live = DC.renderDetail(sc, null, "en", false, { presenter: true, pl, plPos: pos, scenarios: [] });
  assert.match(live, /class="dc-dayband d1"/);
  assert.match(live, /Day 1 Onboard/);
  assert.match(live, new RegExp("Item " + (pos + 1) + " / " + pl.items.length));
  assert.match(live, /Up next: Commitment contract/);
  const done = DC.renderDetail(sc, { id: "r", state: "done", verdict: "pass", counts: {}, steps: [{ id: "01", state: "passed" }] }, "ko", false, { presenter: true, pl, plPos: pos });
  assert.match(done, /data-dc-pl="next"/);
  const solo = DC.renderDetail(sc, null, "ko", false, { presenter: true });
  assert.match(solo, /Day 1 개통/); assert.doesNotMatch(solo, /data-dc-pl/);
  const normal = DC.renderDetail(sc, null, "en", false, {});
  assert.match(normal, /class="dc-daychip d1">Day 1 Onboard · #6/);
});

test("caption card for screen-only steps: day, title, caption, nav buttons; other consoles open in a new tab", () => {
  const pl = DC.fallbackPlaylist();
  const i5 = pl.items.findIndex(x => x.n === 5), i7 = pl.items.findIndex(x => x.n === 7);
  const c5 = DC.captionHtml(pl, i5, "ko");
  assert.match(c5, /Day 0 구축/); assert.match(c5, /MaxLPS/); assert.match(c5, /32\.3 MW/);
  assert.match(c5, /다음: Day 1 개통 · f07-identity/);
  for (const a of ["prev", "next", "home", "stop"]) assert.match(c5, new RegExp('data-dc-pl="' + a + '"'));
  assert.doesNotMatch(c5, /target="_blank"/);
  const c7 = DC.captionHtml(pl, i7, "en");
  assert.match(c7, /Commitment contract/);
  assert.match(c7, /href="\.\.\/biz\/index\.html#\/contracts" target="_blank"/);
  assert.equal(DC.captionHtml(pl, 999, "en"), "");
  const last = DC.captionHtml({ source: "local", days: [], items: [{ n: 1, day: 2, kind: "screen", console: "ops", route: "p2-metrics", title_ko: "지표", title_en: "Metrics" }] }, 0, "en");
  assert.match(last, /data-dc-pl="next">Stop playlist/);
});

test("client: GET /api/v1/demo/playlist", async () => {
  const calls = [];
  const c = DC.createClient({ base: "http://n", fetch: async (url, o) => { calls.push(o.method + " " + url); return { ok: false, status: 404, text: async () => '{"detail":"Not Found"}' }; } });
  await assert.rejects(c.playlist(), e => e.status === 404);
  assert.deepEqual(calls, ["GET http://n/api/v1/demo/playlist"]);
});

test("KO/EN: playlist strings exist in both languages and EN has no Korean", () => {
  for (const k of ["day", "daySub", "other", "playAll", "playStop", "screenOnly", "openScreen", "nextItem", "prevItem", "backDc", "plOf", "plDone", "auto", "upNext", "plMissing", "plKeys"]) {
    assert.ok(DC.T.ko[k] && DC.T.en[k], k);
    assert.doesNotMatch(JSON.stringify(DC.T.en[k]), /[가-힣]/, k);
  }
  assert.equal(DC.T.ko.playAll, "Day 0→2 전체 실행");
});
