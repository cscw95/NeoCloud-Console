// v2 design — token API showcase (customer/token-viz.js, customer/token.js, ops/token.js, customer/token.css,
// marketplace deploy → token API flow). `node --test tests/`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = p => readFileSync(path.join(ROOT, p), "utf8");
const require = createRequire(import.meta.url);
const TV = require(path.join(ROOT, "customer/token-viz.js"));
const FLOW = require(path.join(ROOT, "shared/flow-timeline.js"));

test("token-viz: OpenAI usage reads prompt_tokens_details.cached_tokens (flat field only as fallback)", () => {
  const u = TV.usageTokens({ prompt_tokens: 2400, completion_tokens: 8, total_tokens: 2408,
    prompt_tokens_details: { cached_tokens: 2000 }, completion_tokens_details: { reasoning_tokens: 3 } });
  assert.deepEqual(u, { prompt: 2400, cached: 2000, completion: 8, reasoning: 3, total: 2408 });
  assert.equal(TV.usageTokens({ prompt_tokens: 5, cached_tokens: 2 }).cached, 2);
  assert.equal(TV.usageTokens(null).total, 0);
});

test("token-viz: live usage (token_type rows) and mock usage (model rows) give the same shape", () => {
  const live = TV.usage({ period: "2026-11", tokens_by_type: { input: 24, cached: 0, output: 80, reasoning: 0 }, token_lines: [
    { model: "llama-3.3-70b-instruct", tier: "interactive", token_type: "input", quantity: 24, events: 2 },
    { model: "llama-3.3-70b-instruct", tier: "interactive", token_type: "output", quantity: 80, events: 2 }] });
  assert.equal(live.lines.length, 1);
  assert.deepEqual(live.lines[0], { model: "llama-3.3-70b-instruct", tier: "interactive", input: 24, cached: 0, output: 80, reasoning: 0, requests: 2 });
  assert.equal(live.total, 104);
  const mock = TV.usage({ token_lines: [{ model: "m", tier: "batch", input: 900, cached: 300, output: 210, reasoning: 0, requests: 41 }] });
  assert.equal(mock.byType.cached, 300);              // derived from lines when tokens_by_type is absent
  assert.equal(mock.cachedShare, 25);                 // 300 / (900 + 300)
  assert.equal(mock.lines[0].requests, 41);
});

test("token-viz: SLO keeps the 2 s / 50 ms targets, flags breaches and computes fleet tokens/s/MW", () => {
  const live = TV.slo({ data: { ttft_p99_ms: 228, tpot_p99_ms: 31.6, target: { ttft_p99_ms: 2000, tpot_p99_ms: 50 }, deployments: [
    { model: "a", deployment: "dgd-a", ttft_p99_ms: 66, tpot_p99_ms: 12.6, served_tokens_per_s: 1800, power_kw: 51.19, tokens_per_s_per_mw: 35162.5, breach: false },
    { model: "b", deployment: "dgd-b", ttft_p99_ms: 2310, tpot_p99_ms: 58, served_tokens_per_s: 600, power_kw: 12 }] } });
  assert.equal(live.target.ttft_p99_ms, 2000);
  assert.equal(live.target.tpot_p99_ms, 50);
  assert.equal(live.fleet.ttft, 228);
  assert.equal(live.rows[1].breach, true);            // no breach field → judged against the target
  assert.equal(live.rows[1].tpsPerMw, 50000);         // 600 / 0.012 MW
  assert.equal(live.fleet.tpsPerMw, Math.round(2400 / (63.19 / 1000) * 10) / 10);
  assert.equal(live.fleet.breach, true);
  const mock = TV.slo({ data: { model: "kanana", ttft_p99_ms: 820, tpot_p99_ms: 31, breach: false } });
  assert.equal(mock.rows.length, 1);
  assert.equal(mock.target.ttft_p99_ms, TV.SLO.ttft_p99_ms);
  assert.equal(TV.capPerMw([{ deployment: "d", capacity_tokens_per_s: 1000, power_kw: 10 }]).d, 100000);
});

test("token-viz: stream timing — TTFT = first chunk, TPOT = gap per later token, tokens/s over the whole call", () => {
  const s = TV.stream(1000, [1200, 1250, 1300, 1400], 5);
  assert.equal(s.ttft, 200);
  assert.equal(s.tpot, 50);                            // (1400 − 1200) / (5 − 1)
  assert.equal(s.tps, 12.5);                           // 5 tokens / 0.4 s
  assert.equal(TV.stream(0, []).ttft, null);
});

test("token-viz: f33 KV run → per-tier hits from kv_hit_tier + cached ratio; mock has the same shape", () => {
  const run = JSON.parse(read("tests/fixtures/demo-run-f33-kv.json"));
  const kv = TV.kvFromRun(run);
  assert.deepEqual(kv.tiers.map(t => t.tier), ["G1", "G2", "G3", "G4"]);
  assert.equal(kv.tiers[3].medium, "VAST Data");
  assert.deepEqual(kv.hits, { G1: 0, G2: 2000, G3: 2000, G4: 2000 });
  assert.equal(kv.cached, 6000);
  assert.equal(kv.prompt, kv.cached + kv.miss);
  assert.ok(kv.ratio > 0 && kv.ratio < 100);
  assert.equal(TV.kvFromRun(null), null);
  const m = TV.kvMock();
  assert.deepEqual(Object.keys(m.hits), TV.TIERS);
  assert.equal(m.prompt, m.cached + m.miss);
});

