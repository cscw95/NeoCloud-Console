// v2 design — account · contract · billing showcase (customer/billing-viz.js, customer/billing.css,
// customer/v2.js invoices/sla/iam, biz/v2.js contracts/revenue, customer/signup.js). `node --test tests/`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = p => readFileSync(path.join(ROOT, p), "utf8");
const require = createRequire(import.meta.url);
const BV = require(path.join(ROOT, "customer/billing-viz.js"));
const V2 = require(path.join(ROOT, "shared/v2-api.js"));
const EN = (ko, en) => en;

test("billing-viz: downtime budget — 99.9% of a 30-day month is 43.2 min; 31-day month 44.6 min", () => {
  assert.equal(BV.minutesInMonth("2026-11"), 30 * 1440);
  assert.equal(BV.minutesInMonth("2026-10"), 31 * 1440);
  const b = BV.budget(99.9, "2026-11", 52.6);
  assert.equal(b.allowed, 43.2);
  assert.equal(b.over, 9.4);
  assert.equal(b.left, 0);
  assert.ok(b.ratio > 1);
  assert.equal(BV.budget(99.9, "2026-10", 0).allowed, 44.6);
});

test("billing-viz: credit tiers follow NOCP SLA_CREDIT_TABLE (<99.9 → 10, <99.0 → 25, <95 → 50)", () => {
  assert.equal(BV.creditFor(99.95), 0);
  assert.equal(BV.creditFor(99.9), 0);
  assert.equal(BV.creditFor(99.8782), 10);
  assert.equal(BV.creditFor(98.5), 25);
  assert.equal(BV.creditFor(94), 50);
  assert.equal(BV.creditFor(null), 0);
  // table order from the API must not matter
  assert.equal(BV.creditFor(98.5, BV.CREDIT_TABLE.slice().reverse()), 25);
  const lad = BV.ladder(99.8782, null, EN);
  assert.match(lad, /aria-current="true"[^]*10% credit/);
  assert.equal((lad.match(/<li/g) || []).length, 4);
});

