/* 랙 bring-up 칸반 (F23) — DCIM 랙 · 15단계 진행 · 원본 요청/응답 · 시연 실행 · 주입.
   데이터: NOCP /api/v1/dcim · /api/v1/bringup (에뮬레이터 직접 호출 없음).
   NOCP 미기동 시 결정적 mock(04단계 케이블 불일치 예시)과 mock 배지.
   라우트 진입은 NC.bus "route" 이벤트로 감지. 문자열은 KO 원문 — EN은 shared/i18n-ops.js. */
(function () {
  var NC = window.NC = window.NC || {};
  var ROUTE = "bringup";
  var DEMO_SERIAL = "SN-DEMO-0001", DEMO_RACK = "bu-sn-demo-0001";
  var STEPS = [
    ["dcim_register", "DCIM 등록 (시리얼·위치·케이블 계획)"], ["dcim_event", "DCIM 이벤트 발행"],
    ["switch_ztp", "스위치 ZTP"], ["cable_validation", "LLDP 케이블 검증"],
    ["nico_register", "NICo expected-rack 등록"], ["redfish_discovery", "Redfish 발견 · SKU 대조"],
    ["rms_power_on", "RMS 랙 전원 켜기"], ["tray_power_inventory", "트레이 · 파워셸프 전원·인벤토리"],
    ["firmware_bundle", "펌웨어 번들 (BMC → BF → GPU)"], ["nvlink_partition", "NVLink 기본 파티션"],
    ["attestation", "DPU 페어링 · measured boot · TPM 증명"], ["cluster_readiness", "클러스터 준비 점검"],
    ["health_validation", "헬스 검증 (DCGM · NVLink · IB · NCCL)"], ["report", "통과/실패 보고"],
    ["sellable", "판매 가능 재고 투입"]];
  var PHASES = [["등록", [1, 2]], ["네트워크", [3, 4]], ["전원 · 인벤토리", [5, 6, 7, 8]],
    ["펌웨어 · 증명", [9, 10, 11]], ["검증 · 재고", [12, 13, 14, 15]]];
  var STATUS_KO = { pending: "대기", running: "진행 중", passed: "통과", failed: "실패", blocked: "차단" };
  var S = { live: null, racks: [], sel: null, run: null, sell: null, demo: [], busy: false };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function $(id) { return document.getElementById(id); }
  function toast(m, k) { if (NC.toast) NC.toast(esc(m), k); }
  function base() {
    try { return window.localStorage.getItem("nc-nocp") || "http://127.0.0.1:8000"; }
    catch (e) { return "http://127.0.0.1:8000"; }
  }
  function headers() {
    var A = window.NC_AUTH;
    var s = typeof NC.session === "function" ? NC.session() : null;
    return A ? A.headers(s, window, A.token(window)) : {};
  }
  /* NOCP 호출 → {status, data, req}. 네트워크 실패 시 throw {network:true} */
  async function api(method, path, body) {
    var h = headers();
    if (body !== undefined) h["Content-Type"] = "application/json";
    var r;
    try {
      r = await fetch(base() + "/api/v1" + path, { method: method, headers: h,
        body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch (e) { throw { network: true, message: e && e.message }; }
    var txt = await r.text(), j = null;
    try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = txt; }
    return { status: r.status, data: j, req: { method: method, path: "/api/v1" + path, body: body } };
  }

  /* ── 결정적 mock (NOCP 미연동) ─────────────────────────────── */
  function mockRun() {
    return { rack: DEMO_RACK, state: "failed", failed_step: 4, source: "mock",
      progress: { passed: 3, total: 15 },
      steps: STEPS.map(function (s, i) {
        var n = i + 1;
        return { no: n, key: s[0], status: n < 4 ? "passed" : n === 4 ? "failed" : "blocked",
          detail: n === 4 ? "1 cable mismatch(es): " + DEMO_RACK + "-tray-04:p0 expected " +
            DEMO_RACK + "-leaf-sw-0:swp5 got " + DEMO_RACK + "-leaf-sw-0:swp30" : null, calls: [] };
      }) };
  }
  function mockRacks() {
    return [{ id: DEMO_RACK, serial: DEMO_SERIAL, site: "gasan", row: "DEMO", position: "01",
      state: "failed", gpus: 72, status: { value: "planned", label: "Planned" } }];
  }

  async function load() {
    try {
      var r = await api("GET", "/dcim/racks");
      if (r.status >= 400) throw { http: r.status };
      S.live = true;
      S.racks = (r.data && (r.data.results || r.data.racks)) || [];
      var sl = await api("GET", "/dcim/sellable");
      S.sell = sl.status < 400 ? sl.data : null;
      if (!S.sel && S.racks.length) S.sel = S.racks[S.racks.length - 1].id;
      if (S.sel) {
        var b = await api("GET", "/bringup/racks/" + encodeURIComponent(S.sel));
        S.run = b.status < 400 ? b.data : null;
      }
    } catch (e) {
      S.live = false; S.racks = mockRacks(); S.sel = DEMO_RACK; S.run = mockRun();
      S.sell = { rack_count: 0, tray_count: 0, gpu_count: 0 };
    }
  }

  /* ── 렌더 ─────────────────────────────────────────────────── */
  function badge() {
    return S.live
      ? '<span class="obs-src src-badge live" role="status">● NOCP 라이브</span><span class="bu-path">/api/v1/dcim · /api/v1/bringup</span>'
      : '<span class="obs-src src-badge mock" role="status">◌ NOCP 미연동 — mock</span>';
  }
  function stc(s) {
    var c = { passed: "green", failed: "red", blocked: "amber", running: "blue", pending: "blue",
      sellable: "green", planned: "blue", installed: "blue", bringup: "amber", validating: "amber" }[s] || "blue";
    return '<span class="st ' + c + '">' + esc(STATUS_KO[s] || s) + "</span>";
  }
  function raw(calls) {
    if (!calls || !calls.length) return "";
    return '<details class="bu-raw"><summary>원본 요청/응답 ' + calls.length + "건</summary>" +
      calls.map(function (c) {
        return '<div class="bu-call"><code>' + esc(c.method + " " + c.url) + " → " + esc(c.status) +
          "</code>" + (c.request != null ? "<pre>" + esc(JSON.stringify(c.request, null, 1)) + "</pre>" : "") +
          "<pre>" + esc(typeof c.response === "string" ? c.response : JSON.stringify(c.response, null, 1)) +
          "</pre></div>";
      }).join("") + "</details>";
  }
  function card(s) {
    var name = (STEPS[s.no - 1] || [])[1] || s.key;
    return '<div class="bu-card ' + esc(s.status) + '" role="listitem" aria-label="' +
      esc(("0" + s.no).slice(-2) + " " + name + " · " + (STATUS_KO[s.status] || s.status)) + '">' +
      '<div class="bu-no">' + ("0" + s.no).slice(-2) + " " + stc(s.status) + "</div>" +
      '<div class="bu-name">' + esc(name) + "</div>" +
      (s.detail ? '<div class="bu-detail">' + esc(s.detail) + "</div>" : "") + raw(s.calls) + "</div>";
  }
  function kanban(run) {
    if (!run) return '<div class="bu-empty">랙을 선택하거나 시연을 실행하세요.</div>';
    var by = {};
    (run.steps || []).forEach(function (s) { by[s.no] = s; });
    return '<div class="bu-kb">' + PHASES.map(function (p) {
      return '<div class="bu-col"><div class="bu-ch">' + esc(p[0]) + '</div><div role="list">' +
        p[1].map(function (n) { return by[n] ? card(by[n]) : ""; }).join("") + "</div></div>";
    }).join("") + "</div>";
  }
  function demoLog() {
    if (!S.demo.length) return "";
    return '<ol class="bu-demo" aria-live="polite">' + S.demo.map(function (d) {
      return '<li class="' + (d.ok ? "ok" : "bad") + '"><b>' + (d.ok ? "✓" : "✗") + " " + esc(d.title) +
        "</b> " + esc(d.detail || "") + '<details class="bu-raw"><summary>원본 요청/응답</summary><pre>' +
        esc(d.req.method + " " + d.req.path + (d.req.body !== undefined ? "\n" + JSON.stringify(d.req.body, null, 1) : "")) +
        "</pre><pre>" + esc("HTTP " + d.status + "\n" + JSON.stringify(d.body, null, 1).slice(0, 3000)) +
        "</pre></details></li>";
    }).join("") + "</ol>";
  }
  function render() {
    var root = $("bringup-root");
    if (!root) return;
    var run = S.run, sell = S.sell || {};
    var opts = S.racks.map(function (r) {
      return '<option value="' + esc(r.id) + '"' + (r.id === S.sel ? " selected" : "") + ">" +
        esc(r.id + " · " + r.serial + " · " + r.state) + "</option>";
    }).join("");
    root.innerHTML =
      '<div class="ph-row"><h2 class="bu-h">랙 bring-up 자동화 (15단계)</h2>' + badge() + "</div>" +
      '<div class="kpi-band">' +
      '<div class="kpi"><div class="k">DCIM 랙</div><div class="v">' + S.racks.length + "</div></div>" +
      '<div class="kpi"><div class="k">판매 가능 랙</div><div class="v">' + esc(sell.rack_count || 0) + "</div></div>" +
      '<div class="kpi"><div class="k">판매 가능 GPU</div><div class="v">' + esc(sell.gpu_count || 0) + "</div></div>" +
      '<div class="kpi"><div class="k">진행</div><div class="v">' + (run ? esc(run.progress.passed) + "/15" : "—") +
      '</div><div class="s">' + (run ? stc(run.state) : "") + "</div></div></div>" +
      '<div class="panel"><div class="ph"><span class="tick"></span><span class="t">시연 · 주입</span>' +
      '<span class="c">운영자 권한</span></div><div class="bu-row">' +
      '<label for="bu-rack">랙 선택</label><select id="bu-rack">' + opts + "</select>" +
      '<button type="button" class="btn" id="bu-demo"' + (S.busy ? " disabled" : "") + ">▶ 시연 실행</button>" +
      '<button type="button" class="btn-ghost" id="bu-start"' + (S.busy || !S.sel ? " disabled" : "") + ">bring-up 시작</button>" +
      '<button type="button" class="btn-warn" id="bu-miswire"' + (S.busy || !S.sel ? " disabled" : "") + ">케이블 오결선 주입</button>" +
      '<button type="button" class="btn-ghost" id="bu-clear"' + (S.busy || !S.sel ? " disabled" : "") + ">주입 해제</button>" +
      "</div>" + demoLog() + "</div>" +
      '<div class="panel"><div class="ph"><span class="tick amber"></span><span class="t">bring-up 칸반</span>' +
      '<span class="c">' + esc(run ? run.rack : "") + "</span></div>" + kanban(run) + "</div>";
    wire();
  }

  function wire() {
    var sel = $("bu-rack");
    if (sel && sel.addEventListener) sel.addEventListener("change", function () { S.sel = sel.value; show(); });
    var on = function (id, f) { var b = $(id); if (b && b.addEventListener) b.addEventListener("click", f); };
    on("bu-demo", runDemo);
    on("bu-start", function () { action("POST", "/bringup/racks/" + encodeURIComponent(S.sel) + ":start"); });
    on("bu-miswire", function () { action("POST", "/bringup/inject", { kind: "miswire", rack: S.sel }); });
    on("bu-clear", function () { action("POST", "/bringup/inject", { kind: "clear", rack: S.sel }); });
  }

  async function action(method, path, body) {
    if (!S.live) { toast("NOCP 미연동 — mock 화면에서는 실행할 수 없습니다", "warn"); return; }
    S.busy = true; render();
    try {
      var r = await api(method, path, body);
      if (r.status >= 400) toast("요청 실패 — HTTP " + r.status, "err");
      else if (r.data && r.data.steps) S.run = r.data;
    } catch (e) { toast("NOCP 연결 실패", "err"); }
    S.busy = false;
    await show();
  }

  /* ── 시연: F23 시나리오 (app/demo/scenarios/f23_bringup.py 와 같은 순서) ── */
  function demoSteps() {
    var plan = [];
    for (var i = 0; i < 18; i++) plan.push({ a: DEMO_RACK + "-tray-" + ("0" + i).slice(-2) + ":p0",
      b: DEMO_RACK + "-leaf-sw-0:swp" + (i + 1) });
    return [
      ["데모 초기화", "POST", "/bringup/demo/reset", undefined, function (r) { return r.status === 200; }],
      ["DCIM 랙 등록", "POST", "/dcim/racks", { serial: DEMO_SERIAL, site: "gasan", row: "DEMO",
        position: "01", blueprint_key: "vr-nvl72", cable_plan: plan }, function (r) { return r.status === 201; }],
      ["케이블 오결선 주입", "POST", "/bringup/inject", { kind: "miswire", rack: DEMO_RACK, a: plan[4].a,
        actual_b: DEMO_RACK + "-leaf-sw-0:swp30" }, function (r) { return r.data && r.data.applied === true; }],
      ["bring-up 실행 → 04단계 실패", "POST", "/bringup/racks/" + DEMO_RACK + ":start", undefined,
        function (r) { return r.data && r.data.failed_step === 4; }],
      ["케이블 조치 (주입 해제)", "POST", "/bringup/inject", { kind: "clear", rack: DEMO_RACK },
        function (r) { return r.status === 200; }],
      ["재시도 → 판매 가능", "POST", "/bringup/racks/" + DEMO_RACK + ":start", undefined,
        function (r) { return r.data && r.data.state === "sellable"; }],
      ["판매 가능 재고 확인", "GET", "/dcim/sellable", undefined,
        function (r) { return r.data && r.data.rack_count >= 1; }]];
  }
  function detailOf(r) {
    var d = r.data || {};
    if (d.failed_step) return "실패 단계 " + d.failed_step + " · " + ((d.steps || [])[d.failed_step - 1] || {}).detail;
    if (d.state) return "상태 " + d.state + (d.progress ? " · " + d.progress.passed + "/15" : "");
    if (d.gpu_count != null) return "GPU " + d.gpu_count;
    return "HTTP " + r.status;
  }
  async function runDemo() {
    if (!S.live) { toast("NOCP 미연동 — mock 화면에서는 실행할 수 없습니다", "warn"); return; }
    S.busy = true; S.demo = []; S.sel = DEMO_RACK; render();
    var steps = demoSteps();
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i], r;
      try { r = await api(s[1], s[2], s[3]); }
      catch (e) { S.demo.push({ title: s[0], ok: false, detail: "NOCP 연결 실패", status: "—", body: null,
        req: { method: s[1], path: "/api/v1" + s[2], body: s[3] } }); break; }
      var ok = !!s[4](r);
      if (r.data && r.data.steps) S.run = r.data;
      S.demo.push({ title: s[0], ok: ok, detail: detailOf(r), status: r.status, body: r.data, req: r.req });
      render();
      if (!ok) break;
    }
    S.busy = false;
    await show();
  }

  async function show() { await load(); render(); }

  var css = document.createElement("style");
  css.textContent =
    ".bu-h{font-size:15px;margin:0 10px 0 0}.ph-row{display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap}" +
    ".bu-path{color:var(--muted2);font-size:11px;font-family:monospace}" +
    ".bu-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:4px 0 8px}" +
    ".bu-row label{font-size:11px;color:var(--muted)}.bu-row select{background:var(--card);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:5px 7px;font-size:11.5px}" +
    ".bu-kb{display:grid;grid-template-columns:repeat(5,minmax(150px,1fr));gap:8px;overflow-x:auto}" +
    ".bu-ch{font-size:11px;color:var(--muted);margin-bottom:6px;text-transform:uppercase}" +
    ".bu-card{border:1px solid var(--line);border-left:3px solid var(--track);border-radius:6px;padding:7px 8px;margin-bottom:6px;font-size:11.5px;background:var(--card)}" +
    ".bu-card.passed{border-left-color:var(--green)}.bu-card.failed{border-left-color:var(--red)}.bu-card.blocked{border-left-color:var(--amber)}" +
    ".bu-no{display:flex;justify-content:space-between;align-items:center;font-family:monospace;color:var(--muted)}" +
    ".bu-name{margin:3px 0;font-weight:600}.bu-detail{color:var(--muted);word-break:break-word}" +
    ".bu-raw summary{cursor:pointer;color:var(--muted2);font-size:11px;margin-top:4px}" +
    ".bu-raw pre{white-space:pre-wrap;word-break:break-all;max-height:180px;overflow:auto;font-size:10.5px;background:var(--track);padding:5px;border-radius:4px}" +
    ".bu-call code{font-size:10.5px}.bu-empty{color:var(--muted);padding:12px}" +
    ".bu-demo{font-size:11.5px;margin:6px 0 0 18px;padding:0}.bu-demo li{margin:3px 0}.bu-demo li.ok b{color:var(--green)}.bu-demo li.bad b{color:var(--red)}" +
    "@media (max-width:900px){.bu-kb{grid-template-columns:1fr}}";
  document.head.appendChild(css);

  NC.bringupScreen = show;
  NC.bringupMock = { run: mockRun, racks: mockRacks, steps: STEPS };
  if (NC.bus) NC.bus.on("route", function (id) { return id === ROUTE ? show() : null; });
})();
