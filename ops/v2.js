/* 운영 콘솔 v2 Phase 1 화면 — 자동 복구 타임라인(F10) · 토큰 쿼터·SLO·배포·대조(F01·F02·F04) · 청구 실행(F05) · 가입 승인·SLA 예외(F07·F09).
   데이터: NC.v2 (shared/v2-api.js) — NOCP 라이브 우선, 실패 시 MOCK 배지. 운영자 헤더는 shared/nocp-auth.js.
   라우트: #/v2-recovery · #/v2-token · #/v2-billing · #/v2-accounts (NC.bus "route" — ops/app.js NC.start 맵 수정 없음).
   흐름 기준: NVSentinel fault-quarantine → node-drainer → fault-remediation (ref/upstream/nvsentinel), 단계 이름은 계약 F10. */
(function () {
  var NC = window.NC = window.NC || {};
  var A = NC.v2, U = NC.v2ui;
  if (!A || !U) return;
  var L = U.L, esc = U.esc, fmt = U.fmt, $ = U.$;
  function demo(id) { return NC.v2demo ? NC.v2demo.host(id) : ""; }
  var STEP_LABEL = { cordon: ["cordon", "cordon"], drain: ["drain", "drain"], gpu_reset: ["GPU reset", "GPU reset"], revalidate: ["재검증", "revalidate"],
    replace: ["예비 노드 교체", "replace"], isolate_sanitize: ["격리·소거", "isolate · sanitize"], rma: ["RMA 생성", "RMA"], return_to_pool: ["재투입", "return to pool"] };

  /* ══ ① 자동 복구 ═══════════════════════════════════════════ */
  var RC = { sel: null };
  async function renderRecovery() {
    var root = $("v2-recovery-root"); if (!root) return;
    var r = await Promise.all([A.remPolicy(), A.remRuns()]);
    var pol = r[0].data || {}, runs = r[1].data || [];
    if (!RC.sel && runs[0]) RC.sel = runs[0].id;
    var done = runs.filter(function (x) { return x.mttr_min != null; });
    var avg = done.length ? done.reduce(function (s, x) { return s + x.mttr_min; }, 0) / done.length : null;
    var kpiMin = pol.kpi_replace_minutes || 60;
    var within = done.filter(function (x) { return x.mttr_min <= kpiMin; }).length;
    var kp = '<div class="kpi-band">' +
      U.kpi(L("정책 모드", "Policy mode"), esc(pol.mode || "—"), pol.mode === "auto" ? L("자동 조치", "automatic actions") : L("모니터링만 (기본)", "monitor only (default)"), pol.mode === "auto" ? "green" : "amber") +
      U.kpi(L("진행 중", "In progress"), fmt(runs.length - done.length), L("실행", "runs")) +
      U.kpi(L("평균 MTTR", "Avg MTTR"), avg != null ? fmt(avg, 1) + "<small>" + esc(L("분", "min")) + "</small>" : "—", L("목표 ≤", "target ≤") + kpiMin + L("분", " min")) +
      U.kpi(L("목표 내 복구", "Within target"), done.length ? fmt(within) + "<small> / " + fmt(done.length) + "</small>" : "—", "") +
      U.kpi(L("교체 · RMA", "Replaced · RMA"), fmt(runs.filter(function (x) { return x.outcome === "replaced"; }).length), "") + "</div>";
    var acts = pol.actions || {};
    var polP = U.panel(L("복구 정책", "Remediation policy"), U.src(r[0]),
      '<div class="v2-row">' + U.field("v2-rp-mode", "mode", '<select id="v2-rp-mode"><option value="monitor"' + (pol.mode !== "auto" ? " selected" : "") +
        '>monitor</option><option value="auto"' + (pol.mode === "auto" ? " selected" : "") + ">auto</option></select>") +
      ["cordon", "drain", "gpu_reset", "replace", "rma"].map(function (k) {
        return '<div class="v2-f"><label for="v2-rp-' + k + '">' + esc(k) + '</label><input type="checkbox" id="v2-rp-' + k + '"' + (acts[k] !== false ? " checked" : "") + "></div>";
      }).join("") +
      U.field("v2-rp-par", L("랙당 동시 실행", "Per-rack parallel"), '<input id="v2-rp-par" type="number" min="1" max="4" value="' + esc(pol.max_parallel_per_rack || 1) + '">') +
      U.field("v2-rp-kpi", L("교체 목표(분)", "Replace target (min)"), '<input id="v2-rp-kpi" type="number" min="5" max="480" value="' + esc(kpiMin) + '">') +
      '<button type="button" class="btn" id="v2-rp-save">' + esc(L("정책 저장", "Save policy")) + "</button></div>" +
      '<p class="v2-note">' + esc(L("기본은 모니터링만 — 격리·복구는 opt-in. 흐름: fault-quarantine(cordon) → node-drainer(drain) → fault-remediation(reset/교체).",
        "Default is monitor-only — isolation and repair are opt-in. Flow: fault-quarantine (cordon) → node-drainer (drain) → fault-remediation (reset / replace).")) + "</p>");
    var inj = U.panel(L("장애 주입 · 수동 시작", "Fault injection · manual start"), L("운영자", "operator"),
      '<div class="v2-row">' + U.field("v2-rr-m", "machine_id", '<input id="v2-rr-m" placeholder="gasan-f2-r05-t07" value="gasan-f2-r05-t07">') +
      U.field("v2-rr-why", L("사유", "Reason"), '<select id="v2-rr-why"><option>XID 79</option><option>XID 48 DBE</option><option>NVLink CRC</option><option>SEL PSU</option><option>leak</option></select>') +
      '<button type="button" class="btn" id="v2-rr-go">' + esc(L("주입 → 복구 시작", "Inject → start")) + "</button></div>");
    var rows = runs.map(function (x) {
      var out = x.outcome || "running";
      return '<tr><td class="id"><button type="button" class="btn-ghost" data-v2-run="' + esc(x.id) + '" aria-pressed="' + (x.id === RC.sel) + '">' + esc(x.id) + "</button></td><td class='id'>" +
        esc(x.target && x.target.machine_id) + "</td><td>" + esc(x.target && x.target.tenant_id || "—") + "</td><td>" + esc(x.trigger && x.trigger.kind) + "</td><td>" + U.when(x.started_at) +
        "</td><td>" + U.st(out) + "</td><td class='num'>" + (x.mttr_min != null ? fmt(x.mttr_min) : "—") + "</td><td class='id'>" + esc(x.rma_id || "—") + "</td></tr>";
    });
    var list = U.panel(L("복구 실행", "Remediation runs"), U.src(r[1]),
      U.table([L("실행", "Run"), "machine", L("테넌트", "Tenant"), L("원인", "Trigger"), L("시작", "Started"), L("결과", "Outcome"), "#MTTR", "RMA"], rows, L("실행 없음", "No runs")));
    var tl = "";
    var sel = runs.find(function (x) { return x.id === RC.sel; });
    if (sel) {
      var ds = A.runDurations(sel);
      var names = ds.map(function (d) { return d.name; });
      var future = A.REM_STEPS.filter(function (n) { return names.indexOf(n) < 0 && (sel.outcome == null || sel.outcome === "replaced"); });
      tl = U.panel(L("타임라인 — ", "Timeline — ") + sel.id, esc(sel.target && sel.target.machine_id) + " · " + U.st(sel.outcome || "running"),
        '<ol class="v2-tl">' + ds.map(function (d) {
          var lb = STEP_LABEL[d.name] || [d.name, d.name];
          return '<li class="' + esc(d.state) + '"><b>' + esc(L(lb[0], lb[1])) + "</b>" + esc(U.when(d.at).slice(11)) + (d.minutes != null ? " · +" + d.minutes + L("분", "m") : "") + "</li>";
        }).join("") + (sel.outcome == null ? future.map(function (n) {
          var lb = STEP_LABEL[n] || [n, n]; return '<li><b>' + esc(L(lb[0], lb[1])) + "</b>" + esc(L("대기", "pending")) + "</li>";
        }).join("") : "") + "</ol>" +
        '<p class="v2-note">' + esc(L("이벤트 토픽 health: RemediationStarted · StepDone · Completed", "Event topic health: RemediationStarted · StepDone · Completed")) + "</p>");
    }
    root.innerHTML = demo("auto-recovery") + kp + '<div class="grid">' + polP + inj + "</div>" + tl + list;
  }

  /* ══ ② 토큰 · 쿼터 · SLO ═══════════════════════════════════ */
  async function renderToken() {
    var root = $("v2-tokenops-root"); if (!root) return;
    var r = await Promise.all([A.deployments(), A.quotas(), A.models(), A.reconcile()]);
    var deps = r[0].data || [], quotas = r[1].data || [], models = r[2].data || [], rec = r[3].data || {};
    var slos = await Promise.all(models.map(function (m) { return A.slo(m.id, "1h"); }));
    var sloRows = slos.map(function (s) {
      var d = s.data || {}, t = d.target || A.SLO_TARGET;
      return "<tr><td class='id'>" + esc(d.model) + "</td><td class='num'>" + fmt(d.ttft_p99_ms) + "</td><td class='num'>" + fmt(t.ttft_p99_ms) + "</td><td class='num'>" +
        fmt(d.tpot_p99_ms) + "</td><td class='num'>" + fmt(t.tpot_p99_ms) + "</td><td>" + U.st(d.breach ? "breach" : "ok", d.breach ? L("위반", "Breach") : L("정상", "OK")) + "</td></tr>";
    });
    var depRows = deps.map(function (d) {
      return "<tr><td class='id'>" + esc(d.model) + "</td><td>" + esc(d.engine || "dynamo") + " · " + esc(d.mode) + "</td><td class='num'>" + fmt(d.prefill_workers) +
        "</td><td class='num'>" + fmt(d.decode_workers) + "</td><td>" + esc((d.racks || []).join(", ")) + "</td><td class='num'>" + fmt(d.gpus) + "</td><td>" + U.st(d.state) + "</td></tr>";
    });
    var qRows = quotas.map(function (q) {
      return "<tr><td class='id'>" + esc(q.tenant_id) + "</td><td>" + esc(q.tier) + "</td><td class='num'>" + U.big(q.tpm) + "</td><td>" + U.bar(q.tpm ? (q.used_tpm || 0) / q.tpm : 0) +
        "</td><td class='num'>" + fmt(q.rpm) + "</td><td>" + U.bar(q.rpm ? (q.used_rpm || 0) / q.rpm : 0) + "</td><td class='num'>" + (q.monthly_token_cap ? U.big(q.monthly_token_cap) : "—") + "</td></tr>";
    });
    var tenants = Array.from(new Set(quotas.map(function (q) { return q.tenant_id; })));
    var tOpts = tenants.map(function (t) { return "<option>" + esc(t) + "</option>"; }).join("");
    root.innerHTML = demo("token-api") +
      U.panel(L("추론 SLO (TTFT·TPOT p99)", "Inference SLO (TTFT · TPOT p99)"), U.src(slos[0] || r[2]) + " · " + L("기준 TTFT p99 ≤2 s · TPOT p99 ≤50 ms", "target TTFT p99 ≤2 s · TPOT p99 ≤50 ms"),
        U.table([L("모델", "Model"), "#TTFT p99 ms", L("#목표", "#Target"), "#TPOT p99 ms", L("#목표", "#Target"), L("판정", "Verdict")], sloRows, "—")) +
      U.panel(L("엔진 배포 (Dynamo)", "Engine deployments (Dynamo)"), U.src(r[0]),
        U.table([L("모델", "Model"), L("엔진·모드", "Engine · mode"), "#prefill", "#decode", L("랙", "Racks"), "#GPU", L("상태", "State")], depRows, "—")) +
      U.panel(L("쿼터 (테넌트·등급)", "Quotas (tenant · tier)"), U.src(r[1]),
        U.table([L("테넌트", "Tenant"), L("등급", "Tier"), "#TPM", L("TPM 사용률", "TPM used"), "#RPM", L("RPM 사용률", "RPM used"), L("#월 상한", "#Monthly cap")], qRows, "—") +
        '<div class="v2-row" style="margin-top:10px">' + U.field("v2-q-t", L("테넌트", "Tenant"), '<select id="v2-q-t">' + tOpts + "</select>") +
        U.field("v2-q-tier", L("등급", "Tier"), '<select id="v2-q-tier"><option>interactive</option><option>batch</option></select>') +
        U.field("v2-q-tpm", "TPM", '<input id="v2-q-tpm" type="number" min="1" value="2000000">') + U.field("v2-q-rpm", "RPM", '<input id="v2-q-rpm" type="number" min="1" value="600">') +
        '<button type="button" class="btn" id="v2-q-save">' + esc(L("쿼터 저장", "Save quota")) + "</button>" +
        U.field("v2-q-f", L("감축 배수", "Override factor"), '<input id="v2-q-f" type="number" step="0.1" min="0" max="1" value="0.3">') +
        '<button type="button" class="btn-ghost" id="v2-q-ovr">' + esc(L("batch 감축 주입 (1시간)", "Inject batch override (1 h)")) + "</button></div>") +
      U.panel(L("계측 대조 (게이트웨이 대 엔진)", "Metering reconcile (gateway vs engine)"), U.src(r[3]),
        '<dl class="v2-kv"><dt>' + esc(L("기간", "Period")) + "</dt><dd>" + esc(rec.period) + "</dd><dt>gateway_tokens</dt><dd>" + fmt(rec.gateway_tokens) + "</dd><dt>engine_tokens</dt><dd>" +
        fmt(rec.engine_tokens) + "</dd><dt>diff_pct</dt><dd>" + U.st(rec.diff_pct > 0.5 ? "warn" : "ok", fmt(rec.diff_pct, 3) + "%") + "</dd><dt>mismatches</dt><dd class='id'>" +
        esc((rec.mismatches || []).join(", ") || "—") + "</dd></dl>");
  }

  /* ══ ③ 청구 실행 ═════════════════════════════════════════ */
  var BL = { period: null };
  async function renderBilling() {
    var root = $("v2-billing-root"); if (!root) return;
    if (!BL.period) BL.period = new Date().toISOString().slice(0, 7);
    var r = await Promise.all([A.invoices(null, null), A.priceBook()]);
    var inv = (r[0].data || []).slice().sort(function (a, b) { return String(b.period).localeCompare(String(a.period)); });
    var pb = r[1].data || {};
    var rows = inv.map(function (x) {
      return "<tr><td class='id'>" + esc(x.id) + "</td><td class='id'>" + esc(x.tenant_id) + "</td><td>" + esc(x.period) + "</td><td>" + U.st(x.status) + "</td><td class='num'>" +
        U.krw(x.subtotal) + "</td><td class='num'>" + U.krw(x.vat) + "</td><td class='num'><b>" + U.krw(x.total) + "</b></td><td>" +
        (x.status === "draft" ? '<button type="button" class="btn-ghost" data-v2-fin="' + esc(x.id) + '">' + esc(L("확정", "Finalize")) + "</button>" : "") + "</td></tr>";
    });
    var pbRows = (pb.items || []).map(function (i) {
      return "<tr><td>" + esc(i.product) + "</td><td>" + esc(i.metric) + "</td><td>" + esc(i.model || "—") + "</td><td>" + esc(i.token_type || "—") + "</td><td>" +
        esc(i.tier || "—") + "</td><td>" + esc(i.commitment || "—") + "</td><td class='num'>" + (i.unit_price < 1 ? "₩" + esc(i.unit_price) : U.krw(i.unit_price)) + "</td></tr>";
    });
    var total = inv.filter(function (x) { return x.period === BL.period; }).reduce(function (s, x) { return s + (x.total || 0); }, 0);
    root.innerHTML = demo("billing-run") +
      '<div class="kpi-band">' + U.kpi(L("청구서", "Invoices"), fmt(inv.length), "") + U.kpi(L("이번 달 합계", "This month total"), U.krw(total), esc(BL.period)) +
      U.kpi(L("미확정", "Draft"), fmt(inv.filter(function (x) { return x.status === "draft"; }).length), "") +
      U.kpi(L("결제 완료", "Paid"), fmt(inv.filter(function (x) { return x.status === "paid"; }).length), "") + "</div>" +
      U.panel(L("월 청구 실행", "Monthly billing run"), "POST /api/v1/billing/invoices:run",
        '<div class="v2-row">' + U.field("v2-bl-per", L("기간", "Period"), '<input id="v2-bl-per" type="month" value="' + esc(BL.period) + '">') +
        '<button type="button" class="btn" id="v2-bl-run">' + esc(L("청구 실행 (멱등)", "Run billing (idempotent)")) + "</button></div>") +
      U.panel(L("청구서 (전 테넌트)", "Invoices (all tenants)"), U.src(r[0]) + " · KRW",
        U.table([L("청구서", "Invoice"), L("테넌트", "Tenant"), L("기간", "Period"), L("상태", "Status"), L("#공급가액", "#Subtotal"), "#VAT", L("#합계", "#Total"), ""], rows, L("청구서 없음", "No invoices"))) +
      U.panel(L("요율표", "Price book"), U.src(r[1]) + " · " + esc(pb.currency || "KRW"),
        U.table([L("상품", "Product"), L("지표", "Metric"), L("모델", "Model"), L("토큰 유형", "Token type"), L("등급", "Tier"), L("약정", "Commitment"), L("#단가", "#Unit price")], pbRows, "—"));
  }

  /* ══ ④ 가입 승인 · SLA 예외 ═══════════════════════════════ */
  async function renderAccounts() {
    var root = $("v2-accounts-root"); if (!root) return;
    var r = await Promise.all([A.signups(), A.slaExceptions()]);
    var ts = r[0].data || [], exs = r[1].data || [];
    var pend = ts.filter(function (t) { return t.status === "pending_verification"; });
    var trows = ts.map(function (t) {
      return "<tr><td class='id'>" + esc(t.tenant_id || t.id) + "</td><td>" + esc(t.org_name || t.name || "") + "</td><td class='id'>" + esc(t.business_reg_no || "—") + "</td><td>" +
        (t.public_sector ? U.st("enforce", L("공공 · 가드 enforce", "Public · guard enforce")) : "") + "</td><td>" + U.st(t.status || "active") + "</td><td>" +
        (t.status === "pending_verification" ? '<button type="button" class="btn" data-v2-verify="' + esc(t.tenant_id || t.id) + '">' + esc(L("사업자 확인 → 활성", "Verify → activate")) + "</button>" : "") + "</td></tr>";
    });
    var erows = exs.map(function (x) {
      var sc = x.scope || {};
      return "<tr><td class='id'>" + esc(x.id) + "</td><td>" + esc(x.kind) + "</td><td>" + U.when(x.start) + " → " + U.when(x.end) + "</td><td>" +
        esc(sc.site || (sc.racks || []).join(", ") || (sc.tenants || []).join(", ") || "—") + "</td><td>" + esc(x.contract_clause || "") + "</td></tr>";
    });
    root.innerHTML = demo("signup") +
      U.panel(L("가입 승인 대기", "Sign-ups awaiting verification"), U.src(r[0]) + " · " + fmt(pend.length) + L("건 대기", " pending"),
        U.table([L("테넌트", "Tenant"), L("조직", "Organization"), L("사업자번호", "Business reg. no."), "", L("상태", "Status"), ""], trows, L("테넌트 없음", "No tenants"))) +
      U.panel(L("SLA 예외 구간", "SLA exception windows"), U.src(r[1]),
        U.table(["ID", L("유형", "Kind"), L("구간", "Window"), L("범위", "Scope"), L("계약 조항", "Clause")], erows, L("예외 없음", "No exceptions")) +
        '<div class="v2-row" style="margin-top:10px">' + U.field("v2-ex-k", L("유형", "Kind"), '<select id="v2-ex-k"><option>grid_curtailment</option><option>maintenance</option></select>') +
        U.field("v2-ex-s", L("시작 (UTC)", "Start (UTC)"), '<input id="v2-ex-s" type="datetime-local">') + U.field("v2-ex-e", L("종료 (UTC)", "End (UTC)"), '<input id="v2-ex-e" type="datetime-local">') +
        U.field("v2-ex-site", "site", '<select id="v2-ex-site"><option>gasan</option><option>ansan</option></select>') +
        U.field("v2-ex-cl", L("계약 조항", "Clause"), '<input id="v2-ex-cl" value="§7.2">') +
        '<button type="button" class="btn" id="v2-ex-add">' + esc(L("+ 예외 등록", "+ Add exception")) + "</button></div>");
  }

  /* ── 이벤트 ─────────────────────────────────────────────── */
  function done(r, ko, en) {
    U.toast(r.error ? L("실패: ", "Failed: ") + r.error : L(ko, en) + (r.live ? "" : " (MOCK)"), r.error ? "warn" : "");
  }
  document.addEventListener("click", async function (e) {
    var t = e.target.closest && e.target.closest("#v2-rp-save,#v2-rr-go,[data-v2-run],#v2-q-save,#v2-q-ovr,#v2-bl-run,[data-v2-fin],[data-v2-verify],#v2-ex-add");
    if (!t) return;
    if (t.id === "v2-rp-save") {
      var acts = {}; ["cordon", "drain", "gpu_reset", "replace", "rma"].forEach(function (k) { acts[k] = $("v2-rp-" + k).checked; });
      done(await A.remPolicyPut({ mode: $("v2-rp-mode").value, actions: acts, max_parallel_per_rack: +$("v2-rp-par").value, kpi_replace_minutes: +$("v2-rp-kpi").value }),
        "정책 저장", "Policy saved");
      return renderRecovery();
    }
    if (t.id === "v2-rr-go") {
      var m = $("v2-rr-m").value.trim();
      if (!m) return U.toast(L("machine_id 를 입력하세요", "Enter machine_id"), "warn");
      if (NC.v2demo) NC.v2demo.select("machine", m);
      var r = await A.remRunCreate({ machine_id: m, reason: $("v2-rr-why").value });
      done(r, "복구 시작 — " + m, "Remediation started — " + m);
      if (r.data && r.data.id) RC.sel = r.data.id;
      return renderRecovery();
    }
    if (t.dataset.v2Run) { RC.sel = t.dataset.v2Run; return renderRecovery(); }
    if (t.id === "v2-q-save") {
      done(await A.quotaPut($("v2-q-t").value, { tier: $("v2-q-tier").value, tpm: +$("v2-q-tpm").value, rpm: +$("v2-q-rpm").value }), "쿼터 저장", "Quota saved");
      return renderToken();
    }
    if (t.id === "v2-q-ovr") {
      done(await A.quotaOverride($("v2-q-t").value, { tier: "batch", factor: +$("v2-q-f").value, until: new Date(Date.now() + 3600000).toISOString(), reason: "console injection" }),
        "batch 감축 적용", "Batch override applied");
      return renderToken();
    }
    if (t.id === "v2-bl-run") {
      BL.period = $("v2-bl-per").value || BL.period;
      done(await A.invoicesRun(BL.period), "청구 실행 — " + BL.period, "Billing run — " + BL.period);
      return renderBilling();
    }
    if (t.dataset.v2Fin) { done(await A.invoiceFinalize(t.dataset.v2Fin), "확정 — " + t.dataset.v2Fin, "Finalized — " + t.dataset.v2Fin); return renderBilling(); }
    if (t.dataset.v2Verify) { done(await A.signupVerify(t.dataset.v2Verify), "활성화 — " + t.dataset.v2Verify, "Activated — " + t.dataset.v2Verify); return renderAccounts(); }
    if (t.id === "v2-ex-add") {
      var s = $("v2-ex-s").value, en = $("v2-ex-e").value;
      if (!s || !en) return U.toast(L("시작·종료를 입력하세요", "Enter start and end"), "warn");
      done(await A.slaExceptionCreate({ kind: $("v2-ex-k").value, start: s + ":00Z", end: en + ":00Z", scope: { site: $("v2-ex-site").value }, contract_clause: $("v2-ex-cl").value }),
        "예외 등록", "Exception added");
      return renderAccounts();
    }
  });

  var R = { "v2-recovery": renderRecovery, "v2-token": renderToken, "v2-billing": renderBilling, "v2-accounts": renderAccounts };
  NC.v2Ops = R;
  U.onRoute(R);
})();
