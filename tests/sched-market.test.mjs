// F30 scheduler / F32 marketplace console: API client contract + KO/EN pairing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const SM = require("../shared/sched-market-api.js");
const FILES = ["shared/sched-market-api.js", "shared/nvke-scheduler.js", "customer/marketplace.js"];

function fakeFetch(routes, log) {
  return async (url, init) => {
    log.push({ url, method: init.method, body: init.body, headers: init.headers });
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    const hit = routes[`${init.method} ${path.split("?")[0]}`];
    if (!hit) return { ok: false, status: 404, text: async () => '{"detail":"nf"}' };
    const [status, body] = hit;
    return { ok: status < 400, status, text: async () => JSON.stringify(body) };
  };
}

test("scheduler calls go to NOCP /api/v1/nvke/clusters/{id}/…", async () => {
  const log = [];
  const api = SM.create({ base: "http://nocp:8000", token: null, session: () => null,
    fetch: fakeFetch({
      "GET /api/v1/nvke/clusters/nvke-1/scheduler": [200, { capacity: { gpus: 144 } }],
      "POST /api/v1/nvke/clusters/nvke-1/workloads": [201, { name: "j", state: "Running" }],
      "POST /api/v1/nvke/clusters/nvke-1/queues": [409, { detail: "already exists" }],
      "POST /api/v1/nvke/clusters/nvke-1/scheduler/curtail": [200, { evicted: ["j"] }],
    }, log) });
  assert.equal((await api.scheduler("nvke-1")).data.capacity.gpus, 144);
  const w = await api.submit("nvke-1", { kind: "PyTorchJob", gpus: 144, queue: "research" });
  assert.equal(w.live, true);
  assert.equal(w.data.state, "Running");
  assert.equal(JSON.parse(log[1].body).kind, "PyTorchJob");
  const q = await api.createQueue("nvke-1", { name: "research", quota_gpus: 72 });
  assert.equal(q.error, "already exists");
  assert.equal(q.status, 409);
  assert.deepEqual((await api.curtail("nvke-1", { gpus: 72 })).data.evicted, ["j"]);
  // 404 / offline → mock getter, action reports offline
  const qs = await api.queues("nvke-1");
  assert.equal(qs.live, false);
  assert.deepEqual(qs.data, []);
  assert.equal((await api.complete("nvke-1", "x")).error, "offline");
  assert.ok(log.every((l) => l.url.startsWith("http://nocp:8000/api/v1/")));
});

test("marketplace deploy posts {model, tier} and lists tenant deployments", async () => {
  const log = [];
  const api = SM.create({ base: "http://nocp:8000", token: null,
    session: () => ({ tenant_id: "tnt-a", role: "admin" }),
    fetch: fakeFetch({
      "GET /api/v1/marketplace/models": [200, { object: "list", data: [{ id: "deepseek-r1" }] }],
      "POST /api/v1/marketplace/deploy": [201, { id: "mdep-0001", engine: "dynamo" }],
      "GET /api/v1/marketplace/deployments": [200, [{ id: "mdep-0001" }]],
    }, log) });
  assert.equal((await api.models()).data.data[0].id, "deepseek-r1");
  const d = await api.deploy({ model: "deepseek-r1", tier: "dedicated" });
  assert.equal(d.data.id, "mdep-0001");
  assert.deepEqual(JSON.parse(log[1].body), { model: "deepseek-r1", tier: "dedicated" });
  await api.deployments("tnt-a");
  assert.match(log[2].url, /\/marketplace\/deployments\?tenant_id=tnt-a$/);
});

test("models getter falls back to a deterministic mock catalog", async () => {
  const api = SM.create({ base: "http://x", token: null, session: () => null,
    fetch: async () => { throw new Error("down"); } });
  const r = await api.models();
  assert.equal(r.live, false);
  assert.equal(r.data.data[0].id, "llama-3.3-70b-instruct");
});

test("every L(ko, en) pair in the F30/F32 screens has both languages", () => {
  for (const f of FILES.slice(1)) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    const calls = src.match(/\bL\("([^"\\]|\\.)*"\s*,\s*"([^"\\]|\\.)*"\)/g) || [];
    assert.ok(calls.length > 20, f);
    for (const c of calls) {
      const [, ko, en] = c.match(/^L\("((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\)$/);
      assert.ok(ko && en, `${f}: ${c}`);
      assert.doesNotMatch(en, /[가-힣]/, `${f}: EN side has Korean: ${c}`);
    }
  }
});

test("screens are mounted and loaded in the consoles", () => {
  const cust = readFileSync(new URL("../customer/index.html", import.meta.url), "utf8");
  const ops = readFileSync(new URL("../ops/index.html", import.meta.url), "utf8");
  assert.match(cust, /id="nvke-sched-root"/);
  assert.match(cust, /id="mkt-root"/);
  assert.match(cust, /src="marketplace\.js"/);
  assert.match(ops, /data-route="nvke-sched"/);
  assert.match(ops, /id="nvke-sched-ops-root"/);
  for (const html of [cust, ops]) assert.match(html, /shared\/sched-market-api\.js[\s\S]*shared\/nvke-scheduler\.js/);
  for (const f of FILES) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /:9100|:9000/, f);
  }
});
