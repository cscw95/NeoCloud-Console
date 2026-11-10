/* Phase 2 운영 화면 — 그리드 이벤트 · bring-up 파이프라인 · 펌웨어 번들 · 증명 · FinOps · 상태 공지 · 관측 지표.
   데이터: NOCP 경유만 (/api/v1/power/*, /api/v1/dcim, /api/v1/firmware, /fake-nico/hosts/{id}/attestation,
   /api/v1/finops, /api/v1/status/notices, /metrics). 에뮬레이터 직접 호출 없음.
   실패(미기동·미병합 404)는 결정적 mock + mock 배지. 시연 실행 = 단계별 실제 요청/응답 표시.
   라우트 진입은 NC.bus "route" 이벤트. 문자열은 KO 원문 — EN은 shared/i18n-ops.js. */
(function () {
  var NC = window.NC = window.NC || {};
  var ROUTES = ["p2-grid", "p2-pipeline", "p2-firmware", "p2-attest", "p2-finops", "p2-notices", "p2-metrics"];
  var S = { finBy: "tenant", finPeriod: null, rack: "su-1-rack-00", demo: {} };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function $(id) { return document.getElementById(id); }
  function fmt(n, d) {
    if (n == null || isNaN(+n)) return "—";
    return (+n).toLocaleString("en-US", { maximumFractionDigits: d == null ? 0 : d });
  }
  function won(n) { return "₩" + fmt(n); }
  function base() {
    try { return window.localStorage.getItem("nc-nocp") || "http://127.0.0.1:8000"; }
    catch (e) { return "http://127.0.0.1:8000"; }
  }
  function headers() {
    var A = window.NC_AUTH;
    var s = typeof NC.session === "function" ? NC.session() : null;
    return A ? A.headers(s, window, A.token(window)) : {};
  }
  /* NOCP 호출 → {status, data, text, req}. 네트워크 실패 → {status:0} */
  async function api(method, path, body) {
    var h = headers();
    if (body !== undefined) h["Content-Type"] = "application/json";
    var req = { method: method, path: path, body: body };
    try {
      var r = await fetch(base() + path, { method: method, headers: h,
        body: body !== undefined ? JSON.stringify(body) : undefined });
      var txt = await r.text(), j = null;
      try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = null; }
      return { status: r.status, data: j, text: txt, req: req };
    } catch (e) { return { status: 0, data: null, text: "", req: req }; }
  }
  function ok(r) { return r && r.status >= 200 && r.status < 300; }
  function badge(live, path) {
    return live
      ? '<span class="obs-src src-badge live" role="status">● NOCP 라이브</span><span class="p2-path">' + esc(path) + "</span>"
      : '<span class="obs-src src-badge mock" role="status">◌ NOCP 미연동 — mock</span><span class="p2-path">' + esc(path) + "</span>";
  }
  function kpi(k, v, s, cls) {
    return '<div class="kpi"><div class="k">' + esc(k) + '</div><div class="v' + (cls ? " " + cls : "") + '">' +
      v + '</div><div class="s">' + (s || "") + "</div></div>";
  }
  function panel(title, sub, body, tick) {
    return '<div class="panel"><div class="ph"><span class="tick' + (tick ? " " + tick : "") + '"></span><span class="t">' +
      esc(title) + '</span><span class="c">' + (sub || "") + "</span></div>" + body + "</div>";
  }
  function st(s) {
    s = String(s == null ? "—" : s);
    var c = /fail|error|breach|crit|outage/i.test(s) ? "red"
      : /active|running|bringup|validating|scheduled|degraded|pending/i.test(s) ? "amber"
      : /ok|ready|done|sellable|resolved|restored|passed|true|operational/i.test(s) ? "green" : "blue";
    return '<span class="st ' + c + '">' + esc(s) + "</span>";
  }
  function table(cols, rows) {
    return '<div class="p2-scroll"><table class="tbl"><thead><tr>' + cols.map(function (c) {
      return '<th scope="col">' + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      (rows.length ? rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + c + "</td>"; }).join("") + "</tr>"; }).join("")
        : '<tr><td colspan="' + cols.length + '">—</td></tr>') + "</tbody></table></div>";
  }
  function toast(m, k) { if (NC.toast) NC.toast(esc(m), k); }
  function lastMonth() {
    var d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 7);
  }

  var css = document.createElement("style");
  css.textContent =
    ".p2-path{color:var(--muted2);font-size:11px;margin-left:6px;font-family:monospace}" +
    ".p2-scroll{overflow-x:auto}.p2-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 12px}" +
    ".p2-row label{font-size:11px;color:var(--muted)}.p2-row input,.p2-row select,.p2-row textarea{background:var(--card);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:5px 7px;font-size:11.5px}" +
    ".p2-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}" +
    ".p2-col{border:1px solid var(--line);border-radius:8px;padding:8px;min-height:80px}.p2-col h4{margin:0 0 6px;font-size:11.5px}" +
    ".p2-card{border:1px solid var(--line-soft);border-radius:6px;padding:5px 6px;margin-bottom:5px;font-size:11px}" +
    ".p2-demo ol{margin:6px 0 0;padding-left:18px;font-size:11.5px}.p2-demo li{margin:3px 0}" +
    ".p2-demo pre{white-space:pre-wrap;word-break:break-all;font-size:10.5px;background:var(--track);padding:6px;border-radius:6px;max-height:160px;overflow:auto}" +
    ".p2-metrics pre{white-space:pre;overflow:auto;max-height:360px;font-size:10.5px;background:var(--track);padding:8px;border-radius:6px}";
  if (document.head && document.head.appendChild) document.head.appendChild(css);

  /* ── 시연 실행 (단계 진행 + 실제 요청/응답) ─────────────────── */
  var DEMOS = {
    "p2-notices": { id: "f13-status-notices", steps: [
      ["이전 시연 공지 정리", "POST", "/api/v1/status/notices/demo/reset"],
      ["계획 점검 공지 (내일)", "POST", "/api/v1/status/notices", function () {
        var t = new Date(Date.now() + 864e5); t.setUTCMinutes(0, 0, 0);
        return { kind: "maintenance", components: ["Storage"], start: t.toISOString(),
          end: new Date(t.getTime() + 72e5).toISOString(), message_ko: "VAST Data 스토리지 점검",
          message_en: "VAST Data storage maintenance", source: "demo" }; }, function (r) { return r.data && r.data.state === "scheduled"; }],
      ["그리드 감축 공지 (진행 중)", "POST", "/api/v1/status/notices", function () {
        return { kind: "grid_curtailment", components: ["bmaas", "token-api"], message_ko: "전력망 감축 대응 중",
          message_en: "Grid curtailment in progress", source: "demo" }; }, function (r, c) { c.grid = r.data && r.data.id; return r.data && r.data.state === "active"; }],
      ["공개 상태 페이지 확인", "GET", "/api/v1/status", null, function (r) { return r.data && (r.data.notices || []).length >= 2; }],
      ["감축 종료 → 공지 해제", "POST", function (c) { return "/api/v1/status/notices/" + c.grid + "/resolve"; }, function () { return {}; },
        function (r) { return r.data && r.data.state === "resolved"; }]] },
    "p2-finops": { id: "f27-finops", steps: [
      ["테넌트별 원가 (지난달)", "GET", function () { return "/api/v1/finops/cost?by=tenant&period=" + lastMonth(); }, null,
        function (r) { return r.data && r.data.totals && r.data.totals.total_cost_krw > 0; }],
      ["전력 도메인 조회", "GET", "/api/v1/power/domains", null, function (r, c) {
        c.dom = ((r.data && (r.data.domains || r.data.items)) || [{}])[0].id; return !!c.dom; }],
      ["그리드 감축 주입 (400 kW · 30분)", "POST", "/api/v1/power/flex-events", function (c) {
        return { domain: c.dom, reduce_kw: 400, duration_s: 1800, source: "demo-grid-operator" }; }],
      ["수요반응 정산 확인", "GET", "/api/v1/finops/dr-settlements", null, function (r) { return r.data && r.data.totals && r.data.totals.count > 0; }]] },
    "p2-metrics": { id: "f26-metrics", steps: [
      ["NOCP /metrics 수집", "GET", "/metrics", null, function (r) { return /# TYPE nocp_sla_availability_ratio gauge/.test(r.text); }],
      ["OTLP push 상태", "GET", "/api/v1/observability/otlp"]] },
    "p2-grid": { id: "f27-finops", steps: [
      ["전력 도메인 조회", "GET", "/api/v1/power/domains", null, function (r, c) {
        c.dom = ((r.data && (r.data.domains || r.data.items)) || [{}])[0].id; return !!c.dom; }],
      ["그리드 감축 주입 (400 kW · 30분)", "POST", "/api/v1/power/flex-events", function (c) {
        return { domain: c.dom, reduce_kw: 400, duration_s: 1800, source: "demo-grid-operator" }; }],
      ["감축 실행 조회", "GET", "/api/v1/power/curtailments"],
      ["수요반응 정산 확인", "GET", "/api/v1/finops/dr-settlements"]] }
  };
  function demoBox(route) {
    var d = DEMOS[route], run = S.demo[route];
    var links = '<a class="btn-ghost" href="#/demo-center">데모 센터</a>';
    if (!d) return panel("시연", links, '<p class="p2-path">bring-up 시나리오 f23 · f24 · f25</p>');
    var list = run ? "<ol>" + run.map(function (s) {
      return "<li>" + st(s.state) + " " + esc(s.title) + ' <span class="p2-path">' + esc(s.method + " " + s.path) +
        " → " + esc(s.status) + "</span>" + (s.body ? "<pre>" + esc(s.body) + "</pre>" : "") + "</li>";
    }).join("") + "</ol>" : "";
    return '<div class="p2-demo">' + panel("시연 실행", '<button type="button" class="btn-ghost" data-p2-demo="' + route +
      '">시연 실행</button> ' + links, '<div aria-live="polite">' + list + "</div>") + "</div>";
  }
  async function runDemo(route) {
    var d = DEMOS[route]; if (!d) return;
    var ctx = {}, out = [];
    S.demo[route] = out;
    for (var i = 0; i < d.steps.length; i++) {
      var s = d.steps[i];
      var path = typeof s[2] === "function" ? s[2](ctx) : s[2];
      var body = s[3] ? s[3](ctx) : undefined;
      var rec = { title: s[0], method: s[1], path: path, state: "running", status: "…" };
      out.push(rec); await render(route);
      var r = await api(s[1], path, body);
      var pass = ok(r) && (!s[4] || s[4](r, ctx));
      rec.status = r.status || "offline";
      rec.state = pass ? "passed" : r.status === 404 ? "pending" : "failed";
      rec.body = (r.text || "").slice(0, 600);
    }
    await render(route);
  }

  /* ── 결정적 mock ───────────────────────────────────────────── */
  var MOCK = {
    curt: { items: [{ id: "curt-0001", load_target_id: "lts-demo-1", site: "gasan", requested_kw: 900, achieved_kw: 860,
      state: "restored", actions: [{ kind: "quota_override", target: "tnt-batch/batch", amount: 240 },
        { kind: "dps_cap", target: "su-2-rack-03", amount: 620 }], protected: ["tnt-reserved"] }] },
    racks: [{ id: "bu-sn-demo-0001", serial: "SN-DEMO-0001", site: "gasan", state: "failed" },
      { id: "su-1-rack-00", serial: "SN-0000", site: "gasan", state: "sellable" }],
    bundles: { bundles: [{ version: "2026.11-vr", components: { bmc: "1.4.2", bf: "3.2.1", gpu: "R590.17", nvswitch: "1.12", cx: "28.45" } }],
      apply_order: ["bmc", "bf", "gpu"] },
    plans: { plans: [{ id: "fwp-0001", rack: "su-1-rack-00", bundle: "2026.11-vr", state: "done" }] },
    cost: { period: "2026-10", by: "tenant", currency: "KRW", power_source: "model",
      totals: { racks: 140, energy_kwh: 7304220, energy_cost_krw: 1351280700, depreciation_krw: 13317260320,
        total_cost_krw: 14668541020, dr_incentive_krw: 260000, net_cost_krw: 14668281020 },
      items: [{ key: "unallocated", kind: "idle", racks: 140, energy_kwh: 7304220, energy_cost_krw: 1351280700,
        depreciation_krw: 13317260320, total_cost_krw: 14668541020 }],
      assumptions: { tariff_krw_per_kwh: 185, pue: 1.25, depreciation: { years: 5 } } },
    drs: { source: "flex-events", totals: { count: 1, kwh: 200, incentive_krw: 260000 },
      items: [{ id: "drs-flex-0001", achieved_kw: 400, hours: 0.5, kwh: 200, incentive_krw: 260000, source: "flex-events" }] },
    notices: { items: [{ id: "ntc-0001", kind: "grid_curtailment", components: ["bmaas", "token-api"], state: "active",
      start: "2026-11-10T10:00:00+00:00", message_ko: "전력망 감축 대응 중", message_en: "Grid curtailment in progress" }] },
    metrics: "# HELP nocp_sla_target_ratio Monthly availability SLA target.\n# TYPE nocp_sla_target_ratio gauge\nnocp_sla_target_ratio 0.999\n"
  };

  /* ── 화면 ──────────────────────────────────────────────────── */
  async function grid() {
    var c = await api("GET", "/api/v1/power/curtailments");
    var f = await api("GET", "/api/v1/power/flex-events");
    var n = await api("GET", "/api/v1/status/notices?kind=grid_curtailment");
    var d = await api("GET", "/api/v1/finops/dr-settlements");
    var live = ok(f) || ok(c);
    var runs = ok(c) ? (c.data.items || c.data || []) : (live ? [] : MOCK.curt.items);
    var flex = ok(f) ? (Array.isArray(f.data) ? f.data : f.data.items || []) : [];
    var notices = ok(n) ? n.data.items : (live ? [] : MOCK.notices.items);
    var drs = ok(d) ? d.data : MOCK.drs;
    var active = runs.filter(function (r) { return r.state === "active"; });
    var req = active.reduce(function (a, r) { return a + (+r.requested_kw || 0); }, 0);
    var ach = active.reduce(function (a, r) { return a + (+r.achieved_kw || 0); }, 0);
    return '<div class="filters" style="margin-bottom:14px">' + badge(live, "/api/v1/power/curtailments · flex-events") +
      (ok(c) || !live ? "" : '<span class="p2-path">F21 미병합 — flex-events만 표시</span>') + "</div>" +
      '<div class="kpi-band">' + kpi("감축 실행", fmt(runs.length), "Load Target Set") +
      kpi("진행 중", fmt(active.length), "", active.length ? "amber" : "green") +
      kpi("요청 kW", fmt(req), "") + kpi("달성 kW", fmt(ach), "", ach < req ? "amber" : "green") +
      kpi("수요반응 정산", won(drs.totals && drs.totals.incentive_krw), fmt(drs.totals && drs.totals.kwh, 1) + " kWh") + "</div>" +
      panel("감축 실행 (예약 고객 보호)", "", table(["ID", "Load Target", "요청 kW", "달성 kW", "조치", "상태"], runs.map(function (r) {
        return [esc(r.id), esc(r.load_target_id || "—"), fmt(r.requested_kw), fmt(r.achieved_kw),
          esc((r.actions || []).map(function (a) { return a.kind + ":" + a.target; }).join(", ") || "—"), st(r.state)];
      }))) +
      panel("Flex 이벤트", "", table(["ID", "도메인", "감축 kW", "기간(s)", "상태"], flex.map(function (e) {
        return [esc(e.id), esc(e.domain), fmt(e.reduce_kw), fmt(e.duration_s), st(e.state || e.status)];
      }))) +
      panel("그리드 감축 공지", "", table(["ID", "구성요소", "시작", "상태"], notices.map(function (x) {
        return [esc(x.id), esc((x.components || []).join(", ")), esc(x.start), st(x.state)];
      }))) + demoBox("p2-grid");
  }

  var PIPE = ["planned", "installed", "bringup", "validating", "sellable", "failed"];
  async function pipeline() {
    var r = await api("GET", "/api/v1/dcim/racks");
    var live = ok(r);
    var racks = live ? (r.data.results || r.data.racks || []) : MOCK.racks;
    var cols = PIPE.map(function (p) {
      var xs = racks.filter(function (x) { return (x.state || (x.status && x.status.value)) === p; });
      return '<div class="p2-col"><h4>' + st(p) + " " + xs.length + "</h4>" + xs.map(function (x) {
        return '<div class="p2-card"><b>' + esc(x.id) + "</b><br>" + esc(x.serial || "") + " · " + esc(x.site || "") +
          ' <a href="#/bringup">15단계 보기</a></div>';
      }).join("") + "</div>";
    }).join("");
    return '<div class="filters" style="margin-bottom:14px">' + badge(live, "/api/v1/dcim/racks") + "</div>" +
      '<div class="kpi-band">' + kpi("등록 랙", fmt(racks.length), "DCIM") +
      kpi("판매 가능", fmt(racks.filter(function (x) { return x.state === "sellable"; }).length), "", "green") +
      kpi("실패", fmt(racks.filter(function (x) { return x.state === "failed"; }).length), "", "red") + "</div>" +
      panel("bring-up 파이프라인", "planned → installed → bringup → validating → sellable | failed", '<div class="p2-cols">' + cols + "</div>") +
      demoBox("p2-pipeline");
  }

  async function firmware() {
    var b = await api("GET", "/api/v1/firmware/bundles");
    var p = await api("GET", "/api/v1/firmware/plans");
    var live = ok(b);
    var bd = live ? b.data : MOCK.bundles, pl = ok(p) ? p.data : (live ? { plans: [] } : MOCK.plans);
    return '<div class="filters" style="margin-bottom:14px">' + badge(live, "/api/v1/firmware/bundles · plans") + "</div>" +
      panel("펌웨어 번들 (nvfwupd형)", "BMC → BF → GPU · " + esc((bd.apply_order || []).join(" → ")),
        table(["버전", "BMC", "BlueField", "GPU", "NVSwitch", "ConnectX"], (bd.bundles || []).map(function (x) {
          var c = x.components || {};
          return [esc(x.version), esc(c.bmc), esc(c.bf), esc(c.gpu), esc(c.nvswitch), esc(c.cx)];
        }))) +
      panel("적용 계획 (유휴 호스트만)", "", table(["ID", "랙", "번들", "상태"], (pl.plans || []).map(function (x) {
        return [esc(x.id), esc(x.rack), esc(x.bundle), st(x.state)];
      }))) + demoBox("p2-firmware");
  }

  async function attest() {
    var rack = S.rack, rows = [], live = null;
    for (var t = 0; t < 18; t++) {
      var host = "nh-" + rack + "-tray-" + (t < 10 ? "0" : "") + t;
      var r = live === false ? null : await api("GET", "/fake-nico/hosts/" + host + "/attestation");
      if (live === null) live = ok(r);                 /* 첫 응답으로 라이브/mock 결정 */
      var a = live && ok(r) ? r.data : { attested: t !== 4, measured_boot: t === 4 ? "failed" : "passed",
        tpm: { 0: "-", 7: "-" }, source: "mock" };
      rows.push([esc(host), st(a.attested === false ? "failed" : "passed"), esc(a.measured_boot),
        fmt(Object.keys(a.tpm || a.pcrs || {}).length), esc(a.source)]);
    }
    var bad = rows.filter(function (r) { return /failed/.test(r[1]); }).length;
    return '<div class="filters" style="margin-bottom:14px">' + badge(live, "/fake-nico/hosts/{id}/attestation") +
      '<span class="rt"><label for="p2-rack">랙</label> <input id="p2-rack" value="' + esc(rack) + '" style="width:130px"> ' +
      '<button type="button" class="btn-ghost" id="p2-rack-go">조회</button></span></div>' +
      '<div class="kpi-band">' + kpi("트레이", fmt(rows.length), "") + kpi("증명 실패", fmt(bad), "", bad ? "red" : "green") + "</div>" +
      panel("measured boot · TPM · DPU 증명", "NICo measured-boot", table(["호스트", "증명", "measured boot", "PCR", "출처"], rows)) +
      demoBox("p2-attest");
  }

  async function finops() {
    var period = S.finPeriod || lastMonth();
    var c = await api("GET", "/api/v1/finops/cost?by=" + S.finBy + "&period=" + period);
    var d = await api("GET", "/api/v1/finops/dr-settlements");
    var live = ok(c);
    var cost = live ? c.data : MOCK.cost, drs = ok(d) ? d.data : MOCK.drs, t = cost.totals || {};
    var a = cost.assumptions || {};
    return '<div class="filters" style="margin-bottom:14px">' + badge(live, "/api/v1/finops/cost · dr-settlements") +
      '<span class="rt"><label for="p2-fin-period">기간</label> <input id="p2-fin-period" type="month" value="' + esc(period) + '"> ' +
      '<label for="p2-fin-by">기준</label> <select id="p2-fin-by">' + ["rack", "tenant", "model"].map(function (b) {
        return '<option value="' + b + '"' + (S.finBy === b ? " selected" : "") + ">" + b + "</option>"; }).join("") +
      "</select></span></div>" +
      '<div class="kpi-band">' + kpi("총원가", won(t.total_cost_krw), esc(cost.period)) +
      kpi("전력비", won(t.energy_cost_krw), fmt(t.energy_kwh) + " kWh") + kpi("감가상각", won(t.depreciation_krw), "") +
      kpi("수요반응 인센티브", won(t.dr_incentive_krw), "", "green") + kpi("순원가", won(t.net_cost_krw), "") + "</div>" +
      panel("원가 배분", "power " + esc(cost.power_source) + ((cost.meta && cost.meta.note) ? " · " + esc(cost.meta.note) : ""),
        table(["키", "종류", "랙", "kWh", "전력비", "감가상각", "합계"], (cost.items || []).slice(0, 50).map(function (x) {
          return [esc(x.key), esc(x.kind), fmt(x.racks), fmt(x.energy_kwh), won(x.energy_cost_krw), won(x.depreciation_krw), won(x.total_cost_krw)];
        }))) +
      panel("수요반응 정산", esc(drs.source), table(["ID", "달성 kW", "시간(h)", "kWh", "인센티브"], (drs.items || []).map(function (x) {
        return [esc(x.id), fmt(x.achieved_kw, 1), fmt(x.hours, 2), fmt(x.kwh, 1), won(x.incentive_krw)];
      }))) +
      panel("가정 단가", "", '<p class="p2-path">tariff ' + esc(a.tariff_krw_per_kwh) + " KRW/kWh · PUE " + esc(a.pue) +
        " · straight-line " + esc(a.depreciation && a.depreciation.years) + "y</p>") + demoBox("p2-finops");
  }

  async function notices() {
    var r = await api("GET", "/api/v1/status/notices");
    var live = ok(r), items = live ? r.data.items : MOCK.notices.items;
    var form = '<div class="p2-row"><label for="p2-n-kind">종류</label><select id="p2-n-kind">' +
      ["incident", "maintenance", "grid_curtailment"].map(function (k) { return "<option>" + k + "</option>"; }).join("") +
      '</select><label for="p2-n-comp">구성요소</label><input id="p2-n-comp" value="Compute" style="width:140px">' +
      '<label for="p2-n-ko">메시지 (KO)</label><input id="p2-n-ko" style="width:200px">' +
      '<label for="p2-n-en">메시지 (EN)</label><input id="p2-n-en" style="width:200px">' +
      '<button type="button" class="btn-ghost" id="p2-n-create">공지 등록</button></div>';
    return '<div class="filters" style="margin-bottom:14px">' + badge(live, "/api/v1/status/notices") + "</div>" +
      panel("공지 등록 (운영자)", "", form) +
      panel("상태 페이지 공지", "incident · maintenance · grid_curtailment", table(["ID", "종류", "구성요소", "시작", "종료", "상태", ""], items.map(function (x) {
        return [esc(x.id), esc(x.kind), esc((x.components || []).join(", ")), esc(x.start), esc(x.end || "—"), st(x.state),
          x.state !== "resolved" ? '<button type="button" class="btn-ghost" data-p2-resolve="' + esc(x.id) + '">해제</button>' : ""];
      }))) + demoBox("p2-notices");
  }

  async function metrics() {
    var r = await api("GET", "/metrics");
    var live = ok(r), text = live ? r.text : MOCK.metrics;
    var fams = (text.match(/^# TYPE /gm) || []).length, series = text.split("\n").filter(function (l) { return l && l[0] !== "#"; }).length;
    var pick = text.split("\n").filter(function (l) {
      return /^(# TYPE )?nocp_(sla_availability|status_component|curtailment|token_quota|remediation|dr_)/.test(l);
    }).slice(0, 80).join("\n");
    return '<div class="filters" style="margin-bottom:14px">' + badge(live, "/metrics (text/plain; version=0.0.4)") + "</div>" +
      '<div class="kpi-band">' + kpi("지표 묶음", fmt(fams), "# TYPE") + kpi("시계열", fmt(series), "") + "</div>" +
      '<div class="p2-metrics">' + panel("NOCP 지표 (SLA · 쿼터 · 감축 · 복구)", "Prometheus exposition", "<pre>" + esc(pick || text) + "</pre>") + "</div>" +
      demoBox("p2-metrics");
  }

  var R = { "p2-grid": grid, "p2-pipeline": pipeline, "p2-firmware": firmware, "p2-attest": attest,
    "p2-finops": finops, "p2-notices": notices, "p2-metrics": metrics };
  var seq = {};
  async function render(route) {
    var root = $(route + "-root");
    if (!root || !R[route]) return;
    var n = seq[route] = (seq[route] || 0) + 1;
    var html = await R[route]();
    if (n === seq[route]) root.innerHTML = html;      /* 늦게 끝난 이전 렌더가 덮어쓰지 않게 */
  }
  NC.phase2 = { render: render, runDemo: runDemo, routes: ROUTES, api: api };

  if (NC.bus) NC.bus.on("route", function (id) { if (R[id]) return render(id); });

  if (document.addEventListener) document.addEventListener("click", async function (e) {
    var t = e.target && e.target.closest && e.target.closest("[data-p2-demo],[data-p2-resolve],#p2-n-create,#p2-rack-go");
    if (!t) return;
    if (t.dataset.p2Demo) return runDemo(t.dataset.p2Demo);
    if (t.dataset.p2Resolve) {
      var r = await api("POST", "/api/v1/status/notices/" + encodeURIComponent(t.dataset.p2Resolve) + "/resolve", {});
      toast(ok(r) ? "공지 해제됨" : "해제 실패", ok(r) ? "ok" : "err");
      return render("p2-notices");
    }
    if (t.id === "p2-rack-go") { S.rack = ($("p2-rack").value || S.rack).trim(); return render("p2-attest"); }
    if (t.id === "p2-n-create") {
      var body = { kind: $("p2-n-kind").value, components: $("p2-n-comp").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean),
        message_ko: $("p2-n-ko").value || "공지", message_en: $("p2-n-en").value || "Notice" };
      var c = await api("POST", "/api/v1/status/notices", body);
      toast(ok(c) ? "공지 등록됨" : "등록 실패", ok(c) ? "ok" : "err");
      return render("p2-notices");
    }
  });
  if (document.addEventListener) document.addEventListener("change", function (e) {
    var t = e.target;
    if (!t || !t.id) return;
    if (t.id === "p2-fin-by") { S.finBy = t.value; render("p2-finops"); }
    if (t.id === "p2-fin-period") { S.finPeriod = t.value; render("p2-finops"); }
  });
})();
