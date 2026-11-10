// v2 Phase 1 console tests — `node --test tests/` (no deps).
// Covers: shared/v2-api.js contract paths (IMPROVEMENT-PLAN-v2 E–H), live/mock fallback, error surfacing,
// SSE streaming, OpenAI upstream schema (tests/fixtures/openai-chat-schemas.json), OIDC Discovery fields,
// invoice math, demo scenarios, screen wiring, KO/EN pairs, CONSOLE-QA D1–D3.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = p => readFileSync(path.join(ROOT, p), "utf8");
const require = createRequire(import.meta.url);
const V2 = require(path.join(ROOT, "shared/v2-api.js"));
const SC = require(path.join(ROOT, "shared/v2-scenarios.js"));
const OAI = JSON.parse(read("tests/fixtures/openai-chat-schemas.json")).schemas;

const offline = async () => { throw new TypeError("fetch failed"); };
const mk = (o = {}) => V2.create(Object.assign({ fetch: offline, base: "http://nocp.test", token: null, session: () => null, sleep: async () => {} }, o));

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, opt = {}) => {
    calls.push({ url, method: opt.method || "GET", headers: opt.headers || {}, body: opt.body });
    const u = new URL(url);
    const hit = routes[(opt.method || "GET") + " " + u.pathname];
    const h = new Map(Object.entries((hit && hit.headers) || {}));
    const headers = { get: k => h.get(k.toLowerCase()) ?? null };
    if (hit === undefined) return { ok: false, status: 404, headers, text: async () => '{"detail":"Not Found"}' };
    const status = hit.__status || 200, body = hit.__status ? hit.body : hit;
    return { ok: status < 400, status, headers, body: hit.stream || null, text: async () => JSON.stringify(body) };
  };
  fn.calls = calls;
  return fn;
}

/* tiny JSON-Schema subset validator (type/required/properties/items/enum/$ref) */
function validate(name, v, where = name, errs = []) {
  const s = typeof name === "string" ? OAI[name] : name;
  if (!s) return errs;                                   // ref outside subset → any
  if (s.$ref) return validate(s.$ref.split("/").pop(), v, where, errs);
  const types = s.type ? [].concat(s.type) : null;
  const tOf = x => x === null ? "null" : Array.isArray(x) ? "array" : Number.isInteger(x) ? "integer" : typeof x;
  if (types && !types.some(t => t === tOf(v) || (t === "number" && tOf(v) === "integer"))) errs.push(`${where}: type ${tOf(v)} ∉ ${types}`);
  if (s.enum && !s.enum.includes(v)) errs.push(`${where}: ${JSON.stringify(v)} ∉ enum`);
  if (v && typeof v === "object" && !Array.isArray(v)) {
    (s.required || []).forEach(k => { if (!(k in v)) errs.push(`${where}: missing ${k}`); });
    Object.entries(s.properties || {}).forEach(([k, ps]) => { if (k in v) validate(ps, v[k], where + "." + k, errs); });
  }
  if (Array.isArray(v) && s.items) v.forEach((x, i) => validate(s.items, x, `${where}[${i}]`, errs));
  return errs;
}

