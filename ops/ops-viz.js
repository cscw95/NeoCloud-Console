/* 운영 콘솔 v2 쇼케이스 — 운영 흐름 화면 (design-ops 소유).
   ① 자동 복구 실행 타임라인 (F10) #/v2-recovery — 감지 → cordon → drain → reset → 교체 → burn-in → 복귀 7단계 + 구성요소 스윔레인
   ② 전력망 감축 (F20·F21) + 누수 대응 (F22) #/p2-grid — DSX Flex Load Target → 예약 보호 / Batch 축소 → 원복 → 정산
   ③ 상태 페이지 공지 (F13) #/p2-notices — 구성요소별 상태 미리보기 + 공지 이력
   ④ 기존 OOB(#/dsx-oob) · MaxLPS 전력(#/dsx-power) 화면 위에 누수·감축 연결 띠
   데이터: NOCP /api/v1/remediation/* · /api/v1/power/curtailment* · /api/v1/oob/leak-responses · /api/v1/status/notices.
   실패(미기동 · 404)는 같은 모양의 결정적 mock + MOCK 배지. 실제 요청·응답 원문은 NC.msg 뷰어로 보인다.
   컴포넌트: NC.flow · NC.kpi · NC.msg (design-core, V2-DESIGN-COMPONENTS.md). 문자열은 L(ko, en) 쌍.
   흐름 기준: NVSentinel fault-quarantine → node-drainer → fault-remediation (ref/upstream/nvsentinel),
   DSX Flex integrator guide 3–6단계 (UPSTREAM-REFS 3.4), Redfish LeakDetection → NVSentinel HealthEvent.
   v2.js renderRecovery · phase2.js grid/notices 는 NC.opsViz 가 있으면 여기로 위임한다(기존 id·핸들러 유지). */
