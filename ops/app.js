/* NeoCloud Ops 콘솔 — 화면 렌더 + NC.api 바인딩
   (shared/app.js: 라우터·모달·토스트·버스 / shared/mock-api.js: mock 데이터 /
    shared/nocp-api.js: nocp(:8000) 기동 시 NC.api 라이브 교체 · NC.live 플래그)
   라이브 시: provisioning은 단계 게이트(1회 승인 = 1단계 전진), overview KPI는
   scale()/equipment()/incidents() 실수치, capacity 사이트 표는 sitesInventory(). */
(function () {
  "use strict";
  var NC = window.NC;
  var $ = function (sel, el) { return (el || document).querySelector(sel); };

  /* 상태 캐시 (NC.api 결과) */
  var prov = null;   // 프로비저닝 승인 대기 주문 (mock: ord-9)
  var incs = null;   // 인시던트 목록
  /* ── 라이브 연동 캐시 (nocp 실데이터 · mock 시 null) ── */
  var assetsCache = null;                       // fake-nico hosts 전체
  var assetsFilter = { site: "", su: "", state: "", q: "", offset: 0 };
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

  /* ── 테넌트 식별 색 — tenant_id 해시로 안정적 팔레트 매핑 (ready/미할당은 회색 유지) ── */
  var TENANT_PALETTE = ["#4f9d5b", "#5aa7e8", "#c8a5e8", "#e0955a", "#5ad0c8",
    "#d87c9e", "#9db85a", "#8a7de8", "#e0c05a", "#6ab0d8"];
  function tenantColor(id) {
    if (!id) return null;
    var s = String(id), h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return TENANT_PALETTE[h % TENANT_PALETTE.length];
  }
  /* Overview 랙맵 mock 행 → 주 테넌트 (라이브는 fabric racks[].tenant_id 사용) */
  var MOCK_ROW_TENANT = {
    "가산 su-1": "acme-ai", "가산 su-2": "beta-ai",
    "안산 su-5": "fin-corp", "안산 su-6": "fin-corp",
  };

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
          var ids = [], tens = [];
          var cells = (su.racks || []).map(function (r) {
            ids.push(r.rack_id || null);
            tens.push(r.tenant_id || null);
            return r.tenant_id ? "A" : "R";
          }).join("");
          if (cells) rows.push([nm + " " + (su.su_id || ""), cells, "", ids, tens]);
        });
      });
      if (rows.length) return rows;
    }
    return RACK_ROWS;
  }

  /* twin 오버레이 — mock 행(단일 su 라벨)도 su-N-rack-MM 규칙으로 id 유도 */
  function rackRowIds(row) {
    if (Array.isArray(row[3])) return row[3];         // 라이브 실 rack_id
    var lb = row[0] || "";
    if (/[,~]/.test(lb)) return null;                 // 합산 행 — 매칭 불가
    var m = /su-\d+/.exec(lb);
    if (!m) return null;
    var ids = [];
    for (var i = 0; i < row[1].length; i++) ids.push(m[0] + "-rack-" + obsPad2(i));
    return ids;
  }
  /* 셀별 테넌트 — 라이브: row[4] 실배열 · mock: 주 테넌트로 A/L 셀 채움 */
  function rackRowTenants(row) {
    if (Array.isArray(row[4])) return row[4];
    var primary = MOCK_ROW_TENANT[row[0]];
    if (!primary) return null;
    return row[1].split("").map(function (c) {
      return (c === "A" || c === "L") ? primary : null;
    });
  }
  function rowPrimaryTenant(tens) {
    if (!tens) return null;
    var cnt = {}, best = null, bc = 0;
    tens.forEach(function (t) {
      if (!t) return;
      cnt[t] = (cnt[t] || 0) + 1;
      if (cnt[t] > bc) { bc = cnt[t]; best = t; }
    });
    return best;
  }
  /* SU행 테넌트 목록 + 랙수 (등장 순) — 셀 그리드 오른쪽 칩용 */
  function rowTenantCounts(tens) {
    var order = [], m = {};
    (tens || []).forEach(function (t) {
      if (!t) return;
      if (!(t in m)) { m[t] = 0; order.push(t); }
      m[t]++;
    });
    return order.map(function (id) { return { id: id, count: m[id] }; });
  }
  /* tenant_id → 표시명 — 라이브: fabric tenants · mock: id 자체(tnt- 제거) */
  function ovTenantName(id) {
    if (!id) return "";
    if (fabCache && fabCache.tenants) {
      var t = fabCache.tenants.filter(function (x) {
        return x.tenant_id === id || x.id === id;
      })[0];
      if (t) return t.name || String(id).replace(/^tnt-/, "");
    }
    return String(id).replace(/^tnt-/, "");
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
    var twin = ovTwinRacks;                  // twin 상태 오버레이 (미연동 시 null)
    var nOff = 0, nCord = 0, nFault = 0, nThr = 0, nPart = 0;
    var nA = 0, nR = 0, nL = 0, nF = 0;
    var tenSeen = [], tenSet = {};           // 범례·칩용 등장 테넌트 (등장 순)
    box.innerHTML = rows.map(function (row) {
      var ids = twin ? rackRowIds(row) : null;
      var tens = rackRowTenants(row);
      var primary = rowPrimaryTenant(tens);
      var cells = row[1].split("").map(function (c, i) {
        if (c === "A") nA++; else if (c === "R") nR++;
        else if (c === "L") nL++; else if (c === "F") nF++;
        var cls = "cell " + CELL_CLS[c];
        var txt = "", ttl = "";
        var ten = tens && tens[i];
        if (ten && !tenSet[ten]) { tenSet[ten] = 1; tenSeen.push(ten); }
        /* 테넌트 색 — 할당(A) 셀에만 (twin off는 !important로 덮어씀 · 오버레이 우선) */
        var bg = (c === "A" && ten) ? tenantColor(ten) : null;
        var teName = ten ? ovTenantName(ten) : null;
        var rk = ids && ids[i] && twin[ids[i]];
        if (rk) {
          var off = rk.power_state === "off";
          var part = rk.power_state === "partial";
          var crit = rk.health === "critical" || rk.health === "faulted" || c === "F";
          var thr = (rk.throttled_gpus || 0) > 0;
          if (off) { cls += " off"; txt = "OFF"; nOff++; }
          if (part) { cls += " part"; nPart++; }
          if (rk.cordoned) { cls += " cordon"; nCord++; }
          if (crit) { cls += " crit"; nFault++; }
          else if (thr) { cls += " throt"; nThr++; }
          ttl = ids[i] + (teName ? " · " + teName : "") + " — 전원 " + (rk.power_state || "on") +
            (part ? " · 트레이 Off " + (rk.trays_off || 0) + "/" + (rk.trays_total || 18) : "") +
            (rk.cordoned ? " · cordoned" : "") +
            (thr ? " · throttled " + rk.throttled_gpus : "") +
            " · health " + (rk.health || "ok") + " (twin)";
        } else {
          var loc = (ids && ids[i]) || (row[0] + " #" + i);
          ttl = loc + (teName ? " · " + teName
            : c === "R" ? " · ready (미할당)" : c === "L" ? " · 예약 잠김" : c === "F" ? " · 장애" : "");
        }
        return '<span class="' + cls + '"' + (ten ? ' data-tenant="' + esc(ten) + '"' : "") +
          (bg ? ' style="background:' + bg + '"' : "") +
          (ttl ? ' title="' + esc(ttl) + '"' : "") + ">" + txt + "</span>";
      }).join("");
      var note = row[2]
        ? '<span style="color:var(--muted2);font-size:10px;padding-left:4px">' + row[2] + "</span>"
        : "";
      /* 셀 그리드 오른쪽 테넌트 칩 — 복수 테넌트면 각 랙수 병기 (색-이름 연결) */
      var tc = rowTenantCounts(tens);
      var multi = tc.length > 1;
      var rightHtml = tc.length
        ? '<span class="rk-tenants">' + tc.map(function (x) {
            var col = tenantColor(x.id);
            return '<span class="rk-ten" data-tenant="' + esc(x.id) + '" style="border-color:' +
              col + ";color:" + col + '" title="' + esc(ovTenantName(x.id) + " · " + x.count + "랙") +
              '">' + esc(ovTenantName(x.id)) + (multi ? " " + x.count : "") + "</span>";
          }).join("") + "</span>"
        : '<span class="rk-tenants"><span class="rk-unalloc">미할당</span></span>';
      return '<div class="rackrow"' + (primary ? ' data-su-tenant="' + esc(primary) + '"' : "") +
        '><span class="lb">' + row[0] + '</span><span class="cells">' + cells + note + "</span>" +
        rightHtml + "</div>";
    }).join("");
    if (ovHlTenant) ovHighlight(ovHlTenant);   // 폴링 재렌더 시 하이라이트 유지
    var leg = document.getElementById("rackmap-leg");
    if (leg) {
      var h = '<span><span class="leg" style="background:var(--ready)"></span> ready ' + nR + "</span>" +
        (nL ? '<span><span class="leg" style="background:var(--amber-bg);border:1px solid var(--amber-dim)"></span> 잠김 ' + nL + "</span>" : "") +
        (nF ? '<span style="color:var(--red)">□ 장애 ' + nF + "</span>" : "");
      if (twin) h +=
        '<span><span class="leg" style="background:#1a212b;outline:1px solid #2a3644"></span> OFF ' + nOff + "</span>" +
        '<span><span class="leg" style="background:linear-gradient(var(--ready) 50%,#1a212b 50%)"></span> 부분 Off ' + nPart + "</span>" +
        '<span><span class="leg" style="background:repeating-linear-gradient(45deg,transparent 0 2px,rgba(240,163,176,.5) 2px 4px)"></span> cordon ' + nCord + "</span>" +
        '<span style="color:var(--red)">□ fault ' + nFault + "</span>" +
        '<span style="color:var(--amber)">□ throttle ' + nThr + "</span>";
      if (tenSeen.length) {                    // 테넌트 색상 칩 (현재 할당 테넌트만)
        h += '<span style="color:var(--muted2)">테넌트:</span>';
        tenSeen.forEach(function (id) {
          h += '<span><span class="leg" style="background:' + tenantColor(id) + '"></span> ' +
            esc(ovTenantName(id)) + "</span>";
        });
      }
      h += '<span style="color:var(--muted2)">' +
        (twin ? "twin 오버레이" : liveRows ? "fabric/ib 실데이터" : "시나리오 mock") + "</span>";
      leg.innerHTML = h;
    }
  }

  /* ── 테넌트 패널 ↔ 랙맵 하이라이트 연동 (hover) ── */
  var ovHlTenant = null;
  function ovHighlight(id) {
    ovHlTenant = id || null;
    document.querySelectorAll("#rackmap [data-tenant]").forEach(function (c) {
      c.classList.toggle("thl", !!id && c.dataset.tenant === id);
    });
    document.querySelectorAll("#rackmap .rackrow[data-su-tenant]").forEach(function (r) {
      r.classList.toggle("thl", !!id && r.dataset.suTenant === id);
    });
    document.querySelectorAll("#ov-tenants tr[data-tenant]").forEach(function (r) {
      r.classList.toggle("thl", !!id && r.dataset.tenant === id);
    });
  }
  document.addEventListener("mouseover", function (e) {
    if (currentRoute() !== "overview") return;
    var t = e.target.closest("[data-tenant],[data-su-tenant]");
    var id = t ? (t.dataset.tenant || t.dataset.suTenant) : null;
    if (id !== ovHlTenant) ovHighlight(id);
  });

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
    ovPollStart();          // 테넌트 현황(5s) · twin 랙 오버레이(5s) · 장애 피드(10s)
  }

  /* ══ Overview 라이브 확장 — 테넌트 운영 현황 · twin 랙 오버레이 · 장애 피드 ══ */
  var ovTwinRacks = null;   // rack_id → twin rack (obs /racks) — 랙 맵 오버레이
  var ovTimer = null, ovTick = 0;

  function ovPollStart() {
    if (ovTimer) { clearInterval(ovTimer); ovTimer = null; }
    ovTick = 0;
    ovPollOnce();
    ovTimer = setInterval(function () {
      if (currentRoute() !== "overview") {
        clearInterval(ovTimer); ovTimer = null;
        return;
      }
      ovTick++;
      ovPollOnce();
    }, 5000);
  }
  function ovPollOnce() {
    ovFetchTwinRacks();
    renderOvTenants();
    if (ovTick % 2 === 0) renderOvFaults();   // 10s
  }
  function ovFetchTwinRacks() {
    obsGet("/racks").then(function (d) {
      if (Array.isArray(d) && d.length) {
        ovTwinRacks = {};
        d.forEach(function (rk) { if (rk.rack_id) ovTwinRacks[rk.rack_id] = rk; });
      } else {
        ovTwinRacks = null;                   // twin 미연동 — NOCP 상태만 (회귀 없음)
      }
      if (currentRoute() === "overview") renderRackMap();
    });
  }

  /* ── 테넌트 운영 현황 — fabric/ib + tickets(NOCP) · slo + alerts(twin) 병합 ── */
  var ovTenShort = function (id) { return String(id || "").replace(/^tnt-/, ""); };

  function renderOvTenants() {
    var body = document.getElementById("ov-tenants");
    if (!body) return;
    Promise.all([
      apiOr("fabric"),
      NC.api.tickets ? NC.api.tickets().catch(function () { return []; }) : Promise.resolve([]),
      obsGet("/slo"),
      obsGet("/alerts?limit=100"),
    ]).then(function (r) {
      var fabLive = !!(r[0] && r[0].tenants && r[0].tenants.length);
      var sloLive = !!(r[2] && r[2].tenants);
      var tickets = r[1] || [];
      var sloMap = {};
      (sloLive ? r[2].tenants : obsMockSlo().tenants).forEach(function (t) {
        sloMap[t.tenant_id] = t;
        sloMap[ovTenShort(t.tenant_id)] = t;
      });
      var alerts = Array.isArray(r[3]) ? r[3] : [];
      var tenP = fabLive
        ? Promise.resolve(r[0].tenants.map(function (t) {
            return { id: t.tenant_id, name: t.name || ovTenShort(t.tenant_id),
              racks: t.racks || 0, gpus: t.gpus != null ? t.gpus : (t.racks || 0) * 72,
              sus: t.sus || [], site: t.site || "—", pkey: t.pkey || "—" };
          }))
        : NC.api.tenants().then(function (ts) {
            return (ts || []).map(function (t) {
              return { id: t.id, name: t.name || t.id, racks: t.racks || 0,
                gpus: t.gpus || (t.racks || 0) * 72, sus: t.sus || [],
                site: t.site || "—", pkey: t.pkey || "—" };
            });
          }).catch(function () { return []; });
      tenP.then(function (list) {
        obsSrc("ov-tenants", fabLive || sloLive,
          fabLive && sloLive ? "● NOCP + Twin 라이브"
            : fabLive ? "● NOCP 라이브 · twin 미연동 (SLO mock)"
            : sloLive ? "● Twin 라이브 · NOCP 미연동" : "◌ 미연동 — mock");
        setTxt("ov-ten-c", "테넌트 " + list.length + " · 5s 폴링" +
          (fabLive ? " · fabric/ib 정본" : " (mock)"));
        body.innerHTML = list.map(function (t) {
          var short = ovTenShort(t.id);
          var s = sloMap[t.id] || sloMap[short] || {};
          var open = tickets.filter(function (x) {
            var xt = String(x.tenant || x.tenant_id || "");
            var st = String(x.state || x.status || "");
            return st !== "resolved" &&
              (xt === t.id || xt === short || ovTenShort(xt) === short);
          }).length;
          var firing = alerts.filter(function (a) {
            if (a.state !== "firing") return false;
            var sum = String(a.summary || "");
            return sum.indexOf(t.id) >= 0 || sum.indexOf(short) >= 0;
          }).length;
          var avail = s.gpu_availability_pct, tgt = s.slo_target_pct;
          var okA = avail == null || tgt == null || avail >= tgt;
          var eb = s.error_budget_remaining_pct;
          var ebCol = eb == null ? "var(--muted)" : eb < 20 ? "var(--red)"
            : eb < 50 ? "var(--amber)" : "var(--green)";
          return '<tr data-nav="obs-slo" data-tenant="' + esc(t.id) +
            '" style="cursor:pointer" title="클릭 시 SLA · Error Budget · hover 시 랙맵 강조">' +
            td('<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:' +
              tenantColor(t.id) + ';margin-right:6px;vertical-align:0"></span><b>' + esc(t.name) + "</b>" +
              '<div style="color:var(--muted2);font-size:9.5px" class="id">' + esc(t.id) + "</div>") +
            td(muted(esc(t.site)) + (t.sus.length
              ? ' <span class="id" style="color:var(--muted2);font-size:10px">' +
                t.sus.map(esc).join("·") + "</span>" : "")) +
            td('<b class="tabnum">' + fmt(t.racks) + "랙</b> <span style='color:var(--muted)'>/ " +
              fmt(t.gpus) + " GPU</span>", "num") +
            td(avail != null
              ? fmt(s.available_gpus != null ? s.available_gpus : 0) +
                ' · <span style="color:' + (okA ? "var(--green-text)" : "var(--red)") +
                ';font-weight:700">' + (+avail).toFixed(2) + "%</span>" +
                (tgt != null ? '<div style="color:var(--muted2);font-size:9.5px">SLO ' + tgt + "%</div>" : "")
              : muted("—"), "num") +
            td(eb != null
              ? '<span class="pb" style="width:90px"><span style="width:' +
                Math.max(0, Math.min(100, eb)) + "%;background:" + ebCol +
                '"></span></span> <span style="font-weight:700;color:' + ebCol + '">' +
                obsN1(eb) + "%</span>"
              : muted("—")) +
            td(firing
              ? '<span class="st red" data-nav="obs-alerts" style="cursor:pointer" title="클릭 시 알림 · 이벤트">● ' +
                firing + "건</span>"
              : '<span class="st green">정상</span>', "num") +
            td(open
              ? '<span class="st amber">' + open + "건</span>"
              : muted("0"), "num") +
            td('<span class="id" style="color:var(--muted)">' + esc(t.pkey) + "</span>") +
            "</tr>";
        }).join("") || '<tr><td colspan="8" style="color:var(--muted)">할당 테넌트 없음</td></tr>';
      });
    });
  }

  /* ── 주요 장애 · 이벤트 + 발생 통계 — NOCP /emu/faults 전 도메인 피드 ── */
  var OV_DOM_KO = { gpu: "GPU", cooling: "COOLING", fabric: "FABRIC",
    storage: "STORAGE", reprovision: "REPROV", provisioning: "REPROV" };

  function ovFaultsMock() {
    return [
      { tray_id: "su-5-rack-03", kind: "gpu", severity: "critical",
        detail: "XID 63 — GPU faulted · row-remap pending (INC-0412 연계)",
        at: "2026-07-13T06:19:42Z", resolved: false },
      { tray_id: "cdu-su-5", kind: "cooling", severity: "major",
        detail: "FILTER_DP_HIGH — 2차측 필터 차압 41kPa (임계 35)",
        at: "2026-07-13T08:02:11Z", resolved: false },
      { tray_id: "an-leafA-su6-03:p14", kind: "fabric", severity: "warning",
        detail: "IB 링크 flap ×2 — 케이블 점검 제안",
        at: "2026-07-13T09:42:05Z", resolved: false },
      { tray_id: "vast-ansan", kind: "storage", severity: "warning",
        detail: "VAST capacity 88% — 관찰 (임계 90%)",
        at: "2026-07-13T05:10:00Z", resolved: true },
      { tray_id: "su-6-rack-07", kind: "gpu", severity: "warning",
        detail: "SM clock 저하 2 GPU — HW_SLOWDOWN",
        at: "2026-07-13T05:12:44Z", resolved: true },
      { tray_id: "su-8-rack-00-tray-03", kind: "reprovision", severity: "minor",
        detail: "트레이 재프로비저닝 완료 — 재조인 63s",
        at: "2026-07-12T22:41:00Z", resolved: true },
    ];
  }

  function ovSevChip(sv) {
    return sv === "critical" ? '<span class="st red">CRITICAL</span>'
      : sv === "major" ? '<span class="st red">MAJOR</span>'
      : sv === "warning" ? '<span class="st amber">WARNING</span>'
      : '<span class="st blue">' + esc(String(sv || "info").toUpperCase()) + "</span>";
  }

  function renderOvFaults() {
    var body = document.getElementById("ov-faults");
    if (!body) return;
    apiOr("faultMetrics").then(function (f) {
      var live = !!(f && f.recent);
      var rec = (live ? f.recent : ovFaultsMock()).slice();
      rec.sort(function (a, b) {
        var fa = a.resolved ? 1 : 0, fb = b.resolved ? 1 : 0;
        if (fa !== fb) return fa - fb;                       // firing 우선
        return String(b.at || "").localeCompare(String(a.at || ""));
      });
      var firing = rec.filter(function (x) { return !x.resolved; }).length;
      body.innerHTML = rec.slice(0, 30).map(function (x) {
        var dom = OV_DOM_KO[x.kind] || String(x.kind || "—").toUpperCase();
        return '<tr class="' + (x.resolved ? "" : "firing") +
          '" data-nav="obs-alerts" title="클릭 시 통합 Observability 알림 · 이벤트">' +
          td(obsAt(x.at), "num") +
          td('<span class="id" style="color:var(--muted)">' + esc(dom) + "</span>") +
          td(ovSevChip(x.severity)) +
          td('<span class="id">' + esc(x.tray_id || x.host_id || "—") + "</span>") +
          td(esc((x.detail || "—").slice(0, 96))) +
          td(x.resolved ? '<span class="st gray">resolved</span>'
                        : '<span class="st red">● firing</span>') + "</tr>";
      }).join("") || '<tr><td colspan="6" style="color:var(--green-text)">장애 이벤트 없음</td></tr>';
      setTxt("ov-faults-c", "firing " + firing + " · 전체 " + rec.length + "건 표시 " +
        Math.min(rec.length, 30) + " · 10s" + (live ? " (NOCP 라이브)" : " (mock)"));
      renderOvFaultStats(rec, live);
    });
  }

  function renderOvFaultStats(rec, live) {
    var box = document.getElementById("ov-fstats");
    if (!box) return;
    var byDom = {}, bySev = {}, firing = 0, resolved = 0;
    var now = Date.now(), n1h = 0, n24h = 0;
    rec.forEach(function (x) {
      var d = OV_DOM_KO[x.kind] || String(x.kind || "기타").toUpperCase();
      byDom[d] = (byDom[d] || 0) + 1;
      var sv = x.severity || "info";
      bySev[sv] = (bySev[sv] || 0) + 1;
      if (x.resolved) resolved++; else firing++;
      var t = Date.parse(x.at || "");
      if (!isNaN(t)) {
        if (now - t <= 3600e3) n1h++;
        if (now - t <= 86400e3) n24h++;
      }
    });
    var doms = ["GPU", "COOLING", "FABRIC", "STORAGE", "REPROV"];
    Object.keys(byDom).forEach(function (d) { if (doms.indexOf(d) < 0) doms.push(d); });
    var mx = Math.max.apply(null, doms.map(function (d) { return byDom[d] || 0; }).concat([1]));
    var domCol = { GPU: "var(--green)", COOLING: "#5ad0c8", FABRIC: "#9fd0ff",
      STORAGE: "#c8a5e8", REPROV: "var(--amber)" };
    var tot = firing + resolved || 1;
    box.innerHTML =
      '<div style="color:var(--muted);font-size:10.5px;font-weight:700;letter-spacing:.04em;margin-bottom:5px">도메인별 발생</div>' +
      doms.map(function (d) {
        var n = byDom[d] || 0;
        return '<div class="evrow"><span class="lb" style="width:84px">' + d +
          '</span><i><b style="width:' + (n / mx * 100).toFixed(1) + "%;background:" +
          (domCol[d] || "var(--ready)") + '"></b></i><em>' + n + "</em></div>";
      }).join("") +
      '<div style="color:var(--muted);font-size:10.5px;font-weight:700;letter-spacing:.04em;margin:12px 0 6px">심각도</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
      [["critical", "red"], ["major", "red"], ["warning", "amber"], ["minor", "blue"]]
        .map(function (p) {
          return '<span class="st ' + p[1] + '">' + p[0].toUpperCase() + " " +
            (bySev[p[0]] || 0) + "</span>";
        }).join("") + "</div>" +
      '<div style="color:var(--muted);font-size:10.5px;font-weight:700;letter-spacing:.04em;margin:12px 0 6px">firing vs resolved</div>' +
      '<div class="statebar">' +
      '<i style="width:' + (firing / tot * 100).toFixed(1) + '%;background:var(--red)"></i>' +
      '<i style="width:' + (resolved / tot * 100).toFixed(1) + '%;background:var(--green)"></i></div>' +
      '<div style="display:flex;gap:12px;font-size:10px;color:var(--muted)" class="tabnum">' +
      '<span><span class="leg" style="background:var(--red)"></span> firing ' + firing + "</span>" +
      '<span><span class="leg" style="background:var(--green)"></span> resolved ' + resolved + "</span></div>" +
      '<div style="display:flex;gap:10px;margin-top:12px">' +
      '<div class="sub" style="flex:1;text-align:center"><div style="color:var(--muted2);font-size:9.5px;font-weight:700">최근 1h</div>' +
      '<div style="color:#fff;font-size:17px;font-weight:800" class="tabnum">' + fmt(n1h) + "</div></div>" +
      '<div class="sub" style="flex:1;text-align:center"><div style="color:var(--muted2);font-size:9.5px;font-weight:700">최근 24h</div>' +
      '<div style="color:#fff;font-size:17px;font-weight:800" class="tabnum">' + fmt(n24h) + "</div></div></div>";
    setTxt("ov-fstats-c", "표본 " + rec.length + "건" + (live ? " · NOCP 라이브" : " · mock"));
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

        /* ── 라이브: nocp 인벤토리 실수치 (null 안전) ── */
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
              kpiSub("nocp 장애 이벤트 기반"));
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
     라이브(nocp): 단계 게이트 — pending_stage가 다음 관문, 1회 승인 = 1단계 전진.
     mock: ord-9 단일 승인(approval_pending → provisioning).                    */
  var PROV_STEPS = ["접수", "정책·배치", "예약", "프로비저닝", "격리", "스토리지", "인수검증", "인도"];
  /* nocp 주문 단계명 — PROV_STEPS와 1:1 매핑 */
  var PROV_STAGES = ["received", "validated", "reserved", "provisioning",
                     "isolating", "storage_binding", "acceptance", "delivered"];
  /* managed_k8s 주문 — 인수검증 뒤 K8s 설치 게이트 1단계 추가 (nocp 계약) */
  var PROV_STEPS_K8S = PROV_STEPS.slice(0, 7)
    .concat(["K8s 설치"], PROV_STEPS.slice(7));
  var PROV_STAGES_K8S = PROV_STAGES.slice(0, 7)
    .concat(["k8s_installing"], PROV_STAGES.slice(7));

  function provDelivered(p) {
    return p.state === "delivered" || /인도됨|인도 완료/.test(p.gate || "");
  }

  function renderProvCard(p) {
    prov = p;
    var rejected = p.state === "rejected";
    var delivered = provDelivered(p);
    var pendStage = p.state === "approval_pending" ? (p.pending_stage || null) : null;
    // managed_k8s 주문 — K8s 설치 게이트 포함 9단계 스텝 사용
    var useK8s = p.managed_k8s || p.pending_stage === "k8s_installing";
    var STEPS = useK8s ? PROV_STEPS_K8S : PROV_STEPS;
    var STAGES = useK8s ? PROV_STAGES_K8S : PROV_STAGES;
    var card = $("#prov-card");
    if (card) {
      var cur = delivered ? STEPS.length
        : pendStage ? Math.max(STAGES.indexOf(pendStage), 0)
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
        STEPS.map(function (s, i) {
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
          ? "nocp 승인 게이트 — 1회 승인 = 1단계 전진 · P_Key " + (p.pkey_reserved || "—") +
            " · 접수 " + (p.requested_at || "—") +
            (delivered ? " · 전체 게이트 통과 (인도 완료)"
              : pendStage ? " · 잔여 게이트 " +
                (STEPS.length - Math.max(STAGES.indexOf(pendStage), 0)) + "단계" +
                (pendStage === "k8s_installing" ? " (다음: K8s 설치)" : "")
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

  /* ══ ⑧ 인시던트 — 라이브: nocp 장애 이벤트 리스트 · mock: INC-0412 ══ */
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
      if (f.su && String(h.tray_id || "").indexOf(f.su + "-rack") !== 0) return false;
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

  /* ── twin 랙 상태 병합 (obs /racks) — 전원 On/Off·cordon·health 배지 ──
     트레이 자산은 소속 랙(su-N-rack-MM) 상태를 상속 표기. twin 미연동 시 미표시. */
  var assetsTwinMap = null, assetsTwinTimer = null;
  var assetsOffTrays = null;                // partial 랙의 Off 트레이 집합 (dcgm state=off 유도)
  function assetsTrayRack(tid) { return String(tid || "").replace(/-tray-\d+$/, ""); }
  /* 트레이별 전원 판정 — [칩HTML, 상태키] · twin 미연동 시 null */
  function assetsPowerOf(h) {
    if (!assetsTwinMap) return null;
    var rk = assetsTwinMap[assetsTrayRack(h.tray_id)];
    if (!rk) return null;
    var ps = rk.power_state || "on";
    if (ps === "partial") {
      /* 부분 Off 랙 — 해당 트레이가 Off 집합에 있으면 트레이 Off, 아니면 partial 표기 */
      if (assetsOffTrays && assetsOffTrays[h.tray_id]) {
        return ['<span class="st gray" title="트레이 전원 Off (twin · Redfish) — in-band 텔레메트리 없음">전원 Off (트레이)</span>', "off"];
      }
      return ['<span class="st amber" title="랙 부분 Off (twin) — 트레이 ' +
        (rk.trays_off || 0) + "/" + (rk.trays_total || 18) + ' Off">partial (' +
        (rk.trays_off || 0) + "/" + (rk.trays_total || 18) + " Off)</span>", "partial"];
    }
    if (ps === "off") {
      return ['<span class="st gray" title="랙 전원 Off (twin) — 소속 랙 상태 상속">전원 Off</span>', "off"];
    }
    if (ps === "mixed") {
      return ['<span class="st amber" title="랙 전원 mixed (twin)">전원 mixed</span>', "partial"];
    }
    return ['<span class="st green" title="랙 전원 On (twin)">전원 On</span>', "on"];
  }
  function assetsPowerBadge(h) {
    var p = assetsPowerOf(h);
    if (!p) return "";
    var rk = assetsTwinMap[assetsTrayRack(h.tray_id)] || {};
    var extra = (rk.cordoned ? ' <span class="st amber">랙 cordon</span>' : "") +
      (rk.health === "critical" ? ' <span class="st red">랙 crit</span>'
        : rk.health === "warn" || rk.health === "warning"
          ? ' <span class="st amber">랙 warn</span>' : "");
    return '<div style="margin-top:3px">' + p[0] + extra + "</div>";
  }
  function assetsTwinPoll() {               // 화면 활성 시만 5s
    if (assetsTwinTimer) { clearInterval(assetsTwinTimer); assetsTwinTimer = null; }
    function once() {
      obsGet("/racks").then(function (d) {
        var had = !!assetsTwinMap;
        var hasPartial = false;
        if (Array.isArray(d) && d.length) {
          assetsTwinMap = {};
          d.forEach(function (rk) {
            if (rk.rack_id) assetsTwinMap[rk.rack_id] = rk;
            if (rk.power_state === "partial") hasPartial = true;
          });
        } else {
          assetsTwinMap = null;              // twin 미연동 — 기존 표시 유지 (회귀 없음)
        }
        /* partial 랙 존재 시 Off 트레이 집합 유도 (dcgm state=off) */
        var offP = hasPartial
          ? obsGet("/dcgm/gpus?state=off&limit=2000")
          : Promise.resolve(null);
        offP.then(function (og) {
          assetsOffTrays = null;
          if (og && og.gpus && og.gpus.length) {
            assetsOffTrays = {};
            og.gpus.forEach(function (g) {
              if (g.tray_id) assetsOffTrays[g.tray_id] = true;
            });
          }
          if ((had || assetsTwinMap) && currentRoute() === "assets") renderAssetsTable();
        });
      });
    }
    once();
    assetsTwinTimer = setInterval(function () {
      if (currentRoute() !== "assets") {
        clearInterval(assetsTwinTimer); assetsTwinTimer = null;
        return;
      }
      once();
    }, 5000);
  }

  function renderAssetsTable() {
    var body = $("#assets-body");
    if (!body || !assetsCache || !assetsCache.length) return;   // mock: 정적 표 유지
    var list = assetsFiltered();
    if (assetsFilter.offset >= list.length) assetsFilter.offset = 0;
    var a = assetsFilter.offset, b = Math.min(a + PAGE, list.length);
    var head = $("#assets-head");
    if (head) head.innerHTML =
      "<th>호스트</th><th>트레이 / SKU</th><th>사이트</th><th>상태" +
      (assetsTwinMap ? " · 전원 (twin)" : "") + "</th>" +
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
           (h.cordoned ? ' <span class="st red">cordon</span>' : "") +
           assetsPowerBadge(h)) +
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
    /* 카운트 — "N건 표시 / 전체 M" + 필터 결과 전원 배지 집계 (twin 있을 때) */
    var pwrTxt = "";
    if (assetsTwinMap) {
      var pOff = 0, pPart = 0;
      list.forEach(function (h) {
        var p = assetsPowerOf(h);
        if (p && p[1] === "off") pOff++;
        else if (p && p[1] === "partial") pPart++;
      });
      pwrTxt = " · 전원 Off " + fmt(pOff) + " · partial " + fmt(pPart);
    }
    setTxt("assets-count", fmt(list.length) + "건 표시 (" + (list.length ? a + 1 : 0) + "–" + b +
      ") / 전체 " + fmt(assetsCache.length) + "건" + pwrTxt + " · fake-nico 실데이터");
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
          '<div style="color:var(--muted);font-size:12px">하드웨어 정보 없음 — nocp 미기동(mock) 상태</div>');
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
          setTxt("pw-sites-c", "nocp 인벤토리 + EMU 실측 — 사이트 배분은 GPU 할당 비례 추정");
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
    setTxt("kpi-pam-s", act.length ? "녹화 중 · nocp 실세션" : "활성 없음 · PAM 실연동");
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
          setTxt("sec-audit-c", "nocp 감사 스트림 — 최근 " + audit.length + "건 (실데이터)");
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
              "실 Sanitize 리포트 — " + esc(rep.host_id || cand.host_id) + " (nocp)</div>" +
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
        " · breakfix " + (tot.breakfix_nodes != null ? tot.breakfix_nodes : "—") + " — nocp 실장비 상태");
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

  /* ══════════════════════════════════════════════════════════
     통합 Observability (obs-*) — NICo Emulator obs API 직접 폴링
     근거: 30MW Vera Rubin NVL72 통합 Observability 설계서.
     OBS_BASE(:9100 AI Infra)를 NC.api 우회 소형 fetch로 소비 (5s 캐시 ·
     실패/미구현 시 mock 폴백 — 화면 상단 출처 칩에 라벨 표기).
     폴링(5s)은 obs-* 화면 활성 시에만 동작한다.
     ══════════════════════════════════════════════════════════ */
  var OBS_BASE = "http://127.0.0.1:9100/emulator/v1/obs";  // AI Infra Emulator (물리 트윈)
  var OBS_ROOT = "http://127.0.0.1:9100";   // AI Infra — UFM(/ufm/v1)·NetQ(/netq/v1)·VAST(/vast/v1)·Converged
  var obsCacheMap = {};            // path → {t, v} (5s 캐시)
  var OBS_PAGE = 100;
  var obsPwrHist = { ga: [], an: [], tot: [] };   // 사이트별 전력 추이 (5s 폴링 누적)
  var obsGpuFilter = { site: "", su: "", state: "", offset: 0 };
  var obsGpuTotal = 0;
  var obsRackSel = null;           // 히트맵 선택 랙
  var obsAlertFilter = { domain: "", sev: "" };
  var obsThrHist = [];             // 냉각발 스로틀 GPU 누적 (패브릭 상관)
  var obsCduCur = null;            // 열린 CDU 모달 id
  var obsTimer = null;

  /* 소형 fetch — 3s 타임아웃 (twin 재기동 중 hang 시에도 mock 폴백 보장) */
  function obsFetch(path, opts, emptyOk) {
    try {
      var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var tid = ctrl ? setTimeout(function () { ctrl.abort(); }, 3000) : null;
      if (ctrl) (opts = opts || {}).signal = ctrl.signal;
      var base = (path.indexOf("/ufm/") === 0 || path.indexOf("/netq/") === 0 ||
        path.indexOf("/emulator/") === 0) ? OBS_ROOT : OBS_BASE;
      return fetch(base + path, opts || {}).then(function (r) {
        if (tid) clearTimeout(tid);
        if (!r.ok) return null;
        return r.json().catch(function () { return emptyOk ? {} : null; });
      }).catch(function () {
        if (tid) clearTimeout(tid);
        return null;
      });
    } catch (e) { return Promise.resolve(null); }
  }
  function obsGet(path) {
    var c = obsCacheMap[path];
    if (c && Date.now() - c.t < 5000) return Promise.resolve(c.v);
    return obsFetch(path, { cache: "no-store" }).then(function (v) {
      if (v != null) obsCacheMap[path] = { t: Date.now(), v: v };
      return v;
    });
  }
  function obsPost(path, body) {
    return obsFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    }, true);
  }
  /* 캐시 무효화 — prefix 일치 경로 전부 제거 (장애 주입 후 즉시 재조회용) */
  function obsClearCache(prefix) {
    Object.keys(obsCacheMap).forEach(function (k) {
      if (k.indexOf(prefix) === 0) delete obsCacheMap[k];
    });
  }

  /* 표기 헬퍼 — null 가드 */
  function obsNum(v) { return v == null ? "—" : fmt(v); }
  function obsN1(v) { return v == null || isNaN(+v) ? "—" : (+v).toFixed(1); }
  function obsLast(a) { return a && a.length ? a[a.length - 1] : null; }
  function obsSrc(screen, live, lbl) {
    var el = document.getElementById("obs-src-" + screen);
    if (!el) return;
    el.className = "obs-src " + (live ? "live" : "mock");
    el.textContent = lbl || (live ? "● AI Infra Twin 라이브 (:9100)" : "◌ twin 미연동 — mock");
  }
  function obsHealthSt(h) {
    return h === "critical" ? '<span class="st red">critical</span>'
      : h === "warn" || h === "warning" ? '<span class="st amber">warn</span>'
      : h === "unknown" ? '<span class="st gray" title="전원 Off — OOB 텔레메트리만 수집">unknown</span>'
      : '<span class="st green">' + esc(h || "ok") + "</span>";
  }
  function obsSevSt(s) {
    return s === "critical" ? '<span class="st red">CRITICAL</span>'
      : s === "major" ? '<span class="st red">MAJOR</span>'
      : s === "warning" ? '<span class="st amber">WARNING</span>'
      : '<span class="st blue">' + esc(String(s || "info").toUpperCase()) + "</span>";
  }
  function obsAt(v) {
    return '<span class="id" style="color:var(--muted2);font-size:10px">' +
      esc(String(v || "—").replace("T", " ").slice(5, 16)) + "</span>";
  }

  /* ── mock 폴백 데이터 — 설계서 규모(140랙 · 10,080 GPU) 대표 표본 ── */
  function obsRnd(n) { var x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }
  function obsPad2(n) { return (n < 10 ? "0" : "") + n; }
  var OBS_SUS = [
    ["가산", "su-1", 12, "acme-ai"],
    ["가산", "su-2", 12, "beta-ai"],   // 부분 점유 (앞 4랙)
    ["가산", "su-3", 12, null],
    ["안산", "su-4", 13, null],
    ["안산", "su-5", 13, "fin-corp"],
    ["안산", "su-6", 13, "fin-corp"],
    ["안산", "su-7", 13, null],
    ["안산", "su-8", 13, null],
    ["안산", "su-9", 13, null],
    ["안산", "su-10", 13, null],
    ["안산", "su-11", 13, null],
  ];
  var obsMockRacksC = null, obsMockGpusC = null, obsMockCdusC = null;

  function obsMockRacks() {
    if (obsMockRacksC) return obsMockRacksC;
    var out = [];
    OBS_SUS.forEach(function (su, si) {
      for (var i = 0; i < su[2]; i++) {
        var rid = su[1] + "-rack-" + obsPad2(i);
        var alloc = !!su[3] && (su[1] !== "su-2" || i < 4);
        var r1 = obsRnd(si * 100 + i), r2 = obsRnd(si * 100 + i + 40);
        var thr = rid === "su-5-rack-03" ? 6 : rid === "su-6-rack-07" ? 2 : 0;
        var it = alloc ? Math.round(118 + r1 * 28) : Math.round(12 + r1 * 9);
        var inlet = +(24 + r2 * 1.6).toFixed(1);
        out.push({
          rack_id: rid, su_id: su[1], site: su[0],
          it_power_kw: it, gpu_power_kw: Math.round(it * 0.87),
          inlet_c: inlet,
          outlet_c: +(inlet + (alloc ? 14.5 + r1 * 3 : 1.2 + r2)).toFixed(1),
          cdu_id: "cdu-" + su[1],
          cooling_headroom_kw: Math.max(4, Math.round(154 - it * 0.96)),
          throttled_gpus: thr,
          tenant_id: alloc ? su[3] : null,
          health: rid === "su-5-rack-03" ? "critical" : thr ? "warn" : "ok",
          /* 랙 제어 계약 필드 (GET /racks 확장 계약 미러) */
          power_state: "on", power_cap_kw: null,
          workload_profile: alloc ? "train" : "idle", cordoned: false,
        });
      }
    });
    obsMockRacksC = out;
    return out;
  }

  function obsMockGpus() {
    if (obsMockGpusC) return obsMockGpusC;
    var out = [];
    obsMockRacks().forEach(function (rk, ri) {
      var alloc = !!rk.tenant_id;
      var n = alloc ? 6 : 1;
      for (var i = 0; i < n; i++) {
        var tray = 2 + i * 3;
        var tid = rk.rack_id + "-tray-" + obsPad2(tray);
        var uuid = "GPU-" + rk.su_id.replace("-", "") + "-r" + rk.rack_id.slice(-2) +
          "-t" + obsPad2(tray) + "-g" + (i % 4);
        var r = obsRnd(ri * 17 + i * 3.7);
        var st = alloc ? "active" : "idle";
        if (rk.rack_id === "su-5-rack-03") st = i === 0 ? "faulted" : "throttled";
        if (rk.rack_id === "su-6-rack-07" && i < 2) st = "throttled";
        var util = st === "idle" || st === "faulted" ? 0
          : st === "throttled" ? Math.round(38 + r * 20) : Math.round(86 + r * 13);
        var temp = st === "idle" ? Math.round(31 + r * 6)
          : st === "throttled" ? Math.round(86 + r * 5)
          : st === "faulted" ? 0 : Math.round(61 + r * 13);
        out.push({
          gpu_uuid: uuid, idx: i % 4, tray_id: tid, rack_id: rk.rack_id,
          su_id: rk.su_id, site: rk.site, tenant_id: rk.tenant_id,
          util_pct: util, sm_util_pct: Math.max(0, util - Math.round(r * 6)),
          mem_used_gb: st === "active" ? Math.round(190 + r * 80)
            : st === "idle" ? 2 : Math.round(150 + r * 60),
          mem_total_gb: 288,
          temp_c: temp, mem_temp_c: temp ? temp + 7 : 0,
          power_w: st === "idle" ? Math.round(120 + r * 60)
            : st === "faulted" ? 0
            : st === "throttled" ? Math.round(1450 + r * 200) : Math.round(1900 + r * 350),
          power_limit_w: 2300,
          sm_clock_mhz: st === "idle" ? 345 : st === "faulted" ? 0
            : st === "throttled" ? Math.round(1420 + r * 120) : Math.round(2010 + r * 120),
          throttle_reasons: st === "throttled"
            ? (rk.rack_id === "su-5-rack-03" ? ["SW_THERMAL"] : ["HW_SLOWDOWN"]) : [],
          ecc_corr: Math.round(r * 40), ecc_uncorr: st === "faulted" ? 2 : 0,
          xid_recent: st === "faulted" ? [63, 63, 48] : [],
          nvlink_tx_gbps: st === "active" ? Math.round(700 + r * 160)
            : st === "idle" ? 0 : Math.round(300 + r * 150),
          nvlink_rx_gbps: st === "active" ? Math.round(690 + r * 160)
            : st === "idle" ? 0 : Math.round(290 + r * 150),
          pcie_replay: Math.round(r * 3),
          health: st === "faulted" ? "critical" : st === "throttled" ? "warn" : "ok",
          state: st,
        });
      }
    });
    obsMockGpusC = out;
    return out;
  }

  function obsMockGpuDetail(uuid) {
    var g = obsMockGpus().filter(function (x) { return x.gpu_uuid === uuid; })[0];
    if (!g) return null;
    var util = [], temp = [], power = [], ts = [];
    for (var i = 0; i < 60; i++) {
      var r = obsRnd(i * 3.1 + String(uuid).length * 7);
      util.push(Math.max(0, Math.min(100, (g.util_pct || 0) + (r - 0.5) * 14)));
      temp.push(Math.max(0, (g.temp_c || 0) + (r - 0.5) * 6));
      power.push(Math.max(0, (g.power_w || 0) + (r - 0.5) * 160));
      ts.push(i);
    }
    var d = {};
    Object.keys(g).forEach(function (k) { d[k] = g[k]; });
    d.history = { ts: ts, util: util, temp: temp, power: power };
    return d;
  }

  function obsMockCdus() {
    if (obsMockCdusC) return obsMockCdusC;
    var bySu = {};
    obsMockRacks().forEach(function (rk) {
      (bySu[rk.su_id] = bySu[rk.su_id] || []).push(rk);
    });
    obsMockCdusC = OBS_SUS.map(function (su, si) {
      var racks = bySu[su[1]] || [];
      var heat = Math.round(racks.reduce(function (a, r) { return a + (r.it_power_kw || 0); }, 0) * 0.96);
      var rated = 2000;
      var r = obsRnd(si * 7.3 + 2);
      var isBad = su[1] === "su-5";
      var dT = heat > 400 ? +(15.5 + r * 1.5).toFixed(1) : 1.5;
      return {
        cdu_id: "cdu-" + su[1], model: "SMCI LDC-2000", oem: "Supermicro",
        type: "liquid-to-liquid (in-row)",
        site: su[0], su_id: su[1],
        rack_ids: racks.map(function (x) { return x.rack_id; }),
        rated_capacity_kw: rated, measured_heat_kw: heat,
        utilization_pct: +(heat / rated * 100).toFixed(1),
        headroom_kw: rated - heat,
        primary: { supply_c: 18.0, return_c: +(18 + heat / 220).toFixed(1),
          flow_lpm: Math.round(600 + heat * 0.3), pressure_kpa: 310 },
        secondary: { supply_c: 25.0, return_c: +(25 + dT).toFixed(1), delta_t: dT,
          flow_lpm: Math.round(500 + heat * 0.35), pressure_kpa: 260 },
        pumps: [
          { pump_id: "p1", state: "running", rpm: Math.round(2800 + r * 300), power_w: Math.round(3200 + r * 400) },
          { pump_id: "p2", state: isBad ? "degraded" : "standby",
            rpm: isBad ? 1400 : 0, power_w: isBad ? 1900 : 0 },
        ],
        hx_efficiency_pct: +(91 + r * 4).toFixed(1),
        filter_dp_kpa: isBad ? 41 : Math.round(16 + r * 9),
        coolant: { level_pct: Math.round(92 + r * 6),
          conductivity_us_cm: +(8 + r * 4).toFixed(1),
          ph: +(8.2 + r).toFixed(1), concentration_pct: 25 },
        dew_point_margin_c: +(8 + r * 4).toFixed(1),
        leak: { detected: false, location: null },
        alarms: isBad ? ["FILTER_DP_HIGH", "PUMP2_DEGRADED"] : [],
        health: isBad ? "warn" : "ok",
      };
    });
    return obsMockCdusC;
  }

  function obsMockCduDetail(id) {
    var c = obsMockCdus().filter(function (x) { return x.cdu_id === id; })[0];
    if (!c) return null;
    var d = {};
    Object.keys(c).forEach(function (k) { d[k] = c[k]; });
    var flowLoss = c.secondary && (c.secondary.flow_lpm || 0) < 400;
    d.branches = (c.rack_ids || []).map(function (rid, i) {
      var r = obsRnd(i * 5.7 + String(id).length);
      var bad = rid === "su-5-rack-03";
      var sup = +(25 + r * 0.6).toFixed(1);
      return {
        branch_id: "br-" + obsPad2(i), rack_id: rid,
        flow_lpm: bad ? 64 : Math.round((flowLoss ? 38 : 96) + r * 14),
        supply_c: sup,
        return_c: +(sup + (bad ? 19.5 : 15.2 + r * 2)).toFixed(1),
        valve: bad ? 100 : Math.round(62 + r * 25),
        server_loops: 18,
        imbalance_pct: bad ? 18.2 : +(r * 4.5).toFixed(1),
      };
    });
    d.leak_sensors = [
      { sensor_id: "ls-1", location: "CDU 하부 팬", state: d.leak && d.leak.detected ? "wet" : "dry" },
      { sensor_id: "ls-2", location: "1차측 매니폴드", state: "dry" },
      { sensor_id: "ls-3", location: "2차측 공급 매니폴드", state: "dry" },
      { sensor_id: "ls-4", location: "랙 branch 리턴", state: "dry" },
    ];
    return d;
  }

  function obsMockSummary() {
    return {
      gpus: { total: 10080, active: 2946, idle: 7125, throttled: 8, faulted: 1 },
      avg_util_pct: 61.4, it_power_mw: 5.87,
      cooling: { cdus: 11, alarms_open: 2, avg_utilization_pct: 33.8, headroom_kw: 14620 },
      racks: 140, tenants: 4, alerts_open: 5,
      slo: { gpu_availability_pct: 99.96 },
    };
  }

  function obsMockAlerts() {
    return [
      { alert_id: "AL-0412", domain: "gpu", severity: "critical", resource: "su-5-rack-03-tray-11",
        summary: "XID 63 — GPU faulted · row-remap pending (INC-0412 연계)", at: "2026-07-13T06:19:42", state: "firing" },
      { alert_id: "AL-0418", domain: "cooling", severity: "warning", resource: "cdu-su-5",
        summary: "FILTER_DP_HIGH — 2차측 필터 차압 41kPa (임계 35)", at: "2026-07-13T08:02:11", state: "firing" },
      { alert_id: "AL-0419", domain: "gpu", severity: "warning", resource: "su-5-rack-03",
        summary: "thermal throttle 6 GPU — HBM 온도 상승 (냉각 상관 의심)", at: "2026-07-13T08:05:37", state: "firing" },
      { alert_id: "AL-0421", domain: "fabric", severity: "warning", resource: "an-leafA-su6-03:p14",
        summary: "IB 링크 flap ×2 — 케이블 점검 제안", at: "2026-07-13T09:42:05", state: "firing" },
      { alert_id: "AL-0422", domain: "provisioning", severity: "info", resource: "ord-9",
        summary: "gamma-labs 8랙 — 승인 게이트 대기", at: "2026-07-13T09:55:00", state: "firing" },
      { alert_id: "AL-0417", domain: "cooling", severity: "info", resource: "cdu-su-6",
        summary: "2차측 ΔT +0.8°C 상승 — 관찰", at: "2026-07-13T07:41:20", state: "resolved" },
      { alert_id: "AL-0415", domain: "gpu", severity: "warning", resource: "su-6-rack-07",
        summary: "SM clock 저하 2 GPU — HW_SLOWDOWN", at: "2026-07-13T05:12:44", state: "resolved" },
      { alert_id: "AL-0409", domain: "cooling", severity: "info", resource: "cdu-su-2",
        summary: "펌프 절체 시험 완료 — 정상", at: "2026-07-12T22:10:00", state: "resolved" },
    ];
  }

  function obsMockCorrelate() {
    return [
      { cdu_id: "cdu-su-5",
        finding: "2차측 branch su-5-rack-03 유량 -34% → 랙 inlet +2.8°C → HBM 온도 상승 → SW_THERMAL throttle",
        confidence: 0.87, affected_racks: ["su-5-rack-03"], affected_gpus: 6,
        tenant_impact: "fin-corp — MFU -1.2pp (스로틀 38분)",
        recommended_action: "branch 밸브 개도 재조정 · 필터 ΔP 점검 (FILTER_DP_HIGH 상관)" },
      { cdu_id: "cdu-su-6",
        finding: "pump p2 진동 상승 추세 — 3주 내 성능 저하 예측 (예방 정비 권고)",
        confidence: 0.62, affected_racks: ["su-6-rack-00", "su-6-rack-07"], affected_gpus: 0,
        tenant_impact: "현재 없음 — 예측성 finding",
        recommended_action: "07-28 CDU 정기 점검 창에 p2 베어링 점검 포함" },
    ];
  }

  function obsMockSlo() {
    return { tenants: [
      { tenant_id: "fin-corp", contracted_gpus: 2304, available_gpus: 2297,
        gpu_availability_pct: 99.87, slo_target_pct: 99.5,
        error_budget_remaining_pct: 52, burn_rate: 1.4,
        cooling_caused_unavail_min: 12, throttling_min: 38 },
      { tenant_id: "acme-ai", contracted_gpus: 1152, available_gpus: 1152,
        gpu_availability_pct: 99.99, slo_target_pct: 99.5,
        error_budget_remaining_pct: 97, burn_rate: 0.1,
        cooling_caused_unavail_min: 0, throttling_min: 0 },
      { tenant_id: "beta-ai", contracted_gpus: 288, available_gpus: 288,
        gpu_availability_pct: 99.97, slo_target_pct: 99.0,
        error_budget_remaining_pct: 91, burn_rate: 0.2,
        cooling_caused_unavail_min: 0, throttling_min: 4 },
    ] };
  }

  /* ── ⑬ 종합 상황판 ─────────────────────────────────────── */
  function obsAlertRow(a) {
    var firing = a.state === "firing";
    return "<tr>" +
      td(firing ? '<span class="st red">● firing</span>' : '<span class="st gray">resolved</span>') +
      td(obsSevSt(a.severity)) +
      td('<span class="id" style="color:var(--muted)">' + esc(a.domain || "—") + "</span>") +
      td('<span class="id">' + esc(a.resource || "—") + "</span>") +
      td(esc(a.summary || "—")) +
      td(obsAt(a.at), "num") + "</tr>";
  }
  function obsUpdateAlertBadge(list) {
    var n = (list || []).filter(function (a) {
      return a.state === "firing" && a.severity !== "info";
    }).length;
    var b = document.getElementById("bd-obs-alerts");
    if (b) { b.textContent = String(n); b.style.display = n ? "" : "none"; }
  }

  function renderObsOverview() {
    Promise.all([obsGet("/summary"), obsGet("/alerts?limit=40")]).then(function (r) {
      var live = r[0] != null;
      var s = r[0] || obsMockSummary();
      var alerts = Array.isArray(r[1]) ? r[1] : obsMockAlerts();
      obsSrc("obs-overview", live);
      var g = s.gpus || {}, cool = s.cooling || {}, slo = s.slo || {};
      setHtml("obs-ov-kpi",
        kpiCell("전체 GPU", obsNum(g.total), "",
          kpiSub("활성 " + obsNum(g.active) + " · 유휴 " + obsNum(g.idle))) +
        kpiCell("스로틀 GPU", obsNum(g.throttled), g.throttled ? "amber" : "green",
          kpiSub("냉각·전력 기인 포함")) +
        kpiCell("장애 GPU", obsNum(g.faulted), g.faulted ? "red" : "green",
          kpiSub("XID 중대 · cordon")) +
        kpiCell("평균 사용률", obsN1(s.avg_util_pct) + "<small>%</small>", "",
          kpiSub("할당 GPU 기준")) +
        kpiCell("IT 전력", obsN1(s.it_power_mw) + "<small> MW</small>", "",
          kpiSub(obsNum(s.racks) + "랙 · 30MW 캠퍼스")) +
        kpiCell("냉각 사용률", obsN1(cool.avg_utilization_pct) + "<small>%</small>", "",
          kpiSub("CDU " + obsNum(cool.cdus) + " · 헤드룸 " + obsNum(cool.headroom_kw) + "kW")) +
        kpiCell("열린 알림", obsNum(s.alerts_open), s.alerts_open ? "amber" : "green",
          kpiSub("냉각 알람 " + obsNum(cool.alarms_open))) +
        kpiCell("GPU 가용성 SLO", obsN1(slo.gpu_availability_pct) + "<small>%</small>", "green",
          kpiSub("테넌트 " + obsNum(s.tenants) + " · 30d")));
      var doms = [["gpu", "GPU · 컴퓨트", "obs-gpu"], ["cooling", "냉각 · DLC", "obs-dlc"],
        ["fabric", "패브릭", "obs-fabric"], ["provisioning", "프로비저닝", "obs-alerts"]];
      setHtml("obs-ov-domains", doms.map(function (d) {
        var fir = alerts.filter(function (a) { return a.domain === d[0] && a.state === "firing"; });
        var crit = fir.filter(function (a) {
          return a.severity === "critical" || a.severity === "major";
        }).length;
        var warn = fir.filter(function (a) { return a.severity === "warning"; }).length;
        var dot = crit ? "red" : warn ? "amber" : "green";
        var st = crit ? '<span class="st red">CRITICAL ' + crit + "</span>"
          : warn ? '<span class="st amber">WARNING ' + warn + "</span>"
          : '<span class="st green">정상</span>';
        return '<div class="obs-dcard" data-nav="' + d[2] + '">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">' +
          '<span class="dot ' + dot + '"></span>' +
          '<b style="font-size:13px;color:#fff">' + d[1] + "</b>" +
          '<span style="margin-left:auto">' + st + "</span></div>" +
          '<div style="color:var(--muted);font-size:11.5px">firing ' + fir.length + "건" +
          (fir[0] ? " — " + esc(fir[0].summary || "") : " — 열린 알림 없음") + "</div></div>";
      }).join(""));
      setHtml("obs-ov-alerts", alerts.slice(0, 8).map(obsAlertRow).join("") ||
        '<tr><td colspan="6" style="color:var(--muted)">알림 없음</td></tr>');
      setTxt("obs-ov-alerts-c", "최근 " + Math.min(alerts.length, 8) + "건 표시 · 전체 " +
        alerts.length + "건" + (live ? "" : " (mock)"));
      obsUpdateAlertBadge(alerts);
    });
  }

  /* ── ⑭ GPU · 컴퓨트 (DCGM) ─────────────────────────────── */
  function obsGpuQuery() {
    var f = obsGpuFilter;
    var q = "?limit=" + OBS_PAGE + "&offset=" + f.offset;
    if (f.site) q += "&site=" + encodeURIComponent(f.site);
    if (f.su) q += "&su=" + encodeURIComponent(f.su);
    if (f.state) q += "&state=" + encodeURIComponent(f.state);
    /* 서버 푸시다운 — 정렬·예외 필터는 전 플릿 기준으로 서버가 수행 (total 반영) */
    if (f.sort) q += "&sort=" + encodeURIComponent(f.sort);
    if (f.attn) q += "&attn=1";
    return q;
  }

  /* 집계 패널용 라이브 쿼리 — 사이트/SU 필터만 적용 (상태 필터와 무관) */
  function obsGpuAggQuery() {
    var f = obsGpuFilter;
    return f.site ? "?site=" + encodeURIComponent(f.site) : "?site=";
  }
  function obsGpuAttnQuery() {
    var f = obsGpuFilter;
    var q = "?attn=1&sort=temp&limit=12";
    if (f.site) q += "&site=" + encodeURIComponent(f.site);
    if (f.su) q += "&su=" + encodeURIComponent(f.su);
    return q;
  }

  function renderObsGpu() {
    Promise.all([
      obsGet("/dcgm/gpus" + obsGpuQuery()),
      obsGet("/summary"),
      obsGet("/dcgm/su-summary" + obsGpuAggQuery()),
      obsGet("/dcgm/gpus" + obsGpuAttnQuery()),
    ]).then(function (r) {
      var live = !!(r[0] && r[0].gpus);
      var f = obsGpuFilter, list, total;
      var siteKo = { gasan: "가산", ansan: "안산" };
      /* 집계용 mock 표본 — 사이트/SU 필터만 적용 (라이브 시 su-summary/attn 리스트로 대체) */
      var sample = obsMockGpus().filter(function (g) {
        if (f.site && g.site !== f.site && g.site !== siteKo[f.site]) return false;
        if (f.su && g.su_id !== f.su) return false;
        return true;
      });
      if (live) {
        /* 라이브 — 정렬·attn은 서버 푸시다운 완료 상태. 클라이언트 재필터/재정렬 없음 */
        list = r[0].gpus || [];
        total = r[0].total != null ? r[0].total : list.length;
      } else {
        var all = sample.filter(function (g) {
          if (f.state && g.state !== f.state) return false;
          return true;
        });
        if (f.attn) all = all.filter(obsGpuIsAttn);
        obsGpuSort(all, f.sort);
        total = all.length;
        if (f.offset >= total) f.offset = 0;
        list = all.slice(f.offset, f.offset + OBS_PAGE);
      }
      obsGpuTotal = total;
      obsSrc("obs-gpu", live);
      var s = r[1] || obsMockSummary();
      var g = s.gpus || {};
      setHtml("obs-gpu-kpi",
        kpiCell("전체 GPU", obsNum(g.total), "", kpiSub("DCGM 수집")) +
        kpiCell("active", obsNum(g.active), "green", kpiSub("워크로드 실행")) +
        kpiCell("idle", obsNum(g.idle), "", kpiSub("풀 · 유휴")) +
        kpiCell("throttled", obsNum(g.throttled), g.throttled ? "amber" : "green",
          kpiSub("클록 제한 중")) +
        kpiCell("faulted", obsNum(g.faulted), g.faulted ? "red" : "green",
          kpiSub("XID · cordon")) +
        (g.off != null && g.off > 0
          ? kpiCell("off (전원)", obsNum(g.off), "", kpiSub("랙 Off — OOB 텔레메트리만"))
          : "") +
        kpiCell("평균 util", obsN1(s.avg_util_pct) + "<small>%</small>", "",
          kpiSub("할당 GPU 기준")));
      var suSum = live && r[2] && r[2].sus && r[2].sus.length ? r[2] : null;
      var attnRes = live && r[3] && r[3].gpus ? r[3] : null;
      obsGpuHeatmap(sample, suSum);
      obsGpuDist(sample, g, suSum && suSum.hist);
      obsGpuAttention(sample, attnRes);
      setHtml("obs-gpu-body", list.map(obsGpuRow).join("") ||
        '<tr><td colspan="9" style="color:var(--muted)">조건에 맞는 GPU 없음</td></tr>');
      var a = f.offset, b = Math.min(a + OBS_PAGE, total);
      setTxt("obs-gpu-count", fmt(total) + "기 중 " + (total ? a + 1 : 0) + "–" + b +
        " 표시 · 100/페이지" + (live ? "" : " (mock 표본)"));
    });
  }

  /* ─ obs-gpu 가독성 헬퍼 — util 바 · 온도 색 단계 · 상태 칩 ─ */
  function obsUtilCell(p) {
    if (p == null) return muted("—");
    var col = p >= 80 ? "var(--green)" : p >= 40 ? "#5a8f0e" : p > 0 ? "var(--amber-dim)" : "var(--track)";
    return '<span class="ubar"><i><b style="width:' + Math.max(2, Math.min(100, p)) +
      '%;background:' + col + '"></b></i><em>' + p + "%</em></span>";
  }
  function obsTempCell(t) {
    if (t == null || !t) return muted("—");
    var col = t >= 85 ? "var(--red)" : t >= 78 ? "var(--amber)" : "var(--soft)";
    return '<span class="tchip" style="color:' + col + '">' + t + "°C</span>";
  }
  function obsStateChip(st) {
    return st === "faulted" ? '<span class="st red">faulted</span>'
      : st === "throttled" ? '<span class="st amber">throttled</span>'
      : st === "active" ? '<span class="st green">active</span>'
      : st === "off" ? '<span class="st gray" title="랙 전원 Off — in-band 텔레메트리 없음 (OOB만)">OFF</span>'
      : muted("idle");
  }
  function obsGpuLoc(x) {
    return '<span class="id" style="color:#fff">' + esc(x.tray_id || (x.rack_id || "—")) +
      " · g" + (x.idx != null ? x.idx : "?") + "</span>" +
      '<div style="color:var(--muted2);font-size:9.5px">' + esc(x.gpu_uuid) + " · " +
      esc(x.site || "—") + " " + esc(x.su_id || "") + "</div>";
  }
  function obsGpuRow(x) {
    return '<tr data-obs-gpu="' + esc(x.gpu_uuid) + '" style="cursor:pointer' +
      (x.state === "off" ? ";opacity:.62" : "") + '" title="' +
      (x.state === "off" ? "랙 전원 Off — in-band 텔레메트리 없음 (OOB만) · 클릭 시 GPU 상세"
        : "클릭 시 GPU 상세") + '">' +
      td(obsGpuLoc(x)) +
      td('<span class="id" style="color:var(--muted)">' + esc(x.tenant_id || "—") + "</span>") +
      td(obsStateChip(x.state)) +
      td(obsUtilCell(x.util_pct)) +
      td(obsTempCell(x.temp_c), "num") +
      td(x.power_w != null ? fmt(x.power_w) + "W" : "—", "num") +
      td(x.sm_clock_mhz != null ? fmt(x.sm_clock_mhz) : "—", "num") +
      td((x.ecc_uncorr || 0) + " / " + (x.ecc_corr || 0), "num") +
      td(obsHealthSt(x.health)) + "</tr>";
  }

  /* SU × 랙 히트맵 — mock: 셀 = 랙 (표본) · 라이브: 셀 = SU (su-summary 실집계) */
  function obsGpuHeatmap(sample, ss) {
    var hmT = document.getElementById("obs-gpu-hm-t"), hmC = document.getElementById("obs-gpu-hm-c");
    if (ss) {
      if (hmT) hmT.textContent = "플릿 히트맵 — SU";
      if (hmC) hmC.textContent = "셀 = SU · 색 = 평균 util · 테두리 = 예외 (su-summary 실집계)";
      var siteKo2 = { gasan: "가산", ansan: "안산" };
      var bySite = {}, so = [];
      ss.sus.forEach(function (su) {
        if (obsGpuFilter.su && su.su_id !== obsGpuFilter.su) return;
        var k = siteKo2[su.site] || su.site || "—";
        if (!bySite[k]) { bySite[k] = []; so.push(k); }
        bySite[k].push(su);
      });
      setHtml("obs-gpu-hm", so.map(function (siteNm) {
        return '<div class="obs-hmrow"><span class="lb">' + esc(siteNm) +
          '</span><span class="obs-hm">' + bySite[siteNm].map(function (su) {
            var avg = Math.round(su.avg_util_pct || 0);
            var alloc = (su.active || 0) > 0;
            /* 전원 Off 비중이 높은 SU — 회색 (in-band 텔레메트리 없음) */
            var offN = su.off || 0;
            var offMost = (su.gpus || 0) > 0 && offN / su.gpus >= 0.5;
            var bg = offMost ? "#1a212b"
              : !alloc ? "var(--ready)"
              : avg >= 80 ? "var(--green)" : avg >= 40 ? "#5a8f0e" : avg > 0 ? "#3f6a1a" : "var(--amber-dim)";
            var worst = (su.faulted || 0) > 0 ? " crit" : (su.throttled || 0) > 0 ? " th" : "";
            var cls = "hc" + worst + (obsGpuFilter.su === su.su_id ? " sel" : "");
            return '<span class="' + cls + '" data-obs-gpusu="' + esc(su.su_id) + '" style="background:' + bg +
              (offMost ? ";outline:1px solid #2a3644;color:#5f6f82" : "") +
              '" title="' + esc(su.su_id + " — " + fmt(su.gpus || 0) + "GPU · active " + fmt(su.active || 0) +
                " · 평균 util " + avg + "% · 최고 " + obsN1(su.max_temp_c) + "°C" +
                (offN ? " · off " + fmt(offN) + " (OOB만)" : "") +
                ((su.faulted || 0) ? " · faulted " + su.faulted : "") +
                ((su.throttled || 0) ? " · throttled " + su.throttled : "") +
                ((su.ecc_uncorr || 0) ? " · ECC uncorr " + su.ecc_uncorr : "")) +
              '">' + esc(String(su.su_id).replace("su-", "")) + "</span>";
          }).join("") + "</span></div>";
      }).join("") || '<div style="color:var(--muted);font-size:12px">SU 집계 없음</div>');
      return;
    }
    if (hmT) hmT.textContent = "플릿 히트맵 — SU × 랙";
    if (hmC) hmC.textContent = "셀 = 랙 · 색 = 평균 util · 테두리 = 예외";
    var bySu = {}, order = [];
    sample.forEach(function (g) {
      if (!bySu[g.su_id]) { bySu[g.su_id] = { site: g.site, racks: {}, ro: [] }; order.push(g.su_id); }
      var su = bySu[g.su_id];
      if (!su.racks[g.rack_id]) { su.racks[g.rack_id] = { n: 0, u: 0, worst: "ok", alloc: false }; su.ro.push(g.rack_id); }
      var rk = su.racks[g.rack_id];
      rk.n++; rk.u += g.util_pct || 0;
      if (g.tenant_id) rk.alloc = true;
      if (g.state === "faulted") rk.worst = "crit";
      else if (g.state === "throttled" && rk.worst !== "crit") rk.worst = "warn";
    });
    setHtml("obs-gpu-hm", order.map(function (suId) {
      var su = bySu[suId];
      return '<div class="obs-hmrow"><span class="lb">' + esc((su.site || "") + " " + suId) +
        '</span><span class="obs-hm">' + su.ro.map(function (rid) {
          var rk = su.racks[rid];
          var avg = Math.round(rk.u / rk.n);
          var bg = !rk.alloc ? "var(--ready)"
            : avg >= 80 ? "var(--green)" : avg >= 40 ? "#5a8f0e" : avg > 0 ? "#3f6a1a" : "var(--amber-dim)";
          var cls = "hc" + (rk.worst === "crit" ? " crit" : rk.worst === "warn" ? " th" : "") +
            (obsGpuFilter.su === suId ? " sel" : "");
          return '<span class="' + cls + '" data-obs-gpusu="' + esc(suId) + '" style="background:' + bg +
            '" title="' + esc(rid + " — 표본 " + rk.n + "GPU · 평균 util " + avg + "%" +
            (rk.worst !== "ok" ? " · 예외 발생" : "")) + '"></span>';
        }).join("") + "</span></div>";
    }).join("") || '<div style="color:var(--muted);font-size:12px">표본 없음</div>');
  }

  /* 상태 분해 바 + util/temp 히스토그램 — 라이브 시 su-summary hist(10버킷) 사용 */
  function obsGpuDist(sample, g, hist) {
    var ub, tb, uLbl, tLbls;
    if (hist && (hist.util_buckets || []).length === 10 && (hist.temp_buckets || []).length === 10) {
      ub = hist.util_buckets; tb = hist.temp_buckets;
      var n = ub.reduce(function (a, b) { return a + (b || 0); }, 0);
      uLbl = "util 분포 (전 플릿 " + fmt(n) + "기 · su-summary)";
      /* temp_edges "20-100 step8" 형태 파싱 — 실패 시 mock 축 유지 */
      var m = /^(\d+)-(\d+)\s+step(\d+)$/.exec(String(hist.temp_edges || ""));
      tLbls = m ? [m[1] + "°C", Math.round((+m[1] + +m[2]) / 2) + "°C", "≥" + (+m[2] - +m[3]) + "°C"]
                : ["30°C", "65°C", "≥93°C"];
    } else {
      var act = sample.filter(function (x) { return x.state === "active" || x.state === "throttled"; });
      ub = [0,0,0,0,0,0,0,0,0,0]; tb = [0,0,0,0,0,0,0,0,0,0];
      act.forEach(function (x) {
        ub[Math.min(9, Math.floor((x.util_pct || 0) / 10))]++;
        tb[Math.max(0, Math.min(9, Math.floor(((x.temp_c || 30) - 30) / 7)))]++;
      });
      uLbl = "util 분포 (가동 표본 " + act.length + "기)";
      tLbls = ["30°C", "65°C", "≥93°C"];
    }
    var um = Math.max.apply(null, ub.concat([1])), tm = Math.max.apply(null, tb.concat([1]));
    var tot = (g.total || 0) || 1;
    function seg(n, color) {
      return '<i style="width:' + Math.max(0.4, (n || 0) / tot * 100) + '%;background:' + color + '"></i>';
    }
    setHtml("obs-gpu-dist",
      '<div style="color:var(--muted);font-size:10.5px;font-weight:700;letter-spacing:.04em">상태 분해 — 전체 ' + fmt(g.total || 0) + '기</div>' +
      '<div class="statebar">' + seg(g.active, "var(--green)") + seg(g.idle, "var(--ready)") +
        seg((g.throttled || 0) * 40, "var(--amber)") + seg((g.faulted || 0) * 40, "var(--red)") + "</div>" +
      '<div style="display:flex;gap:12px;flex-wrap:wrap;font-size:10px;color:var(--muted);margin-bottom:10px">' +
        '<span><span class="leg" style="background:var(--green)"></span> active ' + fmt(g.active || 0) + "</span>" +
        '<span><span class="leg" style="background:var(--ready)"></span> idle ' + fmt(g.idle || 0) + "</span>" +
        '<span><span class="leg" style="background:var(--amber)"></span> throttled ' + (g.throttled || 0) + " <em style=\"font-style:normal;color:var(--muted2)\">(확대 표시)</em></span>" +
        '<span><span class="leg" style="background:var(--red)"></span> faulted ' + (g.faulted || 0) + "</span></div>" +
      '<div style="color:var(--muted);font-size:10.5px;font-weight:700;letter-spacing:.04em">' + uLbl + '</div>' +
      '<div class="hist">' + ub.map(function (n) {
        return '<i style="height:' + Math.max(4, n / um * 100) + '%"></i>';
      }).join("") + "</div>" +
      '<div class="hist-x"><span>0%</span><span>50%</span><span>100%</span></div>' +
      '<div style="color:var(--muted);font-size:10.5px;font-weight:700;letter-spacing:.04em;margin-top:10px">온도 분포</div>' +
      '<div class="hist">' + tb.map(function (n, i) {
        return '<i class="' + (i >= 7 ? "hot" : "") + '" style="height:' + Math.max(4, n / tm * 100) + '%"></i>';
      }).join("") + "</div>" +
      '<div class="hist-x"><span>' + tLbls[0] + "</span><span>" + tLbls[1] +
      "</span><span>" + tLbls[2] + "</span></div>");
  }

  /* 예외 우선 리스트 — faulted → throttled → 고온 → ECC → PCIe
     라이브 시 서버 attn=1&sort=temp 결과(attnRes)로 바인딩 · mock은 표본 판정 */
  function obsGpuAttention(sample, attnRes) {
    var srcList = attnRes ? attnRes.gpus || [] : sample;
    var rows = [];
    srcList.forEach(function (x) {
      var sev = null, reason = "";
      if (x.state === "faulted") {
        sev = 0; reason = "XID " + ((x.xid_recent || []).join("·") || "—") + " · ECC uncorr " + (x.ecc_uncorr || 0);
      } else if (x.state === "throttled") {
        sev = 1; reason = ((x.throttle_reasons || []).join(",") || "clock 제한") + " · " + (x.temp_c || "—") + "°C";
      } else if ((x.temp_c || 0) >= 85) {
        sev = 2; reason = "고온 " + x.temp_c + "°C — 냉각 상관 확인 (R13)";
      } else if ((x.ecc_uncorr || 0) > 0) {
        sev = 2; reason = "ECC uncorr " + x.ecc_uncorr + " — row-remap 추이 감시";
      } else if ((x.pcie_replay || 0) >= 3) {
        sev = 3; reason = "PCIe replay " + x.pcie_replay;
      } else if (attnRes && (x.temp_c || 0) >= 78) {
        /* 서버 attn 기준(temp≥78) — 클라이언트 임계(85) 미만 구간 보완 */
        sev = 2; reason = "고온 " + x.temp_c + "°C — 임계(78°C) 초과 접근";
      }
      if (sev == null) return;
      rows.push([sev, x, reason]);
    });
    rows.sort(function (a, b) { return a[0] - b[0] || (b[1].temp_c || 0) - (a[1].temp_c || 0); });
    var top = rows.slice(0, attnRes ? 12 : 8);
    var totalAttn = attnRes && attnRes.total != null ? attnRes.total : rows.length;
    setTxt("obs-gpu-attn-count", totalAttn
      ? fmt(totalAttn) + "기 " + (attnRes ? "(서버 attn 집계)" : "(표본)") +
        " — 상위 " + top.length + " 표시"
      : "예외 없음");
    setHtml("obs-gpu-attn", top.map(function (rw) {
      var sev = rw[0], x = rw[1], reason = rw[2];
      var tag = sev === 0 ? '<span class="sevtag" style="color:var(--red)">CRITICAL</span>'
        : sev === 1 ? '<span class="sevtag" style="color:var(--amber)">THROTTLE</span>'
        : '<span class="sevtag" style="color:var(--blue-text,#9fd0ff)">WATCH</span>';
      var advice = sev === 0 ? "드레인 → RMA 후보 판정"
        : sev === 1 ? "냉각 · 전력캅 상관 확인" : "추이 관찰 · 임계 시 알림";
      return '<tr data-obs-gpu="' + esc(x.gpu_uuid) + '" style="cursor:pointer" title="클릭 시 GPU 상세">' +
        td(obsGpuLoc(x)) +
        td(tag + ' <span style="color:var(--muted);font-size:11px">' + esc(reason) + "</span>") +
        td(obsUtilCell(x.util_pct)) +
        td(obsTempCell(x.temp_c), "num") +
        td(x.power_w != null ? fmt(x.power_w) + "W" : "—", "num") +
        td((x.ecc_uncorr || 0) + " / " + (x.ecc_corr || 0), "num") +
        td('<span class="id" style="color:var(--muted)">' + esc(x.tenant_id || "—") + "</span>") +
        td('<span style="color:var(--muted2);font-size:10.5px">' + advice + "</span>") + "</tr>";
    }).join("") || '<tr><td colspan="8" style="color:var(--green-text)">예외 없음 — 전 GPU 정상 범위</td></tr>');
  }

  function obsSparkSvg(vals, color) {
    /* 값 없음(랙 Off 등 in-band 텔레메트리 부재) — 문구로 대체 */
    var has = (vals || []).some(function (v) { return v != null && !isNaN(+v); });
    if (!has) return '<div style="height:46px;display:flex;align-items:center;justify-content:center;' +
      'color:var(--muted2);font-size:11px">데이터 없음 — in-band 텔레메트리 미수집</div>';
    return '<svg width="100%" height="46" viewBox="0 0 520 46" preserveAspectRatio="none">' +
      '<polyline points="' + poly(vals.map(function (v) { return v == null ? 0 : +v; }), 520, 46) +
      '" fill="none" stroke="' + color + '" stroke-width="1.6"></polyline></svg>';
  }

  function openObsGpuModal(uuid) {
    setTxt("obs-gpu-m-title", "GPU 상세 — " + uuid);
    setHtml("obs-gpu-m-body", '<div style="color:var(--muted);font-size:12px">불러오는 중…</div>');
    NC.openModal("obs_gpu");
    obsGet("/dcgm/gpus/" + encodeURIComponent(uuid)).then(function (g) {
      var live = g != null;
      g = g || obsMockGpuDetail(uuid);
      if (!g) {
        setHtml("obs-gpu-m-body", '<div style="color:var(--muted);font-size:12px">GPU 데이터 없음</div>');
        return;
      }
      var h = g.history || {};
      setHtml("obs-gpu-m-body",
        (live ? "" : '<div class="callout warn" style="margin-bottom:10px">twin 미연동 — mock 데이터 표시</div>') +
        (g.state === "off" || g.telemetry_source === "none"
          ? '<div class="callout warn" style="margin-bottom:10px">랙 전원 Off — <b>in-band 텔레메트리 없음 (OOB만)</b> · DCGM 계측값은 "—"로 표시됩니다</div>'
          : "") +
        '<table class="kv tabnum">' +
        "<tr><td>위치</td><td class='id'>" + esc(g.site || "—") + " · " + esc(g.su_id || "—") +
          " · " + esc(g.tray_id || "—") + " · idx " + (g.idx != null ? g.idx : "—") + "</td></tr>" +
        "<tr><td>테넌트 / health</td><td>" + esc(g.tenant_id || "—") + " · " + obsHealthSt(g.health) + "</td></tr>" +
        "<tr><td>util / SM util</td><td>" + obsN1(g.util_pct) + "% · " + obsN1(g.sm_util_pct) + "%</td></tr>" +
        "<tr><td>메모리 (HBM4)</td><td>" + obsNum(g.mem_used_gb) + " / " + obsNum(g.mem_total_gb) + " GB</td></tr>" +
        "<tr><td>온도 core / mem</td><td>" + obsN1(g.temp_c) + " / " + obsN1(g.mem_temp_c) + " °C</td></tr>" +
        "<tr><td>전력 / 리밋 · 클록</td><td>" + obsNum(g.power_w) + " / " + obsNum(g.power_limit_w) +
          " W · SM " + obsNum(g.sm_clock_mhz) + " MHz</td></tr>" +
        "<tr><td>throttle</td><td>" + ((g.throttle_reasons || []).map(esc).join(", ") ||
          '<span style="color:var(--green-text)">없음</span>') + "</td></tr>" +
        "<tr><td>ECC corr / uncorr</td><td>" + obsNum(g.ecc_corr) + " · <span style='color:" +
          ((g.ecc_uncorr || 0) ? "var(--red)" : "inherit") + "'>" + obsNum(g.ecc_uncorr) + "</span></td></tr>" +
        "<tr><td>XID (최근)</td><td>" + ((g.xid_recent || []).join(", ") ||
          '<span style="color:var(--green-text)">없음</span>') + "</td></tr>" +
        "<tr><td>NVLink tx/rx · PCIe</td><td>" + obsNum(g.nvlink_tx_gbps) + " / " +
          obsNum(g.nvlink_rx_gbps) + " Gbps · replay " + obsNum(g.pcie_replay) + "</td></tr>" +
        "</table>" +
        '<div class="spark" style="margin-top:12px"><div class="hd">' +
        '<span style="color:var(--green-text);font-weight:700">util (%)</span>' +
        '<span class="v">' + obsN1(obsLast(h.util)) + "</span></div>" +
        obsSparkSvg(h.util, "var(--green)") + "</div>" +
        '<div class="spark" style="margin-top:8px"><div class="hd">' +
        '<span style="color:var(--orange);font-weight:700">temp (°C)</span>' +
        '<span class="v">' + obsN1(obsLast(h.temp)) + "</span></div>" +
        obsSparkSvg(h.temp, "var(--orange)") + "</div>" +
        '<div class="spark" style="margin-top:8px"><div class="hd">' +
        '<span style="color:var(--amber);font-weight:700">power (W)</span>' +
        '<span class="v">' + obsN1(obsLast(h.power)) + "</span></div>" +
        obsSparkSvg(h.power, "var(--amber)") + "</div>");
    });
  }

  /* ── ⑮ 랙 · 전력 (DCIM) — 히트맵 + 전체 랙 제어 (데모) ──── */
  function obsHeatColor(ratio) {
    var r = Math.max(0, Math.min(1, ratio || 0));
    if (r < 0.1) return "#233043";
    return "hsl(" + Math.round(120 - 120 * r) + ",42%," + Math.round(24 + r * 14) + "%)";
  }

  /* 랙 제어 — Emulator control API (:9100 AI Infra …/racks[/{id}]/control).
     twin 미연동(404 포함) 시 로컬 오버레이(obsRackLocal)로 데모 반영.
     오버레이는 렌더 시 서버 필드와 일치하면 자동 삭제(동기화)된다. */
  var obsRackLocal = {};     // rack_id → {power_state?, power_cap_kw?, workload_profile?, cordoned?}
  var obsRackList = [];      // 마지막 렌더 랙 목록 (범위 매칭용)
  var obsCtlArm = null;      // 2단계 인라인 확인 {el, key, label, warn, until, timer}
  var OBS_CTL_FIELDS = ["power_state", "power_cap_kw", "workload_profile", "cordoned"];
  var OBS_CTL_LBL = { power_on: "전원 On", power_off: "전원 Off", restart: "재시작",
    power_cap: "Power Cap", power_uncap: "Cap 해제", workload: "워크로드 프로필",
    cordon: "Cordon", uncordon: "Uncordon" };
  var OBS_SITE_KO = { gasan: "가산", ansan: "안산" };

  /* 서버 필드 + 로컬 오버레이 병합 → 제어 상태 (필드별 오버레이 우선) */
  function obsCtlState(rk) {
    var base = {
      power_state: rk.power_state != null ? rk.power_state : "on",
      power_cap_kw: rk.power_cap_kw != null ? rk.power_cap_kw : null,
      workload_profile: rk.workload_profile != null ? rk.workload_profile : null,
      cordoned: !!rk.cordoned,
    };
    var o = obsRackLocal[rk.rack_id];
    if (o) {
      var synced = true;
      OBS_CTL_FIELDS.forEach(function (k) {
        if (k in o && o[k] !== base[k]) synced = false;
      });
      if (synced) delete obsRackLocal[rk.rack_id];   // twin이 따라잡음 → 오버레이 제거
      else OBS_CTL_FIELDS.forEach(function (k) { if (k in o) base[k] = o[k]; });
    }
    return base;
  }

  function obsCtlApplyLocal(ids, action, params) {
    ids.forEach(function (id) {
      var o = obsRackLocal[id] = obsRackLocal[id] || {};
      if (action === "power_on" || action === "restart") o.power_state = "on";
      else if (action === "power_off") o.power_state = "off";
      else if (action === "power_cap") {
        o.power_cap_kw = params && params.cap_kw != null ? params.cap_kw
          : +(187 * ((params && params.cap_pct) || 0) / 100).toFixed(1);
      } else if (action === "power_uncap") o.power_cap_kw = null;
      else if (action === "workload") o.workload_profile = (params && params.profile) || null;
      else if (action === "cordon") o.cordoned = true;
      else if (action === "uncordon") o.cordoned = false;
    });
  }

  function obsScopeVal() {
    var el = document.getElementById("obs-rc-scope");
    return (el && el.value) || "all";
  }
  function obsScopeObj(v) {
    if (v.indexOf("site:") === 0) return { site: v.slice(5) };
    if (v.indexOf("su:") === 0) return { su: v.slice(3) };
    return { all: true };
  }
  function obsScopeLabel(v) {
    if (v === "site:gasan") return "가산 전 랙";
    if (v === "site:ansan") return "안산 전 랙";
    if (v.indexOf("su:") === 0) return v.slice(3) + " 전 랙";
    return "전체 140랙";
  }
  function obsScopeRackIds(v) {
    return (obsRackList || []).filter(function (rk) {
      if (v.indexOf("site:") === 0) {
        var s = v.slice(5);
        return rk.site === s || rk.site === OBS_SITE_KO[s];
      }
      if (v.indexOf("su:") === 0) return rk.su_id === v.slice(3);
      return true;
    }).map(function (rk) { return rk.rack_id; });
  }

  /* 2단계 인라인 확인 — 1차 클릭 arm(3s) → 재클릭 시 실행 */
  function obsCtlDisarm() {
    if (!obsCtlArm) return;
    clearTimeout(obsCtlArm.timer);
    if (obsCtlArm.el && obsCtlArm.el.isConnected) {
      obsCtlArm.el.textContent = obsCtlArm.label;
      obsCtlArm.el.classList.remove("armed");
    }
    obsCtlArm = null;
  }
  function obsCtlArmBtn(el, key, warnTxt) {
    if (obsCtlArm && obsCtlArm.key === key && Date.now() < obsCtlArm.until) {
      obsCtlDisarm();
      return true;                                   // 확인 완료 → 실행
    }
    obsCtlDisarm();
    obsCtlArm = { el: el, key: key, label: el.textContent, warn: warnTxt,
      until: Date.now() + 3000, timer: setTimeout(obsCtlDisarm, 3000) };
    el.textContent = warnTxt;
    el.classList.add("armed");
    return false;
  }
  /* 폴링 재렌더로 armed 버튼 DOM이 교체된 경우 시각 상태 복원 */
  function obsCtlArmReapply() {
    if (!obsCtlArm || Date.now() >= obsCtlArm.until) return;
    var el = document.querySelector('[data-key="' + obsCtlArm.key + '"]');
    if (el && el !== obsCtlArm.el) {
      el.textContent = obsCtlArm.warn;
      el.classList.add("armed");
      obsCtlArm.el = el;
    }
  }

  function obsRackCtlClick(el, rid) {
    var action = rid ? el.dataset.obsRctl1 : el.dataset.obsRctl;
    if (!action) return;
    var params = null;
    if (action === "power_cap") {
      var v = parseFloat(((document.getElementById("obs-rc-cap") || {}).value || "").trim());
      var unit = (document.getElementById("obs-rc-capu") || {}).value || "kw";
      if (!(v > 0) || (unit === "pct" && v > 100) || (unit === "kw" && v > 187)) {
        NC.toast("Power Cap 값을 확인하세요 — kW(1–187) 또는 %(1–100) 입력", "warn");
        return;
      }
      params = unit === "pct" ? { cap_pct: v } : { cap_kw: v };
    } else if (action === "workload") {
      params = { profile: (document.getElementById("obs-rc-profile") || {}).value || "steady" };
    } else if (action === "cordon") {
      params = { reason: "ops console cordon (demo)" };
    }
    var warn = action === "power_off" ? "확인 — 전원 차단 · 테넌트 워크로드 중단"
      : action === "cordon" ? "확인 — 신규 할당 차단 · 테넌트 영향"
      : action === "restart" ? "확인 — 재시작 실행"
      : "확인 — 재클릭 시 실행";
    if (!obsCtlArmBtn(el, (rid || "bulk") + ":" + action, warn)) return;
    obsRackCtlRun(rid, action, params);
  }

  function obsRackCtlRun(rid, action, params) {
    var scopeV = rid ? null : obsScopeVal();
    var body = { action: action };
    if (params) body.params = params;
    if (!rid) body.scope = obsScopeObj(scopeV);
    var path = rid ? "/racks/" + encodeURIComponent(rid) + "/control" : "/racks/control";
    var pLbl = params && params.cap_kw != null ? " " + params.cap_kw + "kW"
      : params && params.cap_pct != null ? " " + params.cap_pct + "%"
      : params && params.profile ? " → " + params.profile : "";
    var tgt = rid || obsScopeLabel(scopeV);
    var kind = action === "power_off" || action === "cordon" || action === "restart"
      ? "warn" : undefined;
    obsPost(path, body).then(function (r) {
      var live = r != null;
      var ids = rid ? [rid] : obsScopeRackIds(scopeV);
      if (live) {
        /* twin 반영 — 로컬 오버레이 대신 캐시 무효화 후 서버 상태 재조회 (즉시 갱신) */
        var failed = (r.failed || []).map(String);
        ids.forEach(function (id) { delete obsRackLocal[id]; });
        delete obsCacheMap["/racks"];
        delete obsCacheMap["/summary"];
        NC.toast(tgt + " " + OBS_CTL_LBL[action] + pLbl + " — " +
          (rid ? (r.applied === false ? "미적용 (twin 거부)" : "적용 완료")
               : fmt(r.applied != null ? r.applied : ids.length - failed.length) + "/" +
                 fmt(r.matched != null ? r.matched : ids.length) + " 적용" +
                 (failed.length ? " · 실패 " + failed.length : "")) +
          " (twin 반영 · 데모)", kind);
      } else {
        obsCtlApplyLocal(ids, action, params);
        NC.toast(tgt + " " + OBS_CTL_LBL[action] + pLbl + " — " + fmt(ids.length) +
          "랙 로컬 반영 (twin 미연동 · 로컬 데모)", "warn");
      }
      renderObsRack();
    });
  }

  function obsRackCtlBtns(rid) {
    function b(cls, act, lbl) {
      return '<button class="' + cls + ' obs-rcb" data-obs-rctl1="' + act +
        '" data-rack="' + esc(rid) + '" data-key="' + esc(rid + ":" + act) + '">' + lbl + "</button>";
    }
    return '<div class="callout warn" style="margin-top:12px">랙 제어 — <b>데모</b> (Emulator twin 대상 · 실설비 아님) · Off/Cordon은 테넌트 영향</div>' +
      '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:8px;align-items:center">' +
      b("btn-ghost", "power_on", "전원 On") + b("btn-danger", "power_off", "전원 Off") +
      b("btn-warn", "restart", "재시작") +
      b("btn-warn", "cordon", "Cordon") + b("btn-ghost", "uncordon", "Uncordon") +
      '<span style="width:1px;height:22px;background:var(--line);flex:none"></span>' +
      '<input id="obs-rc-cap" class="obs-inp" type="number" min="1" step="1" placeholder="Cap 값">' +
      '<select id="obs-rc-capu" class="chip" style="appearance:auto;cursor:pointer">' +
      '<option value="kw">kW</option><option value="pct">%</option></select>' +
      b("btn-warn", "power_cap", "Power Cap 적용") + b("btn-ghost", "power_uncap", "Cap 해제") +
      '<select id="obs-rc-profile" class="chip" style="appearance:auto;cursor:pointer">' +
      '<option value="idle">프로필: idle</option><option value="steady" selected>프로필: steady</option>' +
      '<option value="train">프로필: train</option><option value="burst">프로필: burst</option></select>' +
      b("btn-ghost", "workload", "프로필 적용") + "</div>" +
      '<div style="color:var(--muted2);font-size:10px;margin-top:6px">1차 클릭 후 3초 내 재클릭 시 실행 · 전체/일괄 제어는 AI Infra Twin Control(:9100) 사용</div>';
  }

  function renderObsRack() {
    Promise.all([obsGet("/racks"), obsGet("/summary")]).then(function (r) {
      var d = r[0], sum = r[1];
      var live = Array.isArray(d) && d.length > 0;
      var racks = live ? d : obsMockRacks();
      obsRackList = racks;
      obsSrc("obs-rack", live);
      obsRackPower(racks);
      var bySu = {}, order = [], ctl = {};
      var offN = 0, cordN = 0, capN = 0, partN = 0, trayOffN = 0, hasCtl = false;
      racks.forEach(function (rk) {
        var k = (rk.site || "—") + " " + (rk.su_id || "—");
        if (!bySu[k]) { bySu[k] = []; order.push(k); }
        bySu[k].push(rk);
        var cs = ctl[rk.rack_id] = obsCtlState(rk);
        if (rk.power_state != null || obsRackLocal[rk.rack_id]) hasCtl = true;
        if (cs.power_state === "off") offN++;
        if (cs.power_state === "partial") { partN++; trayOffN += rk.trays_off || 0; }
        if (cs.cordoned) cordN++;
        if (cs.power_cap_kw != null) capN++;
      });
      setTxt("obs-rack-title", "랙 전력 히트맵 — " + fmt(racks.length) + "랙");
      setTxt("obs-rack-c", live ? "DCIM · 랙 단위 실측 (twin)" : "DCIM · 랙 단위 (mock)");
      /* KPI 밴드 — summary 확장 필드 우선, 없으면 병합 상태 집계 (null 가드) */
      var vOff = sum && sum.racks_off != null ? sum.racks_off : offN;
      var vCord = sum && sum.racks_cordoned != null ? sum.racks_cordoned : cordN;
      var vCap = sum && sum.racks_capped != null ? sum.racks_capped : capN;
      var vTray = sum && sum.trays_off != null ? sum.trays_off : (partN ? trayOffN : null);
      if (sum && (sum.racks_off != null || sum.racks_cordoned != null ||
        sum.racks_capped != null)) hasCtl = true;
      var kb = document.getElementById("obs-rack-ctlkpi");
      if (kb) {
        kb.style.display = hasCtl ? "" : "none";
        if (hasCtl) kb.innerHTML =
          kpiCell("전원 Off 랙", fmt(vOff), vOff ? "red" : "green",
            kpiSub("전체 " + fmt(racks.length) + "랙")) +
          /* 트레이 단위 부분 Off — 계약 필드(trays_off) 있을 때만 노출 */
          (vTray != null
            ? kpiCell("트레이 Off (부분)", fmt(vTray), vTray ? "amber" : "green",
                kpiSub(partN ? "partial 랙 " + fmt(partN) + "개" : "부분 Off 랙 없음"))
            : "") +
          kpiCell("Cordoned 랙", fmt(vCord), vCord ? "amber" : "green",
            kpiSub("신규 할당 차단")) +
          kpiCell("Power Cap 랙", fmt(vCap), vCap ? "amber" : "green",
            kpiSub("전력 상한 적용"));
      }
      setHtml("obs-rack-map", order.map(function (k) {
        return '<div class="obs-hmrow"><span class="lb">' + esc(k) + '</span><span class="obs-hm">' +
          bySu[k].map(function (rk) {
            var cs = ctl[rk.rack_id];
            var off = cs.power_state === "off";
            var part = cs.power_state === "partial";
            var cls = "hc" + (off ? " off" : "") + (part ? " part" : "") +
              (cs.cordoned ? " cord" : "") +
              (cs.power_cap_kw != null ? " capd" : "") +
              (rk.health === "critical" ? " crit" : rk.throttled_gpus ? " th" : "") +
              (obsRackSel === rk.rack_id ? " sel" : "");
            var ttl = rk.rack_id + " · " + obsNum(rk.it_power_kw) + "kW" +
              (off ? " · OFF"
                : part ? " · 트레이 Off " + (rk.trays_off || 0) + "/" + (rk.trays_total || 18)
                : cs.power_state === "mixed" ? " · 전원 mixed" : "") +
              (cs.cordoned ? " · cordoned" : "") +
              (cs.power_cap_kw != null ? " · cap " + cs.power_cap_kw + "kW" : "") +
              (cs.workload_profile ? " · " + cs.workload_profile : "");
            return '<span class="' + cls + '" data-obs-rack="' + esc(rk.rack_id) + '"' +
              (off ? "" : ' style="background:' + obsHeatColor((rk.it_power_kw || 0) / 187) + '"') +
              ' title="' + esc(ttl) + '">' + (off ? "OFF" : "") + "</span>";
          }).join("") + "</span></div>";
      }).join(""));
      setHtml("obs-rack-leg",
        '<span><span class="leg" style="background:#233043"></span> idle</span>' +
        '<span><span class="leg" style="background:' + obsHeatColor(0.5) + '"></span> ~95kW</span>' +
        '<span><span class="leg" style="background:' + obsHeatColor(0.8) + '"></span> ~150kW</span>' +
        '<span><span class="leg" style="background:' + obsHeatColor(1) + '"></span> 187kW 캡</span>' +
        '<span><span class="leg" style="background:#1a212b;outline:1px solid #2a3644"></span> OFF</span>' +
        '<span><span class="leg" style="background:linear-gradient(#233043 50%,#1a212b 50%)"></span> 부분 Off (트레이)</span>' +
        '<span><span class="leg" style="background:repeating-linear-gradient(45deg,#233043 0 2px,rgba(240,163,176,.5) 2px 4px)"></span> cordon</span>' +
        '<span><span class="leg" style="background:#233043;box-shadow:inset 0 -2px 0 var(--blue)"></span> cap</span>' +
        '<span style="color:var(--amber)">□ throttle</span>' +
        '<span style="color:var(--red)">□ fault</span>');
      var det = racks.filter(function (rk) { return rk.rack_id === obsRackSel; })[0];
      var panel = $("#obs-rack-detail-panel");
      if (panel) panel.style.display = det ? "" : "none";
      if (det) {
        var dcs = ctl[det.rack_id] || obsCtlState(det);
        setTxt("obs-rack-d-title", "랙 상세 — " + (det.rack_id || "—"));
        setHtml("obs-rack-detail",
          '<table class="kv tabnum">' +
          "<tr><td>위치</td><td>" + esc(det.site || "—") + " · " + esc(det.su_id || "—") +
            (det.tenant_id ? " · 테넌트 <span class='id'>" + esc(det.tenant_id) + "</span>" : "") + "</td></tr>" +
          "<tr><td>IT 전력 / GPU 전력</td><td>" + obsNum(det.it_power_kw) + " / " +
            obsNum(det.gpu_power_kw) + " kW <span style='color:var(--muted)'>(MaxQ 캡 187kW)</span></td></tr>" +
          "<tr><td>inlet / outlet</td><td>" + obsN1(det.inlet_c) + " / " + obsN1(det.outlet_c) +
            " °C · ΔT " + obsN1((det.outlet_c || 0) - (det.inlet_c || 0)) + "°C</td></tr>" +
          "<tr><td>담당 CDU / 냉각 헤드룸</td><td><span class='id'>" + esc(det.cdu_id || "—") +
            "</span> · " + obsNum(det.cooling_headroom_kw) + " kW" +
            ' <span class="lnk" data-nav="obs-dlc">CDU 플릿 →</span></td></tr>' +
          "<tr><td>스로틀 GPU / health</td><td>" + obsNum(det.throttled_gpus) + " · " +
            obsHealthSt(det.health) + "</td></tr>" +
          "<tr><td>전원 / 프로필</td><td>" +
            (dcs.power_state === "off" ? '<span class="st red">OFF</span>'
              : dcs.power_state === "partial"
                ? '<span class="st amber">partial — 트레이 Off ' + fmt(det.trays_off || 0) +
                  "/" + fmt(det.trays_total || 18) + "</span>"
              : dcs.power_state === "mixed" ? '<span class="st amber">mixed</span>'
              : '<span class="st green">on</span>') +
            " · " + esc(dcs.workload_profile || "—") + "</td></tr>" +
          "<tr><td>Power Cap / Cordon</td><td>" +
            (dcs.power_cap_kw != null ? obsN1(dcs.power_cap_kw) + " kW"
              : "<span style='color:var(--muted)'>없음</span>") + " · " +
            (dcs.cordoned ? '<span class="st amber">cordoned</span>'
              : '<span class="st green">schedulable</span>') + "</td></tr>" +
          "</table>" +
          obsRackCtlBtns(det.rack_id));
      }
      obsCtlArmReapply();
    });
  }

  /* ── ⑯ 냉각 · DLC (SMCI CDU) ───────────────────────────── */
  function obsPumpChip(p) {
    p = p || {};
    var cls = p.state === "running" || p.state === "duty" ? "on"
      : p.state === "standby" ? "stby" : "bad";
    return '<span class="pumpchip ' + cls + '">' + esc(p.pump_id || "p?") + " " +
      esc(p.state || "—") + (p.rpm ? " · " + fmt(p.rpm) + "rpm" : "") + "</span>";
  }

  function renderObsDlc() {
    obsGet("/dlc/cdus").then(function (d) {
      var live = Array.isArray(d) && d.length > 0;
      var cdus = live ? d : obsMockCdus();
      obsSrc("obs-dlc", live);
      var totHeat = 0, totCap = 0, alarms = 0, leaks = 0;
      cdus.forEach(function (c) {
        totHeat += c.measured_heat_kw || 0;
        totCap += c.rated_capacity_kw || 0;
        alarms += (c.alarms || []).length;
        if (c.leak && c.leak.detected) leaks++;
      });
      setHtml("obs-dlc-kpi",
        kpiCell("CDU", fmt(cdus.length), "", kpiSub("Supermicro · liquid-to-liquid")) +
        kpiCell("총 제열량", fmt(Math.round(totHeat)) + "<small> kW</small>", "",
          kpiSub("정격 " + fmt(totCap) + "kW")) +
        kpiCell("평균 사용률", (totCap ? (totHeat / totCap * 100).toFixed(1) : "—") + "<small>%</small>",
          "", kpiSub("측정 열부하 기준")) +
        kpiCell("냉각 헤드룸", fmt(Math.round(totCap - totHeat)) + "<small> kW</small>", "green",
          kpiSub("증설 여유")) +
        kpiCell("알람", fmt(alarms), alarms ? "amber" : "green",
          kpiSub(alarms ? "카드에서 상세 확인" : "전 CDU 정상")) +
        kpiCell("누수 감지", fmt(leaks), leaks ? "red" : "green",
          kpiSub(leaks ? "즉시 격리 대응" : "누수 없음")));
      setHtml("obs-dlc-cards", cdus.map(function (c) {
        var util = c.utilization_pct != null ? c.utilization_pct : 0;
        var gcol = util > 90 ? "var(--red)" : util > 75 ? "var(--amber)" : "var(--green)";
        var sec = c.secondary || {}, cool = c.coolant || {};
        var leak = c.leak && c.leak.detected;
        return '<div class="cdu-card' + (leak ? " leak" : (c.alarms || []).length ? " alarm" : "") +
          '" data-obs-cdu="' + esc(c.cdu_id) + '" title="클릭 시 CDU 상세 + 장애 주입 데모">' +
          '<div style="display:flex;align-items:center;gap:8px"><span class="dot ' +
          (leak || c.health === "critical" ? "red" : c.health === "warn" ? "amber" : "green") +
          '"></span><b class="mono" style="font-size:11.5px;color:#fff">' + esc(c.cdu_id || "—") + "</b>" +
          '<span style="color:var(--muted);font-size:10.5px">' + esc(c.model || "—") + " · " +
          esc(c.oem || "") + "</span>" +
          '<span style="margin-left:auto;color:var(--muted2);font-size:10px">' + esc(c.su_id || "—") +
          " · " + fmt((c.rack_ids || []).length) + "랙</span></div>" +
          '<div class="gauge"><i style="width:' + Math.min(100, Math.max(0, util)) + "%;background:" +
          gcol + '"></i></div>' +
          '<div class="tabnum" style="display:flex;gap:12px;flex-wrap:wrap;font-size:10.5px;color:var(--muted)">' +
          "<span>사용률 <b style='color:#fff'>" + obsN1(util) + "%</b></span>" +
          "<span>2차 " + obsN1(sec.supply_c) + "/" + obsN1(sec.return_c) + "°C</span>" +
          "<span>ΔT <b style='color:#fff'>" + obsN1(sec.delta_t != null ? sec.delta_t :
            (sec.return_c || 0) - (sec.supply_c || 0)) + "°C</b></span>" +
          "<span>유량 " + obsNum(sec.flow_lpm) + "LPM</span></div>" +
          '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:8px">' +
          (c.pumps || []).map(obsPumpChip).join("") +
          '<span class="pumpchip">냉각수 ' + obsNum(cool.level_pct) + "% · pH " + obsN1(cool.ph) + "</span>" +
          (leak ? '<span class="pumpchip bad">LEAK — ' + esc((c.leak || {}).location || "위치 확인 중") + "</span>"
                : '<span class="pumpchip stby">누수 없음</span>') + "</div>" +
          ((c.alarms || []).length
            ? '<div style="margin-top:7px;font-size:10px;color:var(--amber)">⚠ ' +
              (c.alarms || []).map(function (a) {
                return esc(typeof a === "string" ? a
                  : (a.code || a.severity || "") + (a.detail ? " — " + a.detail : ""));
              }).join(" · ") + "</div>" : "") +
          "</div>";
      }).join("") || '<div style="color:var(--muted);font-size:12px">CDU 없음</div>');
    });
  }

  function openObsCduModal(id) {
    obsCduCur = id;
    setTxt("obs-cdu-m-title", "CDU 상세 — " + id);
    setHtml("obs-cdu-m-body", '<div style="color:var(--muted);font-size:12px">불러오는 중…</div>');
    NC.openModal("obs_cdu");
    obsGet("/dlc/cdus/" + encodeURIComponent(id)).then(function (c) {
      var live = c != null;
      c = c || obsMockCduDetail(id);
      if (!c) {
        setHtml("obs-cdu-m-body", '<div style="color:var(--muted);font-size:12px">CDU 데이터 없음</div>');
        return;
      }
      var pr = c.primary || {}, sec = c.secondary || {}, cool = c.coolant || {};
      var leak = c.leak && c.leak.detected;
      var branches = (c.branches || []).map(function (b) {
        var imb = b.imbalance_pct || 0;
        return "<tr>" + td('<span class="id">' + esc(b.branch_id || "—") + "</span>") +
          td('<span class="id" style="color:var(--muted)">' + esc(b.rack_id || "—") + "</span>") +
          td(obsNum(b.flow_lpm), "num") +
          td(obsN1(b.supply_c) + " / " + obsN1(b.return_c), "num") +
          td(obsNum(b.valve) + "%", "num") +
          td(obsNum(b.server_loops), "num") +
          td('<span style="color:' + (imb > 10 ? "var(--red)" : imb > 5 ? "var(--amber)" :
            "var(--green-text)") + ';font-weight:700">' + obsN1(imb) + "%</span>", "num") + "</tr>";
      }).join("") || '<tr><td colspan="7" style="color:var(--muted)">branch 데이터 없음</td></tr>';
      var sensors = (c.leak_sensors || []).map(function (sn) {
        var wet = sn.state && sn.state !== "dry";
        return '<span class="pumpchip' + (wet ? " bad" : " on") + '">' +
          esc(sn.sensor_id || sn.id || "sn?") + " · " + esc(sn.location || "—") + " · " +
          esc(sn.state || "—") + "</span>";
      }).join("") || '<span style="color:var(--muted);font-size:11px">센서 데이터 없음</span>';
      setHtml("obs-cdu-m-body",
        (live ? "" : '<div class="callout warn" style="margin-bottom:10px">twin 미연동 — mock 데이터 표시</div>') +
        '<table class="kv tabnum">' +
        "<tr><td>모델 / 타입</td><td>" + esc(c.model || "—") + " (" + esc(c.oem || "—") + ") · " +
          esc(c.type || "—") + "</td></tr>" +
        "<tr><td>담당</td><td>" + esc(c.site || "—") + " · " + esc(c.su_id || "—") + " · 랙 " +
          fmt((c.rack_ids || []).length) + "개</td></tr>" +
        "<tr><td>용량</td><td>정격 " + obsNum(c.rated_capacity_kw) + "kW · 측정 " +
          obsNum(c.measured_heat_kw) + "kW · 사용률 " + obsN1(c.utilization_pct) + "% · 헤드룸 " +
          obsNum(c.headroom_kw) + "kW</td></tr>" +
        "</table>" +
        '<div style="color:var(--muted);font-size:11px;font-weight:700;letter-spacing:.04em;margin:12px 0 4px">1차 / 2차 루프</div>' +
        '<table class="tbl"><thead><tr><th>루프</th><th class="num">공급 °C</th><th class="num">회수 °C</th>' +
        '<th class="num">ΔT</th><th class="num">유량 LPM</th><th class="num">압력 kPa</th></tr></thead><tbody>' +
        "<tr>" + td("1차 (시설수)") + td(obsN1(pr.supply_c), "num") + td(obsN1(pr.return_c), "num") +
          td(obsN1((pr.return_c || 0) - (pr.supply_c || 0)), "num") +
          td(obsNum(pr.flow_lpm), "num") + td(obsNum(pr.pressure_kpa), "num") + "</tr>" +
        "<tr>" + td("2차 (TCS)") + td(obsN1(sec.supply_c), "num") + td(obsN1(sec.return_c), "num") +
          td(obsN1(sec.delta_t != null ? sec.delta_t : (sec.return_c || 0) - (sec.supply_c || 0)), "num") +
          td(obsNum(sec.flow_lpm), "num") + td(obsNum(sec.pressure_kpa), "num") + "</tr>" +
        "</tbody></table>" +
        '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:10px">' +
        (c.pumps || []).map(obsPumpChip).join("") +
        '<span class="pumpchip">HX 효율 ' + obsN1(c.hx_efficiency_pct) + "%</span>" +
        '<span class="pumpchip' + ((c.filter_dp_kpa || 0) > 35 ? " bad" : "") + '">필터 ΔP ' +
          obsN1(c.filter_dp_kpa) + "kPa</span>" +
        '<span class="pumpchip">이슬점 여유 ' + obsN1(c.dew_point_margin_c) + "°C</span>" +
        '<span class="pumpchip">냉각수 ' + obsNum(cool.level_pct) + "% · " +
          obsN1(cool.conductivity_us_cm) + "µS/cm · pH " + obsN1(cool.ph) + " · PG" +
          obsNum(cool.concentration_pct) + "</span></div>" +
        (leak ? '<div class="iso g" style="margin-top:10px"><b>[LEAK]</b> 누수 감지 — ' +
          esc((c.leak || {}).location || "위치 확인 중") + " · 해당 branch 격리 권고</div>" : "") +
        ((c.alarms || []).length ? '<div class="iso w" style="margin-top:' + (leak ? 4 : 10) +
          'px"><b>[ALARM]</b> ' + (c.alarms || []).map(esc).join(" · ") + "</div>" : "") +
        '<div style="color:var(--muted);font-size:11px;font-weight:700;letter-spacing:.04em;margin:12px 0 4px">랙 Branch (CDM)</div>' +
        '<div style="max-height:180px;overflow:auto"><table class="tbl">' +
        '<thead><tr><th>Branch</th><th>랙</th><th class="num">유량 LPM</th><th class="num">공급/회수 °C</th>' +
        '<th class="num">밸브</th><th class="num">루프</th><th class="num">불균형</th></tr></thead><tbody>' +
        branches + "</tbody></table></div>" +
        '<div style="color:var(--muted);font-size:11px;font-weight:700;letter-spacing:.04em;margin:12px 0 4px">누수 센서</div>' +
        '<div style="display:flex;gap:5px;flex-wrap:wrap">' + sensors + "</div>" +
        '<div class="callout warn" style="margin-top:14px">장애 주입 — <b>데모 시나리오</b> (Emulator twin 전용 · 실설비 아님)</div>' +
        '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:8px">' +
        '<button class="btn-warn" data-obs-inject="flow_loss" data-cdu="' + esc(id) + '">flow_loss 주입</button>' +
        '<button class="btn-warn" data-obs-inject="pump_failure" data-cdu="' + esc(id) + '">pump_failure 주입</button>' +
        '<button class="btn-danger" data-obs-inject="leak" data-cdu="' + esc(id) + '">leak 주입</button>' +
        '<button class="btn" data-obs-recover="1" data-cdu="' + esc(id) + '">recover — 정상 복귀</button>' +
        "</div>");
    });
  }

  /* mock 폴백 장애 주입 — twin 미연동 시 로컬 데모 반영 */
  function obsMockInject(id, kind) {
    if (kind === "recover") { obsMockCdusC = null; return; }
    var c = obsMockCdus().filter(function (x) { return x.cdu_id === id; })[0];
    if (!c) return;
    c.alarms = c.alarms || [];
    if (kind === "pump_failure") {
      if (c.pumps && c.pumps[0]) { c.pumps[0].state = "failed"; c.pumps[0].rpm = 0; c.pumps[0].power_w = 0; }
      if (c.pumps && c.pumps[1]) { c.pumps[1].state = "running"; c.pumps[1].rpm = 3400; c.pumps[1].power_w = 3600; }
      c.alarms.push("PUMP1_FAILURE");
      c.health = "critical";
    } else if (kind === "flow_loss") {
      if (c.secondary) {
        c.secondary.flow_lpm = Math.round((c.secondary.flow_lpm || 800) * 0.4);
        c.secondary.delta_t = +((c.secondary.delta_t || 2) * 1.8).toFixed(1);
        c.secondary.return_c = +((c.secondary.supply_c || 25) + c.secondary.delta_t).toFixed(1);
      }
      c.alarms.push("SEC_FLOW_LOW");
      c.health = "critical";
    } else if (kind === "leak") {
      c.leak = { detected: true, location: (c.rack_ids || [])[2] || "2차측 매니폴드" };
      c.alarms.push("LEAK_DETECTED");
      c.health = "critical";
    } else if (kind === "hx_fouling") {
      c.hx_efficiency_pct = 78;
      c.alarms.push("HX_FOULING");
      c.health = "warn";
    } else if (kind === "filter_clog") {
      c.filter_dp_kpa = 55;
      c.alarms.push("FILTER_DP_CRIT");
      c.health = "warn";
    }
  }

  function obsInject(id, kind) {
    if (!id) return;
    var isRec = kind === "recover";
    obsPost("/dlc/cdus/" + encodeURIComponent(id) + "/" + (isRec ? "recover" : "inject"),
      isRec ? {} : { kind: kind }).then(function (r) {
      var live = r != null;
      if (!live) obsMockInject(id, kind);
      delete obsCacheMap["/dlc/cdus"];
      delete obsCacheMap["/dlc/cdus/" + encodeURIComponent(id)];
      delete obsCacheMap["/summary"];
      NC.toast((isRec ? id + " recover — 정상 상태 복귀" : id + " " + kind + " 주입") +
        " · 데모 시나리오" + (live ? " (twin 반영)" : " (mock — twin 미연동)"),
        isRec ? undefined : "warn");
      renderObsDlc();
      if (obsCduCur === id) openObsCduModal(id);
    });
  }

  /* ── ⑰ 패브릭 상관 (RCA) ───────────────────────────────── */
  function renderObsFabric() {
    Promise.all([obsGet("/correlate/cooling"), obsGet("/summary")]).then(function (r) {
      var live = Array.isArray(r[0]);
      var rows = live ? r[0] : obsMockCorrelate();
      var s = r[1] || obsMockSummary();
      obsSrc("obs-fabric", live);
      var g = s.gpus || {}, cool = s.cooling || {};
      var thr = g.throttled != null ? g.throttled : 0;
      obsThrHist.push(thr);
      if (obsThrHist.length > 72) obsThrHist.shift();
      setTxt("obs-fab-thr", fmt(thr));
      var line = $("#obs-fab-line");
      if (line) line.setAttribute("points", poly(obsThrHist, 560, 64));
      setTxt("obs-fab-note", "누적 " + obsThrHist.length + "샘플 (5s 간격 · 화면 활성 시에만 수집)" +
        " — 현재 throttled " + fmt(thr) + "기");
      setHtml("obs-fab-sum",
        '<div class="iso' + (rows.length ? " w" : "") + '"><b>[RCA]</b> 냉각→컴퓨트 상관 finding ' +
          rows.length + "건</div>" +
        '<div class="iso' + (thr ? " w" : "") + '"><b>[GPU]</b> thermal throttle ' + fmt(thr) +
          "기 · faulted " + obsNum(g.faulted) + "기</div>" +
        '<div class="iso' + (cool.alarms_open ? " w" : "") + '"><b>[DLC]</b> CDU 알람 ' +
          obsNum(cool.alarms_open) + "건 · 헤드룸 " + obsNum(cool.headroom_kw) + "kW</div>" +
        '<div class="iso"><b>[SLO]</b> GPU 가용성 ' + obsN1((s.slo || {}).gpu_availability_pct) + "%</div>");
      setHtml("obs-fab-rca", rows.map(function (x) {
        var conf = x.confidence;
        if (conf != null) conf = conf <= 1 ? Math.round(conf * 100) : Math.round(conf);
        return "<tr>" +
          td('<span class="id">' + esc(x.cdu_id || "—") + "</span>") +
          td(esc(x.finding || "—")) +
          td(conf != null ? '<span style="color:' + (conf >= 80 ? "var(--red)" : "var(--amber)") +
            ';font-weight:700">' + conf + "%</span>" : "—", "num") +
          td('<span class="id" style="color:var(--muted)">' +
            (x.affected_racks || []).map(esc).join(", ") + "</span>") +
          td(obsNum(x.affected_gpus), "num") +
          td(esc(x.tenant_impact || "—")) +
          td('<span style="color:var(--green-text)">' + esc(x.recommended_action || "—") + "</span>") +
          "</tr>";
      }).join("") || '<tr><td colspan="7" style="color:var(--green-text)">냉각발 상관 finding 없음 — 정상</td></tr>');
      obsFabChain(rows);
      setTxt("obs-fab-c", "correlate/cooling — finding " + rows.length + "건" +
        (live ? " (twin 라이브)" : " (mock)"));
    });
  }

  /* ─ 플릿 감시 헬퍼 — 예외 판정 · 정렬 ─ */
  function obsGpuIsAttn(x) {
    return x.state === "faulted" || x.state === "throttled" ||
      (x.temp_c || 0) >= 78 || (x.ecc_uncorr || 0) > 0 || (x.pcie_replay || 0) >= 3;
  }
  function obsGpuSort(arr, k) {
    if (!k) return;
    arr.sort(function (a, b) {
      return k === "temp" ? (b.temp_c || 0) - (a.temp_c || 0)
        : k === "util" ? (b.util_pct || 0) - (a.util_pct || 0)
        : k === "ecc" ? ((b.ecc_uncorr || 0) * 1000 + (b.ecc_corr || 0)) -
                        ((a.ecc_uncorr || 0) * 1000 + (a.ecc_corr || 0))
        : (b.power_w || 0) - (a.power_w || 0);
    });
  }

  /* ─ 전력 추이 스파크라인 축 라벨 — y: min/mid/max (poly 정규화 미러) · x: 상대시간 (5s 폴링) ─ */
  function obsPwrAxis(id, vals, fmtV) {
    var y = document.getElementById(id + "-y"), x = document.getElementById(id + "-x");
    if (!y || !x) return;
    if (!vals || !vals.length) { y.innerHTML = ""; x.innerHTML = ""; return; }
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    y.innerHTML = "<span>" + fmtV(mx) + "</span><span>" + fmtV((mn + mx) / 2) +
      "</span><span>" + fmtV(mn) + "</span>";
    function rel(sec) {
      if (sec <= 0) return "지금";
      if (sec < 60) return "-" + Math.round(sec) + "s";
      var m = sec / 60;
      return "-" + (m % 1 ? m.toFixed(1) : m) + "m";
    }
    var span = (vals.length - 1) * 5;   // 5s 폴링 간격 누적
    x.innerHTML = "<span>" + rel(span) + "</span><span>" + rel(span / 2) +
      "</span><span>지금</span>";
  }
  function obsPwrKw(v) { return fmt(Math.round(v)) + " kW"; }
  function obsPwrMw(v) { return (v / 1000).toFixed(2) + " MW"; }

  /* ─ 랙 · 전력: 사이트별 추이 + 전체 소비 ─ */
  function obsRackPower(racks) {
    var ga = 0, an = 0, gaN = 0, anN = 0, maxR = null, allocSum = 0, allocN = 0, head = 0;
    racks.forEach(function (rk) {
      var p = rk.it_power_kw || 0;
      var isGa = rk.site === "가산" || rk.site === "gasan";
      if (isGa) { ga += p; gaN++; } else { an += p; anN++; }
      if (!maxR || p > maxR.p) maxR = { p: p, id: rk.rack_id };
      /* 할당 판정 — 라이브(tenants[]/allocated_gpus) · mock(tenant_id) 겸용 */
      if ((rk.tenants && rk.tenants.length) || rk.tenant_id || (rk.allocated_gpus > 0)) {
        allocSum += p; allocN++;
      }
      head += rk.cooling_headroom_kw || 0;
    });
    var tot = ga + an;
    obsPwrHist.ga.push(ga); obsPwrHist.an.push(an); obsPwrHist.tot.push(tot);
    ["ga", "an", "tot"].forEach(function (k) { if (obsPwrHist[k].length > 72) obsPwrHist[k].shift(); });
    setHtml("obs-rack-kpi",
      kpiCell("전체 IT 전력", (tot / 1000).toFixed(2) + "<small> MW</small>", "",
        kpiSub(fmt(Math.round(tot)) + " kW · 계약 캡 26.2MW")) +
      kpiCell("가산", fmt(Math.round(ga)) + "<small> kW</small>", "",
        kpiSub(gaN + "랙 · 평균 " + (gaN ? Math.round(ga / gaN) : 0) + "kW/랙")) +
      kpiCell("안산", fmt(Math.round(an)) + "<small> kW</small>", "",
        kpiSub(anN + "랙 · 평균 " + (anN ? Math.round(an / anN) : 0) + "kW/랙")) +
      kpiCell("최고 랙", maxR ? fmt(Math.round(maxR.p)) + "<small> kW</small>" : "—",
        maxR && maxR.p >= 170 ? "amber" : "",
        kpiSub(maxR ? maxR.id + " · MaxQ 캡 187kW" : "—")) +
      kpiCell("할당 랙 평균", allocN ? Math.round(allocSum / allocN) + "<small> kW</small>" : "—", "",
        kpiSub("할당 " + allocN + "랙 기준")) +
      kpiCell("냉각 헤드룸 합", fmt(Math.round(head)) + "<small> kW</small>", "green",
        kpiSub("CDU 잔여 제열 여유")));
    var el;
    el = $("#obs-pwr-ga"); if (el) el.setAttribute("points", poly(obsPwrHist.ga, 560, 48));
    el = $("#obs-pwr-an"); if (el) el.setAttribute("points", poly(obsPwrHist.an, 560, 48));
    el = $("#obs-pwr-tot"); if (el) el.setAttribute("points", poly(obsPwrHist.tot, 560, 48));
    obsPwrAxis("obs-pwr-ga", obsPwrHist.ga, obsPwrKw);
    obsPwrAxis("obs-pwr-an", obsPwrHist.an, obsPwrKw);
    obsPwrAxis("obs-pwr-tot", obsPwrHist.tot, obsPwrMw);
    setTxt("obs-pwr-ga-v", fmt(Math.round(ga)) + " kW");
    setTxt("obs-pwr-an-v", fmt(Math.round(an)) + " kW");
    setTxt("obs-pwr-tot-v", (tot / 1000).toFixed(2) + " MW");
    setTxt("obs-pwr-note", "누적 " + obsPwrHist.tot.length + "샘플 (5s 간격 · 화면 활성 시에만 수집)");
    function capRow(lb, v, cap, col) {
      var pct = Math.min(100, v / cap * 100);
      return '<div class="evrow"><span class="lb" style="width:120px">' + lb +
        '</span><i style="max-width:none"><b style="width:' + pct.toFixed(1) + "%;background:" + col +
        '"></b></i><em style="width:130px">' + (v / 1000).toFixed(2) + " / " + (cap / 1000).toFixed(1) +
        "MW</em></div>";
    }
    setHtml("obs-pwr-caps",
      capRow("가산 · 전력 캡", ga, 6700, "var(--green)") +
      capRow("안산 · 전력 캡", an, 19400, "#5aa7e8") +
      capRow("전체 · 계약 캡", tot, 26200, "var(--amber)") +
      '<div style="color:var(--muted2);font-size:10px;margin-top:6px">IT 전력 기준 (냉각 부대전력 제외) · PUE 1.18 적용 시 시설 전력 ≈ ' +
      ((tot * 1.18) / 1000).toFixed(2) + "MW</div>");
  }

  /* ─ GPU 패브릭 (UFM·NetQ) — 라이브 우선 · 실패 시 mock 폴백 ─ */
  /* 실서버 응답 언랩 — {count, systems|links|pkeys|checks|switches|roce:[…]} 래핑
     또는 bare 배열(구 계약) 양쪽 수용 */
  function obsFtList(v, key) {
    if (Array.isArray(v)) return v;
    if (v && Array.isArray(v[key])) return v[key];
    return [];
  }
  function renderObsFabTopo() {
    Promise.all([
      obsGet("/ufm/v1/fabric/health?site="),
      obsGet("/ufm/v1/resources/systems?site="),
      obsGet("/ufm/v1/resources/links?state=degraded"),
      obsGet("/ufm/v1/resources/links?state=down"),
      obsGet("/ufm/v1/resources/pkeys"),
      obsGet("/netq/v1/validation"),
      obsGet("/netq/v1/switches?site="),
      obsGet("/netq/v1/roce?site="),
    ]).then(function (r) {
      var health = r[0];
      var systems = obsFtList(r[1], "systems");
      var live = !!(health && typeof health === "object" && systems.length);
      if (live) {
        obsFtLive(health, systems,
          obsFtList(r[2], "links").concat(obsFtList(r[3], "links")),
          obsFtList(r[4], "pkeys"), r[5], r[6], r[7]);
      } else {
        obsFtMock();
      }
    });
  }

  function obsFtNetqShow(on) {
    var el = document.getElementById("obs-ft-netq-panel");
    if (el) el.style.display = on ? "" : "none";
  }

  /* ─ 라이브 렌더 — UFM fabric/health · systems · links · pkeys + NetQ ─ */
  function obsFtSwState(st) {
    return st === "down" ? " crit" : st === "degraded" ? " warn" : "";
  }
  function obsFtLive(health, systems, badLinks, pkeys, valid, nqSw, roce) {
    obsSrc("obs-fabtopo", true, "● UFM·NetQ 라이브 (:9100)");
    var siteKo = { gasan: "가산", ansan: "안산" };
    var tenantPk = pkeys.filter(function (p) { return p && p.tenant_id; });
    var degr = health.links_degraded != null ? health.links_degraded
      : badLinks.filter(function (l) { return l.state === "degraded"; }).length;
    var down = health.links_down != null ? health.links_down
      : badLinks.filter(function (l) { return l.state === "down"; }).length;
    /* health.switches — 실서버 {total,ok,degraded,down} dict · 구 계약 int 양쪽 수용 */
    var hsw = health.switches;
    var swN = hsw && typeof hsw === "object" ? hsw.total : hsw;
    var swBad = hsw && typeof hsw === "object" ? (hsw.degraded || 0) + (hsw.down || 0) : 0;
    var swSub = hsw && typeof hsw === "object"
      ? "ok " + fmt(hsw.ok || 0) + " · degraded " + fmt(hsw.degraded || 0) +
        " · down " + fmt(hsw.down || 0)
      : "systems " + fmt(systems.length) + "대 (스파인+리프)";
    setHtml("obs-ft-kpi",
      kpiCell("IB 스위치", obsNum(swN), swBad ? "amber" : "",
        kpiSub(swSub)) +
      kpiCell("활성 링크", obsNum(health.links_active),
        (health.links_active || 0) >= (health.links_total || 0) ? "green" : "",
        kpiSub("전체 " + obsNum(health.links_total) +
          (health.links_total ? " · 가동률 " +
            ((health.links_active || 0) / health.links_total * 100).toFixed(2) + "%" : ""))) +
      kpiCell("이상 링크", fmt(degr + down), (degr + down) ? "amber" : "green",
        kpiSub("degraded " + fmt(degr) + " · down " + fmt(down))) +
      kpiCell("flap (24h)", obsNum(health.flaps_24h), (health.flaps_24h || 0) ? "amber" : "",
        kpiSub("unhealthy 포트 " + fmt((health.unhealthy_ports || []).length))) +
      kpiCell("P_Key", fmt(tenantPk.length), "",
        kpiSub(tenantPk.map(function (p) {
          return String(p.tenant_id || "").replace(/^tnt-/, "");
        }).join(" · ") || "실 테넌트 없음")) +
      kpiCell("패브릭 스코어", obsN1(health.score),
        health.score != null && health.score < 90 ? "amber" : "green",
        kpiSub("UFM fabric health")));
    /* 사이트 카드 — systems 실물 기반 (spine 칩 · SU행 leaf 셀 plane A/B) */
    var bySite = {}, siteOrder = [];
    systems.forEach(function (sw) {
      var k = sw.site || "—";
      if (!bySite[k]) { bySite[k] = { spines: [], sus: {}, suOrder: [] }; siteOrder.push(k); }
      var s = bySite[k];
      if (sw.type === "spine") { s.spines.push(sw); return; }
      var su = sw.su_id || "—";
      if (!s.sus[su]) { s.sus[su] = []; s.suOrder.push(su); }
      s.sus[su].push(sw);
    });
    function suNum(id) { var m = /(\d+)/.exec(String(id)); return m ? +m[1] : 999; }
    function planeSort(a, b) {
      return String(a.plane || "").localeCompare(String(b.plane || "")) ||
        String(a.name || a.guid || "").localeCompare(String(b.name || b.guid || ""));
    }
    function swTitle(sw) {
      return (sw.name || sw.guid || "—") + " — plane " + (sw.plane || "?") +
        " · " + (sw.model || "—") + " · fw " + (sw.fw || "—") +
        " · 포트 " + obsNum(sw.ports_active) + "/" + obsNum(sw.ports_total) +
        " · " + obsN1(sw.temperature_c) + "°C · " + (sw.state || "ok");
    }
    setHtml("obs-ft-topo", siteOrder.map(function (siteId) {
      var s = bySite[siteId];
      s.spines.sort(planeSort);
      s.suOrder.sort(function (a, b) { return suNum(a) - suNum(b); });
      var pk = tenantPk.filter(function (p) {
        return !(p.sites && p.sites.length) || p.sites.indexOf(siteId) >= 0;
      });
      var pkLbl = pk.length
        ? "P_Key " + pk.length + " (" + pk.map(function (p) {
            return String(p.tenant_id || "").replace(/^tnt-/, "") + " " + (p.pkey || "");
          }).join(" · ") + ")"
        : "P_Key 0 — 할당 테넌트 없음";
      return '<div class="ft-site">' +
        '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:9px">' +
        '<b style="color:#fff;font-size:12.5px">' + esc(siteKo[siteId] || siteId) + " — 독립 IB 패브릭</b>" +
        '<span style="color:var(--muted);font-size:10.5px">UFM 라이브 · 스위치 ' +
          fmt(s.spines.length + s.suOrder.reduce(function (a, su) { return a + s.sus[su].length; }, 0)) + "대</span>" +
        '<span style="margin-left:auto;color:var(--muted2);font-size:10px;font-family:Menlo,monospace">' + esc(pkLbl) + "</span></div>" +
        '<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin-bottom:9px"><span style="color:var(--muted2);font-size:9.5px;width:56px">스파인</span>' +
        s.spines.map(function (sw) {
          return '<span class="ft-sp ' + (sw.plane === "B" ? "b" : "") + obsFtSwState(sw.state) +
            '" data-obs-ftsw="' + esc(sw.guid || "") + '" title="' +
            esc(swTitle(sw) + " — 클릭 시 상세") + '">' + esc(sw.name || sw.guid || "—") + "</span>";
        }).join("") + "</div>" +
        s.suOrder.map(function (su) {
          var leafs = s.sus[su].slice().sort(planeSort);
          var h = "", prevPlane = null;
          leafs.forEach(function (sw) {
            if (prevPlane === "A" && sw.plane === "B")
              h += '<span style="width:10px;display:inline-block"></span>';
            prevPlane = sw.plane;
            h += '<span class="ftc ' + (sw.plane === "B" ? "b" : "") + obsFtSwState(sw.state) +
              '" data-obs-ftsw="' + esc(sw.guid || "") + '" title="' +
              esc(swTitle(sw) + " — 클릭 시 상세") + '"></span>';
          });
          return '<div class="ft-su"><span class="lb">' + esc(su) +
            '</span><span class="cells">' + h + "</span></div>";
        }).join("") +
        '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;font-size:10px;color:var(--muted)">' +
        '<span><span class="leg" style="background:#1c2f4a"></span> plane-A 리프</span>' +
        '<span><span class="leg" style="background:#2a2140"></span> plane-B 리프</span>' +
        '<span style="color:var(--amber)">□ degraded</span>' +
        '<span style="color:var(--red)">□ down</span></div></div>';
    }).join(""));
    /* 이상 링크 테이블 — UFM links (degraded | down) 실데이터 */
    setHtml("obs-ft-links", badLinks.map(function (l) {
      var st = l.state === "down"
        ? '<span class="st red">down</span>' : '<span class="st amber">degraded</span>';
      return "<tr>" +
        td('<span class="id" style="color:#fff">' + esc(l.link_id || "—") + "</span>") +
        td('<span style="color:var(--muted)">' + esc(l.src || "—") + " ↔ " + esc(l.dst || "—") +
          '</span><div style="color:var(--muted2);font-size:9.5px">plane ' + esc(l.plane || "?") +
          " · " + esc(l.su_id || "—") + " · " + esc(l.site || "—") + "</div>") +
        td(st + ' <span style="color:var(--muted);font-size:11px">BER ' + esc(String(l.ber != null ? l.ber : "—")) +
          " · SymbolErr " + esc(String(l.symbol_err_rate != null ? l.symbol_err_rate : "—")) + "</span>") +
        td(l.state === "down"
          ? '<span style="color:var(--red)">링크 다운 — 반대 plane 우회</span>'
          : '<span style="color:var(--amber)">가동 중 — 오류율 상승</span>') +
        td("flap " + obsNum(l.flaps_24h) + "회/24h", "num") +
        td('<span style="color:var(--green-text)">' +
          (l.state === "down" ? "케이블·포트 즉시 점검 — 정비 창 편성" : "추이 감시 · 임계 시 케이블 교체") +
          "</span>") + "</tr>";
    }).join("") || '<tr><td colspan="6" style="color:var(--green-text)">이상 링크 없음 — 전 링크 정상</td></tr>');
    setTxt("obs-ft-links-c", badLinks.length
      ? "이상 " + badLinks.length + "건 (degraded " + fmt(degr) + " · down " + fmt(down) + ") — UFM 라이브"
      : "이상 링크 없음 — UFM 라이브");
    /* NetQ — Ethernet 소패널 */
    obsFtNetqShow(true);
    var vList = obsFtList(valid, "checks");
    var vChips = vList.map(function (v) {
      var cls = v.result === "fail" ? "red" : v.result === "warn" ? "amber" : "green";
      return '<span class="st ' + cls + '" title="' + esc(v.detail || "") + '">' +
        esc(v.check || "—") + " · " + esc(v.result || "—") + "</span>";
    }).join(" ") || '<span style="color:var(--muted)">validation 응답 없음</span>';
    var swList = obsFtList(nqSw, "switches");
    var upN = swList.filter(function (s) {
      var st = String(s.state || s.status || "").toLowerCase();
      return st === "up" || st === "ok" || st === "active";
    }).length;
    var drops = 0;
    obsFtList(roce, "roce").forEach(function (x) {
      Object.keys(x || {}).forEach(function (k) {
        if (/drop/i.test(k) && typeof x[k] === "number") drops += x[k];
      });
    });
    setHtml("obs-ft-netq",
      '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' + vChips + "</div>" +
      '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:9px;font-size:11px;color:var(--muted)" class="tabnum">' +
      "<span>스위치 up <b style='color:#fff'>" + fmt(upN) + "</b> / " + fmt(swList.length) + "</span>" +
      "<span>RoCE 드롭 합계 <b style='color:" + (drops ? "var(--amber)" : "#fff") + "'>" + fmt(drops) + "</b></span>" +
      "<span>validation " + fmt(vList.length) + "건 (fail " +
        fmt(vList.filter(function (v) { return v.result === "fail"; }).length) + " · warn " +
        fmt(vList.filter(function (v) { return v.result === "warn"; }).length) + ")</span></div>" +
      /* 스위치 목록 칩 — 클릭 시 NetQ 스위치 상세 모달 */
      '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:9px">' +
      swList.map(function (s) {
        var st = String(s.state || s.status || "").toLowerCase();
        var cls = st === "down" ? " crit"
          : (st === "ok" || st === "up" || st === "active") ? "" : " warn";
        return '<span class="nq-swchip' + cls + '" data-obs-nqsw="' + esc(s.name || "") +
          '" title="' + esc((s.model || "—") + " · " + (s.os || "—") + " · if " +
            obsNum(s.interfaces_up) + "/" + obsNum(s.interfaces_total) + " — 클릭 시 상세") + '">' +
          esc(s.name || "—") + "</span>";
      }).join("") + "</div>");
  }

  /* ─ mock 폴백 — UFM/NetQ 미배포 시 기존 정적 토폴로지 유지 ─ */
  var OBS_FT_FAULTS = { "an:su-6:A:3": "warn", "ga:su-2:B:1": "watch" };
  var OBS_FT_SPFAULTS = { "an:A:2": "watch" };
  function obsFtMock() {
    obsSrc("obs-fabtopo", false, "◌ UFM 미연동 — mock");
    obsFtNetqShow(false);
    setHtml("obs-ft-kpi",
      kpiCell("IB 스위치", "192", "", kpiSub("리프 176 · 스파인 16 (2사이트)")) +
      kpiCell("활성 링크", "12,672", "green", kpiSub("가동률 99.98%")) +
      kpiCell("이상 링크", "3", "amber", kpiSub("warn 1 · watch 2 — 아래 표")) +
      kpiCell("flap (24h)", "2", "", kpiSub("an-leafA-su6-03:p14")) +
      kpiCell("rail 우회", "1", "amber", kpiSub("성능 영향 &lt;1% · rail-B 부담 +6%")) +
      kpiCell("예측 교체", "1", "amber", kpiSub("케이블 1 — 07-14 창 편성")));
    function cells(sk, su) {
      var h = "";
      ["A", "B"].forEach(function (rail) {
        for (var i = 0; i < 8; i++) {
          var fl = OBS_FT_FAULTS[sk + ":" + su + ":" + rail + ":" + i];
          var nm = su + " leaf" + rail + "-" + obsPad2(i);
          h += '<span class="ftc ' + (rail === "B" ? "b" : "") + (fl ? " " + fl : "") +
            '" data-obs-ftsw-mock="' + nm + '" title="' + nm +
            (fl === "warn" ? " — SymbolErr 증가 · flap 2회 · 케이블 열화 예측"
              : fl === "watch" ? " — 관찰 (RX power 저하)" : " — 정상") +
            ' · 클릭 시 상세 (데모)"></span>';
        }
        if (rail === "A") h += '<span style="width:10px;display:inline-block"></span>';
      });
      return h;
    }
    function spines(sk) {
      var h = "";
      ["A", "B"].forEach(function (rail) {
        for (var i = 0; i < 4; i++) {
          var fl = OBS_FT_SPFAULTS[sk + ":" + rail + ":" + i];
          h += '<span class="ft-sp ' + (rail === "B" ? "b" : "") + (fl ? " " + fl : "") +
            '" data-obs-ftsw-mock="' + (sk === "ga" ? "가산" : "안산") + " spine" + rail + "-" + i +
            '" title="' + (fl ? "CRC 산발 · BER 경계 — 관찰" : "정상") +
            ' · 클릭 시 상세 (데모)">' + rail + "-" + i + "</span>";
        }
      });
      return h;
    }
    var sites = [
      { k: "ga", nm: "가산", ufm: "ufm-ga (HA 이중화) — 정상", sus: ["su-1", "su-2", "su-3"], pk: "P_Key 3 (acme · beta · 예약)" },
      { k: "an", nm: "안산", ufm: "ufm-an (HA 이중화) — 정상", sus: ["su-4", "su-5", "su-6", "su-7", "su-8", "su-9", "su-10", "su-11"], pk: "P_Key 2 (fin-corp 0x8012 · gamma 예약 0x8014)" },
    ];
    setHtml("obs-ft-topo", sites.map(function (s) {
      return '<div class="ft-site">' +
        '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:9px">' +
        '<b style="color:#fff;font-size:12.5px">' + s.nm + " — 독립 IB 패브릭</b>" +
        '<span style="color:var(--muted);font-size:10.5px">' + s.ufm + "</span>" +
        '<span style="margin-left:auto;color:var(--muted2);font-size:10px;font-family:Menlo,monospace">' + s.pk + "</span></div>" +
        '<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin-bottom:9px"><span style="color:var(--muted2);font-size:9.5px;width:56px">스파인</span>' +
        spines(s.k) + "</div>" +
        s.sus.map(function (su) {
          return '<div class="ft-su"><span class="lb">' + su + '</span><span class="cells">' + cells(s.k, su) + "</span></div>";
        }).join("") +
        '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;font-size:10px;color:var(--muted)">' +
        '<span><span class="leg" style="background:#1c2f4a"></span> rail-A 리프 (8/SU)</span>' +
        '<span><span class="leg" style="background:#2a2140"></span> rail-B 리프 (8/SU)</span>' +
        '<span style="color:var(--amber)">□ warn (예측 포함)</span>' +
        '<span style="color:var(--amber)">╌ watch</span>' +
        '<span style="color:var(--red)">□ crit</span></div></div>';
    }).join(""));
    var links = [
      ["an-leafA-su6-03 : p14", "leaf ↔ host (su-6-rack-07 tray-02)",
       "SymbolErr 4.2e-6 ↑ (+38%/7d) · flap 2회/24h",
       '<span style="color:var(--amber)">rail-A 우회 중</span> — fin-corp 성능 영향 &lt;1%',
       '<b style="color:var(--amber)">14일 내 링크다운</b> · conf 0.74',
       "07-14 IB 창에 케이블 교체 편성 (CAB-89)"],
      ["ga-leafB-su2-01 : p07", "leaf ↔ host (su-2-rack-01 tray-08)",
       "RX power -1.8dBm 저하 — 광모듈 열화 의심",
       "영향 없음 — 정상 마진 내",
       "관찰 · conf 0.52",
       "예비 광모듈 확보됨 — 임계 도달 시 교체"],
      ["an-spineA-2 : p33", "spine ↔ leaf (su-9)",
       "CRC 오류 산발 — BER 1e-9 경계",
       "영향 없음 — ECMP 분산",
       "관찰 · conf 0.38",
       "추이 감시 · 재발 시 포트 이전"],
    ];
    setHtml("obs-ft-links", links.map(function (l) {
      return "<tr>" + td('<span class="id" style="color:#fff">' + l[0] + "</span>") +
        td('<span style="color:var(--muted)">' + l[1] + "</span>") + td(l[2]) + td(l[3]) + td(l[4]) +
        td('<span style="color:var(--green-text)">' + l[5] + "</span>") + "</tr>";
    }).join(""));
    setTxt("obs-ft-links-c", "이상 3건 · 예측 1건 — SymbolErr · BER · flap · 광모듈");
  }

  /* ─ 스위치 개별 장애 주입 (UFM /ufm/v1/faults · NetQ /netq/v1/faults) — 데모 ─
     냉각·DLC CDU 모달의 주입 버튼과 동일 톤 · 2단계 인라인 확인(obsCtlArmBtn 재사용).
     mock 폴백(에뮬레이터 미연동) 시 라벨된 데모 토스트로 응답 (무반응 금지). */
  var OBS_SWF_LBL = {
    switch_down: "스위치 다운", port_flap: "포트 flap", link_degrade: "링크 열화",
    bgp_flap: "BGP flap", link_down: "링크 다운", pfc_storm: "PFC 스톰",
    recover: "recover",
  };
  function obsSwFaultRow(kind, target) {
    function b(cls, act, lbl) {
      return '<button class="' + cls + ' obs-rcb" data-obs-swfault="' + act +
        '" data-swkind="' + kind + '" data-target="' + esc(target) +
        '" data-key="' + esc(kind + ":" + target + ":" + act) + '">' + lbl + "</button>";
    }
    var btns = kind === "ufm"
      ? b("btn-danger", "switch_down", "switch_down 주입") +
        b("btn-warn", "port_flap", "port_flap 주입") +
        b("btn-warn", "link_degrade", "link_degrade 주입") +
        b("btn", "recover", "recover — 정상 복귀")
      : b("btn-warn", "bgp_flap", "bgp_flap 주입") +
        b("btn-danger", "link_down", "link_down 주입") +
        b("btn-warn", "pfc_storm", "pfc_storm 주입") +
        b("btn", "recover", "recover — 정상 복귀");
    return '<div class="callout warn" style="margin-top:14px">장애 주입 — <b>데모 시나리오</b> (' +
      (kind === "ufm" ? "UFM" : "NetQ") + " Emulator twin 전용 · 실설비 아님) · 대상 <b>" +
      esc(target) + "</b> · 1차 클릭 후 3초 내 재클릭 시 실행</div>" +
      '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:8px">' + btns + "</div>";
  }
  function obsSwFaultRun(kind, action, target) {
    if (!target) return;
    var base = kind === "netq" ? "/netq/v1/faults/" : "/ufm/v1/faults/";
    var isRec = action === "recover";
    obsPost(base + (isRec ? "recover" : "inject"),
      isRec ? { target: target } : { kind: action, target: target }).then(function (r) {
      var live = r != null;
      NC.toast((isRec ? target + " recover — 정상 상태 복귀"
          : target + " " + action + " (" + (OBS_SWF_LBL[action] || action) + ") 주입") +
        " · 데모 시나리오" +
        (live ? " (" + (kind === "netq" ? "NetQ" : "UFM") + " twin 반영)"
              : " (mock — twin 미연동 · 실주입 없음)"),
        isRec ? undefined : "warn");
      if (!live) return;
      /* twin 반영 — UFM·NetQ 캐시 무효화 후 열린 모달 새로고침 + 화면 폴링 갱신 */
      obsClearCache("/ufm/");
      obsClearCache("/netq/");
      if (obsFtSwCur && obsFtSwCur.kind === "ufm") openObsFtSwModal(obsFtSwCur.id);
      else if (obsFtSwCur && obsFtSwCur.kind === "netq") openObsNqSwModal(obsFtSwCur.id);
      if (currentRoute() === "obs-fabtopo") renderObsFabTopo();
    });
  }

  /* ─ 스위치 상세 모달 (obs_ftsw) — UFM 스위치 · NetQ 스위치 · mock 데모 공용 ─ */
  var obsFtSwCur = null;   // {kind:"ufm"|"netq"|"mock", id}  — 새로고침 버튼용
  var OBS_FTSW_LOADING = '<div style="color:var(--muted);font-size:12px">불러오는 중…</div>';

  function obsFtPortSt(st) {
    var s = String(st || "").toLowerCase();
    return s === "active" || s === "up" || s === "ok"
      ? '<span class="st green">' + esc(st) + "</span>"
      : s === "down" ? '<span class="st red">down</span>'
      : '<span class="st amber">' + esc(st || "—") + "</span>";
  }
  function obsFtPortBad(st) {
    var s = String(st || "").toLowerCase();
    return !(s === "active" || s === "up" || s === "ok");
  }
  function obsFtStBadge(st) {
    return st === "down" ? '<span class="st red">down</span>'
      : st === "degraded" ? '<span class="st amber">degraded</span>'
      : '<span class="st green">' + esc(st || "ok") + "</span>";
  }

  /* (a) 상태 요약 + (b) 포트 테이블 + (c) 트래픽 요약 + (d) 관련 링크 */
  function obsFtSwBody(meta, ports, badLinks, demo) {
    meta = meta || {};
    var bad = ports.filter(function (p) { return obsFtPortBad(p.state); });
    var good = ports.filter(function (p) { return !obsFtPortBad(p.state); });
    good.sort(function (a, b) {
      return ((b.counters || {}).symbol_err || 0) - ((a.counters || {}).symbol_err || 0) ||
        (a.number || 0) - (b.number || 0);
    });
    var show = bad.concat(good.slice(0, Math.max(0, 14 - Math.min(bad.length, 14))));
    var tx = 0, rx = 0;
    ports.forEach(function (p) {
      tx += (p.counters || {}).tx_gbps || 0;
      rx += (p.counters || {}).rx_gbps || 0;
    });
    var name = meta.name || meta.guid || "—";
    var rel = (badLinks || []).filter(function (l) {
      return (String(l.src || "") + " " + String(l.dst || "") + " " + String(l.link_id || ""))
        .indexOf(name) >= 0;
    });
    return (demo ? '<div class="callout warn" style="margin-bottom:10px">UFM 미연동 — mock 데모 데이터 (실측 아님)</div>' : "") +
      '<table class="kv tabnum">' +
      "<tr><td>스위치 / GUID</td><td><b style='color:#fff'>" + esc(name) + "</b> · <span class='id' style='color:var(--muted2)'>" +
        esc(meta.guid || "—") + "</span></td></tr>" +
      "<tr><td>유형 / plane / state</td><td>" + esc(meta.type || "—") + " · plane " + esc(meta.plane || "?") +
        " · " + obsFtStBadge(meta.state) + "</td></tr>" +
      "<tr><td>위치</td><td>" + esc(meta.site || "—") + (meta.su_id ? " · " + esc(meta.su_id) : " · 스파인 계층") + "</td></tr>" +
      "<tr><td>모델 / FW</td><td>" + esc(meta.model || "—") + " · fw " + esc(meta.fw || "—") + "</td></tr>" +
      "<tr><td>온도 / 포트</td><td>" + obsN1(meta.temperature_c) + " °C · 활성 " +
        obsNum(meta.ports_active) + " / " + obsNum(meta.ports_total) + "</td></tr>" +
      "<tr><td>트래픽 합계</td><td>tx <b style='color:#fff'>" + fmt(Math.round(tx)) +
        "</b> · rx <b style='color:#fff'>" + fmt(Math.round(rx)) + "</b> Gbps (수집 " + fmt(ports.length) + "포트)</td></tr>" +
      "</table>" +
      '<div style="color:var(--muted);font-size:10.5px;font-weight:700;letter-spacing:.04em;margin:12px 0 5px">포트 — 이상 ' +
        fmt(bad.length) + " · 전체 " + fmt(ports.length) + " (이상 우선 · 표시 " + fmt(show.length) + ")</div>" +
      '<div style="overflow-x:auto;max-height:260px;overflow-y:auto"><table class="tbl">' +
      "<thead><tr><th>포트</th><th>state</th><th>peer</th><th class='num'>SymbolErr</th>" +
      "<th class='num'>down/recov</th><th class='num'>rcv_err</th><th class='num'>tx / rx Gbps</th></tr></thead><tbody>" +
      (show.map(function (p) {
        var c = p.counters || {};
        var isBad = obsFtPortBad(p.state);
        return '<tr style="' + (isBad ? "background:rgba(240,163,176,.06)" : "") + '">' +
          td('<span class="id" style="color:#fff">p' + obsPad2(p.number || 0) + "</span>" +
            '<div style="color:var(--muted2);font-size:9.5px">' + esc(p.speed || "—") + "</div>") +
          td(obsFtPortSt(p.state)) +
          td('<span class="id" style="color:var(--muted)">' + esc(p.peer || "—") + "</span>") +
          td((c.symbol_err || 0) ? '<b style="color:var(--amber)">' + fmt(c.symbol_err) + "</b>" : "0", "num") +
          td(fmt(c.link_downed || 0) + " / " + fmt(c.link_error_recovery || 0), "num") +
          td(fmt(c.rcv_errors || 0), "num") +
          td(obsN1(c.tx_gbps) + " / " + obsN1(c.rx_gbps), "num") + "</tr>";
      }).join("") || '<tr><td colspan="7" style="color:var(--muted)">포트 데이터 없음</td></tr>') +
      "</tbody></table></div>" +
      '<div style="color:var(--muted);font-size:10.5px;font-weight:700;letter-spacing:.04em;margin:12px 0 5px">관련 이상 링크 (UFM links)</div>' +
      (rel.length
        ? '<table class="tbl"><tbody>' + rel.map(function (l) {
            return "<tr>" +
              td('<span class="id" style="color:#fff">' + esc(l.link_id || "—") + "</span>") +
              td(l.state === "down" ? '<span class="st red">down</span>' : '<span class="st amber">degraded</span>') +
              td('<span style="color:var(--muted);font-size:11px">BER ' + esc(String(l.ber != null ? l.ber : "—")) +
                " · SymbolErr " + esc(String(l.symbol_err_rate != null ? l.symbol_err_rate : "—")) +
                " · flap " + obsNum(l.flaps_24h) + "회/24h</span>") + "</tr>";
          }).join("") + "</tbody></table>"
        : '<div style="color:var(--green-text);font-size:11.5px">관련 이상 링크 없음</div>');
  }

  function openObsFtSwModal(guid) {
    obsFtSwCur = { kind: "ufm", id: guid };
    setTxt("obs-ftsw-m-title", "IB 스위치 상세 — 조회 중");
    setHtml("obs-ftsw-m-body", OBS_FTSW_LOADING);
    NC.openModal("obs_ftsw");
    Promise.all([
      obsGet("/ufm/v1/resources/systems?site="),
      obsFetch("/ufm/v1/resources/ports?system_guid=" + encodeURIComponent(guid), { cache: "no-store" }),
      obsGet("/ufm/v1/resources/links?state=degraded"),
      obsGet("/ufm/v1/resources/links?state=down"),
    ]).then(function (r) {
      var meta = obsFtList(r[0], "systems").filter(function (s) { return s.guid === guid; })[0];
      var ports = obsFtList(r[1], "ports");
      if (!meta && !ports.length) {
        setTxt("obs-ftsw-m-title", "IB 스위치 상세");
        setHtml("obs-ftsw-m-body",
          '<div class="callout warn">UFM 응답 없음 — twin 재기동 중이거나 미연동. 잠시 후 새로고침.</div>');
        return;
      }
      setTxt("obs-ftsw-m-title", "IB 스위치 상세 — " + ((meta || {}).name || guid));
      setHtml("obs-ftsw-m-body", obsFtSwBody(meta || { guid: guid },
        ports, obsFtList(r[2], "links").concat(obsFtList(r[3], "links")), false) +
        obsSwFaultRow("ufm", guid));
    });
  }

  /* mock 폴백 — 정적 데모 팝업 (무반응 방지) */
  function openObsFtSwMockModal(label) {
    obsFtSwCur = { kind: "mock", id: label };
    var isSpine = label.indexOf("spine") >= 0;
    var meta = {
      name: label, guid: "0xDEMO-" + label.replace(/\s+/g, "-"),
      type: isSpine ? "spine" : "leaf", plane: /B/.test(label) ? "B" : "A",
      site: label.indexOf("가산") >= 0 || label.indexOf("su-1") >= 0 || label.indexOf("su-2") >= 0 ||
        label.indexOf("su-3") >= 0 ? "가산" : "안산",
      su_id: isSpine ? null : label.split(" ")[0],
      model: "Quantum-X800 Q3400", fw: "31.2014.2036",
      temperature_c: 46.5, ports_active: isSpine ? 96 : 74, ports_total: 144, state: "ok",
    };
    var ports = [
      { number: 1, state: "active", speed: "XDR 800G", peer: "spine-a-01",
        counters: { symbol_err: 0, link_error_recovery: 0, link_downed: 0, rcv_errors: 0, tx_gbps: 612.4, rx_gbps: 598.1 } },
      { number: 2, state: "active", speed: "XDR 800G", peer: "spine-a-02",
        counters: { symbol_err: 1, link_error_recovery: 0, link_downed: 0, rcv_errors: 0, tx_gbps: 401.2, rx_gbps: 388.7 } },
      { number: 7, state: "degraded", speed: "XDR 800G", peer: "host tray-04",
        counters: { symbol_err: 128, link_error_recovery: 2, link_downed: 0, rcv_errors: 3, tx_gbps: 96.3, rx_gbps: 88.0 } },
      { number: 12, state: "active", speed: "XDR 800G", peer: "host tray-08",
        counters: { symbol_err: 0, link_error_recovery: 0, link_downed: 0, rcv_errors: 0, tx_gbps: 512.9, rx_gbps: 520.4 } },
    ];
    setTxt("obs-ftsw-m-title", "IB 스위치 상세 — " + label + " (데모)");
    setHtml("obs-ftsw-m-body", obsFtSwBody(meta, ports, [], true) +
      obsSwFaultRow("ufm", label));
    NC.openModal("obs_ftsw");
  }

  /* NetQ 스위치 상세 — interfaces + protocols + roce 해당 행 */
  function openObsNqSwModal(name) {
    obsFtSwCur = { kind: "netq", id: name };
    setTxt("obs-ftsw-m-title", "NetQ 스위치 상세 — " + name);
    setHtml("obs-ftsw-m-body", OBS_FTSW_LOADING);
    NC.openModal("obs_ftsw");
    Promise.all([
      obsGet("/netq/v1/switches?site="),
      obsFetch("/netq/v1/interfaces?switch=" + encodeURIComponent(name), { cache: "no-store" }),
      obsGet("/netq/v1/protocols"),
      obsGet("/netq/v1/roce?site="),
    ]).then(function (r) {
      var meta = obsFtList(r[0], "switches").filter(function (s) { return s.name === name; })[0] || {};
      var ifs = obsFtList(r[1], "interfaces");
      var proto = obsFtList(r[2], "protocols").filter(function (p) { return p.switch === name; })[0];
      var roce = obsFtList(r[3], "roce").filter(function (p) { return p.switch === name; })[0];
      if (!ifs.length && !meta.name) {
        setHtml("obs-ftsw-m-body",
          '<div class="callout warn">NetQ 응답 없음 — 잠시 후 새로고침.</div>');
        return;
      }
      var bad = ifs.filter(function (p) { return obsFtPortBad(p.state); });
      var good = ifs.filter(function (p) { return !obsFtPortBad(p.state); });
      var show = bad.concat(good.slice(0, Math.max(0, 14 - Math.min(bad.length, 14))));
      var tx = 0, rx = 0;
      ifs.forEach(function (p) { tx += (p.counters || {}).tx_gbps || 0; rx += (p.counters || {}).rx_gbps || 0; });
      setHtml("obs-ftsw-m-body",
        '<table class="kv tabnum">' +
        "<tr><td>스위치 / state</td><td><b style='color:#fff'>" + esc(name) + "</b> · " +
          obsFtStBadge(meta.state) + "</td></tr>" +
        "<tr><td>모델 / OS / 역할</td><td>" + esc(meta.model || "—") + " · " + esc(meta.os || "—") +
          " · " + esc(meta.role || "—") + "</td></tr>" +
        "<tr><td>위치</td><td>" + esc(meta.site || "—") + (meta.su_id ? " · " + esc(meta.su_id) : "") +
          (meta.racks ? " · " + fmt(meta.racks) + "랙" : "") + "</td></tr>" +
        "<tr><td>인터페이스 / 온도</td><td>up " + obsNum(meta.interfaces_up) + " / " +
          obsNum(meta.interfaces_total) + " · " + obsN1(meta.temperature_c) + " °C</td></tr>" +
        "<tr><td>프로토콜 (NetQ)</td><td>" + (proto
          ? "BGP " + obsNum(proto.bgp_peers_up) + "/" + obsNum(proto.bgp_peers_total) +
            " · EVPN VNI " + obsNum(proto.evpn_vnis) + " · VXLAN 터널 " + obsNum(proto.vxlan_tunnels) +
            " · " + obsFtStBadge(proto.state)
          : muted("데이터 없음")) + "</td></tr>" +
        "<tr><td>RoCE</td><td>" + (roce
          ? "PFC pause rx/tx " + fmt(roce.pfc_pause_rx || 0) + "/" + fmt(roce.pfc_pause_tx || 0) +
            " · ECN " + fmt(roce.ecn_marked || 0) + " · 드롭 <b style='color:" +
            ((roce.drops || 0) ? "var(--amber)" : "#fff") + "'>" + fmt(roce.drops || 0) + "</b>"
          : muted("데이터 없음")) + "</td></tr>" +
        "<tr><td>트래픽 합계</td><td>tx <b style='color:#fff'>" + fmt(Math.round(tx)) +
          "</b> · rx <b style='color:#fff'>" + fmt(Math.round(rx)) + "</b> Gbps</td></tr>" +
        "</table>" +
        '<div style="color:var(--muted);font-size:10.5px;font-weight:700;letter-spacing:.04em;margin:12px 0 5px">인터페이스 — 이상 ' +
          fmt(bad.length) + " · 전체 " + fmt(ifs.length) + " (이상 우선 · 표시 " + fmt(show.length) + ")</div>" +
        '<div style="overflow-x:auto;max-height:260px;overflow-y:auto"><table class="tbl">' +
        "<thead><tr><th>인터페이스</th><th>state</th><th>peer</th><th class='num'>MTU</th>" +
        "<th class='num'>rx_err / tx_drop</th><th class='num'>carrier</th><th class='num'>tx / rx Gbps</th></tr></thead><tbody>" +
        (show.map(function (p) {
          var c = p.counters || {};
          var isBad = obsFtPortBad(p.state);
          return '<tr style="' + (isBad ? "background:rgba(240,163,176,.06)" : "") + '">' +
            td('<span class="id" style="color:#fff">' + esc(p.interface || "—") + "</span>" +
              '<div style="color:var(--muted2);font-size:9.5px">' + esc(p.speed || "—") + "</div>") +
            td(obsFtPortSt(p.state)) +
            td('<span class="id" style="color:var(--muted)">' + esc(p.peer || "—") + "</span>") +
            td(fmt(p.mtu || 0), "num") +
            td(fmt(c.rx_errors || 0) + " / " + fmt(c.tx_drops || 0), "num") +
            td(fmt(c.carrier_transitions || 0), "num") +
            td(obsN1(c.tx_gbps) + " / " + obsN1(c.rx_gbps), "num") + "</tr>";
        }).join("") || '<tr><td colspan="7" style="color:var(--muted)">인터페이스 데이터 없음</td></tr>') +
        "</tbody></table></div>" +
        obsSwFaultRow("netq", name));
    });
  }

  /* ─ 크로스 상관 체인 상세 ─ */
  function obsFabChain(rows) {
    var f = rows && rows[0];
    var cdu = f && f.cdu_id ? f.cdu_id : "cdu-su-5";
    var racks = f && (f.affected_racks || []).length ? f.affected_racks : ["su-5-rack-03", "su-5-rack-07", "su-5-rack-11"];
    var gpus = f && f.affected_gpus != null ? f.affected_gpus : 18;
    function stg(dom, col, m, v, t, s) {
      return '<div class="stg"><div class="d" style="color:' + col + '">' + dom +
        ' <span style="color:var(--muted2);font-weight:400;float:right">' + t + "</span></div>" +
        '<div class="m">' + m + '</div><div class="v">' + v + '</div><div class="s">' + s + "</div></div>";
    }
    var arr = '<span class="arr">→</span>';
    setHtml("obs-fab-chain",
      '<div style="color:var(--muted);font-size:11px;margin-bottom:10px">' +
      (f ? "활성 체인 — " + esc(f.finding || "냉각발 성능 저하") + " (룰 R13)"
         : "세션 내 활성 체인 없음 — 최근 확정 사례 표시 (R13 · 07-08 06:12 발생분)") + "</div>" +
      '<div class="chain">' +
      stg("COOLING", "#5ad0c8", esc(cdu) + " 2차측 유량 저하", "-8.2% (840→771 LPM)", "T+0s",
        "CDM 밸브 개도 불변 — 펌프측 원인 추정 · 누수 0건") + arr +
      stg("RACK", "var(--amber)", racks.length + "개 랙 inlet 상승", "+1.9°C (10분 창)", "T+118s",
        esc(racks.join(" · "))) + arr +
      stg("GPU", "var(--red)", "고온 → thermal throttle", fmt(gpus) + "기 · 최고 84.1°C", "T+241s",
        "HW_SLOWDOWN · SM clock 1,410→980MHz") + arr +
      stg("FABRIC", "#9fd0ff", "집합통신 지연 전파", "NCCL allreduce p99 +9%", "T+299s",
        "leaf 트래픽 재조정 · 링크다운 없음 — straggler 효과") + arr +
      stg("TENANT", "#c8a5e8", "fin-corp 성능 저하", "MFU -4.1pp · goodput -2.8%", "T+310s",
        "가용성 미차감 — 성능 SLA 협의 대상 기록") + "</div>" +
      '<div class="grid" style="margin-top:14px">' +
      '<div><div style="color:var(--muted);font-size:10.5px;font-weight:700;letter-spacing:.04em;margin-bottom:5px">R13 신뢰도 구성 — conf 0.91</div>' +
      '<div class="evrow"><span class="lb">시간 순서 정합 (유량→온도→throttle)</span><i><b style="width:28%"></b></i><em>0.28</em></div>' +
      '<div class="evrow"><span class="lb">유량–온도 상관 r = -0.81</span><i><b style="width:26%"></b></i><em>0.26</em></div>' +
      '<div class="evrow"><span class="lb">공간 일치 — 동일 CDU 배관 계통</span><i><b style="width:22%"></b></i><em>0.22</em></div>' +
      '<div class="evrow"><span class="lb">반증 부재 — 전력캡 · 워크로드 불변</span><i><b style="width:15%"></b></i><em>0.15</em></div></div>' +
      '<div><div style="color:var(--muted);font-size:10.5px;font-weight:700;letter-spacing:.04em;margin-bottom:5px">자동 그룹화 · 권고</div>' +
      '<div style="font-size:11px;color:var(--muted);line-height:1.8">' +
      '이 체인으로 <b style="color:#fff">GPU 고온 14 · 스로틀 6 · inlet 3건</b>이 1개 인시던트로 억제됨 — 개별 페이징 없음<br>' +
      '권고: <b style="color:var(--green-text)">standby 펌프 전환 (무중단 · N+1)</b> → 실패 시 워크로드 마이그레이션 (su-5-r03 우선)<br>' +
      '연계: 패브릭 측 이상 없음 확인됨 (GPU 패브릭 화면) · SLO 영향은 SLA · Error Budget 화면에 자동 집계</div></div></div>');
  }

  /* ── ⑱ SLA · Error Budget ─────────────────────────────── */
  function renderObsSlo() {
    obsGet("/slo").then(function (d) {
      var live = !!(d && d.tenants);
      var ts = live ? d.tenants || [] : obsMockSlo().tenants;
      obsSrc("obs-slo", live);
      var worst = null, breach = 0, coolMin = 0, thrMin = 0;
      ts.forEach(function (t) {
        if (t.error_budget_remaining_pct != null &&
            (!worst || t.error_budget_remaining_pct < worst.error_budget_remaining_pct)) worst = t;
        if (t.gpu_availability_pct != null && t.slo_target_pct != null &&
            t.gpu_availability_pct < t.slo_target_pct) breach++;
        coolMin += t.cooling_caused_unavail_min || 0;
        thrMin += t.throttling_min || 0;
      });
      setHtml("obs-slo-kpi",
        kpiCell("테넌트", fmt(ts.length), "", kpiSub("SLO 관리 대상")) +
        kpiCell("SLO 위반", fmt(breach), breach ? "red" : "green",
          kpiSub(breach ? "즉시 대응 필요" : "전 테넌트 목표 준수")) +
        kpiCell("최저 에러버짓", worst ? obsN1(worst.error_budget_remaining_pct) + "<small>%</small>" : "—",
          worst && worst.error_budget_remaining_pct < 30 ? "amber" : "green",
          kpiSub(worst ? esc(worst.tenant_id || "—") : "—")) +
        kpiCell("냉각 기인 불가용", fmt(coolMin) + "<small> 분</small>", coolMin ? "amber" : "green",
          kpiSub("30d 누적 · 전 테넌트")) +
        kpiCell("스로틀 시간", fmt(thrMin) + "<small> 분</small>", "",
          kpiSub("성능 저하 (가용성 미차감)")));
      setHtml("obs-slo-body", ts.map(function (t) {
        var eb = t.error_budget_remaining_pct;
        var ebCol = eb == null ? "var(--muted)" : eb < 20 ? "var(--red)" :
          eb < 50 ? "var(--amber)" : "var(--green)";
        var br = t.burn_rate;
        var avail = t.gpu_availability_pct, tgt = t.slo_target_pct;
        var ok = avail == null || tgt == null || avail >= tgt;
        return "<tr>" +
          td("<b>" + esc(t.tenant_id || "—") + "</b>") +
          td(obsNum(t.contracted_gpus), "num") +
          td(obsNum(t.available_gpus), "num") +
          td('<span style="color:' + (ok ? "var(--green-text)" : "var(--red)") +
            ';font-weight:700">' + (avail != null ? (+avail).toFixed(2) : "—") + "%</span>", "num") +
          td((tgt != null ? (+tgt).toFixed(2) : "—") + "%", "num") +
          td('<span class="pb" style="width:110px"><span style="width:' +
            Math.max(0, Math.min(100, eb || 0)) + "%;background:" + ebCol +
            '"></span></span> <span style="font-weight:700;color:' + ebCol + '">' +
            obsN1(eb) + "%</span>") +
          td('<span style="color:' + (br != null && br > 2 ? "var(--red)" :
            br != null && br > 1 ? "var(--amber)" : "var(--green-text)") +
            ';font-weight:700">' + obsN1(br) + "×</span>", "num") +
          td(obsNum(t.cooling_caused_unavail_min), "num") +
          td(obsNum(t.throttling_min), "num") + "</tr>";
      }).join("") || '<tr><td colspan="9" style="color:var(--muted)">테넌트 없음</td></tr>');
      setTxt("obs-slo-c", "테넌트 " + ts.length + " · 30d 윈도우" + (live ? " (twin 라이브)" : " (mock)"));
    });
  }

  /* ── ⑲ 알림 · 이벤트 ───────────────────────────────────── */
  function renderObsAlerts() {
    obsGet("/alerts?limit=100").then(function (d) {
      var live = Array.isArray(d);
      var full = live ? d : obsMockAlerts();
      obsSrc("obs-alerts", live);
      var f = obsAlertFilter;
      var list = full.filter(function (a) {
        if (f.domain && a.domain !== f.domain) return false;
        if (f.sev && a.severity !== f.sev) return false;
        return true;
      });
      list.sort(function (a, b) {
        var fa = a.state === "firing" ? 0 : 1, fb = b.state === "firing" ? 0 : 1;
        if (fa !== fb) return fa - fb;
        return String(b.at || "").localeCompare(String(a.at || ""));
      });
      setHtml("obs-alerts-body", list.map(obsAlertRow).join("") ||
        '<tr><td colspan="6" style="color:var(--muted)">조건에 맞는 알림 없음</td></tr>');
      var firing = list.filter(function (a) { return a.state === "firing"; }).length;
      setTxt("obs-alerts-c", "firing " + firing + " · 표시 " + list.length +
        "건 · 5s 자동 갱신" + (live ? "" : " (mock)"));
      obsUpdateAlertBadge(full);
    });
  }

  /* ── ⑳ 트레이 수명주기 (obs-trayops) — 재기동·HW 교체 파이프라인 ──
     GET  /emulator/v1/obs/tray-ops → {inflight, history, kpi}
     POST /emulator/v1/trayops/{tray_id}/reboot | /replace
     twin 미배포 시 mock 폴백(대표 데이터) + 로컬 데모 진행. */
  var obsToMockInflight = [];   // mock 트리거 로컬 진행 {tray_id, op, tenant_id, t0}
  var obsToMockHist = [];       // mock 로컬 완료 이력
  var OBS_TO_TPL = {            // [단계명, 데모 소요 s | null=skip]
    reboot: [["전원 재기동", 18], ["Discovery", 42], ["IP 할당", 8],
             ["OS 설치", null], ["테넌트 재조인", 63]],
    replace: [["트레이 교체 검증", 25], ["Discovery", 48], ["IP 할당", 9],
              ["OS 설치", 176], ["테넌트 재조인", 71]],
  };
  function obsToOpLbl(op) {
    return op === "replace" ? "HW 교체" : op === "reboot" ? "재기동" : esc(op || "—");
  }
  function obsToOpChip(op) {
    return op === "replace"
      ? '<span class="st amber">HW 교체</span>'
      : op === "reboot" ? '<span class="st blue">재기동</span>'
      : '<span class="st gray">' + esc(op || "—") + "</span>";
  }
  function obsToFmtS(v) {
    if (v == null || isNaN(+v)) return "—";
    v = Math.round(+v);
    return v >= 60 ? Math.floor(v / 60) + "m " + (v % 60 < 10 ? "0" : "") + (v % 60) + "s" : v + "s";
  }
  /* history.stage_durations{} 키명 계약 편차 흡수 — 정규식 매칭 */
  function obsToSd(sd, re) {
    sd = sd || {};
    var ks = Object.keys(sd);
    for (var i = 0; i < ks.length; i++) if (re.test(ks[i])) return sd[ks[i]];
    return null;
  }
  function obsToMockTenant(tid) {
    var m = /^(su-\d+)/.exec(String(tid || ""));
    var su = OBS_SUS.filter(function (s) { return m && s[1] === m[1]; })[0];
    return (su && su[3]) || null;
  }
  /* 로컬 트리거 진행 계산 — 완료 시 이력으로 이동 */
  function obsToMockRow(t) {
    var tpl = OBS_TO_TPL[t.op] || OBS_TO_TPL.reboot;
    var el = Math.round((Date.now() - t.t0) / 1000);
    var acc = 0, stages = [], curName = null, curIdx = -1;
    tpl.forEach(function (s, i) {
      if (s[1] == null) { stages.push({ name: s[0], status: "skipped", duration_s: null }); return; }
      var st = el >= acc + s[1] ? "done" : el >= acc ? "running" : "pending";
      if (st === "running") { curName = s[0]; curIdx = i; }
      stages.push({ name: s[0], status: st, duration_s: st === "done" ? s[1] : null });
      acc += s[1];
    });
    if (el >= acc) {                       // 완료 → 이력 편입 (1회)
      if (!t.archived) {
        t.archived = true;
        obsToMockHist.unshift({
          tray_id: t.tray_id, op: t.op, tenant_id: t.tenant_id, total_s: acc,
          stage_durations: {
            discovery: tpl[1][1], ip: tpl[2][1],
            os_install: tpl[3][1] || 0, rejoin: tpl[4][1],
          },
          succeeded: true,
          at: new Date().toISOString().slice(0, 16).replace("T", " "),
        });
      }
      return null;
    }
    return { tray_id: t.tray_id, op: t.op, tenant_id: t.tenant_id,
      stage: curName, stage_idx: curIdx, stages: stages, elapsed_s: el };
  }
  function obsMockTrayOpsData() {
    var inflight = obsToMockInflight.map(obsToMockRow).filter(Boolean);
    inflight.push({                        // 대표 표본 — 항상 1건 표시 (mock)
      tray_id: "su-6-rack-07-tray-02", op: "replace", tenant_id: "fin-corp",
      stage: "OS 설치", stage_idx: 3,
      stages: [
        { name: "트레이 교체 검증", status: "done", duration_s: 25 },
        { name: "Discovery", status: "done", duration_s: 48 },
        { name: "IP 할당", status: "done", duration_s: 9 },
        { name: "OS 설치", status: "running", duration_s: null },
        { name: "테넌트 재조인", status: "pending", duration_s: null },
      ],
      elapsed_s: 141,
    });
    var history = obsToMockHist.concat([
      { tray_id: "su-5-rack-03-tray-11", op: "replace", tenant_id: "fin-corp", total_s: 322,
        stage_durations: { discovery: 51, ip: 9, os_install: 181, rejoin: 74 },
        succeeded: true, at: "2026-07-13 22:41" },
      { tray_id: "su-1-rack-04-tray-02", op: "reboot", tenant_id: "acme-ai", total_s: 138,
        stage_durations: { discovery: 41, ip: 8, os_install: 0, rejoin: 62 },
        succeeded: true, at: "2026-07-13 18:07" },
      { tray_id: "su-2-rack-01-tray-08", op: "reboot", tenant_id: "beta-ai", total_s: 131,
        stage_durations: { discovery: 39, ip: 7, os_install: 0, rejoin: 58 },
        succeeded: true, at: "2026-07-13 11:32" },
      { tray_id: "su-9-rack-02-tray-05", op: "replace", tenant_id: null, total_s: 301,
        stage_durations: { discovery: 47, ip: 9, os_install: 172, rejoin: null },
        succeeded: false, at: "2026-07-12 20:15" },
      { tray_id: "su-5-rack-07-tray-14", op: "reboot", tenant_id: "fin-corp", total_s: 142,
        stage_durations: { discovery: 44, ip: 8, os_install: 0, rejoin: 64 },
        succeeded: true, at: "2026-07-12 09:48" },
    ]);
    return { inflight: inflight, history: history,
      kpi: { ops_24h: 14, reboots: 9, replacements: 5, avg_discovery_s: 44,
        avg_ip_s: 8, avg_os_install_s: 176, avg_rejoin_s: 63, avg_total_s: 291,
        rejoin_success_pct: 97.8,
        /* 신계약 미러 — 재기동 vs 교체 구분 KPI (교체는 OS 전체 재설치 포함) */
        reboot: { count: 9, avg_total_s: 138 },
        replace: { count: 5, avg_drain_s: 34, avg_hw_swap_s: 412, avg_discovery_s: 48,
          avg_os_install_s: 176, avg_rejoin_s: 71, avg_total_s: 749, success_pct: 98.1 } } };
  }
  /* 재기동 vs 교체 구분 KPI — kpi.reboot/kpi.replace (신계약) · 없으면 legacy flat */
  function obsToOpKpi(k) {
    var box = document.getElementById("obs-to-opkpi");
    if (!box) return false;
    var rep = k.replace, rb = k.reboot;
    if (!rep && !rb) { box.innerHTML = ""; box.style.display = "none"; return false; }
    box.style.display = "flex";
    function grp(title, sub, inner) {
      return '<div class="sub" style="flex:1 1 auto;min-width:230px">' +
        '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px">' +
        '<b style="color:#fff;font-size:12px">' + title + "</b>" +
        '<span style="color:var(--muted2);font-size:10px">' + sub + "</span></div>" +
        inner + "</div>";
    }
    var rbCnt = rb && rb.count != null ? rb.count : (k.reboots || 0);
    var rbHtml = '<div class="kpi-band" style="margin-bottom:0">' +
      kpiCell("건수 (24h)", fmt(rbCnt), "", kpiSub("전원 재기동")) +
      kpiCell("재기동 MTTR", obsToFmtS(rb && rb.avg_total_s), "green",
        kpiSub("OS 재설치 없음 — 부팅·재조인만")) + "</div>";
    var repHtml;
    if (!rep || !rep.count) {
      repHtml = '<div style="color:var(--muted);font-size:12px;padding:16px 4px;text-align:center">' +
        "교체 이력 없음 (24h)</div>";
    } else {
      var slower = rb && rb.avg_total_s != null && rep.avg_total_s != null &&
        rep.avg_total_s > rb.avg_total_s;
      var osHeavy = rep.avg_os_install_s != null && rep.avg_total_s
        ? rep.avg_os_install_s / rep.avg_total_s >= 0.3 : false;
      repHtml = '<div class="kpi-band" style="margin-bottom:0">' +
        kpiCell("건수 (24h)", fmt(rep.count), "", kpiSub("HW 교체")) +
        kpiCell("drain", obsToFmtS(rep.avg_drain_s), "", kpiSub("워크로드 드레인")) +
        kpiCell("HW swap", obsToFmtS(rep.avg_hw_swap_s), "", kpiSub("물리 트레이 교체")) +
        kpiCell("Discovery", obsToFmtS(rep.avg_discovery_s), "", kpiSub("NICo 재발견")) +
        kpiCell("OS 재설치", obsToFmtS(rep.avg_os_install_s), osHeavy ? "amber" : "",
          kpiSub("전체 재설치 — 교체 고유 단계")) +
        kpiCell("재조인", obsToFmtS(rep.avg_rejoin_s), "", kpiSub("P_Key · 스토리지")) +
        kpiCell("교체 MTTR", obsToFmtS(rep.avg_total_s), slower ? "amber" : "green",
          kpiSub(slower && rb && rb.avg_total_s
            ? "재기동 대비 ×" + (rep.avg_total_s / rb.avg_total_s).toFixed(1) +
              " — OS 재설치 포함"
            : "시작 → 재조인 완료")) +
        kpiCell("성공률", obsN1(rep.success_pct) + "<small>%</small>",
          rep.success_pct != null && rep.success_pct < 95 ? "amber" : "green",
          kpiSub("교체 작업 기준")) + "</div>";
    }
    box.innerHTML =
      grp("재기동 (Reboot)", "kpi.reboot", rbHtml) +
      grp("HW 교체 (Replace)", "kpi.replace — OS 전체 재설치 포함", repHtml);
    return true;
  }
  /* 단계 스텝퍼 — done green · running amber · pending muted · skipped 점선 */
  function obsToStepper(stages) {
    return '<span class="to-steps">' + (stages || []).map(function (s, i) {
      var st = s.status === "done" ? "done" : s.status === "running" ? "run"
        : s.status === "skipped" ? "skip" : "";
      return (i ? '<span class="to-bar' +
          (s.status === "done" ? " done" : "") + '"></span>' : "") +
        '<span class="to-step ' + st + '" title="' + esc((s.name || "") + " — " +
          (s.status || "pending") +
          (s.duration_s != null ? " · " + obsToFmtS(s.duration_s) : "")) +
        '"><span class="nd"></span>' + esc(s.name || "") +
        (s.status === "done" && s.duration_s != null ? " " + obsToFmtS(s.duration_s) : "") +
        (s.status === "skipped" ? " (생략)" : "") + "</span>";
    }).join("") + "</span>";
  }
  function renderObsTrayOps(cb) {
    obsFetch("/tray-ops", { cache: "no-store" }).then(function (d) {
      var live = !!(d && (d.inflight || d.history || d.kpi));
      var v = live ? d : obsMockTrayOpsData();
      obsSrc("obs-trayops", live);
      var k = v.kpi || {};
      var split = obsToOpKpi(k);   // 신계약: 재기동/교체 그룹 — true면 공통 KPI 축약
      var common =
        kpiCell("작업 (24h)", obsNum(k.ops_24h), "",
          kpiSub("재기동 " + obsNum(k.reboot && k.reboot.count != null ? k.reboot.count : k.reboots) +
            " · 교체 " + obsNum(k.replace && k.replace.count != null ? k.replace.count : k.replacements))) +
        kpiCell("재조인 성공률", obsN1(k.rejoin_success_pct) + "<small>%</small>",
          k.rejoin_success_pct != null && k.rejoin_success_pct < 95 ? "amber" : "green",
          kpiSub("24h 완료 작업 기준"));
      setHtml("obs-to-kpi", split
        ? common +
          kpiCell("평균 Discovery", obsToFmtS(k.avg_discovery_s), "",
            kpiSub("전 작업 공통 단계")) +
          kpiCell("평균 재조인", obsToFmtS(k.avg_rejoin_s), "",
            kpiSub("P_Key · 스토리지 재바인딩"))
        : common +
          kpiCell("평균 Discovery", obsToFmtS(k.avg_discovery_s), "",
            kpiSub("NICo 재발견")) +
          kpiCell("평균 IP 할당", obsToFmtS(k.avg_ip_s), "",
            kpiSub("언더레이 · DHCP")) +
          kpiCell("평균 OS 설치", obsToFmtS(k.avg_os_install_s), "",
            kpiSub("이미지 프로비저닝")) +
          kpiCell("평균 재조인", obsToFmtS(k.avg_rejoin_s), "",
            kpiSub("P_Key · 스토리지 재바인딩")) +
          kpiCell("MTTR (avg_total)", obsToFmtS(k.avg_total_s),
            k.avg_total_s != null && k.avg_total_s > 600 ? "amber" : "green",
            kpiSub("시작 → 재조인 완료")));
      var inf = v.inflight || [];
      setHtml("obs-to-inflight", inf.map(function (t) {
        return "<tr>" +
          td('<span class="id" style="color:#fff">' + esc(t.tray_id || "—") + "</span>") +
          td(obsToOpChip(t.op)) +
          td('<span class="id" style="color:var(--muted)">' + esc(t.tenant_id || "—") + "</span>") +
          td(obsToStepper(t.stages) +
            (t.stage ? '<div style="color:var(--amber);font-size:9.5px;margin-top:3px">현재: ' +
              esc(t.stage) + "</div>" : "")) +
          td('<span class="tabnum" style="color:var(--soft);font-weight:700">' +
            obsToFmtS(t.elapsed_s) + "</span>", "num") + "</tr>";
      }).join("") || '<tr><td colspan="5" style="color:var(--muted)">진행 중 작업 없음</td></tr>');
      setTxt("obs-to-inflight-c", inf.length
        ? "진행 " + inf.length + "건 · 3s 폴링" + (live ? " (twin 라이브)" : " (mock)")
        : "진행 중 작업 없음 · 5s 폴링" + (live ? " (twin 라이브)" : " (mock)"));
      var hist = (v.history || []).slice(0, 12);
      setHtml("obs-to-hist", hist.map(function (hrow) {
        var sd = hrow.stage_durations || {};
        return "<tr>" +
          td('<span class="id" style="color:#fff">' + esc(hrow.tray_id || "—") + "</span>" +
            '<div style="color:var(--muted2);font-size:9.5px">' + esc(hrow.at || "—") + "</div>") +
          td(obsToOpChip(hrow.op)) +
          td('<span class="id" style="color:var(--muted)">' + esc(hrow.tenant_id || "—") + "</span>") +
          td(obsToFmtS(obsToSd(sd, /disc/i)), "num") +
          td(obsToFmtS(obsToSd(sd, /dhcp|(^|_)ip(_|$)|assign/i)), "num") +
          td(obsToFmtS(obsToSd(sd, /os_install|pxe|image|(^|_)os(_|$)/i)), "num") +
          td(obsToFmtS(obsToSd(sd, /rejoin|join/i)), "num") +
          td('<b class="tabnum" style="color:#fff">' + obsToFmtS(hrow.total_s) + "</b>", "num") +
          td(hrow.succeeded === false
            ? '<span class="st red">실패</span>'
            : '<span class="st green">성공</span>') + "</tr>";
      }).join("") || '<tr><td colspan="9" style="color:var(--muted)">이력 없음</td></tr>');
      setTxt("obs-to-hist-c", "최근 " + hist.length + "건" + (live ? " (twin 라이브)" : " (mock 대표 데이터)"));
      if (cb) cb(inf.length > 0);
    });
  }
  /* 적응 폴링 — 진행 중 3s · 유휴 5s (화면 활성 시에만) */
  function obsTrayPoll() {
    if (obsTimer) { clearInterval(obsTimer); obsTimer = null; }
    (function tick() {
      if (currentRoute() !== "obs-trayops") { obsTimer = null; return; }
      renderObsTrayOps(function (busy) {
        if (currentRoute() !== "obs-trayops") return;
        obsTimer = setTimeout(tick, busy ? 3000 : 5000);
      });
    })();
  }
  function obsTrayOpRun(tid, op) {
    obsPost("/emulator/v1/trayops/" + encodeURIComponent(tid) + "/" + op, {})
      .then(function (r) {
        var live = r != null && !(r && r.detail === "Not Found");
        if (live) {
          NC.toast(tid + " " + obsToOpLbl(op) + " 시작 — 테넌트 워크로드 중단 · 데모 (twin 반영)", "warn");
        } else {
          obsToMockInflight.push({ tray_id: tid, op: op,
            tenant_id: obsToMockTenant(tid), t0: Date.now() });
          NC.toast(tid + " " + obsToOpLbl(op) + " 시작 — 데모 (twin 미연동 · mock 로컬 진행)", "warn");
        }
        renderObsTrayOps();
      });
  }

  /* ── obs 액션 (전용 data-obs-* 속성 — 기존 data-act와 분리) ── */
  document.addEventListener("click", function (e) {
    var swf = e.target.closest("[data-obs-swfault]");   // 스위치 장애 주입 (모달)
    if (swf) {
      var swAct = swf.dataset.obsSwfault;
      var swWarn = swAct === "recover" ? "확인 — 원복 실행"
        : swAct === "switch_down" || swAct === "link_down"
          ? "확인 — 다운 주입 · 테넌트 영향 (데모)"
          : "확인 — 장애 주입 (데모)";
      if (!obsCtlArmBtn(swf, swf.dataset.key, swWarn)) return;
      obsSwFaultRun(swf.dataset.swkind, swAct, swf.dataset.target);
      return;
    }
    var top = e.target.closest("[data-obs-trayop]");    // 트레이 수명주기 데모 트리거
    if (top) {
      var toInp = document.getElementById("obs-to-tray");
      var toId = ((toInp || {}).value || "").trim();
      if (!toId) {
        NC.toast("tray_id를 입력하세요 — 예: su-1-rack-00-tray-05", "warn");
        return;
      }
      var toOp = top.dataset.obsTrayop;
      if (!obsCtlArmBtn(top, "trayop:" + toOp + ":" + toId,
        toOp === "replace" ? "확인 — HW 교체 · 테넌트 워크로드 중단"
                           : "확인 — 재기동 · 테넌트 워크로드 중단")) return;
      obsTrayOpRun(toId, toOp);
      return;
    }
    var g = e.target.closest("[data-obs-gpu]");
    if (g) { openObsGpuModal(g.dataset.obsGpu); return; }
    var fsw = e.target.closest("[data-obs-ftsw]");           // UFM 스위치 (spine 칩·leaf 셀)
    if (fsw) { openObsFtSwModal(fsw.dataset.obsFtsw); return; }
    var fswm = e.target.closest("[data-obs-ftsw-mock]");     // mock 폴백 데모 팝업
    if (fswm) { openObsFtSwMockModal(fswm.dataset.obsFtswMock); return; }
    var nqsw = e.target.closest("[data-obs-nqsw]");          // NetQ 스위치 칩
    if (nqsw) { openObsNqSwModal(nqsw.dataset.obsNqsw); return; }
    var fswr = e.target.closest("#obs-ftsw-refresh");        // 스위치 모달 새로고침
    if (fswr) {
      if (obsFtSwCur && obsFtSwCur.kind === "ufm") openObsFtSwModal(obsFtSwCur.id);
      else if (obsFtSwCur && obsFtSwCur.kind === "netq") openObsNqSwModal(obsFtSwCur.id);
      else if (obsFtSwCur) openObsFtSwMockModal(obsFtSwCur.id);
      return;
    }
    var rb = e.target.closest("[data-obs-rctl]");        // 랙 일괄 제어 툴바
    if (rb) { obsRackCtlClick(rb, null); return; }
    var rb1 = e.target.closest("[data-obs-rctl1]");      // 단일 랙 제어 (상세)
    if (rb1) { obsRackCtlClick(rb1, rb1.dataset.rack); return; }
    var hs = e.target.closest("[data-obs-gpusu]");
    if (hs) {
      obsGpuFilter.su = obsGpuFilter.su === hs.dataset.obsGpusu ? "" : hs.dataset.obsGpusu;
      var suSel = document.getElementById("obs-gf-su");
      if (suSel) suSel.value = obsGpuFilter.su;
      obsGpuFilter.offset = 0;
      renderObsGpu();
      return;
    }
    var at = e.target.closest("#obs-gf-attn");
    if (at) {
      obsGpuFilter.attn = !obsGpuFilter.attn;
      at.classList.toggle("on", obsGpuFilter.attn);
      obsGpuFilter.offset = 0;
      renderObsGpu();
      return;
    }
    var rc = e.target.closest("[data-obs-rack]");
    if (rc) {
      obsRackSel = obsRackSel === rc.dataset.obsRack ? null : rc.dataset.obsRack;
      renderObsRack();
      return;
    }
    var inj = e.target.closest("[data-obs-inject]");
    if (inj) { obsInject(inj.dataset.cdu, inj.dataset.obsInject); return; }
    var rec = e.target.closest("[data-obs-recover]");
    if (rec) { obsInject(rec.dataset.cdu, "recover"); return; }
    var cd = e.target.closest("[data-obs-cdu]");
    if (cd) { openObsCduModal(cd.dataset.obsCdu); return; }
    var pg = e.target.closest("[data-obs-page]");
    if (pg) {
      if (pg.dataset.obsPage === "prev") {
        obsGpuFilter.offset = Math.max(0, obsGpuFilter.offset - OBS_PAGE);
      } else if (obsGpuFilter.offset + OBS_PAGE < obsGpuTotal) {
        obsGpuFilter.offset += OBS_PAGE;
      }
      renderObsGpu();
      return;
    }
    var ad = e.target.closest("[data-obs-adom]");
    if (ad) {
      obsAlertFilter.domain = ad.dataset.obsAdom || "";
      document.querySelectorAll("[data-obs-adom]").forEach(function (c) {
        c.classList.toggle("on", c === ad);
      });
      renderObsAlerts();
      return;
    }
    var av = e.target.closest("[data-obs-asev]");
    if (av) {
      obsAlertFilter.sev = av.dataset.obsAsev || "";
      document.querySelectorAll("[data-obs-asev]").forEach(function (c) {
        c.classList.toggle("on", c === av);
      });
      renderObsAlerts();
    }
  });

  /* ── obs 폴링 — 화면 활성 시에만 5s (라우트 이탈 시 정지) ── */
  function obsPoll(route, fn) {
    if (obsTimer) { clearInterval(obsTimer); obsTimer = null; }
    fn();
    obsTimer = setInterval(function () {
      if (currentRoute() === route) fn();
      else { clearInterval(obsTimer); obsTimer = null; }
    }, 5000);
  }

  function bindObsControls() {
    var su = document.getElementById("obs-gf-su");
    if (su) OBS_SUS.forEach(function (s) {
      var o = document.createElement("option");
      o.value = s[1];
      o.textContent = s[1] + " (" + s[0] + ")";
      su.appendChild(o);
    });
    [["obs-gf-site", "site"], ["obs-gf-su", "su"], ["obs-gf-state", "state"], ["obs-gf-sort", "sort"]].forEach(function (p) {
      var el = document.getElementById(p[0]);
      if (el) el.addEventListener("change", function () {
        obsGpuFilter[p[1]] = el.value;
        obsGpuFilter.offset = 0;
        renderObsGpu();
      });
    });
    /* 랙 제어 툴바 — 범위 select에 SU 옵션 채움 · 변경 시 인라인 확인 해제 */
    var rcScope = document.getElementById("obs-rc-scope");
    if (rcScope) {
      OBS_SUS.forEach(function (s) {
        var o = document.createElement("option");
        o.value = "su:" + s[1];
        o.textContent = "SU: " + s[1] + " (" + s[0] + ")";
        rcScope.appendChild(o);
      });
      rcScope.addEventListener("change", obsCtlDisarm);
    }
    NC.bus.on("route", function (r) {
      if (obsTimer && String(r).indexOf("obs-") !== 0) {
        clearInterval(obsTimer);
        obsTimer = null;
      }
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
  /* ① 유지보수 모드 — 콘솔 정책 레이어 토글 (nocp 글로벌 모드 API 없음).
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
    assetsTwinPoll();                           // twin 전원/상태 병합 (5s · 활성 시만)
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
          if (!r) { NC.toast("장비 전환 실패 — nocp 응답 없음", "warn"); return; }
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
        if (!r) { NC.toast("복구 실패 — nocp 응답 없음", "warn"); return; }
        NC.toast((el.dataset.id || "") + " → " + (r.state || "ready") + " 복구 완료 (실장비)");
        renderChange(); renderAssets(); renderOverviewKpi();
      });
    } else if (act === "pam-open") {            // PAM 세션 실 생성
      var pTgt = (($("#pam-target") || {}).value || "").trim() || "console:su-5-r03-t11";
      var pRsn = (($("#pam-reason") || {}).value || "").trim() || "운영 점검";
      apiOr("pamOpen", { operator: "oncall-kim", target: pTgt, reason: pRsn }).then(function (r) {
        NC.closeModal("pam_new");
        if (!r) { NC.toast("PAM 세션 생성 (데모) — nocp 미기동 시뮬레이션", "warn"); return; }
        NC.toast(r.id + " 세션 열림 — " + pTgt + " · TTL " +
          Math.round((r.ttl_s || 900) / 60) + "분 · 녹화 시작", "warn");
        apiOr("pamSessions").then(function (p) { if (p) renderPamList(p); });
      });
    } else if (act === "pam-close") {           // PAM 세션 실 종료
      apiOr("pamClose", el.dataset.id).then(function (r) {
        if (!r) { NC.toast("세션 종료 실패 — nocp 응답 없음", "warn"); return; }
        NC.toast(el.dataset.id + " 세션 종료 — 녹화 봉인 · 감사 로그 기록");
        apiOr("pamSessions").then(function (p) { if (p) renderPamList(p); });
      });
    } else if (act === "iso-recheck") {         // 격리 재검증
      if (NC.live) { renderSecurityLive(); NC.toast("격리 재검증 실행 — nocp isolation 4-plane 검사"); }
      else NC.toast(el.dataset.msg || "재검증 시작", el.dataset.kind);
    } else if (act === "maint-mode") {          // 유지보수 모드 토글 (콘솔 정책 레이어)
      if (maintOn()) {
        try { localStorage.removeItem(MAINT_KEY); } catch (e) {}
        NC.toast("유지보수 모드 해제 — 프로비저닝 승인 경고 확인 제거 (원복)");
      } else {
        try { localStorage.setItem(MAINT_KEY, new Date().toISOString()); } catch (e) {}
        NC.toast("유지보수 모드 ON — 신규 프로비저닝 승인 보류 권고 · 콘솔 정책 레이어 (nocp 글로벌 모드 아님)", "warn");
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
            " · " + sevP + "→" + (res.tk.severity || "") + " (nocp)");
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
          ? "즉시 적용 불가 — nocp 미기동 · 데모 접수로 처리"
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
              if (!r) { NC.toast("즉시 적용 실패 — nocp 응답 없음 (데모 접수)", "warn"); return; }
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
  /* SU select — 사이트 선택 시 해당 사이트 SU만 (OBS_SUS: 가산 su-1~3 · 안산 su-4~11) */
  function fillAssetSuOptions(site) {
    var suSel = document.getElementById("af-su");
    if (!suSel) return;
    var keep = assetsFilter.su;
    suSel.innerHTML = '<option value="">SU: 전체</option>';
    var valid = false;
    OBS_SUS.forEach(function (s) {
      if (site && s[0] !== site) return;
      var o = document.createElement("option");
      o.value = s[1];
      o.textContent = s[1] + " (" + s[0] + ")";
      suSel.appendChild(o);
      if (s[1] === keep) valid = true;
    });
    if (keep && !valid) assetsFilter.su = "";   // 사이트 변경으로 무효화된 SU 해제
    suSel.value = assetsFilter.su;
  }
  function bindAssetFilters() {
    fillAssetSuOptions("");
    var siteSel = document.getElementById("af-site");
    if (siteSel) siteSel.addEventListener("change", function () {
      assetsFilter.site = siteSel.value;
      fillAssetSuOptions(siteSel.value);        // 사이트 → SU 옵션 연동
      assetsFilter.offset = 0;
      renderAssetsTable();
    });
    var suSel = document.getElementById("af-su");
    if (suSel) suSel.addEventListener("change", function () {
      assetsFilter.su = suSel.value; assetsFilter.offset = 0; renderAssetsTable();
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
    bindObsControls();      // 통합 Observability — GPU 필터 · 폴링 정지 훅
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
      /* 통합 Observability — NICo Emulator obs API (5s 폴링 · 활성 시만) */
      "obs-overview": function () { obsPoll("obs-overview", renderObsOverview); },
      "obs-gpu": function () { obsPoll("obs-gpu", renderObsGpu); },
      "obs-fabtopo": function () { obsPoll("obs-fabtopo", renderObsFabTopo); },
      "obs-rack": function () { obsPoll("obs-rack", renderObsRack); },
      "obs-dlc": function () { obsPoll("obs-dlc", renderObsDlc); },
      "obs-fabric": function () { obsPoll("obs-fabric", renderObsFabric); },
      "obs-slo": function () { obsPoll("obs-slo", renderObsSlo); },
      "obs-alerts": function () { obsPoll("obs-alerts", renderObsAlerts); },
      "obs-trayops": obsTrayPoll,   // 진행 중 3s · 유휴 5s 적응 폴링
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
