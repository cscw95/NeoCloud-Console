// F11 — NVKE CAPI/topology console wiring: dsx-api live paths + mock fallback, screen mounts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = p => readFileSync(path.join(ROOT, p), "utf8");
const require = createRequire(import.meta.url);
const dsxMod = require(path.join(ROOT, "shared/dsx-api.js"));

test("dsx-api F11: capi/nodes/compute-domains hit NOCP paths, replace is POST", async () => {
  const calls = [];
  const fetch = async (url, o) => { calls.push([o.method, url]);
    return { ok: true, status: 200, text: async () => JSON.stringify(url.endsWith("/capi") ? { cluster: { phase: "Provisioned" } } : []) }; };
  const D = dsxMod.create({ base: "http://nocp", fetch, token: "" });
  assert.equal((await D.nvkeCapi("nvke-0001")).data.cluster.phase, "Provisioned");
  await D.nvkeNodes("nvke-0001");
  await D.nvkeComputeDomains("nvke-0001");
  await D.nvkeReplaceNode("nvke-0001", "gpu-20", { reason: "XID 79" });
  assert.deepEqual(calls.map(c => c[0] + " " + c[1].replace("http://nocp/api/v1", "")), [
    "GET /nvke/clusters/nvke-0001/capi", "GET /nvke/clusters/nvke-0001/nodes",
    "GET /nvke/clusters/nvke-0001/compute-domains", "POST /nvke/clusters/nvke-0001/nodes/gpu-20/replace"]);
});

test("dsx-api F11: offline → empty mock, not an exception", async () => {
  const offline = async () => { throw new Error("down"); };
  const D = dsxMod.create({ base: "http://nocp", fetch: offline, token: "" });
  const r = await D.nvkeNodes("x");
  assert.equal(r.live, false);
  assert.deepEqual(r.data, []);
  assert.deepEqual((await D.nvkeCapi("x")).data.machine_deployments, []);
});

test("F11 panel mounted in customer NVKE screen and ops route nvke-capi (KO/EN, tabs)", () => {
  const cust = read("customer/index.html"), ops = read("ops/index.html"), js = read("shared/nvke-topology.js");
  assert.match(cust, /id="nvke-topo-root"/);
  assert.match(cust, /shared\/nvke-topology\.js/);
  assert.match(ops, /data-screen="nvke-capi"/);
  assert.match(ops, /data-route="nvke-capi"/);
  assert.match(js, /role="tablist"/);
  assert.match(js, /Nodes & topology/);
  assert.match(js, /노드·토폴로지/);
  assert.match(js, /f11-nvke-capi/);
});