test("billing-viz: gauge is an accessible SVG with value, target tick and a text verdict", () => {
  const bad = BV.gauge({ value: 99.8782, target: 99.9, L: EN });
  assert.match(bad, /<svg[^>]+role="img"[^>]+aria-label="Availability 99\.878% · target 99\.9% · below target"/);
  assert.match(bad, /class="bv-g-tgt"/);
  assert.match(bad, /is-bad/);
  assert.match(bad, /▲ Below target/);            // not colour-only (WCAG 1.4.1)
  const ok = BV.gauge({ value: 100, target: 99.9, L: EN });
  assert.match(ok, /is-ok/); assert.match(ok, /● Meets target/);
  const none = BV.gauge({ value: null, L: EN });
  assert.doesNotMatch(none, /bv-g-val/);
  assert.doesNotMatch(bad + ok, /#[0-9a-fA-F]{3,8}\b/);     // colours come from billing.css tokens
});

test("billing-viz: invoice math = usage + true-up − credits, VAT 10% floor, matches live NOCP invoice", () => {
  // live shape (NOCP integration/v2, tnt-demo-c-xid after demo c-xid-remediation)
  const live = { usage_amount: 32832000, commitment_true_up: 0, credit_total: 3283200, subtotal: 29548800, vat: 2954880, total: 32503680,
    sla_credits: [{ credit_id: "crd-1", amount: 3283200 }], lines: [{ product: "bmaas", amount: 32832000 }] };
  const m = BV.invoiceMath(live);
  assert.equal(m.credits, 3283200); assert.equal(m.subtotal, 29548800); assert.ok(m.consistent);
  // mock shape (no usage_amount / credit_total) derives the same way
  const derived = BV.invoiceMath({ lines: [{ amount: 1000 }, { amount: 555 }], commitment_true_up: 45, sla_credits: [{ amount: 100 }] });
  assert.deepEqual([derived.subtotal, derived.vat, derived.total], [1500, 150, 1650]);
  const steps = BV.invoiceSteps(live, EN);
  assert.deepEqual(steps.map(s => s.label), ["Usage", "SLA credit", "Subtotal", "VAT 10%", "Total due"]);
  const wf = BV.waterfall(steps, EN);
  assert.match(wf, /−₩3,283,200/); assert.match(wf, /₩32,503,680/);
  assert.equal((wf.match(/<li /g) || []).length, 5);
});

test("billing-viz: every mock invoice from shared/v2-api.js is internally consistent", () => {
  const api = V2.create({ fetch: async () => { throw new TypeError("offline"); }, base: "http://nocp.test", token: null, session: () => null });
  for (const x of api._mock.invoices) assert.ok(BV.invoiceMath(x).consistent, x.id);
});

test("billing-viz: invoice lifecycle stepper marks done/current and aria-current", () => {
  const d = BV.invoiceFlow({ status: "draft", created_at: "2026-11-10T00:00:00Z" }, EN);
  assert.equal((d.match(/aria-current="step"/g) || []).length, 1);
  assert.match(d, /class="current"[^]*1\. Draft/);
  const p = BV.invoiceFlow({ status: "paid", tax_invoice: { issue_date: "2026-11-10" } }, EN);
  assert.equal((p.match(/class="done"/g) || []).length, 4);
});

test("billing-viz: Korean e-tax invoice shows both parties, supply/tax/total and reads live tax_amount", () => {
  const t = { approval_no: "20261110-41071003-00000001", issue_date: "2026-11-10", purpose: "청구",
    supplier: { business_reg_no: "000-00-00000", name: "NeoCloud", biz_type: "정보통신업", biz_item: "클라우드 컴퓨팅" },
    buyer: { business_reg_no: null, name: "f05-demo-corp" },
    items: [{ date: "2026-11-10", name: "NeoCloud 이용료 2026-10", supply_amount: 1220000, tax_amount: 122000 }],
    supply_amount: 1220000, tax_amount: 122000, total: 1342000 };
  const h = BV.taxDoc(t);                                  // default L = KO
  for (const s of ["전자세금계산서", "공급자", "공급받는자", "승인번호", "₩1,220,000", "₩122,000", "₩1,342,000", "청구"]) assert.ok(h.includes(s), s);
  assert.match(h, /사업자등록번호가 없습니다/);               // buyer reg no missing → warning
  assert.match(BV.taxDoc(t, EN), /Electronic tax invoice[^]*Supplier[^]*Buyer/);
  assert.match(BV.taxDoc({ vat: 9, supply_amount: 90 }), /₩9</);   // mock shape uses `vat`
});

test("billing-viz: spend rows group invoice lines by month × product; forecast is linear", () => {
  const sp = BV.spendRows([{ period: "2026-11", lines: [{ product: "bmaas", amount: 10 }, { product: "token-api", amount: 5 }] },
    { period: "2026-10", lines: [{ product: "bmaas", amount: 7 }], commitment_true_up: 3 }]);
  assert.deepEqual(sp.rows.map(r => r.label), ["2026-10", "2026-11"]);
  assert.deepEqual(sp.keys.sort(), ["bmaas", "token-api", "true-up"]);
  const html = BV.stack(sp.rows, sp.keys, EN);
  assert.match(html, /role="img" aria-label="2026-10: /);
  assert.match(html, /bv-legend/);
  const f = BV.forecast(1000, "2026-11", Date.UTC(2026, 10, 16));       // half of November elapsed
  assert.equal(f.amount, 2000); assert.equal(f.ratio, 0.5);
});

test("billing-viz: contract term progress and role matrix", () => {
  const t = BV.term("2026-01-01", 12, Date.UTC(2026, 6, 1));
  assert.equal(t.end, "2027-01-01"); assert.ok(t.ratio > 0.49 && t.ratio < 0.51); assert.equal(t.elapsed + t.left, 12);
  const rm = BV.roleMatrix(EN, "member");
  assert.match(rm, /<caption/); assert.match(rm, /member ★/);
  assert.equal((rm.match(/class="bv-yes"/g) || []).length, 9);     // admin 5 + member 3 + viewer 1
});

test("billing screens: wiring, ids kept, CSS tokens only, ≥11px, KO/EN pairs", () => {
  const cust = read("customer/index.html"), biz = read("biz/index.html"), su = read("customer/signup.html");
  for (const h of [cust, biz, su]) assert.match(h, /billing\.css/);
  assert.ok(cust.indexOf("billing-viz.js") > cust.indexOf("shared/v2-demo.js") && cust.indexOf("billing-viz.js") < cust.indexOf('src="v2.js"'));
  assert.ok(biz.indexOf("billing-viz.js") < biz.indexOf('src="v2.js"'));
  assert.ok(su.indexOf("billing-viz.js") < su.indexOf("signup.js"));
  const c = read("customer/v2.js"), b = read("biz/v2.js");
  for (const id of ["v2-invoices-root", "data-v2-inv", "data-v2-pay", "data-v2-tax", "v2-pm-add", "v2-sla-month", "v2-sso-save", "v2-oidc-try", "v2-key-create", "v2-pg-send"]) assert.ok(c.includes(id), id);
  for (const id of ["v2-contracts-root", "v2-biz-rev-root", "v2-ct-add", "data-v2-ctr-act", "/api/v1/finops/cost"]) assert.ok(b.includes(id), id);
  const css = read("customer/billing.css");
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ""), /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(css, /font-size:\s?(?:[0-9]|10)(?:\.\d+)?px/);
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ""), /\*\//);
  assert.match(css, /@media \(max-width:767px\)/);
  for (const f of ["customer/billing-viz.js", "customer/v2.js", "biz/v2.js", "customer/signup.js"]) {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b(?![-\w])/, f);
    assert.doesNotMatch(src, /font-size:\s?(?:[0-9]|10)(?:\.\d+)?px/, f);
    const lit = /"((?:[^"\\]|\\.)*)"/g, toks = [];
    let m;
    while ((m = lit.exec(src))) toks.push({ s: m[1], i: m.index, end: lit.lastIndex });
    toks.forEach((t, k) => {
      if (!/[가-힣]/.test(t.s)) return;
      if (f === "customer/billing-viz.js" && /^(영수|청구)$/.test(t.s) && /purpose/.test(src.slice(t.i - 40, t.i))) return;   // API enum value, not UI text
      const next = toks[k + 1], between = next ? src.slice(t.end, next.i) : "";
      assert.ok(next && /^\s*(\+[^,"]*)?,\s*(en:\s*)?$/.test(between) && !/[가-힣]/.test(next.s), `${f}: Korean literal without EN pair: "${t.s}"`);
    });
  }
});

test("billing-viz: uses design-core NC.flow / NC.kpi when loaded; SLA miss is judged crit, not warn", () => {
  const F = require(path.join(ROOT, "shared/flow-timeline.js")), K = require(path.join(ROOT, "shared/kpi-gauge.js"));
  const own = BV.steps([{ label: "A", state: "done" }, { label: "B", state: "current" }], "x");
  assert.match(own, /class="bv-steps"/);                         // node: no window → own stepper
  globalThis.window = { NC: { flow: F, kpi: K } };
  try {
    const h = BV.steps(BV.invoiceFlowSteps({ status: "finalized" }, EN), "Invoice lifecycle");
    assert.match(h, /ft-step done/); assert.match(h, /aria-current="step"/);
    const g = BV.availGauge({ value: 99.8782, target: 99.9, L: EN });
    assert.match(g, /kg-gauge/); assert.match(g, /data-tone="crit"/); assert.match(g, /scale zoomed to 99–100%/);
    assert.match(BV.availGauge({ value: 99.95, target: 99.9, L: EN }), /data-tone="ok"/);
  } finally { delete globalThis.window; }
});
