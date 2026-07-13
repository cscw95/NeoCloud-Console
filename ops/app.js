/* NeoCloud Ops 콘솔 — 화면 렌더 + NC.api 바인딩
   (shared/app.js: 라우터·모달·토스트·버스 / shared/mock-api.js: mock 데이터 /
    shared/vrcm-api.js: vrcm(:8000) 기동 시 NC.api 라이브 교체 · NC.live 플래그)
   라이브 시: provisioning은 단계 게이트(1회 승인 = 1단계 전진), overview KPI는
   scale()/equipment()/incidents() 실수치, capacity 사이트 표는 sitesInventory(). */
(function () {
  "use strict";
  var NC = window.NC;
  var $ = function (sel, el) { return (el || document).querySelector(sel); };

  /* 상태 캐시 (NC.api 결과) */
  var prov = null;   // 프로비저닝 승인 대기 주문 (mock: ord-9)
  var incs = null;   // 인시던트 목록
  /* ── 라이브 연동 캐시 (vrcm 실데이터 · mock 시 null) ── */
  var assetsCache = null;                       // fake-nico hosts 전체
  var assetsFilter = { site: "", state: "", q: "", offset: 0 };
  var PAGE = 12;
  var topoCache = null;                         // topology/tree
  var fabData = null, segData = null;           // fabric/ib · segments
  var fabSite = "ansan";                        // 패브릭 다이어그램 사이트 토글
  var hwHost = null;                            // 하드웨어 모달 대상 {id, tray}
  var rmaTarget = null;                         // RMA 대상 트레이 id

  var currentRoute = function () {
    return (location.hash.replace(/^#\/?/, "") || "overview").split("?")[0];
  };
  var fmt = function (n) { return Number(n || 0).toLocaleString("en-US"); };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  };
  var setHtml = function (id, h) { var e = document.getElementById(id); if (e) e.innerHTML = h; };
  var setTxt = function (id, t) { var e = document.getElementById(id); if (e) e.textContent = t; };
  /* 라이브 전용 getter 안전 호출 — 미기동/미존재 시 null resolve */
  function apiOr(name) {
    var args = [].slice.call(arguments, 1);
    if (!NC.api || typeof NC.api[name] !== "function") return Promise.resolve(null);
    return NC.api[name].apply(NC.api, args).catch(function () { return null; });
  }
  /* 시계열 → SVG polyline points (viewBox 기준 정규화) */
  function poly(vals, w, h) {
    if (!vals || !vals.length) return "";
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    var span = (mx - mn) || 1, pad = 6, n = vals.length;
    return vals.map(function (v, i) {
      var x = n > 1 ? (i / (n - 1)) * w : w / 2;
      var y = h - pad - ((v - mn) / span) * (h - 2 * pad);
      return x.toFixed(1) + "," + y.toFixed(1);
    }).join(" ");
  }
  function setSpark(id, label, val, vals) {
    setTxt(id + "-k", label); setTxt(id + "-v", val);
    var l = document.getElementById(id + "-l");
    if (l && vals) l.setAttribute("points", poly(vals, 260, 58));
  }

  /* ══ ① Overview ══════════════════════════════════════════ */
  /* 랙 상태 맵 — A:할당 R:ready L:잠김 F:장애 */
  var RACK_ROWS = [
    ["가산 su-1", "AAAAAAAAAAAAAAAA", ""],
    ["가산 su-2", "AAAALLLL", ""],
    ["가산 su-3", "RRRRRRRRRRRR", ""],
    ["안산 su-5", "AAAFAAAAAAAAAAAA", ""],
    ["안산 su-6", "AAAAAAAAAAAAAAAA", ""],
    ["안산 su-4,7~11", "RRRRRRRRRRRRRR", "… 72랙 ready"],
  ];
  var CELL_CLS = { A: "a", R: "r", L: "l", F: "f" };

  /* ── 사이트 스코프 (사이드바 전체/가산/안산 — Overview 반영) ── */
  var siteScope = localStorage.getItem("nc-ops-scope") || "all";
  function scopeName() {
    return siteScope === "gasan" ? "가산"
         : siteScope === "ansan" ? "안산" : null;
  }
  function scopeMatch(txt) {
    var n = scopeName();
    return !n || (txt || "").indexOf(n) >= 0;
  }
  function applyScopeChips() {
    document.querySelectorAll("[data-scope]").forEach(function (c) {
      c.classList.toggle("act", c.dataset.scope === siteScope);
    });
  }
  var fabCache = null;                     // fabric/ib 캐시 (라이브 랙맵·SU→사이트)
  function suSiteMap() {
    var m = {};
    if (fabCache && fabCache.sites) {
      fabCache.sites.forEach(function (st) {
        var nm = (st.name || "").indexOf("가산") >= 0 ? "가산"
               : (st.name || "").indexOf("안산") >= 0 ? "안산" : st.name;
        (st.sus || []).forEach(function (su) { m[su.su_id || su.id] = nm; });
      });
    } else {                                // mock 근사: su-1~3 가산, 이후 안산
      for (var i = 1; i <= 3; i++) m["su-" + i] = "가산";
      for (var j = 4; j <= 13; j++) m["su-" + j] = "안산";
    }
    return m;
  }
  function siteOfText(t, m) {
    var x = /su-\d+/.exec(t || "");
    return x ? m[x[0]] : null;
  }
  function rackRows() {                     // 라이브: fabric SU 점유 기반 셀
    if (NC.live && fabCache && fabCache.sites) {
      var rows = [];
      fabCache.sites.forEach(function (st) {
        var nm = (st.name || "").indexOf("가산") >= 0 ? "가산"
               : (st.name || "").indexOf("안산") >= 0 ? "안산" : st.name;
        (st.sus || []).forEach(function (su) {
          var cells = (su.racks || []).map(function (r) {
            return r.tenant_id ? "A" : "R";
          }).join("");
          if (cells) rows.push([nm + " " + (su.su_id || ""), cells, ""]);
        });
      });
      if (rows.length) return rows;
    }
    return RACK_ROWS;
  }

  function renderRackMap() {
    var box = $("#rackmap");
    if (!box) return;
    var rows = rackRows().filter(function (r) { return scopeMatch(r[0]); });
    var liveRows = rows !== RACK_ROWS && NC.live && fabCache;
    var nRacks = liveRows
      ? rows.reduce(function (a, r) { return a + r[1].length; }, 0)
      : (siteScope === "gasan" ? 36 : siteScope === "ansan" ? 104 : 140);
    setTxt("rackmap-title", "랙 상태 맵 — " + fmt(nRacks) + "랙" +
      (scopeName() ? " · " + scopeName() : ""));
    if (liveRows) {                          // 라이브 범례: 할당/ready 실집계
      var nA = 0, nR = 0;
      rows.forEach(function (r) {
        nA += (r[1].match(/A/g) || []).length;
        nR += (r[1].match(/R/g) || []).length;
      });
      var leg = document.getElementById("rackmap-leg");
      if (leg) leg.innerHTML =
        '<span><span class="leg" style="background:var(--green)"></span> 할당 ' + nA + "</span>" +
        '<span><span class="leg" style="background:var(--ready)"></span> ready ' + nR + "</span>" +
        '<span style="color:var(--muted2)">fabric/ib 실데이터</span>';
    }
    box.innerHTML = rows.map(function (row) {
      var cells = row[1].split("").map(function (c) {
        return '<span class="cell ' + CELL_CLS[c] + '"></span>';
      }).join("");
      var note = row[2]
        ? '<span style="color:var(--muted2);font-size:10px;padding-left:4px">' + row[2] + "</span>"
        : "";
      return '<div class="rackrow"><span class="lb">' + row[0] +
        '</span><span class="cells">' + cells + note + "</span></div>";
    }).join("");
  }

  function kpiCell(k, v, tone, s) {
    return '<div class="kpi"><div class="k">' + k + '</div><div class="v' +
      (tone ? " " + tone : "") + '">' + v + "</div>" + s + "</div>";
  }
  var kpiSub = function (s) { return '<div class="s">' + s + "</div>"; };

  function refreshOverview() {
    var qm = /[?&]scope=(all|gasan|ansan)/.exec(location.hash);   // 딥링크
    if (qm) {
      siteScope = qm[1];
      try { localStorage.setItem("nc-ops-scope", siteScope); } catch (err) {}
    }
    applyScopeChips();
    renderOverviewKpi();
    renderRackMap();
    if (NC.api.fabric) {
      NC.api.fabric().then(function (f) {
        if (f) { fabCache = f; renderRackMap();
          if (scopeName()) renderOverviewKpi(); }   // SU 매핑 정밀화 재렌더
      }).catch(function () {});
    }
  }

  function renderScopedKpi(el, incList, alertList) {
    var nm = scopeName();
    var m = suSiteMap();
    var incs = incList.filter(function (i) {
      var st = siteOfText(i.target, m); return !st || st === nm;
    });
    var open = incs.filter(function (i) { return i.state !== "resolved"; }).length;
    var alerts = alertList.filter(function (a) {
      var st = siteOfText(a.msg, m); return !st || st === nm;
    }).length;
    var invP = NC.live && NC.api.sitesInventory
      ? NC.api.sitesInventory().catch(function () { return null; })
      : Promise.resolve(null);
    invP.then(function (inv) {
      var site = inv && inv.sites ? inv.sites.filter(function (x) {
        return ((x.name || "") + " " + (x.site || "")).indexOf(nm) >= 0;
      })[0] : null;
      var firstOpen = incs.filter(function (i) { return i.state !== "resolved"; })[0];
      var incCell = kpiCell("열린 인시던트 (" + nm + ")", String(open),
        open ? "red" : "green",
        kpiSub(open ? "P2 " + open + (firstOpen ? " · " + firstOpen.id : "")
                    : "해당 사이트 이상 없음"));
      var alCell = kpiCell("알림 (24h · " + nm + ")", String(alerts),
        alerts ? "amber" : "green", kpiSub("SU→사이트 매핑 필터"));
      if (site) {                            /* 라이브 — inventory/sites 실집계 */
        el.innerHTML =
          kpiCell("노드 (" + nm + ")", fmt((site.racks_total || 0) * 18), "",
            kpiSub((site.name || nm) + " · " + fmt(site.racks_total || 0) + "랙")) +
          kpiCell("GPU", fmt(site.gpus_total || 0), "",
            kpiSub("할당 " + fmt(site.gpus_allocated || 0) +
                   " · 판매 가능 " + fmt(site.gpus_sellable || 0))) +
          kpiCell("판매 가능 용량", fmt(site.racks_sellable || 0) + "<small>랙</small>",
            "green", kpiSub("계약 가능 " + fmt(site.racks_contractable || 0) +
              "랙 · 격리 잠김 " + fmt(site.racks_locked_by_isolation || 0))) +
          kpiCell("전력 캡", (site.power_cap_kw != null
              ? (site.power_cap_kw / 1000).toFixed(1) : "—") + "<small> MW</small>",
            "", kpiSub("사이트 전력 캡 (MaxQ)")) +
          kpiCell("비정상 랙", fmt(site.racks_unhealthy || 0),
            site.racks_unhealthy ? "amber" : "green",
            kpiSub("테넌트 " + ((site.tenants && site.tenants.length) || 0) + "개")) +
          incCell + alCell;
        return;
      }
      /* mock 근사 — 규모 상수 기반 */
      var c = (NC.CONST.sites || []).filter(function (x) {
        return (x.name || "").indexOf(nm) >= 0 || x.id === siteScope;
      })[0] || { racks: 0 };
      el.innerHTML =
        kpiCell("노드 (" + nm + ")", fmt(c.racks * 18), "",
          kpiSub(nm + " " + c.racks + "랙")) +
        kpiCell("GPU", fmt(c.racks * (NC.CONST.gpu_per_rack || 72)), "",
          kpiSub("랙당 " + (NC.CONST.gpu_per_rack || 72))) +
        kpiCell("판매 가능 용량", "—", "",
          kpiSub("사이트별 집계는 Control-Plane 연동 시 표시")) +
        kpiCell("전력 캡", "—", "", kpiSub("Control-Plane 연동 시 표시")) +
        incCell + alCell;
    });
  }

  function renderOverviewKpi() {
    var el = $("#ov-kpi");
    if (!el) return;
    var eqCall = NC.api.equipment
      ? NC.api.equipment().catch(function () { return null; })
      : Promise.resolve(null);
    Promise.all([NC.api.incidents(), NC.api.alerts(), NC.api.scale(), eqCall])
      .then(function (r) {
        var list = r[0] || [];
        var open = list.filter(function (i) { return i.state !== "resolved"; }).length;
        var alerts = (r[1] || []).length;
        var s = r[2], eq = r[3];

        /* ── 사이트 스코프: 해당 사이트 집계로 전환 ── */
        if (scopeName()) { renderScopedKpi(el, list, r[1] || []); return; }

        /* ── 라이브: vrcm 인벤토리 실수치 (null 안전) ── */
        if (NC.live && s && s.capped_mw != null) {
          var racks = s.racks_total || 0;
          var sites = s.sites || [];
          var sell = sites.reduce(function (a, x) { return a + (x.sellable || 0); }, 0);
          var contr = sites.reduce(function (a, x) { return a + (x.contractable || 0); }, 0);
          var gbs = s.gpus_by_state || {};
          var gbsTxt = Object.keys(gbs).map(function (k) {
            return k.replace(/_/g, "-") + " " + fmt(gbs[k]);
          }).join(" · ") || "상태 집계 없음";
          var tot = eq && eq.totals ? eq.totals : null;
          var unhealthy = tot && tot.unhealthy_equipment != null ? tot.unhealthy_equipment : null;
          var breakfix = tot && tot.breakfix_nodes != null ? tot.breakfix_nodes : null;
          var firstOpen = list.filter(function (i) { return i.state !== "resolved"; })[0];
          el.innerHTML =
            kpiCell("전체 노드", fmt(racks * 18), "",
              kpiSub(sites.length + "개 사이트 · " + fmt(racks) + "랙")) +
            kpiCell("전체 GPU", fmt(s.gpus_total), "", kpiSub(gbsTxt)) +
            kpiCell("판매 가능 용량", fmt(sell) + "<small>랙</small>", "green",
              kpiSub("계약 가능 " + fmt(contr) + "랙")) +
            kpiCell("전력 캡", (s.capped_mw != null ? Number(s.capped_mw).toFixed(1) : "—") +
              "<small> MW</small>", "", kpiSub("MaxQ 캡 운전 기준")) +
            kpiCell("열린 인시던트", String(open), open ? "red" : "green",
              kpiSub(open ? "P2 " + open + (firstOpen ? " · " + firstOpen.id : "") : "전건 해결 · P1 0")) +
            kpiCell("장비 이상", unhealthy != null ? String(unhealthy) : "—",
              unhealthy ? "amber" : "green",
              kpiSub(breakfix != null ? "breakfix 노드 " + fmt(breakfix) : "equipment 집계 없음")) +
            kpiCell("알림 (24h)", String(alerts), alerts ? "amber" : "green",
              kpiSub("vrcm 장애 이벤트 기반"));
          return;
        }

        /* ── mock: 시나리오 수치 ── */
        var C = NC.CONST;
        var nodes = C.racks_total * 18; // NVL72 랙당 컴퓨트 트레이 18
        el.innerHTML =
          kpiCell("전체 노드", fmt(nodes), "",
            kpiSub(C.sites.length + "개 사이트 · " + C.racks_total + "랙")) +
          kpiCell("전체 GPU", fmt(C.gpus_total), "",
            kpiSub("랙당 " + C.gpu_per_rack + " · in-service 936")) +
          kpiCell("판매 가능 용량", "83<small>랙</small>", "green",
            kpiSub("잠김 4 · 증설 리드타임 12주")) +
          kpiCell("전력 사용", "5.87<small> / 26.2 MW</small>", "",
            '<div class="bar"><i style="width:22%"></i></div>') +
          kpiCell("열린 인시던트", String(open), open ? "red" : "green",
            kpiSub(open ? "P2 " + open + " · INC-0412" : "전건 해결 · P1 0")) +
          kpiCell("알림 (24h)", String(alerts), "amber",
            kpiSub("억제 규칙 6 · 중복 제거 on")) +
          kpiCell("SLA 준수율 (30d)", "99.97<small>%</small>", "green",
            kpiSub("에러버짓 잔여 64%"));
      });
  }

  /* P2 인시던트 스트립 — overview에서만 · 해결 시 숨김 (mock 시나리오 전용) */
  function refreshStrip(route) {
    var strip = $("#p2strip");
    if (!strip) return;
    if (NC.live) { strip.style.display = "none"; return; }   // 라이브: 정적 문구 미표시
    var inc = (incs || []).filter(function (i) { return i.id === "INC-0412"; })[0];
    var resolved = inc && inc.state === "resolved";
    strip.style.display = (route === "overview" && !resolved) ? "" : "none";
  }

  /* ══ ④ 프로비저닝 — 승인 게이트 ═══════════════════════════
     라이브(vrcm): 단계 게이트 — pending_stage가 다음 관문, 1회 승인 = 1단계 전진.
     mock: ord-9 단일 승인(approval_pending → provisioning).                    */
  var PROV_STEPS = ["접수", "정책·배치", "예약", "프로비저닝", "격리", "스토리지", "인수검증", "인도"];
  /* vrcm 주문 단계명 — PROV_STEPS와 1:1 매핑 */
  var PROV_STAGES = ["received", "validated", "reserved", "provisioning",
                     "isolating", "storage_binding", "acceptance", "delivered"];

  function provDelivered(p) {
    return p.state === "delivered" || /인도됨|인도 완료/.test(p.gate || "");
  }

  function renderProvCard(p) {
    prov = p;
    var rejected = p.state === "rejected";
    var delivered = provDelivered(p);
    var pendStage = p.state === "approval_pending" ? (p.pending_stage || null) : null;
    var card = $("#prov-card");
    if (card) {
      var cur = delivered ? PROV_STEPS.length
        : pendStage ? Math.max(PROV_STAGES.indexOf(pendStage), 0)
        : p.state === "approval_pending" ? 2
        : p.state === "provisioning" ? 3 : -1;
      var nodes = (p.racks || 0) * 18;
      var place = /^su-\d/.test(p.su || "") ? "안산 " + p.su : (p.su || "—");
      var actions = delivered
        ? '<span class="st green">인도 완료 — 테넌트 인도됨</span>'
        : p.state === "approval_pending"
          ? (pendStage
              ? '<button class="btn" data-act="approve">게이트 승인 — ' + pendStage + "</button>"
              : '<button class="btn" data-open="approve">예약 승인</button>') +
            '<button class="btn-danger" data-open="reject">거절</button>'
          : rejected
            ? '<span class="st red">거절됨 — P_Key · 예약 자원 해제</span>'
            : '<span class="st green">' + (p.gate || "") + "</span>";
      var chips = "";
      if (pendStage) chips += '<span class="st blue">다음 단계: ' + pendStage + "</span>";
      if (p.state === "approval_pending" && p.queue != null)
        chips += '<span class="st amber">대기 ' + Math.max(p.queue, 1) + "건</span>";
      var head =
        '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
        '<span class="dot ' + (rejected ? "red" :
          delivered || p.state === "provisioning" ? "green" : "amber") + '"></span>' +
        '<b class="mono" style="font-size:12px;color:#fff">' + p.id + "</b>" +
        '<span style="font-size:12.5px">' + (p.tenant || "—") + " · VR NVL72 × <b>" +
        p.racks + "랙</b> " +
        '<span style="color:var(--muted)">(' + nodes + "노드 · " + place + ")</span></span>" +
        chips +
        '<span style="margin-left:auto;display:flex;gap:8px">' + actions + "</span></div>";
      var steps = '<div style="overflow-x:auto;margin-top:14px"><div class="steps">' +
        PROV_STEPS.map(function (s, i) {
          var done = rejected ? i < 2 : delivered ? true : i < cur;
          var isCur = !rejected && !delivered && i === cur;
          return (i ? '<div class="step-bar' + (done || isCur ? " done" : "") + '"></div>' : "") +
            '<div class="step' + (done ? " done" : isCur ? " cur" : "") +
            '"><span class="nd"></span><span class="lb">' + s + "</span></div>";
        }).join("") + "</div></div>";
      var meta =
        '<div style="color:var(--muted);font-size:11.5px;margin-top:8px;' +
        'border-top:1px dashed var(--line);padding-top:8px">' +
        (NC.live
          ? "vrcm 승인 게이트 — 1회 승인 = 1단계 전진 · P_Key " + (p.pkey_reserved || "—") +
            " · 접수 " + (p.requested_at || "—") +
            (delivered ? " · 전체 게이트 통과 (인도 완료)"
              : pendStage ? " · 잔여 게이트 " +
                (PROV_STEPS.length - Math.max(PROV_STAGES.indexOf(pendStage), 0)) + "단계"
              : "")
          : "M4 배치 OK — DPU 모드 dpu_zero_trust · P_Key " + (p.pkey_reserved || "—") +
            " 예약 · 스토리지 자동 (랙당 500TB·40GB/s) · 승인 시 " + nodes + "노드 자동 진행") +
        "</div>";
      card.innerHTML = head + steps + meta;
    }
    var title = $("#ph-prov-state");
    if (title) title.textContent =
      p.state === "approval_pending"
        ? "승인 게이트 — 대기 " + (p.queue != null ? Math.max(p.queue, 1) : 1) + "건" +
          (pendStage ? " · 다음 단계: " + pendStage : "")
        : delivered ? "승인 게이트 — 대기 0건 · " + p.id + " 인도 완료"
        : p.state === "provisioning" ? "승인 게이트 — 대기 0건 · " + p.id + " 배포 중"
        : "승인 게이트 — 대기 0건 · " + p.id + " 거절";
    var pk = $("#pkey-gamma-state");
    if (pk && p.id === "ord-9") {          // mock 시나리오 전용 (gamma-labs)
      pk.textContent = p.state === "provisioning" ? "바인딩 중 (ord-9)" :
        p.state === "rejected" ? "해제됨" : "예약 (ord-9)";
      pk.className = "st " + (p.state === "provisioning" ? "green" :
        p.state === "rejected" ? "gray" : "amber");
    }
    updateBadges();
    renderFabric();
  }

  function renderProvisioning() {
    NC.api.provisioning().then(renderProvCard);
  }

  /* ══ ③ 용량 관리 — 사이트 표(라이브) · delta-corp 시뮬(mock 유지) ═══ */
  var td = function (c, cls) { return "<td" + (cls ? ' class="' + cls + '"' : "") + ">" + c + "</td>"; };
  var muted = function (s) { return '<span style="color:var(--muted)">' + s + "</span>"; };

  /* 라이브: sitesInventory() → 사이트별 판매가능/계약가능/격리잠김.
     mock(inv 없음): index.html 정적 표 유지. */
  function renderCapSites(inv) {
    var head = $("#cap-sites-head"), body = $("#cap-sites-body");
    if (!head || !body || !inv || !inv.sites) return;
    head.innerHTML =
      '<th>사이트</th><th style="width:150px">할당률</th>' +
      '<th class="num">판매가능</th><th class="num">계약가능</th>' +
      '<th class="num">격리 잠김</th><th class="num">전력 캡</th>';
    var rows = inv.sites.map(function (s) {
      var total = s.racks_total || 0;
      var alloc = s.racks_allocated || 0;
      var pct = total ? Math.round(alloc / total * 100) : 0;
      var locked = s.racks_locked_by_isolation;
      return "<tr>" +
        td("<b>" + (s.name || s.site || "—") + "</b> (" + fmt(total) + "랙)") +
        td('<span class="pb"><span style="width:' + pct + '%"></span></span> ' + pct + "%") +
        td(s.racks_sellable != null
          ? '<span style="color:var(--green-text);font-weight:700">' + fmt(s.racks_sellable) + "랙</span>" +
            (s.gpus_sellable != null
              ? '<div style="color:var(--muted2);font-size:10px">' + fmt(s.gpus_sellable) + " GPU</div>" : "")
          : "—", "num") +
        td(s.racks_contractable != null ? fmt(s.racks_contractable) + "랙" : "—", "num") +
        td(locked
          ? '<span style="color:var(--amber);font-weight:700">' + fmt(locked) + "랙</span>"
          : locked === 0 ? '<span style="color:var(--muted)">0랙</span>' : "—", "num") +
        td(s.power_cap_kw != null ? (s.power_cap_kw / 1000).toFixed(1) + "MW" : "—", "num") +
        "</tr>";
    });
    /* 증설 블록은 mock 시나리오 유지 (su-12·13) */
    rows.push('<tr><td style="color:var(--muted2)"><b style="color:var(--blue-text)">안산 2층 증설</b> · su-12·13 (32랙)</td>' +
      '<td style="color:var(--muted2)">Q2 \'27 가동 목표</td>' +
      '<td class="num" style="color:var(--blue-text);font-weight:700">+32랙</td>' +
      '<td class="num" style="color:var(--muted2)">+32랙</td>' +
      '<td class="num" style="color:var(--muted2)">—</td>' +
      '<td class="num" style="color:var(--muted2)">+6.0MW</td></tr>');
    body.innerHTML = rows.join("");
  }

  function renderCapacity() {
    /* sitesInventory는 라이브 전용 getter — 래퍼가 live() 판정 후 미기동 시 null 반환 */
    var invCall = NC.api.sitesInventory
      ? NC.api.sitesInventory().catch(function () { return null; })
      : Promise.resolve(null);
    Promise.all([NC.api.provisioning(), NC.api.pipeline(), NC.api.expansion(), invCall])
      .then(function (r) {
        var p = r[0]; prov = p;
        var d = r[1].filter(function (x) { return x.id === "delta-corp"; })[0] || r[1][0];
        var exp = r[2];
        renderCapSites(r[3]);
        var tb = $("#cap-pipe");
        if (tb) {
          var provState = p.state === "approval_pending"
            ? '<span class="st amber">예약 — 승인 대기' +
              (p.pending_stage ? " (" + p.pending_stage + ")" : "") + "</span>"
            : provDelivered(p)
              ? '<span class="st green">인도 완료</span>'
              : p.state === "provisioning"
                ? '<span class="st green">승인 완료 — 배포 중</span>'
                : p.state === "rejected"
                  ? '<span class="st red">거절 — 자원 해제</span>'
                  : muted(p.state || "—");
          var place = /^su-\d/.test(p.su || "")
            ? "안산 " + p.su + " (M4 best-fit)" : (p.su || "—");
          tb.innerHTML =
            "<tr>" + td("<b>" + (p.tenant || "—") + "</b> " + p.id) + td(p.racks, "num") +
            td('<span class="id">' + place + "</span>") +
            td(provState) + td(muted("07-15")) + "</tr>" +
            "<tr>" + td("<b>" + d.id + "</b> (파이프라인 " + d.prob + "%)") + td(d.racks, "num") +
            td('<span class="id">안산 ' + d.hold.sus.join("·") + " (가배치)</span>") +
            td('<span class="st blue">소프트 홀드 D-' + d.hold.expires_d + "</span>") +
            td(muted("09-01")) + "</tr>" +
            "<tr>" + td("<b>RFQ-031</b> 공공 (60%)") + td(32, "num") +
            td('<span class="id">' + exp.sus.join("·") + " (증설 조건부)</span>") +
            td(muted("견적 응답 중")) + td(muted("'27 Q2")) + "</tr>";
        }
        var sim = $("#cap-sim");
        if (sim) {
          var avail = 71; // 안산 판매가능 (mock 시나리오 기준)
          var seq = [["현재", 0], ["+ " + (p.tenant || "gamma") + " " + p.racks,
                       p.state === "rejected" ? 0 : p.racks],
                     ["+ delta " + d.racks, d.racks], ["+ RFQ-031 32", 32]];
          var left = avail;
          sim.innerHTML = seq.map(function (s) {
            left -= s[1];
            var pct = Math.max(0, Math.round(left / 104 * 100));
            var bar = left <= 8 ? "var(--fault)" : left < 40 ? "var(--amber-dim)" : "var(--ready)";
            var col = left <= 8 ? "var(--red)" : left < 40 ? "var(--amber)" : "var(--green-text)";
            return '<div class="simrow"><span class="lb">' + s[0] +
              '</span><span class="bar"><span style="width:' + pct + "%;background:" + bar +
              '"></span></span><span class="val" style="color:' + col + '">' + left + "랙</span></div>";
          }).join("");
          var note = $("#cap-sim-note");
          if (note) note.innerHTML = "RFQ-031 수주 시 잔여 <b>" + left +
            "랙</b> — 안전 버퍼 미달 · " + exp.sus.join("·") + " (" + exp.racks +
            "랙) 발주를 D-" + exp.order_d + " 내 확정해야 Q2 '27 개통 가능 (리드타임 " +
            exp.leadtime_w + "주) · 대안: 가산 12랙 분산 배치";
          var scn = $("#cap-sim-scn");
          if (scn) scn.textContent = "시나리오: " + (p.tenant || "gamma") + " " + p.racks +
            " + delta " + d.racks + " + RFQ-031 32랙 ▾";
        }
        var lead = $("#kpi-lead");
        if (lead) lead.innerHTML = exp.leadtime_w + "<small>주</small>";
        var leadS = $("#kpi-lead-s");
        if (leadS) leadS.textContent = exp.sus.join("·") + " 발주 D-" + exp.order_d;
      });
  }

  /* ══ ⑤ 네트워크 — GPU Fabric 다이어그램 ═══════════════════ */
  /* [su, 상태클래스, 셀 수, leaf 라벨] — 셀 = 랙 4개 묶음 */
  var FAB = [
    ["su-4", "pool", 4, "leaf A8 · B8"], ["su-5", "fin", 4, "leaf A8 · B8"],
    ["su-6", "fin", 4, "leaf A8 · B8"], ["su-7", "pool", 4, "leaf A8 · B8"],
    ["su-8", "resv", 4, "leaf A8 · B8"], ["su-9", "pool", 4, "leaf A8 · B8"],
    ["su-10", "pool", 4, "leaf A8 · B8"], ["su-11", "pool", 2, "leaf A2 · B2"],
  ];

  function renderFabric() {
    var g = $("#fab-grid");
    if (!g) return;
    if (NC.live && fabData) { renderFabricLive(); return; }   // 라이브: 실토폴로지 우선
    var resvName = prov && prov.tenant ? prov.tenant : "gamma";
    var resvCap = prov && (prov.state === "provisioning" || provDelivered(prov))
      ? "<b>" + resvName + " 배포 중</b>" :
      prov && prov.state === "rejected" ? '<span style="color:var(--muted2)">풀 (해제)</span>' :
      "<b>" + resvName + " 예약</b>";
    g.innerHTML = FAB.map(function (f) {
      var cls = f[1];
      if (f[0] === "su-8" && prov && prov.state === "rejected") cls = "pool";
      var cells = "";
      for (var i = 0; i < f[2]; i++) cells += "<span></span>";
      var cap = f[0] === "su-8" ? resvCap :
        cls === "fin" ? "<b>fin-corp</b>" : '<span style="color:var(--muted2)">풀</span>';
      return '<div class="fab-su ' + cls + '"><div class="fab-leaf">' + f[3] +
        '</div><div class="fab-cells">' + cells + '</div><div class="cap">' +
        f[0] + " " + cap + "</div></div>";
    }).join("");
    var lg = $("#fab-legend-resv");
    if (lg && prov) lg.textContent = prov.state === "provisioning" || provDelivered(prov)
      ? "■ " + resvName + " 배포 중 (" + prov.id + ")"
      : prov.state === "rejected" ? "■ (해제) " + resvName + " 예약 취소"
      : "■ " + resvName + " 예약 (" + prov.id + ")";
  }

  /* ══ ⑧ 인시던트 — 라이브: vrcm 장애 이벤트 리스트 · mock: INC-0412 ══ */
  function liveIncCard(i) {
    var resolved = i.state === "resolved";
    var last = (i.timeline && i.timeline.length)
      ? i.timeline[i.timeline.length - 1][0] : "—";
    return '<div class="acard' + (resolved ? " ok" : "") + '"><div class="hd">' +
      '<b class="mono" style="font-size:11px;color:' +
      (resolved ? "var(--muted)" : "#fff") + '">' + i.id + "</b>" +
      '<span class="sv" style="color:var(--' + (resolved ? "green-text" : "red") + ')">' +
      (i.sev || "—") + (resolved ? " · 해결" : " · 진행 중") + "</span>" +
      '<span style="font-size:12px;color:var(--soft)">' + (i.target || "—") + " " +
      (i.kind || "") + '</span><span class="tm">' + last + "</span></div>" +
      '<div class="meta">테넌트 ' + (i.tenant || "—") + " · 티켓 " + (i.ticket || "—") +
      " · RMA " + (i.rma || "—") + " · 정비 창 " + (i.window || "—") + "</div></div>";
  }

  function renderIncidents() {
    NC.api.incidents().then(function (list) {
      incs = list = list || [];
      var inc = list.filter(function (i) { return i.state !== "resolved"; })[0] || list[0];
      if (!inc) return;
      var resolved = inc.state === "resolved";
      var lb = $("#inc-list");
      if (lb) {
        lb.innerHTML = NC.live
          ? (list.map(liveIncCard).join("") ||
             '<div style="color:var(--muted);font-size:12px">인시던트 없음</div>')
          : '<div class="acard' + (resolved ? " ok" : "") + '"><div class="hd">' +
            '<b class="mono" style="font-size:11px;color:#fff">' + inc.id + "</b>" +
            '<span class="sv" style="color:var(--' + (resolved ? "green-text" : "red") + ')">' +
            inc.sev + (resolved ? " · 해결" : " · 진행 중") + "</span>" +
            '<span style="font-size:12px;color:var(--soft)">' + inc.target + " " + inc.kind +
            '</span><span class="tm">' + (resolved ? "07-09 · RCA 초안" : "4h 22m · oncall-kim") +
            "</span></div>" +
            '<div class="meta">고객 영향 ' + (inc.tenant || "—") + " &lt;0.1% · " +
            (inc.ticket || "—") + " 연계 · " + (inc.rma || "—") + " · 정비 창 " +
            (inc.window || "—") + "</div></div>" +
            '<div class="acard ok"><div class="hd"><b class="mono" style="font-size:11px;color:var(--muted)">INC-0409</b>' +
            '<span class="sv" style="color:var(--green-text)">해결 · RCA 게시</span>' +
            '<span style="font-size:12px;color:var(--soft)">su-6-r01-t09 XID 31 — 자동 복구</span>' +
            '<span class="tm">07-08 · TTR 38s</span></div></div>' +
            '<div class="acard ok" style="margin-bottom:0"><div class="hd"><b class="mono" style="font-size:11px;color:var(--muted)">INC-0405</b>' +
            '<span class="sv" style="color:var(--green-text)">해결</span>' +
            '<span style="font-size:12px;color:var(--soft)">NMX-T 수집 지연 스파이크</span>' +
            '<span class="tm">07-06</span></div></div>';
      }
      var tt = $("#inc-tl-title");
      if (tt) tt.textContent = inc.id + " 타임라인 · RCA";
      var tl = $("#inc-timeline");
      if (tl) tl.innerHTML = (inc.timeline || []).map(function (row) {
        return '<div><span class="ts">' + (row[0] || "—") + "</span> " + (row[1] || "") + "</div>";
      }).join("") || '<div style="color:var(--muted)">타임라인 이벤트 없음</div>';
      var acts = $("#inc-actions");
      if (acts) acts.innerHTML = resolved
        ? '<span class="st green">해결 완료' +
          (inc.ticket && inc.ticket !== "—"
            ? " — " + inc.ticket + " 답변 발송 · RCA 초안 게시" : " — RCA 초안 게시") + "</span>"
        : '<button class="btn" data-open="resolve">해결 처리</button>' +
          '<button class="btn-warn" data-open="rma">RMA 발행</button>' +
          '<button class="btn-cancel" style="padding:6px 12px;font-size:11.5px" data-open="warroom">에스컬레이션</button>';
      var open = list.filter(function (i) { return i.state !== "resolved"; }).length;
      var k = $("#kpi-inc-open");
      if (k) { k.textContent = String(open); k.className = "v " + (open ? "red" : "green"); }
      var ks = $("#kpi-inc-open-s");
      if (ks) ks.textContent = open ? "P2 " + open + " · P1 0" : "전건 해결 · P1 0";
      updateBadges();
      refreshStrip(currentRoute());
    });
    renderIncidentKpis();
  }

  /* 인시던트 KPI — 라이브: faultMetrics() 가용성·MTTA·MTTR (폴백: 정적 유지) */
  function renderIncidentKpis() {
    apiOr("faultMetrics").then(function (f) {
      if (!f) return;
      setHtml("kpi-mtta", (f.mtta_s != null ? f.mtta_s : "—") + "<small>s</small>");
      setTxt("kpi-mtta-s", "NVSentinel 자동 대응 · 실측");
      setHtml("kpi-mttr", (f.mttr_s != null ? f.mttr_s : "—") + "<small>s</small>");
      setTxt("kpi-mttr-s", "HW 교체 제외 · 실측");
      var tot = (f.faults_open || 0) + (f.faults_resolved || 0);
      setHtml("kpi-inc30", fmt(tot));
      setTxt("kpi-inc30-s", "가용성 " + (f.availability_pct != null ? f.availability_pct : "—") +
        "% · 해결 " + fmt(f.faults_resolved || 0));
    });
  }

  /* ══ ⑩ 보안 — SAN-0691 Sanitization 7단계 (mock 유지) ═════ */
  function renderSecurity() {
    NC.api.sanitization().then(function (s) {
      var card = $("#san-card");
      if (!card) return;
      var total = s.steps.length;
      var done = s.step_now;
      var status = s.cert_ready
        ? '<span class="st green">완료 ' + done + "/" + total + " — 증명서 발급 가능</span>"
        : '<span class="st blue">진행 ' + done + "/" + total + " — " + s.steps[done] + "</span>";
      var segs = s.steps.map(function (_, i) {
        return '<span class="' + (i < done ? "d" : i === done ? "c" : "") + '"></span>';
      }).join("");
      var btns = s.cert_ready
        ? '<button class="btn" data-act="san-cert">증명서 발급 (' + s.pdf + ")</button>"
        : '<button class="btn-ghost" data-act="san-advance">단계 진행 — ' + s.steps[done] + "</button>" +
          '<button class="btn" disabled>증명서 발급</button>';
      card.innerHTML =
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
        '<span class="dot ' + (s.cert_ready ? "green" : "amber") + '"></span>' +
        '<b class="mono" style="font-size:11px;color:#fff">' + s.id + "</b>" +
        '<span style="font-size:12px">' + s.tenant + " 회수분 · " + s.racks + "랙</span>" + status +
        '<span style="margin-left:auto;color:var(--muted);font-size:10.5px">' +
        (s.cert_ready ? "PASS " + total + "/" + total : "ETA " + (total - done) * 11 + "분") +
        "</span></div>" +
        '<div class="sanseg">' + segs + "</div>" +
        '<div class="sanlbl"><span>nvme</span><span>hbm</span><span>mem</span><span>tpm</span><span>fw</span><span>bmc</span><span>rpt</span></div>' +
        '<div style="display:flex;gap:7px;margin-top:10px">' + btns + "</div>";
    });
  }

  /* ══ 톱바 Reconcile — 라이브: POST /reconcile/run (읽기 감사) ══ */
  function renderReconcileResult(r) {
    var box = $("#ov-reconcile");
    if (!box || !r) return;
    var finds = r.findings || [];
    var ok = r.ok !== false && !finds.length;
    var now = new Date().toTimeString().slice(0, 5);
    box.style.display = "";
    box.innerHTML =
      '<div class="callout' + (ok ? "" : " warn") + '" style="margin-bottom:16px">' +
      "<b style='color:var(--soft)'>Reconcile " + now + "</b> — 노드 " + fmt(r.checked_nodes || 0) +
      " · 호스트 " + fmt(r.checked_hosts || 0) + " 검사 · GHOST " + fmt(r.ghosts_registered || 0) +
      " · ORPHAN " + fmt(r.orphans_cordoned || 0) + " · MISMATCH " + fmt(r.mismatches || 0) +
      (ok ? ' — <b style="color:var(--green-text)">정합성 이상 없음</b>'
          : ' — <b style="color:var(--amber)">발견 ' + finds.length + "건</b>") +
      "</div>" +
      finds.slice(0, 5).map(function (x) {
        if (typeof x === "string") return '<div class="iso g">' + esc(x) + "</div>";
        return '<div class="iso g"><b>[' + esc(x.kind || x.type || "FINDING") + "]</b> " +
          esc(x.id || x.host_id || x.node_id || "") + " " + esc(x.detail || x.message || "") + "</div>";
      }).join("");
  }

  /* ══ ② 자산 인벤토리 (CMDB) — 라이브: fake-nico hosts 2,520 ══
     서버가 limit/offset/state/q를 무시하므로 전량 캐시 후 클라이언트 필터/페이징. */
  function assetsFiltered() {
    var f = assetsFilter;
    return (assetsCache || []).filter(function (h) {
      if (f.site && (h.site || "").indexOf(f.site) < 0) return false;
      if (f.state && h.state !== f.state) return false;
      if (f.q) {
        var hay = ((h.host_id || "") + " " + (h.tray_id || "") + " " + (h.tenant_ref || "") +
          " " + (h.instance_id || "") + " " + (h.site || "")).toLowerCase();
        if (hay.indexOf(f.q.toLowerCase()) < 0) return false;
      }
      return true;
    });
  }

  var HOST_ST = {
    allocated: ["green", "가동 (할당)"], pool_ready: ["blue", "pool_ready"],
    maintenance: ["amber", "정비 중"], faulted: ["red", "faulted"],
  };

  function renderAssetsTable() {
    var body = $("#assets-body");
    if (!body || !assetsCache || !assetsCache.length) return;   // mock: 정적 표 유지
    var list = assetsFiltered();
    if (assetsFilter.offset >= list.length) assetsFilter.offset = 0;
    var a = assetsFilter.offset, b = Math.min(a + PAGE, list.length);
    var head = $("#assets-head");
    if (head) head.innerHTML =
      "<th>호스트</th><th>트레이 / SKU</th><th>사이트</th><th>상태</th>" +
      "<th>펌웨어 · 증명</th><th>테넌트 / 인스턴스</th><th class='num'>조치</th>";
    body.innerHTML = list.slice(a, b).map(function (h) {
      var st = HOST_ST[h.state] || ["gray", h.state || "—"];
      return '<tr data-host="' + esc(h.host_id) + '" data-tray="' + esc(h.tray_id) +
        '" style="cursor:pointer" title="클릭 시 하드웨어 상세">' +
        td('<span class="id">' + esc(h.host_id) + "</span>") +
        td('<span class="id" style="color:var(--muted)">' + esc(h.tray_id) + "</span>" +
           '<div style="color:var(--muted2);font-size:10px">' + esc(h.sku || "—") + "</div>") +
        td(muted(esc(h.site || "—"))) +
        td('<span class="st ' + st[0] + '"><span class="dot ' + st[0] + '"></span> ' + esc(st[1]) + "</span>" +
           (h.cordoned ? ' <span class="st red">cordon</span>' : "")) +
        td('<span class="st ' + (h.firmware_ok ? "green" : "amber") + '">fw ' +
           (h.firmware_ok ? "OK" : "드리프트") + "</span> " +
           '<span class="st ' + (h.attested ? "green" : "red") + '">attest ' +
           (h.attested ? "OK" : "실패") + "</span>") +
        td('<span class="id" style="color:var(--muted)">' + esc(h.tenant_ref || "—") + "</span>" +
           '<div style="color:var(--muted2);font-size:10px">' + esc(h.instance_id || "—") + "</div>") +
        td('<button class="btn-ghost" style="padding:3px 9px;font-size:10.5px" data-act="asset-hw" data-host="' +
           esc(h.host_id) + '" data-tray="' + esc(h.tray_id) + '">상세</button> ' +
           '<button class="btn-ghost" style="padding:3px 9px;font-size:10.5px;color:var(--amber)" data-act="asset-rma" data-tray="' +
           esc(h.tray_id) + '">RMA</button>', "num") +
        "</tr>";
    }).join("") || '<tr><td colspan="7" style="color:var(--muted)">필터 결과 없음</td></tr>';
    setTxt("assets-count", fmt(list.length) + "건 중 " + (list.length ? a + 1 : 0) + "–" + b +
      " 표시 · fake-nico 실데이터");
    var pager = $("#assets-pager");
    if (pager) pager.style.display = "";
    setTxt("csv-scope", "현재 필터 결과 — " + fmt(list.length) + "건 (라이브 · 실 CSV 생성)");
  }

  function renderAssetsKpi(sum, topo) {
    var band = $("#assets-kpi");
    if (!band || !assetsCache) return;
    var racks = 0, gpus = 0;
    if (topo && topo.factories) {
      topo.factories.forEach(function (f) {
        (f.compute_blocks || []).forEach(function (cb) {
          (cb.deployment_units || []).forEach(function (du) {
            (du.scalable_units || []).forEach(function (su) {
              racks += (su.racks || []).length;
              gpus += su.gpu_count || 0;
            });
          });
        });
      });
    }
    var by = (sum && sum.by_state) || {};
    var byTxt = Object.keys(by).map(function (k) {
      return k.replace(/_/g, "-") + " " + fmt(by[k]);
    }).join(" · ") || "—";
    var cord = assetsCache.filter(function (h) { return h.cordoned; }).length;
    var fwBad = assetsCache.filter(function (h) { return h.firmware_ok === false; }).length;
    var atBad = assetsCache.filter(function (h) { return h.attested === false; }).length;
    band.innerHTML =
      kpiCell("총 트레이 (노드)", fmt((sum && sum.total) || assetsCache.length), "",
        kpiSub("fake-nico CMDB 실데이터")) +
      kpiCell("NVL72 랙", racks ? fmt(racks) : "—", "",
        kpiSub(gpus ? "GPU " + fmt(gpus) + " · topology 실측" : "topology 집계")) +
      kpiCell("상태별 노드", byTxt, "", kpiSub("nodes/summary")) +
      kpiCell("cordoned", String(cord), cord ? "amber" : "green",
        kpiSub(cord ? "M4 배치 제외" : "격리 노드 없음")) +
      kpiCell("펌웨어 드리프트", String(fwBad), fwBad ? "amber" : "green",
        kpiSub(fwBad ? "표준화 필요" : "전 노드 일치")) +
      kpiCell("Attestation 실패", String(atBad), atBad ? "red" : "green",
        kpiSub(atBad ? "TPM 재증명 필요" : "전 노드 PASS"));
  }

  function renderAssets() {
    Promise.all([apiOr("hosts", { limit: 3000 }), apiOr("nodesSummary"), apiOr("topologyTree")])
      .then(function (r) {
        if (!r[0] || !r[0].length) return;      // 폴백: 정적 mock 표 유지
        assetsCache = r[0];
        topoCache = r[2] || topoCache;
        renderAssetsKpi(r[1], topoCache);
        renderAssetsTable();
      });
  }

  function exportAssetsCsv() {
    var rows = assetsFiltered();
    var cols = ["host_id", "tray_id", "sku", "site", "state", "firmware_ok",
      "attested", "cordoned", "instance_id", "tenant_ref", "image_ref", "host_ip"];
    var csv = "\uFEFF" + cols.join(",") + "\n" + rows.map(function (h) {
      return cols.map(function (c) {
        var v = h[c]; v = v == null ? "" : String(v);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(",");
    }).join("\n");
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    var aEl = document.createElement("a");
    aEl.href = URL.createObjectURL(blob);
    aEl.download = "assets-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + ".csv";
    document.body.appendChild(aEl);
    aEl.click();
    setTimeout(function () { URL.revokeObjectURL(aEl.href); aEl.remove(); }, 500);
    return rows.length;
  }

  function openHostHw(hostId, trayId) {
    hwHost = { id: hostId, tray: trayId };
    setTxt("hw-title", "호스트 하드웨어 — " + hostId);
    setHtml("hw-body", '<div style="color:var(--muted);font-size:12px">불러오는 중…</div>');
    NC.openModal("asset_hw");
    apiOr("hostHardware", hostId).then(function (h) {
      if (!h) {
        setHtml("hw-body",
          '<div style="color:var(--muted);font-size:12px">하드웨어 정보 없음 — vrcm 미기동(mock) 상태</div>');
        return;
      }
      var fw = h.firmware || {};
      var g0 = (h.gpus || [])[0], c0 = (h.cpus || [])[0];
      setHtml("hw-body",
        '<table class="kv tabnum">' +
        "<tr><td>SKU / MAC (S/N)</td><td class='id'>" + esc(h.sku || "—") + " · " + esc(h.mac || "—") + "</td></tr>" +
        "<tr><td>GPU</td><td>" + (h.gpus || []).length + "× " +
          (g0 ? esc(g0.arch) + " " + g0.hbm_gb + "GB " + esc(g0.hbm_type || "") + " (die " + g0.dies + ")" : "—") + "</td></tr>" +
        "<tr><td>CPU</td><td>" + (h.cpus || []).length + "× " +
          (c0 ? esc(c0.arch) + " " + c0.cores + "코어 · " + c0.mem_tb + "TB" : "—") + "</td></tr>" +
        "<tr><td>DPU / SuperNIC</td><td class='id'>" +
          (h.dpu ? esc(h.dpu.sku) + " " + h.dpu.bw_gbps + "G (" + esc(h.dpu.mode) + ")" : "—") +
          " · ConnectX ×" + (h.connectx_supernics != null ? h.connectx_supernics : "—") + "</td></tr>" +
        "<tr><td>펌웨어</td><td class='id'>BIOS " + esc(fw.bios || "—") + " · BMC " + esc(fw.bmc || "—") +
          " · CPLD " + esc(fw.cpld || "—") + "<br>DPU BFB " + esc(fw.dpu_bfb || "—") +
          " · GPU VBIOS " + esc(fw.gpu_vbios || "—") + "</td></tr>" +
        "<tr><td>관리 IP</td><td class='id'>BMC " + esc(h.bmc_ip || "—") + " · DPU " + esc(h.dpu_ip || "—") + "</td></tr>" +
        "</table>");
    });
  }

  function setRmaModal(tray) {
    setTxt("rma-title", "RMA 발행 — " + (tray || "su-5-rack-03-tray-11"));
    if (tray) setTxt("rma-part", "컴퓨트 트레이 · " + tray + " — 확정 시 실장비 maintenance 전환");
  }

  /* ══ ⑤ 네트워크 — 라이브: fabric/ib + segments ══════════════ */
  function fabSiteObj() {
    var sites = (fabData && fabData.sites) || [];
    return sites.filter(function (s) {
      var nm = (s.name || "") + (s.site || "");
      return fabSite === "gasan" ? /가산|Gasan/i.test(nm) : /안산|Ansan/i.test(nm);
    })[0] || sites[0];
  }

  function spineLabel(net, fallback) {
    var sp = (net && net.spines) || [];
    if (!sp.length) return fallback;
    var base = String(sp[0].id || "").replace(/-\d+$/, "");
    return (net.name || "Fabric") + " 스파인 ×" + sp.length + " — " + base + "-1.." + sp.length +
      " (" + (sp[0].model || "Quantum XDR") + ")";
  }

  function renderFabricLive() {
    var g = $("#fab-grid");
    var s = fabSiteObj();
    if (!g || !s) return;
    var tmap = {};
    (fabData.tenants || []).forEach(function (t) { tmap[t.tenant_id] = t; });
    g.innerHTML = (s.sus || []).map(function (su) {
      var racks = su.racks || [];
      var tset = {};
      racks.forEach(function (rk) { if (rk.tenant_id) tset[rk.tenant_id] = 1; });
      var tids = Object.keys(tset);
      var cells = "";
      for (var i = 0, n = Math.max(1, Math.ceil(racks.length / 4)); i < n; i++) cells += "<span></span>";
      var cap = tids.length
        ? "<b>" + tids.map(function (id) { return esc((tmap[id] || {}).name || id); }).join("·") + "</b>"
        : '<span style="color:var(--muted2)">풀</span>';
      return '<div class="fab-su ' + (tids.length ? "fin" : "pool") + '">' +
        '<div class="fab-leaf">leaf ×' + (su.leaves_per_network || "?") + " · rail " + (su.rails || 8) + "</div>" +
        '<div class="fab-cells">' + cells + "</div>" +
        '<div class="cap">' + esc(su.su_id) + " " + cap + " (" + racks.length + "랙)</div></div>";
    }).join("");
    var nets = s.networks || [];
    var nA = nets.filter(function (n) { return /a$/i.test(n.name || ""); })[0] || nets[0];
    var nB = nets.filter(function (n) { return /b$/i.test(n.name || ""); })[0] || nets[1];
    setTxt("fab-spineA", spineLabel(nA, "Fabric-A 스파인 — Quantum XDR"));
    setTxt("fab-spineB", spineLabel(nB, "Fabric-B 스파인 — Quantum XDR"));
    var lg = $("#fab-legend");
    if (lg) {
      var sName = s.name || "";
      lg.innerHTML = (fabData.tenants || []).filter(function (t) {
        return (t.site || "") === sName;
      }).map(function (t) {
        return '<span style="color:var(--leaf-green)">■ ' + esc(t.name) + " (" + esc(t.pkey) +
          " · " + t.racks + "랙)</span>";
      }).join("") +
        '<span style="color:var(--muted2)">■ 미할당 풀</span>' +
        '<span style="margin-left:auto">' + esc(s.ib_tier || "") + " · UFM HA ×" +
        (s.ufm_ha_sets != null ? s.ufm_ha_sets : "—") + " · 셀 = 랙 4개 묶음</span>";
    }
  }

  function renderNetworkLive() {
    if (!fabData) return;
    renderFabricLive();
    /* P_Key 테이블 = fabric.tenants */
    var ph = $("#pkey-head"), pb = $("#pkey-body");
    if (ph && pb) {
      ph.innerHTML = "<th>P_Key</th><th>테넌트</th><th class='num'>랙</th><th>사이트</th><th>상태</th>";
      pb.innerHTML = (fabData.tenants || []).map(function (t) {
        return "<tr>" + td('<span class="id">' + esc(t.pkey || "—") + "</span>") +
          td("<b>" + esc(t.name || t.tenant_id) + "</b>") +
          td(fmt(t.racks || 0), "num") + td(muted(esc(t.site || "—"))) +
          td('<span class="st green">enforced</span>') + "</tr>";
      }).join("") || '<tr><td colspan="5" style="color:var(--muted)">활성 파티션 없음</td></tr>';
    }
    /* KPI: 활성 P_Key · 스파인/SU 집계 */
    var spines = 0, sus = 0;
    (fabData.sites || []).forEach(function (s) {
      (s.networks || []).forEach(function (n) { spines += (n.spines || []).length; });
      sus += (s.sus || []).length;
    });
    setTxt("kpi-pkey", String((fabData.tenants || []).length));
    setTxt("kpi-pkey-s", "테넌트 파티션 · UFM enforced");
    setTxt("kpi-fabric-s", "듀얼 A/B · 스파인 " + spines + " · SU " + sus + " (실토폴로지)");
    /* VXLAN 테이블 = segments */
    if (segData) {
      var vh = $("#vxlan-head"), vb = $("#vxlan-body");
      if (vh && vb) {
        vh.innerHTML = "<th>세그먼트</th><th>VRF</th><th class='num'>L3VNI</th>" +
          "<th class='num'>Converged VNI</th><th class='num'>호스트</th>";
        vb.innerHTML = segData.map(function (sg) {
          return "<tr>" + td('<span class="id">' + esc(sg.segment_id || "—") + "</span>" +
            '<div style="color:var(--muted2);font-size:9.5px">' + esc(sg.tenant_ref || "") + "</div>") +
            td(esc(sg.vrf || "—")) + td(fmt(sg.l3vni || 0), "num") +
            td(fmt(sg.converged_vni || 0), "num") +
            td(fmt((sg.host_ids || []).length), "num") + "</tr>";
        }).join("") || '<tr><td colspan="5" style="color:var(--muted)">세그먼트 없음</td></tr>';
      }
    }
  }

  function renderNetwork() {
    renderFabric();                              // mock/직전 캐시 기준 즉시 렌더
    Promise.all([apiOr("fabric"), apiOr("segments")]).then(function (r) {
      if (r[0]) fabData = r[0];
      if (r[1]) segData = r[1];
      if (fabData) renderNetworkLive();          // 폴백: 정적 표 유지
    });
  }

  /* ══ ⑥ 전력 · 환경 (DCIM) — 라이브: spec+sitesInventory+EMU ══ */
  function firstRack(topo) {
    var found = null;
    if (topo && topo.factories) {
      topo.factories.forEach(function (f) {
        (f.compute_blocks || []).forEach(function (cb) {
          (cb.deployment_units || []).forEach(function (du) {
            (du.scalable_units || []).forEach(function (su) {
              if (!found && (su.racks || []).length) found = su.racks[0];
            });
          });
        });
      });
    }
    return found;
  }

  function renderPower() {
    Promise.all([apiOr("spec"), apiOr("sitesInventory"), apiOr("emuHistoryGlobal", 60),
                 topoCache ? Promise.resolve(topoCache) : apiOr("topologyTree")])
      .then(function (r) {
        var inv = r[1], hist = r[2];
        topoCache = r[3] || topoCache;
        if (!inv || !inv.sites || !hist || !hist.length) return;   // 폴백: 정적 유지
        var last = hist[hist.length - 1] || {};
        var usedKw = last.power_kw || 0;
        var capKw = (inv.totals && inv.totals.power_cap_kw) || 26180;
        setHtml("pw-kpi-use", (usedKw / 1000).toFixed(2) + "<small> / " + (capKw / 1000).toFixed(1) + " MW</small>");
        var bar = $("#pw-kpi-use-bar");
        if (bar) bar.style.width = Math.min(100, Math.round(usedKw / capKw * 100)) + "%";
        var rk = firstRack(topoCache);
        var maxQ = rk && rk.power_cap_kw ? rk.power_cap_kw : 187;
        var maxP = rk && rk.tdp_kw ? rk.tdp_kw : 227;
        var allocRacks = (inv.totals && inv.totals.racks_allocated) || 0;
        setHtml("pw-kpi-rack", (allocRacks ? fmt(Math.round(usedKw / allocRacks)) : "—") +
          "<small> / " + maxQ + " kW</small>");
        setTxt("pw-kpi-rack-s", "MaxQ 캡 " + maxQ + "kW · MaxP(TDP) " + maxP + "kW — vr-nvl72 블루프린트");
        /* 사이트 표 — 사용 전력은 GPU 할당 비례 배분(추정) */
        var head = $("#pw-sites-head"), body = $("#pw-sites-body");
        if (head && body) {
          head.innerHTML = "<th>사이트 / 층</th><th style='width:180px'>사용(추정) / 캡</th>" +
            "<th class='num'>여유</th><th class='num'>GPU 할당</th>";
          var totAllocG = (inv.totals && inv.totals.gpus_allocated) || 0;
          body.innerHTML = inv.sites.map(function (s) {
            var capMw = (s.power_cap_kw || 0) / 1000;
            var estMw = totAllocG ? (usedKw * ((s.gpus_allocated || 0) / totAllocG)) / 1000 : 0;
            var pct = capMw ? Math.min(100, Math.round(estMw / capMw * 100)) : 0;
            var spare = capMw - estMw;
            var rows = "<tr>" +
              td("<b>" + esc(s.name || s.site) + "</b> (" + fmt(s.racks_total || 0) + "랙)") +
              td('<span class="pb" style="width:130px"><span style="width:' + pct + '%"></span></span> ' +
                 estMw.toFixed(2) + " / " + capMw.toFixed(1) + "MW") +
              td('<span style="color:' + (spare / capMw < 0.2 ? "var(--amber)" : "var(--green-text)") +
                 ';font-weight:700">' + spare.toFixed(1) + "MW</span>", "num") +
              td(fmt(s.gpus_allocated || 0) + " / " + fmt(s.gpus_total || 0), "num") + "</tr>";
            rows += (s.floors || []).map(function (fl) {
              return '<tr><td style="color:var(--muted2);padding-left:22px">└ ' + esc(fl.name || "—") +
                "</td>" + td('<span style="color:var(--muted2)">캡 ' + (fl.power_mw != null ? fl.power_mw : "—") +
                "MW</span>") + td(muted("가동 " + esc(fl.ready || "—")), "num") +
                td(muted("—"), "num") + "</tr>";
            }).join("");
            return rows;
          }).join("");
          setTxt("pw-sites-c", "vrcm 인벤토리 + EMU 실측 — 사이트 배분은 GPU 할당 비례 추정");
        }
        var line = $("#pw-spark-line");
        if (line) line.setAttribute("points",
          poly(hist.map(function (h) { return h.power_kw || 0; }), 560, 64));
        setTxt("pw-spark-val", fmt(Math.round(usedKw)));
      });
  }

  /* ══ ⑦ 텔레메트리 — 라이브: emuHistoryGlobal(120)+emuStatus ══ */
  function renderTelemetry() {
    Promise.all([apiOr("emuHistoryGlobal", 120), apiOr("emuStatus")]).then(function (r) {
      var hist = r[0], st = r[1];
      if (!hist || !hist.length) return;         // 폴백: 정적 곡선 유지
      var last = hist[hist.length - 1] || {};
      var pick = function (k) { return hist.map(function (h) { return h[k] || 0; }); };
      setSpark("tel1", "할당 GPU util (평균)",
        (last.avg_util_pct != null ? last.avg_util_pct.toFixed(1) : "—") + "%", pick("avg_util_pct"));
      setSpark("tel2", "처리량 (M tok/s)",
        ((last.tokens_ks || 0) / 1000).toFixed(1) + "M", pick("tokens_ks"));
      setSpark("tel3", "전력 (kW)", fmt(Math.round(last.power_kw || 0)), pick("power_kw"));
      setSpark("tel4", "최대 GPU 온도 (°C)",
        (last.max_gpu_temp_c != null ? last.max_gpu_temp_c.toFixed(1) : "—") + "°C",
        pick("max_gpu_temp_c"));
      if (st) {
        var chip = $("#tel-emu");
        if (chip) {
          chip.style.display = "";
          chip.innerHTML = '<span class="dot green"></span><b>EMU</b> ' +
            '<span style="color:var(--muted)">step ' + fmt(st.step || 0) + " · tick " +
            (st.tick_seconds != null ? st.tick_seconds : "—") + "s · active " +
            fmt(st.trays_active || 0) + "/" + fmt(st.trays_total || 0) + " 트레이</span>";
        }
      }
    });
  }

  /* ══ ⑨ 성능 — 라이브: faultMetrics + EMU 최신 (MFU·Goodput 프록시) ══ */
  function renderPerformance() {
    Promise.all([apiOr("faultMetrics"), apiOr("emuHistoryGlobal", 120)]).then(function (r) {
      var f = r[0], hist = r[1];
      if (hist && hist.length) {
        var last = hist[hist.length - 1] || {};
        setHtml("perf-mfu", (last.avg_util_pct || 0).toFixed(1) + "<small>%</small>");
        setTxt("perf-mfu-s", "avg_util_pct — MFU 프록시 (EMU 실측)");
        setHtml("perf-good", ((last.tokens_ks || 0) / 1000).toFixed(1) + "<small>M tok/s</small>");
        setTxt("perf-good-s", "tokens_ks — Goodput 프록시");
        var lm = $("#perf-line-mfu");
        if (lm) lm.setAttribute("points",
          poly(hist.map(function (h) { return h.avg_util_pct || 0; }), 560, 90));
        var lg2 = $("#perf-line-good");
        if (lg2) lg2.setAttribute("points",
          poly(hist.map(function (h) { return h.tokens_ks || 0; }), 560, 90));
        setHtml("perf-legend",
          '<span style="color:var(--green-text)">● util ' + (last.avg_util_pct || 0).toFixed(1) + "%</span>" +
          '<span style="color:var(--blue-text)">● 처리량 ' + ((last.tokens_ks || 0) / 1000).toFixed(1) + "M tok/s</span>" +
          '<span style="color:var(--muted2);margin-left:auto">EMU 최근 ' + hist.length + "틱</span>");
      }
      if (f) {
        setHtml("perf-sla", (f.availability_pct != null ? f.availability_pct : "—") + "<small>%</small>");
        setTxt("perf-sla-s", "GPU 가용성 실측 · 열린 장애 " + fmt(f.faults_open || 0) + "건");
        var open = (f.recent || []).filter(function (x) { return x.state !== "resolved"; });
        var pv = $("#perf-strag");
        if (pv) { pv.textContent = String(open.length); pv.className = "v " + (open.length ? "amber" : "green"); }
        setTxt("perf-strag-s", open.length ? "미해결 장애 노드" : "미해결 없음 · MTTR " + (f.mttr_s != null ? f.mttr_s : "—") + "s");
        var panel = $("#perf-strag-panel"), list = $("#perf-strag-list");
        if (panel && list) {
          panel.style.display = "";
          var items = open.concat((f.recent || []).filter(function (x) {
            return x.state === "resolved";
          })).slice(0, 6);
          list.innerHTML = items.map(function (x) {
            var res = x.state === "resolved";
            return '<div class="acard' + (res ? " ok" : "") + '"><div class="hd">' +
              '<b class="mono" style="font-size:11px;color:' + (res ? "var(--muted)" : "#fff") + '">' +
              esc(x.tray_id || "—") + "</b>" +
              '<span class="sv" style="color:var(--' + (res ? "green-text" : "red") + ')">XID ' +
              (x.xid != null ? x.xid : "?") + (res ? " · 해결" : " · 진행 중") + "</span>" +
              '<span style="font-size:12px;color:var(--soft)">GPU' + (x.gpu != null ? x.gpu : "?") +
              " · " + esc(x.tenant_id || "—") + "</span>" +
              '<span class="tm">' + esc((x.started_at || "").slice(5, 16)) +
              (res ? " · TTR " + (x.ttr_s != null ? x.ttr_s : "?") + "s" : "") + "</span></div>" +
              '<div class="meta">' + esc(x.action || "") + "</div></div>";
          }).join("") || '<div style="color:var(--muted);font-size:12px">장애 이벤트 없음 — 전 노드 정상</div>';
        }
      }
    });
  }

  /* ══ ⑩ 보안 라이브 — 감사 로그·PAM·격리 검증·실 sanitize 리포트 ══ */
  function renderPamList(pams) {
    var box = $("#pam-list");
    if (!box || !pams) return;
    var act = pams.filter(function (p) { return p.state === "active"; });
    var rows = act.concat(pams.filter(function (p) { return p.state !== "active"; })).slice(0, 6);
    box.innerHTML = rows.map(function (p) {
      var a = p.state === "active";
      return '<div style="display:flex;align-items:center;gap:10px;background:var(--card-sub);' +
        'border:1px solid var(--line2);border-radius:8px;padding:8px 12px;margin-top:6px' +
        (a ? "" : ";opacity:.55") + '">' +
        '<span class="dot ' + (a ? "amber" : "gray") + '"></span>' +
        '<span class="id" style="color:#fff">' + esc(p.id) + "</span>" +
        '<span class="id" style="font-size:10px;color:var(--muted)">' + esc(p.operator || "—") +
        " → " + esc(p.target || "—") +
        (a ? " · 녹화 중 · TTL " + Math.round((p.ttl_s || 0) / 60) + "분" : " · 종료 (녹화 봉인)") + "</span>" +
        (a ? '<button class="btn-danger" style="margin-left:auto;padding:2px 9px;font-size:10.5px" ' +
             'data-act="pam-close" data-id="' + esc(p.id) + '">종료</button>' : "") +
        "</div>";
    }).join("") ||
      '<div style="color:var(--muted);font-size:11.5px;margin-top:6px">활성 세션 없음 — [+ 세션 열기]로 실세션 생성</div>';
    setTxt("kpi-pam", String(act.length));
    setTxt("kpi-pam-s", act.length ? "녹화 중 · vrcm 실세션" : "활성 없음 · PAM 실연동");
  }

  function renderSecurityLive() {
    Promise.all([apiOr("audit", 20), apiOr("pamSessions"),
                 NC.api.tenants().catch(function () { return null; })])
      .then(function (r) {
        var audit = r[0], pams = r[1], ts = r[2];
        /* ① 감사 로그 — 실데이터 (폴백: 패널 숨김 유지) */
        var panel = $("#sec-audit-panel"), body = $("#sec-audit-body");
        if (audit && audit.length && panel && body) {
          panel.style.display = "";
          body.innerHTML = audit.map(function (a) {
            var ok = a.result === "success";
            return "<tr>" +
              td('<span class="id" style="color:var(--muted);font-size:10px">' +
                 esc(String(a.at || "").slice(5, 19).replace("T", " ")) + "</span>") +
              td('<span class="id">' + esc(a.actor || "—") + "</span>") +
              td(esc(a.action || "—")) +
              td('<span class="id" style="color:var(--muted)">' + esc(a.target || "—") + "</span>") +
              td('<span class="st ' + (ok ? "green" : "red") + '">' + esc(a.result || "—") + "</span>") +
              "</tr>";
          }).join("");
          setTxt("sec-audit-c", "vrcm 감사 스트림 — 최근 " + audit.length + "건 (실데이터)");
        }
        /* ② PAM 세션 목록 — 실데이터 */
        if (pams) renderPamList(pams);
        /* ③ 격리 검증 — 첫 활성(할당 보유) 테넌트 */
        if (NC.live && ts && ts.length) {
          var t = ts.filter(function (x) { return (x.racks || 0) > 0; })[0] || ts[0];
          if (t) apiOr("isolation", t.id).then(function (iso) {
            if (!iso) return;
            setTxt("iso-title", "격리 검증 — " + (t.name || t.id));
            var badge = $("#iso-badge");
            if (badge) {
              badge.style.display = "";
              badge.textContent = iso.ok ? "PASS" : "FAIL";
              badge.className = "st " + (iso.ok ? "green" : "red");
            }
            setHtml("iso-body", (iso.findings || []).map(function (fd) {
              var cls = fd.severity === "pass" ? "" : (fd.severity === "warn" ? " w" : " g");
              return '<div class="iso' + cls + '"><b>[' + esc(fd.layer || "?") + "]</b> " +
                esc(fd.message || "") + "</div>";
            }).join("") || '<div class="iso">검증 항목 없음</div>');
            var k = $("#kpi-iso");
            if (k) { k.textContent = iso.ok ? "PASS" : "FAIL"; k.className = "v " + (iso.ok ? "green" : "red"); }
            setTxt("kpi-iso-s", (t.name || t.id) + " · " + (iso.findings || []).length + "레이어 실검증");
          });
        }
        /* ④ 실 sanitize 리포트 — 가능한 호스트가 있으면 병기 (없으면 생략) */
        if (NC.live) {
          var cand = (assetsCache || []).filter(function (h) {
            return h.state && !/^(allocated|pool_ready)$/.test(h.state);
          })[0];
          if (cand) apiOr("sanitizeReport", cand.host_id).then(function (rep) {
            var box = $("#san-live");
            if (!rep || !box) return;
            box.style.display = "";
            box.innerHTML =
              '<div style="font-size:11px;color:var(--muted);font-weight:700;margin-bottom:6px">' +
              "실 Sanitize 리포트 — " + esc(rep.host_id || cand.host_id) + " (vrcm)</div>" +
              '<div class="mono" style="font-size:10.5px;color:var(--soft);word-break:break-all">' +
              esc(JSON.stringify(rep).slice(0, 400)) + "</div>";
          });
        }
      });
  }

  /* ══ ⑪ 변경 (CAB) — 라이브: equipment() 정비 대상 실데이터 ══ */
  function renderChange() {
    apiOr("equipment").then(function (eq) {
      var panel = $("#chg-equip-panel"), body = $("#chg-equip-body");
      if (!eq || !panel || !body) return;        // 폴백: 패널 숨김 유지
      panel.style.display = "";
      var tot = eq.totals || {};
      setTxt("chg-equip-c", "unhealthy " + (tot.unhealthy_equipment != null ? tot.unhealthy_equipment : "—") +
        " · breakfix " + (tot.breakfix_nodes != null ? tot.breakfix_nodes : "—") + " — vrcm 실장비 상태");
      var list = eq.faulted_equipment || [];
      body.innerHTML = list.map(function (x) {
        return "<tr>" + td(esc(x.kind || "—")) +
          td('<span class="id">' + esc(x.id || "—") + "</span>") +
          td('<span class="st ' + (x.state === "maintenance" ? "amber" : "red") + '">' +
             esc(x.state || "—") + "</span>") +
          td('<span class="id" style="color:var(--muted)">' + esc(x.tenant_id || "—") + "</span>") +
          td('<button class="btn-ghost" style="padding:3px 10px;font-size:10.5px" data-act="equip-restore" ' +
             'data-kind="' + esc(x.kind || "tray") + '" data-id="' + esc(x.id || "") + '">복구 → ready</button>', "num") +
          "</tr>";
      }).join("") ||
        '<tr><td colspan="5" style="color:var(--green-text)">정비 대상 없음 — 전 장비 정상 (unhealthy 0)</td></tr>';
    });
  }

  /* ══ 사이드바 배지 ═════════════════════════════════════════ */
  function updateBadges() {
    var bp = $("#bd-prov");
    if (bp && prov) {
      var pend = prov.state === "approval_pending";
      if (pend) bp.textContent = String(prov.queue != null ? Math.max(prov.queue, 1) : 1);
      bp.style.display = pend ? "" : "none";   // delivered/rejected → 배지 제거
    }
    var bi = $("#bd-inc");
    if (bi && incs) {
      var n = incs.filter(function (i) { return i.state !== "resolved"; }).length;
      bi.textContent = String(n);
      bi.style.display = n ? "" : "none";
    }
  }

  /* ══ 톱바 보조 기능 ═══════════════════════════════════════ */
  /* ① 유지보수 모드 — 콘솔 정책 레이어 토글 (vrcm 글로벌 모드 API 없음).
     ON: amber 배너 + 버튼 활성 + provisioning 승인에 confirm 1단계.
     상태는 localStorage(nc-ops-maint = ON ISO 시각)로 유지. */
  var MAINT_KEY = "nc-ops-maint";
  function maintOn() {
    try { return !!localStorage.getItem(MAINT_KEY); } catch (e) { return false; }
  }
  function fmtSince(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " +
      p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function renderMaintMode() {
    var on = maintOn();
    var btn = document.getElementById("btn-maint-mode");
    if (btn) {
      btn.classList.toggle("solid", on);
      btn.textContent = on ? "유지보수 모드 ON" : "유지보수 모드";
    }
    var ban = document.getElementById("maint-banner");
    if (ban) ban.style.display = on ? "" : "none";
    if (on) setTxt("maint-since", fmtSince(localStorage.getItem(MAINT_KEY)));
  }

  /* ② 알림 배지 — alerts() 미해결(warn) 수 (드롭다운은 shared/palette.js [data-notif]) */
  function refreshNotifBadge() {
    NC.api.alerts().then(function (list) {
      var n = (list || []).filter(function (a) { return a.sev === "warn"; }).length;
      var b = document.getElementById("notif-badge");
      if (b) { b.textContent = String(n); b.style.display = n ? "" : "none"; }
    });
  }

  /* ③ palette.host — ⌘K 팔레트 호스트 선택 → assets 검색창 주입 + 필터 */
  function applyAssetsQuery(q) {
    var inp = document.getElementById("af-q");
    if (inp) inp.value = q || "";
    assetsFilter.q = String(q || "").trim();
    assetsFilter.offset = 0;
    renderAssetsTable();
  }
  function showAssets() {                       // assets 라우트 onShow
    var m = location.hash.match(/[?&]q=([^&]+)/);
    if (m) applyAssetsQuery(decodeURIComponent(m[1]));
    renderAssets();
  }

  /* ④ 내보내기 공통 — Blob 다운로드 · 유지보수 캘린더 iCal */
  function downloadText(name, mime, txt) {
    var blob = new Blob([txt], { type: mime });
    var aEl = document.createElement("a");
    aEl.href = URL.createObjectURL(blob);
    aEl.download = name;
    document.body.appendChild(aEl);
    aEl.click();
    setTimeout(function () { URL.revokeObjectURL(aEl.href); aEl.remove(); }, 500);
  }
  function exportChangeIcs() {                  // change 화면 .calrow → VEVENT
    var yr = new Date().getFullYear();
    var ev = [];
    document.querySelectorAll('section[data-screen="change"] .calrow')
      .forEach(function (r) {
        var ts = ((r.querySelector(".ts") || {}).textContent || "").trim();
        var m = ts.match(/^(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
        if (!m) return;
        var b = r.querySelector("b");
        var title = (b ? b.textContent : "유지보수").trim().replace(/[,;\\]/g, " ");
        ev.push("BEGIN:VEVENT\r\nUID:nc-ops-" + yr + m[1] + m[2] + "-" + m[3] + m[4] +
          "@neocloud\r\nDTSTART;TZID=Asia/Seoul:" + yr + m[1] + m[2] + "T" + m[3] + m[4] +
          "00\r\nSUMMARY:" + title + "\r\nEND:VEVENT");
      });
    downloadText("maintenance-" + yr + ".ics", "text/calendar;charset=utf-8",
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//NeoCloud Ops//Maintenance//KO\r\n" +
      ev.join("\r\n") + "\r\nEND:VCALENDAR\r\n");
    return ev.length;
  }

  /* ══ 액션 — NC.api 호출 + 낙관적 갱신 ══════════════════════ */
  document.addEventListener("click", function (e) {
    /* 크로스 링크 (랙 상세 → · 전체 보기 → · P2 스트립 등) */
    var nav = e.target.closest("[data-nav]");
    if (nav && !e.target.closest("[data-open],[data-close],[data-act]")) {
      NC.nav(nav.dataset.nav);
      return;
    }
    /* 사이트 스코프 토글 (가산 36랙 / 안산 104랙) */
    var sc = e.target.closest("[data-scope]");
    if (sc) {
      siteScope = sc.dataset.scope;
      try { localStorage.setItem("nc-ops-scope", siteScope); } catch (err) {}
      applyScopeChips();
      refreshOverview();                    // 관제 Overview에 즉시 반영
      return;
    }
    /* 패브릭 다이어그램 사이트 토글 (안산/가산) */
    var fs = e.target.closest("[data-fabsite]");
    if (fs) {
      document.querySelectorAll("[data-fabsite]").forEach(function (c) {
        c.classList.toggle("on", c === fs);
        c.style.color = c === fs ? "" : "var(--muted)";
      });
      fabSite = fs.dataset.fabsite;
      renderFabric();
      return;
    }
    /* 자산 행 클릭 → 하드웨어 상세 모달 (버튼 클릭 제외) */
    var hostRow = e.target.closest("tr[data-host]");
    if (hostRow && !e.target.closest("[data-act],[data-open],[data-close],button")) {
      openHostHw(hostRow.dataset.host, hostRow.dataset.tray);
      return;
    }
    var el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    var act = el.dataset.act;

    if (act === "approve") {                    // 승인 — 라이브: 1회 = 1게이트 전진
      /* 유지보수 모드 ON: 콘솔 정책 레이어 — 승인 전 경고 확인 1단계 */
      if (maintOn() && !window.confirm(
        "유지보수 모드 ON — 신규 프로비저닝 승인 보류 권고 상태입니다.\n계속 승인하시겠습니까?")) {
        NC.toast("승인 보류 — 유지보수 모드 정책 (해제 후 재시도 가능)", "warn");
        return;
      }
      NC.api.approveProvision().then(function (res) {
        NC.closeModal("approve");
        res = res || {};
        if (res.ok === false) { NC.toast(res.msg || "승인 대기 주문 없음", "warn"); return; }
        if ("next" in res || res.state) {       // 라이브 게이트 결과 {ok,id,next,state}
          if (prov && prov.id === res.id) {     // 결과.next로 카드·스텝 즉시 갱신
            prov.pending_stage = res.next || null;
            prov.state = res.state === "delivered" ? "delivered"
              : res.next ? "approval_pending" : (res.state || prov.state);
            prov.gate = res.state === "delivered" ? "승인 완료 — 인도됨"
              : res.next ? "승인 게이트 — 다음 단계: " + res.next
              : "상태: " + (res.state || "진행 중");
            renderProvCard(prov);
          } else {
            renderProvisioning();
          }
          NC.toast(res.state === "delivered"
            ? res.id + " 인도 완료 — 전체 게이트 통과 (클러스터 인도)"
            : res.id + " 게이트 승인 — 다음 단계: " + (res.next || res.state));
        } else {                                // mock: ord-9 단일 승인
          NC.toast("ord-9 승인 완료 — 베어메탈 배포 중 (" +
            (prov ? prov.racks * 18 : 144) + "노드 자동 진행)");
          renderProvisioning();
        }
        renderCapacity();
      });
    } else if (act === "reject") {              // 거절 확정 (사유 전달)
      var reason = ($("#reject-reason") || {}).value || "";
      NC.api.rejectProvision(reason).then(function (res) {
        NC.closeModal("reject");
        if (res && res.ok === false) { NC.toast(res.msg || "승인 대기 주문 없음", "warn"); return; }
        NC.toast(((res && res.id) || (prov && prov.id) || "ord-9") +
          " 거절 확정 — 예약 자원(P_Key·소프트 홀드) 해제", "warn");
        renderProvisioning(); renderCapacity();
      });
    } else if (act === "resolve") {             // 인시던트 해결 확정
      var openInc = (incs || []).filter(function (i) { return i.state !== "resolved"; })[0];
      var iid = openInc ? openInc.id : "INC-0412";
      NC.api.resolveIncident(iid).then(function () {
        NC.closeModal("resolve");
        NC.toast(iid + " 해결 처리 — " +
          (openInc && openInc.ticket && openInc.ticket !== "—"
            ? openInc.ticket + " 동시 해결 · " : "") + "RCA 초안 게시");
        renderIncidents(); renderOverviewKpi();
      });
    } else if (act === "san-advance") {         // SAN-0691 단계 진행
      NC.api.advanceSanitization().then(function (s) {
        if (s.cert_ready) NC.toast("SAN-0691 전 단계 완료 (7/7) — 증명서 발급 가능");
        else NC.toast("SAN-0691 단계 완료 — 진행 " + s.step_now + "/" + s.steps.length);
        renderSecurity();
      });
    } else if (act === "san-cert") {            // 증명서 발급 (7/7 도달 시)
      NC.toast("SAN-0691 증명서 발급 — SAN-0691-cert.pdf (감사 로그 기록)");
    } else if (act === "reconcile-run") {       // Reconcile 실행 — 라이브: 실 감사
      NC.closeModal("reconcile");
      apiOr("runReconcile").then(function (r) {
        if (!r) { NC.toast(el.dataset.msg || "Reconcile 적용 실행 (데모)"); return; }
        var n = (r.findings || []).length;
        NC.toast(n
          ? "Reconcile 완료 — 발견 " + n + "건 (GHOST " + fmt(r.ghosts_registered || 0) +
            " · ORPHAN " + fmt(r.orphans_cordoned || 0) + " · MISMATCH " + fmt(r.mismatches || 0) + ")"
          : "Reconcile 완료 — 정합성 이상 없음 (" + fmt(r.checked_nodes || 0) + " 노드 검사)",
          n ? "warn" : undefined);
        renderReconcileResult(r);
        if (currentRoute() !== "overview") NC.nav("overview");
      });
    } else if (act === "assets-prev" || act === "assets-next") {  // 페이지네이션
      var total = assetsFiltered().length;
      if (act === "assets-prev") assetsFilter.offset = Math.max(0, assetsFilter.offset - PAGE);
      else if (assetsFilter.offset + PAGE < total) assetsFilter.offset += PAGE;
      renderAssetsTable();
    } else if (act === "asset-hw") {            // 자산 상세 버튼
      openHostHw(el.dataset.host, el.dataset.tray);
    } else if (act === "asset-rma") {           // 자산 행 RMA 버튼 → rma 모달
      rmaTarget = el.dataset.tray || null;
      setRmaModal(rmaTarget);
      NC.openModal("rma");
    } else if (act === "hw-rma") {              // 하드웨어 모달 → rma 모달
      if (hwHost) { rmaTarget = hwHost.tray; setRmaModal(rmaTarget); }
      NC.closeModal("asset_hw");
      NC.openModal("rma");
    } else if (act === "rma-confirm") {         // RMA 확정 — 라이브: 실장비 전환
      if (NC.live && rmaTarget) {
        apiOr("equipmentSet", "tray", rmaTarget, "maintenance").then(function (r) {
          NC.closeModal("rma");
          if (!r) { NC.toast("장비 전환 실패 — vrcm 응답 없음", "warn"); return; }
          NC.toast("RMA 발행 — " + rmaTarget + " → maintenance 전환 (실장비) · 반출 전 Sanitization 자동", "warn");
          rmaTarget = null;
          renderAssets(); renderChange(); renderOverviewKpi();
        });
      } else {
        NC.closeModal("rma");
        NC.toast(el.dataset.msg || "RMA 발행", el.dataset.kind);
      }
    } else if (act === "export-csv") {          // CSV — 라이브: 실 파일 다운로드
      NC.closeModal("export_csv");
      if (NC.live && assetsCache && assetsCache.length) {
        var cnt = exportAssetsCsv();
        NC.toast("CSV 다운로드 — 현재 조회 결과 " + fmt(cnt) + "건 (BMC IP 등 마스킹 적용)");
      } else {
        NC.toast(el.dataset.msg || "CSV 내보내기 시작", el.dataset.kind);
      }
    } else if (act === "equip-maint" || act === "equip-ready") {  // 유지보수 모달 확정
      var mtKind = ($("#mt-kind") || {}).value || "tray";
      var mtId = (($("#mt-id") || {}).value || "").trim();
      var mtState = act === "equip-maint" ? "maintenance" : "ready";
      if (NC.live && mtId) {
        apiOr("equipmentSet", mtKind, mtId, mtState).then(function (r) {
          NC.closeModal("maintenance");
          if (!r) { NC.toast("장비 전환 실패 — 종류·ID 확인 (" + mtKind + " " + mtId + ")", "warn"); return; }
          NC.toast(mtKind + " " + mtId + " → " + (r.state || mtState) + " 전환 완료 (실장비" +
            (mtState === "ready" && r.state === "allocated" ? " · 할당 원복" : "") + ")",
            mtState === "maintenance" ? "warn" : undefined);
          renderChange(); renderAssets(); renderOverviewKpi();
        });
      } else {
        NC.closeModal("maintenance");
        NC.toast(NC.live ? "장비 ID를 입력하세요 — 전환 미실행" :
          (el.dataset.msg || "유지보수 전환 (데모)"), "warn");
      }
    } else if (act === "equip-restore") {       // 정비 대상 목록 → 복구
      apiOr("equipmentSet", el.dataset.kind || "tray", el.dataset.id, "ready").then(function (r) {
        if (!r) { NC.toast("복구 실패 — vrcm 응답 없음", "warn"); return; }
        NC.toast((el.dataset.id || "") + " → " + (r.state || "ready") + " 복구 완료 (실장비)");
        renderChange(); renderAssets(); renderOverviewKpi();
      });
    } else if (act === "pam-open") {            // PAM 세션 실 생성
      var pTgt = (($("#pam-target") || {}).value || "").trim() || "console:su-5-r03-t11";
      var pRsn = (($("#pam-reason") || {}).value || "").trim() || "운영 점검";
      apiOr("pamOpen", { operator: "oncall-kim", target: pTgt, reason: pRsn }).then(function (r) {
        NC.closeModal("pam_new");
        if (!r) { NC.toast("PAM 세션 생성 (데모) — vrcm 미기동 시뮬레이션", "warn"); return; }
        NC.toast(r.id + " 세션 열림 — " + pTgt + " · TTL " +
          Math.round((r.ttl_s || 900) / 60) + "분 · 녹화 시작", "warn");
        apiOr("pamSessions").then(function (p) { if (p) renderPamList(p); });
      });
    } else if (act === "pam-close") {           // PAM 세션 실 종료
      apiOr("pamClose", el.dataset.id).then(function (r) {
        if (!r) { NC.toast("세션 종료 실패 — vrcm 응답 없음", "warn"); return; }
        NC.toast(el.dataset.id + " 세션 종료 — 녹화 봉인 · 감사 로그 기록");
        apiOr("pamSessions").then(function (p) { if (p) renderPamList(p); });
      });
    } else if (act === "iso-recheck") {         // 격리 재검증
      if (NC.live) { renderSecurityLive(); NC.toast("격리 재검증 실행 — vrcm isolation 4-plane 검사"); }
      else NC.toast(el.dataset.msg || "재검증 시작", el.dataset.kind);
    } else if (act === "maint-mode") {          // 유지보수 모드 토글 (콘솔 정책 레이어)
      if (maintOn()) {
        try { localStorage.removeItem(MAINT_KEY); } catch (e) {}
        NC.toast("유지보수 모드 해제 — 프로비저닝 승인 경고 확인 제거 (원복)");
      } else {
        try { localStorage.setItem(MAINT_KEY, new Date().toISOString()); } catch (e) {}
        NC.toast("유지보수 모드 ON — 신규 프로비저닝 승인 보류 권고 · 콘솔 정책 레이어 (vrcm 글로벌 모드 아님)", "warn");
      }
      renderMaintMode();
    } else if (act === "incident-create") {     // 인시던트 수동 생성 → 실 티켓
      var subj = (($("#incnew-title") || {}).value || "").trim() || "운영 콘솔 수동 인시던트";
      var sevP = ($("#incnew-sev") || {}).value || "P3";
      var sevMap = { P1: "critical", P2: "high", P3: "medium" };
      NC.api.tenants().then(function (ts) {
        var t = (ts || []).filter(function (x) { return (x.racks || 0) > 0; })[0] || (ts || [])[0];
        if (!t) return null;
        return apiOr("createTicket", { tenant_id: t.id, subject: subj,
          severity: sevMap[sevP] || "medium", body: "운영 콘솔 인시던트 등록" })
          .then(function (tk) { return tk ? { tk: tk, tenant: t } : null; });
      }).then(function (res) {
        NC.closeModal("incident_new");
        var ti = $("#incnew-title");
        if (ti) ti.value = "";
        if (res) {
          NC.toast(res.tk.id + " 실 티켓 생성 — " + (res.tenant.name || res.tenant.id) +
            " · " + sevP + "→" + (res.tk.severity || "") + " (vrcm)");
          renderIncidents();
        } else {
          NC.toast("인시던트 생성 (데모) — 온콜 자동 배정 · 알림 룰 연동", "warn");
        }
      });
    } else if (act === "warroom-join") {        // 워룸 참여 → 실 PAM 세션
      var wInc = (incs || []).filter(function (i) { return i.state !== "resolved"; })[0] ||
        (incs || [])[0];
      var wid = wInc ? wInc.id : "INC-0412";
      apiOr("pamOpen", { operator: "oncall-kim", target: "warroom:" + wid,
        reason: "워룸 소집" }).then(function (r) {
        NC.closeModal("warroom");
        if (!r) { NC.toast(el.dataset.msg || "워룸 참여 (데모)", "warn"); return; }
        NC.toast(r.id + " 워룸 세션 개설 — warroom:" + wid + " · TTL " +
          Math.round((r.ttl_s || 900) / 60) + "분 (PAM 녹화 · 감사 기록)", "warn");
        apiOr("pamSessions").then(function (p) { if (p) renderPamList(p); });
      });
    } else if (act === "cab-approve") {         // CAB 승인 — 즉시 적용 옵션
      var applyNow = !!(($("#cab-apply-now") || {}).checked);
      if (!applyNow || !NC.live) {
        NC.closeModal("cab");
        NC.toast(applyNow && !NC.live
          ? "즉시 적용 불가 — vrcm 미기동 · 데모 접수로 처리"
          : (el.dataset.msg || "CAB 변경 승인 (데모 접수)"),
          applyNow && !NC.live ? "warn" : undefined);
      } else {                                  // on: 대상 트레이 1대 실전환
        (assetsCache && assetsCache.length
          ? Promise.resolve(assetsCache) : apiOr("hosts", { limit: 3000 }))
          .then(function (hs) {
            hs = hs || [];
            var cand = hs.filter(function (h) { return h.firmware_ok === false; })[0] ||
              hs.filter(function (h) { return h.state === "pool_ready"; })[0];
            if (!cand) {
              NC.closeModal("cab");
              NC.toast("즉시 적용 대상 없음 (드리프트·유휴 트레이 미발견) — 데모 접수", "warn");
              return;
            }
            apiOr("equipmentSet", "tray", cand.tray_id, "maintenance").then(function (r) {
              NC.closeModal("cab");
              if (!r) { NC.toast("즉시 적용 실패 — vrcm 응답 없음 (데모 접수)", "warn"); return; }
              NC.toast("CAB-88 승인 + 즉시 적용 — " + cand.tray_id +
                " → maintenance 실전환 (변경 창 07-21 유지)", "warn");
              renderChange(); renderAssets(); renderOverviewKpi();
            });
          });
      }
    } else if (act === "export-ical") {         // 유지보수 캘린더 iCal 내보내기
      var nEv = exportChangeIcs();
      NC.toast("iCal 내보내기 — 일정 " + nEv + "건 (maintenance-" +
        new Date().getFullYear() + ".ics · 현재 화면 데이터)");
    } else if (act === "poc") {                 // 미연동 잔존 버튼 — PoC 안내
      NC.toast((el.dataset.msg ||
        el.textContent.replace(/[→↓▾]/g, "").trim()) + " — (PoC 미연동)", "warn");
    } else if (act === "confirm") {             // 일반 모달 확정: close + toast
      var ov = el.closest(".modal-ov");
      if (ov) NC.closeModal(ov.dataset.modal);
      NC.toast(el.dataset.msg || "요청이 접수되었습니다", el.dataset.kind);
    } else if (act === "confirm-only") {        // 모달 유지형 액션: toast만
      NC.toast(el.dataset.msg || "실행되었습니다", el.dataset.kind);
    }
  });

  /* ══ 부트스트랩 ════════════════════════════════════════════ */
  function bindAssetFilters() {
    var siteSel = document.getElementById("af-site");
    if (siteSel) siteSel.addEventListener("change", function () {
      assetsFilter.site = siteSel.value; assetsFilter.offset = 0; renderAssetsTable();
    });
    var stateSel = document.getElementById("af-state");
    if (stateSel) stateSel.addEventListener("change", function () {
      assetsFilter.state = stateSel.value; assetsFilter.offset = 0; renderAssetsTable();
    });
    var q = document.getElementById("af-q"), qt = null;
    if (q) q.addEventListener("input", function () {
      clearTimeout(qt);
      qt = setTimeout(function () {
        assetsFilter.q = q.value.trim(); assetsFilter.offset = 0; renderAssetsTable();
      }, 200);
    });
  }

  function renderSecurityAll() { renderSecurity(); renderSecurityLive(); }

  function boot() {
    renderRackMap();
    renderMaintMode();      // localStorage 복원 (배너 · 버튼 활성)
    refreshNotifBadge();
    renderOverviewKpi();
    renderProvisioning();   // prov 캐시 → 패브릭 다이어그램 포함
    renderCapacity();
    renderIncidents();
    renderSecurity();
    bindAssetFilters();
    NC.bus.on("route", refreshStrip);
    NC.bus.on("route", refreshNotifBadge);
    NC.bus.on("ticket.created", refreshNotifBadge);
    NC.bus.on("incident.resolved", refreshNotifBadge);
    NC.bus.on("palette.host", applyAssetsQuery);   // ⌘K 호스트 → 검색 주입
    NC.bus.on("modal.open", function (id) {        // 워룸 제목 = 실제 인시던트
      if (id !== "warroom") return;
      var oi = (incs || []).filter(function (i) { return i.state !== "resolved"; })[0] ||
        (incs || [])[0];
      if (oi) setTxt("warroom-title", "워룸 · 에스컬레이션 — " + oi.id);
    });
    NC.start({
      overview: refreshOverview,
      assets: showAssets,
      provisioning: renderProvisioning,
      capacity: renderCapacity,
      network: renderNetwork,
      power: renderPower,
      telemetry: renderTelemetry,
      incidents: renderIncidents,
      performance: renderPerformance,
      security: renderSecurityAll,
      change: renderChange,
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