test("token-viz: customer flow and marketplace deploy flow render through NC.flow", () => {
  const cf = TV.customerFlow({ keys: 1, called: true, total: 104 });
  assert.deepEqual(cf.map(s => s.status), ["done", "done", "done", "done", "active"]);
  assert.equal(TV.customerFlow({}).map(s => s.status)[0], "active");
  assert.equal(TV.customerFlow({ keys: 1, callFailed: true })[1].status, "fail");
  const df = TV.deployFlow({ id: "mkt-1", model: "llama", tier: "serverless", state: "Ready", endpoint: { model: "mkt-llama" } });
  assert.deepEqual(df.map(s => s.status), ["done", "done", "done", "done", "active"]);
  assert.equal(TV.deployFlow({ id: "x", state: "Failed" })[2].status, "fail");
  const html = FLOW.timeline(df, { orientation: "horizontal", progress: true, ariaLabel: "deploy" });
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-current="step"/);
  assert.match(html, /model=mkt-llama/);
});

test("wiring: v2.js screens delegate to the showcase and keep their control ids", () => {
  const cv2 = read("customer/v2.js"), ov2 = read("ops/v2.js");
  assert.match(cv2, /if \(NC\.tokenUI\) return NC\.tokenUI\.render\(TK\);/);
  assert.match(cv2, /if \(NC\.tokenUI\) return NC\.tokenUI\.send\(TK\);/);
  assert.match(ov2, /if \(NC\.tokenOps\) return NC\.tokenOps\.render\(\);/);
  const ct = read("customer/token.js");
  for (const id of ["v2-token-root", "v2-key-create", "v2-key-name", "data-v2-revoke", "data-v2-usekey", "v2-pg-key", "v2-pg-model", "v2-pg-tier",
    "v2-pg-max", "v2-pg-stream", "v2-pg-prompt", "v2-pg-send", "v2-pg-out", "v2-pg-meta"]) assert.ok(ct.includes(id), id);
  const ot = read("ops/token.js");
  for (const id of ["v2-tokenops-root", "v2-q-t", "v2-q-tier", "v2-q-tpm", "v2-q-rpm", "v2-q-save", "v2-q-f", "v2-q-ovr"]) assert.ok(ot.includes(id), id);
  const ci = read("customer/index.html"), oi = read("ops/index.html");
  assert.match(ci, /<script src="token-viz\.js"><\/script><script src="token\.js"><\/script>/);
  assert.match(oi, /<script src="\.\.\/customer\/token-viz\.js"><\/script><script src="token\.js"><\/script>/);
  assert.ok(ci.indexOf('src="token.js"') > ci.indexOf('src="v2.js"'));
  assert.match(read("customer/marketplace.js"), /NC\.tokenViz\.deployFlow\(d\)/);
  assert.match(read("customer/marketplace.js"), /NC\.tokenUI\.preset\(t\.dataset\.model\)/);
});

test("a11y/theme: tokens only (no hex), no text under 11px, reduced motion, NOCP-only calls", () => {
  for (const f of ["customer/token.js", "customer/token-viz.js", "ops/token.js", "customer/token.css", "customer/marketplace.js"]) {
    const s = read(f).replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(s, /#[0-9a-fA-F]{3,8}\b(?![-\w])/, f);
    assert.doesNotMatch(s, /font-size:\s?(?:[0-9]|10)(?:\.\d+)?px/, f);
    assert.doesNotMatch(s, /:9100|:9000|:8000\b/, f);
  }
  assert.match(read("customer/token.css"), /prefers-reduced-motion:reduce/);
  assert.match(read("customer/token.js"), /aria-live="polite"/);
});

test("KO/EN: every Korean literal in the token showcase files has an EN pair", () => {
  for (const f of ["customer/token.js", "ops/token.js", "customer/token-viz.js"]) {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const lit = /"((?:[^"\\]|\\.)*)"/g;
    let m, n = 0;
    const toks = [];
    while ((m = lit.exec(src))) toks.push({ s: m[1], i: m.index, end: lit.lastIndex });
    toks.forEach((t, k) => {
      if (!/[가-힣]/.test(t.s)) return;
      // L("ko", "en") pair or {ko: "…", en: "…"} — an EN literal follows the (possibly concatenated) Korean expression
      const tail = src.slice(t.end, t.end + 400);
      const ok = /^[^;{}]*?,\s*en:/.test(tail) || /^\s*(?:\+[^,"]*)?,\s*"[^"가-힣]*"/.test(tail);
      assert.ok(ok, `${f}: Korean literal without EN pair: "${t.s}"`);
      n++;
    });
    assert.ok(n > 0 || f === "customer/token-viz.js", f);
  }
});
