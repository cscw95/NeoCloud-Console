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
  var S = { live: null, racks: [], sel: null, run: null, sell: null, demo: [], busy: false, step: null };

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

  /* ── 렌더 (v2 디자인: 진행 막대 · 실패 콜아웃 · 단계 그룹 타임라인 · 스윔레인 · 원문 뷰어) ── */
  var LANES = [["nocp", "NeoCloud OS (NOCP)"], ["ai-infra", "AI-Infra · DCIM · Config Manager · RMS"], ["nico", "NICo"]];
  var OWNER = { 1: "nocp", 2: "nocp", 3: "ai-infra", 4: "ai-infra", 5: "nico", 6: "ai-infra", 7: "ai-infra", 8: "ai-infra",
    9: "ai-infra", 10: "nico", 11: "nico", 12: "nocp", 13: "nico", 14: "nocp", 15: "nocp" };
  var FLOW = { passed: "done", failed: "fail", running: "active", blocked: "pending", pending: "pending" };
  function no2(n) { return ("0" + n).slice(-2); }
  function stepName(s) { return (STEPS[s.no - 1] || [])[1] || s.key; }
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
  /* 단계 원본 호출 → NC.msg trace 형식 */
  function traces(calls) {
    return (calls || []).map(function (c) {
      return { method: c.method, url: c.url, status: c.status, req_body: c.request, res_body: c.response };
    });
  }
  function raw(calls) {
    if (!calls || !calls.length) return '<p class="bu-none">이 단계는 외부 호출 없이 NOCP 안에서 처리됩니다.</p>';
    return '<div class="bu-rawh">원본 요청/응답 ' + calls.length + "건</div>" +
      (NC.msg ? NC.msg.list(traces(calls), { limit: 10, newestFirst: false, openFirst: true, layout: "split",
        ariaLabel: "원본 요청/응답" }) : "");
  }
  function failStep(run) { return run && run.failed_step ? (run.steps || [])[run.failed_step - 1] : null; }
  /* 실패 콜아웃 — 무엇이 · 어디서 · 어떻게 고치는지 (색 + 아이콘 + 문장) */
  function alertBox(run) {
    var f = failStep(run);
    if (!f) {
      if (run && run.state === "sellable") return '<div class="bu-alert ok" role="status"><span class="bu-ai" aria-hidden="true">✓</span>' +
        "<div><b>15단계 모두 통과 — 판매 가능 재고에 투입됨</b><p>" + esc(run.rack) + "</p></div></div>";
      return "";
    }
    var mm = run.cable_mismatches || [];
    if (!mm.length && /mismatch/.test(f.detail || "")) {
      var m = /(\S+) expected (\S+) got (\S+)/.exec(f.detail);
      if (m) mm = [{ a: m[1], expected_b: m[2], actual_b: m[3], kind: "miswired" }];
    }
    var tbl = mm.length ? '<div class="p2-scroll"><table class="tbl bu-mm"><caption>케이블 불일치</caption><thead><tr>' +
      '<th scope="col">트레이 포트</th><th scope="col">계획 (cable plan)</th><th scope="col">실제 (LLDP)</th><th scope="col">종류</th></tr></thead><tbody>' +
      mm.map(function (x) {
        return '<tr><td class="mono">' + esc(x.a) + '</td><td class="mono">' + esc(x.expected_b) + '</td><td class="mono bu-bad">' +
          esc(x.actual_b || "—") + "</td><td>" + esc(x.kind) + "</td></tr>";
      }).join("") + "</tbody></table></div>" : "";
    return '<div class="bu-alert" role="alert"><span class="bu-ai" aria-hidden="true">✕</span><div class="bu-ab">' +
      "<b><span>" + no2(f.no) + " " + esc(stepName(f)) + "</span> <span>" + "실패 — 이후 {n}단계 차단".replace("{n}", 15 - f.no) + "</span></b>" +
      "<p>" + esc(f.detail || "") + "</p>" + tbl +
      (f.key === "cable_validation" ? '<p class="bu-fixh">조치: 계획대로 재결선한 뒤 재시도하세요. 시연에서는 주입을 해제하고 다시 시작합니다.</p>' +
        '<button type="button" class="btn" id="bu-fix"' + (S.busy || !S.live ? " disabled" : "") + ">재결선 완료 → 재시도</button>" : "") +
      "</div></div>";
  }
  function selStep(run) {
    var steps = (run && run.steps) || [];
    var pick = steps.filter(function (s) { return String(s.no) === String(S.step); })[0];
    if (pick) return pick;
    return failStep(run) || steps.filter(function (s) { return s.status !== "passed"; })[0] || steps[steps.length - 1];
  }
  function phases(run) {
    if (!run) return '<div class="bu-empty">랙을 선택하거나 시연을 실행하세요.</div>';
    var by = {}, sel = selStep(run);
    (run.steps || []).forEach(function (s) { by[s.no] = s; });
    return '<div class="bu-kb">' + PHASES.map(function (p) {
      var xs = p[1].map(function (n) { return by[n]; }).filter(Boolean);
      var ok = xs.filter(function (s) { return s.status === "passed"; }).length;
      var bad = xs.some(function (s) { return s.status === "failed"; });
      return '<section class="bu-col' + (bad ? " bad" : ok === xs.length ? " ok" : "") + '" aria-label="' + esc(p[0]) + '">' +
        '<div class="bu-ch"><span>' + esc(p[0]) + '</span><span class="tabnum">' + ok + "/" + xs.length + "</span></div>" +
        (NC.flow ? NC.flow.timeline(xs.map(function (s) {
          return { id: String(s.no), label: no2(s.no) + " " + stepName(s), status: FLOW[s.status] || "pending",
            sub: s.status === "blocked" ? "차단" : s.status === "failed" ? "실패" : null };
        }), { selectable: true, selected: sel ? String(sel.no) : null, numbered: false, ariaLabel: p[0] }) : "") +
        "</section>";
    }).join("") + "</div>";
  }
  function detail(run) {
    var s = selStep(run);
    if (!s) return "";
    var lane = (LANES.filter(function (l) { return l[0] === (s.owner || OWNER[s.no]); })[0] || [, s.owner || "—"])[1];
    return '<div class="bu-det" aria-live="polite"><div class="bu-det-h"><span class="bu-no">' + no2(s.no) + "</span><b>" +
      esc(stepName(s)) + "</b>" + stc(s.status) + '<span class="bu-own">' + "담당 {x}".replace("{x}", esc(lane)) + "</span></div>" +
      (s.detail ? '<p class="bu-detail">' + esc(s.detail) + "</p>" : "") +
      (s.started_at ? '<p class="bu-at tabnum">' + esc(String(s.started_at).replace("T", " ").slice(0, 19)) + "</p>" : "") +
      (s.no === 13 ? '<p><a href="#/p2-attest">헬스 검증 게이트 보기 →</a></p>' : s.no === 11 ? '<p><a href="#/p2-attest">증명 상태 보기 →</a></p>'
        : s.no === 9 ? '<p><a href="#/p2-firmware">펌웨어 번들 보기 →</a></p>' : "") +
      raw(s.calls) + "</div>";
  }
  function lanes(run) {
    if (!run || !NC.flow) return "";
    return NC.flow.swimlane(LANES.map(function (l) { return { id: l[0], label: l[1] }; }),
      (run.steps || []).map(function (s) {
        return { id: String(s.no), lane: s.owner || OWNER[s.no], label: no2(s.no), sub: stepName(s).split(" (")[0],
          status: FLOW[s.status] || "pending" };
      }), { ariaLabel: "구성요소별 bring-up 흐름", selectable: true, selected: (selStep(run) || {}).no + "" });
  }
  function demoLog() {
    if (!S.demo.length) return "";
    var tl = NC.flow ? NC.flow.timeline(S.demo.map(function (d, i) {
      return { id: "d" + i, label: d.title, sub: d.detail, status: d.ok ? "done" : "fail" };
    }).concat(S.busy ? [{ id: "run", label: "진행 중", status: "active" }] : []), { ariaLabel: "시연 단계", numbered: true }) : "";
    var msgs = NC.msg ? NC.msg.list(S.demo.map(function (d) {
      return { method: d.req.method, url: d.req.path, status: d.status, req_body: d.req.body, res_body: d.body };
    }), { limit: 10, ariaLabel: "시연 원본 요청/응답" }) : "";
    return '<div class="bu-demo" aria-live="polite">' + (NC.flow ? NC.flow.progress(S.demo.filter(function (d) { return d.ok; }).length,
      demoSteps().length, { label: "시연 진행", fail: S.demo.some(function (d) { return !d.ok; }) }) : "") +
      '<div class="bu-two"><div>' + tl + "</div><div>" + msgs + "</div></div></div>";
  }
  function tiles(run, sell) {
    var K = NC.kpi;
    var items = [["DCIM 랙", S.racks.length, null], ["판매 가능 랙", sell.rack_count || 0, null],
      ["판매 가능 GPU", sell.gpu_count || 0, "VR NVL72 · 72 GPU/랙"],
      ["진행", run ? run.progress.passed + "/15" : "—", run ? STATUS_KO[run.state] || run.state : null]];
    if (!K) return '<div class="kpi-band">' + items.map(function (t) {
      return '<div class="kpi"><div class="k">' + esc(t[0]) + '</div><div class="v">' + esc(t[1]) + "</div></div>"; }).join("") + "</div>";
    return K.grid(items.map(function (t) { return K.stat({ label: t[0], value: t[1], sub: t[2] }); }), { min: 160 });
  }
  function render() {
    var root = $("bringup-root");
    if (!root) return;
    var run = S.run, sell = S.sell || {};
    var opts = S.racks.map(function (r) {
      return '<option value="' + esc(r.id) + '"' + (r.id === S.sel ? " selected" : "") + ">" +
        esc(r.id + " · " + r.serial + " · " + r.state) + "</option>";
    }).join("");
    var f = failStep(run);
    root.innerHTML =
      '<div class="ph-row"><h2 class="bu-h">랙 bring-up 자동화 (15단계)</h2>' + badge() + "</div>" +
      '<div class="panel bu-hero"><div class="bu-hero-l">' +
      (run && NC.flow ? NC.flow.progress(run.progress.passed, 15, { label: run.rack, fail: !!f, big: true }) : "") +
      alertBox(run) + "</div>" + tiles(run, sell) + "</div>" +
      '<div class="panel"><div class="ph"><span class="tick"></span><span class="t">시연 · 주입</span>' +
      '<span class="c">운영자 권한</span></div><div class="bu-row">' +
      '<label for="bu-rack">랙 선택</label><select id="bu-rack">' + opts + "</select>" +
      '<button type="button" class="btn" id="bu-demo"' + (S.busy ? " disabled" : "") + ">▶ 시연 실행</button>" +
      '<button type="button" class="btn-ghost" id="bu-start"' + (S.busy || !S.sel ? " disabled" : "") + ">bring-up 시작</button>" +
      '<button type="button" class="btn-warn" id="bu-miswire"' + (S.busy || !S.sel ? " disabled" : "") + ">케이블 오결선 주입</button>" +
      '<button type="button" class="btn-ghost" id="bu-clear"' + (S.busy || !S.sel ? " disabled" : "") + ">주입 해제</button>" +
      '<a class="btn-ghost" href="#/demo-center?scenario=f23-rack-bringup">데모 센터</a>' +
      "</div>" + demoLog() + "</div>" +
      '<div class="panel"><div class="ph"><span class="tick' + (f ? " red" : " amber") + '"></span><span class="t">15단계 파이프라인</span>' +
      '<span class="c">' + esc(run ? run.rack : "") + "</span><span class=\"c\">단계를 누르면 원본 요청/응답</span></div>" + '<div class="bu-fit">' + phases(run) + detail(run) + "</div></div>" +
      (run ? '<div class="panel"><div class="ph"><span class="tick"></span><span class="t">구성요소별 흐름 (스윔레인)</span>' +
        '<span class="c">NOCP · AI-Infra · NICo</span></div><div class="bu-fit">' + lanes(run) + "</div></div>" : "");
    wire();
  }

  function wire() {
    var sel = $("bu-rack");
    if (sel && sel.addEventListener) sel.addEventListener("change", function () { S.sel = sel.value; S.step = null; show(); });
    var on = function (id, f) { var b = $(id); if (b && b.addEventListener) b.addEventListener("click", f); };
    on("bu-demo", runDemo);
    on("bu-fix", fixAndRetry);
    var root = $("bringup-root");
    if (root && root.addEventListener && !root.__buSel) {
      root.__buSel = true;
      root.addEventListener("nc-flow-select", function (e) {
        S.step = e.detail && e.detail.id; render();
        var b = root.querySelector && root.querySelector('.bu-kb [data-ft-step="' + S.step + '"]');
        if (b && b.focus) b.focus();
      });
    }
    on("bu-start", function () { action("POST", "/bringup/racks/" + encodeURIComponent(S.sel) + ":start"); });
    on("bu-miswire", function () { action("POST", "/bringup/inject", { kind: "miswire", rack: S.sel }); });
    on("bu-clear", function () { action("POST", "/bringup/inject", { kind: "clear", rack: S.sel }); });
  }

  /* 실패 콜아웃의 조치 버튼: 주입 해제 → 재시작 (시연 흐름의 5·6단계와 같음) */
  async function fixAndRetry() {
    if (!S.live) { toast("NOCP 미연동 — mock 화면에서는 실행할 수 없습니다", "warn"); return; }
    S.busy = true; render();
    try {
      await api("POST", "/bringup/inject", { kind: "clear", rack: S.sel });
      var r = await api("POST", "/bringup/racks/" + encodeURIComponent(S.sel) + ":start");
      if (r.data && r.data.steps) S.run = r.data;
      S.step = null;
    } catch (e) { toast("NOCP 연결 실패", "err"); }
    S.busy = false;
    await show();
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
    S.busy = true; S.demo = []; S.sel = DEMO_RACK; S.step = null; render();
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
    ".bu-h{font-size:var(--fs-lg,15px);margin:0 10px 0 0}.ph-row{display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap}" +
    ".bu-path{color:var(--text-3);font-size:var(--fs-xs,11px);font-family:var(--font-mono,monospace)}" +
    ".bu-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:4px 0 8px}" +
    ".bu-row label{font-size:var(--fs-xs,11px);color:var(--text-2)}.bu-row select{background:var(--surface-1);color:var(--text-1);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:5px 7px;font-size:var(--fs-sm,12px);max-width:100%}" +
    ".bu-row select:focus-visible,#bringup-root button:focus-visible,#bringup-root a:focus-visible{outline:2px solid var(--focus);outline-offset:2px}" +
    ".bu-hero{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:var(--sp-4,16px);align-items:start}" +
    ".bu-hero-l{min-width:0}.bu-fit{display:grid;grid-template-columns:minmax(0,1fr)}.bu-fit .fsl-wrap{position:relative}.bu-fit>*{min-width:0}" +
    ".bu-alert{display:flex;gap:var(--sp-3,12px);align-items:flex-start;border:1px solid var(--crit-line);background:var(--crit-bg);border-left:4px solid var(--crit);border-radius:var(--radius,8px);padding:var(--sp-3,12px);margin-top:var(--sp-2,8px)}" +
    ".bu-alert.ok{border-color:var(--ok-line);background:var(--ok-bg);border-left-color:var(--ok)}" +
    ".bu-ai{flex:0 0 28px;height:28px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:var(--fw-bold,700);background:var(--crit);color:var(--on-crit)}" +
    ".bu-alert.ok .bu-ai{background:var(--ok-bg);color:var(--ok);box-shadow:inset 0 0 0 2px var(--ok)}" +
    ".bu-ab{min-width:0;flex:1}.bu-alert b{color:var(--text-1);font-size:var(--fs-md,13px)}.bu-alert p{margin:4px 0;color:var(--text-1);font-size:var(--fs-sm,12px);overflow-wrap:anywhere}" +
    ".bu-mm{margin:6px 0;font-size:var(--fs-xs,11px)}.bu-mm caption{text-align:left;color:var(--text-2);font-size:var(--fs-xs,11px);padding-bottom:2px}" +
    ".bu-mm .mono{font-family:var(--font-mono,monospace);overflow-wrap:anywhere}.bu-bad{color:var(--crit);font-weight:var(--fw-bold,700)}" +
    ".bu-fixh{color:var(--text-2)!important}" +
    ".bu-kb{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}" +
    ".bu-col{border:1px solid var(--border);border-top:3px solid var(--border-strong);border-radius:var(--radius,8px);padding:6px;background:var(--surface-1);min-width:0}" +
    ".bu-col.ok{border-top-color:var(--ok)}.bu-col.bad{border-top-color:var(--crit)}" +
    ".bu-ch{display:flex;justify-content:space-between;font-size:var(--fs-xs,11px);color:var(--text-2);font-weight:var(--fw-semi,600);margin:0 2px 4px}" +
    ".bu-det{margin-top:var(--sp-3,12px);border:1px solid var(--border);border-radius:var(--radius,8px);padding:var(--sp-3,12px);background:var(--surface-2)}" +
    ".bu-det-h{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.bu-det-h b{font-size:var(--fs-md,13px)}" +
    ".bu-no{font-family:var(--font-mono,monospace);color:var(--text-2)}.bu-own{margin-left:auto;color:var(--text-2);font-size:var(--fs-xs,11px)}" +
    ".bu-detail{color:var(--text-1);overflow-wrap:anywhere;font-size:var(--fs-sm,12px)}.bu-at{color:var(--text-3);font-size:var(--fs-xs,11px);margin:2px 0}" +
    ".bu-rawh{font-size:var(--fs-xs,11px);color:var(--text-2);font-weight:var(--fw-semi,600);margin:8px 0 4px}.bu-none{color:var(--text-2);font-size:var(--fs-sm,12px)}" +
    ".bu-empty{color:var(--text-2);padding:12px}" +
    ".bu-demo{margin-top:8px}.bu-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:12px}" +
    "@media (max-width:1100px){.bu-hero{grid-template-columns:1fr}.bu-kb{grid-template-columns:repeat(2,minmax(0,1fr))}.bu-two{grid-template-columns:1fr}}" +
    "@media (max-width:560px){.bu-kb{grid-template-columns:1fr}.bu-own{margin-left:0}}";
  document.head.appendChild(css);

  NC.bringupScreen = show;
  NC.bringupSelect = function (no) { S.step = no == null ? null : String(no); render(); };
  NC.bringupMock = { run: mockRun, racks: mockRacks, steps: STEPS };
  if (NC.bus) NC.bus.on("route", function (id) { return id === ROUTE ? show() : null; });
})();