test("v2-api offline: every getter falls back to MOCK with contract fields", async () => {
  const a = mk();
  const t = "tnt-fin-corp";
  const checks = [
    [a.contracts(t), d => d.every(c => c.id && c.tenant_id && c.product && c.commitment === "reserved" && c.term_months && c.start_date && c.status)],
    [a.apiKeys(), d => Array.isArray(d)],
    [a.models(), d => d.every(m => m.id && m.owned_by === "neocloud" && m.context_length && m.tiers.includes("batch"))],
    [a.quotas(t), d => d.every(q => q.tier && q.tpm > 0 && q.rpm > 0)],
    [a.slo("kanana-2-70b-instruct"), d => d.target.ttft_p99_ms === 2000 && d.target.tpot_p99_ms === 50 && typeof d.breach === "boolean"],
    [a.deployments(), d => d.every(x => x.model && x.racks.length)],
    [a.usage(t), d => d.tokens_by_type && Array.isArray(d.token_lines)],
    [a.reconcile("2026-11"), d => "gateway_tokens" in d && "engine_tokens" in d && "diff_pct" in d && Array.isArray(d.mismatches)],
    [a.priceBook(), d => d.currency === "KRW" && d.items.every(i => i.product && i.metric && i.unit_price != null)],
    [a.invoices(t), d => d.every(x => Array.isArray(x.lines) && "commitment_true_up" in x && Array.isArray(x.sla_credits) && "subtotal" in x && "vat" in x && "total" in x && x.status)],
    [a.slaReport(t), d => "availability_pct" in d && "exceptions_minutes" in d && Array.isArray(d.credits)],
    [a.downtime(t), d => d.every(x => x.start && x.end && x.minutes != null && x.cause)],
    [a.slaExceptions(), d => d.every(x => ["grid_curtailment", "maintenance"].includes(x.kind) && x.scope && x.contract_clause)],
    [a.remPolicy(), d => ["monitor", "auto"].includes(d.mode) && d.mode === "monitor" && d.max_parallel_per_rack === 1 && d.kpi_replace_minutes === 60],
    [a.remRuns(), d => d.every(r => r.trigger && r.target.machine_id && r.steps.every(s => s.name && s.state && s.at))],
    [a.nvkeCapi("nvke-0001"), d => d.cluster.phase && d.machine_deployments.every(m => m.failure_domain) && d.nico_machines.every(m => m.nico_instance_id && m.rack_id)],
    [a.nvkeNodes("nvke-0001"), d => d.every(n => n.labels["nvidia.com/gpu.clique"] && n.labels["topology.kubernetes.io/zone"] && n.attestation.tpm && n.join.agent === "nvke-agent")],
    [a.nvkeDomains("nvke-0001"), d => d.every(x => x.imex_channels && x.status)],
    [a.sso(t), d => "issuer_url" in d && "client_id" in d],
    [a.oidcConfig(), d => d.issuer && d.token_endpoint && d.jwks_uri],
  ];
  for (const [p, ok] of checks) {
    const r = await p;
    assert.equal(r.live, false); assert.equal(r.src, "mock");
    assert.ok(ok(r.data), JSON.stringify(r.data).slice(0, 200));
  }
});