(function (W, factory) {
  var api = factory(W);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (W && W.document) { W.NC = W.NC || {}; W.NC.opsViz = api; api.boot(); }
})(typeof window !== "undefined" ? window : null, function (W) {
  "use strict";
  var NC = W ? (W.NC = W.NC || {}) : {};

  /* ── 공통 도우미 ─────────────────────────────────────────── */
  function lang() { return W && W.NC_I18N && W.NC_I18N.lang ? W.NC_I18N.lang() : "ko"; }
  function L(ko, en) { return lang() === "en" ? en : ko; }
  function T(o) { return o == null ? "" : typeof o === "string" ? o : L(o.ko, o.en); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(n, d) {
    if (n == null || n === "" || isNaN(+n)) return "—";
    return (+n).toLocaleString("en-US", { maximumFractionDigits: d == null ? 0 : d });
  }
  function won(n) { return n == null || isNaN(+n) ? "—" : "₩" + Math.round(+n).toLocaleString("en-US"); }
  function hm(s) { return s ? String(s).replace("T", " ").slice(11, 16) : "—"; }
  function when(s) { return s ? String(s).replace("T", " ").slice(0, 16) : "—"; }
  function $(id) { return W.document.getElementById(id); }
  function min(a, b) { var x = Date.parse(a), y = Date.parse(b); return isNaN(x) || isNaN(y) ? null : Math.max(0, (y - x) / 60000); }

  /* ══ 순수 모델 (node 테스트 대상) ═════════════════════════════ */

  /* 자동 복구 7단계 — NOCP 단계 이름(NVSentinel 기준)과 v2-api mock 이름을 함께 받는다 */
  var PHASES = [
    { id: "detect", ko: "감지", en: "Detect", steps: ["detect", "queued"], lane: "sentinel" },
    { id: "cordon", ko: "cordon", en: "Cordon", steps: ["quarantine", "cordon"], lane: "sentinel" },
    { id: "drain", ko: "drain", en: "Drain", steps: ["drain"], lane: "drainer" },
    { id: "reset", ko: "GPU 리셋", en: "GPU reset", steps: ["gpu_reset", "validate", "revalidate"], lane: "remed" },
    { id: "replace", ko: "예비 교체", en: "Replace", steps: ["replace"], lane: "remed" },
    { id: "burnin", ko: "RMA · burn-in", en: "RMA · burn-in", steps: ["rma_open", "rma", "isolate", "isolate_sanitize", "repair", "burn_in"], lane: "rma" },
    { id: "return", ko: "복귀", en: "Return", steps: ["uncordon", "pool_return", "return_to_pool"], lane: "rma" }
  ];
  var STEP_NAME = {
    detect: ["장애 감지", "fault detected"], queued: ["랙 대기열", "rack queue"], quarantine: ["격리 (cordon)", "quarantine (cordon)"],
    cordon: ["격리 (cordon)", "cordon"], drain: ["워크로드 drain", "workload drain"], gpu_reset: ["GPU 리셋", "GPU reset"],
    validate: ["재검증", "revalidate"], revalidate: ["재검증", "revalidate"], uncordon: ["격리 해제 · 복귀", "uncordon · return"],
    replace: ["예비 노드 교체", "spare replace"], rma_open: ["RMA 생성", "RMA opened"], rma: ["RMA 생성", "RMA opened"],
    isolate: ["격리 · 소거", "isolate · sanitize"], isolate_sanitize: ["격리 · 소거", "isolate · sanitize"], repair: ["수리", "repair"],
    burn_in: ["burn-in", "burn-in"], pool_return: ["풀 복귀", "pool return"], return_to_pool: ["풀 복귀", "pool return"]
  };
  function stepLabel(n) { var x = STEP_NAME[n]; return x ? { ko: x[0], en: x[1] } : { ko: n, en: n }; }
  function stepState(s) {
    s = String(s || "").toLowerCase();
    return /fail|error/.test(s) ? "fail" : /run|progress|pending|wait/.test(s) ? "active" : "done";
  }
  function phaseOf(name) {
    for (var i = 0; i < PHASES.length; i++) if (PHASES[i].steps.indexOf(name) >= 0) return PHASES[i].id;
    return null;
  }
  /* run → 7단계 [{id, label, status, at, minutes, steps, note}] */
  function runPhases(run) {
    run = run || {};
    var steps = run.steps || [], prev = Date.parse(run.detected_at || run.started_at || (steps[0] && steps[0].at));
    var per = steps.map(function (s) {
      var t = Date.parse(s.at), m = isNaN(t) || isNaN(prev) ? null : Math.max(0, (t - prev) / 60000);
      if (!isNaN(t)) prev = t;
      return { name: s.name, state: stepState(s.state), at: s.at, minutes: m, raw: s, phase: phaseOf(s.name) };
    });
    var finished = run.state === "completed" || run.outcome != null;
    var lastIdx = -1;
    PHASES.forEach(function (p, i) { if (per.some(function (s) { return s.phase === p.id; })) lastIdx = i; });
    var leak = run.trigger && /leak/i.test(run.trigger.kind || "");
    var out = PHASES.map(function (p, i) {
      var mine = per.filter(function (s) { return s.phase === p.id; });
      var status, note = null;
      if (mine.length) {
        var failed = mine.some(function (s) { return s.state === "fail"; });
        var running = mine.some(function (s) { return s.state === "active"; });
        status = failed ? (i < lastIdx ? "warn" : "fail") : running ? "active" : "done";
        if (failed && i < lastIdx) note = { ko: "실패 → 다음 단계로 승격", en: "failed → escalated" };
      } else if (finished) {
        status = "skip";
        if (p.id === "reset" && leak) note = { ko: "누수 — 리셋 생략", en: "leak — reset skipped" };
        else if (p.id === "replace" && run.outcome === "recovered") note = { ko: "제자리 복구", en: "recovered in place" };
        else if (p.id === "burnin" && run.outcome === "recovered") note = { ko: "RMA 불필요", en: "no RMA needed" };
        else if (p.id === "return" && lastIdx >= 0 && PHASES[lastIdx].id === "burnin") {
          status = "pending"; note = { ko: "RMA 진행 중 — 수리 후 풀 복귀", en: "RMA open — returns to pool after repair" };
        }
      } else if (i < lastIdx) status = "skip";
      else status = i === lastIdx + 1 && lastIdx >= 0 && per.filter(function (s) { return s.phase === PHASES[lastIdx].id; }).every(function (s) { return s.state === "done"; }) ? "active" : "pending";
      var mins = mine.reduce(function (a, s) { return s.minutes == null ? a : (a || 0) + s.minutes; }, null);
      return { id: p.id, label: { ko: p.ko, en: p.en }, status: status, at: mine.length ? mine[mine.length - 1].at : null,
        minutes: mins == null ? null : Math.round(mins * 10) / 10, steps: mine, note: note, lane: p.lane };
    });
    return out;
  }
  /* 고객 다운타임(감지 → 교체/복귀) 과 그 뒤 RMA 시간 */
  function downtime(run) {
    var ph = runPhases(run), cust = 0, after = 0;
    ph.forEach(function (p) {
      if (p.minutes == null) return;
      if (p.id === "burnin" || (p.id === "return" && run.outcome !== "recovered")) after += p.minutes; else cust += p.minutes;
    });
    if (run && run.mttr_min != null) cust = +run.mttr_min;
    return { customer: Math.round(cust * 10) / 10, rma: Math.round(after * 10) / 10 };
  }

  /* 감축 run → 흐름 단계 (DSX Flex Load Target → 정책 → 보호 → 축소 → SLA·공지 → 원복 → 정산) */
  function curtFlow(c) {
    c = c || {};
    var restored = c.state === "restored" || c.state === "ended" || !!c.ended_at && c.state !== "active";
    var acts = c.actions || [], prot = c.protected || {};
    var shrinkTone = !acts.length ? "pending" : (+c.shortfall_kw > (+c.requested_kw || 0) * 0.01 ? "warn" : "done");
    return [
      { id: "target", label: { ko: "Load Target 수신", en: "Load target received" }, status: "done", at: c.started_at,
        sub: { ko: (c.source || "—") + " · " + (c.load_target_id || "—"), en: (c.source || "—") + " · " + (c.load_target_id || "—") } },
      { id: "plan", label: { ko: "정책 계산", en: "Policy plan" }, status: "done",
        sub: { ko: ((c.policy && c.policy.tiers) || []).join(" → ") || "—", en: ((c.policy && c.policy.tiers) || []).join(" → ") || "—" } },
      { id: "protect", label: { ko: "예약 보호", en: "Reserved protected" }, status: "done",
        sub: fmt(prot.tenant_count || 0) + L("개 테넌트", " tenants") + " · " + fmt(prot.racks || 0) + L("개 랙", " racks") },
      { id: "shrink", label: { ko: "Batch · 스팟 축소", en: "Batch · spot shrunk" }, status: shrinkTone,
        sub: { ko: fmt(c.achieved_kw, 1) + " / " + fmt(c.requested_kw, 1) + " kW", en: fmt(c.achieved_kw, 1) + " / " + fmt(c.requested_kw, 1) + " kW" } },
      { id: "notice", label: { ko: "SLA 예외 · 공지", en: "SLA exception · notice" }, status: c.sla_exception_id || c.notice_id ? "done" : "skip",
        sub: { ko: (c.sla_exception_id || "—") + " · " + (c.notice_id || "—"), en: (c.sla_exception_id || "—") + " · " + (c.notice_id || "—") } },
      { id: "restore", label: { ko: "원복", en: "Restore" }, status: restored ? "done" : c.state === "active" ? "active" : "pending", at: c.ended_at,
        sub: restored ? fmt((c.restored || []).length) + L("건 복원", " restored") : L("만료 ", "until ") + hm(c.until) },
      { id: "settle", label: { ko: "정산", en: "Settlement" }, status: c.settlement ? "done" : "pending",
        sub: c.settlement ? { ko: won(c.settlement.incentive_krw) + " · " + fmt(c.settlement.kwh, 2) + " kWh", en: won(c.settlement.incentive_krw) + " · " + fmt(c.settlement.kwh, 2) + " kWh" } : null }
    ];
  }
  /* 감축 조치 → 등급별 kW 합 (token-batch 는 est_kw) */
  function tierBreakdown(c) {
    var by = {}, order = [];
    ((c && c.actions) || []).forEach(function (a) {
      var k = a.tier_name || a.kind;
      if (!by[k]) { by[k] = { tier: k, kw: 0, targets: 0, kind: a.kind }; order.push(k); }
      by[k].targets++;
      by[k].kw += a.unit === "kW" ? +a.amount || 0 : +a.est_kw || 0;
    });
    return order.map(function (k) { by[k].kw = Math.round(by[k].kw * 10) / 10; return by[k]; });
  }
  /* 누수 대응 → 흐름 단계 */
  var LEAK_STEP = { "health-event": ["HealthEvent 변환", "HealthEvent"], cordon: ["트레이 cordon", "tray cordon"], drain: ["워크로드 drain", "workload drain"],
    "remediation-run": ["F10 복구 실행", "F10 remediation run"], replace: ["노드 교체 · 이동", "node replace · move"], ticket: ["고객 티켓", "customer ticket"],
    notice: ["상태 공지", "status notice"] };
  function leakFlow(r) {
    r = r || {};
    var have = (r.steps || []).map(function (s) {
      var x = LEAK_STEP[s.name] || [s.name, s.name];
      return { id: s.name, label: { ko: x[0], en: x[1] }, status: stepState(s.state), at: s.at,
        sub: s.run_id || s.machine || s.node || s.new_host || s.ticket_id || null };
    });
    var head = { id: "redfish", label: { ko: "Redfish 누수 이벤트", en: "Redfish leak event" }, status: "done", at: r.detected_at,
      sub: (r.health_event && (r.health_event.errorCode || [])[0]) || r.severity || null };
    return [head].concat(have);
  }
  /* 상태 페이지: 구성요소 → 가장 나쁜 활성 영향 */
  var IMPACT_RANK = { operational: 0, maintenance: 1, degraded: 2, partial_outage: 3, outage: 4, major_outage: 4 };
  function componentStatus(notices, components) {
    var m = {};
    (components || []).forEach(function (c) { m[c] = { component: c, impact: "operational", notices: [] }; });
    (notices || []).forEach(function (n) {
      if (n.state === "resolved") return;
      var imp = n.impact || (n.kind === "maintenance" ? "maintenance" : n.kind === "incident" ? "partial_outage" : "degraded");
      (n.components || []).forEach(function (c) {
        var e = m[c] = m[c] || { component: c, impact: "operational", notices: [] };
        e.notices.push(n.id);
        if ((IMPACT_RANK[imp] || 0) > (IMPACT_RANK[e.impact] || 0)) e.impact = imp;
      });
    });
    return Object.keys(m).map(function (k) { return m[k]; });
  }
  function impactTone(imp) { return imp === "operational" ? "ok" : imp === "maintenance" ? "info" : (IMPACT_RANK[imp] || 0) >= 3 ? "crit" : "warn"; }
  var IMPACT_LABEL = { operational: ["정상", "Operational"], maintenance: ["점검", "Maintenance"], degraded: ["성능 저하", "Degraded"],
    partial_outage: ["부분 장애", "Partial outage"], outage: ["장애", "Outage"], major_outage: ["장애", "Major outage"] };
  function impactLabel(imp) { var x = IMPACT_LABEL[imp] || [imp, imp]; return L(x[0], x[1]); }

  /* ══ 데이터 (NOCP 우선, 실패 시 mock) ══════════════════════════ */
  var TR = [];
  function base() { try { return W.localStorage.getItem("nc-nocp") || "http://127.0.0.1:8000"; } catch (e) { return "http://127.0.0.1:8000"; } }
  function headers() {
    var A = W.NC_AUTH, s = typeof NC.session === "function" ? NC.session() : null;
    try { return A ? A.headers(s, W, A.token(W)) : {}; } catch (e) { return {}; }
  }
  function redact(h) {
    var o = {};
    Object.keys(h || {}).forEach(function (k) { o[k] = /authorization|cookie|api-key/i.test(k) ? String(h[k]).slice(0, 12) + "…" : h[k]; });
    return o;
  }
  async function api(method, path, body) {
    var h = headers();
    if (body !== undefined) h["Content-Type"] = "application/json";
    var t = { method: method, url: base() + path, req_headers: redact(h), req_body: body !== undefined ? JSON.stringify(body) : "", at: new Date().toISOString() };
    try {
      var r = await W.fetch(base() + path, { method: method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
      var txt = await r.text(), j = null;
      try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = null; }
      t.status = r.status; t.res_headers = { "content-type": r.headers.get("content-type") || "" }; t.res_body = txt;
      TR.unshift(t); if (TR.length > 40) TR.pop();
      return { status: r.status, data: j, ok: r.status >= 200 && r.status < 300, path: path };
    } catch (e) {
      t.status = 0; t.res_body = String(e && e.message || e); TR.unshift(t); if (TR.length > 40) TR.pop();
      return { status: 0, data: null, ok: false, path: path };
    }
  }
  function badge(r, path) {
    return r && r.ok
      ? '<span class="src-badge live" role="status">● ' + esc(L("NOCP 라이브", "NOCP live")) + '</span> <span class="ov-path">' + esc(path) + "</span>"
      : '<span class="src-badge mock" role="status" title="' + esc(L("백엔드 미연동 — 계약 기반 모의 데이터", "Backend not connected — contract-shaped mock data")) +
        '">◌ MOCK</span> <span class="ov-path">' + esc(path) + "</span>";
  }

  var MOCK = {
    curt: { items: [{ id: "curt-0001", load_target_id: "flex-0001", source: "dsx-flex", domain: "pd-aif-stt-gasan-f1", site: "aif-stt-gasan",
      requested_kw: 2000, achieved_kw: 1757.2, shortfall_kw: 242.8, state: "restored", started_at: "2026-11-10T10:00:00+00:00",
      until: "2026-11-10T10:30:00+00:00", ended_at: "2026-11-10T10:30:00+00:00", policy: { tiers: ["token-batch", "spot", "on-demand"], protect: ["reserved"] },
      protected: { tenants: ["tnt-demo-d-reserved"], tenant_count: 1, racks: 4 }, sla_exception_id: "slaex-0002", notice_id: "ntc-0001",
      actions: [
        { kind: "quota_override", tier_name: "token-batch", target: "tnt-fin-corp/batch", amount: 0.3, unit: "factor", est_kw: 312.4 },
        { kind: "dps_cap", tier_name: "spot", target: "su-1-rack-02", tenant_id: "tnt-gamma-labs", commitment: "spot", amount: 96.3, unit: "kW", cap_kw: 96.4 },
        { kind: "dps_cap", tier_name: "spot", target: "su-1-rack-03", tenant_id: "tnt-gamma-labs", commitment: "spot", amount: 95.8, unit: "kW", cap_kw: 96.1 },
        { kind: "dps_cap", tier_name: "on-demand", target: "su-2-rack-01", tenant_id: "tnt-fin-corp", commitment: "on_demand", amount: 38.5, unit: "kW", cap_kw: 154.0 }],
      restored: ["tnt-fin-corp/batch", "su-1-rack-02", "su-1-rack-03", "su-2-rack-01"],
      settlement: { id: "drs-0001", kwh: 878.6, hours: 0.5, incentive_krw: 1142180, incentive_krw_per_kwh: 1300 } }] },
    policy: { tiers: [{ name: "token-batch", match: { product: "token-api", tier: "batch" }, order: 1, max_reduction_pct: 70 },
      { name: "spot", match: { commitment: "spot" }, order: 2, max_reduction_pct: 50 },
      { name: "on-demand", match: { commitment: "on_demand" }, order: 3, max_reduction_pct: 20 }], protect: ["reserved"] },
    settle: { items: [{ id: "drs-0001", curtailment_id: "curt-0001", site: "aif-stt-gasan", requested_kw: 2000, achieved_kw: 1757.2, hours: 0.5, kwh: 878.6, incentive_krw: 1142180 }] },
    leak: { items: [{ id: "leak-0001", tray_id: "su-1-rack-00-tray-00", rack: "su-1-rack-00", machine_id: "nh-su-1-rack-00-tray-00", severity: "Critical",
      detected_at: "2026-11-10T10:05:00+00:00", kind: "nvke", tenant_id: "tnt-demo-e-leak", state: "moved", kpi_s: 300, elapsed_s: 41, within_kpi: true,
      remediation_run_id: "rem-0002", replacement: { old_host: "nh-su-1-rack-00-tray-00", new_host: "nh-su-1-rack-00-tray-04" },
      health_event: { agent: "neocloud-leak-monitor", componentClass: "Tray", checkName: "LeakDetection", isFatal: true, isHealthy: false,
        recommendedAction: "REPLACE_VM", errorCode: ["Environmental.1.5.LeakDetectedCritical"], entitiesImpacted: [{ entityType: "Tray", entityValue: "su-1-rack-00-tray-00" }],
        nodeName: "nh-su-1-rack-00-tray-00", processingStrategy: "EXECUTE_REMEDIATION" },
      steps: [{ name: "health-event", state: "done", at: "2026-11-10T10:05:00+00:00" }, { name: "cordon", state: "done", at: "2026-11-10T10:05:02+00:00", machine: "nh-su-1-rack-00-tray-00" },
        { name: "drain", state: "done", at: "2026-11-10T10:05:20+00:00", node: "gpu-0" }, { name: "remediation-run", state: "done", at: "2026-11-10T10:05:21+00:00", run_id: "rem-0002" },
        { name: "replace", state: "done", at: "2026-11-10T10:05:41+00:00", new_host: "nh-su-1-rack-00-tray-04" }] }] },
    notices: { items: [{ id: "ntc-0001", kind: "grid_curtailment", components: ["bmaas", "token-api"], impact: "degraded", state: "active", start: "2026-11-10T10:00:00+00:00",
      message_ko: "전력망 감축 요청으로 2000 kW 감축 중입니다. 예약 고객 용량은 보호됩니다.", message_en: "Grid curtailment of 2000 kW in progress. Reserved capacity is protected.", source: "operator" },
      { id: "ntc-0002", kind: "maintenance", components: ["Storage"], impact: "maintenance", state: "scheduled", start: "2026-11-12T23:00:00+00:00", end: "2026-11-13T01:00:00+00:00",
        message_ko: "VAST Data 스토리지 펌웨어 점검 (2시간)", message_en: "VAST Data storage firmware maintenance (2 hours)", source: "operator" }],
      components: ["Compute", "GPU Fabric", "Storage", "Network", "Portal", "bmaas", "managed-k8s", "token-api"] }
  };
  function items(r, mock) { return r.ok ? (Array.isArray(r.data) ? r.data : (r.data && r.data.items) || []) : mock.items; }

  /* 시연 실행 — NOCP 데모 러너 (/api/v1/demo/scenarios/{id}/run?wait=true) */
  var DEMO = {};
  async function runDemo(sid) {
    DEMO[sid] = { busy: true };
    var r = await api("POST", "/api/v1/demo/scenarios/" + encodeURIComponent(sid) + "/run?wait=true", {});
    DEMO[sid] = r.ok && r.data ? { run: r.data } : { error: r.status || "offline" };
  }
  function demoBox(sid, title) {
    var d = DEMO[sid] || {};
    var body = "";
    if (d.busy) body = '<p class="ov-note" role="status">' + esc(L("실행 중…", "Running…")) + "</p>";
    else if (d.error) body = '<p class="ov-note ov-t-warn" role="status">' + esc(L("데모 러너에 연결할 수 없습니다", "Demo runner unreachable")) + " (" + esc(d.error) + ")</p>";
    else if (d.run && NC.flow) {
      var steps = (d.run.steps || []).map(function (s) { var o = {}; for (var k in s) o[k] = s[k]; o.status = s.status || s.state; return o; });
      var sum = d.run.counts || {};
      body = NC.flow.timeline(NC.flow.fromDemo(steps), { orientation: "horizontal", progress: true, ariaLabel: T(title) }) +
        '<p class="ov-note" role="status">' + esc(d.run.verdict === "pass" ? L("통과", "Passed") : L("판정: ", "Verdict: ") + (d.run.verdict || d.run.state)) +
        " · " + fmt(sum.passed) + "/" + fmt(steps.length) + " · " + fmt(d.run.total_ms, 0) + " ms</p>" +
        (NC.msg ? '<details class="ov-raw"><summary>' + esc(L("단계별 요청 · 응답 원문", "Raw request · response per step")) + "</summary>" +
          NC.msg.list(steps.filter(function (s) { return s.request; }), { limit: 20, newestFirst: false, ariaLabel: T(title) }) + "</details>" : "");
    }
    return '<section class="panel ov-demo" aria-label="' + esc(T(title)) + '"><div class="ph"><span class="tick"></span><h2 class="t v2-h">' + esc(L("시연", "Demo")) +
      " — " + esc(T(title)) + '</h2><span class="c">' + esc(sid) + '</span><span class="rt"><button type="button" class="btn" data-ov-demo="' + esc(sid) + '"' +
      (d.busy ? " disabled" : "") + ">" + esc(L("▶ 시연 실행", "▶ Run demo")) + '</button> <a class="btn-ghost ov-link" href="#/demo-center">' + esc(L("데모 센터", "Demo center")) + "</a></span></div>" + body + "</section>";
  }

  function panel(title, sub, body, extra, cls) {
    return '<section class="panel' + (cls ? " " + cls : "") + '" aria-label="' + esc(title) + '"><div class="ph"><span class="tick"></span><h2 class="t v2-h">' + esc(title) +
      '</h2><span class="c">' + (sub || "") + "</span>" + (extra || "") + "</div>" + body + "</section>";
  }
  function table(heads, rows, empty) {
    return '<div class="v2-scroll"><table class="tbl"><thead><tr>' + heads.map(function (h) {
      return '<th scope="col"' + (/^#/.test(h) ? ' class="num"' : "") + ">" + esc(h.replace(/^#/, "")) + "</th>";
    }).join("") + "</tr></thead><tbody>" + (rows.length ? rows.join("") : '<tr><td colspan="' + heads.length + '">' + esc(empty || "—") + "</td></tr>") + "</tbody></table></div>";
  }
  function pill(tone, text) { return '<span class="ov-pill ov-' + esc(tone) + '">' + esc(text) + "</span>"; }
  function stTone(s) {
    s = String(s || "").toLowerCase();
    return /fail|crit|outage|error/.test(s) ? "crit" : /active|running|open|warn|degrad|scheduled|shortfall/.test(s) ? "warn"
      : /restored|replaced|recovered|moved|done|resolved|completed|ok|pass/.test(s) ? "ok" : "info";
  }
  function kv(obj, keys) {
    return '<dl class="v2-kv">' + keys.filter(function (k) { return obj && obj[k] != null && obj[k] !== ""; }).map(function (k) {
      var v = obj[k]; return "<dt>" + esc(k) + "</dt><dd class='id'>" + esc(typeof v === "object" ? JSON.stringify(v) : v) + "</dd>";
    }).join("") + "</dl>";
  }
  function rawList(re, title, extra) {
    if (!NC.msg) return "";
    var es = (extra || []).concat(TR).filter(function (t) { return re.test(t.url); }).slice(0, 8);
    return '<details class="ov-raw"><summary>' + esc(title) + " (" + es.length + ")</summary>" + NC.msg.list(es, { limit: 8, layout: "split", ariaLabel: title }) + "</details>";
  }

  /* ══ ① 자동 복구 ═══════════════════════════════════════════ */
  var REC = { sel: null, phase: null, top: null };
  var LANES = [
    { id: "sentinel", label: { ko: "NVSentinel 감지 · 격리", en: "NVSentinel detect · quarantine" } },
    { id: "drainer", label: { ko: "node-drainer", en: "node-drainer" } },
    { id: "remed", label: { ko: "fault-remediation · NICo", en: "fault-remediation · NICo" } },
    { id: "rma", label: { ko: "RMA · 풀 (NCP)", en: "RMA · pool (NCP)" } },
    { id: "sla", label: { ko: "SLA · 청구", en: "SLA · billing" } }
  ];
  function swimSteps(run) {
    var out = [];
    runPhases(run).forEach(function (p) {
      p.steps.forEach(function (s) {
        out.push({ id: "s-" + out.length, lane: p.lane, label: stepLabel(s.name), status: s.state, sub: s.minutes != null ? "+" + fmt(s.minutes, 1) + L("분", "m") : null });
      });
    });
    if (run.outcome) out.push({ id: "s-sla", lane: "sla", label: { ko: "다운타임 귀속", en: "Downtime attributed" }, status: "done",
      sub: fmt(run.mttr_min, 1) + L("분", " min") + (run.kpi_met === false ? L(" · 목표 초과", " · over target") : "") });
    return out;
  }
  async function recovery() {
    var root = $("v2-recovery-root"); if (!root) return;
    var A = NC.v2;
    var r = A ? await Promise.all([A.remPolicy(), A.remRuns()]) : [{ data: {} }, { data: [] }];
    var pol = r[0].data || {}, runs = (r[1].data || []).slice();
    if (runs[0] && runs[0].id !== REC.top) { REC.sel = runs[0].id; REC.phase = null; }
    REC.top = runs[0] && runs[0].id;
    var sel = runs.find(function (x) { return x.id === REC.sel; }) || runs[0];
    var done = runs.filter(function (x) { return x.mttr_min != null; });
    var avg = done.length ? done.reduce(function (s, x) { return s + x.mttr_min; }, 0) / done.length : null;
    var kpiMin = pol.kpi_replace_minutes || 60;
    var within = done.filter(function (x) { return x.mttr_min <= kpiMin; }).length;
    var K = NC.kpi;
    var kp = K ? K.grid([
      K.stat({ label: L("정책 모드", "Policy mode"), value: pol.mode || "—", sub: pol.mode === "auto" ? L("자동 조치", "automatic actions") : L("모니터링만 (기본)", "monitor only (default)") }),
      K.target({ label: L("평균 MTTR", "Avg MTTR"), value: avg != null ? Math.round(avg * 10) / 10 : null, target: kpiMin, max: Math.max(kpiMin * 1.5, avg || 0), unit: L("분", "min"), digits: 1, lowerBetter: true }),
      K.gauge({ label: L("목표 내 복구", "Within target"), value: done.length ? Math.round(within / done.length * 1000) / 10 : null, target: 95, unit: "%", digits: 1,
        sub: fmt(within) + " / " + fmt(done.length) + L(" 건", " runs") }),
      K.stat({ label: L("진행 중", "In progress"), value: fmt(runs.length - done.length), sub: L("실행", "runs") }),
      K.stat({ label: L("교체 · RMA", "Replaced · RMA"), value: fmt(runs.filter(function (x) { return x.outcome === "replaced"; }).length) + " · " + fmt(runs.filter(function (x) { return x.rma_id; }).length) })
    ], { min: 180 }) : "";

    var flow = "";
    if (sel) {
      var ph = runPhases(sel);
      var cur = REC.phase || (ph.filter(function (p) { return p.status === "active" || p.status === "fail"; })[0] || ph.filter(function (p) { return p.steps.length; }).slice(-1)[0] || ph[0]).id;
      var tsteps = ph.map(function (p) {
        return { id: p.id, label: p.label, status: p.status, at: p.at, badge: p.minutes != null ? "+" + fmt(p.minutes, 1) + L("분", "m") : null,
          sub: p.note || (p.steps.length ? { ko: p.steps.map(function (s) { return stepLabel(s.name).ko; }).join(" · "), en: p.steps.map(function (s) { return stepLabel(s.name).en; }).join(" · ") } : null) };
      });
      var cp = ph.find(function (p) { return p.id === cur; }) || ph[0];
      var dt = downtime(sel);
      var detail = '<div class="ov-detail" aria-live="polite"><h3>' + esc(T(cp.label)) + " " + pill(stTone(cp.status === "skip" ? "info" : cp.status), cp.status) + "</h3>" +
        (cp.steps.length ? cp.steps.map(function (s) {
          var keys = Object.keys(s.raw).filter(function (k) { return k !== "name"; });
          return '<div class="ov-step"><b>' + esc(T(stepLabel(s.name))) + '</b> <span class="ov-path">' + esc(s.name) + "</span>" + kv(s.raw, keys) + "</div>";
        }).join("") : '<p class="ov-note">' + esc(cp.note ? T(cp.note) : L("이 단계는 아직 실행되지 않았습니다", "This phase has not run yet")) + "</p>") + "</div>";
      var tg = sel.target || {};
      flow = panel(L("복구 실행 타임라인 — ", "Remediation run timeline — ") + sel.id,
        esc(tg.machine_id || "—") + " · " + pill(stTone(sel.outcome || sel.state), sel.outcome || sel.state || "running") + " · " + esc(sel.reason || (sel.trigger && sel.trigger.kind) || ""),
        '<div id="ov-rec-tl">' + (NC.flow ? NC.flow.timeline(tsteps, { orientation: "horizontal", progress: true, selectable: true, selected: cur,
          ariaLabel: L("자동 복구 7단계", "Auto-recovery seven phases") }) : "") + "</div>" +
        '<div class="ov-split">' + detail + '<div class="ov-side">' +
        (K ? K.stack([{ label: L("고객 다운타임", "Customer downtime"), value: dt.customer, tone: sel.kpi_met === false ? "crit" : "warn" },
          { label: L("RMA · burn-in (고객 무영향)", "RMA · burn-in (no customer impact)"), value: dt.rma, tone: "info" }],
          { label: L("소요 시간 구성", "Time breakdown"), unit: L("분", "min"), digits: 1 }) +
          K.target({ label: "MTTR", value: sel.mttr_min, target: sel.kpi_replace_minutes || kpiMin, max: Math.max((sel.kpi_replace_minutes || kpiMin) * 1.5, sel.mttr_min || 0),
            unit: L("분", "min"), digits: 1, lowerBetter: true }) : "") +
        kv({ tenant: tg.tenant_id, product: tg.product, rack: tg.rack_id, cluster: tg.cluster_id, action: sel.recommended_action, rma: sel.rma_id,
          replacement: sel.replacement && (sel.replacement.old_host + " → " + sel.replacement.new_host) },
          ["tenant", "product", "rack", "cluster", "action", "rma", "replacement"]) + "</div></div>" +
        '<h3 class="ov-h3">' + esc(L("구성요소별 흐름", "Flow by component")) + "</h3>" +
        (NC.flow ? NC.flow.swimlane(LANES, swimSteps(sel), { ariaLabel: L("구성요소 스윔레인", "Component swimlane") }) : "") +
        rawList(/\/remediation\//, L("요청 · 응답 원문", "Raw request · response"), A && A.trace ? A.trace().slice().reverse() : []), "", "ov-rec");
    }
    var rows = runs.map(function (x) {
      var on = sel && x.id === sel.id, ph = runPhases(x), dn = ph.filter(function (p) { return p.status === "done" || p.status === "warn"; }).length;
      return "<tr" + (on ? ' class="ov-on"' : "") + '><td class="id"><button type="button" class="btn-ghost" data-ov-run="' + esc(x.id) + '" aria-pressed="' + on + '">' + esc(x.id) + "</button></td>" +
        "<td class='id'>" + esc(x.target && x.target.machine_id) + "</td><td>" + esc(x.target && x.target.tenant_id || "—") + "</td><td>" + esc(x.trigger && x.trigger.kind) +
        "</td><td>" + esc(when(x.detected_at || x.started_at)) + "</td><td>" + pill(stTone(x.outcome || "running"), x.outcome || "running") +
        '</td><td><span class="ov-mini" role="img" aria-label="' + esc(dn + "/7") + '">' + ph.map(function (p) { return '<i class="ov-' + esc(p.status) + '"></i>'; }).join("") + "</span></td>" +
        "<td class='num'>" + (x.mttr_min != null ? fmt(x.mttr_min, 1) : "—") + "</td><td class='id'>" + esc(x.rma_id || "—") + "</td></tr>";
    });
    var list = panel(L("복구 실행", "Remediation runs"), (NC.v2ui ? NC.v2ui.src(r[1]) : ""),
      table([L("실행", "Run"), "machine", L("테넌트", "Tenant"), L("원인", "Trigger"), L("감지", "Detected"), L("결과", "Outcome"), L("7단계", "7 phases"), "#MTTR", "RMA"], rows, L("실행 없음", "No runs")));
    var acts = pol.actions || {};
    var polP = panel(L("복구 정책", "Remediation policy"), NC.v2ui ? NC.v2ui.src(r[0]) : "",
      '<div class="v2-row"><div class="v2-f"><label for="v2-rp-mode">mode</label><select id="v2-rp-mode"><option value="monitor"' + (pol.mode !== "auto" ? " selected" : "") +
      '>monitor</option><option value="auto"' + (pol.mode === "auto" ? " selected" : "") + ">auto</option></select></div>" +
      '<fieldset class="ov-checks"><legend>' + esc(L("자동 조치", "Automatic actions")) + "</legend>" + ["cordon", "drain", "gpu_reset", "replace", "rma"].map(function (k) {
        return '<label for="v2-rp-' + k + '"><input type="checkbox" id="v2-rp-' + k + '"' + (acts[k] !== false ? " checked" : "") + "> " + esc(k) + "</label>";
      }).join("") + "</fieldset>" +
      '<div class="v2-f"><label for="v2-rp-par">' + esc(L("랙당 동시 실행", "Per-rack parallel")) + '</label><input id="v2-rp-par" type="number" min="1" max="4" value="' + esc(pol.max_parallel_per_rack || 1) + '"></div>' +
      '<div class="v2-f"><label for="v2-rp-kpi">' + esc(L("교체 목표(분)", "Replace target (min)")) + '</label><input id="v2-rp-kpi" type="number" min="5" max="480" value="' + esc(kpiMin) + '"></div>' +
      '<button type="button" class="btn" id="v2-rp-save">' + esc(L("정책 저장", "Save policy")) + "</button></div>" +
      '<p class="v2-note">' + esc(L("기본은 모니터링만 — 격리·복구는 opt-in. 흐름: fault-quarantine(cordon) → node-drainer(drain) → fault-remediation(reset/교체).",
        "Default is monitor-only — isolation and repair are opt-in. Flow: fault-quarantine (cordon) → node-drainer (drain) → fault-remediation (reset / replace).")) + "</p>");
    var inj = panel(L("장애 주입 · 수동 시작", "Fault injection · manual start"), esc(L("운영자", "operator")),
      '<div class="v2-row"><div class="v2-f"><label for="v2-rr-m">machine_id</label><input id="v2-rr-m" value="gasan-f2-r05-t07"></div>' +
      '<div class="v2-f"><label for="v2-rr-why">' + esc(L("사유", "Reason")) + '</label><select id="v2-rr-why"><option>XID 79</option><option>XID 48 DBE</option><option>NVLink CRC</option><option>SEL PSU</option><option>leak</option></select></div>' +
      '<button type="button" class="btn" id="v2-rr-go">' + esc(L("주입 → 복구 시작", "Inject → start")) + "</button></div>" +
      '<p class="v2-note">' + esc(L("주입하면 새 실행이 맨 위에 생기고 타임라인이 그 실행으로 바뀝니다.", "A new run appears on top and the timeline switches to it.")) + "</p>");
    var demo = NC.v2demo ? NC.v2demo.host("auto-recovery") : "";
    root.innerHTML = demo + kp + flow + list + '<div class="grid ov-grid2">' + polP + inj + "</div>";
  }

  /* ══ ② 전력망 감축 + 누수 대응 ═══════════════════════════════ */
  var GRID = { sel: null, leak: null };
  async function grid() {
    var res = await Promise.all([api("GET", "/api/v1/power/curtailments"), api("GET", "/api/v1/power/curtailment-policy"),
      api("GET", "/api/v1/power/curtailments-settlements"), api("GET", "/api/v1/oob/leak-responses")]);
    var runs = items(res[0], MOCK.curt), pol = res[1].ok ? res[1].data : MOCK.policy, settles = items(res[2], MOCK.settle), leaks = items(res[3], MOCK.leak);
    var c = runs.find(function (x) { return x.id === GRID.sel; }) || runs.find(function (x) { return x.state === "active"; }) || runs[0];
    if (c && res[0].ok) { var d = await api("GET", "/api/v1/power/curtailments/" + encodeURIComponent(c.id)); if (d.ok) c = d.data; }
    var K = NC.kpi, active = runs.filter(function (x) { return x.state === "active"; });
    var banner = active.length
      ? '<div class="ov-banner ov-warn" role="status"><b>' + esc(L("감축 진행 중", "Curtailment active")) + "</b> " + esc(active.map(function (x) { return x.id + " · " + fmt(x.requested_kw) + " kW"; }).join(", ")) +
        " — " + esc(L("예약 고객은 보호되고 Batch·스팟이 축소됩니다", "reserved customers are protected; batch and spot are shrunk")) + "</div>"
      : '<div class="ov-banner ov-ok" role="status"><b>' + esc(L("감축 없음", "No active curtailment")) + "</b> " + esc(L("최근 실행과 정산 결과를 아래에 보입니다", "latest run and settlement shown below")) + "</div>";
    var head = '<div class="filters ov-filters">' + badge(res[0], "/api/v1/power/curtailments") + " " + badge(res[3], "/api/v1/oob/leak-responses") + "</div>" + banner;

    var curt = "";
    if (c) {
      var tb = tierBreakdown(c), prot = c.protected || {};
      var ps = c.power_state || {};
      var kp = K ? K.grid([
        K.target({ label: L("감축 달성 kW", "Achieved kW"), value: c.achieved_kw, target: c.requested_kw, warn: (c.requested_kw || 0) * 0.8, max: Math.max(c.requested_kw || 0, c.achieved_kw || 0) * 1.15, unit: "kW", digits: 1,
          sub: L("요청 ", "requested ") + fmt(c.requested_kw, 1) + " kW · " + L("부족 ", "short ") + fmt(c.shortfall_kw, 1) + " kW" }),
        ps.measured_kw != null ? K.target({ label: L("전력 상태 (Flex Agent)", "Power state (Flex Agent)"), value: ps.measured_kw, target: ps.target_kw, lowerBetter: true, unit: "kW", digits: 0,
          sub: String(ps.compliance || "") }) : K.stat({ label: L("전력 도메인", "Power domain"), value: c.domain || c.site || "—", sub: c.power_source || "" }),
        K.stat({ label: L("예약 보호", "Reserved protected"), value: fmt(prot.tenant_count || 0) + L(" 테넌트", " tenants"), sub: fmt(prot.racks || 0) + L(" 랙 · 손대지 않음", " racks · untouched") }),
        K.stat({ label: L("수요반응 정산", "DR settlement"), value: c.settlement ? won(c.settlement.incentive_krw) : "—",
          sub: c.settlement ? fmt(c.settlement.kwh, 2) + " kWh × ₩" + fmt(c.settlement.incentive_krw_per_kwh) : L("원복 후 산정", "after restore") })
      ], { min: 200 }) : "";
      var prRows = (prot.tenants || []).map(function (t) { return "<li>" + pill("ok", L("보호", "protected")) + ' <span class="id">' + esc(t) + "</span></li>"; }).join("");
      var shrink = K ? K.stack(tb.map(function (t, i) { return { label: t.tier + " (" + t.targets + ")", value: t.kw, tone: ["warn", "c2", "c3", "c4"][i] || "c5" }; }),
        { label: L("축소 kW (등급별)", "Shrunk kW by tier"), unit: "kW", digits: 1 }) : "";
      var actRows = (c.actions || []).slice(0, 40).map(function (a) {
        var back = (c.restored || []).indexOf(a.target) >= 0;
        return "<tr><td>" + esc(a.tier_name) + "</td><td>" + esc(a.kind) + "</td><td class='id'>" + esc(a.target) + "</td><td>" + esc(a.commitment || "—") +
          "</td><td class='num'>" + (a.unit === "kW" ? fmt(a.amount, 1) + " kW" : "×" + fmt(a.amount, 2) + (a.est_kw ? " ≈" + fmt(a.est_kw, 1) + " kW" : "")) +
          "</td><td class='num'>" + (a.cap_kw != null ? fmt(a.cap_kw, 1) : "—") + "</td><td>" + (back ? pill("ok", L("원복", "restored")) : c.state === "active" ? pill("warn", L("적용 중", "applied")) : "—") + "</td></tr>";
      });
      var ctl = c.state === "active" ? '<button type="button" class="btn" data-ov-end="' + esc(c.id) + '">' + esc(L("감축 종료 → 원복 · 정산", "End → restore · settle")) + "</button>" : "";
      curt = panel(L("전력망 감축 — ", "Grid curtailment — ") + c.id, esc(c.domain || c.site || "") + " · " + pill(stTone(c.state), c.state) + " · " + esc(when(c.started_at)) + " → " + esc(hm(c.ended_at || c.until)),
        (NC.flow ? NC.flow.timeline(curtFlow(c), { orientation: "horizontal", progress: true, ariaLabel: L("감축 흐름", "Curtailment flow") }) : "") + kp +
        '<div class="ov-split ov-split-pv"><div class="ov-col"><h3 class="ov-h3">' + esc(L("보호 (예약 · 손대지 않음)", "Protected (reserved · untouched)")) + "</h3>" +
        (prRows ? '<ul class="ov-list">' + prRows + "</ul>" : '<p class="ov-note">' + esc(L("이 도메인에 예약 고객 랙이 없습니다 — 정책 protect: ", "No reserved racks in this domain — policy protect: ")) + esc(((c.policy && c.policy.protect) || []).join(", ")) + "</p>") +
        '</div><div class="ov-col"><h3 class="ov-h3">' + esc(L("축소 (Batch · 스팟 · 온디맨드)", "Shrunk (batch · spot · on-demand)")) + "</h3>" + shrink + "</div></div>" +
        '<details class="ov-raw"><summary>' + esc(L("조치 목록", "Actions")) + " (" + fmt((c.actions || []).length) + ")</summary>" +
        table([L("등급", "Tier"), L("조치", "Action"), L("대상", "Target"), L("약정", "Commitment"), L("#축소", "#Cut"), "#cap kW", L("상태", "State")], actRows) + "</details>" +
        (ctl ? '<div class="v2-row ov-act">' + ctl + "</div>" : "") +
        rawList(/\/power\/curtailment/, L("요청 · 응답 원문", "Raw request · response")), "", "ov-curt");
    }
    var runRows = runs.map(function (x) {
      var on = c && x.id === c.id;
      return "<tr" + (on ? ' class="ov-on"' : "") + '><td class="id"><button type="button" class="btn-ghost" data-ov-curt="' + esc(x.id) + '" aria-pressed="' + on + '">' + esc(x.id) + "</button></td><td class='id'>" +
        esc(x.load_target_id || "—") + "</td><td>" + esc(x.source || "—") + "</td><td class='num'>" + fmt(x.requested_kw, 1) + "</td><td class='num'>" + fmt(x.achieved_kw, 1) +
        "</td><td>" + pill(stTone(x.state), x.state) + "</td><td class='num'>" + (x.settlement ? won(x.settlement.incentive_krw) : "—") + "</td></tr>";
    });
    var tiers = (pol.tiers || []).slice().sort(function (a, b) { return (a.order || 99) - (b.order || 99); });
    var polBody = '<ol class="ov-tiers">' + tiers.map(function (t) {
      var p = Math.max(0, Math.min(100, +t.max_reduction_pct || 0));
      return '<li><span class="ov-tier-n">' + esc(t.order) + '</span><span class="ov-tier-l"><b>' + esc(t.name) + '</b><span class="ov-path">' + esc(JSON.stringify(t.match || {})) + "</span></span>" +
        '<span class="ov-tier-b" role="img" aria-label="' + esc(L("최대 감축 ", "max reduction ") + p + "%") + '"><i style="width:' + p + '%"></i></span><span class="tabnum">≤ ' + p + "%</span></li>";
    }).join("") + '<li class="ov-tier-p"><span class="ov-tier-n">∞</span><span class="ov-tier-l"><b>' + esc(L("보호", "Protect")) + "</b> " + esc((pol.protect || []).join(", ")) +
      "</span>" + pill("ok", L("감축 안 함", "never shed")) + "</li></ol>";
    var start = '<div class="v2-row"><div class="v2-f"><label for="ov-c-kw">' + esc(L("감축 kW", "Reduce kW")) + '</label><input id="ov-c-kw" type="number" min="1" value="400"></div>' +
      '<div class="v2-f"><label for="ov-c-dur">' + esc(L("기간(초)", "Duration (s)")) + '</label><input id="ov-c-dur" type="number" min="60" value="1800"></div>' +
      '<div class="v2-f"><label for="ov-c-dom">' + esc(L("전력 도메인", "Power domain")) + '</label><input id="ov-c-dom" value="' + esc((c && c.domain) || "pd-aif-stt-gasan-f1") + '"></div>' +
      '<button type="button" class="btn" id="ov-c-go">' + esc(L("감축 주입 (Load Target)", "Inject curtailment (load target)")) + "</button></div>";
    var curtList = '<div class="grid ov-grid2">' + panel(L("감축 정책 (순서대로 축소)", "Curtailment policy (shed in order)"), badge(res[1], "/api/v1/power/curtailment-policy"), polBody) +
      panel(L("감축 주입 (운영자)", "Inject curtailment (operator)"), "POST /api/v1/power/curtailments", start +
        '<p class="v2-note">' + esc(L("DSX Flex Agent 에 Load Target 을 등록한 뒤 정책 순서대로 축소합니다. 예약 고객은 건드리지 않습니다.",
          "Registers a load target with the DSX Flex Agent, then sheds in policy order. Reserved customers are never touched.")) + "</p>") + "</div>" +
      panel(L("감축 실행 · 정산", "Curtailment runs · settlement"), fmt(settles.length) + L("건 정산", " settled"),
        table(["ID", "Load Target", L("출처", "Source"), "#" + L("요청 kW", "Req kW"), "#" + L("달성 kW", "Got kW"), L("상태", "State"), L("#인센티브", "#Incentive")], runRows, L("감축 없음", "No curtailments")));

    /* 누수 대응 */
    var lk = leaks.find(function (x) { return x.id === GRID.leak; }) || leaks[0];
    var leakP = "";
    if (lk) {
      var lkK = K ? K.grid([
        K.target({ label: L("워크로드 이동 시간", "Workload move time"), value: lk.elapsed_s, target: lk.kpi_s, max: Math.max(lk.kpi_s || 300, lk.elapsed_s || 0) * 1.2, unit: "s", digits: 1, lowerBetter: true }),
        K.stat({ label: L("심각도", "Severity"), value: lk.severity || "—", sub: (lk.kind || "—") + " · " + (lk.tenant_id || "—") }),
        K.stat({ label: L("결과", "Outcome"), value: lk.state || "—", sub: lk.replacement ? lk.replacement.old_host + " → " + lk.replacement.new_host : (lk.ticket_id || "") })
      ], { min: 200 }) : "";
      var he = lk.health_event ? '<details class="ov-raw"><summary>' + esc(L("NVSentinel HealthEvent 원문", "NVSentinel HealthEvent (raw)")) + "</summary>" +
        (NC.msg ? '<div class="ov-pre">' + NC.msg.pretty(JSON.stringify(lk.health_event)) + "</div>" : "<pre>" + esc(JSON.stringify(lk.health_event, null, 2)) + "</pre>") + "</details>" : "";
      var lrows = leaks.map(function (x) {
        var on = x.id === lk.id;
        return "<tr" + (on ? ' class="ov-on"' : "") + '><td class="id"><button type="button" class="btn-ghost" data-ov-leak="' + esc(x.id) + '" aria-pressed="' + on + '">' + esc(x.id) + "</button></td><td class='id'>" +
          esc(x.tray_id) + "</td><td>" + pill(x.severity === "Critical" ? "crit" : "warn", x.severity) + "</td><td>" + esc(x.kind || "—") + "</td><td>" + pill(stTone(x.state), x.state) +
          "</td><td class='num'>" + fmt(x.elapsed_s, 1) + " / " + fmt(x.kpi_s) + " s</td><td class='id'>" + (x.remediation_run_id ? '<a href="#/v2-recovery">' + esc(x.remediation_run_id) + "</a>" : "—") + "</td></tr>";
      });
      leakP = panel(L("누수 대응 — ", "Leak response — ") + lk.id, esc(lk.rack || "") + " · " + esc(lk.tray_id || "") + " · " + pill(stTone(lk.state), lk.state),
        (NC.flow ? NC.flow.timeline(leakFlow(lk), { orientation: "horizontal", progress: true, ariaLabel: L("누수 대응 흐름", "Leak response flow") }) : "") + lkK + he +
        table(["ID", L("트레이", "Tray"), L("심각도", "Severity"), L("종류", "Kind"), L("상태", "State"), L("#이동 / 목표", "#Move / target"), L("복구 실행", "Remediation")], lrows) +
        rawList(/\/oob\//, L("요청 · 응답 원문", "Raw request · response")), "", "ov-leak");
    } else leakP = panel(L("누수 대응", "Leak response"), "", '<p class="ov-note">' + esc(L("누수 이벤트 없음", "No leak events")) + "</p>");
    var leakInj = panel(L("누수 주입 (Redfish 이벤트)", "Inject leak (Redfish event)"), "POST /api/v1/oob/events",
      '<div class="v2-row"><div class="v2-f"><label for="ov-l-tray">' + esc(L("트레이", "Tray")) + '</label><input id="ov-l-tray" value="su-1-rack-05-tray-03"></div>' +
      '<div class="v2-f"><label for="ov-l-sev">' + esc(L("심각도", "Severity")) + '</label><select id="ov-l-sev"><option>Critical</option><option>Warning</option></select></div>' +
      '<button type="button" class="btn" id="ov-l-go">' + esc(L("누수 이벤트 보내기", "Send leak event")) + "</button></div>" +
      '<p class="v2-note">' + esc(L("Critical: cordon → drain → 교체(NVKE) 또는 티켓·공지(BMaaS). Warning: 공지만.", "Critical: cordon → drain → replace (NVKE) or ticket + notice (BMaaS). Warning: notice only.")) + "</p>");

    var html = head + curt + curtList + '<h2 class="ov-sec">' + esc(L("냉각수 누수 대응 (F22)", "Coolant leak response (F22)")) + "</h2>" + leakP + leakInj +
      demoBox("d-grid-curtailment", { ko: "전력망 감축 → 예약 보호 → 원복 → 정산", en: "Grid curtailment → reserved protected → restore → settle" }) +
      demoBox("e-leak-workload-move", { ko: "누수 → cordon → 워크로드 이동", en: "Leak → cordon → workload move" });
    return html;
  }

  /* ══ ③ 상태 페이지 공지 ═════════════════════════════════════ */
  async function notices() {
    var r = await api("GET", "/api/v1/status/notices");
    var list = items(r, MOCK.notices), comps = (r.ok && r.data && r.data.components) || MOCK.notices.components;
    var cs = componentStatus(list, comps);
    var worst = cs.reduce(function (a, c) { return (IMPACT_RANK[c.impact] || 0) > (IMPACT_RANK[a] || 0) ? c.impact : a; }, "operational");
    var open = list.filter(function (n) { return n.state !== "resolved"; });
    var grid2 = '<ul class="ov-comps">' + cs.map(function (c) {
      var t = impactTone(c.impact);
      return '<li class="ov-comp ov-b-' + t + '"><span class="ov-dot ov-' + t + '" aria-hidden="true"></span><b>' + esc(c.component) + '</b><span class="ov-t-' + t + '">' + esc(impactLabel(c.impact)) + "</span>" +
        (c.notices.length ? '<span class="ov-path">' + esc(c.notices.join(", ")) + "</span>" : "") + "</li>";
    }).join("") + "</ul>";
    var preview = panel(L("공개 상태 페이지 미리보기", "Public status page preview"), badge(r, "/api/v1/status/notices"),
      '<div class="ov-banner ov-' + impactTone(worst) + '" role="status"><b>' + esc(worst === "operational" ? L("모든 시스템 정상", "All systems operational") : impactLabel(worst)) + "</b> " +
      esc(open.length ? L("진행 중 공지 ", "open notices ") + open.length : "") + "</div>" + grid2);
    var cards = open.map(function (n) {
      var t = n.kind === "maintenance" ? "info" : n.kind === "incident" ? "crit" : "warn";
      return '<article class="ov-notice ov-b-' + t + '"><header>' + pill(t, n.kind) + " " + pill(stTone(n.state), n.state) + ' <span class="ov-path">' + esc(n.id) + "</span></header>" +
        "<p>" + esc(L(n.message_ko || n.message_en || "", n.message_en || n.message_ko || "")) + "</p>" +
        '<p class="ov-note">' + esc((n.components || []).join(" · ")) + " · " + esc(when(n.start)) + (n.end ? " → " + esc(when(n.end)) : "") + " · " + esc(n.source || "") +
        (n.kind === "grid_curtailment" ? ' · <a href="#/p2-grid">' + esc(L("감축 보기", "View curtailment")) + "</a>" : "") + "</p>" +
        '<button type="button" class="btn-ghost" data-p2-resolve="' + esc(n.id) + '">' + esc(L("해제", "Resolve")) + "</button></article>";
    }).join("");
    var hist = NC.flow ? NC.flow.timeline(list.slice().sort(function (a, b) { return String(b.created_at || b.start).localeCompare(String(a.created_at || a.start)); }).slice(0, 12).map(function (n) {
      return { id: n.id, label: n.id + " · " + n.kind, status: n.state === "resolved" ? "done" : n.state === "scheduled" ? "pending" : "active", at: n.created_at || n.start,
        sub: L(n.message_ko || "", n.message_en || "") };
    }), { orientation: "vertical", numbered: false, ariaLabel: L("공지 이력", "Notice history") }) : "";
    var form = '<div class="v2-row"><div class="v2-f"><label for="p2-n-kind">' + esc(L("종류", "Kind")) + '</label><select id="p2-n-kind">' +
      ["incident", "maintenance", "grid_curtailment"].map(function (k) { return "<option>" + k + "</option>"; }).join("") + "</select></div>" +
      '<div class="v2-f"><label for="p2-n-comp">' + esc(L("구성요소", "Component")) + '</label><input id="p2-n-comp" value="Compute"></div>' +
      '<div class="v2-f"><label for="p2-n-ko">' + esc(L("메시지 (KO)", "Message (KO)")) + '</label><input id="p2-n-ko"></div>' +
      '<div class="v2-f"><label for="p2-n-en">' + esc(L("메시지 (EN)", "Message (EN)")) + '</label><input id="p2-n-en"></div>' +
      '<button type="button" class="btn" id="p2-n-create">' + esc(L("공지 등록", "Post notice")) + "</button></div>";
    var rows = list.map(function (x) {
      return "<tr><td class='id'>" + esc(x.id) + "</td><td>" + esc(x.kind) + "</td><td>" + esc((x.components || []).join(", ")) + "</td><td>" + esc(when(x.start)) + "</td><td>" +
        esc(when(x.end)) + "</td><td>" + pill(stTone(x.state), x.state) + "</td><td>" + (x.state !== "resolved" ? '<button type="button" class="btn-ghost" data-p2-resolve="' + esc(x.id) + '">' + esc(L("해제", "Resolve")) + "</button>" : "") + "</td></tr>";
    });
    return preview + '<div class="ov-split ov-split-n"><div>' + panel(L("진행 중 공지", "Open notices"), fmt(open.length), cards || '<p class="ov-note">' + esc(L("진행 중 공지 없음", "No open notices")) + "</p>") +
      panel(L("공지 등록 (운영자)", "Post notice (operator)"), "POST /api/v1/status/notices", form) + "</div><div>" + panel(L("공지 이력", "Notice history"), "", hist) + "</div></div>" +
      panel(L("전체 공지", "All notices"), "incident · maintenance · grid_curtailment",
        table(["ID", L("종류", "Kind"), L("구성요소", "Components"), L("시작", "Start"), L("종료", "End"), L("상태", "State"), ""], rows)) +
      demoBox("f13-status-notices", { ko: "공지 유형 (장애 · 점검 · 그리드 감축)", en: "Notice types (incident · maintenance · grid curtailment)" });
  }

  /* ══ ④ 기존 OOB · MaxLPS 전력 화면 연결 띠 ═════════════════════ */
  async function tiePower() {
    var r = await api("GET", "/api/v1/power/curtailments");
    var runs = items(r, MOCK.curt), act = runs.filter(function (x) { return x.state === "active"; }), last = act[0] || runs[0];
    var K = NC.kpi;
    var body = last ? (K ? K.target({ label: (act.length ? L("감축 진행 — ", "Curtailing — ") : L("최근 감축 — ", "Last curtailment — ")) + last.id,
      value: last.achieved_kw, target: last.requested_kw, warn: (last.requested_kw || 0) * 0.8, max: Math.max(last.requested_kw || 0, last.achieved_kw || 0) * 1.15, unit: "kW", digits: 1,
      sub: (last.domain || last.site || "") + " · " + last.state + (last.settlement ? " · " + won(last.settlement.incentive_krw) : "") }) : "") : '<span class="ov-note">' + esc(L("감축 이력 없음", "No curtailments yet")) + "</span>";
    return '<aside class="ov-tie ov-b-' + (act.length ? "warn" : "ok") + '" aria-label="' + esc(L("전력망 감축 연결", "Grid curtailment link")) + '"><div class="ov-tie-h"><b>' +
      esc(L("전력망 감축 (DSX Flex)", "Grid curtailment (DSX Flex)")) + "</b> " + badge(r, "/api/v1/power/curtailments") + '</div><div class="ov-tie-b">' + body + "</div>" +
      '<a class="btn-ghost ov-link" href="#/p2-grid">' + esc(L("감축 · 정산 보기 →", "Curtailment · settlement →")) + "</a></aside>";
  }
  async function tieOob() {
    var r = await api("GET", "/api/v1/oob/leak-responses");
    var ls = items(r, MOCK.leak), open = ls.filter(function (x) { return !/moved|closed|resolved|done/.test(x.state || ""); }), last = ls[0];
    return '<aside class="ov-tie ov-b-' + (open.length ? "crit" : "ok") + '" aria-label="' + esc(L("누수 대응 연결", "Leak response link")) + '"><div class="ov-tie-h"><b>' +
      esc(L("냉각수 누수 대응 (F22)", "Coolant leak response (F22)")) + "</b> " + badge(r, "/api/v1/oob/leak-responses") + '</div><div class="ov-tie-b">' +
      (last ? pill(last.severity === "Critical" ? "crit" : "warn", last.severity) + " " + esc(last.tray_id) + " · " + pill(stTone(last.state), last.state) + " · " +
        esc(L("이동 ", "moved in ")) + fmt(last.elapsed_s, 1) + " s / " + fmt(last.kpi_s) + " s · " + esc(L("진행 중 ", "open ")) + fmt(open.length)
        : esc(L("누수 이벤트 없음", "No leak events"))) + "</div>" +
      '<a class="btn-ghost ov-link" href="#/p2-grid">' + esc(L("누수 대응 보기 →", "Leak response →")) + "</a></aside>";
  }
  var TIES = { "dsx-power-root": tiePower, "dsx-oob-root": tieOob };
  var tieBusy = {};
  function tie(id) {
    var el = $(id); if (!el || tieBusy[id] || !el.firstElementChild || el.querySelector(".ov-tie")) return;
    tieBusy[id] = true;
    TIES[id]().then(function (html) {
      tieBusy[id] = false;
      if (el.querySelector(".ov-tie")) return;
      var box = W.document.createElement("div"); box.innerHTML = html;
      el.insertBefore(box.firstElementChild, el.firstElementChild);
    }, function () { tieBusy[id] = false; });
  }

  /* ── 진입 · 이벤트 ─────────────────────────────────────────── */
  var seq = {};
  async function paint(route) {
    var map = { "p2-grid": grid, "p2-notices": notices };
    var el = $(route + "-root"); if (!el || !map[route]) return;
    var n = seq[route] = (seq[route] || 0) + 1;
    var html = await map[route]();
    if (n === seq[route]) el.innerHTML = html;
  }
  function toast(m, k) { if (NC.toast) NC.toast(esc(m), k); }
  function boot() {
    var D = W.document;
    D.addEventListener("click", async function (e) {
      var t = e.target.closest && e.target.closest("[data-ov-run],[data-ov-curt],[data-ov-leak],[data-ov-end],[data-ov-demo],#ov-c-go,#ov-l-go");
      if (!t) return;
      if (t.dataset.ovRun) { REC.sel = t.dataset.ovRun; REC.phase = null; return recovery(); }
      if (t.dataset.ovCurt) { GRID.sel = t.dataset.ovCurt; return paint("p2-grid"); }
      if (t.dataset.ovLeak) { GRID.leak = t.dataset.ovLeak; return paint("p2-grid"); }
      if (t.dataset.ovEnd) {
        var r = await api("POST", "/api/v1/power/curtailments/" + encodeURIComponent(t.dataset.ovEnd) + "/end", {});
        toast(r.ok ? L("원복 · 정산 완료 — ", "Restored · settled — ") + t.dataset.ovEnd : L("실패: ", "Failed: ") + r.status, r.ok ? "" : "warn");
        return paint("p2-grid");
      }
      if (t.id === "ov-c-go") {
        var c = await api("POST", "/api/v1/power/curtailments", { requested_kw: +$("ov-c-kw").value, duration_s: +$("ov-c-dur").value, domain: $("ov-c-dom").value || undefined });
        if (c.ok && c.data) GRID.sel = c.data.id;
        toast(c.ok ? L("감축 시작 — ", "Curtailment started — ") + c.data.id : L("실패: ", "Failed: ") + c.status, c.ok ? "" : "warn");
        return paint("p2-grid");
      }
      if (t.id === "ov-l-go") {
        var tray = $("ov-l-tray").value.trim(), sev = $("ov-l-sev").value;
        if (!tray) return toast(L("트레이를 입력하세요", "Enter a tray"), "warn");
        var ev = { Events: [{ EventType: "Alert", EventId: "leak-console-" + Date.now(), MessageId: "EnvironmentalEvent.1.0.LeakDetected",
          Message: "Coolant leak detected on " + tray + " (" + sev + ")", Severity: sev, EventTimestamp: new Date().toISOString().slice(0, 19) + "Z",
          OriginOfCondition: { "@odata.id": "/redfish/v1/Chassis/" + tray + "/ThermalSubsystem/LeakDetection" } }] };
        var lr = await api("POST", "/api/v1/oob/events", ev);
        GRID.leak = null;
        toast(lr.ok ? L("누수 이벤트 전송 — ", "Leak event sent — ") + tray : L("실패: ", "Failed: ") + lr.status, lr.ok ? "" : "warn");
        return paint("p2-grid");
      }
      if (t.dataset.ovDemo) {
        var sid = t.dataset.ovDemo, route = /notices/.test(sid) ? "p2-notices" : "p2-grid";
        DEMO[sid] = { busy: true }; paint(route);
        await runDemo(sid); return paint(route);
      }
    });
    D.addEventListener("nc-flow-select", function (e) {
      if (!e.target.closest || !e.target.closest("#ov-rec-tl")) return;
      REC.phase = e.detail && e.detail.id; recovery().then(function () {
        var b = D.querySelector('#ov-rec-tl [data-ft-step="' + REC.phase + '"]'); if (b) b.focus();
      });
    });
    /* 언어 전환 → 현재 화면 다시 그림 (v2-ui 가 v2-recovery 는 이미 다시 부른다) */
    D.addEventListener("click", function (e) {
      if (!e.target.closest || !e.target.closest("#lang-toggle [data-lang]")) return;
      setTimeout(function () {
        var id = (W.location.hash.replace(/^#\/?/, "") || "").split("?")[0];
        if (id === "p2-grid" || id === "p2-notices") paint(id);
        Object.keys(TIES).forEach(function (k) { var el = $(k), x = el && el.querySelector(".ov-tie"); if (x) { x.remove(); tie(k); } });
      }, 0);
    });
    if (typeof MutationObserver !== "undefined") {
      Object.keys(TIES).forEach(function (id) {
        var start = function () {
          var el = $(id); if (!el) return false;
          new MutationObserver(function () { tie(id); }).observe(el, { childList: true });
          tie(id); return true;
        };
        if (!start()) D.addEventListener("DOMContentLoaded", start);
      });
    }
  }

  return { boot: boot, recovery: recovery, grid: grid, notices: notices, paint: paint, tiePower: tiePower, tieOob: tieOob,
    PHASES: PHASES, runPhases: runPhases, downtime: downtime, curtFlow: curtFlow, tierBreakdown: tierBreakdown, leakFlow: leakFlow,
    componentStatus: componentStatus, impactTone: impactTone, stepLabel: stepLabel, MOCK: MOCK, traces: function () { return TR.slice(); } };
});
