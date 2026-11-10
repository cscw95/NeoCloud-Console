// Live check: every NC.dsx data call the console screens make, against a running
// NOCP (:8000) chain. Passes only when the call is answered live (not mock).
//   node scripts/live-check.mjs                         # NOCP run.sh (dev switches)
//   NOCP_TOKEN=op NOCP_TENANT_TOKEN=ta NOCP_TENANT=tnt-e2e-a node scripts/live-check.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const dsx = require("../shared/dsx-api.js");

const BASE = process.env.NOCP_BASE || "http://127.0.0.1:8000";
const TENANT = process.env.NOCP_TENANT || "tnt-e2e-a";
const op = dsx.create({ base: BASE, timeoutMs: 15000, token: process.env.NOCP_TOKEN || null,
  session: () => null });
const cust = dsx.create({ base: BASE, timeoutMs: 60000, token: process.env.NOCP_TENANT_TOKEN || null,
  session: () => ({ tenant_id: TENANT, role: "admin" }) });

let pass = 0, fail = 0;
function check(screen, name, r, ok = () => true) {
  const good = r && r.live === true && !r.error && ok(r.data);
  console.log(`${good ? "  PASS" : "  FAIL"} ${screen.padEnd(9)} ${name}` +
    (good ? "" : `  — live=${r && r.live} src=${r && r.src} err=${r && r.error}`));
  good ? pass++ : fail++;
  return r && r.data;
}
const nonEmpty = d => Array.isArray(d) ? d.length > 0 : !!d && Object.keys(d).length > 0;

// versions screen
check("versions", "platform/versions", await op.versions(), d => nonEmpty(d));
check("versions", "catalog", await op.catalog(), nonEmpty);
// MaxLPS screen
const doms = check("maxlps", "power/domains", await op.powerDomains(), nonEmpty) || [];
const dom = (doms[0] || {}).id;
check("maxlps", "power/domains/{id}", await op.powerDomain(dom), nonEmpty);
check("maxlps", "power/profiles", await op.powerProfiles(), d => d.length >= 5);
check("maxlps", "power/telemetry (screen shape)", await op.powerTelemetry(dom),
  d => d.used_kw > 0 && d.racks.length && d.racks.every(k => k.rack && k.cap_kw) && d.groups.length);
check("maxlps", "power/simulate", await op.simulate({ domain: dom, operating_limit_kw: 3000 }),
  d => d.static && d.dynamic);
check("maxlps", "PATCH domain mode", await op.updateDomain(dom, { mode: "static" }), nonEmpty);
check("maxlps", "flex event", await op.flexEvent({ domain: dom, reduce_kw: 50, duration_s: 30 }), nonEmpty);
check("maxlps", "flex events list", await op.flexEvents(), d => Array.isArray(d));
check("maxlps", "rack WPPS profile", await op.setRackProfile("su-1-rack-07", "balanced"),
  d => d.cap_source === "ai-infra");
// OOB screen
const racks = check("oob", "oob/summary", await op.oobSummary(), nonEmpty) || [];
const rk = (racks[0] || {}).rack;
check("oob", "rack id field", { live: true, data: racks }, d => d.every(x => x.rack));
const det = check("oob", "oob/racks/{id}", await op.oobRack(rk), d => d.trays && d.trays.length);
check("oob", "oob/events", await op.oobEvents(20), d => Array.isArray(d));
check("oob", "oob/sel/{machine}", await op.oobSel(det && det.trays[0].machine), d => Array.isArray(d));
check("oob", "gpu-reset action", await op.machineAction("nh-" + det.trays[1].machine, "gpu-reset"), nonEmpty);
// RMA / firmware screen
const rma = check("rma", "rma create", await op.rmaCreate({ machine: det.trays[2].machine,
  component: "GPU", reason: "console live-check" }), nonEmpty);
check("rma", "rma advance", await op.rmaAdvance(rma && rma.id), d => d && d.stage === "cordon_drain");
check("rma", "rma list", await op.rmaList(), nonEmpty);
check("rma", "firmware baseline", await op.firmwareBaseline(), nonEmpty);
check("rma", "firmware drift", await op.firmwareDrift(), d => d.length && d.every(x => x.machine && x.current));
// metering / isolation (operator view)
check("metering", "metering/usage", await op.metering(TENANT), d => "gpu_hours" in d);
check("metering", "isolation/{tenant}", await op.isolation(TENANT), d => d.layers && d.layers.length);
// customer: NVKE wizard
check("nvke", "nvke/releases", await cust.nvkeReleases(), d => d.releases.length >= 2);
const c = check("nvke", "wizard create cluster", await cust.nvkeCreate({ name: "console-live",
  tenant_id: TENANT, k8s_version: "1.34", nodepools: [{ name: "gpu", instance_type: "vr-nvl72", count: 1 }] }),
  d => d && d.id);
if (c && c.id) {
  check("nvke", "clusters list", await cust.nvkeClusters(TENANT), d => d.some(x => x.id === c.id));
  check("nvke", "nodepools", await cust.nvkeNodepools(c.id), nonEmpty);
  check("nvke", "kubeconfig (owner)", await cust.nvkeKubeconfig(c.id), nonEmpty);
  check("nvke", "aicr-recipe", await cust.nvkeAicrRecipe(c.id), nonEmpty);
  check("nvke", "metering (customer)", await cust.metering(TENANT), d => "k8s_node_hours" in d);
  check("nvke", "delete cluster", await cust.nvkeDelete(c.id), nonEmpty);
}
console.log(`\n${pass}/${pass + fail} live`);
process.exit(fail ? 1 : 0);
