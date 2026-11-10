/* v2 Phase 1 시연 시나리오 — 브라우저 시연 패널(shared/v2-demo.js)과 터미널(scripts/demo_console.mjs)이 같은 단계를 돈다.
   형식은 NOCP 데모 러너 계약(WAVE-v2.md: {id, title_ko, title_en, feature, steps:[{id, title_ko, title_en, call, expect}]})과
   같은 키를 쓰고, call+expect 를 run(ctx) 하나로 묶었다. 결과 문장은 KO/EN.
   시드: mock 은 shared/v2-api.js buildMock(고정 시드 20261110), 초기화 = api.resetMock(). 라이브에서는 NOCP 데이터를 쓴다. */
(function (root, factory) {
  var mod = factory();
  if (typeof module === "object" && module.exports) module.exports = mod;
  if (root && root.document) { root.NC = root.NC || {}; root.NC.v2scenarios = mod; }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  function ok(c, ko, en) { return { ok: !!c, ko: ko, en: en }; }
  function n(x) { return (+x || 0).toLocaleString("en-US"); }

  function build(api, env) {
    env = env || {};
    var tid = function () { return env.tenant ? env.tenant() : "tnt-fin-corp"; };
    var per = function (back) { var d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (back || 0), 1)).toISOString().slice(0, 7); };
    var S = [];

    S.push({ id: "token-api", feature: "F01·F02·F04", ko: "토큰 API — 키 발급 → 스트리밍 호출 → usage → 쿼터", en: "Token API — issue key → streaming call → usage → quota",
      steps: [
        { id: "models", ko: "모델 목록 GET /v1/models", en: "List models GET /v1/models", run: async function (c) {
          var r = await api.models(); c.model = r.data && r.data[0] && r.data[0].id;
          return ok(c.model, (r.data || []).length + "개 모델, 첫 모델 " + c.model, (r.data || []).length + " models, first " + c.model); } },
        { id: "key", ko: "API 키 발급 POST /api/v1/api-keys", en: "Issue API key POST /api/v1/api-keys", run: async function (c) {
          var r = await api.apiKeyCreate({ name: "demo-" + Date.now().toString(36).slice(-4), scope: "inference" });
          c.key = r.data && r.data.secret;
          return ok(c.key && !r.error, r.error ? "실패: " + r.error : "키 " + r.data.key_id + " 발급 (secret 1회 노출)", r.error ? "Failed: " + r.error : "Key " + r.data.key_id + " issued (secret shown once)"); } },
        { id: "stream", ko: "스트리밍 호출 POST /v1/chat/completions stream=true", en: "Streaming call POST /v1/chat/completions stream=true", run: async function (c) {
          var chunks = 0;
          var r = await api.chat({ model: c.model, stream: true, max_tokens: 64, messages: [{ role: "user", content: "NVL72 GPU 수?" }] }, c.key,
            { onDelta: function () { chunks++; } });
          c.usage = r.usage; c.rid = r.request_id;
          return ok(!r.error && r.usage && r.usage.total_tokens > 0, r.error ? "실패 " + r.status + ": " + r.error : chunks + "개 청크, 마지막 청크 usage total " + r.usage.total_tokens + " (x-request-id " + r.request_id + ")",
            r.error ? "Failed " + r.status + ": " + r.error : chunks + " chunks, final-chunk usage total " + (r.usage || {}).total_tokens + " (x-request-id " + r.request_id + ")"); } },
        { id: "bad-model", ko: "없는 모델 → 404 오류 본문", en: "Unknown model → 404 error body", soft: true, run: async function (c) {
          var r = await api.chat({ model: "no-such-model", stream: false, messages: [{ role: "user", content: "x" }] }, c.key);
          return ok(r.error && r.status === 404, "HTTP " + r.status + " " + (r.error_type || "") + ": " + r.error, "HTTP " + r.status + " " + (r.error_type || "") + ": " + r.error); } },
        { id: "usage", ko: "토큰 유형별 사용량 GET /api/v1/metering/usage", en: "Usage by token type GET /api/v1/metering/usage", run: async function () {
          var r = await api.usage(tid()), tb = (r.data || {}).tokens_by_type || {};
          return ok(r.data, "input " + n(tb.input) + " · cached " + n(tb.cached) + " · output " + n(tb.output), "input " + n(tb.input) + " · cached " + n(tb.cached) + " · output " + n(tb.output)); } },
        { id: "quota", ko: "남은 한도 GET /api/v1/token/quotas", en: "Remaining quota GET /api/v1/token/quotas", run: async function () {
          var r = await api.quotas(tid()), q = (r.data || [])[0] || {};
          return ok(q.tier, q.tier + " TPM " + n(q.tpm) + " 중 " + n(q.used_tpm) + " 사용", q.tier + " used " + n(q.used_tpm) + " of " + n(q.tpm) + " TPM"); } },
      ] });

    S.push({ id: "invoice", feature: "F05", ko: "청구서 → 세금계산서 → 결제", en: "Invoice → tax invoice → payment",
      steps: [
        { id: "list", ko: "청구서 목록", en: "List invoices", run: async function (c) {
          var r = await api.invoices(tid()); var l = r.data || [];
          c.inv = (l.find(function (x) { return x.status === "finalized"; }) || l.find(function (x) { return x.status !== "draft"; }) || l[0] || {}).id;
          return ok(l.length, l.length + "건, 선택 " + c.inv, l.length + " invoices, picked " + c.inv); } },
        { id: "detail", ko: "상세 — 공급가액 + VAT 10% = 합계", en: "Detail — subtotal + 10% VAT = total", run: async function (c) {
          var x = (await api.invoice(c.inv)).data || {};
          var good = x.total === x.subtotal + x.vat && x.vat === Math.round(x.subtotal * 0.1);
          return ok(good, "₩" + n(x.subtotal) + " + ₩" + n(x.vat) + " = ₩" + n(x.total) + (good ? " 일치" : " 불일치"), "₩" + n(x.subtotal) + " + ₩" + n(x.vat) + " = ₩" + n(x.total) + (good ? " match" : " mismatch")); } },
        { id: "tax", ko: "전자세금계산서 GET …/tax-invoice", en: "e-Tax invoice GET …/tax-invoice", run: async function (c) {
          var t = (await api.taxInvoice(c.inv)).data || {};
          return ok(t.approval_no, "승인번호 " + t.approval_no + " · 공급받는자 " + (t.buyer || {}).business_reg_no, "approval " + t.approval_no + " · buyer " + (t.buyer || {}).business_reg_no); } },
        { id: "pay", ko: "결제 POST …/pay (finalized 만)", en: "Pay POST …/pay (finalized only)", soft: true, run: async function (c) {
          var r = await api.invoicePay(c.inv, {});
          return ok(!r.error || r.status === 409, r.error ? "HTTP " + r.status + ": " + r.error : "상태 " + r.data.status, r.error ? "HTTP " + r.status + ": " + r.error : "status " + r.data.status); } },
      ] });

    S.push({ id: "sla", feature: "F09·F10", ko: "SLA — 다운타임 귀속 · 예외 제외 · 크레딧 차감", en: "SLA — downtime attribution · exceptions · credit applied",
      steps: [
        { id: "report", ko: "지난달 SLA 리포트", en: "Last month SLA report", run: async function (c) {
          var r = (await api.slaReport(tid(), per(1))).data || {}; c.rep = r;
          return ok(r.availability_pct != null, "가용성 " + r.availability_pct + "% (목표 " + r.target_pct + "%) · 위반 " + (r.violated ? "예" : "아니오"), "availability " + r.availability_pct + "% (target " + r.target_pct + "%) · violated " + !!r.violated); } },
        { id: "downtime", ko: "예외 구간은 가용성 계산에서 제외", en: "Exception windows excluded from availability", run: async function () {
          var d = (await api.downtime(tid(), per(1))).data || [];
          var ex = d.filter(function (x) { return x.exception_id; });
          return ok(d.length, d.length + "건 중 " + ex.length + "건 예외 제외", ex.length + " of " + d.length + " windows excluded"); } },
        { id: "credit", ko: "크레딧이 청구서에 차감됨 (applied_invoice)", en: "Credit applied to an invoice (applied_invoice)", soft: true, run: async function (c) {
          var cr = (c.rep && c.rep.credits || [])[0];
          return ok(cr && cr.applied_invoice, cr ? cr.credit_id + " → " + (cr.applied_invoice || "미적용") : "크레딧 없음", cr ? cr.credit_id + " → " + (cr.applied_invoice || "not applied") : "no credit"); } },
      ] });

    S.push({ id: "signup", feature: "F07", ko: "셀프 가입 → 운영자 확인 → OIDC 토큰", en: "Self sign-up → operator verify → OIDC token",
      steps: [
        { id: "signup", ko: "가입 POST /api/v1/signup", en: "Sign up POST /api/v1/signup", run: async function (c) {
          var r = await api.signup({ org_name: "Demo AI " + Date.now().toString(36).slice(-3), business_reg_no: "123-45-67890", admin_email: "admin@demo.example", admin_name: "Demo", public_sector: false });
          c.tid = r.data && r.data.tenant_id;
          return ok(c.tid && r.data.status === "pending_verification", r.error ? "실패: " + r.error : c.tid + " · " + r.data.status, r.error ? "Failed: " + r.error : c.tid + " · " + r.data.status); } },
        { id: "verify", ko: "운영자 확인 POST /api/v1/signup/{id}/verify", en: "Operator verify POST /api/v1/signup/{id}/verify", run: async function (c) {
          var r = await api.signupVerify(c.tid);
          return ok(r.data && r.data.status === "active", r.error ? "HTTP " + r.status + ": " + r.error : c.tid + " → " + r.data.status, r.error ? "HTTP " + r.status + ": " + r.error : c.tid + " → " + r.data.status); } },
        { id: "discovery", ko: "OIDC Discovery", en: "OIDC Discovery", run: async function () {
          var d = (await api.oidcConfig()).data || {};
          return ok(d.issuer && d.jwks_uri && d.token_endpoint, "issuer " + d.issuer, "issuer " + d.issuer); } },
        { id: "token", ko: "토큰 POST /oauth2/token (client_credentials)", en: "Token POST /oauth2/token (client_credentials)", soft: true, run: async function (c) {
          var r = await api.oauthToken({ grant_type: "client_credentials", client_id: c.tid + "-ci", client_secret: "demo", scope: "openid" });
          return ok(r.data && r.data.access_token && r.data.token_type, r.error ? "HTTP " + r.status + ": " + r.error : "token_type " + r.data.token_type + " · expires_in " + r.data.expires_in,
            r.error ? "HTTP " + r.status + ": " + r.error : "token_type " + r.data.token_type + " · expires_in " + r.data.expires_in); } },
      ] });

    S.push({ id: "contract", feature: "F06", ko: "약정 계약 등록 → 활성화", en: "Reserved contract create → activate",
      steps: [
        { id: "create", ko: "4랙 12개월 계약 POST /api/v1/contracts", en: "4-rack 12-month contract POST /api/v1/contracts", run: async function (c) {
          var r = await api.contractCreate({ tenant_id: tid(), product: "bmaas", commitment: "reserved", racks: 4, blueprint_key: "vr-nvl72", term_months: 12,
            start_date: per(-1) + "-01", unit_price: 310000, min_monthly_amount: 890000000, placement: { same_ib_zone: true }, sla_tier: "99.9" });
          c.id = r.data && r.data.id;
          return ok(c.id, r.error ? "실패: " + r.error : c.id + " · " + r.data.status, r.error ? "Failed: " + r.error : c.id + " · " + r.data.status); } },
        { id: "activate", ko: "활성화 POST …/activate", en: "Activate POST …/activate", run: async function (c) {
          var r = await api.contractActivate(c.id);
          return ok(r.data && r.data.status === "active", r.error ? "HTTP " + r.status + ": " + r.error : c.id + " → active", r.error ? "HTTP " + r.status + ": " + r.error : c.id + " → active"); } },
        { id: "again", ko: "두 번 활성화 → 409", en: "Activate twice → 409", soft: true, run: async function (c) {
          var r = await api.contractActivate(c.id);
          return ok(r.status === 409, "HTTP " + r.status + " " + (r.error || ""), "HTTP " + r.status + " " + (r.error || "")); } },
      ] });

    S.push({ id: "nvke-topology", feature: "F11", ko: "NVKE 토폴로지 — 랙마다 클리크·ComputeDomain", en: "NVKE topology — one clique and ComputeDomain per rack",
      steps: [
        { id: "capi", ko: "CAPI 객체 GET …/capi", en: "CAPI objects GET …/capi", run: async function (c) {
          c.cid = env.cluster ? env.cluster() : "nvke-0001";
          var k = (await api.nvkeCapi(c.cid)).data || {};
          c.fd = (k.machine_deployments || []).map(function (m) { return m.failure_domain; });
          return ok(c.fd.length, "MachineDeployment " + c.fd.length + "개, failure domain = " + c.fd.join(", "), c.fd.length + " MachineDeployments, failure domains " + c.fd.join(", ")); } },
        { id: "nodes", ko: "노드 라벨 nvidia.com/gpu.clique", en: "Node label nvidia.com/gpu.clique", run: async function (c) {
          var nodes = (await api.nvkeNodes(c.cid)).data || [];
          c.cl = api.groupByClique(nodes).length;
          return ok(c.cl >= 1, nodes.length + "노드 · 클리크 " + c.cl + "개", nodes.length + " nodes · " + c.cl + " cliques"); } },
        { id: "domains", ko: "ComputeDomain 수 = 클리크 수", en: "ComputeDomain count = clique count", run: async function (c) {
          var d = (await api.nvkeDomains(c.cid)).data || [];
          return ok(d.length === c.cl, "ComputeDomain " + d.length + " / 클리크 " + c.cl, d.length + " ComputeDomains / " + c.cl + " cliques"); } },
      ] });

    S.push({ id: "auto-recovery", feature: "F10", ko: "자동 복구 — 장애 주입 → cordon → … → MTTR", en: "Auto-recovery — inject fault → cordon → … → MTTR",
      note: ["운영자 권한 · 주입", "Operator · injection"],
      steps: [
        { id: "policy", ko: "정책 auto 로 PUT /api/v1/remediation/policy", en: "Policy to auto PUT /api/v1/remediation/policy", run: async function () {
          var r = await api.remPolicyPut({ mode: "auto" });
          return ok(r.data && r.data.mode === "auto", r.error ? "HTTP " + r.status + ": " + r.error : "mode auto · 랙당 동시 " + r.data.max_parallel_per_rack, r.error ? "HTTP " + r.status + ": " + r.error : "mode auto · per-rack parallel " + r.data.max_parallel_per_rack); } },
        { id: "inject", ko: "장애 주입 POST /api/v1/remediation/runs", en: "Inject fault POST /api/v1/remediation/runs", run: async function (c) {
          var r = await api.remRunCreate({ machine_id: env.machine ? env.machine() : "gasan-f2-r05-t07", reason: "demo XID 79" });
          c.run = r.data && r.data.id;
          return ok(c.run, r.error ? "HTTP " + r.status + ": " + r.error : "run " + c.run + " 시작", r.error ? "HTTP " + r.status + ": " + r.error : "run " + c.run + " started"); } },
        { id: "timeline", ko: "단계 타임라인 GET …/runs/{id}", en: "Step timeline GET …/runs/{id}", run: async function (c) {
          var x = (await api.remRun(c.run)).data || {};
          return ok(x.steps && x.steps.length, (x.steps || []).map(function (s) { return s.name + ":" + s.state; }).join(" → "), (x.steps || []).map(function (s) { return s.name + ":" + s.state; }).join(" → ")); } },
        { id: "mttr", ko: "완료된 실행 MTTR ≤ 60분", en: "Completed runs MTTR ≤ 60 min", run: async function () {
          var l = ((await api.remRuns()).data || []).filter(function (x) { return x.mttr_min != null; });
          var worst = l.reduce(function (m, x) { return Math.max(m, x.mttr_min); }, 0);
          return ok(l.length && worst <= 60, l.length + "건 완료, 최대 MTTR " + worst + "분", l.length + " completed, worst MTTR " + worst + " min"); } },
      ] });

    S.push({ id: "billing-run", feature: "F05", ko: "월 청구 실행 → 확정 (운영)", en: "Monthly billing run → finalize (ops)",
      steps: [
        { id: "run", ko: "POST /api/v1/billing/invoices:run (멱등)", en: "POST /api/v1/billing/invoices:run (idempotent)", run: async function (c) {
          var a = await api.invoicesRun(per(0)), b = await api.invoicesRun(per(0));
          c.ids = (a.data && a.data.invoices || []).map(function (x) { return x.id || x; });
          var same = JSON.stringify(c.ids) === JSON.stringify((b.data && b.data.invoices || []).map(function (x) { return x.id || x; }));
          return ok(c.ids.length && same, c.ids.length + "건 · 두 번 실행해도 같은 id " + (same ? "예" : "아니오"), c.ids.length + " invoices · rerun same ids " + same); } },
        { id: "finalize", ko: "확정 POST …/finalize", en: "Finalize POST …/finalize", run: async function (c) {
          var r = await api.invoiceFinalize(c.ids[0]);
          return ok((r.data && r.data.status === "finalized") || r.status === 409, r.error ? "HTTP " + r.status + ": " + r.error : c.ids[0] + " → finalized", r.error ? "HTTP " + r.status + ": " + r.error : c.ids[0] + " → finalized"); } },
        { id: "locked", ko: "확정 후 재확정 → 409", en: "Finalize again → 409", soft: true, run: async function (c) {
          var r = await api.invoiceFinalize(c.ids[0]);
          return ok(r.status === 409, "HTTP " + r.status + " " + (r.error || ""), "HTTP " + r.status + " " + (r.error || "")); } },
      ] });
    return S;
  }
  return { build: build };
});
