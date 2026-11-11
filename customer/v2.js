/* 고객 콘솔 v2 Phase 1 화면 — 토큰 API(F01·F02·F04) · 청구서/결제/세금계산서(F05) · SLA·크레딧(F09·F10) · 조직/IAM/SSO(F07).
   데이터: NC.v2 (shared/v2-api.js) — NOCP 라이브 우선, 실패 시 MOCK 배지.
   라우트: #/token · #/invoices · #/sla · #/iam (NC.bus "route" — customer/app.js 의 NC.start 맵 수정 없음). */
(function () {
  var NC = window.NC = window.NC || {};
  var A = NC.v2, U = NC.v2ui;
  if (!A || !U) return;
  var L = U.L, esc = U.esc, fmt = U.fmt, $ = U.$;

  function sess() { return typeof NC.session === "function" ? NC.session() : null; }
  function tenant() { var s = sess(); return (s && s.tenant_id) || "tnt-fin-corp"; }
  function canWrite() { var s = sess(); return !s || s.role !== "viewer"; }
  function isAdmin() { var s = sess(); return !s || s.role === "admin" || s.role === "owner"; }
  function months() {
    var d = new Date(), out = [];
    for (var i = 0; i < 3; i++) { out.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)).toISOString().slice(0, 7)); }
    return out;
  }

  /* ══ ① 토큰 API ═══════════════════════════════════════════════ */
  var TK = { key: "", model: "", tier: "interactive", stream: true, max: 128, prompt: "", busy: false, secret: null };
  async function renderToken() {
    var root = $("v2-token-root"); if (!root) return;
    var tid = tenant();
    var r = await Promise.all([A.apiKeys(), A.models(TK.key || null), A.quotas(tid), A.usage(tid)]);
    var keys = r[0].data || [], models = r[1].data || [], quotas = r[2].data || [], use = r[3].data || {};
    if (!TK.model && models[0]) TK.model = models[0].id;
    var qi = quotas.find(function (q) { return q.tier === "interactive"; }) || quotas[0] || {};
    var tb = use.tokens_by_type || {};
    var monthTok = (tb.input || 0) + (tb.output || 0) + (tb.cached || 0) + (tb.reasoning || 0);
    var kp = '<div class="kpi-band">' +
      U.kpi(L("남은 TPM (interactive)", "TPM left (interactive)"), U.big(qi.tpm != null ? qi.tpm - (qi.used_tpm || 0) : null),
        L("한도 ", "limit ") + U.big(qi.tpm)) +
      U.kpi(L("남은 RPM", "RPM left"), fmt(qi.rpm != null ? qi.rpm - (qi.used_rpm || 0) : null), L("한도 ", "limit ") + fmt(qi.rpm)) +
      U.kpi(L("이번 달 토큰", "Tokens this month"), U.big(monthTok), esc(use.period || "")) +
      U.kpi(L("월 상한", "Monthly cap"), qi.monthly_token_cap ? U.big(qi.monthly_token_cap) : L("없음", "none"),
        qi.monthly_token_cap ? U.bar(monthTok / qi.monthly_token_cap) : "") + "</div>";

    var keyRows = keys.map(function (k) {
      return "<tr><td class='id'>" + esc(k.key_id) + "</td><td>" + esc(k.name) + "</td><td class='id'>" + esc(k.prefix || "") +
        "</td><td>" + esc(k.scope || "") + "</td><td>" + U.when(k.created_at) + "</td><td>" + U.when(k.last_used) + "</td><td>" + U.st(k.state) +
        "</td><td>" + (canWrite() ? '<button type="button" class="btn-ghost" data-v2-revoke="' + esc(k.key_id) + '">' + esc(L("폐기", "Revoke")) + "</button>" : "") + "</td></tr>";
    });
    var newKey = TK.secret ? '<p class="v2-note" role="status"><b>' + esc(L("새 키 (한 번만 표시)", "New key (shown once)")) + ':</b> <code class="id">' +
      esc(TK.secret) + '</code> <button type="button" class="btn-ghost" data-v2-usekey="1">' + esc(L("플레이그라운드에 사용", "Use in playground")) + "</button></p>" : "";
    var keysP = U.panel(L("API 키", "API keys"), U.src(r[0]),
      (canWrite() ? '<div class="v2-row">' + U.field("v2-key-name", L("키 이름", "Key name"), '<input id="v2-key-name" placeholder="prod-backend" maxlength="40">') +
        '<button type="button" class="btn" id="v2-key-create">' + esc(L("+ 키 발급", "+ Issue key")) + "</button></div>" : "") + newKey +
      U.table([L("ID", "ID"), L("이름", "Name"), L("접두어", "Prefix"), L("범위", "Scope"), L("발급", "Created"), L("최근 사용", "Last used"), L("상태", "State"), ""],
        keyRows, L("발급된 키 없음", "No keys")));

    var modelOpts = models.map(function (m) { return '<option value="' + esc(m.id) + '"' + (m.id === TK.model ? " selected" : "") + ">" + esc(m.id) + "</option>"; }).join("");
    var play = U.panel(L("플레이그라운드", "Playground"), "POST /v1/chat/completions · " + (r[1].live ? U.src(r[1]) : U.src({ live: false })),
      '<div class="v2-row">' +
      U.field("v2-pg-key", L("API 키 (Bearer)", "API key (Bearer)"), '<input id="v2-pg-key" type="password" autocomplete="off" value="' + esc(TK.key) + '" placeholder="nc_sk_…">') +
      U.field("v2-pg-model", L("모델", "Model"), '<select id="v2-pg-model">' + modelOpts + "</select>") +
      U.field("v2-pg-tier", L("등급", "Tier"), '<select id="v2-pg-tier"><option value="interactive"' + (TK.tier === "interactive" ? " selected" : "") +
        '>interactive</option><option value="batch"' + (TK.tier === "batch" ? " selected" : "") + ">batch</option></select>") +
      U.field("v2-pg-max", "max_tokens", '<input id="v2-pg-max" type="number" min="1" max="8192" value="' + esc(TK.max) + '">') +
      '<div class="v2-f"><label for="v2-pg-stream">stream</label><input id="v2-pg-stream" type="checkbox"' + (TK.stream ? " checked" : "") + "></div></div>" +
      U.field("v2-pg-prompt", L("메시지 (user)", "Message (user)"), '<textarea id="v2-pg-prompt" rows="3">' + esc(TK.prompt || L("NVL72 랙 한 대의 GPU 수는?", "How many GPUs are in one NVL72 rack?")) + "</textarea>") +
      '<div class="v2-row" style="margin-top:8px"><button type="button" class="btn" id="v2-pg-send"' + (TK.busy ? " disabled" : "") + ">" +
      esc(TK.busy ? L("생성 중…", "Generating…") : L("보내기", "Send")) + "</button></div>" +
      '<div class="v2-out" id="v2-pg-out" aria-live="polite" aria-label="' + esc(L("응답", "Response")) + '"></div>' +
      '<p class="v2-note" id="v2-pg-meta"></p>');

    var lines = (use.token_lines || []).map(function (l) {
      return "<tr><td class='id'>" + esc(l.model) + "</td><td>" + esc(l.tier || "") + "</td><td class='num'>" + U.big(l.input) + "</td><td class='num'>" +
        U.big(l.cached) + "</td><td class='num'>" + U.big(l.output) + "</td><td class='num'>" + U.big(l.reasoning) + "</td><td class='num'>" + fmt(l.requests) + "</td></tr>";
    });
    var usage = U.panel(L("사용량 (토큰 유형별)", "Usage by token type"), U.src(r[3]),
      '<div class="kpi-band">' + ["input", "cached", "output", "reasoning"].map(function (k) { return U.kpi(k, U.big(tb[k]), "tokens"); }).join("") + "</div>" +
      U.table([L("모델", "Model"), L("등급", "Tier"), "#input", "#cached", "#output", "#reasoning", L("#요청", "#Requests")], lines, L("토큰 사용 없음", "No token usage")));

    var qrows = quotas.map(function (q) {
      return "<tr><td>" + esc(q.tier) + "</td><td class='num'>" + U.big(q.tpm) + "</td><td>" + U.bar(q.tpm ? (q.used_tpm || 0) / q.tpm : 0) +
        "</td><td class='num'>" + fmt(q.rpm) + "</td><td>" + U.bar(q.rpm ? (q.used_rpm || 0) / q.rpm : 0) + "</td><td class='num'>" +
        (q.monthly_token_cap ? U.big(q.monthly_token_cap) : "—") + "</td></tr>";
    });
    var quota = U.panel(L("쿼터 · 속도 제한", "Quotas · rate limits"), U.src(r[2]),
      U.table([L("등급", "Tier"), "#TPM", L("TPM 사용률", "TPM used"), "#RPM", L("RPM 사용률", "RPM used"), L("#월 상한", "#Monthly cap")], qrows, L("쿼터 없음", "No quotas")) +
      '<p class="v2-note">' + esc(L("한도 초과 시 429 rate_limit_exceeded 와 Retry-After 헤더가 옵니다.", "Over the limit the API returns 429 rate_limit_exceeded with a Retry-After header.")) + "</p>");

    var curl = "curl " + A.base() + "/v1/chat/completions \\\n  -H \"Authorization: Bearer $NEOCLOUD_API_KEY\" \\\n  -H \"Content-Type: application/json\" \\\n" +
      "  -d '{\"model\":\"" + (TK.model || "kanana-2-70b-instruct") + "\",\"stream\":true,\"messages\":[{\"role\":\"user\",\"content\":\"hello\"}]}'";
    var sdk = "from openai import OpenAI\nclient = OpenAI(base_url=\"" + A.base() + "/v1\", api_key=os.environ[\"NEOCLOUD_API_KEY\"])";
    var ex = U.panel(L("예제", "Examples"), "OpenAI " + L("호환", "compatible"),
      '<div class="v2-out" aria-label="curl">' + esc(curl) + '</div><div class="v2-out" style="margin-top:8px" aria-label="Python SDK">' + esc(sdk) + "</div>");

    root.innerHTML = (NC.v2demo ? NC.v2demo.host("token-api") : "") + kp + keysP + play + '<div class="grid">' + usage + quota + "</div>" + ex;
  }
  function readPlay() {
    var g = function (id) { var e = $(id); return e ? e : null; };
    if (g("v2-pg-key")) TK.key = g("v2-pg-key").value.trim();
    if (g("v2-pg-model")) TK.model = g("v2-pg-model").value;
    if (g("v2-pg-tier")) TK.tier = g("v2-pg-tier").value;
    if (g("v2-pg-max")) TK.max = Math.max(1, Math.min(8192, +g("v2-pg-max").value || 128));
    if (g("v2-pg-stream")) TK.stream = g("v2-pg-stream").checked;
    if (g("v2-pg-prompt")) TK.prompt = g("v2-pg-prompt").value;
  }
  async function sendPlay() {
    readPlay();
    if (!TK.prompt.trim()) return U.toast(L("메시지를 입력하세요", "Enter a message"), "warn");
    var out = $("v2-pg-out"), meta = $("v2-pg-meta"), btn = $("v2-pg-send");
    TK.busy = true;
    if (btn) { btn.disabled = true; btn.textContent = L("생성 중…", "Generating…"); }
    if (out) out.textContent = "";
    if (meta) meta.textContent = "";
    var res = await A.chat({ model: TK.model, stream: TK.stream, max_tokens: TK.max, service_tier: TK.tier,
      messages: [{ role: "user", content: TK.prompt }] }, TK.key || null,
      { onDelta: function (d) { if (out) out.textContent += d; } });
    TK.busy = false;
    if (btn) { btn.disabled = false; btn.textContent = L("보내기", "Send"); }
    if (!meta) return;
    if (res.error) {
      meta.innerHTML = U.st("failed", String(res.status || "") + " " + (res.error_type || "")) + " " + esc(res.error) +
        (res.retry_after ? " · Retry-After " + esc(res.retry_after) + "s" : "") + " · x-request-id <span class='id'>" + esc(res.request_id || "") + "</span>";
      return;
    }
    var u = res.usage || {};
    meta.innerHTML = (res.live ? U.src({ live: true, src: "/v1/chat/completions" }) : U.src({ live: false })) +
      " usage: prompt " + fmt(u.prompt_tokens) + " · cached " + fmt(u.cached_tokens) + " · completion " + fmt(u.completion_tokens) +
      " · reasoning " + fmt(u.reasoning_tokens) + " · total " + fmt(u.total_tokens) +
      " · x-request-id <span class='id'>" + esc(res.request_id || "") + "</span>" +
      (res.ratelimit && res.ratelimit.tokens != null ? " · " + L("남은 토큰 ", "remaining tokens ") + esc(res.ratelimit.tokens) : "") +
      (res.finish_reason ? " · finish " + esc(res.finish_reason) : "");
  }

  /* ══ ② 청구서 · 결제 · 세금계산서 · 비용 분석(FinOps) ══════════
     v2 쇼케이스: 금액 히어로 + 월×상품 비용 추이 → 목록 → 상세(진행 단계 · 워터폴 · 세금계산서 양식) → 결제 수단 카드.
     그림은 customer/billing-viz.js (NC.billingViz), 스타일은 customer/billing.css. */
  var IV = { sel: null, tax: null };
  var STATUS = { draft: ["초안", "Draft"], finalized: ["확정", "Finalized"], paid: ["결제 완료", "Paid"], void: ["무효", "Void"] };
  function stLabel(s) { var x = STATUS[s]; return x ? L(x[0], x[1]) : s; }
  function BV() { return NC.billingViz; }
  /* 이 화면이 방금 주고받은 요청·응답 원문 — design-core NC.msg (없으면 생략) */
  function raw(re) {
    if (!NC.msg || !A.trace) return "";
    return U.panel(L("요청 · 응답 원문", "Raw request · response"), esc(L("Lago · Stripe 형식 · 최근 6건", "Lago · Stripe format · latest 6")),
      NC.msg.list(A.trace(), { limit: 6, filter: function (e) { return re.test(String(e.url || "")); }, layout: "split",
        empty: L("아직 호출 없음", "No calls yet"), ariaLabel: L("요청 · 응답 원문", "Raw request · response") }));
  }
  function unitPrice(p) { return p != null && p < 1 ? "₩" + esc(p) : U.krw(p); }
  async function renderInvoices() {
    var root = $("v2-invoices-root"); if (!root) return;
    var tid = tenant(), V = BV();
    var r = await Promise.all([A.invoices(tid), A.paymentMethods(tid)]);
    var list = (r[0].data || []).slice().sort(function (a, b) { return String(b.period).localeCompare(String(a.period)); });
    if (!IV.sel && list[0]) IV.sel = list[0].id;
    var d = IV.sel ? await A.invoice(IV.sel) : { data: null }, x = d.data;
    var openAmt = list.filter(function (i) { return i.status === "finalized"; }).reduce(function (s, i) { return s + (+i.total || 0); }, 0);
    var credAll = list.reduce(function (s, i) { return s + (V ? V.invoiceMath(i).credits : 0); }, 0);

    /* 히어로: 선택 청구서 금액 + 비용 추이 */
    var hero = "";
    if (V) {
      var m = x ? V.invoiceMath(x) : null, cur = list[0];
      var fc = cur && cur.status === "draft" ? V.forecast(V.invoiceMath(cur).total, cur.period) : null;
      var sp = V.spendRows(list);
      hero = '<div class="bv-hero">' +
        U.panel(L("청구 금액", "Amount due"), U.src(d) + (x ? " · " + esc(x.period) : ""),
          '<div class="bv-amount"><span class="k">' + esc(x ? x.id + " · " + stLabel(x.status) : L("청구서 없음", "No invoice")) + '</span><span class="v">' +
          (m ? U.krw(m.total) : "—") + '</span><span class="s">' + esc(L("KRW · 부가세 10% 포함", "KRW · incl. 10% VAT")) +
          (fc && fc.ratio < 1 ? " · " + esc(L("월말 예상 ", "month-end forecast ")) + U.krw(fc.amount) + " (" + Math.round(fc.ratio * 100) + esc(L("% 경과", "% elapsed")) + ")" : "") + "</span></div>" +
          '<div class="bv-pair"><div><div class="k">' + esc(L("공급가액", "Subtotal")) + '</div><div class="v">' + (m ? U.krw(m.subtotal) : "—") + "</div></div>" +
          '<div><div class="k">' + esc(L("부가세", "VAT")) + '</div><div class="v">' + (m ? U.krw(m.vat) : "—") + "</div></div>" +
          '<div><div class="k">' + esc(L("SLA 크레딧 차감", "SLA credit applied")) + '</div><div class="v credit">' + (m && m.credits ? "−" + U.krw(m.credits) : "₩0") + "</div></div>" +
          '<div><div class="k">' + esc(L("미결제 (확정)", "Unpaid (finalized)")) + '</div><div class="v' + (openAmt ? " warn" : "") + '">' + U.krw(openAmt) + "</div></div></div>") +
        U.panel(L("비용 분석 (FinOps)", "Cost analysis (FinOps)"), esc(L("청구서 라인 기준 · 상품별", "from invoice lines · by product")),
          (sp.rows.length ? V.stack(sp.rows, sp.keys, L, L("월별 상품 비용", "Monthly cost by product")) : '<p class="v2-note">' + esc(L("청구 이력 없음", "No billing history")) + "</p>") +
          '<p class="v2-note">' + esc(L("누적 SLA 크레딧 ", "SLA credits to date ")) + "<b>" + U.krw(credAll) + "</b>" +
          esc(L(" · 약정 최소 금액 미달분은 true-up 으로 청구됩니다.", " · shortfall against the commitment is billed as true-up.")) + "</p>") + "</div>";
    }

    var rows = list.map(function (i) {
      return '<tr><td class="id"><button type="button" class="btn-ghost" data-v2-inv="' + esc(i.id) + '" aria-pressed="' + (i.id === IV.sel) + '">' + esc(i.id) +
        "</button></td><td>" + esc(i.period) + "</td><td>" + U.st(i.status, stLabel(i.status)) + "</td><td class='num'>" + U.krw(i.subtotal) +
        "</td><td class='num'>" + U.krw(i.vat) + "</td><td class='num'><b>" + U.krw(i.total) + "</b></td></tr>";
    });
    var listP = U.panel(L("청구서", "Invoices"), U.src(r[0]) + " · KRW · VAT 10%",
      U.table([L("청구서", "Invoice"), L("기간", "Period"), L("상태", "Status"), L("#공급가액", "#Subtotal"), "#VAT", L("#합계", "#Total")], rows, L("청구서 없음", "No invoices")));

    var detail = "";
    if (x) {
      var lr = (x.lines || []).map(function (l) {
        return "<tr><td>" + esc(l.product) + "</td><td>" + esc(l.metric) + "</td><td class='num'>" + fmt(l.quantity) + "</td><td class='num'>" +
          unitPrice(l.unit_price) + "</td><td class='num'>" + U.krw(l.amount) + "</td></tr>";
      });
      if (x.commitment_true_up) lr.push("<tr><td colspan=4>" + esc(L("약정 최소 금액 정산 (true-up)", "Commitment true-up")) + "</td><td class='num'>" + U.krw(x.commitment_true_up) + "</td></tr>");
      (x.sla_credits || []).forEach(function (c) {
        lr.push("<tr><td colspan=4>" + esc(L("SLA 크레딧 ", "SLA credit ")) + "<span class='id'>" + esc(c.credit_id) + "</span>" +
          (c.pct_of_monthly ? " · " + esc(c.pct_of_monthly) + "%" : "") + (c.incident_id ? " · " + esc(c.incident_id) : "") + "</td><td class='num'>−" + U.krw(c.amount) + "</td></tr>");
      });
      var acts = "";
      if (x.status === "finalized" && isAdmin())
        acts += '<button type="button" class="btn" data-v2-pay="' + esc(x.id) + '">' + esc(L("결제", "Pay")) + " " + U.krw(x.total) + "</button> ";
      if (x.status !== "draft")
        acts += '<button type="button" class="btn-ghost" data-v2-tax="' + esc(x.id) + '">' + esc(L("전자세금계산서 조회", "View e-tax invoice")) + "</button>";
      if (x.status === "draft") acts += '<p class="v2-note">' + esc(L("초안 — 월 마감 후 확정되면 결제와 세금계산서 발행이 열립니다.", "Draft — payment and the tax invoice open once it is finalized at month close.")) + "</p>";
      var taxData = IV.tax && IV.tax.data && IV.tax.data.invoice_id === x.id ? IV.tax.data : x.tax_invoice || null;
      var tax = taxData ? (V ? V.taxDoc(taxData, L) : "") + '<p class="v2-note">' + U.st(taxData.status || "issued") + " " + (IV.tax && IV.tax.data === taxData ? U.src(IV.tax) : "") + " " +
        esc(L("형식 모사 — 국세청 실연동 아님.", "Format simulation — not connected to the National Tax Service.")) + "</p>" : "";
      var pay = x.payment ? '<dl class="v2-kv" style="margin-top:10px"><dt>' + esc(L("결제 (PaymentIntent)", "Payment (PaymentIntent)")) + "</dt><dd class='id'>" + esc(x.payment.id) +
        "</dd><dt>" + esc(L("결과", "Result")) + "</dt><dd>" + U.st(x.payment.status === "succeeded" ? "paid" : x.payment.status, x.payment.status) + " · " + esc(x.payment.kind || (x.payment.payment_method_types || []).join(", ")) +
        " · " + U.krw(x.payment.amount_received != null ? x.payment.amount_received : x.payment.amount) + "</dd></dl>" : "";
      detail = U.panel(L("청구서 상세 — ", "Invoice detail — ") + x.id, U.src(d) + " · " + esc(x.period),
        (V ? V.steps(V.invoiceFlowSteps(x, L), L("청구서 진행 단계", "Invoice lifecycle")) : "") +
        '<div class="grid">' +
        '<div><h3 class="bv-sub">' + esc(L("청구 라인", "Line items")) + "</h3>" +
        U.table([L("상품", "Product"), L("지표", "Metric"), L("#수량", "#Qty"), L("#단가", "#Unit price"), L("#금액", "#Amount")], lr, L("라인 없음", "No lines")) + "</div>" +
        '<div><h3 class="bv-sub">' + esc(L("금액 흐름", "Amount flow")) + "</h3>" + (V ? V.waterfall(V.invoiceSteps(x, L), L) : "") +
        '<dl class="v2-kv" style="margin-top:10px"><dt>' + esc(L("상태", "Status")) + "</dt><dd>" + U.st(x.status, stLabel(x.status)) + (x.paid_at ? " · " + U.when(x.paid_at) : "") +
        "</dd>" + (x.price_book_version ? "<dt>" + esc(L("가격표 버전", "Price book")) + "</dt><dd>v" + esc(x.price_book_version) + "</dd>" : "") + "</dl></div></div>" +
        '<div class="v2-row" style="margin-top:10px">' + acts + "</div>" + pay + tax);
    }

    var pmList = r[1].data || [];
    var cards = pmList.map(function (p) {
      var num = p.last4 ? "•••• " + p.last4 : (p.label || p.kind);
      return '<div class="bv-pm' + (p.default ? " def" : "") + '"><span class="bv-pm-k">' + esc(p.kind === "card" ? L("카드", "Card") : p.kind === "bank_transfer" ? L("계좌 이체", "Bank transfer") : p.kind) +
        "</span><b>" + esc(num) + '</b><span class="id">' + esc(p.id) + (p.stripe_payment_method ? " · " + esc(p.stripe_payment_method) : "") + "</span>" +
        (p.default ? U.st("active", L("기본 결제 수단", "Default")) : "") + "</div>";
    }).join("");
    var pm = U.panel(L("결제 수단", "Payment methods"), U.src(r[1]) + " · " + esc(L("Stripe 형식 (테스트 모드 모사)", "Stripe format (test-mode simulation)")),
      (cards ? '<div class="bv-cards">' + cards + "</div>" : '<p class="v2-note">' + esc(L("등록된 결제 수단 없음", "No payment methods")) + "</p>") +
      (isAdmin() ? '<div class="v2-row" style="margin-top:10px">' +
        U.field("v2-pm-kind", L("종류", "Kind"), '<select id="v2-pm-kind"><option value="card">card</option><option value="bank_transfer">bank_transfer</option></select>') +
        U.field("v2-pm-token", L("결제 토큰 (PG 발급)", "Payment token (from PG)"), '<input id="v2-pm-token" placeholder="tok_visa_4242" autocomplete="off">') +
        '<button type="button" class="btn-ghost" id="v2-pm-add">' + esc(L("+ 등록", "+ Add")) + "</button></div>" : ""));
    root.innerHTML = (NC.v2demo ? NC.v2demo.host("invoice") : "") + hero + listP + detail + pm + raw(/\/billing\//);
  }

  /* ══ ③ SLA · 크레딧 · 자동 복구 ═════════════════════════════
     가용성 게이지(99.0–100% 확대) · 다운타임 예산 · 크레딧 구간 사다리 · 장애→크레딧→청구서 체인. */
  var SL = { month: null };
  async function renderSla() {
    var root = $("v2-sla-root"); if (!root) return;
    var tid = tenant(), ms = months(), V = BV();
    if (!SL.month) {          // 진행 중인 달에 다운타임·크레딧이 있으면 그 달, 없으면 지난달
      var cur = await A.slaReport(tid, ms[0]), c0 = cur.data || {};
      SL.month = (+c0.downtime_min || (c0.credits || []).length || (c0.incidents || []).length) ? ms[0] : ms[1];
    }
    var r = await Promise.all([A.slaReport(tid, SL.month), A.downtime(tid, SL.month), A.slaExceptions(), A.remRuns(tid), A.invoices(tid)]);
    var rep = r[0].data || {}, dts = r[1].data || [], exs = r[2].data || [], runs = r[3].data || [], invs = r[4].data || [];
    var monthSel = '<div class="v2-row"><div class="v2-f"><label for="v2-sla-month">' + esc(L("기간", "Period")) + '</label><select id="v2-sla-month">' +
      ms.map(function (m) { return '<option value="' + m + '"' + (m === SL.month ? " selected" : "") + ">" + m + (m === ms[0] ? L(" (진행 중)", " (in progress)") : "") + "</option>"; }).join("") +
      "</select></div>" + U.src(r[0]) + "</div>";
    /* 크레딧 금액은 청구서의 sla_credits 에서 찾는다(SLA 엔진은 % 만 계산) */
    function creditAmt(c) {
      if (c.amount != null) return +c.amount;
      var inv = invs.find(function (i) { return i.id === c.applied_invoice; }) || invs.find(function (i) { return (i.sla_credits || []).some(function (s) { return s.credit_id === c.credit_id; }); });
      var hit = inv && (inv.sla_credits || []).find(function (s) { return s.credit_id === c.credit_id; });
      return hit ? +hit.amount : null;
    }
    var credits = rep.credits || [], credit = credits[0] || rep.credit || null;
    var cAmt = credit ? creditAmt(credit) : null;
    var counted = rep.downtime_min != null ? +rep.downtime_min : dts.filter(function (x) { return !x.exception_id; }).reduce(function (s, x) { return s + (+x.minutes || 0); }, 0);
    var hero = "";
    if (V) {
      var b = V.budget(rep.target_pct || 99.9, rep.month || SL.month, counted), pct = V.creditFor(rep.availability_pct, rep.credit_table);
      hero = '<div class="bv-hero">' +
        U.panel(L("가용성 (SLA 99.9%)", "Availability (SLA 99.9%)"), esc(rep.month || SL.month),
          '<div class="grid">' + V.availGauge({ value: rep.availability_pct, target: rep.target_pct || 99.9, L: L }) +
          '<div><div class="bv-pair" style="margin-top:0"><div><div class="k">' + esc(L("반영 다운타임", "Counted downtime")) + '</div><div class="v' + (b.over ? " crit" : "") + '">' + fmt(counted, 1) +
          "<small> " + esc(L("분", "min")) + "</small></div></div>" +
          '<div><div class="k">' + esc(L("예외 제외", "Excluded")) + '</div><div class="v">' + fmt(rep.exceptions_minutes, 1) + "<small> " + esc(L("분", "min")) + "</small></div></div>" +
          '<div><div class="k">' + esc(L("크레딧", "Credit")) + '</div><div class="v credit">' + (pct ? pct + "%" : "—") + (cAmt ? " · −" + U.krw(cAmt) : "") + "</div></div></div>" +
          '<h3 class="bv-sub">' + esc(L("월 다운타임 예산", "Monthly downtime budget")) + "</h3>" + V.budgetBar(b, L) +
          '<p class="v2-note">' + esc(L("99.9% = 한 달 ", "99.9% = ")) + fmt(b.allowed, 1) + esc(L("분까지 허용. 감축·계획 점검은 계약 조항에 따라 제외.", " min allowed per month. Curtailment and planned maintenance are excluded per contract clause.")) + "</p></div></div>") +
        U.panel(L("크레딧 구간", "Credit tiers"), esc(L("월 요금 대비 %", "% of monthly fee")), V.ladder(rep.availability_pct, rep.credit_table, L)) + "</div>";
    }
    /* 체인: 장애 → 다운타임 → 가용성 → 크레딧 → 청구서 차감 */
    var inc = (rep.incidents || [])[0], run = runs[0];
    var chain = U.panel(L("장애 → 보상 흐름", "Incident → compensation flow"), esc(L("자동 복구 · SLA 엔진 · 청구", "auto-recovery · SLA engine · billing")),
      '<ol class="bv-chain">' +
      '<li class="' + (inc ? "hit" : "good") + '"><b>' + esc(L("장애", "Incident")) + "</b>" + (inc ? '<span class="id">' + esc(inc.id) + "</span> · " + esc(inc.severity || "") : esc(L("없음", "none"))) + "</li>" +
      '<li class="' + (run ? "good" : "") + '"><b>' + esc(L("자동 복구", "Auto-recovery")) + "</b>" + (run ? esc(run.outcome === "replaced" ? L("교체", "replaced") : run.outcome === "recovered" ? L("복구", "recovered") : run.outcome || L("진행 중", "in progress")) +
        (run.mttr_min != null ? " · MTTR " + fmt(run.mttr_min) + esc(L("분", " min")) : "") : "—") + "</li>" +
      '<li class="' + (counted ? "hit" : "good") + '"><b>' + esc(L("다운타임", "Downtime")) + "</b>" + fmt(counted, 1) + esc(L("분 반영", " min counted")) + "</li>" +
      '<li class="' + (rep.violated ? "hit" : "good") + '"><b>' + esc(L("가용성", "Availability")) + "</b>" + (rep.availability_pct != null ? fmt(rep.availability_pct, 3) + "%" : "—") +
        " · " + (rep.violated ? "▲ " + esc(L("위반", "violated")) : "● " + esc(L("충족", "met"))) + "</li>" +
      '<li class="' + (credit ? "good" : "") + '"><b>' + esc(L("크레딧", "Credit")) + "</b>" + (credit ? '<span class="id">' + esc(credit.credit_id || "") + "</span> · " + esc(credit.pct_of_monthly || "") + "%" : "—") + "</li>" +
      '<li class="' + (credit && credit.applied_invoice ? "good" : "") + '"><b>' + esc(L("청구서 차감", "Applied to invoice")) + "</b>" +
        (credit && credit.applied_invoice ? '<a href="#/invoices" class="id">' + esc(credit.applied_invoice) + "</a>" + (cAmt ? " · −" + U.krw(cAmt) : "") : esc(L("다음 청구서", "next invoice"))) + "</li></ol>");

    var dtRows = dts.map(function (x) {
      return "<tr><td class='id'>" + esc(x.instance_id || x.node_id || x.rack_id || "—") + "</td><td>" + U.when(x.start) + "</td><td>" + U.when(x.end) + "</td><td class='num'>" +
        fmt(x.minutes != null ? x.minutes : x.downtime_min, 1) + "</td><td>" + esc(x.cause || x.reason || "") + "</td><td>" + (x.exception_id ? U.st("excluded", L("제외 ", "excluded ") + x.exception_id) : U.st("counted", L("반영", "counted"))) + "</td></tr>";
    });
    var crRows = credits.map(function (c) {
      var a = creditAmt(c);
      return "<tr><td class='id'>" + esc(c.credit_id) + "</td><td>" + esc(c.month || rep.month) + "</td><td class='num'>" +
        (a != null ? U.krw(a) : c.amount_usd ? "$" + fmt(c.amount_usd, 2) : "—") + "</td><td class='num'>" + fmt(c.pct_of_monthly) + "%</td><td>" + U.st(c.status) +
        "</td><td class='id'>" + esc(c.applied_invoice || "—") + "</td></tr>";
    });
    var exRows = exs.map(function (x) {
      var sc = x.scope || {};
      return "<tr><td class='id'>" + esc(x.id) + "</td><td>" + esc(x.kind) + "</td><td>" + U.when(x.start) + " → " + U.when(x.end) + "</td><td>" +
        esc(sc.site || (sc.racks || []).join(", ") || (sc.tenants || []).join(", ") || "—") + "</td><td>" + esc(x.contract_clause || "") + "</td></tr>";
    });
    var runRows = runs.map(function (x) {
      return "<tr><td class='id'>" + esc(x.id) + "</td><td class='id'>" + esc(x.target && x.target.machine_id) + "</td><td>" + esc(x.trigger && x.trigger.kind) +
        "</td><td>" + U.st(x.outcome || "running", x.outcome === "replaced" ? L("교체됨", "Replaced") : x.outcome === "recovered" ? L("복구됨", "Recovered") : x.outcome || L("진행 중", "In progress")) +
        "</td><td class='num'>" + (x.mttr_min != null ? fmt(x.mttr_min) + L("분", " min") : "—") + "</td></tr>";
    });
    root.innerHTML = (NC.v2demo ? NC.v2demo.host("sla") : "") + monthSel + hero + chain +
      U.panel(L("다운타임 (노드·분 단위 귀속)", "Downtime (attributed per node-minute)"), U.src(r[1]),
        U.table([L("인스턴스", "Instance"), L("시작", "Start"), L("종료", "End"), L("#분", "#Min"), L("원인", "Cause"), L("가용성 반영", "Availability")], dtRows, L("다운타임 없음", "No downtime"))) +
      '<div class="grid">' +
      U.panel(L("SLA 크레딧", "SLA credits"), U.src(r[0]),
        U.table(["ID", L("기간", "Period"), L("#금액", "#Amount"), L("#월 요금 대비", "#Of monthly"), L("상태", "Status"), L("차감 청구서", "Invoice")], crRows, L("크레딧 없음", "No credits"))) +
      U.panel(L("예외 구간", "Exception windows"), U.src(r[2]),
        U.table(["ID", L("유형", "Kind"), L("구간", "Window"), L("범위", "Scope"), L("계약 조항", "Clause")], exRows, L("예외 없음", "No exceptions"))) + "</div>" +
      U.panel(L("자동 복구 기록", "Auto-recovery history"), U.src(r[3]),
        U.table([L("실행", "Run"), L("노드", "Node"), L("원인", "Trigger"), L("결과", "Outcome"), "#MTTR"], runRows, L("복구 실행 없음", "No runs"))) +
      raw(/\/sla|sla-report|remediation/);
  }

  /* ══ ④ 조직 · IAM · SSO ═════════════════════════════════════
     온보딩 단계(가입 → 이메일 검증 → 조직 활성 → 약정 계약 → 첫 청구서) · 역할 권한표 · SSO · OIDC. */
  var IAM = { tok: null };
  async function renderIam() {
    var root = $("v2-iam-root"); if (!root) return;
    var tid = tenant(), V = BV();
    var r = await Promise.all([A.sso(tid), A.members(), A.oidcConfig(), A.contracts(tid), A.invoices(tid)]);
    var sso = r[0].data || {}, mem = r[1].data || [], oc = r[2].data || {}, ctrs = r[3].data || [], invs = r[4].data || [];
    var s = sess() || {}, role = s.role === "owner" ? "admin" : (s.role || "admin");
    var actC = ctrs.filter(function (c) { return c.status === "active"; });
    var onboard = V ? U.panel(L("가입 → 청구 흐름", "Sign-up → billing flow"), esc(tid),
      V.steps([
        { label: L("웹 가입", "Web sign-up"), sub: L("사업자 · 담당자", "business · contact"), state: "done" },
        { label: L("이메일 검증", "Email verified"), sub: "POST /signup/{id}/verify", state: "done" },
        { label: L("조직 활성", "Organization active"), sub: L("역할 ", "role ") + role, state: "done" },
        { label: L("약정 계약", "Reserved contract"), sub: actC.length ? actC[0].id + " · " + (actC[0].racks ? actC[0].racks + L("랙", " racks") : actC[0].product) : invs.length ? L("온디맨드 이용 중 · 약정은 선택", "on-demand · contract optional") : L("영업 담당과 체결", "signed with sales"),
          state: actC.length ? "done" : ctrs.length ? "current" : "todo" },
        { label: L("첫 청구서", "First invoice"), sub: invs.length ? invs[invs.length - 1].id : L("월 마감 후", "after month close"), state: invs.length ? "done" : actC.length ? "current" : "todo" }
      ], L("온보딩 단계", "Onboarding steps")) +
      '<p class="v2-note"><a href="signup.html">' + esc(L("새 조직 가입 →", "Sign up a new organization →")) + "</a></p>") : "";
    var org = U.panel(L("조직", "Organization"), esc(tid),
      '<dl class="v2-kv"><dt>' + esc(L("테넌트", "Tenant")) + "</dt><dd class='id'>" + esc(tid) + "</dd><dt>" + esc(L("조직명", "Name")) + "</dt><dd>" + esc(s.tenant_name || tid) +
      "</dd><dt>" + esc(L("내 역할", "My role")) + "</dt><dd>" + U.st("active", role) + "</dd><dt>" + esc(L("약정 계약", "Contracts")) + "</dt><dd>" +
      fmt(actC.length) + " / " + fmt(ctrs.length) + " " + U.src(r[3]) + "</dd></dl>" + (V ? '<h3 class="bv-sub">' + esc(L("역할별 권한", "Permissions by role")) + "</h3>" + V.roleMatrix(L, role) : ""));
    var mrows = (Array.isArray(mem) ? mem : []).map(function (m) {
      return "<tr><td>" + esc(m.email) + "</td><td>" + esc(m.role) + "</td><td>" + U.st(m.state || "active") + "</td></tr>";
    });
    var members = U.panel(L("멤버 · 역할", "Members · roles"), U.src(r[1]),
      U.table([L("이메일", "Email"), L("역할", "Role"), L("상태", "State")], mrows, L("멤버 없음", "No members")) +
      '<p class="v2-note">' + esc(L("초대·역할 변경은 설정 화면에서 합니다.", "Invite and change roles on the Settings screen.")) + ' <a href="#/settings">' + esc(L("설정 →", "Settings →")) + "</a></p>");
    var ssoP = U.panel(L("SSO (고객 IdP 연동)", "SSO (your IdP)"), U.src(r[0]),
      '<div class="v2-row">' + U.field("v2-sso-iss", "issuer_url", '<input id="v2-sso-iss" placeholder="https://login.example.com/realms/corp" value="' + esc(sso.issuer_url || "") + '"' + (isAdmin() ? "" : " disabled") + ">") +
      U.field("v2-sso-cid", "client_id", '<input id="v2-sso-cid" placeholder="neocloud-console" value="' + esc(sso.client_id || "") + '"' + (isAdmin() ? "" : " disabled") + ">") +
      (isAdmin() ? '<button type="button" class="btn" id="v2-sso-save">' + esc(L("저장", "Save")) + "</button>" : "") + "</div>" +
      '<p class="v2-note">' + esc(L("상태: ", "Status: ")) + U.st(sso.enabled ? "active" : "draft", sso.enabled ? L("사용 중", "Enabled") : L("미설정", "Not configured")) + "</p>");
    var claims = IAM.tok && IAM.tok.data ? (IAM.tok.data.claims || decodeJwt(IAM.tok.data.access_token)) : null;
    var oidc = U.panel(L("OIDC · JWT", "OIDC · JWT"), U.src(r[2]),
      '<dl class="v2-kv"><dt>issuer</dt><dd class="id">' + esc(oc.issuer) + "</dd><dt>token_endpoint</dt><dd class='id'>" + esc(oc.token_endpoint) +
      "</dd><dt>jwks_uri</dt><dd class='id'>" + esc(oc.jwks_uri) + "</dd><dt>grant_types</dt><dd>" + esc((oc.grant_types_supported || []).join(", ")) + "</dd></dl>" +
      '<div class="v2-row" style="margin-top:10px">' + U.field("v2-oidc-cid", "client_id", '<input id="v2-oidc-cid" value="' + esc(tid) + '-ci">') +
      U.field("v2-oidc-sec", "client_secret", '<input id="v2-oidc-sec" type="password" autocomplete="off">') +
      '<button type="button" class="btn-ghost" id="v2-oidc-try">' + esc(L("토큰 발급 시험 (client_credentials)", "Test token (client_credentials)")) + "</button></div>" +
      (IAM.tok ? (IAM.tok.error ? '<p class="v2-note" role="status">' + U.st("failed", String(IAM.tok.status || "")) + " " + esc(IAM.tok.error) + "</p>"
        : '<div class="v2-out" role="status">' + esc(JSON.stringify(claims, null, 2)) + "</div><p class='v2-note'>" + U.src(IAM.tok) + " · expires_in " + esc(IAM.tok.data.expires_in) + "s</p>") : "") +
      '<p class="v2-note">' + esc(L("기존 HMAC 토큰과 JWT 를 함께 받습니다.", "Existing HMAC tokens and JWTs are both accepted.")) + "</p>");
    root.innerHTML = (NC.v2demo ? NC.v2demo.host("signup") : "") + onboard + '<div class="grid">' + org + ssoP + "</div>" + members + oidc;
  }
  function decodeJwt(t) {
    try { return JSON.parse(atob(String(t).split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); } catch (e) { return { token: String(t || "").slice(0, 24) + "…" }; }
  }
  /* ── 이벤트 ─────────────────────────────────────────────── */
  document.addEventListener("click", async function (e) {
    var t = e.target.closest && e.target.closest("#v2-key-create,[data-v2-revoke],[data-v2-usekey],#v2-pg-send,[data-v2-inv],[data-v2-pay],[data-v2-tax],#v2-pm-add,#v2-sso-save,#v2-oidc-try");
    if (!t) return;
    if (t.id === "v2-key-create") {
      var nm = ($("v2-key-name") || {}).value;
      if (!nm || !nm.trim()) return U.toast(L("키 이름을 입력하세요", "Enter a key name"), "warn");
      var r = await A.apiKeyCreate({ name: nm.trim(), scope: "inference" });
      if (r.error) return U.toast(L("실패: ", "Failed: ") + r.error, "warn");
      TK.secret = r.data && r.data.secret;
      U.toast(L("키 발급 — ", "Key issued — ") + nm + (r.live ? "" : " (MOCK)"));
      return renderToken();
    }
    if (t.dataset.v2Revoke) {
      var r2 = await A.apiKeyRevoke(t.dataset.v2Revoke);
      U.toast(r2.error ? L("실패: ", "Failed: ") + r2.error : L("키 폐기 — ", "Key revoked — ") + t.dataset.v2Revoke + (r2.live ? "" : " (MOCK)"), r2.error ? "warn" : "");
      return renderToken();
    }
    if (t.dataset.v2Usekey) { TK.key = TK.secret || ""; TK.secret = null; return renderToken(); }
    if (t.id === "v2-pg-send") return sendPlay();
    if (t.dataset.v2Inv) { IV.sel = t.dataset.v2Inv; IV.tax = null; return renderInvoices(); }
    if (t.dataset.v2Pay) {
      var r3 = await A.invoicePay(t.dataset.v2Pay, {});
      U.toast(r3.error ? L("실패: ", "Failed: ") + r3.error : L("결제 완료 — ", "Paid — ") + t.dataset.v2Pay + (r3.live ? "" : " (MOCK)"), r3.error ? "warn" : "");
      return renderInvoices();
    }
    if (t.dataset.v2Tax) { IV.tax = await A.taxInvoice(t.dataset.v2Tax); return renderInvoices(); }
    if (t.id === "v2-pm-add") {
      var tokv = ($("v2-pm-token") || {}).value;
      if (!tokv) return U.toast(L("결제 토큰을 입력하세요", "Enter a payment token"), "warn");
      var r4 = await A.paymentMethodAdd({ tenant_id: tenant(), kind: $("v2-pm-kind").value, token: tokv });
      U.toast(r4.error ? L("실패: ", "Failed: ") + r4.error : L("결제 수단 등록", "Payment method added") + (r4.live ? "" : " (MOCK)"), r4.error ? "warn" : "");
      return renderInvoices();
    }
    if (t.id === "v2-sso-save") {
      var r5 = await A.ssoPut(tenant(), { issuer_url: $("v2-sso-iss").value.trim(), client_id: $("v2-sso-cid").value.trim() });
      U.toast(r5.error ? L("실패: ", "Failed: ") + r5.error : L("SSO 저장", "SSO saved") + (r5.live ? "" : " (MOCK)"), r5.error ? "warn" : "");
      return renderIam();
    }
    if (t.id === "v2-oidc-try") {
      IAM.tok = await A.oauthToken({ grant_type: "client_credentials", client_id: $("v2-oidc-cid").value, client_secret: $("v2-oidc-sec").value, scope: "openid" });
      return renderIam();
    }
  });
  document.addEventListener("change", function (e) {
    if (e.target.id === "v2-sla-month") { SL.month = e.target.value; renderSla(); }
    if (/^v2-pg-/.test(e.target.id || "")) readPlay();
  });
  document.addEventListener("keydown", function (e) {
    if (e.target.id === "v2-pg-prompt" && e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendPlay(); }
  });

  var R = { token: renderToken, invoices: renderInvoices, sla: renderSla, iam: renderIam };
  NC.v2Customer = R;
  U.onRoute(R);
})();
