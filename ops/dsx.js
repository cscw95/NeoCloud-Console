/* DSX OS 운영 화면 — OOB 모니터링 · MaxLPS 전력 · 버전 매트릭스 · RMA/펌웨어 · 미터링.
   데이터: NC.dsx (shared/dsx-api.js) — NOCP /api/v1 경유, 미기동 시 mock 폴백.
   라우트 진입은 NC.bus "route" 이벤트로 감지(ops/app.js의 NC.start 맵 수정 없음).
   문자열은 KO 원문 — EN은 shared/i18n-ops.js 사전이 DOM 단위로 번역한다. */
(function () {
  var NC = window.NC = window.NC || {};
  var D = NC.dsx;
  if (!D) return;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(n, d) {
    if (n == null || isNaN(+n)) return "—";
    return (+n).toLocaleString("en-US", { maximumFractionDigits: d == null ? 0 : d });
  }
  function $(id) { return document.getElementById(id); }
  function toast(m, k) { if (NC.toast) NC.toast(esc(m), k); }
  function src(res) {
    return res && res.live
      ? '<span class="obs-src src-badge live" role="status">● NOCP 라이브</span><span class="dsx-path">' + esc(res.src) + "</span>"
      : '<span class="obs-src src-badge mock" role="status">◌ NOCP 미연동 — mock</span>';
  }
  function kpi(k, v, s, cls) {
    return '<div class="kpi"><div class="k">' + esc(k) + '</div><div class="v' + (cls ? " " + cls : "") + '">' +
      v + '</div><div class="s">' + (s || "") + "</div></div>";
  }
  function panel(title, sub, body, tick) {
    return '<div class="panel"><div class="ph"><span class="tick' + (tick ? " " + tick : "") + '"></span><span class="t">' +
      esc(title) + '</span><span class="c">' + (sub || "") + "</span></div>" + body + "</div>";
  }
  function bar(ratio, cls) {
    var p = Math.max(0, Math.min(100, Math.round((ratio || 0) * 100)));
    return '<div class="dsx-bar' + (cls ? " " + cls : "") + '"><i style="width:' + p + '%"></i></div>';
  }
  function stc(s) {
    s = String(s || "").toLowerCase();
    var c = /crit|fail|violation|down|leak/.test(s) ? "red"
      : /warn|degrad|upgrad|provision|pending|drain|isolat(e|ing)$/.test(s) ? "amber"
      : /ok|ready|running|isolated|active|done|pool_return/.test(s) ? "green" : "blue";
    return '<span class="st ' + c + '">' + esc(s || "—") + "</span>";
  }

  /* ── 스타일 (heatmap · bar · chart) ─────────────────────────── */
  var css = document.createElement("style");
  css.textContent =
    ".dsx-path{color:var(--muted2);font-size:10px;margin-left:6px;font-family:monospace}" +
    ".dsx-hm{display:grid;grid-template-columns:repeat(auto-fill,minmax(54px,1fr));gap:4px}" +
    ".dsx-cell{border-radius:5px;padding:5px 4px;font-size:9.5px;line-height:1.25;cursor:pointer;color:#e8eef6;border:1px solid transparent;text-align:center}" +
    ".dsx-cell.sel{border-color:var(--green)}.dsx-cell b{display:block;font-size:10px}" +
    ".dsx-cell.ok{background:#1f3b2c}.dsx-cell.warn{background:#5a4512}.dsx-cell.crit{background:#5c1f28}.dsx-cell.off{background:var(--track)}" +
    ".dsx-bar{height:6px;border-radius:3px;background:var(--track);min-width:80px}.dsx-bar>i{display:block;height:100%;border-radius:3px;background:var(--green)}" +
    ".dsx-bar.amber>i{background:var(--amber)}.dsx-bar.red>i{background:var(--red)}" +
    ".dsx-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px}" +
    ".dsx-row label{font-size:11px;color:var(--muted)}.dsx-row input,.dsx-row select{background:var(--card);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:5px 7px;font-size:11.5px}" +
    ".dsx-ev{max-height:320px;overflow-y:auto;font-size:11px}.dsx-ev div{padding:5px 0;border-bottom:1px solid var(--line-soft)}" +
    ".dsx-cmp{display:grid;grid-template-columns:120px 1fr 1fr;gap:6px 12px;align-items:center;font-size:11.5px}" +
    ".dsx-stages{display:flex;gap:3px}.dsx-stages i{flex:1;height:6px;border-radius:2px;background:var(--track)}.dsx-stages i.on{background:var(--green)}" +
    ".dsx-legend{font-size:10.5px;color:var(--muted)}.dsx-legend span{margin-right:10px}" +
    ".dsx-tabs{display:flex;gap:6px;margin-bottom:12px}.dsx-tabs button{background:none;border:1px solid var(--line);color:var(--muted);border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer}" +
    ".dsx-tabs button.on{border-color:var(--green);color:var(--green)}";
  document.head.appendChild(css);

  /* ══ ① OOB 모니터링 ═══════════════════════════════════════════ */
  var oob = { metric: "health", site: "", sel: null, events: [], es: null, poll: null };
  var OOB_METRICS = [["health", "종합"], ["bmc", "BMC 도달성"], ["psu", "PSU"], ["leak", "Leak"],
    ["inlet", "Inlet 온도"], ["sel", "SEL Critical"]];
  function oobCls(k, m) {
    var bmcBad = k.bmc_reachable < k.bmc_total, psuBad = k.psu_ok < k.psu_total;
    var leak = String(k.leak || "OK");
    if (m === "bmc") return bmcBad ? (k.bmc_total - k.bmc_reachable > 1 ? "crit" : "warn") : "ok";
    if (m === "psu") return psuBad ? "warn" : "ok";
    if (m === "leak") return leak === "Critical" ? "crit" : leak === "Warning" ? "warn" : "ok";
    if (m === "inlet") return k.max_inlet_c >= 35 ? "crit" : k.max_inlet_c >= 31 ? "warn" : "ok";
    if (m === "sel") return k.sel_critical > 2 ? "crit" : k.sel_critical > 0 ? "warn" : "ok";
    if (leak === "Critical" || k.max_inlet_c >= 35 || k.bmc_total - k.bmc_reachable > 1) return "crit";
    if (leak === "Warning" || bmcBad || psuBad || k.sel_critical > 0 || k.max_inlet_c >= 31) return "warn";
    return "ok";
  }
  function oobVal(k, m) {
    if (m === "bmc") return k.bmc_reachable + "/" + k.bmc_total;
    if (m === "psu") return k.psu_ok + "/" + k.psu_total;
    if (m === "leak") return k.leak;
    if (m === "inlet") return fmt(k.max_inlet_c, 1) + "°";
    if (m === "sel") return String(k.sel_critical);
    return fmt(k.power_kw, 0) + "kW";
  }
  async function renderOob() {
    var root = $("dsx-oob-root");
    if (!root) return;
    var res = await D.oobSummary(oob.site);
    var rs = res.data || [];
    var bmcT = 0, bmcR = 0, psuT = 0, psuO = 0, leaks = 0, selC = 0, maxIn = 0, pw = 0, cap = 0;
    rs.forEach(function (k) {
      bmcT += +k.bmc_total || 0; bmcR += +k.bmc_reachable || 0; psuT += +k.psu_total || 0; psuO += +k.psu_ok || 0;
      if (String(k.leak || "OK") !== "OK") leaks++;
      selC += +k.sel_critical || 0; maxIn = Math.max(maxIn, +k.max_inlet_c || 0);
      pw += +k.power_kw || 0; cap += +k.cap_kw || 0;
    });
    var tabs = OOB_METRICS.map(function (m) {
      return '<button data-oob-m="' + m[0] + '" class="' + (oob.metric === m[0] ? "on" : "") + '">' + esc(m[1]) + "</button>";
    }).join("");
    var cells = rs.map(function (k) {
      return '<div class="dsx-cell ' + oobCls(k, oob.metric) + (oob.sel === k.rack ? " sel" : "") +
        '" data-oob-rack="' + esc(k.rack) + '" title="' + esc(k.rack) + '"><b>' + esc(String(k.rack).replace(/^.*?-R/, "R")) +
        "</b>" + esc(oobVal(k, oob.metric)) + "</div>";
    }).join("");
    root.innerHTML =
      '<div class="filters" style="margin-bottom:14px">' + src(res) +
      '<span style="color:var(--muted2);font-size:10.5px">Redfish Power/Thermal/Leak/SEL · BMC 도달성 · PowerShelf PSU — NOCP /oob 집계</span>' +
      '<span class="rt"><select id="dsx-oob-site"><option value="">전체 사이트</option><option value="gasan"' + (oob.site === "gasan" ? " selected" : "") +
      '>가산</option><option value="ansan"' + (oob.site === "ansan" ? " selected" : "") + ">안산</option></select></span></div>" +
      '<div class="kpi-band">' +
      kpi("랙", fmt(rs.length), "OOB 수집 대상") +
      kpi("BMC 도달성", fmt(bmcT ? bmcR / bmcT * 100 : 0, 1) + "<small>%</small>", fmt(bmcT - bmcR) + " unreachable", bmcR < bmcT ? "amber" : "green") +
      kpi("PSU 정상", fmt(psuO) + "<small>/" + fmt(psuT) + "</small>", fmt(psuT - psuO) + " fault", psuO < psuT ? "amber" : "green") +
      kpi("Leak 감지", fmt(leaks), "Warning+Critical 랙", leaks ? "red" : "green") +
      kpi("최고 Inlet", fmt(maxIn, 1) + "<small>°C</small>", "ThermalSubsystem", maxIn >= 35 ? "red" : maxIn >= 31 ? "amber" : "") +
      kpi("SEL Critical", fmt(selC), "LogServices/SEL", selC ? "amber" : "green") +
      kpi("전력", fmt(pw / 1000, 2) + "<small>MW</small>", "cap " + fmt(cap / 1000, 2) + " MW") +
      "</div>" +
      '<div class="grid" style="margin-bottom:16px">' +
      panel("랙 OOB 히트맵", '<span class="dsx-legend"><span style="color:var(--green-text)">■ 정상</span><span style="color:var(--amber)">■ 주의</span><span style="color:var(--red)">■ 위험</span></span>',
        '<div class="dsx-tabs">' + tabs + '</div><div class="dsx-hm">' + cells + "</div>") +
      panel("OOB 이벤트 스트림", '<span id="dsx-oob-evsrc">—</span>', '<div class="dsx-ev" id="dsx-oob-ev"></div>', "amber") +
      "</div>" +
      '<div id="dsx-oob-detail"></div>';
    paintEvents();
    if (oob.sel) renderOobRack(oob.sel);
    startEvents();
  }
  function paintEvents() {
    var el = $("dsx-oob-ev");
    if (!el) return;
    el.innerHTML = oob.events.slice(0, 60).map(function (e) {
      return "<div>" + stc(e.severity || "info") + ' <span class="id" style="color:var(--muted2)">' +
        esc(String(e.ts || e.timestamp || e.received_at || e.at || "").replace("T", " ").slice(5, 19)) + "</span> <b>" + esc(e.topic || "event") +
        "</b> " + esc(e.rack || e.origin || "") + " — " + esc(e.message || e.summary || "") + "</div>";
    }).join("") || '<div style="color:var(--muted)">이벤트 없음</div>';
  }
  function pushEvent(e) {
    if (!e) return;
    oob.events.unshift(e);
    if (oob.events.length > 200) oob.events.length = 200;
    paintEvents();
  }
  function setEvSrc(t) { var el = $("dsx-oob-evsrc"); if (el) el.textContent = t; }
  async function pollEvents() {
    var r = await D.oobEvents(60);
    oob.events = (r.data || []).slice();
    setEvSrc(r.live ? "폴링 · /api/v1/oob/events" : "mock 이벤트");
    paintEvents();
  }
  function startEvents() {
    if (oob.es || oob.poll) { setEvSrc(oob.es ? "SSE · /api/v1/events" : "폴링 · /api/v1/oob/events"); return; }
    pollEvents();
    oob.poll = setInterval(function () {
      if (location.hash.indexOf("#/dsx-oob") !== 0) return stopEvents();
      if (!oob.es) pollEvents();
    }, 10000);
    if (D.isLive() === false) return;          // mock 모드 — SSE 시도 생략
    oob.es = D.openEvents(pushEvent, function (st) {
      if (st === "open") setEvSrc("SSE · /api/v1/events");
      if (st === "error" && oob.es) { oob.es.close(); oob.es = null; }
    });
  }
  async function renderOobRack(id) {
    var host = $("dsx-oob-detail");
    if (!host) return;
    var res = await D.oobRack(id);
    var k = res.data || {};
    var trays = k.trays || k.machines || [];
    var shelves = k.power_shelves || [];
    var rows = trays.map(function (t) {
      var m = t.machine || t.id;
      return "<tr><td class='id'>" + esc(m) + "</td><td>" + (t.bmc_reachable === false ? stc("down") : stc("ok")) +
        "</td><td>" + fmt(t.inlet_c, 1) + "°C</td><td>" + fmt(t.power_w) + " W</td><td>" + stc(t.leak || "OK") +
        "</td><td>" + fmt(t.sel_critical || 0) + "</td><td style='white-space:nowrap'>" +
        '<button class="btn-ghost" data-oob-sel="' + esc(m) + '">SEL</button> ' +
        '<button class="btn-warn" data-oob-act="ac-power-cycle" data-m="' + esc(m) + '">AC power cycle</button> ' +
        '<button class="btn-danger" data-oob-act="gpu-reset" data-m="' + esc(m) + '">GPU reset</button></td></tr>';
    }).join("");
    var sh = shelves.map(function (p) {
      return "<tr><td class='id'>" + esc(p.id) + "</td><td>" + fmt(p.psu_ok) + "/" + fmt(p.psu_total) + "</td><td>" +
        fmt(p.output_kw, 1) + " kW</td><td>" + (p.psu_ok < p.psu_total ? stc("warning") : stc("ok")) + "</td></tr>";
    }).join("");
    host.innerHTML = panel("랙 상세 — " + id, src(res),
      '<div class="grid"><div><table class="tbl"><thead><tr><th>Machine (tray)</th><th>BMC</th><th>Inlet</th><th>전력</th><th>Leak</th><th>SEL crit</th><th>OOB 액션</th></tr></thead><tbody>' +
      rows + '</tbody></table></div><div><table class="tbl"><thead><tr><th>PowerShelf</th><th>PSU</th><th>출력</th><th>상태</th></tr></thead><tbody>' +
      (sh || "<tr><td colspan=4>—</td></tr>") + '</tbody></table><div id="dsx-oob-sel" style="margin-top:12px"></div></div></div>', "amber");
  }
  var armed = {};
  async function oobAction(btn) {
    var key = btn.dataset.oobAct + ":" + btn.dataset.m;
    if (!armed[key] || Date.now() - armed[key] > 3000) {   // 2단계 확인 (3초 내 재클릭)
      armed[key] = Date.now();
      toast("재클릭하면 실행: " + btn.dataset.oobAct + " → " + btn.dataset.m, "warn");
      return;
    }
    delete armed[key];
    var r = await D.machineAction(btn.dataset.m, btn.dataset.oobAct);
    if (r.error) toast("실패: " + r.error, "warn");
    else toast(btn.dataset.oobAct + " 요청 접수 — " + btn.dataset.m + (r.live ? "" : " (mock)"));
  }
  async function showSel(m) {
    var el = $("dsx-oob-sel");
    if (!el) return;
    var r = await D.oobSel(m);
    el.innerHTML = '<div style="font-size:11px;color:var(--muted);margin-bottom:6px">SEL — ' + esc(m) + " " + (r.live ? "" : "(mock)") +
      '</div><table class="tbl"><tbody>' + (r.data || []).map(function (e) {
        return "<tr><td>" + esc(String(e.Created || e.created || "").replace("T", " ").slice(5, 16)) + "</td><td>" +
          stc(e.Severity || e.severity) + "</td><td>" + esc(e.Message || e.message) + "</td></tr>";
      }).join("") + "</tbody></table>";
  }

  /* ══ ② MaxLPS 전력 ═══════════════════════════════════════════ */
  var pwr = { domain: null, sim: null };
  async function renderPower() {
    var root = $("dsx-power-root");
    if (!root) return;
    var dres = await D.powerDomains();
    var doms = dres.data || [];
    if (!pwr.domain || !doms.some(function (d) { return d.id === pwr.domain; })) pwr.domain = doms[0] && doms[0].id;
    var d = doms.find(function (x) { return x.id === pwr.domain; }) || {};
    var results = await Promise.all([D.powerTelemetry(pwr.domain), D.powerProfiles(), D.flexEvents()]);
    var tel = results[0].data || {}, profs = results[1].data || [], flex = results[2].data || [];
    var limit = +d.operating_limit_kw || +tel.operating_limit_kw || 0;
    var budget = +d.site_budget_kw || 0;     // NOCP ComputeBlock 예산 (PATCH 상한)
    var used = +tel.used_kw || +d.used_kw || 0;
    var groups = (tel.groups && tel.groups.length ? tel.groups : d.groups) || [];
    var racks = tel.racks || [];
    var head = limit - used;
    var opts = doms.map(function (x) {
      return '<option value="' + esc(x.id) + '"' + (x.id === pwr.domain ? " selected" : "") + ">" + esc(x.name || x.id) + "</option>";
    }).join("");
    var profOpts = function (cur) {
      return profs.map(function (p) {
        var id = p.id || p.name;
        return '<option value="' + esc(id) + '"' + (id === cur ? " selected" : "") + ">" + esc(id) + "</option>";
      }).join("");
    };
    var gRows = groups.map(function (g) {
      var gu = +g.used_kw || 0, gm = +g.max_kw || 1;
      return "<tr><td class='id'>" + esc(g.name || g.id) + "</td><td>" + esc(g.priority || "—") + "</td><td>" +
        fmt((g.racks || []).length || g.rack_count) + "</td><td>" + fmt(g.min_kw) + " / " + fmt(g.max_kw) + "</td><td>" +
        fmt(gu, 1) + "</td><td>" + bar(gu / gm, gu / gm > 0.9 ? "red" : gu / gm > 0.75 ? "amber" : "") + "</td><td>" + fmt(gm - gu, 1) + " kW</td></tr>";
    }).join("");
    var rRows = racks.slice(0, 40).map(function (k) {
      var ratio = (+k.power_kw || 0) / (+k.cap_kw || 1);
      return "<tr><td class='id'>" + esc(k.rack) + "</td><td>" + esc(k.group || "—") + "</td><td>" + fmt(k.power_kw, 1) + "</td><td>" +
        fmt(k.cap_kw, 0) + "</td><td>" + bar(ratio, ratio > 0.9 ? "red" : ratio > 0.75 ? "amber" : "") + "</td><td>" + fmt(k.headroom_kw, 1) +
        '</td><td><select data-pwr-rack="' + esc(k.rack) + '">' + profOpts(k.profile) + "</select></td></tr>";
    }).join("");
    var flexRows = flex.slice(0, 8).map(function (f) {
      return "<tr><td class='id'>" + esc(f.id) + "</td><td>" + esc(f.domain) + "</td><td>" + fmt(f.reduce_kw) + " kW</td><td>" +
        fmt(f.duration_s) + " s</td><td>" + stc(f.state || "active") + "</td></tr>";
    }).join("");
    root.innerHTML =
      '<div class="filters" style="margin-bottom:14px">' + src(dres) +
      '<span style="color:var(--muted2);font-size:10.5px">DPS(nvidia.dcpower.v1) PowerDomain · OperatingLimit · WPPS · power smoothing · DSX Flex</span>' +
      '<span class="rt"><select id="dsx-pwr-domain">' + opts + "</select></span></div>" +
      '<div class="kpi-band">' +
      kpi("OperatingLimit", fmt(limit / 1000, 2) + "<small>MW</small>", esc(d.compute_block || d.site || "")) +
      kpi("블록 예산", (budget ? fmt(budget / 1000, 2) : "—") + "<small>MW</small>",
        d.budget_ok === false ? "ComputeBlock power_mw · 초과" : "ComputeBlock power_mw", d.budget_ok === false ? "red" : "") +
      kpi("사용 전력", fmt(used / 1000, 2) + "<small>MW</small>", fmt(limit ? used / limit * 100 : 0, 1) + "% of limit", limit && used / limit > 0.9 ? "red" : "") +
      kpi("헤드룸", fmt(head, 0) + "<small>kW</small>", "limit − used", head < 0 ? "red" : "green") +
      kpi("정책 모드", esc(d.mode || "static"), d.smoothing ? "smoothing ON" : "smoothing OFF", d.mode === "dynamic" ? "green" : "amber") +
      kpi("랙", fmt(racks.length || d.racks), "ResourceGroup " + fmt(groups.length)) +
      "</div>" +
      panel("정책", "PATCH /api/v1/power/domains/{id}",
        '<div class="dsx-row"><label>모드</label>' +
        '<button class="' + (d.mode !== "dynamic" ? "btn" : "btn-ghost") + '" data-pwr-mode="static">static</button>' +
        '<button class="' + (d.mode === "dynamic" ? "btn" : "btn-ghost") + '" data-pwr-mode="dynamic">dynamic (DPS)</button>' +
        '<label style="margin-left:14px"><input type="checkbox" id="dsx-pwr-smooth"' + (d.smoothing ? " checked" : "") + "> power smoothing</label>" +
        '<label style="margin-left:14px">OperatingLimit (kW)</label><input id="dsx-pwr-limit" type="number" value="' + esc(limit) + '"' + (budget ? ' max="' + esc(budget) + '"' : "") + ' style="width:100px">' +
        (budget ? '<span style="color:var(--muted2);font-size:10.5px">블록 예산 ≤ ' + fmt(budget) + " kW</span>" : "") +
        '<button class="btn-ghost" id="dsx-pwr-limit-apply">적용</button></div>') +
      '<div class="grid">' +
      panel("ResourceGroup 헤드룸", "priority · min/max kW",
        '<table class="tbl"><thead><tr><th>그룹</th><th>우선순위</th><th>랙</th><th>min/max kW</th><th>사용 kW</th><th>사용률</th><th>헤드룸</th></tr></thead><tbody>' +
        (gRows || "<tr><td colspan=7>—</td></tr>") + "</tbody></table>") +
      panel("static vs dynamic 시뮬레이션", "POST /api/v1/power/simulate",
        '<div class="dsx-row"><label>limit kW</label><input id="dsx-sim-limit" type="number" value="' + esc(limit) + '" style="width:90px">' +
        '<label>training %</label><input id="dsx-sim-tr" type="number" min="0" max="100" value="60" style="width:60px">' +
        '<button class="btn" id="dsx-sim-run">시뮬레이션</button></div><div id="dsx-sim-out"></div>') +
      "</div>" +
      '<div class="grid">' +
      panel("랙 헤드룸 · WPPS 프로파일", "상위 40랙 · 프로파일 변경 → POST /api/v1/racks/{rack}/power-policy",
        '<div style="max-height:360px;overflow-y:auto"><table class="tbl"><thead><tr><th>랙</th><th>그룹</th><th>kW</th><th>cap</th><th>사용률</th><th>헤드룸</th><th>WPPS</th></tr></thead><tbody>' +
        (rRows || "<tr><td colspan=7>—</td></tr>") + "</tbody></table></div>") +
      panel("DSX Flex 수요반응", "POST /api/v1/power/flex-events",
        '<div class="dsx-row"><label>감축 kW</label><input id="dsx-flex-kw" type="number" value="1000" style="width:90px">' +
        '<label>지속 s</label><input id="dsx-flex-s" type="number" value="900" style="width:80px">' +
        '<button class="btn-warn" id="dsx-flex-run">Flex 이벤트 발행</button></div>' +
        '<table class="tbl"><thead><tr><th>ID</th><th>도메인</th><th>감축</th><th>지속</th><th>상태</th></tr></thead><tbody>' +
        (flexRows || "<tr><td colspan=5>이벤트 없음</td></tr>") + "</tbody></table>", "amber") +
      "</div>";
    if (pwr.sim) paintSim(pwr.sim);
  }
  function paintSim(r) {
    var el = $("dsx-sim-out");
    if (!el || !r) return;
    var s = r.static || {}, dy = r.dynamic || {};
    function row(lbl, k, unit) {
      var a = +s[k] || 0, b = +dy[k] || 0, mx = Math.max(a, b, 1);
      return "<div>" + esc(lbl) + "</div><div>" + bar(a / mx, "amber") + '<span style="font-size:10.5px">' + fmt(a) + unit + "</span></div>" +
        "<div>" + bar(b / mx) + '<span style="font-size:10.5px">' + fmt(b) + unit + "</span></div>";
    }
    var gain = s.racks_supported ? ((dy.racks_supported - s.racks_supported) / s.racks_supported * 100) : 0;
    el.innerHTML = '<div class="dsx-cmp"><div></div><div style="color:var(--amber)">static</div><div style="color:var(--green-text)">dynamic (DPS)</div>' +
      row("racks", "racks_supported", "") + row("GPUs", "gpus_supported", "") + row("tokens/MW", "tokens_per_mw", "") +
      row("headroom", "headroom_kw", " kW") + "</div>" +
      '<div style="margin-top:8px;font-size:11px;color:var(--muted)">dynamic 이득 <b style="color:var(--green-text)">+' + fmt(gain, 1) + "%</b> racks" +
      (r._live ? "" : " · mock 계산") + "</div>";
  }

  /* ══ ③ DSX OS 버전 매트릭스 ════════════════════════════════════ */
  var LABEL = { dsx_os: "DSX OS", nico: "NICo (infra-controller)", nvke: "NVKE", dps: "DPS (Dynamic Power Software)",
    mission_control: "Mission Control", doca: "DOCA", gpu_operator: "GPU Operator", k8s: "Kubernetes", platform: "Platform" };
  async function renderVersions() {
    var root = $("dsx-versions-root");
    if (!root) return;
    var res = await D.versions();
    var got = (res.data && res.data.matrix) || {};
    var comps = (res.data && res.data.components) || {};
    var rows = Object.keys(D.MATRIX).map(function (k) {
      var want = D.MATRIX[k], have = got[k];
      var ws = Array.isArray(want) ? want.join(", ") : want;
      var hs = have == null ? "—" : Array.isArray(have) ? have.join(", ") : String(have);
      return "<tr><td>" + esc(LABEL[k] || k) + "</td><td class='id'>" + esc(k) + "</td><td>" + esc(ws) + "</td><td>" + esc(hs) +
        "</td><td>" + (hs === ws ? stc("ok") : have == null ? stc("pending") : stc("warning")) + "</td></tr>";
    }).join("");
    var cRows = Object.keys(comps).map(function (k) {
      var v = comps[k];
      // live 보고: 서비스별 매트릭스 dict → 기준과 다른 키 + 컴포넌트/HW 식별 정보만 요약
      var txt = v;
      if (v && typeof v === "object") {
        var diff = Object.keys(D.MATRIX).filter(function (m) {
          return v[m] != null && String(v[m]) !== String(D.MATRIX[m]);
        });
        var meta = ["component", "component_version", "hw_vendor", "hw_platform"].filter(function (m) { return v[m]; })
          .map(function (m) { return v[m]; });
        txt = (meta.length ? meta.join(" · ") + " — " : "") +
          (diff.length ? diff.map(function (m) { return m + "=" + v[m]; }).join(", ") : "매트릭스 일치");
      }
      return "<tr><td class='id'>" + esc(k) + "</td><td>" + esc(txt) + "</td></tr>";
    }).join("");
    root.innerHTML = '<div class="filters" style="margin-bottom:14px">' + src(res) +
      '<span style="color:var(--muted2);font-size:10.5px">DSX OS 4계층 — Provisioning · Runtime · Workload · Fleet Health</span></div>' +
      '<div class="grid">' +
      panel("기준 버전 매트릭스", "PLAN 기준 vs NOCP 보고",
        '<table class="tbl"><thead><tr><th>구성요소</th><th>키</th><th>기준</th><th>보고값</th><th>일치</th></tr></thead><tbody>' + rows + "</tbody></table>") +
      panel("서비스별 보고", "GET /api/v1/platform/versions · components",
        '<table class="tbl"><tbody>' + (cRows || "<tr><td>" + (res.live ? "보고 없음" : "보고 없음 (mock)") + "</td></tr>") + "</tbody></table>") +
      "</div>";
  }

  /* ══ ④ RMA · 펌웨어 ═══════════════════════════════════════════ */
  var STAGE_KO = { health_event: "Health 이벤트", cordon_drain: "cordon/drain", isolate: "격리", replace: "교체",
    burn_in: "burn-in", pool_return: "풀 복귀" };
  async function renderRma() {
    var root = $("dsx-rma-root");
    if (!root) return;
    var r = await Promise.all([D.rmaList(), D.firmwareBaseline(), D.firmwareDrift()]);
    var list = r[0].data || [], base = r[1].data || [], drift = r[2].data || [];
    var rows = list.map(function (c) {
      var si = c.stage_index != null ? c.stage_index : D.RMA_STAGES.indexOf(c.stage);
      var st = D.RMA_STAGES.map(function (s, i) { return '<i class="' + (i <= si ? "on" : "") + '" title="' + esc(STAGE_KO[s]) + '"></i>'; }).join("");
      return "<tr><td class='id'>" + esc(c.id) + "</td><td class='id'>" + esc(c.machine) + "</td><td>" + esc(c.component) + "</td><td>" +
        esc(c.reason) + "</td><td>" + esc(STAGE_KO[c.stage] || c.stage) + '<div class="dsx-stages">' + st + "</div></td><td>" +
        (si < D.RMA_STAGES.length - 1 ? '<button class="btn-ghost" data-rma-adv="' + esc(c.id) + '">다음 단계 →</button>' : stc("done")) + "</td></tr>";
    }).join("");
    var bRows = base.map(function (b) {
      return "<tr><td>" + esc(b.component) + "</td><td class='id'>" + esc(b.baseline || b.version) + "</td></tr>";
    }).join("");
    var dRows = drift.map(function (x) {
      return "<tr><td class='id'>" + esc(x.machine) + "</td><td>" + esc(x.component) + "</td><td class='id'>" + esc(x.current) + "</td><td class='id'>" +
        esc(x.baseline) + "</td><td>" + stc(x.severity || "warning") + '</td><td><button class="btn-ghost" data-rma-new="' + esc(x.machine) +
        '" data-comp="' + esc(x.component) + '">RMA 생성</button></td></tr>';
    }).join("");
    root.innerHTML = '<div class="filters" style="margin-bottom:14px">' + src(r[0]) +
      '<span style="color:var(--muted2);font-size:10.5px">NVSentinel health event → cordon/drain → 격리 → 교체 → burn-in → 풀 복귀</span>' +
      '<span class="rt"><input id="dsx-rma-m" placeholder="machine (예: GA-R001-T01)" style="width:190px"> <button class="btn" id="dsx-rma-create">+ RMA 생성</button></span></div>' +
      '<div class="kpi-band">' + kpi("진행 중 RMA", fmt(list.filter(function (c) { return c.stage !== "pool_return"; }).length), "/api/v1/rma") +
      kpi("펌웨어 드리프트", fmt(drift.length), "baseline 불일치 machine", drift.length ? "amber" : "green") +
      kpi("Baseline 구성요소", fmt(base.length), "/api/v1/firmware/baseline") + "</div>" +
      panel("RMA 워크플로우", "6단계", '<table class="tbl"><thead><tr><th>ID</th><th>Machine</th><th>부품</th><th>사유</th><th>단계</th><th></th></tr></thead><tbody>' +
        (rows || "<tr><td colspan=6>RMA 없음</td></tr>") + "</tbody></table>") +
      '<div class="grid">' +
      panel("펌웨어 baseline", src(r[1]), '<table class="tbl"><tbody>' + bRows + "</tbody></table>") +
      panel("펌웨어 drift", src(r[2]), '<table class="tbl"><thead><tr><th>Machine</th><th>구성요소</th><th>현재</th><th>baseline</th><th>심각도</th><th></th></tr></thead><tbody>' +
        (dRows || "<tr><td colspan=6>드리프트 없음</td></tr>") + "</tbody></table>", "amber") +
      "</div>";
  }

  /* ══ ⑤ 미터링 · 격리 ══════════════════════════════════════════ */
  var met = { tenant: "" };
  async function renderMetering() {
    var root = $("dsx-metering-root");
    if (!root) return;
    var ts = D.tenants();
    try {
      var live = NC.api && NC.api.tenants ? await NC.api.tenants() : [];
      if (live && live.length) ts = live.map(function (t) { return t.id; });
    } catch (e) {}
    var res = await D.metering(met.tenant || undefined);
    var u = res.data || {};
    var lines = u.lines || [];
    var iso = met.tenant ? await D.isolation(met.tenant) : null;
    var opts = '<option value="">전체 테넌트</option>' + ts.map(function (t) {
      return '<option value="' + esc(t) + '"' + (t === met.tenant ? " selected" : "") + ">" + esc(t) + "</option>";
    }).join("");
    var rows = lines.map(function (l) {
      return "<tr><td class='id'>" + esc(l.tenant_id || l.tenant) + "</td><td>" + esc(l.product) + "</td><td>" + esc(l.metric) + "</td><td>" +
        fmt(l.quantity, 1) + "</td><td>" + esc(l.unit || "") + "</td></tr>";
    }).join("");
    var isoHtml = iso ? panel("테넌트 격리 매트릭스 — " + met.tenant, src(iso),
      '<table class="tbl"><thead><tr><th>계층</th><th>식별자</th><th>상태</th><th>근거</th></tr></thead><tbody>' +
      ((iso.data && iso.data.layers) || []).map(function (x) {
        return "<tr><td>" + esc(x.layer) + "</td><td class='id'>" + esc(x.value) + "</td><td>" + stc(x.status) + "</td><td>" + esc(x.detail) + "</td></tr>";
      }).join("") + "</tbody></table>")
      : panel("테넌트 격리 매트릭스", "", '<div style="color:var(--muted);font-size:11.5px">테넌트를 선택하면 VPC/VRF · P_Key · NVLink · Spectrum-X · NSG 격리 상태를 표시합니다.</div>');
    root.innerHTML = '<div class="filters" style="margin-bottom:14px">' + src(res) +
      '<span style="color:var(--muted2);font-size:10.5px">GPU-hour · instance-hour · K8s node-hour</span>' +
      '<span class="rt"><select id="dsx-met-tenant">' + opts + "</select></span></div>" +
      '<div class="kpi-band">' + kpi("GPU-hour", fmt(u.gpu_hours, 0), esc(u.period || "")) +
      kpi("instance-hour", fmt(u.instance_hours, 0), "BMaaS") + kpi("K8s node-hour", fmt(u.k8s_node_hours, 0), "Managed K8s (NVKE)") + "</div>" +
      '<div class="grid">' + panel("사용량 내역", "/api/v1/metering/usage", '<table class="tbl"><thead><tr><th>테넌트</th><th>상품</th><th>지표</th><th>수량</th><th>단위</th></tr></thead><tbody>' +
        (rows || "<tr><td colspan=5>—</td></tr>") + "</tbody></table>") + isoHtml + "</div>";
  }

  /* ── 라우트 · 이벤트 위임 ──────────────────────────────────── */
  var R = { "dsx-oob": renderOob, "dsx-power": renderPower, "dsx-versions": renderVersions,
    "dsx-rma": renderRma, "dsx-metering": renderMetering };
  NC.dsxScreens = R;
  /* OOB 화면 이탈 시 SSE·폴링 정리 — 열린 EventSource/무한 setInterval이 다른 화면에서도 남아
     네트워크·타이머를 붙잡지 않도록 (헤드리스 --virtual-time-budget 무한 대기의 원인) */
  function stopEvents() {
    if (oob.poll) { clearInterval(oob.poll); oob.poll = null; }
    if (oob.es) { oob.es.close(); oob.es = null; }
  }
  if (NC.bus) NC.bus.on("route", function (id) { if (id !== "dsx-oob") stopEvents(); if (R[id]) R[id](); });

  document.addEventListener("click", async function (e) {
    var t = e.target.closest("[data-oob-m],[data-oob-rack],[data-oob-act],[data-oob-sel],[data-pwr-mode],#dsx-pwr-limit-apply,#dsx-sim-run,#dsx-flex-run,[data-rma-adv],[data-rma-new],#dsx-rma-create");
    if (!t) return;
    if (t.dataset.oobM) { oob.metric = t.dataset.oobM; return renderOob(); }
    if (t.dataset.oobRack) { oob.sel = oob.sel === t.dataset.oobRack ? null : t.dataset.oobRack; return renderOob(); }
    if (t.dataset.oobAct) return oobAction(t);
    if (t.dataset.oobSel) return showSel(t.dataset.oobSel);
    if (t.dataset.pwrMode) {
      var r = await D.updateDomain(pwr.domain, { mode: t.dataset.pwrMode });
      toast(r.error ? "실패: " + r.error : "정책 모드 → " + t.dataset.pwrMode + (r.live ? "" : " (mock)"), r.error ? "warn" : "");
      return renderPower();
    }
    if (t.id === "dsx-pwr-limit-apply") {
      var lim = +$("dsx-pwr-limit").value;
      var r2 = await D.updateDomain(pwr.domain, { operating_limit_kw: lim });
      toast(r2.error ? "실패: " + r2.error : "OperatingLimit → " + fmt(lim) + " kW" + (r2.live ? "" : " (mock)"), r2.error ? "warn" : "");
      return renderPower();
    }
    if (t.id === "dsx-sim-run") {
      var tr = Math.max(0, Math.min(100, +$("dsx-sim-tr").value || 0)) / 100;
      var r3 = await D.simulate({ domain: pwr.domain, operating_limit_kw: +$("dsx-sim-limit").value,
        workload_mix: { training: tr, inference: +(1 - tr).toFixed(2) } });
      if (r3.error) return toast("실패: " + r3.error, "warn");
      pwr.sim = Object.assign({ _live: r3.live }, r3.data);
      return paintSim(pwr.sim);
    }
    if (t.id === "dsx-flex-run") {
      var r4 = await D.flexEvent({ domain: pwr.domain, reduce_kw: +$("dsx-flex-kw").value, duration_s: +$("dsx-flex-s").value });
      toast(r4.error ? "실패: " + r4.error : "DSX Flex 이벤트 발행" + (r4.live ? "" : " (mock)"), r4.error ? "warn" : "");
      return renderPower();
    }
    if (t.dataset.rmaAdv) {
      var r5 = await D.rmaAdvance(t.dataset.rmaAdv);
      if (r5.error) toast("실패: " + r5.error, "warn");
      return renderRma();
    }
    if (t.dataset.rmaNew || t.id === "dsx-rma-create") {
      var m = t.dataset.rmaNew || ($("dsx-rma-m") && $("dsx-rma-m").value.trim());
      if (!m) return toast("machine을 입력하세요", "warn");
      var r6 = await D.rmaCreate({ machine: m, component: t.dataset.comp || "GPU", reason: t.dataset.comp ? "firmware drift" : "manual" });
      toast(r6.error ? "실패: " + r6.error : "RMA 생성 — " + m + (r6.live ? "" : " (mock)"), r6.error ? "warn" : "");
      return renderRma();
    }
  });
  document.addEventListener("change", async function (e) {
    var t = e.target;
    if (t.id === "dsx-oob-site") { oob.site = t.value; oob.sel = null; return renderOob(); }
    if (t.id === "dsx-pwr-domain") { pwr.domain = t.value; pwr.sim = null; return renderPower(); }
    if (t.id === "dsx-met-tenant") { met.tenant = t.value; return renderMetering(); }
    if (t.id === "dsx-pwr-smooth") {
      var r = await D.updateDomain(pwr.domain, { smoothing: t.checked });
      toast(r.error ? "실패: " + r.error : "power smoothing " + (t.checked ? "ON" : "OFF") + (r.live ? "" : " (mock)"), r.error ? "warn" : "");
      return renderPower();
    }
    if (t.dataset && t.dataset.pwrRack) {
      var r2 = await D.setRackProfile(t.dataset.pwrRack, t.value);
      toast(r2.error ? "실패: " + r2.error : t.dataset.pwrRack + " WPPS → " + t.value + (r2.live ? "" : " (mock)"), r2.error ? "warn" : "");
    }
  });
})();