test("v2-api live: calls exactly the approved contract paths and methods", async () => {
  const f = fakeFetch({});
  const a = V2.create({ fetch: f, base: "http://nocp.test", token: null, session: () => null, sleep: async () => {} });
  await a.contracts("t1"); await a.contract("c1"); await a.contractCreate({ tenant_id: "t1" }); await a.contractPatch("c1", {}); await a.contractActivate("c1");
  await a.signup({}); await a.signupVerify("t1"); await a.oidcConfig(); await a.oauthToken({ grant_type: "client_credentials" }); await a.sso("t1"); await a.ssoPut("t1", {});
  await a.quotas("t1"); await a.quotaPut("t1", { tier: "batch", tpm: 1, rpm: 1 }); await a.quotaOverride("t1", {}); await a.deployments(); await a.slo("m", "1h");
  await a.usage("t1"); await a.reconcile("2026-11");
  await a.priceBook(); await a.invoices("t1", "2026-11"); await a.invoice("i1"); await a.invoicesRun("2026-11"); await a.invoiceFinalize("i1"); await a.invoicePay("i1");
  await a.taxInvoice("i1"); await a.paymentMethodAdd({});
  await a.slaReport("t1", "2026-10"); await a.downtime("t1", "2026-10"); await a.slaExceptions(); await a.slaExceptionCreate({ start: "a", end: "b" });
  await a.remPolicy(); await a.remPolicyPut({}); await a.remRuns("t1", "running"); await a.remRun("r1"); await a.remRunCreate({ machine_id: "m" });
  await a.nvkeCapi("k1"); await a.nvkeNodes("k1"); await a.nvkeDomains("k1"); await a.nvkeDomainCreate("k1", { name: "x", racks: ["r"] });
  const got = f.calls.map(c => c.method + " " + new URL(c.url).pathname + new URL(c.url).search);
  const want = [
    "GET /api/v1/contracts?tenant_id=t1", "GET /api/v1/contracts/c1", "POST /api/v1/contracts", "PATCH /api/v1/contracts/c1", "POST /api/v1/contracts/c1/activate",
    "POST /api/v1/signup", "POST /api/v1/signup/t1/verify", "GET /.well-known/openid-configuration", "POST /oauth2/token", "GET /api/v1/tenants/t1/sso", "PUT /api/v1/tenants/t1/sso",
    "GET /api/v1/token/quotas?tenant_id=t1", "PUT /api/v1/token/quotas/t1", "POST /api/v1/token/quotas/t1/override", "GET /api/v1/token/deployments", "GET /api/v1/token/slo?model=m&window=1h",
    "GET /api/v1/metering/usage?tenant_id=t1", "GET /api/v1/metering/reconcile?period=2026-11",
    "GET /api/v1/billing/price-book", "GET /api/v1/billing/invoices?tenant_id=t1&period=2026-11", "GET /api/v1/billing/invoices/i1", "POST /api/v1/billing/invoices:run",
    "POST /api/v1/billing/invoices/i1/finalize", "POST /api/v1/billing/invoices/i1/pay", "GET /api/v1/billing/invoices/i1/tax-invoice", "POST /api/v1/billing/payment-methods",
    "GET /api/v1/tenants/t1/sla-report?month=2026-10", "GET /api/v1/sla/downtime?tenant_id=t1&period=2026-10", "GET /api/v1/sla/exceptions", "POST /api/v1/sla/exceptions",
    "GET /api/v1/remediation/policy", "PUT /api/v1/remediation/policy", "GET /api/v1/remediation/runs?tenant_id=t1&state=running", "GET /api/v1/remediation/runs/r1", "POST /api/v1/remediation/runs",
    "GET /api/v1/nvke/clusters/k1/capi", "GET /api/v1/nvke/clusters/k1/nodes", "GET /api/v1/nvke/clusters/k1/compute-domains", "POST /api/v1/nvke/clusters/k1/compute-domains",
  ];
  assert.deepEqual(got, want);
  const tokCall = f.calls.find(c => c.url.endsWith("/oauth2/token"));
  assert.equal(tokCall.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.equal(tokCall.body, "grant_type=client_credentials");
});

test("v2-api: customer session → tenant headers; 409 surfaced, 404 → mock", async () => {
  const f = fakeFetch({ "POST /api/v1/contracts/c1/activate": { __status: 409, body: { detail: "already active" } } });
  const a = V2.create({ fetch: f, base: "http://nocp.test", token: null, session: () => ({ tenant_id: "tnt-x", role: "admin" }) });
  const r = await a.contractActivate("c1");
  assert.equal(r.live, true); assert.equal(r.status, 409); assert.equal(r.error, "already active");
  assert.equal(f.calls[0].headers["X-Tenant-Id"], "tnt-x");
  assert.ok(!("X-Operator" in f.calls[0].headers));
  const m = await a.contractActivate("ctr-0003");      // 404 → mock simulation
  assert.equal(m.live, false); assert.equal(m.data.status, "active");
  const again = await mk().contractActivate("ctr-0001"); // mock rule: active → 409
  assert.equal(again.status, 409);
});

test("v2-api chat: live SSE stream — deltas, usage on final chunk, x-request-id, ratelimit headers", async () => {
  const chunks = [
    { id: "c1", object: "chat.completion.chunk", created: 1, model: "m", choices: [{ index: 0, delta: { role: "assistant", content: "Hel" }, finish_reason: null }] },
    { id: "c1", object: "chat.completion.chunk", created: 1, model: "m", choices: [{ index: 0, delta: { content: "lo" }, finish_reason: "stop" }] },
    { id: "c1", object: "chat.completion.chunk", created: 1, model: "m", choices: [], usage: { prompt_tokens: 5, cached_tokens: 2, completion_tokens: 2, reasoning_tokens: 0, total_tokens: 7 } },
  ];
  const sse = chunks.map(c => "data: " + JSON.stringify(c) + "\n\n").join("") + "data: [DONE]\n\n";
  const enc = new TextEncoder().encode(sse);
  const parts = [enc.slice(0, 37), enc.slice(37, 120), enc.slice(120)];   // split mid-event
  let i = 0;
  const stream = { getReader: () => ({ read: async () => i < parts.length ? { done: false, value: parts[i++] } : { done: true } }) };
  const f = fakeFetch({ "POST /v1/chat/completions": { stream, headers: { "x-request-id": "req-1", "x-ratelimit-remaining-tokens": "999", "content-type": "text/event-stream" } } });
  const a = V2.create({ fetch: f, base: "http://nocp.test", token: null, session: () => null });
  let text = "";
  const r = await a.chat({ model: "m", stream: true, messages: [{ role: "user", content: "hi" }], request_id: "req-1" }, "nc_sk_abc", { onDelta: d => { text += d; } });
  assert.equal(r.live, true); assert.equal(text, "Hello"); assert.equal(r.text, "Hello");
  assert.equal(r.usage.total_tokens, 7); assert.equal(r.request_id, "req-1"); assert.equal(r.ratelimit.tokens, "999"); assert.equal(r.finish_reason, "stop");
  const h = f.calls[0].headers;
  assert.equal(h.Authorization, "Bearer nc_sk_abc"); assert.equal(h["x-request-id"], "req-1");
  assert.equal(JSON.parse(f.calls[0].body).stream, true);
  const tr = a.trace().pop();
  assert.equal(tr.req_headers.Authorization.endsWith("…"), true, "Authorization redacted in demo transcript");
  assert.match(tr.res_body, /data: \[DONE\]/);
});

test("v2-api chat: 429 → error type, Retry-After surfaced (no mock leak)", async () => {
  const f = fakeFetch({ "POST /v1/chat/completions": { __status: 429, headers: { "retry-after": "12" },
    body: { error: { type: "rate_limit_exceeded", code: "tpm", message: "TPM exceeded", param: null } } } });
  const a = V2.create({ fetch: f, base: "http://nocp.test", token: null, session: () => null });
  const r = await a.chat({ model: "m", stream: true, messages: [] }, "k");
  assert.equal(r.live, true); assert.equal(r.status, 429); assert.equal(r.error_type, "rate_limit_exceeded"); assert.equal(r.retry_after, "12");
  assert.deepEqual(validate("ErrorResponse", { error: { type: "rate_limit_exceeded", code: "tpm", message: "TPM exceeded", param: null } }), []);
});

test("upstream contract: mock /v1/chat/completions stream + non-stream + /v1/models match OpenAI openapi.yaml", async () => {
  const a = mk({ mockDelayMs: 0 });
  await a.chat({ model: "kanana-2-70b-instruct", stream: true, messages: [{ role: "user", content: "x" }] }, null);
  const sse = a.trace().pop().res_body;
  const evs = sse.split("\n\n").filter(b => b.startsWith("data: ") && !b.includes("[DONE]")).map(b => JSON.parse(b.slice(6)));
  assert.ok(evs.length >= 3);
  evs.forEach((e, i) => assert.deepEqual(validate("CreateChatCompletionStreamResponse", e, "chunk" + i), []));
  const last = evs[evs.length - 1];
  assert.deepEqual(last.choices, []); assert.deepEqual(validate("CompletionUsage", last.usage), []);
  assert.ok(sse.trimEnd().endsWith("data: [DONE]"));
  await a.chat({ model: "kanana-2-70b-instruct", stream: false, messages: [{ role: "user", content: "x" }] }, null);
  assert.deepEqual(validate("CreateChatCompletionResponse", JSON.parse(a.trace().pop().res_body)), []);
  const models = (await a.models()).data;
  assert.deepEqual(validate("ListModelsResponse", { object: "list", data: models }), []);
  // a broken chunk must fail the validator (guards the validator itself)
  assert.ok(validate("CreateChatCompletionStreamResponse", { id: "x", object: "chat.completion", choices: [] }).length >= 2);
});

test("upstream contract: OIDC Discovery 1.0 §3 required metadata in mock", async () => {
  const d = (await mk().oidcConfig()).data;
  for (const k of ["issuer", "authorization_endpoint", "jwks_uri", "response_types_supported", "subject_types_supported", "id_token_signing_alg_values_supported"])
    assert.ok(d[k], k);
  const t = (await mk().oauthToken({ grant_type: "client_credentials", client_id: "c" })).data;
  assert.equal(t.token_type, "Bearer"); assert.equal(t.access_token.split(".").length, 3);   // RFC 7519 compact JWS
  for (const k of ["sub", "tid", "trole", "scope", "exp"]) assert.ok(k in t.claims, k);
});

test("invoice math: subtotal = usage + true-up − credits, VAT 10% rounded, total; finalize/pay state machine", async () => {
  const x = V2.priceInvoice({ lines: [{ amount: 1000.4 }, { amount: 2000.3 }], commitment_true_up: 500, sla_credits: [{ amount: 100 }] });
  assert.equal(x.subtotal, 3401); assert.equal(x.vat, 340); assert.equal(x.total, 3741);
  assert.equal(V2.priceInvoice({ lines: [{ amount: 5 }], sla_credits: [{ amount: 50 }] }).subtotal, 0);
  const a = mk();
  const d = (await a.invoices("tnt-fin-corp")).data.find(i => i.status === "draft");
  assert.equal((await a.invoicePay(d.id)).status, 409);                 // pay before finalize
  assert.equal((await a.invoiceFinalize(d.id)).data.status, "finalized");
  assert.equal((await a.invoiceFinalize(d.id)).status, 409);            // finalize twice
  assert.equal((await a.invoicePay(d.id)).data.status, "paid");
  const ids1 = (await a.invoicesRun("2027-01")).data.invoices, ids2 = (await a.invoicesRun("2027-01")).data.invoices;
  assert.deepEqual(ids1, ids2);                                          // run is idempotent
});

test("topology + remediation helpers", async () => {
  const nodes = (await mk().nvkeNodes("nvke-0001")).data;
  const g = V2.groupByClique(nodes);
  const doms = (await mk().nvkeDomains("nvke-0001")).data;
  assert.equal(g.length, 2); assert.equal(doms.length, g.length);       // US-04: 2 racks → 2 cliques, 2 ComputeDomains
  assert.equal(nodes.reduce((s, n) => s + n.gpus, 0), 144);
  const run = (await mk().remRun("rem-0001")).data;
  const ds = V2.runDurations(run);
  assert.deepEqual(ds.map(d => d.name), V2.REM_STEPS);
  assert.ok(ds.every(d => d.minutes >= 0));
  const a = mk();
  assert.equal((await a.remRunCreate({ machine_id: "ansan-f2-r03-t09" })).status, 409, "same rack busy (max_parallel_per_rack=1)");
});

test("demo scenarios: every scenario passes end-to-end on the seeded mock; reset restores seed", async () => {
  const a = mk({ mockDelayMs: 0 });
  const list = SC.build(a, {});
  assert.deepEqual(list.map(s => s.id).sort(), ["auto-recovery", "billing-run", "contract", "invoice", "nvke-topology", "signup", "sla", "token-api"]);
  for (const sc of list) {
    assert.ok(sc.ko && sc.en && sc.feature, sc.id);
    const ctx = {};
    for (const st of sc.steps) {
      const r = await st.run(ctx);
      assert.ok(r.ok, `${sc.id}/${st.id}: ${r.ko}`);
      assert.ok(r.ko && r.en, `${sc.id}/${st.id} KO/EN text`);
    }
  }
  const before = a._mock.contracts.length;
  a.resetMock();
  assert.ok(a._mock.contracts.length < before);
  assert.equal(a.trace().length, 0);
});

test("screens wired: menus, sections, script order (v2-api → v2-ui → scenarios → demo → screen → app.js)", () => {
  const cust = read("customer/index.html"), ops = read("ops/index.html"), biz = read("biz/index.html");
  for (const r of ["token", "invoices", "sla", "iam"]) {
    assert.ok(cust.includes(`data-route="${r}"`) && cust.includes(`data-screen="${r}"`), r);
  }
  assert.ok(cust.includes('id="nvke-topo-root"'));
  for (const r of ["v2-recovery", "v2-token", "v2-billing", "v2-accounts"]) assert.ok(ops.includes(`data-route="${r}"`) && ops.includes(`data-screen="${r}"`), r);
  assert.ok(biz.includes('id="v2-contracts-root"') && biz.includes('id="v2-biz-rev-root"'));
  for (const [h, scr, app] of [[cust, "v2.js", 'src="app.js"'], [ops, 'src="v2.js"', 'src="app.js"'], [biz, 'src="v2.js"', 'src="app.js"']]) {
    const o = ["shared/nocp-auth.js", "shared/v2-api.js", "shared/v2-ui.js", "shared/v2-scenarios.js", "shared/v2-demo.js", scr, app].map(s => h.indexOf(s));
    assert.ok(o.every(x => x > 0), JSON.stringify(o));
    assert.deepEqual(o.slice().sort((x, y) => x - y), o, "script order " + JSON.stringify(o));
  }
  assert.match(read("customer/nvke.js"), /data-nvke-topo=/);
  const su = read("customer/signup.html");
  assert.match(su, /object-src 'none'/); assert.ok(su.indexOf("nocp-auth.js") < su.indexOf("v2-api.js"));
  assert.match(su, /id="nc-main"/); assert.match(su, /skip-link/);
});

test("v2 sources: no direct :9100/:9000, no hardcoded X-Operator, no hex colours, no text under 11px", () => {
  for (const f of ["shared/v2-api.js", "shared/v2-ui.js", "shared/v2-demo.js", "shared/v2-scenarios.js", "customer/v2.js", "customer/nvke-topo.js", "customer/signup.js", "ops/v2.js", "biz/v2.js"]) {
    const s = read(f);
    assert.doesNotMatch(s, /:9100|:9000/, f);
    assert.doesNotMatch(s, /["']X-Operator["']\s*:/, f);
    assert.doesNotMatch(s.replace(/\/\*[\s\S]*?\*\//g, ""), /#[0-9a-fA-F]{3,8}\b(?![-\w])/, f);
    assert.doesNotMatch(s, /font-size:\s?(?:[0-9]|10)(?:\.\d+)?px/, f);
  }
});

test("KO/EN: every L(ko, en) pair has a non-Korean EN; no bare Korean literal in v2 screens", () => {
  for (const f of ["customer/v2.js", "customer/nvke-topo.js", "customer/signup.js", "ops/v2.js", "biz/v2.js", "shared/v2-demo.js", "shared/v2-ui.js"]) {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const lit = /"((?:[^"\\]|\\.)*)"/g;
    let m, n = 0;
    const toks = [];
    while ((m = lit.exec(src))) toks.push({ s: m[1], i: m.index, end: lit.lastIndex });
    toks.forEach((t, k) => {
      if (!/[가-힣]/.test(t.s)) return;
      const next = toks[k + 1];
      const between = next ? src.slice(t.end, next.i) : "";
      const paired = next && /^\s*(\+[^,\"]*)?,\s*(en:\s*)?$/.test(between) && !/[가-힣]/.test(next.s);
      assert.ok(paired, `${f}: Korean literal without EN pair: "${t.s}" → next ${next && JSON.stringify(next.s)}`);
      n++;
    });
    assert.ok(n > 0 || f === "shared/v2-ui.js", f);
  }
});

test("CONSOLE-QA D1: i18n skips its own characterData writes so EN → KO restores", () => {
  const s = read("shared/i18n.js");
  assert.match(s, /lastText\.get\(m\.target\) === m\.target\.nodeValue\) continue/);
  assert.match(s, /lastText\.set\(node, t\); node\.nodeValue = t;/);
  // behavioural check with a minimal fake DOM text node: KO → EN → (own mutation) → KO
  const DICT = { "대시보드": "Dashboard" };
  const node = { nodeValue: "대시보드" };
  const orig = new WeakMap(), last = new WeakMap();
  const apply = en => {
    if (en) { if (!orig.has(node)) orig.set(node, node.nodeValue); const t = DICT[orig.get(node)]; last.set(node, t); node.nodeValue = t; }
    else if (orig.has(node)) { last.set(node, orig.get(node)); node.nodeValue = orig.get(node); }
  };
  const onChar = () => { if (last.get(node) === node.nodeValue) return; orig.delete(node); };
  apply(true); onChar(); apply(false);
  assert.equal(node.nodeValue, "대시보드");
});

test("CONSOLE-QA D2/D3: live MRR waits for contracts; capacity + biz utilisation KPIs come from /inventory/sites", () => {
  const b = read("biz/app.js");
  assert.match(b, /if \(live && !mrrLoaded\)/);
  assert.match(b, /mrrBase = sum; mrrLoaded = true;/);
  assert.match(b, /function renderUtil\(\)[\s\S]*sitesInventory/);
  const o = read("ops/index.html");
  for (const id of ["cap-kpi-sell", "cap-kpi-alloc", "cap-kpi-alloc-bar", "cap-kpi-lock"]) assert.ok(o.includes(`id="${id}"`), id);
  assert.match(read("ops/app.js"), /renderCapKpis\(inv\.sites\)/);
  assert.ok(read("biz/index.html").includes('id="kpi-util"'));
});
