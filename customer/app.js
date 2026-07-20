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

  /* ══ 테넌트 세션 (localStorage nc-session) — 로그인 테넌트 고정 ══
     nocp-api.js가 세션 헤더 부착·목록 필터·403 표면화를 담당하고,
     여기서는 세션 UI·데모 로그인 전환·역할 게이팅(RBAC)을 담당한다. */
  var DEMO_USERS = [
    { user: "김지현", tenant_id: "tnt-fin-corp",
      tenant_name: "fin-corp", av: "JH" },
    { user: "박현우", tenant_id: "tnt-hyperscale-x",
      tenant_name: "hyperscale-x", av: "HW" },
    { user: "이서연", tenant_id: "tnt-gamma-labs",
      tenant_name: "gamma-labs", av: "SY" },
  ];
  var DEMO_ROLES = [
    ["admin", "org admin", "전체 권한 — 승인·종료·초대 포함"],
    ["member", "member", "일반 작업 — 승인·종료·초대 제외"],
    ["viewer", "viewer", "읽기 전용 — 모든 변경 불가"],
  ];
  var DEFAULT_SESSION = { tenant_id: "tnt-fin-corp",
    tenant_name: "fin-corp", user: "김지현", role: "admin" };

  function getSession() {
    try {
      var s = JSON.parse(localStorage.getItem("nc-session") || "null");
      if (s && s.tenant_id && s.role) return s;
    } catch (e) {}
    return DEFAULT_SESSION;
  }
  function setSession(s) {
    try { localStorage.setItem("nc-session", JSON.stringify(s)); }
    catch (e) {}
    NC.bus.emit("session.changed", s);
  }

  /* ── RBAC 중앙 헬퍼 — can(action) ─────────────────────────────
     viewer: 모든 변경 액션 불가 · member: admin 전용 액션만 불가 */
  var CHANGE_ACTIONS = { create_cluster: 1, resize: 1, reclaim: 1,
    reboot: 1, volume: 1, qos: 1, snapshot: 1, pkey_req: 1, alert_rule: 1,
    ticket: 1, apikey: 1, invite: 1, accept_approve: 1, accept_reject: 1,
    k8s_install: 1, terminate: 1, workload: 1, demo_change: 1 };
  var ADMIN_ONLY = { accept_approve: 1, accept_reject: 1, reclaim: 1,
    terminate: 1, invite: 1 };
  function can(action) {
    var r = getSession().role;
    if (r === "admin") return true;
    if (r === "viewer") return !CHANGE_ACTIONS[action];
    return !ADMIN_ONLY[action];              // member
  }
  NC.can = can;

  // 변경성 데모 버튼(data-demo) 판별 — 발급·회수·편집류만 게이팅
  var DEMO_CHANGE_RE =
    /등록|폐기|로테이션|복원|편집|프로젝트 생성|재발행|예약/;
  function gateActionOf(el) {
    if (el.id === "k8s-install-btn") return "k8s_install";
    if (el.id === "term-confirm-btn") return "terminate";
    if (el.dataset && el.dataset.wlP != null) return "workload";
    if (el.dataset && el.dataset.invResend != null) return "invite";
    if (el.dataset && el.dataset.demo != null)
      return DEMO_CHANGE_RE.test(el.dataset.demo) ? "demo_change" : null;
    var a = (el.dataset && (el.dataset.act || el.dataset.open)) || "";
    if (a === "acceptance") return null;     // PT 리포트 열람은 조회 (버튼별 게이팅)
    if (a === "console_access" || a === "demo_login") return null;
    return CHANGE_ACTIONS[a] ? a : null;
  }
  function gateTitle(role) {
    return role === "viewer" ? "viewer 권한 — 읽기 전용"
      : "admin 전용 — " + role + " 권한으로는 실행할 수 없습니다";
  }

  /* 게이팅 적용 — 버튼 disabled + .rbac-off + title. 동적 렌더(클러스터
     카드·인수 카드 등)는 MutationObserver가 재적용한다 */
  function applyRbacGates() {
    var role = getSession().role;
    $$("[data-open],[data-act],[data-wl-p],[data-demo],[data-inv-resend]," +
       "#k8s-install-btn,#term-confirm-btn").forEach(function (el) {
      var act = gateActionOf(el);
      var denied = !!act && !can(act);
      var isBtn = el.tagName === "BUTTON" || el.tagName === "INPUT";
      if (denied) {
        if (!el.classList.contains("rbac-off")) {
          if (el.title) el.dataset.rbacTitle = el.title;
          el.classList.add("rbac-off");
          el.setAttribute("aria-disabled", "true");
          if (isBtn && !el.disabled) {
            el.disabled = true;
            el.dataset.rbacDis = "1";
          }
        }
        el.title = gateTitle(role);
      } else if (el.classList.contains("rbac-off")) {
        el.classList.remove("rbac-off");
        el.removeAttribute("aria-disabled");
        el.title = el.dataset.rbacTitle || "";
        delete el.dataset.rbacTitle;
        if (isBtn && el.dataset.rbacDis) {
          el.disabled = false;
          delete el.dataset.rbacDis;
        }
      }
    });
  }

  // 캡처 단계 차단 — shared/app.js 모달 오프너·액션 핸들러보다 먼저 실행
  document.addEventListener("click", function (e) {
    var el = e.target.closest(
      "[data-open],[data-act],[data-wl-p],[data-demo],[data-inv-resend]," +
      "#k8s-install-btn,#term-confirm-btn");
    if (!el) return;
    var act = gateActionOf(el);
    if (act && !can(act)) {
      e.preventDefault();
      e.stopPropagation();
      NC.toast(gateTitle(getSession().role) + " — 관리자에게 요청하세요",
        "warn");
    }
  }, true);

  // 동적 렌더 후 게이트 재적용 (childList만 관찰 — 속성 변경 무한루프 방지)
  var rbacMoT = null;
  new MutationObserver(function () {
    clearTimeout(rbacMoT);
    rbacMoT = setTimeout(applyRbacGates, 80);
  }).observe(document.body, { childList: true, subtree: true });

  /* ── 세션 UI — 사이드바 사용자 카드 · 톱바 뱃지 · 인사말 ────── */
  function roleBadge(role) {
    var lbl = role === "admin" ? "org admin" : role;
    return '<span class="role-bd ' + esc(role) + '">' + esc(lbl) + "</span>";
  }
  function applySessionUi() {
    var s = getSession();
    var demo = null;
    DEMO_USERS.forEach(function (u) {
      if (u.tenant_id === s.tenant_id && u.user === s.user) demo = u;
    });
    var av = $("#user-av");
    if (av) av.textContent = (demo && demo.av) ||
      s.user.charAt(0).toUpperCase();
    var nm = $("#user-name");
    if (nm) nm.textContent = s.user;
    var rl = $("#user-role");
    if (rl) rl.innerHTML = roleBadge(s.role) + " · " + esc(s.tenant_name) +
      (s.role === "viewer" ? " · 읽기 전용" : " · MFA ✓");
    var chip = $("#session-chip-tx");
    if (chip) chip.innerHTML = esc(s.user) + " · " + esc(s.tenant_name) +
      " " + roleBadge(s.role);
    var hero = $("#hero-hi");
    if (hero) hero.textContent = "안녕하세요, " + s.user + " 님";
    var org = $("#org-cell");
    if (org) org.innerHTML = esc(s.tenant_name) +
      ' <span class="mono" style="color:var(--muted2);font-size:10px">' +
      esc(s.tenant_id) + "</span> · 계약 reserved";
    var sav = $("#scope-avatar");
    if (sav) sav.textContent =
      (s.tenant_name || "?").charAt(0).toUpperCase();
  }

  /* ── 데모 로그인 전환 모달 ──────────────────────────────────── */
  function fillDemoLogin() {
    var s = getSession();
    var ub = $("#dl-users");
    if (ub) ub.innerHTML = DEMO_USERS.map(function (u, i) {
      var on = u.tenant_id === s.tenant_id && u.user === s.user;
      return '<label class="dl-opt' + (on ? " on" : "") + '">' +
        '<input type="radio" name="dl-user" value="' + i + '"' +
        (on ? " checked" : "") + "><b>" + esc(u.user) + "</b>" +
        '<span style="color:var(--muted)">' + esc(u.tenant_name) + "</span>" +
        '<span class="sub">' + esc(u.tenant_id) + "</span></label>";
    }).join("");
    var rb = $("#dl-roles");
    if (rb) rb.innerHTML = DEMO_ROLES.map(function (r) {
      var on = r[0] === s.role;
      return '<label class="dl-opt' + (on ? " on" : "") +
        '" title="' + esc(r[2]) + '">' +
        '<input type="radio" name="dl-role" value="' + esc(r[0]) + '"' +
        (on ? " checked" : "") + "><b>" + esc(r[1]) + "</b></label>";
    }).join("");
  }
  function submitDemoLogin() {
    var ui = parseInt((document.querySelector(
      'input[name="dl-user"]:checked') || {}).value, 10) || 0;
    var role = (document.querySelector(
      'input[name="dl-role"]:checked') || {}).value || "admin";
    var u = DEMO_USERS[ui] || DEMO_USERS[0];
    NC.closeModal();
    setSession({ tenant_id: u.tenant_id, tenant_name: u.tenant_name,
      user: u.user, role: role });
    NC.toast("로그인: " + u.user + " (" + u.tenant_name + " · " + role + ")");
  }
  document.addEventListener("change", function (e) {
    if (e.target && (e.target.name === "dl-user" ||
        e.target.name === "dl-role")) {
      $$('input[name="' + e.target.name + '"]').forEach(function (i2) {
        var lb = i2.closest(".dl-opt");
        if (lb) lb.classList.toggle("on", i2.checked);
      });
    }
  });

  /* ── 정적 데모 마크업 스코프 스크럽 — 정적 데모 데이터는 fin-corp
     소유. 타 테넌트 세션이면 테넌트 귀속 컨테이너를 빈 상태로 교체한다
     (mock·live 공통 — live 렌더러가 이후 실데이터로 다시 채움) ────── */
  var scrubCache = {};                       // sel → 원본 innerHTML (복원용)
  function scrubPut(sel, html) {
    var el = sel.charAt(0) === "#" ? $(sel) : document.querySelector(sel);
    if (!el) return;
    if (!(sel in scrubCache)) scrubCache[sel] = el.innerHTML;
    el.innerHTML = html;
  }
  function scrubRestore() {
    Object.keys(scrubCache).forEach(function (sel) {
      var el = sel.charAt(0) === "#" ? $(sel) : document.querySelector(sel);
      if (el) el.innerHTML = scrubCache[sel];
    });
    scrubCache = {};
    var st = $("#cl-static");
    if (st) st.style.display = "";
  }
  function applyMockScope() {
    var s = getSession();
    if ((s.tenant_name || "") === "fin-corp") {
      if (Object.keys(scrubCache).length) scrubRestore();
      return;
    }
    var EMPTY_NOTE =
      "이 테넌트에 귀속된 데이터가 없습니다 (테넌트 격리)";
    scrubPut("#my-clusters", '<div class="ccard" style="color:var(--muted);' +
      'font-size:11.5px">클러스터 없음 — ' + EMPTY_NOTE + "</div>");
    var st = $("#cl-static");
    if (st) st.style.display = "none";
    var cl = $("#cl-live");
    if (cl && !cl.innerHTML.trim()) {
      cl.style.display = "";
      cl.innerHTML = '<div class="panel"><div class="ph">' +
        '<span class="tick"></span><span class="t">클러스터 없음</span></div>' +
        '<div class="mini" style="margin-top:0">' + EMPTY_NOTE + "</div></div>";
    }
    scrubPut("#nodes-tbody",
      '<tr><td colspan="6" style="color:var(--muted2)">' +
      "노드 없음 — " + EMPTY_NOTE + "</td></tr>");
    if (!NC.live) $$("[data-node-summary]").forEach(function (el) {
      el.textContent = "0 노드";             // live는 renderNodes가 실계산
    });
    scrubPut("#storage-volumes",
      '<tr><td colspan="5" style="color:var(--muted2)">' +
      "할당된 볼륨 없음 — " + EMPTY_NOTE + "</td></tr>");
    scrubPut("#dash-cost-lines",
      '<tr><td colspan="3" style="color:var(--muted2)">' +
      "비용 데이터 없음 — " + EMPTY_NOTE + "</td></tr>");
    scrubPut("#bill-lines",
      '<tr><td colspan="3" style="color:var(--muted2)">' +
      "비용 라인 없음 — " + EMPTY_NOTE + "</td></tr>");
    scrubPut("#bill-invoices",
      '<tr><td colspan="4" style="color:var(--muted2)">' +
      "발행된 인보이스 없음 — " + EMPTY_NOTE + "</td></tr>");
    scrubPut("#images-custom", "");
    var vt = $("#net-vpc-title");
    if (vt) vt.textContent = "내 VPC — seg-" + s.tenant_name;
    scrubPut("#net-vrf", "—");
    scrubPut('[data-screen="security"] .log',
      '<div style="color:var(--muted2)">이 테넌트의 감사 로그가 없습니다 — ' +
      "Control-Plane 연동 시 실데이터 표시</div>");
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

  /* ══ 사이드바 테넌트 스코프 — 로그인 테넌트 고정 표시 (전환 불가).
     기존 조직/프로젝트 select는 격리 원칙 위반(타 테넌트 열람)으로 제거 ══ */
  function renderTenantScope() {
    var s = getSession();
    var nameEl = $("#scope-tenant"), scaleEl = $("#scope-scale");
    if (nameEl) nameEl.textContent = s.tenant_name;
    loadTenant().then(function (cur) {
      var racks = (cur && cur.racks) || 0;
      if (scaleEl) scaleEl.textContent = (racks
        ? racks + "랙 · GPU " + (racks * 72).toLocaleString("en-US")
        : "할당 랙 없음") + " · 로그인 테넌트 고정";
      var av = $("#scope-avatar");
      if (av) av.textContent = s.tenant_name.charAt(0).toUpperCase();
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

  /* 티켓 유형·라우팅 (P2-4) — type: tech|change|billing_dispute,
     routed_to: ops|biz. 구 데이터(필드 없음)는 기술/운영팀으로 표시 */
  var TKT_TYPE_LBL = { tech: "기술", change: "변경 요청",
    billing_dispute: "청구 이의" };
  var TKT_ROUTE_LBL = { ops: "운영팀", biz: "사업팀" };
  function ticketTypeBadges(t) {
    var ty = t.type || "tech";
    var rt = t.routed_to || (ty === "billing_dispute" ? "biz" : "ops");
    return '<span class="ty-bd">' + esc(TKT_TYPE_LBL[ty] || ty) +
      (t.change_scope === "contract_amendment" ? " · Amendment" : "") +
      '</span><span class="rt-bd ' + (rt === "biz" ? "biz" : "ops") + '">' +
      esc(TKT_ROUTE_LBL[rt] || rt) + "</span>";
  }

  function ticketCard(t) {
    var open = isOpenTicket(t);
    var sev = String(t.sev || "").toUpperCase();
    return '<div class="tkt' + (open ? "" : " ok") + '">' +
      '<div class="th"><span class="tid">' + esc(t.id) + "</span>" +
      '<span class="tst' + (open ? "" : " ok") + '">' + esc(sev) +
      (open ? " · 진행 중" : " · 해결됨") + "</span>" +
      ticketTypeBadges(t) +
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
    renderAcceptance();                      // CP-004 인수 대기 카드
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
    var host = esc(n.host || "");
    var fault = n.state !== "in_service";
    return "<tr" + (fault ? ' class="fault"' : "") +
      '><td class="id">' + esc(n.id) + "</td>" +
      '<td class="id" style="color:var(--muted)">' + esc(n.ip || "—") +
      "</td>" +
      '<td style="color:var(--muted)">' + esc(n.bp) +
      " · 4× Rubin · 2× Vera</td>" +
      "<td>" + stateChipHtml(n.state) + "</td>" +
      '<td class="num" style="color:var(--muted)">—</td>' +
      '<td><button class="tbtn" data-open="console_access">콘솔</button>' +
      ' · <button class="tbtn a" data-open="reboot" data-host="' + host +
      '">재부팅</button>' +
      (fault ? ' · <button class="tbtn r" data-open="reboot" data-op="replace"' +
        ' data-host="' + host + '">HW 교체</button>' : "") +
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
            bp: n.blueprint_key, state: n.state, host: n.nico_host_id,
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

  /* 스토리지 — storageVolumes() (GET /storage/volumes) → pagedTable(8행) */
  function fmtCap(tb) {
    tb = +tb || 0;
    return tb >= 1000 ? (tb / 1000).toFixed(1) + "PB" : Math.round(tb) + "TB";
  }
  function parseNum(s) {
    var m = String(s == null ? "" : s).replace(/,/g, "").match(/[\d.]+/);
    return m ? +m[0] : 0;
  }
  function volRowHtml(v) {
    var qos = v.qos || {};
    var vid = esc(v.volume_id || "");
    var canChg = can("volume");
    return '<tr><td class="id">' + esc(v.path) + "</td>" +
      '<td class="num">' + fmtCap(v.quota_tb || v.capacity_tb) + "</td>" +
      '<td class="num" style="color:var(--muted)">' +
      fmtCap(v.used_tb || 0) + "</td>" +
      '<td class="num">' + Math.round(qos.bw_gbps || 0) + "GB/s · " +
      Math.round(qos.iops_k || 0) + "K</td>" +
      '<td><button class="tbtn" data-open="snapshot" data-vid="' + vid +
      '">스냅샷</button>' +
      ' · <button class="tbtn a" data-open="qos" data-vid="' + vid +
      '">QoS 변경</button>' +
      (canChg ? ' · <button class="tbtn r" data-vol-del="' + vid +
        '">삭제</button>' : "") +
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
      if (!t || !NC.api.storageVolumes) return;
      NC.api.storageVolumes().then(function (vs) {
        var tb = $("#storage-volumes");
        if (!vs || !tb) return;              // 폴백 — 정적 유지
        var mine = Array.isArray(vs) ? vs : [];
        var pgr = ensureStoragePager();
        if (pgr) pgr.set(mine);
        var capTb = mine.reduce(function (a, v) {
          return a + (v.quota_tb || v.capacity_tb || 0); }, 0);
        var usedTb = mine.reduce(function (a, v) {
          return a + (v.used_tb || 0); }, 0);
        var qos = mine.reduce(function (a, v) {
          return a + ((v.qos && v.qos.bw_gbps) || 0); }, 0);
        var kk = $("#st-kpi-cap-k"), k = $("#st-kpi-cap");
        var bar = $("#st-kpi-cap-bar");
        var q = $("#st-kpi-qos"), qs = $("#st-kpi-qos-sub");
        if (kk) kk.textContent = "사용 / 할당 쿼터 (VAST)";
        if (k) k.innerHTML = fmtCap(usedTb).replace(/(PB|TB)/, "<small> $1</small>") +
          ' <small style="color:var(--muted2)">/ ' + fmtCap(capTb) + "</small>";
        if (bar) bar.style.width = capTb
          ? Math.min(100, Math.round((usedTb / capTb) * 100)) + "%" : "0%";
        if (q) q.innerHTML = Math.round(qos).toLocaleString("en-US") +
          "<small> GB/s</small>";
        if (qs) qs.textContent = "볼륨 " + mine.length + "개 · VAST 실데이터";
      }).catch(function () {});
      renderSnapshots();
    });
  }

  /* 스냅샷 목록 — storageSnapshots() (GET /storage/snapshots) */
  function renderSnapshots() {
    var tb = $("#snap-rows");
    if (!tb || !NC.api.storageSnapshots) return;
    NC.api.storageSnapshots().then(function (ss) {
      if (!ss) return;                       // 폴백 — 정적 유지
      var list = Array.isArray(ss) ? ss : [];
      if (!list.length) return;              // 스냅샷 생성 전 — 정적 데모 유지
      tb.innerHTML = list.map(function (s) {
        return '<tr><td class="id">' + esc(s.snapshot_id) + "</td>" +
          '<td style="color:var(--muted)">' + esc(s.note || "manual") + " · " +
          fmtCap(s.size_tb || 0) + " · " +
          esc(String(s.state || "ready")) + "</td>" +
          '<td class="num"><button class="tbtn" data-demo="스냅샷 ' +
          esc(s.snapshot_id) + ' 복원">복원</button></td></tr>';
      }).join("");
    }).catch(function () {});
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
      renderSlaPanel();                      // BP-006 SLA 리포트 · 크레딧
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
    renderWipeCerts();                       // CP-012 Wipe 증명서 보관함
    loadTenant().then(function (t) {
      if (!t || !NC.api.accessPackages) return;
      NC.api.accessPackages(t.id).then(function (pkgs) {
        if (pkgs) renderAccessPackages(pkgs); // null → 패널 숨김 유지
      }).catch(function () {});
    });
  }

  function renderApi() { renderApiTokenLog(); renderApiKeys(); }

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
    renderAcceptance();                      // CP-004 인수 대기 카드
    renderFulfillment();                     // IF-08 진행 스테퍼 (3s 폴링)
    renderTermination();                     // CP-012 종료 워크플로우
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
  /* 멤버 · 역할(RBAC) 표 — 세션 사용자·역할 반영 (테넌트별 데모 멤버) */
  function memberRow(name, email, role, extra, me) {
    var cls = role === "admin" ? "st green" : role === "member"
      ? "st blue" : "";
    var lbl = role === "admin" ? "org admin" : role;
    return "<tr><td><b>" + esc(name) + "</b>" +
      (me ? ' <span class="role-bd" style="margin-left:4px">나</span>' : "") +
      ' <span style="color:var(--muted2);font-size:10px">' + esc(email) +
      "</span></td>" +
      '<td class="' + cls + '" style="font-size:11.5px;' +
      (cls ? "" : "color:var(--muted);font-weight:700") + '">' + esc(lbl) +
      "</td>" +
      '<td style="color:var(--muted)">' + esc(extra) + "</td></tr>";
  }
  /* 멤버 표 — GET /members 실데이터 (라이브) · 폴백 시 데모 렌더.
     세션 사용자("나")를 상단 고정하고, 이하 실 멤버는 역할 select·제거
     버튼(admin 전용)을 갖는다. */
  function renderMembers() {
    var tb = $("#member-rows");
    if (!tb) return;
    var s = getSession();
    var isAdmin = s.role === "admin";
    if (!NC.api.members) { renderMembersFallback(); return; }
    NC.api.members().then(function (ms) {
      if (!ms) { renderMembersFallback(); return; }   // 폴백 — 데모
      var list = Array.isArray(ms) ? ms : [];
      var self = memberRow(s.user, "user@" + s.tenant_name + ".com", s.role,
        s.role === "viewer" ? "MFA ✓ · 읽기 전용 · 나" : "MFA ✓ · SSO · 나",
        true);
      tb.innerHTML = self +
        list.map(function (m) { return memberLiveRow(m, isAdmin); }).join("") +
        '<tr><td class="id">svc-' + esc(s.tenant_name) +
        '</td><td style="color:#c8a5e8;font-weight:700">service account</td>' +
        '<td style="color:var(--muted)">API 키 인증</td></tr>';
      setTimeout(applyRbacGates, 0);
    }).catch(function () { renderMembersFallback(); });
  }

  function renderSettings() {
    renderInvites();                         // 초대 상태 (라이트 · 모의)
    renderMembers();                         // 멤버 표 — 세션 역할 반영
    applySessionUi();                        // 조직 셀 등 세션 연동
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

  /* ═══════════════════════════════════════════════════════════════
     시나리오 갭 12종 (P1~P3) — CP-004 인수 · IF-08 스테퍼 · CP-012 종료 ·
     티켓 라우팅 · 변경 분기 · CP-011 상태 · BP-006 SLA · 초대 · Grafana
     ═══════════════════════════════════════════════════════════════ */
  var curRoute = null;
  NC.bus.on("route", function (id) {
    curRoute = id;
    if (id !== "clusters") { stopFulfillPoll(); stopTermPoll(); }
    if (id !== "nodes") closeRebootFlow();   // 노드 화면 이탈 시 폴링 해제
    applyMockScope();                        // 정적 데모(fin-corp) 스크럽
    setTimeout(applyRbacGates, 0);           // 화면 전환 직후 게이트 재적용
  });

  /* ── CP-004 인수 검증 — 액션 카드 + PT 리포트 모달 + 승인/반려 ── */
  var acceptCtx = null, acceptArmed = false;
  function deemedDday(deadline) {          // "YYYY-MM-DD" 또는 ISO 타임스탬프
    var s = String(deadline || "");
    var ts = Date.parse(s.length > 10 ? s : s + "T23:59:59");
    return Math.ceil((ts - Date.now()) / 864e5);
  }
  function shortDate(d) { return String(d || "").slice(0, 10); }
  function deemedChipHtml(rep) {
    if (rep.status === "deemed")
      return '<span class="st green">Deemed 자동 승인됨</span>';
    if (!rep.deemed_deadline) return "";
    var d = deemedDday(rep.deemed_deadline);
    return d >= 0
      ? '<span class="st amber" title="기한 내 승인/반려가 없으면 자동 승인(Deemed Acceptance)">Deemed D-' + d + "</span>"
      : '<span class="st red">기한 경과 — 자동 승인 처리</span>';
  }
  function acceptCardHtml(o, rep) {
    var checks = (rep.report && rep.report.checks) || [];
    var pass = checks.filter(function (c) { return c.status === "pass"; }).length;
    var stateNote = "";
    if (rep.status === "rejected")
      stateNote = '<span class="st red">반려됨 — 재설정 · 재테스트 진행 중</span>';
    else if (rep.status === "deemed")
      stateNote = '<span class="st green">기한 경과 — Deemed Acceptance 자동 승인 (청구 개시 ' +
        esc(rep.billing_start_date || "") + ")</span>";
    return '<div class="panel" style="border-color:var(--amber-line)">' +
      '<div class="ph" style="margin-bottom:8px"><span class="tick amber"></span>' +
      '<span class="t">인수 검증 대기 — ' + esc(o.id) + "</span>" +
      '<span class="c">' + (o.racks || "—") + "랙 · " +
      esc(o.blueprint_key || "vr-nvl72") + " · Performance Test 완료</span>" +
      stateNote +
      '<span style="margin-left:auto;display:flex;gap:8px;align-items:center">' +
      deemedChipHtml(rep) +
      '<button class="btn" style="padding:6px 13px;font-size:11.5px" ' +
      'data-open="acceptance">PT 리포트 · 승인/반려</button></span></div>' +
      '<div class="stats">' +
      "<span>검증 항목 <b>" + pass + "/" + checks.length + " PASS</b></span>" +
      "<span>노드 <b>" +
      ((rep.report && rep.report.nodes_tested) || "—") + "</b></span>" +
      "<span>리포트 <b>" +
      esc(String((rep.report && rep.report.report_ts) || "—")
        .slice(0, 16).replace("T", " ")) + "</b></span>" +
      '<span style="color:var(--muted)">승인 시 청구 개시 · ' +
      esc(shortDate(rep.deemed_deadline) || "—") +
      " 까지 미결정 시 자동 승인(Deemed)</span></div></div>";
  }
  function renderAcceptance() {
    var wraps = $$("[data-accept-wrap]");
    if (!wraps.length || !NC.api.acceptanceOrders) return;
    loadTenant().then(function (t) {
      NC.api.acceptanceOrders().then(function (os) {
        os = (os || []).filter(function (o) {
          var tid = o.tenant_id || o.tenant;
          return !t || !tid || tid === t.id;
        });
        if (!os.length) {
          wraps.forEach(function (w) {
            w.innerHTML = ""; w.style.display = "none";
          });
          return;
        }
        var o = os[0];
        NC.api.acceptanceReport(o.id).then(function (rep) {
          if (!rep || rep.status === "approved") {   // 승인 완료 → 카드 숨김
            wraps.forEach(function (w) {
              w.innerHTML = ""; w.style.display = "none";
            });
            return;
          }
          acceptCtx = { order: o, rep: rep };
          var html = acceptCardHtml(o, rep);
          wraps.forEach(function (w) {
            w.innerHTML = html; w.style.display = "";
          });
        }).catch(function () {});
      }).catch(function () {});
    });
  }
  function fillAcceptanceModal() {
    if (!acceptCtx) return;
    acceptArmed = false;
    var o = acceptCtx.order, rep = acceptCtx.rep;
    var r = rep.report || {};
    var tt = $("#accept-title");
    if (tt) tt.textContent = "인수 검증 — " + o.id + " Performance Test 리포트";
    var meta = $("#accept-meta");
    if (meta) meta.innerHTML =
      "<tr><td>주문</td><td class=\"id\">" + esc(o.id) + " · " +
      esc(o.blueprint_key || "vr-nvl72") + " × " + (o.racks || "—") +
      "랙</td></tr>" +
      "<tr><td>테스트 노드</td><td>" + (r.nodes_tested || "—") +
      "노드 · NCCL / fio / Burn-in 자동 스위트</td></tr>" +
      "<tr><td>리포트 시각</td><td>" +
      esc(String(r.report_ts || "—").slice(0, 16).replace("T", " ")) +
      "</td></tr>" +
      "<tr><td>상태</td><td>" + esc(rep.status || "pending") +
      (rep.billing_start_date
        ? ' · 청구 기준일 <b style="color:var(--green-text)">' +
          esc(shortDate(rep.billing_start_date)) + "</b>" : "") + "</td></tr>";
    var tb = $("#accept-checks");
    if (tb) tb.innerHTML = ((r.checks || []).map(function (c) {
      var ok = c.status === "pass";
      return "<tr><td>" + esc(c.name) + "</td>" +
        '<td class="num id">' + esc(c.value || "—") + "</td>" +
        '<td style="color:var(--muted)">' + esc(c.detail || "") + "</td>" +
        '<td><span class="st ' + (ok ? "green" : "red") + '">' +
        (ok ? "PASS" : String(c.status || "").toUpperCase()) +
        "</span></td></tr>";
    }).join("")) || '<tr><td colspan="4" style="color:var(--muted2)">체크 데이터 없음</td></tr>';
    var dm = $("#accept-deemed");
    if (dm) {
      if (rep.deemed_deadline) {
        var d = deemedDday(rep.deemed_deadline);
        var dl = shortDate(rep.deemed_deadline);
        dm.style.display = "";
        dm.textContent = rep.status === "deemed"
          ? "Deemed Acceptance — 기한(" + dl +
            ") 경과로 자동 승인 처리되었습니다 (청구 개시)"
          : "Deemed Acceptance — " + dl +
            "까지 승인/반려가 없으면 자동 승인 처리되고 청구가 개시됩니다" +
            (d >= 0 ? " (D-" + d + ")" : " (기한 경과)");
      } else dm.style.display = "none";
    }
    var btn = $("#accept-approve-btn");
    if (btn) btn.textContent = "승인 — 청구 개시";
  }
  function submitAcceptApprove() {
    if (!acceptCtx) { NC.toast("인수 대기 주문이 없습니다", "warn"); return; }
    var btn = $("#accept-approve-btn");
    if (!acceptArmed) {                      // 2단계 확인 — 청구 개시 경고
      acceptArmed = true;
      if (btn) btn.textContent = "승인 확정 — 청구 기준일 확정 (한 번 더 클릭)";
      NC.toast("승인 시 청구가 개시됩니다 (청구 기준일 확정) — 확정하려면 " +
        "버튼을 한 번 더 클릭하세요", "warn");
      return;
    }
    NC.api.acceptanceDecision(acceptCtx.order.id, { decision: "approve" })
      .then(function (r) {
        NC.closeModal();
        if (r && r.error) {
          NC.toast("승인 실패 — " + r.error, "warn");
          return;
        }
        var bsd = (r && r.billing_start_date) ||
          new Date().toISOString().slice(0, 10);
        NC.toast("인수 승인 완료 — 과금 개통 (청구 기준일 " + bsd + ") · " +
          "접속 정보는 보안 화면 '접속 패키지'에서 확인하세요");
        renderAcceptance();
        afterOrderChange();
      }).catch(function () {
        NC.toast("승인 처리 실패 — 잠시 후 다시 시도해주세요", "warn");
      });
  }
  function submitAcceptReject() {
    if (!acceptCtx) { NC.toast("인수 대기 주문이 없습니다", "warn"); return; }
    var el = $("#accept-reason");
    var reason = el ? el.value.trim() : "";
    if (!reason) {
      guardFail(el, "반려 사유를 입력하세요 — 반려에는 사유가 필수입니다");
      return;
    }
    NC.api.acceptanceDecision(acceptCtx.order.id,
      { decision: "reject", reason: reason }).then(function (r) {
      NC.closeModal();
      if (r && r.error) { NC.toast("반려 실패 — " + r.error, "warn"); return; }
      NC.toast("인수 반려 접수 — 사유가 운영팀에 전달되었습니다. 재설정 · " +
        "Performance Test 재실행 후 재인수를 요청드립니다");
      if (el) el.value = "";
      renderAcceptance();
    }).catch(function () {
      NC.toast("반려 처리 실패 — 잠시 후 다시 시도해주세요", "warn");
    });
  }

  /* ── IF-08 Fulfillment 진행 스테퍼 — /orders/{id}/flow 3s 폴링 ── */
  var FULFILL_STEPS = [
    { lb: "자원 할당", m: ["received", "validated", "reserved"] },
    { lb: "네트워크·패브릭", m: ["isolating"] },
    { lb: "스토리지", m: ["storage_binding"] },
    { lb: "테넌트 OS", m: ["provisioning"] },
    { lb: "Managed K8s", m: ["k8s_installing"], opt: true },
    { lb: "Performance Test", m: ["acceptance"] },
    { lb: "인수 대기", m: ["delivered"] },
  ];
  function fulfillPanelHtml(flow, o) {
    var steps = FULFILL_STEPS.filter(function (s) {
      return !s.opt || o.managed_k8s;
    });
    var reached = -1;
    (flow.stages || []).forEach(function (st) {
      steps.forEach(function (s, i) {
        if (s.m.indexOf(st.state) >= 0 && i > reached) reached = i;
      });
    });
    var delivered = flow.state === "delivered";
    // 주문이 acceptance 상태면 PT 완료 → "인수 대기"가 현재 단계
    if (flow.state === "acceptance") reached = steps.length - 1;
    if (delivered) reached = steps.length;
    var nodes = steps.map(function (s, i) {
      var cls = i < reached || delivered ? "done" : (i === reached ? "cur" : "");
      var nd = i < reached || delivered ? "✓" : String(i + 1);
      return '<div class="step ' + cls + '"><span class="nd">' + nd +
        '</span><span class="lb">' + s.lb + "</span></div>" +
        (i < steps.length - 1
          ? '<div class="step-bar' +
            (i < reached || delivered ? " done" : "") + '"></div>' : "");
    }).join("");
    var last = (flow.stages || [])[Math.max(0, (flow.stages || []).length - 1)];
    return '<div class="panel">' +
      '<div class="ph" style="margin-bottom:6px"><span class="tick blue"></span>' +
      '<span class="t">개통 진행 — ' + esc(flow.order_id || o.id) + "</span>" +
      '<span class="c">' + (flow.racks || o.racks || "—") + "랙 · " +
      esc(o.blueprint_key || "vr-nvl72") +
      (o.managed_k8s ? " · Managed K8s" : "") + " · 실시간 3s 갱신</span>" +
      '<span class="st ' + (delivered ? "green" : "blue") +
      '" style="margin-left:auto">' + esc(flow.state || "—") + "</span></div>" +
      '<div class="fsteps">' + nodes + "</div>" +
      (last
        ? '<div class="mini" style="margin-top:4px">최근 단계: <b style="color:var(--soft)">' +
          esc(last.state) + "</b> — " + esc(last.detail || "") + "</div>"
        : "") + "</div>";
  }
  var fulfillTimer = null;
  function stopFulfillPoll() {
    if (fulfillTimer) { clearInterval(fulfillTimer); fulfillTimer = null; }
  }
  function startFulfillPoll() {
    if (fulfillTimer || curRoute !== "clusters") return;
    fulfillTimer = setInterval(function () {
      if (curRoute !== "clusters") { stopFulfillPoll(); return; }
      renderFulfillment();
    }, 3000);
  }
  function renderFulfillment() {
    var wrap = $("#fulfill-wrap");
    if (!wrap || !NC.api.fulfillOrders) return;
    loadTenant().then(function (t) {
      NC.api.fulfillOrders().then(function (os) {
        os = (os || []).filter(function (o) {
          var tid = o.tenant_id || o.tenant;
          return !t || !tid || tid === t.id;
        });
        if (!os.length) { wrap.innerHTML = ""; stopFulfillPoll(); return; }
        Promise.all(os.slice(0, 2).map(function (o) {
          return NC.api.orderFlow(o.id).then(function (f) {
            return { o: o, f: f };
          }).catch(function () { return { o: o, f: null }; });
        })).then(function (rs) {
          var html = rs.filter(function (r) { return r.f; })
            .map(function (r) { return fulfillPanelHtml(r.f, r.o); }).join("");
          if (html) { wrap.innerHTML = html; startFulfillPoll(); }
        });
      }).catch(function () {});
    });
  }

  /* ── CP-012 종료 워크플로우 — 요청서 → 백업 게이트(409) →
        Secure Erase 폴링 → Wipe 증명서 → 정산 마감 안내 ── */
  var termChk = { extracted: false, migrated: false, verified: false };
  var termTimer = null;
  var WIPE_STEPS = ["NVMe crypto-erase", "GPU HBM wipe", "시스템 메모리 소거",
    "TPM reset", "펌웨어 re-attestation", "BMC 자격증명 로테이션", "검증 리포트"];
  function stopTermPoll() {
    if (termTimer) { clearInterval(termTimer); termTimer = null; }
  }
  function startTermPoll() {
    if (termTimer || curRoute !== "clusters") return;
    termTimer = setInterval(function () {
      if (curRoute !== "clusters") { stopTermPoll(); return; }
      renderTermination();
    }, 2500);
  }
  function chkRow(key, label, hint) {
    return '<label class="chkrow"><input type="checkbox" data-term-chk="' +
      key + '"' + (termChk[key] ? " checked" : "") + "><span>" + label +
      '</span><span class="hint">' + hint + "</span></label>";
  }
  function termAwaitingHtml(st) {
    var all = termChk.extracted && termChk.migrated && termChk.verified;
    return '<div class="ph" style="margin-bottom:8px"><span class="tick red"></span>' +
      '<span class="t">종료 워크플로우 — 백업 체크리스트</span>' +
      '<span class="c">' + esc(st.allocation_id || "전체") + " · 사유: " +
      esc(st.reason || "—") + "</span>" +
      '<span class="st amber" style="margin-left:auto">awaiting_backup</span></div>' +
      '<div class="redcall" style="margin-bottom:10px"><span class="ic">⚠</span>' +
      "<span><b>백업 확인 전 시스템이 종료를 차단합니다</b> — 아래 3개 항목이 " +
      "모두 확인되어야 [종료 진행]이 활성화되며, 미완료 상태로 요청 시 " +
      "시스템이 거부(409)합니다.</span></div>" +
      chkRow("extracted", "데이터 추출 완료", "볼륨 · 오브젝트 전체 추출") +
      chkRow("migrated", "외부 이관 완료", "사외 스토리지/클라우드 이관") +
      chkRow("verified", "백업 무결성 검증 완료", "체크섬 · 샘플 복원 확인") +
      '<div id="term-err" class="redcall" style="display:none;margin-top:10px"></div>' +
      '<div style="display:flex;gap:8px;margin-top:12px;align-items:center">' +
      '<button class="btn-danger solid" id="term-confirm-btn"' +
      (all ? "" : " disabled") +
      ' style="padding:7px 16px;font-size:12px' +
      (all ? "" : ";opacity:.4;cursor:default") +
      '">종료 진행 — Secure Erase 개시</button>' +
      '<span class="mini" style="margin-top:0">백업 계획: ' +
      esc(st.backup_plan || "—") + "</span></div>";
  }
  function termErasingHtml(st) {
    var pct = Math.round(st.progress || 0);
    var phase = st.phase === "drain" ? "① 워크로드 드레인"
      : st.phase === "release" ? "② 자원 회수 (release)"
      : "③ Secure Erase " + (st.wipe_step || 0) + "/7단계" +
        (st.wipe_step ? " — " + (WIPE_STEPS[st.wipe_step - 1] || "") : "");
    return '<div class="ph" style="margin-bottom:8px"><span class="tick red"></span>' +
      '<span class="t">종료 진행 중 — Secure Erase</span>' +
      '<span class="c">' + esc(st.allocation_id || "전체") +
      " · drain → release → 7단계 소거</span>" +
      '<span class="st amber" style="margin-left:auto">erasing · ' + pct +
      "%</span></div>" +
      '<div style="height:7px;border-radius:4px;background:#233043;overflow:hidden;margin-bottom:8px">' +
      '<div style="width:' + pct +
      '%;height:100%;background:var(--red)"></div></div>' +
      '<div class="stats"><span>현재 <b style="color:var(--amber)">' + phase +
      "</b></span><span>완료 후 <b>Secure Wipe 증명서</b> 자동 발급</span></div>";
  }
  function termWipedHtml(st) {
    var c = st.wipe_certificate || {};
    return '<div class="ph" style="margin-bottom:8px"><span class="tick"></span>' +
      '<span class="t">종료 완료 — Secure Wipe 증명서 발급</span>' +
      '<span class="c">' + esc(st.allocation_id || "전체") + " · 소거 검증 통과</span>" +
      '<span class="st green" style="margin-left:auto">' + esc(st.state) +
      "</span></div>" +
      '<table class="kv2"><tbody>' +
      "<tr><td>증명서 ID</td><td class=\"id\">" + esc(c.cert_id || "—") +
      ' <button class="tbtn" data-copy="' + esc(c.cert_id || "") +
      '">복사</button></td></tr>' +
      "<tr><td>SHA-256</td><td class=\"id\" style=\"word-break:break-all\">" +
      esc(c.sha256 || "—") + "</td></tr>" +
      "<tr><td>소거 방법</td><td>" + esc(c.method || "—") + "</td></tr>" +
      "<tr><td>발급 시각</td><td>" + esc(c.issued_at || "—") +
      ' · <button class="tbtn" data-demo="Wipe 증명서 ' +
      esc(c.cert_id || "") + ' PDF 다운로드">PDF ↓</button>' +
      ' · <a class="lnk" href="#/security">보안 · 감사 화면 보관함 →</a></td></tr>' +
      "</tbody></table>" +
      '<div class="callout" style="margin-top:10px">정산 마감 — 종료일 기준 ' +
      "일할 계산된 최종 인보이스가 발행되며, 미사용 크레딧은 마감 정산에 " +
      "반영됩니다. 증명서는 감사 파이프라인에 불변 보관됩니다.</div>";
  }
  function renderTermination() {
    var wrap = $("#term-wrap");
    if (!wrap || !NC.api.terminationStatus) return;
    loadTenant().then(function (t) {
      if (!t) return;
      NC.api.terminationStatus(t.id).then(function (st) {
        // mock 폴백은 tid 인자를 무시 — 타 테넌트 종료 상태 노출 방지
        if (st && st.tenant && NC.sessionOwns && !NC.sessionOwns(st.tenant))
          st = null;
        if (!st || !st.state || st.state === "closed") {
          wrap.style.display = "none"; wrap.innerHTML = "";
          stopTermPoll(); return;
        }
        var inner = st.state === "awaiting_backup" ? termAwaitingHtml(st)
          : st.state === "erasing" ? termErasingHtml(st)
          : termWipedHtml(st);
        wrap.innerHTML = '<div class="panel" style="border-color:var(--red-line)">' +
          inner + "</div>";
        wrap.style.display = "";
        if (st.state === "erasing") startTermPoll(); else stopTermPoll();
        if (st.wipe_certificate) renderWipeCerts();
      }).catch(function () {});
    });
  }
  function submitTerminationStart() {
    var aid = ($("#rc-alloc") || {}).value || "";
    var reason = ($("#rc-reason") || {}).value || "";
    var backup = (($("#rc-backup") || {}).value || "").trim();
    NC.closeModal();
    loadTenant().then(function (t) {
      var tid = (t && t.id) || "fin-corp";
      NC.api.terminationStart(tid, { reason: reason, backup_plan: backup,
        allocation_id: aid || null }).then(function (r) {
        if (!r) { NC.toast("종료 요청 실패 — 응답 없음", "warn"); return; }
        if (r.error) { NC.toast("종료 요청 실패 — " + r.error, "warn"); return; }
        termChk = { extracted: false, migrated: false, verified: false };
        NC.toast("종료 요청서 접수 — 백업 체크리스트 확인 후 Secure Erase가 " +
          "진행됩니다 (완료 시 Wipe 증명서 발급)");
        resetModalInputs("reclaim");
        NC.nav("clusters");
        renderTermination();
      }).catch(function () {
        NC.toast("종료 요청 실패 — 잠시 후 다시 시도해주세요", "warn");
      });
    });
  }
  function submitTerminationConfirm() {
    var btn = $("#term-confirm-btn");
    if (btn && btn.disabled) return;
    loadTenant().then(function (t) {
      var tid = (t && t.id) || "fin-corp";
      NC.api.terminationBackupConfirm(tid, {
        extracted: termChk.extracted, migrated: termChk.migrated,
        verified: termChk.verified,
      }).then(function (r) {
        if (!r) { NC.toast("종료 진행 실패 — 응답 없음", "warn"); return; }
        if (r.error) {                       // 409 — 백업 게이트 차단 표면화
          var err = $("#term-err");
          if (err) {
            err.style.display = "";
            err.innerHTML = '<span class="ic">⛔</span><span><b>시스템 차단' +
              (r.status === 409 ? " (409 Conflict)" : "") + "</b> — " +
              esc(r.error) + "</span>";
          }
          NC.toast("종료 차단 — " + r.error, "warn");
          return;
        }
        NC.toast("백업 확인 완료 — Secure Erase 개시 (drain → release → 7단계 소거)");
        // 백엔드 종료 API 미가동(mock 폴백) + 라이브 연결 시: 실제 자원 회수를
        // 기존 terminateOrder로 수행해 Control-Plane 상태와 동기화
        if (r._mock && NC.live && curTenant && NC.api.terminateOrder) {
          tenantAllocations().then(function (list) {
            var aid = (list && list[0] && list[0].alloc) || null;
            if (aid) NC.api.terminateOrder(curTenant.id, aid)
              .catch(function () {});
          }).catch(function () {});
        }
        renderTermination();
      }).catch(function () {
        NC.toast("종료 진행 실패 — 잠시 후 다시 시도해주세요", "warn");
      });
    });
  }
  function renderWipeCerts() {
    var panel = $("#wipe-certs-panel"), tb = $("#wipe-certs");
    if (!panel || !tb || !NC.api.terminationStatus) return;
    loadTenant().then(function (t) {
      if (!t) return;
      NC.api.terminationStatus(t.id).then(function (st) {
        var c = st && st.wipe_certificate;
        if (!c) { panel.style.display = "none"; return; }
        tb.innerHTML = '<tr><td class="id">' + esc(c.cert_id || "—") + "</td>" +
          '<td style="color:var(--muted)">' + esc(c.method || "—") + "</td>" +
          '<td class="id" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' +
          esc(c.sha256 || "") + '">' + esc(c.sha256 || "—") + "</td>" +
          "<td>" + esc(c.issued_at || "—") + "</td>" +
          '<td class="num"><button class="tbtn" data-demo="Wipe 증명서 ' +
          esc(c.cert_id || "") + ' PDF 다운로드">PDF ↓</button></td></tr>';
        panel.style.display = "";
      }).catch(function () {});
    });
  }

  /* ── CP-011 서비스 상태 화면 — 컴포넌트 보드 · 인시던트 · RCA ── */
  var COMP_ST = {
    operational: ["green", "정상"],
    degraded: ["amber", "성능 저하"],
    outage: ["red", "장애"],
  };
  var rcaCache = [];
  function renderStatus() {
    if (NC.api.serviceStatus) NC.api.serviceStatus().then(function (s) {
      if (!s) return;
      var comps = s.components || [];
      var tb = $("#status-components");
      if (tb) tb.innerHTML = comps.map(function (c) {
        var st = c.status || c.state;        // mock: status · live: state
        var m = COMP_ST[st] || ["gray", st];
        return "<tr><td><b>" + esc(c.name) + "</b></td>" +
          "<td>" + statusChip(m[0], m[1]) + "</td>" +
          '<td class="num">' + (c.uptime_90d != null ? c.uptime_90d + "%" : "—") +
          "</td>" +
          '<td style="color:var(--muted)">' + esc(c.note || "—") + "</td></tr>";
      }).join("");
      var incs = s.incidents || [];
      var feed = $("#status-incidents");
      var fmtTs = function (t) {
        return String(t || "").slice(0, 16).replace("T", " ");
      };
      if (feed) feed.innerHTML = incs.length
        ? incs.slice(0, 6).map(function (i) {
            return '<div class="fi"><span class="dot ' +
              (i.state === "resolved" ? "green" : "amber") + '"></span>' +
              '<div class="tx"><b>' + esc(i.id) + " · " +
              esc(i.sev || i.severity || "") +
              " — " + esc(i.title) + "</b>" +
              '<div class="tm">' + esc(fmtTs(i.started_at)) + " 감지 · 상태 " +
              esc(i.state || "—") + "</div>" +
              '<div class="log" style="margin-top:4px;line-height:1.8">' +
              (i.updates || []).map(function (u) {
                var ts = Array.isArray(u) ? u[0] : u.ts;   // mock: 배열 · live: 객체
                var msg = Array.isArray(u) ? u[1] : u.msg;
                return '<div><span class="tm">' + esc(fmtTs(ts)) + "</span> " +
                  esc(msg) + "</div>";
              }).join("") + "</div></div></div>";
          }).join("")
        : '<div class="mini" style="margin-top:0">진행 중인 플랫폼 인시던트가 없습니다 — 모든 컴포넌트 정상</div>';
      var h = s.history_90d || {};
      var hAvail = h.availability_pct != null ? h.availability_pct
        : (h.uptime_pct != null ? h.uptime_pct : null);    // live: uptime_pct
      var a = $("#stp-avail");
      if (a) {
        a.innerHTML = (hAvail != null ? hAvail : "—") + "<small>%</small>";
        a.classList.toggle("green", hAvail != null && hAvail >= 99.9);
        a.classList.toggle("amber", hAvail != null && hAvail < 99.9);
      }
      var openInc = incs.filter(function (i) {
        return i.state !== "resolved";
      }).length;
      var ei = $("#stp-inc");
      if (ei) {
        ei.textContent = String(openInc);
        ei.classList.toggle("amber", openInc > 0);
        ei.classList.toggle("green", !openInc);
      }
      var opCnt = comps.filter(function (c) {
        return c.status === "operational";
      }).length;
      var ec = $("#stp-comp");
      if (ec) ec.textContent = comps.length ? opCnt + "/" + comps.length : "—";
      var ecs = $("#stp-comp-sub");
      if (ecs) ecs.textContent = comps.length === opCnt
        ? "전 컴포넌트 operational"
        : "degraded " + (comps.length - opCnt) + "건 포함";
      var em = $("#stp-maint");
      if (em) em.textContent = h.maintenance != null ? String(h.maintenance) : "—";
      var src = $("#status-src");
      if (src) src.textContent = (NC.live
        ? "Control-Plane /status · " : "mock 스냅샷 · ") +
        "컴포넌트 " + comps.length + "종";
    }).catch(function () {});
    loadTenant().then(function (t) {
      if (!NC.api.rcaReports) return;
      NC.api.rcaReports((t && t.id) || "").then(function (rs) {
        var tb = $("#status-rca");
        if (!tb) return;
        // mock RCA는 fin-corp 시나리오 데이터 — 타 테넌트 세션 차단
        if (!NC.live && getSession().tenant_name !== "fin-corp") rs = [];
        rcaCache = rs || [];
        tb.innerHTML = rcaCache.length
          ? rcaCache.map(function (r, i) {
              return '<tr><td class="id">' + esc(r.id) + "</td>" +
                "<td>" + esc(r.incident || "—") + "</td>" +
                "<td><b>" + esc(r.title || "") + "</b></td>" +
                '<td style="color:var(--muted)">' + esc(r.impact || "—") +
                "</td>" +
                "<td>" + esc(r.date || "—") + "</td>" +
                '<td class="num"><button class="tbtn" data-rca-view="' + i +
                '">열람</button></td></tr>';
            }).join("")
          : '<tr><td colspan="6" style="color:var(--muted2)">발행된 RCA 리포트가 없습니다</td></tr>';
      }).catch(function () {});
    });
  }
  function viewRca(i) {
    var r = rcaCache[i];
    var box = $("#rca-detail");
    if (!r || !box) return;
    box.style.display = "";
    box.innerHTML = "<b style=\"color:var(--soft)\">" + esc(r.id) + " — " +
      esc(r.title) + "</b><br>근본 원인: " + esc(r.root_cause || "—") +
      "<br>재발 방지: " + esc(r.actions || "—") +
      '<br><span style="color:var(--muted2)">영향 ' + esc(r.impact || "—") +
      " · " + esc(r.incident || "") + " · 발행 " + esc(r.date || "") + "</span>";
  }

  /* ── BP-006 월별 SLA 리포트 · Service Credit (빌링 화면) ── */
  function renderSlaPanel() {
    var box = $("#sla-rep-body");
    if (!box || !NC.api.slaReport) return;
    var month = ($("#sla-month") || {}).value || "2026-07";
    loadTenant().then(function (t) {
      // mock SLA 리포트는 fin-corp 시나리오 데이터 — 타 테넌트 세션 차단
      if (!NC.live && getSession().tenant_name !== "fin-corp") {
        box.innerHTML = '<div class="mini" style="margin-top:0">' +
          esc(month) + " 리포트가 없습니다 (테넌트 격리 · mock)</div>";
        return;
      }
      NC.api.slaReport((t && t.id) || "fin-corp", month).then(function (r) {
        if (!r) {
          box.innerHTML = '<div class="mini" style="margin-top:0">' +
            esc(month) + " 리포트가 없습니다</div>";
          return;
        }
        var ok = !r.violated;
        var availCard =
          '<div class="ccard"><div class="crow">' +
          '<b class="nm">가용성 — ' + esc(r.month || month) + "</b>" +
          '<span class="st ' + (ok ? "green" : "red") +
          '" style="margin-left:auto">' +
          (ok ? "SLA 충족" : "SLA 위반 — 크레딧 발생") + "</span></div>" +
          '<div class="stats" style="margin-top:8px">' +
          '<span>실측 <b style="color:var(--' + (ok ? "green-text" : "red") +
          ')">' + r.availability_pct + "%</b></span>" +
          "<span>목표 <b>" + (r.target_pct || 99.9) + "%</b></span>" +
          "<span>다운타임 <b>" +
          (r.downtime_min != null ? r.downtime_min + "분" : "—") +
          "</b></span></div>" +
          '<div style="height:6px;border-radius:3px;background:#233043;margin-top:8px;overflow:hidden">' +
          '<div style="width:' +
          Math.max(2, Math.min(100,
            ((r.availability_pct - 99.5) / 0.5) * 100)) +
          "%;height:100%;background:var(--" + (ok ? "green" : "red") +
          ')"></div></div>' +
          '<div class="mini">눈금 99.5% → 100% · 목표선 ' +
          (r.target_pct || 99.9) + "%</div></div>";
        var incRows = (r.incidents || []).map(function (i) {
          return '<tr><td class="id">' + esc(i.id) + "</td>" +
            "<td>" + esc(i.desc || "") + "</td>" +
            '<td class="num">' +
            (i.downtime_min != null ? i.downtime_min + "분" : "—") + "</td>" +
            '<td class="num">' +
            (i.mttr_min != null ? i.mttr_min + "분" : "—") + "</td></tr>";
        }).join("");
        var incTbl = '<div><div class="ph" style="margin-bottom:6px">' +
          '<span class="tick amber"></span>' +
          '<span class="t" style="font-size:12px">인시던트별 Downtime · MTTR</span></div>' +
          '<table class="tbl"><thead><tr><th>인시던트</th><th>내용</th>' +
          '<th class="num">downtime</th><th class="num">MTTR</th></tr></thead>' +
          "<tbody>" + (incRows ||
            '<tr><td colspan="4" style="color:var(--muted2)">해당 월 SLA 영향 인시던트 없음</td></tr>') +
          "</tbody></table></div>";
        var crRows = (r.credits || []).map(function (c) {
          return '<tr><td class="id">' + esc(c.id || c.credit_id || "CR") +
            "</td>" +
            '<td class="num id" style="color:var(--green-text)">-' +
            usd(c.amount_usd != null ? c.amount_usd : c.credit_usd) + "</td>" +
            '<td><span class="st ' +
            (c.status === "applied" ? "green" : "amber") + '">' +
            (c.status === "applied" ? "반영 완료" : esc(c.status || "산정 중")) +
            "</span></td>" +
            '<td style="color:var(--muted)">' + esc(c.invoice || "—") +
            "</td></tr>";
        }).join("");
        var crTbl = '<div><div class="ph" style="margin-bottom:6px">' +
          '<span class="tick"></span>' +
          '<span class="t" style="font-size:12px">Service Credit 내역</span></div>' +
          '<table class="tbl"><thead><tr><th>크레딧</th><th class="num">산정액</th>' +
          "<th>상태</th><th>반영 청구서</th></tr></thead><tbody>" +
          (crRows ||
            '<tr><td colspan="4" style="color:var(--muted2)">발생 크레딧 없음 — SLA 충족</td></tr>') +
          "</tbody></table>" +
          (crRows
            ? '<div class="mini">크레딧은 비용 분해의 <b>"크레딧 적용"</b> 라인으로 청구서에 반영됩니다</div>'
            : "") + "</div>";
        box.innerHTML = availCard + incTbl + crTbl;
        var src = $("#sla-rep-src");
        if (src) src.textContent = "가용성 목표 " + (r.target_pct || 99.9) +
          "% · " + (NC.live ? "Control-Plane sla-report" : "mock 리포트") +
          (r.credits && r.credits.length
            ? " · 크레딧 " + r.credits.length + "건" : "");
      }).catch(function () {});
    });
  }

  /* ── 초대 수락 플로우 (라이트) — 상태 표시 · 재발급 (모의) ── */
  var INVITE_SEED = [
    { email: "viewer@fin-corp.com", role: "viewer", state: "sent", d: 6 },
    { email: "park.ms@fin-corp.com", role: "operator", state: "expired", d: 0 },
    { email: "kim.tw@fin-corp.com", role: "viewer", state: "accepted", d: null },
  ];
  function inviteList() {
    try {
      var l = JSON.parse(localStorage.getItem("nc-invites") || "null");
      if (Array.isArray(l)) return l;
    } catch (e) {}
    return INVITE_SEED.slice();
  }
  function saveInvites(l) {
    try { localStorage.setItem("nc-invites", JSON.stringify(l.slice(0, 20))); }
    catch (e) {}
  }
  var INV_ST = {
    sent: ["blue", "발송됨"],
    accepted: ["green", "수락 · MFA 등록 완료"],
    expired: ["red", "만료됨"],
  };
  function renderInvites() {
    var tb = $("#invite-rows");
    if (!tb) return;
    var l = inviteList();
    tb.innerHTML = l.length
      ? l.map(function (v) {
          var m = INV_ST[v.state] || ["gray", v.state];
          return "<tr><td><b>" + esc(v.email) + "</b></td>" +
            '<td style="color:var(--muted)">' + esc(v.role || "viewer") +
            "</td>" +
            "<td>" + statusChip(m[0], m[1]) + "</td>" +
            '<td style="color:var(--muted)">' +
            (v.state === "sent" ? "D-" + (v.d != null ? v.d : 7)
              : v.state === "expired" ? "만료" : "—") + "</td>" +
            '<td class="num">' +
            (v.state === "accepted" ? "—"
              : '<button class="tbtn a" data-inv-resend="' + esc(v.email) +
                '">재발급</button>') + "</td></tr>";
        }).join("")
      : '<tr><td colspan="5" style="color:var(--muted2)">대기 중인 초대가 없습니다</td></tr>';
  }
  function resendInvite(email) {
    var l = inviteList();
    l.forEach(function (v) {
      if (v.email === email) { v.state = "sent"; v.d = 7; }
    });
    saveInvites(l);
    NC.toast("초대 재발급 (모의) — " + email + " 새 링크 발송 · 7일 유효 " +
      "(수락 → MFA 등록 → 로그인 순서)");
    renderInvites();
  }
  /* invite — POST /members (state invited). 성공 시 로컬 초대 상태 표에도
     반영해 온보딩 UX(재발급·만료)를 유지. 라이브 미가동 시 로컬 모의 폴백. */
  function submitInvite() {
    var el = $("#inv-email");
    var email = el ? el.value.trim() : "";
    var roleSel = $('[data-modal="invite"] select');
    var roleTxt = (roleSel && roleSel.value) || "viewer";
    var role = /admin/i.test(roleTxt) ? "admin"
      : /operator|member/i.test(roleTxt) ? "member" : "viewer";
    NC.closeModal();
    function localReflect(tag) {
      var l = inviteList();
      l.unshift({ email: email, role: role, state: "sent", d: 7 });
      saveInvites(l);
      resetModalInputs("invite");
      renderInvites();
      NC.toast("멤버 초대 — " + email + " (" + role + ")" + tag +
        " · 수락 후 MFA 등록을 완료해야 로그인할 수 있습니다");
    }
    if (!NC.api.memberInvite) { localReflect(" (모의)"); return; }
    NC.api.memberInvite({ email: email, role: role }).then(function (m) {
      if (!m) return;                        // 403
      if (m.error) { NC.toast("초대 실패 — " + m.error, "warn"); return; }
      localReflect(m._mock ? " (데모)" : " · state " + (m.state || "invited"));
      renderMembers();
    });
  }

  /* ── 변경 요청 분기 (P2-5) — 계약 범위 내 → 운영 티켓 ── */
  function submitChangeInContract() {
    var item = ($("#rs-in-item") || {}).value || "구성 변경";
    NC.closeModal();
    if (NC.live && curTenant && NC.api.createTicket) {
      NC.api.createTicket({
        tenant_id: curTenant.id, subject: "[변경 요청] " + item,
        severity: "medium", body: "계약 범위 내 변경 — 운영 검토 후 실행",
        type: "change", routed_to: "ops", change_scope: "in_contract",
      }).then(function (t) {
        if (t && t.id) {
          NC.toast("변경 요청 " + t.id + " 접수 — 운영팀 검토 후 무중단 실행 " +
            "(계약 범위 내 · Amendment 불필요)");
          refreshTickets();
        } else {
          NC.toast("변경 요청 접수 (데모) — " + item +
            " · 운영팀 검토 후 무중단 실행");
        }
      }).catch(function () {
        NC.toast("변경 요청 접수 실패 — 잠시 후 다시 시도해주세요", "warn");
      });
    } else {
      NC.toast("변경 요청 접수 (데모) — " + item +
        " · 운영팀 검토 후 무중단 실행 (계약 범위 내 · Amendment 불필요)");
    }
  }
  function applyResizeScopeUi() {
    var v = (document.querySelector('input[name="rs-scope"]:checked') || {})
      .value || "amend";
    $$(".scope-opt").forEach(function (el) {
      el.classList.toggle("on", el.dataset.scope === v);
    });
    var ap = $("#rs-amend-panel"), ip = $("#rs-in-panel");
    if (ap) ap.style.display = v === "amend" ? "" : "none";
    if (ip) ip.style.display = v === "in" ? "" : "none";
    var btn = $("#rs-submit");
    if (btn) btn.textContent = v === "amend"
      ? "Amendment 견적 요청" : "변경 요청 접수 (운영)";
  }

  /* ── 티켓 유형 UI — 라우팅 뱃지 · 청구 이의 정책 안내 ── */
  function applyTicketTypeUi() {
    var meta = ticketTypeSel();
    var b = $("#tkt-route");
    if (b) {
      b.textContent = meta.routed_to === "biz"
        ? "사업팀 (Billing) — 검토 후 차기 조정"
        : meta.type === "change"
          ? "운영팀 — 검토 후 실행 (SLA 4시간)"
          : "운영팀 (NOC) — 응답 SLA 적용";
      b.classList.toggle("biz", meta.routed_to === "biz");
    }
    var p = $("#tkt-policy");
    if (p) p.style.display = meta.type === "billing_dispute" ? "" : "none";
  }
  function openBillingDispute() {
    var sel = $("#tkt-type");
    if (sel) sel.value = "billing_dispute";
    applyTicketTypeUi();
    var subj = $("#tkt-subject");
    if (subj && !subj.value.trim())
      subj.value = "INV-2026-06 청구 이의 — 항목 확인 요청";
    NC.openModal("ticket");
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
  // 세션 전환 (데모 로그인) — 세션 UI·게이트·전 화면 재렌더
  NC.bus.on("session.changed", function () {
    curTenant = null;                        // 테넌트 캐시 무효화
    closeRebootFlow();                       // 진행 패널·시크릿 노출 해제
    var so = $("#secret-once"); if (so) so.style.display = "none";
    applySessionUi();
    renderTenantScope();
    refreshTickets();
    NC.api.alerts().then(renderAlertFeeds);
    applyRbacGates();
    NC.route();                              // 현재 화면 onShow 재실행 (route
  });                                        // 버스에서 스크럽·게이트 재적용)

  /* ══ 모달 확정 액션 ═══════════════════════════════════════════
     라이브 실연동: ticket(createTicket) · create_cluster/resize(createOrder)
     · reclaim(terminateOrder) · apikey(iamToken).
     nocp 대응물 없는 액션·폴백: 데모 토스트 유지 — "(PoC 미연동)" 명시. */
  var ACTION_TOAST = {
    create_cluster: "클러스터 주문 요청이 접수되었습니다 (데모) — 운영 승인 게이트로 전달",
    resize:         "변경 요청(계약 조건 변경) 접수 (데모) — 사업팀 재견적 → " +
                    "Amendment 체결 → Fulfillment 재진행",
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

  /* ══ 노드 재기동/HW 교체 라이프사이클 스테퍼 (P1) ════════════════
     POST /nodes/{id}/reboot|replace → 반환 stages로 진행 패널 표시 →
     GET /nodes/{id}/lifecycle 2.2s 폴링으로 단계 전진. 화면 이탈 시 해제.
     라이브 미가동/폴백 시 mock-api가 동일 shape로 스테이지를 전진시킨다. */
  var rebootPoll = null, rebootHost = null, rebootOpId = null;
  var STAGE_LBL = {
    power_cycle: "전원 사이클", post: "POST", nico_discovery: "NICo 디스커버리",
    dhcp_ip: "DHCP IP 할당", boot: "부팅", attestation: "재검증(attestation)",
    tenant_rejoin: "테넌트 재합류", drain: "워크로드 드레인",
    hw_swap: "하드웨어 교체 (RMA)", pxe_os_install: "PXE OS 재설치",
    in_service: "서비스 복귀" };
  function stopRebootPoll() {
    if (rebootPoll) { clearInterval(rebootPoll); rebootPoll = null; }
  }
  function closeRebootFlow() {
    stopRebootPoll();
    var el = $("#reboot-flow");
    if (el) el.style.display = "none";
  }
  function rebootPanelEl() {
    var el = $("#reboot-flow");
    if (!el) {
      el = document.createElement("div");
      el.id = "reboot-flow";
      el.className = "panel";
      el.style.cssText = "position:fixed;right:20px;bottom:20px;width:344px;" +
        "z-index:120;box-shadow:0 14px 46px rgba(0,0,0,.42);max-height:82vh;" +
        "overflow:auto;margin:0";
      document.body.appendChild(el);
    }
    return el;
  }
  function renderRebootPanel(op, done) {
    var el = rebootPanelEl();
    var stages = (op && op.stages) || [];
    var opLbl = (op && op.op) === "replace" ? "하드웨어 교체" : "노드 재기동";
    var idx = op ? (op.stage_idx || 0) : 0;
    var total = stages.length || 1;
    var runningHalf = stages[idx] && stages[idx].status === "running" ? 0.5 : 0;
    var pct = done ? 100
      : Math.min(99, Math.round(((idx + runningHalf) / total) * 100));
    el.innerHTML =
      '<div class="ph" style="margin-bottom:8px">' +
      '<span class="dot ' + (done ? "green" : "blue") +
      '" style="width:8px;height:8px"></span>' +
      '<span class="t">' + opLbl + " — " + esc(rebootHost || "") + "</span>" +
      '<button class="x" id="reboot-flow-x" style="margin-left:auto">✕</button>' +
      "</div>" +
      '<div class="mini" style="margin:0 0 8px">' +
      (done ? "완료 — 노드가 서비스로 복귀했습니다 (tenant rejoin)"
        : "AI Infra trayops 실 라이프사이클 · " + pct + "% 진행") + "</div>" +
      '<div class="bar" style="margin-bottom:10px"><i class="' +
      (done ? "green" : "blue") + '" style="width:' + pct + '%"></i></div>' +
      stages.map(function (s, i) {
        var st = s.status;
        var color = st === "done" ? "green" : st === "running" ? "blue" : "gray";
        return '<div style="display:flex;align-items:center;gap:8px;' +
          "padding:3px 0;font-size:11.5px;color:var(--" +
          (st === "pending" ? "muted2" : "strong") + ')">' +
          '<span class="dot ' + color + '" style="width:7px;height:7px"></span>' +
          '<span style="' + (st === "running" ? "font-weight:700" : "") + '">' +
          (i + 1) + ". " + esc(STAGE_LBL[s.name] || s.name) + "</span>" +
          '<span style="margin-left:auto;color:var(--muted2)">' +
          (s.duration_s != null ? Math.round(s.duration_s) + "s" : "") +
          "</span></div>";
      }).join("");
    el.style.display = "";
  }
  function startRebootFlow(host, opKind) {
    if (!host) {
      NC.toast("호스트 ID를 확인할 수 없습니다 — 노드 목록을 새로고침하세요", "warn");
      return;
    }
    stopRebootPoll();
    rebootHost = host; rebootOpId = null;
    var fn = opKind === "replace" ? NC.api.nodeReplace : NC.api.nodeReboot;
    if (!fn) { NC.toast(ACTION_TOAST.reboot); return; }
    fn(host).then(function (op) {
      if (op == null) return;                // 403 — surface403가 이미 표면화
      if (op.error) {                        // 409(진행 중) 등 — mock으로 새지 않음
        NC.toast((opKind === "replace" ? "HW 교체" : "재부팅") +
          " 시작 실패 — " + op.error, "warn");
        return;
      }
      rebootOpId = op.op_id || null;
      renderRebootPanel(op, false);
      NC.toast((opKind === "replace" ? "HW 교체" : "노드 재부팅") +
        " 시작 — " + host + " (" + (op.op_id || "") + ")" +
        (op._mock ? " · 데모" : "") + " · 라이프사이클 진행 중");
      rebootPoll = setInterval(function () { pollReboot(host); }, 2200);
    });
  }
  function pollReboot(host) {
    if (curRoute !== "nodes") { closeRebootFlow(); return; }
    if (!NC.api.nodeLifecycle) { stopRebootPoll(); return; }
    NC.api.nodeLifecycle(host).then(function (lc) {
      if (!lc) return;
      var pick = function (arr) {
        arr = arr || [];
        return arr.filter(function (o) {
          return !rebootOpId || o.op_id === rebootOpId; })[0] || arr[0];
      };
      var active = pick(lc.active);
      if (active) { renderRebootPanel(active, false); return; }
      stopRebootPoll();                      // active 비었으면 완료
      var doneOp = pick(lc.ops);
      if (doneOp) {
        var st = (doneOp.stages || []).map(function (s) {
          return { name: s.name, status: "done",
            duration_s: s.duration_s != null ? s.duration_s
              : (doneOp.stage_durations || {})[s.name] };
        });
        if (!st.length && doneOp.stage_durations)
          st = Object.keys(doneOp.stage_durations).map(function (n) {
            return { name: n, status: "done",
              duration_s: doneOp.stage_durations[n] }; });
        renderRebootPanel({ op: doneOp.op, stage_idx: st.length - 1,
          stages: st }, true);
      }
      NC.toast("노드 " + host + " 라이프사이클 완료 — 서비스 복귀 (tenant rejoin)");
      renderNodes();
    }).catch(function () {});
  }

  /* ══ 스토리지 액션 (volume/snapshot/qos/delete) — VAST 실연동 ═══ */
  function submitVolumeLive() {
    var path = (($("#vol-path") || {}).value || "").trim();
    var name = path.replace(/^\/+/, "").split("/").filter(Boolean).pop() || "vol";
    var quota = ($("#vol-quota") || {}).value || "2 PB";
    var capTb = parseNum(quota) * (/pb/i.test(quota) ? 1000 : 1);
    var qsel = ($("#vol-qos") || {}).value || "";
    var parts = qsel.split("·");
    var bw = parseNum(parts[0]) || 160;
    var iopsK = /m/i.test(parts[1] || "")
      ? parseNum(parts[1]) * 1000 : (parseNum(parts[1]) || 800);
    var proto = ($("#vol-proto") || {}).value || "NFS";
    NC.closeModal();
    if (!NC.api.storageCreateVolume) { NC.toast(ACTION_TOAST.volume); return; }
    NC.api.storageCreateVolume({ name: name, capacity_tb: capTb,
      protocol: proto, qos_bw_gbps: bw, qos_iops_k: iopsK }).then(function (v) {
      if (!v) return;                        // 403
      if (v.error) { NC.toast("볼륨 생성 실패 — " + v.error, "warn"); return; }
      NC.toast("볼륨 생성 — " + (v.path || name) + " · " +
        fmtCap(v.capacity_tb) + " · " +
        Math.round((v.qos && v.qos.bw_gbps) || bw) + "GB/s" +
        (v._mock ? " (데모)" : ""));
      resetModalInputs("volume");
      renderStorage();
    });
  }
  function submitSnapshotLive() {
    var name = (($("#snap-name") || {}).value || "").trim();
    var vid = snapCtx && snapCtx.vid;
    NC.closeModal();
    if (!vid || !NC.api.storageCreateSnapshot) {
      NC.toast(ACTION_TOAST.snapshot); return;
    }
    NC.api.storageCreateSnapshot({ volume_id: vid, note: name }).then(function (s) {
      if (!s) return;
      if (s.error) { NC.toast("스냅샷 생성 실패 — " + s.error, "warn"); return; }
      NC.toast("스냅샷 생성 — " + (s.snapshot_id || "") + " · " +
        ((snapCtx && snapCtx.path) || "") + " (" + fmtCap(s.size_tb || 0) + ")" +
        (s._mock ? " (데모)" : ""));
      renderStorage();
    });
  }
  function submitQosLive() {
    var vid = qosCtx && qosCtx.vid;
    var bw = parseNum(($("#qos-target") || {}).value) || 1280;
    var iopsK = Math.round(bw * 0.32);
    NC.closeModal();
    if (!vid || !NC.api.storageSetQos) { NC.toast(ACTION_TOAST.qos); return; }
    NC.api.storageSetQos(vid, { bw_gbps: bw, iops_k: iopsK }).then(function (v) {
      if (!v) return;
      if (v.error) { NC.toast("QoS 변경 실패 — " + v.error, "warn"); return; }
      NC.toast("QoS 변경 — " + ((qosCtx && qosCtx.path) || "") + " → " +
        Math.round((v.qos && v.qos.bw_gbps) || bw) + "GB/s · " +
        Math.round((v.qos && v.qos.iops_k) || iopsK) + "K IOPS" +
        (v._mock ? " (데모)" : ""));
      renderStorage();
    });
  }
  function deleteVolume(vid) {
    if (!vid) return;
    if (!window.confirm("볼륨 삭제 — " + vid +
        " 을(를) 삭제하시겠습니까? (스냅샷 미보유 시 복구 불가)")) return;
    if (!NC.api.storageDeleteVolume) {
      NC.toast("볼륨 삭제는 Control-Plane 연동 시 사용할 수 있습니다", "warn");
      return;
    }
    NC.api.storageDeleteVolume(vid).then(function (r) {
      if (!r) return;
      if (r.error) { NC.toast("볼륨 삭제 실패 — " + r.error, "warn"); return; }
      NC.toast("볼륨 삭제 완료 — " + vid + (r._mock ? " (데모)" : ""));
      renderStorage();
    });
  }

  /* ══ IAM — API 키 (GET/POST/DELETE /api-keys) ══════════════════ */
  var API_SCOPE_LBL = { read: "읽기 전용", admin: "전체 권한",
    deploy: "배포 권한", write: "쓰기" };
  function renderApiKeys() {
    var tb = $("#api-key-rows");
    if (!tb || !NC.api.apiKeys) return;
    NC.api.apiKeys().then(function (ks) {
      if (!ks) return;                       // 폴백 — 정적 유지
      var list = Array.isArray(ks) ? ks : [];
      var canRevoke = can("apikey");
      tb.innerHTML = list.length
        ? list.map(function (k) {
            return '<tr><td class="id">' + esc(k.prefix || k.key_id) + "</td>" +
              '<td style="color:var(--muted)">' + esc(k.name || "") + " · " +
              esc(API_SCOPE_LBL[k.scope] || k.scope || "") + "</td>" +
              '<td style="color:var(--muted)">' +
              (k.last_used
                ? esc(String(k.last_used).slice(5, 16).replace("T", " "))
                : "미사용") + "</td>" +
              '<td class="num">' + (canRevoke
                ? '<button class="tbtn r" data-key-revoke="' + esc(k.key_id) +
                  '">회수</button>'
                : '<span class="st ' +
                  (k.state === "active" ? "green" : "amber") + '">' +
                  esc(k.state || "") + "</span>") + "</td></tr>";
          }).join("")
        : '<tr><td colspan="4" style="color:var(--muted2)">발급된 API 키가 ' +
          '없습니다 — "+ 키 발급"으로 생성하세요</td></tr>';
      setTimeout(applyRbacGates, 0);
    }).catch(function () {});
  }
  function showSecretOnce(k) {
    var el = $("#secret-once");
    if (!el) {
      el = document.createElement("div");
      el.id = "secret-once"; el.className = "panel";
      el.style.cssText = "position:fixed;left:50%;top:76px;" +
        "transform:translateX(-50%);width:min(560px,92vw);z-index:130;" +
        "box-shadow:0 18px 54px rgba(0,0,0,.5);margin:0";
      document.body.appendChild(el);
    }
    el.innerHTML =
      '<div class="ph" style="margin-bottom:8px"><span class="tick amber"></span>' +
      '<span class="t">API 키 발급 완료 — 시크릿 1회 노출</span>' +
      '<button class="x" id="secret-once-x" style="margin-left:auto">✕</button>' +
      "</div>" +
      '<div class="mini" style="margin:0 0 8px">' + esc(k.name || "") +
      " · scope " + esc(API_SCOPE_LBL[k.scope] || k.scope || "") + " · " +
      esc(k.key_id || "") + "</div>" +
      '<div class="code" style="user-select:all;word-break:break-all">' +
      esc(k.secret || "") + "</div>" +
      '<div class="redcall" style="margin-top:10px"><span class="ic">⚠</span>' +
      "<span>이 시크릿은 <b>지금 1회만</b> 표시됩니다 — 복사 후 재열람할 수 " +
      "없습니다. 분실 시 회수 후 재발급하세요.</span></div>" +
      '<div class="mf" style="margin-top:10px">' +
      '<button class="btn" data-copy="' + esc(k.secret || "") +
      '">시크릿 복사</button></div>';
    el.style.display = "";
  }
  function revokeApiKey(kid) {
    if (!kid) return;
    if (!window.confirm("API 키 회수 — " + kid +
        " 을(를) 즉시 폐기하시겠습니까? (복구 불가)")) return;
    if (!NC.api.apiKeyRevoke) return;
    NC.api.apiKeyRevoke(kid).then(function (r) {
      if (!r) return;
      if (r.error) { NC.toast("키 회수 실패 — " + r.error, "warn"); return; }
      NC.toast("API 키 회수 완료 — " + kid + (r._mock ? " (데모)" : ""));
      renderApiKeys();
    });
  }

  /* ══ IAM — 멤버 (GET/POST/PATCH/DELETE /members) ═══════════════ */
  var MEMBER_ROLES = [["admin", "org admin"], ["member", "operator"],
    ["viewer", "viewer"]];
  function memberLiveRow(m, isAdmin) {
    var roleCell = isAdmin
      ? '<select data-mem-role="' + esc(m.member_id) + '" data-mem-email="' +
        esc(m.email) + '" style="font-size:11px;padding:2px 6px">' +
        MEMBER_ROLES.map(function (r) {
          return '<option value="' + r[0] + '"' +
            (m.role === r[0] ? " selected" : "") + ">" + r[1] + "</option>";
        }).join("") + "</select>"
      : '<span style="color:var(--muted)">' + esc(m.role) + "</span>";
    var stLbl = m.state === "invited"
      ? '<span class="st amber">초대됨 · MFA 미등록</span>'
      : (m.mfa ? "MFA ✓" : "MFA 미등록");
    var del = isAdmin ? ' · <button class="tbtn r" data-mem-del="' +
      esc(m.member_id) + '" data-mem-email="' + esc(m.email) +
      '">제거</button>' : "";
    return "<tr><td><b>" + esc(m.email) + "</b></td><td>" + roleCell + "</td>" +
      '<td style="color:var(--muted)">' + stLbl + del + "</td></tr>";
  }
  function renderMembersFallback() {
    var tb = $("#member-rows");
    if (!tb) return;
    var s = getSession();
    var dom = s.tenant_name + ".com";
    tb.innerHTML =
      memberRow(s.user, "user@" + dom, s.role,
        s.role === "viewer" ? "MFA ✓ · 읽기 전용" : "MFA ✓ · SSO", true) +
      memberRow("이승민", "lee.sm@" + dom, "member", "MFA ✓ · SSO") +
      memberRow("정하윤", "jung.hy@" + dom, "viewer", "MFA ✓") +
      '<tr><td class="id">svc-' + esc(s.tenant_name) +
      '</td><td style="color:#c8a5e8;font-weight:700">service account</td>' +
      '<td style="color:var(--muted)">API 키 인증</td></tr>';
  }
  function updateMemberRole(mid, email, role) {
    if (!NC.api.memberUpdate) {
      NC.toast("역할 변경은 Control-Plane 연동 시 사용할 수 있습니다", "warn");
      return;
    }
    NC.api.memberUpdate(mid, { email: email, role: role }).then(function (m) {
      if (!m) { renderMembers(); return; }   // 403
      if (m.error) {
        NC.toast("역할 변경 실패 — " + m.error, "warn"); renderMembers(); return;
      }
      NC.toast("멤버 역할 변경 — " + email + " → " + role +
        (m._mock ? " (데모)" : ""));
      renderMembers();
    });
  }
  function removeMember(mid, email) {
    if (!window.confirm("멤버 제거 — " + email +
        " 을(를) 이 테넌트에서 제거하시겠습니까?")) return;
    if (!NC.api.memberRemove) {
      NC.toast("멤버 제거는 Control-Plane 연동 시 사용할 수 있습니다", "warn");
      return;
    }
    NC.api.memberRemove(mid).then(function (r) {
      if (!r) return;
      if (r.error) { NC.toast("멤버 제거 실패 — " + r.error, "warn"); return; }
      NC.toast("멤버 제거 완료 — " + email + (r._mock ? " (데모)" : ""));
      renderMembers();
    });
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
        NC.toast("확장 " + o.id + " 상태: " + o.state +
          " — 재견적·Amendment 반영 후 Fulfillment 진행");
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
    if (id === "acceptance") fillAcceptanceModal();
    if (id === "ticket") applyTicketTypeUi();
    if (id === "resize") applyResizeScopeUi();
    if (id === "demo_login") fillDemoLogin();
    setTimeout(applyRbacGates, 0);           // 모달 내 액션 버튼 게이팅
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
  /* apikey — POST /api-keys → secret 1회 노출(showSecretOnce) → 목록 갱신.
     라이브 미가동 시 mock apiKeyCreate가 동일 shape(secret 포함)로 폴백. */
  function submitApikeyLive() {
    var name = (($("#ak-name") || {}).value || "").trim();
    var scopeTxt = ($("#ak-scope") || {}).value || "읽기 전용";
    var scope = /전체/.test(scopeTxt) ? "admin"
      : /배포/.test(scopeTxt) ? "deploy" : "read";
    NC.closeModal();
    if (!NC.api.apiKeyCreate) { NC.toast(ACTION_TOAST.apikey); return; }
    NC.api.apiKeyCreate({ name: name, scope: scope }).then(function (k) {
      if (!k) return;                        // 403
      if (k.error) { NC.toast("키 발급 실패 — " + k.error, "warn"); return; }
      showSecretOnce(k);                     // 시크릿 1회 노출 (복사)
      pushTokenLog({
        at: new Date().toISOString().slice(5, 16).replace("T", " "),
        client: k.key_id, name: name,
        token: k.prefix || "nc_sk", scope: scope });
      NC.toast("API 키 발급 완료 — " + (k.key_id || "") + " (" +
        (API_SCOPE_LBL[scope] || scope) + ")" + (k._mock ? " · 데모" : "") +
        " · 시크릿은 지금 1회만 복사하세요");
      resetModalInputs("apikey");
      renderApiKeys();
      renderApiTokenLog();
    });
  }

  function ticketTypeSel() {
    var el = $("#tkt-type");
    var ty = (el && el.value) || "tech";
    return { type: ty,
      routed_to: ty === "billing_dispute" ? "biz" : "ops",
      change_scope: ty === "change" ? "in_contract" : undefined };
  }
  function submitTicketLive() {
    var subjEl = $("#tkt-subject"), sevEl = $("#tkt-sev");
    var subject = (subjEl && subjEl.value.trim()) || "고객 콘솔 문의";
    var sevTxt = (sevEl && sevEl.value) || "P2";
    var severity = sevTxt.indexOf("P1") === 0 ? "critical"
                 : sevTxt.indexOf("P3") === 0 ? "medium" : "high";
    var meta = ticketTypeSel();              // 유형·라우팅 (백엔드 계약 필드)
    NC.closeModal();
    NC.api.createTicket({
      tenant_id: curTenant.id, subject: subject,
      severity: severity, body: "고객 콘솔 접수",
      type: meta.type, routed_to: meta.routed_to,
      change_scope: meta.change_scope,
    }).then(function (t) {
      if (t && t.id) {
        NC.toast("지원 티켓 " + t.id + " 접수 완료 — " +
          (TKT_ROUTE_LBL[meta.routed_to] || "운영팀") + " 라우팅 (" +
          (TKT_TYPE_LBL[meta.type] || meta.type) + " · " + severity + ")");
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
  var rebootCtx = null, snapCtx = null, qosCtx = null;
  function prepModal(op) {
    var id = op.dataset.open;
    var tr = op.closest("tr");
    var cell = tr ? tr.querySelector(".id") : null;
    var rowId = cell ? cell.textContent.trim() : "";
    if (id === "reboot") {
      var isReplace = op.dataset.op === "replace";
      rebootCtx = { host: op.dataset.host || "", op: isReplace ? "replace"
        : "reboot", tray: rowId };
      var rt = $("#reboot-title");
      if (rt) rt.textContent = (isReplace ? "하드웨어 교체 — " : "노드 재부팅 — ") +
        (rebootCtx.host || rowId || "nh-su-5-r00-t00");
      var rmode = document.querySelector('[data-modal="reboot"] .mb .mini');
      if (rmode) rmode.textContent = isReplace
        ? "드레인 → RMA 교체 → 재프로비저닝 · 예상 10–15분 · 워크로드는 다른 노드로 재스케줄됩니다"
        : "예상 소요 4–6분 · 실행 중 워크로드는 다른 노드로 재스케줄됩니다";
      var rbtn = document.querySelector('[data-modal="reboot"] [data-act="reboot"]');
      if (rbtn) rbtn.textContent = isReplace ? "HW 교체 실행" : "재부팅 실행";
    } else if (id === "snapshot") {
      snapCtx = { vid: op.dataset.vid || "", path: rowId };
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
      qosCtx = { vid: op.dataset.vid || "", path: rowId };
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
    reclaim: function () {                   // 종료 요청서 — 백업 계획 필수
      var el = $("#rc-backup");
      return el && el.value.trim() ? true
        : guardFail(el, "백업 계획을 입력하세요 — 백업 확인 전에는 시스템이 " +
            "종료를 차단합니다");
    },
  };
  function resetModalInputs(a) {
    var map = { ticket: ["#tkt-subject", "#sup-q-subject"],
      volume: ["#vol-path"], apikey: ["#ak-name"], invite: ["#inv-email"],
      reclaim: ["#rc-backup"] };
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
    "bill-dispute": openBillingDispute,
    "term-confirm-btn": submitTerminationConfirm,
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
    /* 단일 id 액션 (모두 읽음 · 더 보기 · CSV ×2 · 격리 보기 · 이의 · 종료) */
    var one = e.target.closest(
      "#alerts-readall,#alerts-more,#bill-csv,#audit-csv,#iso-view," +
      "#k8s-install-btn,#bill-dispute,#term-confirm-btn");
    if (one) { ID_ACTIONS[one.id](); return; }
    /* RCA 리포트 열람 (서비스 상태 화면) */
    var rv = e.target.closest("[data-rca-view]");
    if (rv) { viewRca(parseInt(rv.dataset.rcaView, 10) || 0); return; }
    /* 초대 재발급 (설정 화면 — 모의) */
    var ir = e.target.closest("[data-inv-resend]");
    if (ir) { resendInvite(ir.dataset.invResend); return; }
    /* 라이프사이클 진행 패널 · 시크릿 1회 노출 패널 닫기 */
    if (e.target.closest("#reboot-flow-x")) { closeRebootFlow(); return; }
    var sox = e.target.closest("#secret-once-x");
    if (sox) { var so = $("#secret-once"); if (so) so.style.display = "none"; return; }
    /* 스토리지 볼륨 삭제 (DELETE /storage/volumes/{vid}) */
    var vd = e.target.closest("[data-vol-del]");
    if (vd) { deleteVolume(vd.dataset.volDel); return; }
    /* API 키 회수 (DELETE /api-keys/{kid}) */
    var kr = e.target.closest("[data-key-revoke]");
    if (kr) { revokeApiKey(kr.dataset.keyRevoke); return; }
    /* 멤버 제거 (DELETE /members/{mid}) */
    var md = e.target.closest("[data-mem-del]");
    if (md) { removeMember(md.dataset.memDel, md.dataset.memEmail); return; }
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
      if (a === "demo_login") { submitDemoLogin(); return; }
      if (GUARDS[a] && !GUARDS[a]()) return; // 빈 값 가드 — 모달 유지
      var liveReady = NC.live && curTenant;  // 미기동 → 데모 토스트 폴백
      /* 인수 승인/반려 (CP-004) — mock 폴백 내장 (acceptanceDecision) */
      if (a === "accept_approve") { submitAcceptApprove(); return; }
      if (a === "accept_reject") { submitAcceptReject(); return; }
      /* 종료 요청서 (CP-012) — 회수 흐름을 종료 워크플로우로 확장 */
      if (a === "reclaim") { submitTerminationStart(); return; }
      /* 초대 — POST /members (라이브) · 폴백 로컬 모의 */
      if (a === "invite") { submitInvite(); return; }
      /* 노드 재부팅 / HW 교체 — 라이프사이클 스테퍼 (live 우선 · mock 폴백) */
      if (a === "reboot") {
        var rHost = rebootCtx && rebootCtx.host;
        var rOp = (rebootCtx && rebootCtx.op) || "reboot";
        NC.closeModal();
        startRebootFlow(rHost, rOp);
        return;
      }
      /* 스토리지 — volume(POST) · snapshot(POST) · qos(PATCH) */
      if (a === "volume") { submitVolumeLive(); return; }
      if (a === "snapshot") { submitSnapshotLive(); return; }
      if (a === "qos") { submitQosLive(); return; }
      /* API 키 — POST /api-keys (secret 1회 노출) · mock 폴백 */
      if (a === "apikey") { submitApikeyLive(); return; }
      if (a === "ticket" && liveReady && NC.api.createTicket) {
        submitTicketLive(); return;          // Control-Plane 실 접수
      }
      if (a === "create_cluster" && liveReady && NC.api.createOrder) {
        submitCreateClusterLive(); return;   // 실주문 (POST /orders)
      }
      if (a === "resize") {                  // 변경 분기 (P2-5)
        var scope = (document.querySelector(
          'input[name="rs-scope"]:checked') || {}).value || "amend";
        if (scope === "in") { submitChangeInContract(); return; }
        if (liveReady && NC.api.createOrder) {
          submitResizeLive(); return;        // Amendment 확장 실주문
        }
        NC.closeModal();
        NC.toast(ACTION_TOAST.resize);
        return;
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
    var t = e.target;
    if (!t) return;
    if (t.id === "cc-k8s") {
      var note = $("#cc-k8s-note");
      if (note) note.style.display = t.checked ? "" : "none";
    }
    if (t.id === "tkt-type") applyTicketTypeUi();
    if (t.dataset && t.dataset.memRole)      // 멤버 역할 변경 (PATCH /members)
      updateMemberRole(t.dataset.memRole, t.dataset.memEmail, t.value);
    if (t.name === "rs-scope") applyResizeScopeUi();
    if (t.id === "sla-month") renderSlaPanel();
    if (t.dataset && t.dataset.termChk) {    // 종료 백업 체크리스트 게이트
      termChk[t.dataset.termChk] = !!t.checked;
      var all = termChk.extracted && termChk.migrated && termChk.verified;
      var btn = $("#term-confirm-btn");
      if (btn) {
        btn.disabled = !all;
        btn.style.opacity = all ? "" : ".4";
        btn.style.cursor = all ? "" : "default";
      }
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
    status: renderStatus,                    // CP-011 서비스 상태 (신설)
    billing: renderBilling,
    support: renderSupport,
    security: renderSecurity,
    api: renderApi,
    settings: renderSettings,
  });

  // 세션 UI·RBAC 게이트 초기 적용 (테넌트 select는 격리 원칙으로 제거됨)
  applySessionUi();
  applyRbacGates();

  // 사이드바 배지 등 전역 표시는 첫 진입 화면과 무관하게 채운다
  renderTenantScope();
  refreshTickets();
  NC.api.alerts().then(renderAlertFeeds);   // 알림 배지 = alerts() 건수
  NC.api.sanitization().then(applySanitization);
  renderSysChip();                          // "모든 시스템 정상" 칩 동기
  renderApiTokenLog();                      // IAM 발급 이력 (localStorage)
})();
