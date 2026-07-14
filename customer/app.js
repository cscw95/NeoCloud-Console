/* NeoCloud 고객 콘솔 — 화면 렌더러 · Control-Plane 실연동 + mock 폴백.
   라우팅/모달/토스트/버스는 ../shared/app.js,
   데이터는 ../shared/mock-api.js → ../shared/nocp-api.js 가 NC.api를
   라이브 어댑터로 교체(nocp :8000 기동 시 실데이터, 아니면 mock 폴백).
   테넌트 스코프: NC.api.currentTenant() 기준 — 사이드바 select로 전환.
   2차 풀연동: clusters(emuClusters+setWorkload 전환) · images(spec 카탈로그)
   · settings(iamRealm) · alerts(faultMetrics KPI) · network(leases 필터)
   · support(SLA 실수치·리드타임 실계산) — marketplace는 P2 mock 유지. */
(function () {
  "use strict";
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;",
               '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var usd = function (n) {
    return "$" + Math.round(n || 0).toLocaleString("en-US");
  };
  var usdC = function (n) {                  // KPI용 컴팩트 표기
    n = n || 0;
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "<small>M</small>";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "<small>K</small>";
    return "$" + Math.round(n);
  };
  var maskSecret = function (s) {
    s = String(s || "");
    return s.length > 8 ? s.slice(0, 3) + "****" + s.slice(-4) : "nc_****";
  };

  /* ══ 공통 유틸 — CSV 다운로드 · 클립보드 · 해시 쿼리 ══════════ */
  function csvEsc(v) {
    return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  }
  function downloadCsv(name, rows) {
    var csv = "﻿" + rows.map(function (r) {    // BOM — 엑셀 한글 호환
      return r.map(csvEsc).join(",");
    }).join("\r\n");
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }
  function copyText(t) {
    var done = function () {
      NC.toast("클립보드에 복사되었습니다 — " + esc(t));
    };
    var legacy = function () {
      var ta = document.createElement("textarea");
      ta.value = t;
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e2) {}
      ta.remove();
      if (ok) done();
      else NC.toast("복사 실패 — 텍스트를 직접 선택해 복사하세요", "warn");
    };
    if (navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(t).then(done, legacy);
    else legacy();
  }
  function hashQuery(key) {
    var out = null;
    (location.hash.split("?")[1] || "").split("&").forEach(function (kv) {
      var p = kv.split("=");
      if (p[0] === key) out = decodeURIComponent(p[1] || "");
    });
    return out;
  }

  /* ══ pagedTable — 재사용 페이지네이션 헬퍼 ════════════════════
     cfg { bar: 컨트롤 컨테이너, pageSize, unit,
           render(pageItems, meta) — meta {total, all, from, page, pages},
           search: {placeholder, match(item, q)} | 생략,
           filter: {options: [[value,label]…], accept(item, v)} | 생략 }
     반환 { set(items), setQuery(q), refresh() }.
     전체 행 ≤ pageSize이고 검색·필터 미사용이면 컨트롤 자동 숨김
     (폴백 mock 모드에서 UI 불변). */
  function pagedTable(cfg) {
    var st = { items: [], page: 0, q: "", f: "" };
    var bar = cfg.bar;
    bar.classList.add("pgr");
    bar.innerHTML =
      (cfg.search
        ? '<input type="search" placeholder="' +
          esc(cfg.search.placeholder || "검색") + '">' : "") +
      (cfg.filter
        ? "<select>" + cfg.filter.options.map(function (o) {
            return '<option value="' + esc(o[0]) + '">' + esc(o[1]) +
              "</option>";
          }).join("") + "</select>" : "") +
      '<span class="cnt"></span>' +
      '<button type="button" data-pg="-1">← 이전</button>' +
      '<button type="button" data-pg="1">다음 →</button>';
    var inp = bar.querySelector("input");
    var sel = bar.querySelector("select");
    var cnt = bar.querySelector(".cnt");
    var prev = bar.querySelector('[data-pg="-1"]');
    var next = bar.querySelector('[data-pg="1"]');
    if (inp) inp.addEventListener("input", function () {
      st.q = this.value; st.page = 0; refresh();
    });
    if (sel) sel.addEventListener("change", function () {
      st.f = this.value; st.page = 0; refresh();
    });
    prev.addEventListener("click", function () { st.page -= 1; refresh(); });
    next.addEventListener("click", function () { st.page += 1; refresh(); });
    function refresh() {
      var list = st.items;
      if (st.f && cfg.filter) list = list.filter(function (it) {
        return cfg.filter.accept(it, st.f);
      });
      var q = st.q.trim().toLowerCase();
      if (q && cfg.search) list = list.filter(function (it) {
        return cfg.search.match(it, q);
      });
      var size = cfg.pageSize || 12;
      var pages = Math.max(1, Math.ceil(list.length / size));
      st.page = Math.max(0, Math.min(st.page, pages - 1));
      var from = st.page * size;
      var page = list.slice(from, from + size);
      cfg.render(page, { total: list.length, all: st.items.length,
        from: from, page: st.page, pages: pages });
      bar.classList.toggle("on",
        st.items.length > size || !!q || !!st.f);
      cnt.textContent = list.length
        ? (cfg.unit || "") + " " + list.length + "건 중 " + (from + 1) +
          "–" + (from + page.length) +
          (list.length !== st.items.length
            ? " (전체 " + st.items.length + "건)" : "") +
          (pages > 1 ? " · " + (st.page + 1) + "/" + pages + "p" : "")
        : (cfg.unit || "") + " 0건";
      prev.disabled = st.page <= 0;
      next.disabled = st.page >= pages - 1;
    }
    return {
      set: function (items) { st.items = items || []; refresh(); },
      setQuery: function (q2) {
        st.q = q2 || "";
        if (inp) inp.value = st.q;
        st.page = 0;
        refresh();
      },
      refresh: refresh,
    };
  }

  /* ══ 현재 테넌트 (라이브: nocp 테넌트 / 폴백: mock fin-corp) ═══ */
  var curTenant = null;
  function loadTenant() {
    if (!NC.api || !NC.api.currentTenant) return Promise.resolve(curTenant);
    return NC.api.currentTenant().then(function (t) {
      curTenant = t || null;
      return curTenant;
    }).catch(function () { return curTenant; });
  }

  // 테넌트 값 → KPI(GPU=racks*72)·랙·P_Key·클러스터 수 렌더 (null 안전)
  function applyTenant(t) {
    var racks = (t && t.racks) || 0;
    var gpus = racks * ((NC.CONST && NC.CONST.gpu_per_rack) || 72);
    var clusters = t && t.clusters != null ? t.clusters : 0;
    var kpiG = $("#kpi-gpus");
    if (kpiG) kpiG.textContent = gpus.toLocaleString("en-US");
    var sub = $("#kpi-gpus-sub");
    if (sub) sub.textContent = t
      ? racks + "랙 · " + (racks * 18) + "노드 · VR NVL72"
      : "할당된 랙 없음";
    $$("[data-pkey]").forEach(function (el) {
      el.textContent = (t && t.pkey) || "—";
    });
    var bd = $("#mi-clusters-bd");
    if (bd) bd.textContent = String(clusters);
    var kc = $("#kpi-clusters");
    if (kc) kc.textContent = String(clusters);
    var hero = $("#hero-sub");
    if (hero) hero.textContent = t
      ? t.name + " — 클러스터 " + clusters + " · " + racks +
        "랙 가동 중 · 마지막 갱신 방금 전"
      : "할당된 테넌트가 없습니다 — 계약 개통(주문 승인) 후 표시됩니다";
  }

  /* ══ 사이드바 테넌트 select — NC.api.tenants()로 채움 ═════════ */
  function renderTenantScope() {
    Promise.all([NC.api.tenants(), loadTenant()]).then(function (res) {
      var tenants = res[0] || [];
      var cur = res[1];
      var sel = $("#tenant-select");
      if (sel) sel.innerHTML = tenants.length
        ? tenants.map(function (t) {
            return '<option value="' + esc(t.id) + '"' +
              (cur && t.id === cur.id ? " selected" : "") + ">" +
              esc(t.name) +
              (t.racks ? " · " + t.racks + "랙" : "") + "</option>";
          }).join("")
        : '<option value="">테넌트 없음</option>';
      var av = $("#scope-avatar");
      if (av) av.textContent =
        cur && cur.name ? cur.name.charAt(0).toUpperCase() : "–";
    }).catch(function () {});
  }

  /* ══ 알림 (NC.api.alerts) ═════════════════════════════════════ */
  var SEV_DOT = { warn: "amber", info: "blue", crit: "red" };
  var SEV_LBL = { warn: "인시던트", info: "공지", crit: "장애" };

  function alertItem(a) {
    return '<div class="fi"><span class="dot ' + (SEV_DOT[a.sev] || "gray") +
      '"></span><div class="tx"><b>' + esc(a.msg) + '</b><div class="tm">' +
      esc(a.at) + " · " + esc(a.id) + " · " + (SEV_LBL[a.sev] || "이벤트") +
      "</div></div></div>";
  }

  /* 읽음 상태(localStorage 건수 기반) — "모두 읽음"이 배지를 0으로 */
  var lastAlertCount = 0;
  var alertsReadCnt = 0;
  try {
    alertsReadCnt =
      parseInt(localStorage.getItem("nc-alerts-read") || "0", 10) || 0;
  } catch (e) {}

  function applyAlertBadges() {
    var unread = Math.max(0, lastAlertCount - alertsReadCnt);
    var n = String(unread);
    var bd = $("#mi-alerts-bd");
    if (bd) { bd.textContent = n; bd.style.display = unread ? "" : "none"; }
    var bell = $("#tb-bell-n");
    if (bell) { bell.textContent = n; bell.style.display = unread ? "" : "none"; }
    var un = $("#alerts-unread");
    if (un) un.textContent = "미확인 " + n;
  }

  function markAlertsRead() {
    alertsReadCnt = lastAlertCount;
    try { localStorage.setItem("nc-alerts-read", String(alertsReadCnt)); }
    catch (e) {}
    applyAlertBadges();
    NC.toast("알림 " + lastAlertCount + "건을 모두 읽음 처리했습니다");
  }

  function renderAlertFeeds(alerts) {
    alerts = alerts || [];
    var html = alerts.map(alertItem).join("");
    ["#dash-alerts", "#alerts-feed"].forEach(function (sel) {
      var el = $(sel);
      if (el) el.innerHTML = html;
    });
    lastAlertCount = alerts.length;
    applyAlertBadges();
  }

  /* ══ 티켓 — 현재 테넌트 필터 목록 렌더 + 배지 (라이브 시 실 티켓) ══ */
  function isOpenTicket(t) {
    return t.state !== "resolved" && t.state !== "closed";
  }

  function ticketCard(t) {
    var open = isOpenTicket(t);
    var sev = String(t.sev || "").toUpperCase();
    return '<div class="tkt' + (open ? "" : " ok") + '">' +
      '<div class="th"><span class="tid">' + esc(t.id) + "</span>" +
      '<span class="tst' + (open ? "" : " ok") + '">' + esc(sev) +
      (open ? " · 진행 중" : " · 해결됨") + "</span>" +
      '<span class="tm">' +
      esc(t.linked ? "연계 " + t.linked : (t.tenant || "")) + "</span></div>" +
      '<div class="tt"' + (open ? "" : ' style="color:var(--soft)"') + ">" +
      esc(t.subject || "(제목 없음)") + "</div>" +
      (t.node_state
        ? '<div class="td">노드 상태: ' + esc(t.node_state) + "</div>" : "") +
      "</div>";
  }

  var EMPTY_TICKETS =
    '<div class="mini" style="margin-top:0">접수된 티켓이 없습니다 — ' +
    '"+ 생성" 버튼으로 접수하세요</div>';

  var ticketPager = null;
  function ensureTicketPager() {
    if (ticketPager) return ticketPager;
    var bar = $("#tickets-pgr");
    if (!bar) return null;
    ticketPager = pagedTable({
      bar: bar, pageSize: 6, unit: "티켓",
      search: { placeholder: "티켓 ID · 제목 검색",
        match: function (t, q) {
          return ((t.id || "") + " " + (t.subject || ""))
            .toLowerCase().indexOf(q) >= 0;
        } },
      render: function (page, m) {
        var el = $("#support-tickets");
        if (!el) return;
        el.innerHTML = page.length
          ? page.map(ticketCard).join("")
          : (m.all
            ? '<div class="mini" style="margin-top:0">일치하는 티켓 없음 — ' +
              "검색어를 조정하세요</div>"
            : EMPTY_TICKETS);
      },
    });
    return ticketPager;
  }

  function renderTicketList(list) {
    var pgr = ensureTicketPager();          // 지원 화면 — 페이지네이션
    if (pgr) pgr.set(list);
    var el = $("#dash-tickets");            // 대시보드 — 상위 3건 + 외 N
    if (el) el.innerHTML = list.length
      ? list.slice(0, 3).map(ticketCard).join("") +
        (list.length > 3
          ? '<div class="mini">… 외 ' + (list.length - 3) +
            '건 — <a class="lnk" href="#/support">지원 화면에서 전체 보기</a>' +
            "</div>" : "")
      : EMPTY_TICKETS;
  }

  /* TCK-1204 시나리오 동기(노드 "복구 중"↔"정상") + 열린 티켓 배지.
     운영 콘솔의 INC-0412 해결(incident.resolved) 전파 시 갱신 (mock 폴백 데모). */
  function statusChip(color, label) {
    return '<span style="display:inline-flex;align-items:center;gap:5px">' +
      '<span class="dot ' + color + '" style="width:6px;height:6px"></span>' +
      '<span class="st ' + color + '">' + label + "</span></span>";
  }

  function applyTickets(tickets) {
    tickets = tickets || [];
    // 배지·KPI — 현재 테넌트 필터 목록 기준
    var openCnt = tickets.filter(isOpenTicket).length;
    var kpi = $("#kpi-tickets");
    if (kpi) {
      kpi.textContent = String(openCnt);
      kpi.classList.toggle("amber", openCnt > 0);
      kpi.classList.toggle("green", openCnt === 0);
    }
    var bd = $("#mi-support-bd");
    if (bd) {
      bd.textContent = String(openCnt);
      bd.style.display = openCnt ? "" : "none";
    }
    // TCK-1204 노드 상태 동기 (mock 시나리오 전용 — 라이브엔 해당 ID 없음)
    var t = tickets.filter(function (x) { return x.id === "TCK-1204"; })[0];
    if (!t) return;
    var open = t.state === "open";
    $$("[data-tck-st]").forEach(function (el) {
      el.textContent = open ? "P2 · 진행 중" : "해결됨";
      el.classList.toggle("ok", !open);
    });
    $$("[data-tck-card]").forEach(function (el) {
      el.classList.toggle("ok", !open);
    });
    $$("[data-tck-note]").forEach(function (el) {
      if (!open) el.textContent =
        "최근 답변: RMA 교체 완료 — 번인 통과, 노드 정상 복귀 (" + t.node_state + ")";
    });
    // 노드 화면 — nh-su-5-r03-t11 상태 셀 (mock: node_state "복구 중" | "정상")
    $$("[data-tck-node]").forEach(function (el) {
      el.innerHTML = open
        ? statusChip("amber", t.node_state + " (GPU2)")
        : statusChip("green", "in-service");
      var row = el.closest("tr");
      if (row) row.classList.toggle("fault", open);
    });
    $$("[data-node-summary]").forEach(function (el) {
      el.textContent = open
        ? "584 노드 · in-service 583 · 복구 중 1"
        : "584 노드 · in-service 584";
    });
    $$("[data-tck-inline]").forEach(function (el) {
      el.textContent = open ? el.textContent : "모든 GPU 정상";
      el.style.color = open ? "var(--amber)" : "var(--green-text)";
    });
  }

  function refreshTickets() {
    return loadTenant().then(function () {
      return NC.api.tickets();
    }).then(function (tickets) {
      tickets = tickets || [];
      var mine = curTenant
        ? tickets.filter(function (x) { return (x.tenant || "") === curTenant.id; })
        : tickets;
      renderTicketList(mine);
      applyTickets(mine);
      return mine;
    }).catch(function () {});
  }

  /* ══ Sanitization SAN-0691 — cert_ready면 PDF 버튼 활성 ═══════ */
  var sanState = null;
  function applySanitization(s) {
    if (!s) return;
    sanState = s;
    $$(".san-pdf").forEach(function (btn) {
      if (s.cert_ready) {
        btn.disabled = false;
        btn.textContent = "PDF ↓";
        btn.title = s.pdf;
      } else {
        btn.disabled = true;
        btn.textContent = "PDF 준비 중";
        btn.title = s.id + " " + s.step_now + "/" + s.steps.length + "단계 진행 중";
      }
    });
    var note = $("#san-note");
    if (note) note.textContent = s.cert_ready
      ? s.id + " 증명서 발급 완료 — " + s.pdf
      : s.id + " 소거 진행 중 · " + s.step_now + "/" + s.steps.length +
        "단계 (" + s.steps[Math.min(s.step_now, s.steps.length - 1)] + ")";
  }

  /* ══ 대시보드 — 라이브: emu 클러스터(util·전력·온도) KPI 반영 ══ */
  function clusterCard(c, t) {
    var faults = c.fault_gpus || 0;
    var util = Math.round(c.avg_util_pct || 0);
    return '<div class="ccard">' +
      '<div class="crow"><span class="dot ' + (faults ? "amber" : "green") +
      '" style="width:8px;height:8px"></span>' +
      '<b class="nm">' + esc(c.tenant_id) + "-" +
      esc(c.profile || "cluster") + "</b>" +
      '<span class="ty">bare-metal · ' + esc(c.profile || "—") + "</span>" +
      '<span class="lo">트레이 ' + (c.trays || 0) + "</span>" +
      '<span style="margin-left:auto;color:var(--muted);font-size:11px">' +
      "Control-Plane 실시간</span></div>" +
      '<div class="stats" style="margin-top:10px">' +
      "<span>GPU <b>" + (c.gpus || 0).toLocaleString("en-US") + "</b></span>" +
      "<span>util <b>" + util + "%</b></span>" +
      "<span>전력 <b>" + (c.power_kw || 0).toLocaleString("en-US") +
      " kW</b></span>" +
      "<span>최고 온도 <b>" + (c.max_gpu_temp_c || 0) + "°C</b></span>" +
      "<span>NVLink <b>" + (c.nvlink_tbps || 0) + " TB/s</b></span>" +
      '<span>P_Key <b class="mono" style="color:var(--soft);font-size:10.5px">' +
      esc((t && t.pkey) || "—") + "</b></span>" +
      (faults
        ? '<span style="color:var(--amber)">fault GPU ' + faults + "</span>"
        : '<span style="color:var(--green-text)">모든 GPU 정상</span>') +
      "</div></div>";
  }

  function renderLiveClusters(t) {
    // 폴백(mock)이면 기존 정적 데모 카드 그대로 유지
    if (!NC.live || !NC.api.emuClusters) return;
    NC.api.emuClusters().then(function (cs) {
      if (!cs) return;                       // 라이브 getter 실패 → 기존 유지
      var mine = (Array.isArray(cs) ? cs : []).filter(function (c) {
        return t && c.tenant_id === t.id;
      });
      var box = $("#my-clusters");
      if (box) box.innerHTML = mine.length
        ? mine.map(function (c) { return clusterCard(c, t); }).join("")
        : '<div class="ccard" style="color:var(--muted);font-size:11.5px">' +
          "클러스터 없음 — 주문 승인·프로비저닝 완료 후 표시됩니다</div>";
      if (mine.length) {
        // nocp /tenants 목록엔 allocations가 없어 racks=0으로 옴 —
        // emu 텔레메트리로 보정 (NVL72: 트레이 18개/랙 · GPU 72/랙)
        var gpus = mine.reduce(function (a, c) { return a + (c.gpus || 0); }, 0);
        var racks = Math.round(mine.reduce(function (a, c) {
          return a + (c.trays || 0);
        }, 0) / 18);
        var kg = $("#kpi-gpus");
        if (kg) kg.textContent = gpus.toLocaleString("en-US");
        var ks = $("#kpi-gpus-sub");
        if (ks) ks.textContent =
          racks + "랙 · " + (racks * 18) + "노드 · VR NVL72";
        var kc = $("#kpi-clusters"), mb = $("#mi-clusters-bd");
        if (kc) kc.textContent = String(mine.length);
        if (mb) mb.textContent = String(mine.length);
        var hero = $("#hero-sub");
        if (hero && t) hero.textContent = t.name + " — 클러스터 " +
          mine.length + " · " + racks + "랙 가동 중 (Control-Plane 실시간)";
      }
      var v = $("#kpi-util"), bar = $("#kpi-util-bar");
      if (mine.length) {
        var util = Math.round(mine.reduce(function (a, c) {
          return a + (c.avg_util_pct || 0);
        }, 0) / mine.length);
        if (v) v.innerHTML = util + "<small>%</small>";
        if (bar) bar.style.width = Math.max(0, Math.min(100, util)) + "%";
      } else {
        if (v) v.textContent = "—";
        if (bar) bar.style.width = "0%";
      }
    }).catch(function () {});
  }

  /* ══ 톱바 상태 칩 — faultMetrics() 동기 (미기동 시 null → 정적 유지) ══ */
  function renderSysChip() {
    if (!NC.api.faultMetrics) return;
    NC.api.faultMetrics().then(function (f) {
      if (!f) return;
      var dot = $("#sys-chip-dot"), tx = $("#sys-chip-tx");
      if (!dot || !tx) return;
      var n = f.faults_open || 0;
      dot.style.background = n ? "var(--amber)" : "var(--green)";
      tx.style.color = n ? "var(--amber)" : "var(--green-text)";
      tx.textContent = n ? "장애 대응 중 " + n + "건" : "모든 시스템 정상";
    }).catch(function () {});
  }

  /* ══ 모니터링 차트 — emuHistory 실 시계열로 폴리라인 재생성 ═══ */
  var MON_METRICS = {
    util: { k: "avg_util_pct",
            fmt: function (v) { return Math.round(v) + "%"; } },
    temp: { k: "max_gpu_temp_c",
            fmt: function (v) { return Number(v).toFixed(1) + "°C"; } },
    ib:   { k: "nvlink_tbps",
            fmt: function (v) { return Number(v).toFixed(1) + " TB/s"; } },
    ecc:  { k: "ecc",
            fmt: function (v) {
              return Math.round(v).toLocaleString("en-US"); } },
  };

  function updateMonCharts(root, hist) {
    if (!root || !hist || !hist.length) return;
    var last = hist[hist.length - 1] || {};
    $$("[data-mon]", root).forEach(function (box) {
      var m = MON_METRICS[box.dataset.mon];
      if (!m) return;
      var svg = box.querySelector("svg");
      var poly = box.querySelector("polyline");
      var vv = box.querySelector(".vv");
      if (!svg || !poly) return;
      var vb = (svg.getAttribute("viewBox") || "0 0 260 52").split(/\s+/);
      var W = parseFloat(vb[2]) || 260, H = parseFloat(vb[3]) || 52;
      var vals = hist.map(function (p) { return Number(p[m.k]) || 0; });
      var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
      if (mx === mn) mx = mn + 1;
      poly.setAttribute("points", vals.map(function (v, i) {
        var x = vals.length > 1 ? i * (W / (vals.length - 1)) : 0;
        var y = H - 4 - (v - mn) / (mx - mn) * (H - 12);
        return x.toFixed(1) + "," + y.toFixed(1);
      }).join(" "));
      if (vv && last[m.k] != null) vv.textContent = m.fmt(last[m.k]);
    });
  }

  function renderLiveHistory(t, screenId) {
    if (!t || !NC.api.emuHistory) return;
    NC.api.emuHistory(t.id, 120).then(function (hist) {
      if (!hist || !hist.length) return;     // 폴백 — 정적 스파크라인 유지
      updateMonCharts($('[data-screen="' + screenId + '"]'), hist);
    }).catch(function () {});
  }

  /* ══ 격리 검증 배지 — isolation(tid) PASS/FAIL ════════════════ */
  function applyIsolation(iso) {
    var ok = !!iso.ok;
    $$("[data-iso-badge]").forEach(function (b) {
      b.classList.toggle("green", ok);
      b.classList.toggle("red", !ok);
    });
    $$("[data-iso-dot]").forEach(function (d) {
      d.classList.toggle("green", ok);
      d.classList.toggle("red", !ok);
    });
    $$("[data-iso-tx]").forEach(function (x) {
      x.textContent = ok ? "격리 검증 PASS (실검증)" : "격리 검증 FAIL";
    });
    var f = $("#iso-findings");
    if (f) {
      f.style.display = "";
      f.innerHTML = "Control-Plane 4계층 격리 실검증: " +
        (iso.findings || []).map(function (x) {
          var pass = x.severity === "pass";
          return '<span style="color:var(--' +
            (pass ? "green-text" : "red") + ')" title="' + esc(x.message) +
            '">' + esc(x.layer) + " " +
            (pass ? "PASS" : String(x.severity).toUpperCase()) + "</span>";
        }).join(" · ");
    }
  }

  function renderIsolation() {
    loadTenant().then(function (t) {
      if (!t || !NC.api.isolation) return;
      NC.api.isolation(t.id).then(function (iso) {
        if (iso) applyIsolation(iso);        // null → mock 배지 유지
      }).catch(function () {});
    });
  }

  /* ══ 접속 패키지 — accessPackages(tid) (딜리버리 산출물) ══════ */
  function renderAccessPackages(pkgs) {
    var panel = $("#access-pkg-panel"), tb = $("#access-pkg");
    var sub = $("#access-pkg-sub");
    if (!panel || !tb) return;
    if (!pkgs || !pkgs.length) { panel.style.display = "none"; return; }
    var last = pkgs[pkgs.length - 1];
    var p = last.pkg || {};
    var rows = [];
    if (p.ssh_bastion) rows.push(["SSH Bastion",
      '<span class="id">ssh ' + esc(p.ssh_bastion.user) + "@" +
      esc(p.ssh_bastion.host) + "</span> (" + esc(p.ssh_bastion.ip || "—") +
      ") · " + esc(p.ssh_bastion.auth || "")]);
    if (p.api) {
      rows.push(["API",
        '<span class="id">' + esc(p.api.base_url || "—") + "</span> · scope " +
        esc(p.api.scope || "—")]);
      rows.push(["OIDC 클라이언트",
        '<span class="id">' + esc(p.api.client_id || "—") +
        "</span> · secret <span class=\"id\">" +
        esc(maskSecret(p.api.client_secret)) + "</span>"]);
    }
    if (p.console) rows.push(["콘솔 (PAM)",
      '<span class="id">' + esc(p.console.pam_url || "—") + "</span>"]);
    (p.storage || []).forEach(function (s) {
      rows.push(["스토리지",
        '<span class="id">' + esc(s.mount || "—") + "</span> · " +
        esc(s.protocol || "")]);
    });
    if (p.network) rows.push(["네트워크",
      '<span class="id">' + esc(p.network.vrf || "—") + "</span> · L3VNI " +
      esc(p.network.compute_l3vni) + ' · P_Key <span class="id">' +
      esc(p.network.ib_pkey || "—") + "</span>"]);
    if (p.managed_k8s) {                   // Managed K8s — API 서버·OIDC·SLA
      var mk = p.managed_k8s;
      rows.push(["Managed K8s",
        '<span class="id">' + esc(mk.api_server || "—") + "</span> · " +
        esc(mk.version || "") + " · " + esc(mk.cluster_id || "") +
        " · CP SLA " + esc(mk.control_plane_sla || "—")]);
      rows.push(["kubeconfig (OIDC)",
        '<span class="id">' + esc(mk.oidc_issuer || "—") + "</span> · " +
        esc(mk.kubeconfig || "—")]);
    }
    tb.innerHTML = rows.map(function (r) {
      return '<tr><td style="width:130px">' + r[0] + "</td><td>" +
        r[1] + "</td></tr>";
    }).join("");
    if (sub) sub.textContent = esc(last.order) + " · " + last.racks + "랙" +
      (pkgs.length > 1 ? " (외 " + (pkgs.length - 1) + "건)" : "") +
      " · Control-Plane 실시간";
    panel.style.display = "";
  }

  /* ══ IAM 토큰 발급 이력 (localStorage — api 화면) ═════════════ */
  function tokenLog() {
    try { return JSON.parse(localStorage.getItem("nc-iam-log") || "[]"); }
    catch (e) { return []; }
  }
  function pushTokenLog(entry) {
    var l = tokenLog();
    l.unshift(entry);
    try { localStorage.setItem("nc-iam-log", JSON.stringify(l.slice(0, 20))); }
    catch (e) {}
  }
  function renderApiTokenLog() {
    var box = $("#api-token-log"), rows = $("#api-token-rows");
    if (!box || !rows) return;
    var l = tokenLog();
    if (!l.length) { box.style.display = "none"; return; }
    box.style.display = "";
    rows.innerHTML = l.map(function (e2) {
      return '<div><span class="tm">' + esc(e2.at) + "</span> " +
        esc(e2.client) + (e2.name ? " (" + esc(e2.name) + ")" : "") +
        " → " + esc(e2.token) +
        ' <span style="color:var(--muted2)">' + esc(e2.scope || "") +
        "</span></div>";
    }).join("");
  }

  /* ══ 화면 렌더러 (NC.start 라우트 진입 시 호출) ═══════════════ */
  function renderDashboard() {
    loadTenant().then(function (t) {
      applyTenant(t);
      renderLiveClusters(t);
      renderLiveHistory(t, "dashboard");
    });
    NC.api.alerts().then(renderAlertFeeds);
    refreshTickets();
    NC.api.sanitization().then(applySanitization);
    renderSysChip();
    renderIsolation();
  }

  /* 노드 — nodes(tid)+cpuNodes(tid) 전체 목록을 pagedTable로 열람
     (12행/페이지 · 상태 필터 · 호스트명 검색 · 폴백 null → 정적 유지) */
  function nodeRowHtml(n) {
    if (n.kind === "cpu")
      return '<tr><td class="id">' + esc(n.id) + "</td>" +
        '<td class="id">' + esc(n.ip || "—") + "</td>" +
        '<td style="color:var(--muted)">CPU 노드 · ' + esc(n.arch || "") +
        " " + (n.cores || "—") + "c · " + (n.mem || "—") + "TB</td>" +
        "<td>" + stateChipHtml(n.state) + "</td>" +
        '<td class="num" style="color:var(--muted)">—</td>' +
        '<td><button class="tbtn" data-open="console_access">콘솔' +
        "</button></td></tr>";
    return "<tr" + (n.state === "in_service" ? "" : ' class="fault"') +
      '><td class="id">' + esc(n.id) + "</td>" +
      '<td class="id" style="color:var(--muted)">' + esc(n.ip || "—") +
      "</td>" +
      '<td style="color:var(--muted)">' + esc(n.bp) +
      " · 4× Rubin · 2× Vera</td>" +
      "<td>" + stateChipHtml(n.state) + "</td>" +
      '<td class="num" style="color:var(--muted)">—</td>' +
      '<td><button class="tbtn" data-open="console_access">콘솔</button>' +
      ' · <button class="tbtn a" data-open="reboot">재부팅</button>' +
      "</td></tr>";
  }

  var nodesPager = null, nodesQConsumed = "";
  function ensureNodesPager() {
    if (nodesPager) return nodesPager;
    var bar = $("#nodes-pgr");
    if (!bar) return null;
    nodesPager = pagedTable({
      bar: bar, pageSize: 12, unit: "노드",
      search: { placeholder: "호스트명 · 인스턴스 검색",
        match: function (n, q) { return n._s.indexOf(q) >= 0; } },
      filter: { options: [["", "상태: 전체"], ["in_service", "in-service"],
          ["other", "기타 (비정상·프로비저닝)"]],
        accept: function (n, v) {
          return v === "in_service"
            ? n.state === "in_service" : n.state !== "in_service";
        } },
      render: function (page) {
        var tb = $("#nodes-tbody");
        if (!tb) return;
        tb.innerHTML = page.length
          ? page.map(nodeRowHtml).join("")
          : '<tr><td colspan="6" style="color:var(--muted2)">일치하는 ' +
            "노드가 없습니다 — 검색어·상태 필터를 조정하세요</td></tr>";
      },
    });
    return nodesPager;
  }

  function renderNodes() {
    refreshTickets();
    loadTenant().then(function (t) {
      if (!t || !NC.api.nodes) return;
      Promise.all([NC.api.nodes(t.id),
        NC.api.cpuNodes ? NC.api.cpuNodes(t.id) : null
      ]).then(function (res) {
        var ns = res[0], cpus = res[1] || [];
        if (!ns) return;                     // 폴백 — mock 테이블 유지
        var items = ns.map(function (n) {
          return { kind: "gpu", id: n.tray_id, ip: n.nico_instance_id,
            bp: n.blueprint_key, state: n.state,
            _s: ((n.tray_id || "") + " " + (n.nico_host_id || "") + " " +
                 (n.nico_instance_id || "")).toLowerCase() };
        }).concat(cpus.map(function (c) {
          return { kind: "cpu", id: c.id, ip: c.host_ip, arch: c.cpu_arch,
            cores: c.cores, mem: c.mem_tb, state: c.state,
            _s: ((c.id || "") + " " + (c.host_ip || "")).toLowerCase() };
        }));
        var pgr = ensureNodesPager();
        if (!pgr) return;
        pgr.set(items);
        var q = hashQuery("q");              // ⌘K 팔레트 호스트 딥링크
        if (q && q !== nodesQConsumed) {     // 1회만 소비 — 검색 초기화 존중
          pgr.setQuery(q);
          nodesQConsumed = q;
        }
        var inSvc = ns.filter(function (n) {
          return n.state === "in_service";
        }).length;
        $$("[data-node-summary]").forEach(function (el) {
          el.textContent = ns.length + " GPU 노드 · in-service " + inSvc +
            (ns.length - inSvc ? " · 기타 " + (ns.length - inSvc) : "") +
            " · CPU " + cpus.length;
        });
        var chip = $("#nodes-cluster-chip");
        if (chip) chip.textContent = "테넌트: " + (t.name || t.id);
      }).catch(function () {});
    });
  }

  function stateChipHtml(s) {
    var color = s === "in_service" || s === "allocated" ? "green"
      : (s === "provisioning" || s === "reserved" ? "blue" : "amber");
    return statusChip(color, s === "in_service" ? "in-service" : s);
  }

  /* 내 DHCP 임대 — leases() 전 호스트를 nodes(tid) tray_id로 필터 후
     pagedTable(8행 · host/ip 검색). 폴백/내 임대 없음: 패널 숨김 */
  function leaseRowHtml(l) {
    return '<tr><td class="id">' + esc(l.host_id) + "</td>" +
      '<td class="id">' + esc(l.ip) + "</td>" +
      '<td class="id" style="color:var(--muted)">' + esc(l.mac) + "</td>" +
      '<td class="num">' + Math.round((l.lease_s || 0) / 3600) + "h</td>" +
      '<td class="id" style="color:var(--muted)">' +
      esc(l.dhcp_server || "—") + "</td></tr>";
  }

  var leasePager = null;
  function ensureLeasePager() {
    if (leasePager) return leasePager;
    var bar = $("#leases-pgr");
    if (!bar) return null;
    leasePager = pagedTable({
      bar: bar, pageSize: 8, unit: "임대",
      search: { placeholder: "host · ip 검색",
        match: function (l, q) {
          return ((l.host_id || "") + " " + (l.ip || "") + " " +
                  (l.mac || "")).toLowerCase().indexOf(q) >= 0;
        } },
      render: function (page, m) {
        var tb = $("#net-leases");
        if (!tb) return;
        tb.innerHTML = page.length
          ? page.map(leaseRowHtml).join("")
          : '<tr><td colspan="5" style="color:var(--muted2)">일치하는 ' +
            "임대가 없습니다" + (m.all ? " — 검색어를 조정하세요" : "") +
            "</td></tr>";
      },
    });
    return leasePager;
  }

  function renderNetLeases(t) {
    var panel = $("#net-dhcp-panel"), tb = $("#net-leases");
    if (!panel || !tb || !t || !NC.api.leases || !NC.api.nodes) return;
    Promise.all([NC.api.leases(), NC.api.nodes(t.id)])
      .then(function (res) {
        var ls = res[0], ns = res[1];
        if (!ls || !ns || !ns.length) { panel.style.display = "none"; return; }
        var mine = {};
        ns.forEach(function (n) { mine[n.tray_id] = 1; });
        var rows = (Array.isArray(ls) ? ls : []).filter(function (l) {
          return mine[l.tray_id];
        });
        if (!rows.length) { panel.style.display = "none"; return; }
        var pgr = ensureLeasePager();
        if (pgr) pgr.set(rows);
        var sub = $("#net-dhcp-sub");
        if (sub) sub.textContent = "임대 " + rows.length +
          "건 · NICo DHCP · Control-Plane 실시간";
        panel.style.display = "";
      }).catch(function () {});
  }

  /* 네트워크 — fabric().tenants P_Key·SU + segments() 내 세그먼트 */
  function renderNetwork() {
    loadTenant().then(function (t) {
      var cell = $("#net-pkey");
      if (cell) cell.textContent =
        ((t && t.pkey) || "—") + " — enforced · 포트 4,608";
      if (!t) return;
      renderNetLeases(t);
      if (NC.api.fabric) NC.api.fabric().then(function (f) {
        if (!f || !f.tenants) return;
        var me = f.tenants.filter(function (x) {
          return x.tenant_id === t.id;
        })[0];
        if (me && cell) cell.textContent = me.pkey + " — enforced · SU " +
          ((me.sus || []).join(", ") || "—") + " · " + (me.racks || 0) +
          "랙 (" + (me.gpus || 0) + " GPU)";
      }).catch(function () {});
      if (NC.api.segments) NC.api.segments().then(function (segs) {
        if (!segs) return;                   // 폴백 — 정적 유지
        var mine = segs.filter(function (s) { return s.tenant_ref === t.id; });
        var panel = $("#net-seg-panel"), tb = $("#net-segments");
        if (!panel || !tb) return;
        if (!mine.length) { panel.style.display = "none"; return; }
        panel.style.display = "";
        tb.innerHTML = mine.map(function (s) {
          return '<tr><td class="id">' + esc(s.segment_id) +
            ' <span style="color:var(--muted2)">' +
            esc(s.allocation_id || "") + "</span></td>" +
            '<td class="id">' + esc(s.vrf) + "</td>" +
            '<td class="num">' + esc(s.l3vni) + "</td>" +
            '<td class="num">' + esc(s.converged_vni) + "</td>" +
            '<td class="num">' + (s.host_ids || []).length + "</td>" +
            '<td class="st ' + (s.state === "active" ? "green" : "amber") +
            '">' + esc(s.state) + "</td></tr>";
        }).join("");
        var vrf = $("#net-vrf");
        if (vrf && mine[0]) vrf.textContent = mine[0].vrf + " · L3VNI " +
          mine[0].l3vni + " / Conv " + mine[0].converged_vni +
          " · dataplane " + (mine[0].vrf_dataplane || "—");
      }).catch(function () {});
    });
  }

  /* 스토리지 — storageViews() 현재 테넌트 필터 → pagedTable(8행 · 경로 검색) */
  function volRowHtml(v) {
    var cap = v.capacity_tb >= 1000
      ? (v.capacity_tb / 1000).toFixed(1) + "PB"
      : Math.round(v.capacity_tb) + "TB";
    return '<tr><td class="id">' + esc(v.path) + "</td>" +
      '<td class="num">' + cap + "</td>" +
      '<td class="num" style="color:var(--muted)">' +
      esc((v.protocols || []).join("/")) + "</td>" +
      '<td class="num">' + Math.round(v.qos_gbps || 0) + "GB/s · " +
      Math.round(v.qos_iops_k || 0) + "K IOPS</td>" +
      '<td><button class="tbtn" data-open="snapshot">스냅샷</button>' +
      ' · <button class="tbtn a" data-open="qos">QoS 변경</button>' +
      "</td></tr>";
  }

  var storagePager = null;
  function ensureStoragePager() {
    if (storagePager) return storagePager;
    var bar = $("#storage-pgr");
    if (!bar) return null;
    storagePager = pagedTable({
      bar: bar, pageSize: 8, unit: "볼륨",
      search: { placeholder: "경로 검색",
        match: function (v, q) {
          return String(v.path || "").toLowerCase().indexOf(q) >= 0;
        } },
      render: function (page, m) {
        var tb = $("#storage-volumes");
        if (!tb) return;
        tb.innerHTML = page.length
          ? page.map(volRowHtml).join("")
          : (m.all
            ? '<tr><td colspan="5" style="color:var(--muted2)">일치하는 ' +
              "볼륨 없음 — 검색어를 조정하세요</td></tr>"
            : '<tr><td colspan="5" style="color:var(--muted2)">할당된 ' +
              "볼륨 없음 — 클러스터 주문 시 자동 프로비저닝됩니다</td></tr>");
      },
    });
    return storagePager;
  }

  function renderStorage() {
    loadTenant().then(function (t) {
      if (!t || !NC.api.storageViews) return;
      NC.api.storageViews().then(function (vs) {
        var tb = $("#storage-volumes");
        if (!vs || !tb) return;              // 폴백 — 정적 유지
        var mine = (Array.isArray(vs) ? vs : []).filter(function (v) {
          return v.tenant_ref === t.id;
        });
        var pgr = ensureStoragePager();
        if (pgr) pgr.set(mine);
        var capTb = mine.reduce(function (a, v) {
          return a + (v.capacity_tb || 0); }, 0);
        var qos = mine.reduce(function (a, v) {
          return a + (v.qos_gbps || 0); }, 0);
        var kk = $("#st-kpi-cap-k"), k = $("#st-kpi-cap");
        var bar = $("#st-kpi-cap-bar");
        var q = $("#st-kpi-qos"), qs = $("#st-kpi-qos-sub");
        if (kk) kk.textContent = "할당 쿼터 (VAST)";
        if (k) k.innerHTML = capTb >= 1000
          ? (capTb / 1000).toFixed(1) + "<small> PB</small>"
          : Math.round(capTb) + "<small> TB</small>";
        if (bar) bar.style.width = mine.length ? "100%" : "0%";
        if (q) q.innerHTML = Math.round(qos).toLocaleString("en-US") +
          "<small> GB/s</small>";
        if (qs) qs.textContent = "볼륨 " + mine.length + "개 · VAST 실데이터";
      }).catch(function () {});
    });
  }

  /* 빌링 — billingUsage()+billingRates() 실렌더 (없으면 정적 유지).
     비용 라인은 pagedTable(10행) — 합계 행은 항상 하단 고정 */
  function billLineRow(l) {
    return "<tr><td>컴퓨트 — " + esc(l.order_id) + " (" +
      esc(l.blueprint_key) + " " + l.racks + "랙" +
      (l.active ? "" : " · 종료") + ")</td>" +
      '<td class="num id">' + usd(l.amount_usd) + "</td>" +
      '<td class="num" style="color:var(--muted);width:150px">' +
      (l.rack_hours || 0).toFixed(1) + " rack-h × $" +
      (l.rate_usd || 0) + "</td></tr>";
  }

  var billPager = null, billTotals = null;
  function ensureBillPager() {
    if (billPager) return billPager;
    var bar = $("#bill-pgr");
    if (!bar) return null;
    billPager = pagedTable({
      bar: bar, pageSize: 10, unit: "라인",
      render: function (page) {
        var tb = $("#bill-lines");
        if (!tb) return;
        var html = page.map(billLineRow).join("");
        if (billTotals) html +=
          '<tr><td style="color:var(--strong);font-weight:700">합계 ' +
          "(MTD · 전체 " + billTotals.count + "라인)</td>" +
          '<td class="num id" style="color:var(--strong);font-weight:700">' +
          usd(billTotals.sum) + "</td>" +
          '<td class="num" style="color:var(--muted)">월 환산 ' +
          usd(billTotals.proj) + "</td></tr>";
        tb.innerHTML = html;
      },
    });
    return billPager;
  }

  function renderBilling() {
    loadTenant().then(function (t) {
      if (!t) return;
      if (NC.api.billingUsage) NC.api.billingUsage().then(function (u) {
        if (!u || !u.lines) return;          // 폴백 — 정적 유지
        var mine = u.lines.filter(function (l) {
          return l.tenant_id === t.id;
        });
        var tb = $("#bill-lines");
        if (!tb || !mine.length) return;
        var sum = 0, proj = 0;
        mine.forEach(function (l) {
          sum += l.amount_usd || 0;
          proj += l.projected_monthly_usd || 0;
        });
        billTotals = { sum: sum, proj: proj, count: mine.length };
        var pgr = ensureBillPager();
        if (pgr) pgr.set(mine);
        var src = $("#bill-lines-src");
        if (src) src.textContent = "Control-Plane billing/usage 실데이터";
        var mtd = $("#bill-kpi-mtd"), msub = $("#bill-kpi-mtd-sub");
        var pj = $("#bill-kpi-proj"), psub = $("#bill-kpi-proj-sub");
        if (mtd) mtd.innerHTML = usdC(sum);
        if (msub) msub.textContent = "주문 " + mine.length +
          "건 · rack-hour 기반";
        if (pj) pj.innerHTML = usdC(proj);
        if (psub) psub.textContent = "활성 주문 월 환산 (Control-Plane)";
      }).catch(function () {});
      if (NC.api.billingRates) NC.api.billingRates().then(function (r) {
        if (!r || !r.rates) return;
        var box = $("#bill-rates"), rows = $("#bill-rates-rows");
        if (!box || !rows) return;
        rows.innerHTML = Object.keys(r.rates).map(function (bp) {
          return "<tr><td>" + esc(bp) + '</td><td class="id">$' +
            Number(r.rates[bp]).toLocaleString("en-US") + " / " +
            esc(r.unit || "rack-hour") + "</td></tr>";
        }).join("");
        var note = $("#bill-rates-note");
        if (note) note.textContent = r.note || "";
        box.style.display = "";
      }).catch(function () {});
    });
  }

  function renderMonitoring() {
    loadTenant().then(function (t) { renderLiveHistory(t, "monitoring"); });
  }

  /* 알림 — 피드는 라이브(alerts) · 상단 faultMetrics() KPI 칩 (폴백: 숨김) */
  function fmtSec(s) {
    if (s == null) return "—";
    if (s < 60) return (Math.round(s * 10) / 10) + "<small>s</small>";
    if (s < 3600) return (Math.round(s / 6) / 10) + "<small>m</small>";
    return (Math.round(s / 360) / 10) + "<small>h</small>";
  }
  function renderFaultKpis() {
    var band = $("#alerts-kpi");
    if (!band || !NC.api.faultMetrics) return;
    NC.api.faultMetrics().then(function (f) {
      if (!f || f.availability_pct == null) {  // 폴백 — 칩 밴드 숨김
        band.style.display = "none";
        return;
      }
      band.style.display = "";
      var av = $("#ak-avail");
      if (av) {
        av.innerHTML = f.availability_pct + "<small>%</small>";
        av.classList.toggle("green", f.availability_pct >= 99.9);
        av.classList.toggle("amber", f.availability_pct < 99.9);
      }
      var avs = $("#ak-avail-sub");
      if (avs) avs.textContent = "GPU " +
        (f.gpus_total || 0).toLocaleString("en-US") + " 기준 · Control-Plane 실측정";
      var ta = $("#ak-mtta"); if (ta) ta.innerHTML = fmtSec(f.mtta_s);
      var tr = $("#ak-mttr"); if (tr) tr.innerHTML = fmtSec(f.mttr_s);
      var op = $("#ak-open");
      if (op) {
        op.textContent = String(f.faults_open || 0);
        op.classList.toggle("amber", (f.faults_open || 0) > 0);
        op.classList.toggle("green", !(f.faults_open || 0));
      }
      var ops = $("#ak-open-sub");
      if (ops) ops.textContent = "누적 해결 " + (f.faults_resolved || 0) + "건";
    }).catch(function () {});
  }
  /* 알림 피드 "더 보기" — 라이브: faultMetrics().recent 전체 이력을
     10건씩 누적 로드. 폴백(mock)·추가분 없음: 버튼 자동 숨김 */
  var alertsShown = 0, alertsExtAll = null;
  function extAlertsFromFaults(f) {
    return (f.recent || []).map(function (x, i) {
      var res = x.resolved || x.state === "resolved";
      return { id: "AL-" + (300 + i), sev: res ? "info" : "warn",
        msg: (x.tray_id || "tray") + " XID " + x.xid +
             (res ? " — 복구 완료" : " — 대응 중"),
        at: String(x.started_at || x.at || "").slice(5, 16)
          .replace("T", " ") };
    });
  }
  function updateAlertsMore(alerts) {
    var btn = $("#alerts-more");
    if (!btn) return;
    alertsShown = (alerts || []).length;
    alertsExtAll = null;
    if (!NC.live || !NC.api.faultMetrics) { btn.style.display = "none"; return; }
    NC.api.faultMetrics().then(function (f) {
      var n = f && f.recent ? f.recent.length : 0;
      if (n > alertsShown) {
        btn.style.display = "";
        btn.textContent = "더 보기 — 외 " + (n - alertsShown) + "건 (Control-Plane 이력)";
      } else btn.style.display = "none";
    }).catch(function () { btn.style.display = "none"; });
  }
  function loadMoreAlerts() {
    var btn = $("#alerts-more"), feed = $("#alerts-feed");
    if (!btn || !feed) return;
    var p = alertsExtAll
      ? Promise.resolve(alertsExtAll)
      : NC.api.faultMetrics().then(function (f) {
          return f && f.recent ? (alertsExtAll = extAlertsFromFaults(f)) : null;
        });
    p.then(function (list) {
      if (!list || !list.length) { btn.style.display = "none"; return; }
      alertsShown = Math.min(list.length, (alertsShown || 5) + 10);
      feed.innerHTML = list.slice(0, alertsShown).map(alertItem).join("");
      if (alertsShown < list.length) {
        btn.style.display = "";
        btn.textContent = "더 보기 — 외 " + (list.length - alertsShown) +
          "건 (Control-Plane 이력)";
      } else {
        btn.style.display = "none";
        NC.toast("알림 이력 전체 " + list.length + "건을 모두 불러왔습니다");
      }
    }).catch(function () {});
  }

  function renderAlerts() {
    NC.api.alerts().then(function (as) {
      renderAlertFeeds(as);
      updateAlertsMore(as);
    });
    renderFaultKpis();
  }

  /* ══ CSV 내보내기 — 빌링(billingUsage 실데이터)·감사 로그(audit) ══
     라이브: Control-Plane 실데이터 Blob → 다운로드 · 폴백: 화면 표 기준 CSV */
  function exportBillingCsv() {
    loadTenant().then(function (t) {
      var p = NC.api.billingUsage
        ? NC.api.billingUsage() : Promise.resolve(null);
      p.then(function (u) {
        var tag = new Date().toISOString().slice(0, 10);
        var mine = u && u.lines
          ? u.lines.filter(function (l) { return !t || l.tenant_id === t.id; })
          : null;
        if (mine && mine.length) {
          var rows = [["order_id", "blueprint", "racks", "rack_hours",
            "rate_usd", "amount_usd", "projected_monthly_usd", "state"]];
          mine.forEach(function (l) {
            rows.push([l.order_id, l.blueprint_key, l.racks,
              l.rack_hours, l.rate_usd, l.amount_usd,
              l.projected_monthly_usd, l.active ? "active" : "ended"]);
          });
          downloadCsv("billing-" + (t ? t.id : "all") + "-" + tag + ".csv",
            rows);
          NC.toast("비용 CSV 내보내기 완료 — " + mine.length +
            "라인 (Control-Plane billing/usage 실데이터)");
        } else {
          var rows2 = [["항목", "금액", "비고"]];
          $$("#bill-lines tr").forEach(function (tr) {
            var tds = $$("td", tr).map(function (td) {
              return td.textContent.trim();
            });
            if (tds.length) rows2.push(tds);
          });
          downloadCsv("billing-" + tag + ".csv", rows2);
          NC.toast("비용 CSV 내보내기 완료 — 화면 표 기준 (mock 데이터)");
        }
      }).catch(function () {
        NC.toast("CSV 내보내기 실패 — 잠시 후 다시 시도해주세요", "warn");
      });
    });
  }
  function exportAuditCsv() {
    var tag = new Date().toISOString().slice(0, 10);
    var p = NC.api.audit ? NC.api.audit(200) : Promise.resolve(null);
    p.then(function (as) {
      if (as && as.length) {
        var mine = curTenant ? as.filter(function (a) {
          return !a.tenant_ref || a.tenant_ref === curTenant.id;
        }) : as;
        var rows = [["seq", "at", "actor", "action", "target", "result",
          "tenant_ref"]];
        mine.forEach(function (a) {
          rows.push([a.seq, a.at, a.actor, a.action, a.target, a.result,
            a.tenant_ref]);
        });
        downloadCsv("audit-" + tag + ".csv", rows);
        NC.toast("감사 로그 CSV 내보내기 완료 — " + mine.length +
          "행 (Control-Plane 실데이터 · 내 테넌트 스코프)");
      } else {
        var rows2 = [["log"]];
        $$('[data-screen="security"] .log div').forEach(function (d) {
          rows2.push([d.textContent.trim()]);
        });
        downloadCsv("audit-" + tag + ".csv", rows2);
        NC.toast("감사 로그 CSV 내보내기 완료 — 화면 로그 기준 (mock)");
      }
    }).catch(function () {
      NC.toast("CSV 내보내기 실패 — 잠시 후 다시 시도해주세요", "warn");
    });
  }

  /* 격리 리포트 "보기" — 라이브: 실검증 갱신 · 폴백: 데모 명시 */
  function viewIsoReport() {
    if (NC.live) {
      renderIsolation();
      NC.toast("4계층 격리 리포트를 갱신했습니다 — Control-Plane 실검증 " +
        "(배지·findings 반영)");
    } else {
      NC.toast("격리 리포트 상세 보기 (데모 · PoC 미연동)");
    }
  }

  /* 지원 — SLA 표 실수치: 가용성(faultMetrics) · 리드타임(orders history
     received→delivered 실계산) · 격리 행(isolation — 보안 화면과 동일 소스) */
  function fmtLead(s) {
    if (s < 1) return "1초 미만";
    if (s < 60) return Math.round(s) + "초";
    if (s < 3600) return (s / 60).toFixed(1) + "분";
    return (s / 3600).toFixed(1) + "시간";
  }
  function renderSlaLive() {
    if (NC.api.faultMetrics) NC.api.faultMetrics().then(function (f) {
      var el = $("#sla-avail");
      if (!el || !f || f.availability_pct == null) return; // 폴백 — 정적 유지
      el.innerHTML = '99.9% — 이번 달 <b style="color:var(--' +
        (f.availability_pct >= 99.9 ? "green-text" : "amber") + ')">' +
        f.availability_pct + "%</b> (GPU " +
        (f.gpus_total || 0).toLocaleString("en-US") +
        " · Control-Plane 실측정) · 크레딧 발생 없음";
    }).catch(function () {});
    if (NC.api.orders) NC.api.orders().then(function (os) {
      var el = $("#sla-lead");
      if (!el || !os) return;                  // 폴백 — 정적 유지
      var secs = [];
      os.forEach(function (o) {
        if (o.kind !== "new" || o.state !== "delivered") return;
        var rec = null, del = null;
        (o.history || []).forEach(function (h) {
          if (h.state === "received") rec = h.at;
          if (h.state === "delivered") del = h.at;
        });
        if (!rec || !del) return;
        var d = (Date.parse(del) - Date.parse(rec)) / 1000;
        if (d >= 0) secs.push(d);
      });
      if (!secs.length) return;
      var avg = secs.reduce(function (a, b) { return a + b; }, 0) / secs.length;
      el.textContent = "received → delivered 평균 " + fmtLead(avg) +
        " — 인도 " + secs.length + "건 실계산 (Control-Plane)";
    }).catch(function () {});
  }
  function renderSupport() {
    refreshTickets();
    renderIsolation();
    renderSlaLive();
  }

  /* 보안 — isolation 실배지 + accessPackages 실렌더 (SAN mock 유지) */
  function renderSecurity() {
    NC.api.sanitization().then(applySanitization);
    renderIsolation();
    loadTenant().then(function (t) {
      if (!t || !NC.api.accessPackages) return;
      NC.api.accessPackages(t.id).then(function (pkgs) {
        if (pkgs) renderAccessPackages(pkgs); // null → 패널 숨김 유지
      }).catch(function () {});
    });
  }

  function renderApi() { renderApiTokenLog(); }

  /* ══ 클러스터 — emuClusters() 실카드 + 워크로드 프로파일 전환 ═══
     라이브: #cl-live에 패널 렌더·정적(#cl-static) 숨김 · KPI 실집계.
     폴백(nocp 다운): emuClusters()가 null → 정적 prod-training 패널 유지 */
  var WL_PROFILES = ["training", "inference"];

  function clusterLivePanel(c, t) {
    var faults = c.fault_gpus || 0;
    var trays = c.trays || 0;
    var racks = Math.round(trays / 18);
    var seg = WL_PROFILES.map(function (p) {
      return '<span data-wl-p="' + p + '"' +
        (c.profile === p ? ' class="on"' : "") + ">" + p + "</span>";
    }).join("");
    return '<div class="panel">' +
      '<div class="ph"><span class="dot ' + (faults ? "amber" : "green") +
      '" style="width:8px;height:8px"></span>' +
      '<span class="t">' + esc(t.name) + "-" +
      esc(c.profile || "cluster") + "</span>" +
      '<span class="c mono" style="color:var(--muted2)">bare-metal · VR NVL72' +
      "</span>" +
      '<span class="c">' + esc(t.site || "—") + " · SU " +
      esc((t.sus || []).join(", ") || "—") + " · P_Key " +
      esc(t.pkey || "—") + "</span>" +
      '<span class="seg" data-wl="' + esc(c.tenant_id) +
      '" title="워크로드 프로파일 — emu 텔레메트리 실전환" ' +
      'style="margin-left:auto">' + seg + "</span>" +
      '<span style="display:flex;gap:7px">' +
      '<button class="btn" style="padding:6px 13px;font-size:11.5px" ' +
      'data-open="resize">사이즈 조정</button>' +
      '<button class="btn-ghost" data-open="console_access">콘솔 접속</button>' +
      '<button class="btn-danger" data-open="reclaim">회수 요청</button>' +
      "</span></div>" +
      '<div class="stats">' +
      "<span>랙 <b>" + racks + "</b></span>" +
      "<span>노드 <b>" + trays + "</b></span>" +
      "<span>GPU <b>" + (c.gpus || 0).toLocaleString("en-US") + "</b></span>" +
      "<span>util <b>" + Math.round(c.avg_util_pct || 0) + "%</b></span>" +
      "<span>전력 <b>" + (c.power_kw || 0).toLocaleString("en-US") +
      " kW</b>" + (c.power_cap_kw
        ? ' <span style="color:var(--muted2)">/ cap ' + c.power_cap_kw +
          "</span>" : "") + "</span>" +
      "<span>최고 온도 <b>" + (c.max_gpu_temp_c || 0) + "°C</b></span>" +
      "<span>NVLink <b>" + (c.nvlink_tbps || 0) + " TB/s</b></span>" +
      (faults
        ? '<span style="color:var(--amber)">fault GPU ' + faults + "</span>"
        : '<span style="color:var(--green-text)">모든 GPU 정상</span>') +
      "</div>" +
      '<div class="mini">Control-Plane emu 실시간 텔레메트리 — 워크로드 프로파일을 ' +
      "전환하면 util·전력·NVLink 패턴이 실제로 바뀝니다</div></div>";
  }

  function renderClusterCards(t) {
    var live = $("#cl-live"), stat = $("#cl-static");
    if (!live || !t || !NC.api.emuClusters) return;
    NC.api.emuClusters().then(function (cs) {
      if (!cs) return;                         // 폴백 — 정적 패널 유지
      var mine = (Array.isArray(cs) ? cs : []).filter(function (c) {
        return c.tenant_id === t.id;
      });
      live.innerHTML = mine.length
        ? mine.map(function (c) { return clusterLivePanel(c, t); }).join("")
        : '<div class="panel"><div class="ph"><span class="tick"></span>' +
          '<span class="t">클러스터 없음</span></div>' +
          '<div class="mini" style="margin-top:0">주문 승인·프로비저닝 완료 ' +
          "후 표시됩니다 — 아래 \"새 클러스터 생성\"으로 주문하세요</div></div>";
      live.style.display = "";
      if (stat) stat.style.display = "none";
      var gpus = 0, trays = 0, util = 0;       // KPI 밴드 — emu 실집계
      mine.forEach(function (c) {
        gpus += c.gpus || 0;
        trays += c.trays || 0;
        util += c.avg_util_pct || 0;
      });
      util = mine.length ? Math.round(util / mine.length) : 0;
      var kc = $("#kpi-clusters");
      if (kc) kc.textContent = String(mine.length);
      var ks = $("#kpi-clusters-sub");
      if (ks) ks.textContent = "bare-metal " + mine.length + " · Control-Plane 실시간";
      var kg = $("#kpi-cl-gpus");
      if (kg) kg.textContent = gpus.toLocaleString("en-US");
      var kgs = $("#kpi-cl-gpus-sub");
      if (kgs) kgs.textContent = "노드 " + trays + " · " +
        Math.round(trays / 18) + "랙";
      var ku = $("#kpi-cl-util");
      if (ku) ku.innerHTML = util + "<small>%</small>";
      var kub = $("#kpi-cl-util-bar");
      if (kub) kub.style.width = Math.max(0, Math.min(100, util)) + "%";
    }).catch(function () {});
  }

  /* ══ Managed K8s — k8sClusters() 실카드 + Day-2 설치 (라이브 전용) ═══
     라이브: #k8s-live에 클러스터 카드·설치 패널 렌더.
     폴백(nocp 다운): k8sClusters()가 null → 패널 숨김 (mock UI 불변) */
  var K8S_STATE_COLOR = { running: "green", installing: "blue",
                          deleting: "amber", failed: "red", deleted: "gray" };
  var k8sSpecCache = null;
  function loadK8sSpec() {
    if (k8sSpecCache) return Promise.resolve(k8sSpecCache);
    if (!NC.api.k8sSpec) return Promise.resolve(null);
    return NC.api.k8sSpec().then(function (sp) {
      if (sp) k8sSpecCache = sp;
      return sp;
    }).catch(function () { return null; });
  }

  function k8sClusterPanel(c) {
    var color = K8S_STATE_COLOR[c.state] || "amber";
    var conds = c.conditions || [];
    var pass = conds.filter(function (x) { return x.result === "PASS"; }).length;
    var chips = (c.addons || []).map(function (a) {
      return '<span class="chip" style="font-size:10.5px" title="' +
        esc(a.role || "") + " · " + esc(a.status || "") + '">' +
        esc(a.name) + " " + esc(a.version) + "</span>";
    }).join("");
    return '<div class="panel">' +
      '<div class="ph"><span class="dot ' + color +
      '" style="width:8px;height:8px"></span>' +
      '<span class="t">' + esc(c.name) + "</span>" +
      '<span class="c mono" style="color:var(--muted2)">Managed K8s · NKD ' +
      esc(c.nkd_version || "—") + "</span>" +
      '<span class="st ' + color + '">' + esc(c.state) + "</span>" +
      '<span class="c" style="margin-left:auto">' + esc(c.order_id || "") +
      " · " + esc(c.allocation_id || "") + "</span></div>" +
      '<div class="stats">' +
      "<span>버전 <b>" + esc(c.version || "—") + "</b></span>" +
      '<span>API VIP <b class="mono">' + esc(c.api_vip || "—") +
      ":6443</b></span>" +
      '<span title="' + esc((c.cp_node_ids || []).join(", ")) +
      '">CP 노드 <b>' + (c.cp_node_ids || []).length + "</b> (HA)</span>" +
      "<span>워커 <b>" + (c.worker_node_ids || []).length + "</b></span>" +
      "<span>GPU <b>" +
      (c.gpus_total || 0).toLocaleString("en-US") + "</b></span>" +
      "<span>DCGM <b>" + esc(c.dcgm_mode || "in-band") + "</b></span>" +
      (conds.length
        ? '<span style="color:var(--' + (pass === conds.length
            ? "green-text" : "amber") + ')">설치 검증 ' + pass + "/" +
          conds.length + " PASS</span>"
        : "") +
      "</div>" +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">' +
      chips + "</div>" +
      '<div class="mini">kubeconfig(OIDC)·API 서버 정보는 ' +
      '<a class="lnk" href="#/security">보안 화면 접속 패키지</a>에서 확인 — ' +
      "Control-Plane 실시간</div></div>";
  }

  function k8sInstallPanel(allocs, sp) {
    var vers = (sp && sp.supported_versions) || ["v1.32.4", "v1.33.2"];
    return '<div class="panel">' +
      '<div class="ph"><span class="tick"></span>' +
      '<span class="t">Managed K8s 설치 (Day-2)</span>' +
      '<span class="c">delivered BMaaS 클러스터에 K8s를 추가 설치합니다</span>' +
      "</div>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
      '<select id="k8s-alloc">' + allocs.map(function (a) {
        return '<option value="' + esc(a.alloc) + '">' + esc(a.alloc) +
          " — " + esc(a.order) + " · " + a.racks + "랙</option>";
      }).join("") + "</select>" +
      '<select id="k8s-ver">' + vers.map(function (v, i) {
        return '<option value="' + esc(v) + '"' + (i ? "" : " selected") +
          ">" + esc(v) + "</option>";
      }).join("") + "</select>" +
      '<button class="btn" id="k8s-install-btn">Managed K8s 설치</button>' +
      "</div>" +
      '<div class="mini">NKD ' + esc((sp && sp.nkd_version) || "25.06") +
      " · CP " + ((sp && sp.cp_nodes_per_cluster) || 3) +
      "노드 자동 증설 · SLA " + esc((sp && sp.cp_sla) || "99.9%") +
      " · 애드온 " + ((sp && sp.managed_addons) || []).length +
      "종 자동 구성 · DCGM in-band</div></div>";
  }

  function renderK8sPanel(t) {
    var box = $("#k8s-live");
    if (!box || !t || !NC.api.k8sClusters) return;
    if (!NC.live) { box.style.display = "none"; return; }
    Promise.all([NC.api.k8sClusters(t.id), loadK8sSpec()])
      .then(function (res) {
        var cs = res[0], sp = res[1];
        if (!cs) { box.style.display = "none"; return; }  // 폴백 — 숨김
        var alive = (Array.isArray(cs) ? cs : []).filter(function (c) {
          return c.state !== "deleted";
        });
        var html = alive.map(k8sClusterPanel).join("");
        // K8s 미설치 delivered allocation → Day-2 설치 패널 추가
        tenantAllocations().then(function (allocs) {
          var used = {};
          alive.forEach(function (c) { used[c.allocation_id] = 1; });
          var free = (allocs || []).filter(function (a) {
            return !used[a.alloc];
          });
          if (free.length) html += k8sInstallPanel(free, sp);
          if (!html) { box.style.display = "none"; return; }
          box.innerHTML = html;
          box.style.display = "";
        });
      }).catch(function () {});
  }

  function submitK8sInstall() {
    var btn = $("#k8s-install-btn");
    var aid = ($("#k8s-alloc") || {}).value;
    var ver = ($("#k8s-ver") || {}).value || "v1.32.4";
    if (!curTenant || !aid || !NC.api.k8sInstall) {
      NC.toast("설치할 allocation이 없습니다 — delivered 주문이 필요합니다",
        "warn");
      return;
    }
    if (btn) btn.disabled = true;
    NC.api.k8sInstall(curTenant.id, aid, ver).then(function (o) {
      if (btn) btn.disabled = false;
      if (!o) {
        NC.toast("K8s 설치 실패 — Control-Plane 응답 없음", "warn");
        return;
      }
      if (o.error) {                       // 409(이미 설치) 등 — 사유 표시
        NC.toast("K8s 설치 실패 — " + o.error, "warn");
        return;
      }
      NC.toast("Managed K8s 설치 시작 — " + (o.k8s_cluster_id || "") + " (" +
        ver + " · " + aid + ") · CP 3노드 자동 증설 · 애드온 자동 구성");
      loadTenant().then(renderK8sPanel);   // 카드 갱신
    }).catch(function () {
      if (btn) btn.disabled = false;
      NC.toast("K8s 설치 실패 — 잠시 후 다시 시도해주세요", "warn");
    });
  }

  function renderClusters() {
    loadTenant().then(function (t) {
      applyTenant(t);
      renderClusterCards(t);
      renderK8sPanel(t);
    });
    refreshTickets();
  }

  /* ══ 이미지 — spec() 블루프린트 카탈로그 실렌더 (폴백: 정적 표 유지)
     상세 사양(세대·MaxQ/MaxP)은 /api/v1/blueprints 보강 — 실패해도
     spec 기반으로 렌더. 커스텀 이미지 행(#images-custom)은 항상 유지 */
  var NOCP_BASE = localStorage.getItem("nc-nocp") || "http://127.0.0.1:8000";

  function bpRow(key, b, sp) {
    var perSu = (sp.racks_per_su || {})[key];
    var name = '<td class="id">' + esc(key) +
      (sp.default_blueprint === key
        ? ' <span class="st green" style="font-size:9.5px">기본</span>' : "") +
      "</td>";
    if (!b) return "<tr>" + name +
      '<td style="color:var(--muted)">블루프린트' +
      (perSu ? " · SU " + perSu + "랙" : "") + "</td>" +
      '<td class="num" style="color:var(--muted)">—</td>' +
      '<td class="num st green">stable</td></tr>';
    return "<tr>" + name +
      '<td style="color:var(--muted)">' + esc(b.model) + " · " +
      esc(b.generation) + " · GPU " + (b.gpu_per_rack || 72) + "/랙" +
      (perSu ? " · SU " + perSu + "랙" : "") + "</td>" +
      '<td class="num" style="color:var(--muted)">MaxQ ' +
      (b.maxq_rack_kw || "—") + "kW · MaxP " + (b.maxp_rack_kw || "—") +
      "kW</td>" +
      '<td class="num st ' + (b.preliminary ? "blue" : "green") + '">' +
      (b.preliminary ? "preview" : "stable") + "</td></tr>";
  }

  function renderImages() {
    if (!NC.api.spec) return;
    NC.api.spec().then(function (sp) {
      if (!sp || !sp.blueprints || !sp.blueprints.length) return; // 폴백
      fetch(NOCP_BASE + "/api/v1/blueprints")
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; })
        .then(function (bps) {
          var tb = $("#images-bp");
          if (!tb) return;
          var map = {};
          (bps || []).forEach(function (b) { map[b.key] = b; });
          tb.innerHTML = sp.blueprints.map(function (k) {
            return bpRow(k, map[k], sp);
          }).join("");
          var src = $("#images-src");
          if (src) src.textContent = "Control-Plane 블루프린트 " +
            sp.blueprints.length +
            "종 — 기본 이미지 ubuntu-24.04-nvidia (CUDA 13.1 · NCCL 2.24)";
        });
    }).catch(function () {});
  }

  /* ══ 설정 — iamRealm(tid): realm·롤 3종·클라이언트 표 실렌더.
     apikey 발급 이력(localStorage)을 클라이언트별로 연계 표기.
     폴백(nocp 다운): iamRealm null → 패널 숨김 · 정적 멤버 표 유지 */
  function renderSettings() {
    loadTenant().then(function (t) {
      var panel = $("#iam-realm-panel");
      if (!panel || !t || !NC.api.iamRealm) return;
      NC.api.iamRealm(t.id).then(function (r) {
        if (!r) { panel.style.display = "none"; return; } // 폴백 — 숨김
        var sub = $("#iam-realm-sub");
        if (sub) sub.textContent = "realm " + r.realm +
          (r.display ? " (" + r.display + ")" : "") + " · " +
          (r.state || "—") + " — Keycloak · Control-Plane 실시간";
        var roles = $("#iam-roles");
        if (roles) roles.innerHTML = (r.roles || []).map(function (x) {
          return '<span class="chip" style="font-size:11px">롤 ' + esc(x) +
            "</span>";
        }).join("");
        var log = tokenLog(), localCnt = {};
        log.forEach(function (e2) {
          localCnt[e2.client] = (localCnt[e2.client] || 0) + 1;
        });
        var tb = $("#iam-clients");
        if (tb) tb.innerHTML = (r.clients || []).map(function (c) {
          return '<tr><td class="id">' + esc(c.client_id) +
            (c.order_id ? ' <span style="color:var(--muted2)">' +
              esc(c.order_id) + "</span>" : "") + "</td>" +
            '<td style="color:var(--muted)">' + esc(c.kind || "—") + "</td>" +
            "<td>" + (c.mfa ? '<span class="st green">필수</span>'
              : '<span style="color:var(--muted2)">—</span>') + "</td>" +
            '<td class="num">' + (c.tokens_issued || 0) +
            (localCnt[c.client_id]
              ? ' <span style="color:var(--blue-text)">+' +
                localCnt[c.client_id] + " (이 브라우저)</span>" : "") +
            "</td>" +
            '<td class="id" style="color:var(--muted)">' +
            esc(c.secret_masked || "—") + "</td>" +
            '<td><span class="st ' +
            (c.state === "active" ? "green" : "amber") + '">' +
            esc(c.state || "—") + "</span></td></tr>";
        }).join("");
        var note = $("#iam-note");
        if (note) note.textContent = "토큰 발급은 API · CLI 화면의 " +
          "\"키 발급\"에서 실 IAM으로 수행됩니다 — 이 브라우저 발급 이력 " +
          log.length + "건";
        panel.style.display = "";
      }).catch(function () {});
    });
  }

  /* ══ 이벤트 버스 — 크로스 포털 효과 수신 ═════════════════════ */
  NC.bus.on("incident.resolved", function () {
    refreshTickets().then(function () {
      NC.toast("INC-0412 해결 — su-5-rack-03 tray-11 노드가 정상으로 전환되었습니다");
    });
  });
  NC.bus.on("sanitization.step", function (s) {
    applySanitization(s);
    if (s && s.cert_ready)
      NC.toast("SAN-0691 Sanitization 증명서가 발급되었습니다 — PDF 다운로드 가능");
  });
  // 테넌트 전환 — 사이드바 select(NC.setTenant) → 현재 화면 재렌더
  NC.bus.on("tenant.changed", function () {
    renderTenantScope();
    refreshTickets();
    NC.route();                              // 현재 화면 onShow 재실행
  });

  /* ══ 모달 확정 액션 ═══════════════════════════════════════════
     라이브 실연동: ticket(createTicket) · create_cluster/resize(createOrder)
     · reclaim(terminateOrder) · apikey(iamToken).
     nocp 대응물 없는 액션·폴백: 데모 토스트 유지 — "(PoC 미연동)" 명시. */
  var ACTION_TOAST = {
    create_cluster: "클러스터 주문 요청이 접수되었습니다 (데모) — 운영 승인 게이트로 전달",
    resize:         "사이즈 조정(32→40랙) 요청이 접수되었습니다 (데모)",
    reclaim:        "회수 요청이 접수되었습니다 (데모) — Sanitization 후 증명서 발급",
    console_access: "웹 콘솔(PAM) 세션 요청이 접수되었습니다 (데모 · PoC 미연동) — 세션 녹화·TTL 60분",
    reboot:         "노드 재부팅 요청이 접수되었습니다 (데모 · PoC 미연동) — 드레인 후 4–6분 소요",
    volume:         "볼륨 생성 요청이 접수되었습니다 (데모 · PoC 미연동) — 즉시 프로비저닝",
    qos:            "QoS 변경 요청이 접수되었습니다 (데모 · PoC 미연동) — 티켓 자동 생성·무중단 적용",
    snapshot:       "스냅샷 생성 요청이 접수되었습니다 (데모 · PoC 미연동) — copy-on-write 즉시 생성",
    pkey_req:       "IB 파티션 확장 신청이 접수되었습니다 (데모 · PoC 미연동) — SLA 4시간 내 응답",
    alert_rule:     "알림 룰 저장 요청이 접수되었습니다 (데모 · PoC 미연동)",
    ticket:         "지원 티켓 생성 요청이 접수되었습니다 (데모) — 진단 스냅샷 자동 첨부",
    apikey:         "API 키 발급 요청이 접수되었습니다 (데모) — 시크릿은 1회만 표시",
    invite:         "멤버 초대 요청이 접수되었습니다 (데모 · PoC 미연동) — 초대 메일 발송",
  };

  /* ── 주문 공통: 에러 표시 + 주문 후 화면 갱신 ─────────────── */
  function orderErr(o) {
    return (o && o.error) || "주문 처리 실패 — 잠시 후 다시 시도해주세요";
  }
  function afterOrderChange() {
    renderTenantScope();
    refreshTickets();
    renderSysChip();
    NC.route();                              // 현재 화면 onShow 재실행
  }

  /* create_cluster — 모달 입력값 → createOrder 실주문 */
  function submitCreateClusterLive() {
    var bp = ($("#cc-bp") || {}).value || "vr-nvl72";
    var racks = parseInt(($("#cc-racks") || {}).value, 10) || 16;
    var stMode = ($("#cc-storage") || {}).value || "auto";
    var k8sOn = ($("#cc-k8s") || {}).checked;      // Managed K8s 옵션
    var body = { tenant_id: curTenant.id, kind: "new",
                 blueprint_key: bp, racks: racks, storage_mode: "auto" };
    if (stMode === "manual") {
      body.storage_mode = "manual";
      body.storage_tb = racks * 1000;
      body.storage_gbps = racks * 80;
    }
    if (k8sOn) {
      body.managed_k8s = true;
      body.k8s_version = ($("#cc-k8s-ver") || {}).value || "v1.32.4";
    }
    NC.closeModal();
    NC.api.createOrder(body).then(function (o) {
      if (!o) {
        NC.toast("주문 실패 — Control-Plane 응답 없음 (콘솔 로그 확인)", "warn");
        return;
      }
      if (o.state === "delivered") {
        NC.toast(o.id + " → delivered · GPU " +
          (racks * 72).toLocaleString("en-US") + "개 할당 (" + bp + " " +
          racks + "랙 · " + ((o.allocation_ids || [])[0] || "") + ")" +
          (o.managed_k8s ? " · Managed K8s " + (o.k8s_version || "") +
            " (" + (o.k8s_cluster_id || "설치 중") + ")" : ""));
        afterOrderChange();
      } else if (o.state === "rejected" || o.state === "failed") {
        NC.toast("주문 " + o.id + " " + o.state + " — " + orderErr(o), "warn");
      } else {
        NC.toast("주문 " + o.id + " 상태: " + o.state +
          (o.pending_stage ? " · 승인 대기(" + o.pending_stage + ")" : ""));
        afterOrderChange();
      }
    });
  }

  /* resize — 확장은 createOrder(kind new, racks=추가분) · 축소는 안내 */
  function submitResizeLive() {
    var n = parseInt(($("#rs-racks") || {}).value, 10) || 0;
    NC.closeModal();
    if (n <= 0) {
      NC.toast("축소는 부분 회수로 처리됩니다 — 회수 메뉴에서 " +
        "allocation 단위로 진행하세요", "warn");
      return;
    }
    NC.api.createOrder({ tenant_id: curTenant.id, kind: "new",
      blueprint_key: "vr-nvl72", racks: n, storage_mode: "auto",
    }).then(function (o) {
      if (!o) { NC.toast("확장 실패 — Control-Plane 응답 없음", "warn"); return; }
      if (o.state === "delivered") {
        NC.toast("확장 " + o.id + " → delivered · +" + n + "랙 (+" +
          (n * 72).toLocaleString("en-US") + " GPU)");
        afterOrderChange();
      } else if (o.state === "rejected" || o.state === "failed") {
        NC.toast("확장 " + o.id + " " + o.state + " — " + orderErr(o), "warn");
      } else {
        NC.toast("확장 " + o.id + " 상태: " + o.state);
        afterOrderChange();
      }
    });
  }

  /* reclaim — 모달 select를 실 allocation으로 채우고 terminateOrder */
  function tenantAllocations() {
    return NC.api.orders().then(function (os) {
      if (!os || !curTenant) return null;
      var gone = {};                         // 이미 회수된 allocation
      os.forEach(function (o) {
        if (o.kind === "terminate" && o.allocation_id &&
            o.state !== "failed" && o.state !== "rejected")
          gone[o.allocation_id] = true;
      });
      var out = [];
      os.forEach(function (o) {
        if (o.tenant_id !== curTenant.id || o.kind !== "new") return;
        (o.allocation_ids || []).forEach(function (aid) {
          if (!gone[aid]) out.push({ alloc: aid, order: o.id,
            racks: o.racks });
        });
      });
      return out;
    });
  }
  function fillReclaimSelect() {
    var sel = $("#rc-alloc");
    if (!sel || !curTenant || !NC.api.orders) return;
    tenantAllocations().then(function (list) {
      if (!list) return;                     // 폴백 — 데모 옵션 유지
      sel.innerHTML = list.length
        ? list.map(function (a) {
            return '<option value="' + esc(a.alloc) + '">' + esc(a.alloc) +
              " — " + esc(a.order) + " · " + a.racks + "랙 전체 회수" +
              "</option>";
          }).join("")
        : '<option value="">회수 가능한 allocation 없음</option>';
    }).catch(function () {});
  }
  NC.bus.on("modal.open", function (id) {
    if (id === "reclaim") fillReclaimSelect();
  });

  function submitReclaimLive() {
    var sel = $("#rc-alloc");
    var aid = (sel && sel.value) || "";
    NC.closeModal();
    if (!aid) {
      NC.toast("회수할 allocation이 없습니다 — 개통(delivered)된 주문이 " +
        "필요합니다", "warn");
      return;
    }
    NC.api.terminateOrder(curTenant.id, aid).then(function (o) {
      if (!o) { NC.toast("회수 실패 — Control-Plane 응답 없음", "warn"); return; }
      if (o.state === "rejected" || o.state === "failed") {
        NC.toast("회수 " + o.id + " " + o.state + " — " + orderErr(o), "warn");
      } else {
        NC.toast("회수 " + o.id + " → " + o.state + " · " + aid +
          " — Sanitization 후 풀 반환·증명서 발급");
        afterOrderChange();
      }
    });
  }

  /* apikey — accessPackages의 OIDC client로 iamToken 실 발급.
     회수된 주문의 client는 revoke 상태 → 최신→과거 순으로 활성 client를
     찾을 때까지 순차 시도, 전부 실패 시 데모 토스트 폴백. */
  function tryIamToken(cands) {
    if (!cands.length) return Promise.resolve(null);
    var cid = cands.shift();
    return NC.api.iamToken({ client_id: cid }).then(function (t) {
      if (t && t.access_token) return { cid: cid, tok: t };
      return tryIamToken(cands);
    });
  }
  function submitApikeyLive() {
    var name = (($("#ak-name") || {}).value || "").trim();
    NC.closeModal();
    NC.api.accessPackages(curTenant.id).then(function (pkgs) {
      var cands = (pkgs || []).map(function (p) {
        return p.pkg && p.pkg.api && p.pkg.api.client_id;
      }).filter(Boolean).reverse();          // 최신 주문의 client 우선
      return tryIamToken(cands);
    }).then(function (r) {
      if (!r) { NC.toast(ACTION_TOAST.apikey); return; }  // 폴백 — 데모
      var t = r.tok;
      var masked = t.access_token.slice(0, 4) + "…" +
        t.access_token.slice(-6);
      pushTokenLog({
        at: new Date().toISOString().slice(5, 16).replace("T", " "),
        client: r.cid, name: name, token: masked, scope: t.scope || "",
      });
      NC.toast("IAM 토큰 발급 완료 — " + r.cid + " · " + masked + " (유효 " +
        Math.round((t.expires_in || 3600) / 60) + "분) · 전체 값은 지금 " +
        "1회만 복사하세요");
      resetModalInputs("apikey");
      renderApiTokenLog();
    }).catch(function () {
      NC.toast(ACTION_TOAST.apikey);          // 폴백 — 데모
    });
  }

  function submitTicketLive() {
    var subjEl = $("#tkt-subject"), sevEl = $("#tkt-sev");
    var subject = (subjEl && subjEl.value.trim()) || "고객 콘솔 문의";
    var sevTxt = (sevEl && sevEl.value) || "P2";
    var severity = sevTxt.indexOf("P1") === 0 ? "critical"
                 : sevTxt.indexOf("P3") === 0 ? "medium" : "high";
    NC.closeModal();
    NC.api.createTicket({
      tenant_id: curTenant.id, subject: subject,
      severity: severity, body: "고객 콘솔 접수",
    }).then(function (t) {
      if (t && t.id) {
        NC.toast("지원 티켓 " + t.id + " 접수 완료 — Control-Plane 실 생성 (" +
          severity + ")");
        resetModalInputs("ticket");          // 모달·퀵폼 입력 초기화
        refreshTickets();
      } else {
        NC.toast(ACTION_TOAST.ticket);       // 라이브 이탈 → 데모 폴백
      }
    }).catch(function () {
      NC.toast("티켓 접수 실패 — 잠시 후 다시 시도해주세요", "warn");
    });
  }

  /* ══ 모달 오프너 보강 — 행 컨텍스트 타이틀·퀵폼 프리필 ═══════ */
  function prepModal(op) {
    var id = op.dataset.open;
    var tr = op.closest("tr");
    var cell = tr ? tr.querySelector(".id") : null;
    var rowId = cell ? cell.textContent.trim() : "";
    if (id === "reboot") {
      var rt = $("#reboot-title");
      if (rt) rt.textContent = "노드 재부팅 — " + (rowId || "nh-su-5-r00-t00");
    } else if (id === "snapshot") {
      var path = rowId || "/vast/fin-corp/ds01";
      var stt = $("#snap-title");
      if (stt) stt.textContent = "스냅샷 생성 — " + path;
      var nm = $("#snap-name");
      if (nm) {
        var seg = path.split("/").filter(Boolean).pop() || "vol";
        var mmdd = new Date().toISOString().slice(5, 10).replace("-", "");
        nm.value = "snap-" + seg + "-" + mmdd + "-manual";
      }
    } else if (id === "qos") {
      var qt = $("#qos-title");
      if (qt) qt.textContent = "QoS 변경 요청 — " +
        (rowId || "/vast/fin-corp/ds01");
    } else if (id === "ticket") {
      var qs = $("#sup-q-subject"), sv = $("#sup-q-sev");
      var ts = $("#tkt-subject"), sevSel = $("#tkt-sev");
      if (qs && qs.value.trim() && ts) ts.value = qs.value.trim();
      if (sv && sv.value && sevSel)
        Array.prototype.forEach.call(sevSel.options, function (o) {
          if (o.value.indexOf(sv.value) === 0) sevSel.value = o.value;
        });
    }
  }

  /* ══ 모달 확정 빈 값 가드 — 실패 시 경고 토스트·모달 유지 ═════ */
  function guardFail(el, msg) {
    NC.toast(msg, "warn");
    if (el && el.focus) el.focus();
    return false;
  }
  var GUARDS = {
    ticket: function () {
      var el = $("#tkt-subject");
      return el && el.value.trim() ? true
        : guardFail(el, "티켓 제목을 입력하세요 — 빈 제목은 접수할 수 없습니다");
    },
    volume: function () {
      var el = $("#vol-path");
      var v = el ? el.value.trim() : "";
      if (!v) return guardFail(el,
        "볼륨 경로를 입력하세요 (예: /vast/fin-corp/ds02)");
      if (v.charAt(0) !== "/")
        return guardFail(el, "볼륨 경로는 /로 시작해야 합니다");
      return true;
    },
    snapshot: function () {
      var el = $("#snap-name");
      return el && el.value.trim() ? true
        : guardFail(el, "스냅샷 이름을 입력하세요");
    },
    apikey: function () {
      var el = $("#ak-name");
      return el && el.value.trim() ? true
        : guardFail(el, "키 이름을 입력하세요 (예: eval-pipeline)");
    },
    invite: function () {
      var el = $("#inv-email");
      var v = el ? el.value.trim() : "";
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? true
        : guardFail(el, "올바른 이메일 주소를 입력하세요 (예: name@fin-corp.com)");
    },
  };
  function resetModalInputs(a) {
    var map = { ticket: ["#tkt-subject", "#sup-q-subject"],
      volume: ["#vol-path"], apikey: ["#ak-name"], invite: ["#inv-email"] };
    (map[a] || []).forEach(function (sel) {
      var el = $(sel);
      if (el) el.value = "";
    });
  }

  /* ══ 기간 세그먼트(6h/24h/7d/30d) — 라이브: emu 히스토리 리샘플 ══ */
  var SEG_LIMITS = { "6h": 120, "24h": 240, "7d": 360, "30d": 480 };
  function applyRangeSeg(sg) {
    var label = sg.textContent.trim();
    var scr = sg.closest("[data-screen]");
    var hasCharts = scr && scr.querySelector("[data-mon]");
    if (NC.live && hasCharts && NC.api.emuHistory) {
      loadTenant().then(function (t) {
        if (!t) return;
        NC.api.emuHistory(t.id, SEG_LIMITS[label] || 120)
          .then(function (h) {
            if (h && h.length) {
              updateMonCharts(scr, h);
              NC.toast("차트 기간 " + label + " — emu 히스토리 " +
                h.length + "포인트 반영 (Control-Plane)");
            } else NC.toast("기간 " + label +
              " 전환 — 표시할 히스토리가 없습니다", "warn");
          }).catch(function () {});
      });
    } else {
      NC.toast("기간 " + label +
        " 전환 (데모 · PoC 미연동) — Control-Plane 연동 시 실데이터 리샘플");
    }
  }

  var ID_ACTIONS = {
    "alerts-readall": markAlertsRead,
    "alerts-more": loadMoreAlerts,
    "bill-csv": exportBillingCsv,
    "audit-csv": exportAuditCsv,
    "iso-view": viewIsoReport,
    "k8s-install-btn": submitK8sInstall,
  };

  document.addEventListener("click", function (e) {
    /* 명시적 데모 버튼 — data-demo="동작 설명" */
    var demo = e.target.closest("[data-demo]");
    if (demo) {
      NC.toast(demo.dataset.demo + " (데모 · PoC 미연동)");
      return;
    }
    /* 클립보드 복사 — data-copy="텍스트" */
    var cp = e.target.closest("[data-copy]");
    if (cp) { copyText(cp.dataset.copy); return; }
    /* 단일 id 액션 (모두 읽음 · 더 보기 · CSV ×2 · 격리 보기) */
    var one = e.target.closest(
      "#alerts-readall,#alerts-more,#bill-csv,#audit-csv,#iso-view," +
      "#k8s-install-btn");
    if (one) { ID_ACTIONS[one.id](); return; }
    /* 모달 오프너 — 동적 타이틀·프리필 (shared/app.js가 오픈 수행) */
    var op = e.target.closest("[data-open]");
    if (op) prepModal(op);                   // return 없음 — 오픈은 공용 셸
    /* 워크로드 프로파일 세그먼트 — setWorkload 실전환 (라이브 전용) */
    var wl = e.target.closest("[data-wl-p]");
    if (wl) {
      var wrap = wl.closest("[data-wl]");
      if (wrap && !wl.classList.contains("on")) {
        var wlTid = wrap.dataset.wl, wlProf = wl.dataset.wlP;
        if (NC.live && NC.api.setWorkload) {
          NC.api.setWorkload(wlTid, wlProf).then(function (r) {
            if (!r) {
              NC.toast("워크로드 전환 실패 — Control-Plane 응답 없음", "warn");
              return;
            }
            NC.toast("워크로드 프로파일 전환: " + (r.profile || wlProf) +
              " — emu 텔레메트리 패턴이 실제로 변경됩니다 (Control-Plane 실전환)");
            loadTenant().then(renderClusterCards);
          }).catch(function () {
            NC.toast("워크로드 전환 실패 — 잠시 후 다시 시도해주세요", "warn");
          });
        } else {
          NC.toast("워크로드 전환은 Control-Plane 연동 시 사용할 수 있습니다 " +
            "(mock 모드)", "warn");
        }
      }
      return;
    }
    /* 기간 세그먼트 (6h/24h/…) — 워크로드 seg 제외한 나머지 .seg.
       이미 선택된 세그 재클릭도 리프레시로 동작 (무반응 0 원칙) */
    var sg = e.target.closest(".seg span");
    if (sg && !sg.closest("[data-wl]")) {
      $$("span", sg.parentNode).forEach(function (s2) {
        s2.classList.toggle("on", s2 === sg);
      });
      applyRangeSeg(sg);
      return;
    }
    var act = e.target.closest("[data-act]");
    if (act) {
      var a = act.dataset.act;
      if (GUARDS[a] && !GUARDS[a]()) return; // 빈 값 가드 — 모달 유지
      var liveReady = NC.live && curTenant;  // 미기동 → 데모 토스트 폴백
      if (a === "ticket" && liveReady && NC.api.createTicket) {
        submitTicketLive(); return;          // Control-Plane 실 접수
      }
      if (a === "create_cluster" && liveReady && NC.api.createOrder) {
        submitCreateClusterLive(); return;   // 실주문 (POST /orders)
      }
      if (a === "resize" && liveReady && NC.api.createOrder) {
        submitResizeLive(); return;          // 확장 실주문 / 축소 안내
      }
      if (a === "reclaim" && liveReady && NC.api.terminateOrder) {
        submitReclaimLive(); return;         // 회수 실주문 (terminate)
      }
      if (a === "apikey" && liveReady && NC.api.iamToken) {
        submitApikeyLive(); return;          // IAM 토큰 실 발급
      }
      NC.closeModal();
      NC.toast(ACTION_TOAST[a] || "요청이 접수되었습니다 (데모)");
      resetModalInputs(a);                   // 다음 입력 대비 초기화
      return;
    }
    var san = e.target.closest(".san-pdf");
    if (san && !san.disabled) {
      var pdf = sanState ? sanState.pdf : "SAN-0691-cert.pdf";
      NC.toast("Sanitization 증명서 " + pdf + " 다운로드를 시작합니다 (데모)");
    }
  });

  // create_cluster 모달 — K8s 옵션 체크 시 "포함" 문구에 CP 3노드 표시
  document.addEventListener("change", function (e) {
    if (e.target && e.target.id === "cc-k8s") {
      var note = $("#cc-k8s-note");
      if (note) note.style.display = e.target.checked ? "" : "none";
    }
  });

  /* ══ 부트스트랩 ═══════════════════════════════════════════════ */
  NC.start({
    dashboard: renderDashboard,
    clusters: renderClusters,
    nodes: renderNodes,
    images: renderImages,
    storage: renderStorage,
    network: renderNetwork,
    monitoring: renderMonitoring,
    alerts: renderAlerts,
    billing: renderBilling,
    support: renderSupport,
    security: renderSecurity,
    api: renderApi,
    settings: renderSettings,
  });

  // 사이드바 테넌트 select — 변경 시 NC.setTenant → bus "tenant.changed"
  var tsel = $("#tenant-select");
  if (tsel) tsel.addEventListener("change", function () {
    if (this.value && NC.setTenant) NC.setTenant(this.value);
  });

  // 사이드바 배지 등 전역 표시는 첫 진입 화면과 무관하게 채운다
  renderTenantScope();
  refreshTickets();
  NC.api.alerts().then(renderAlertFeeds);   // 알림 배지 = alerts() 건수
  NC.api.sanitization().then(applySanitization);
  renderSysChip();                          // "모든 시스템 정상" 칩 동기
  renderApiTokenLog();                      // IAM 발급 이력 (localStorage)
})();
