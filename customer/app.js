/* NeoCloud 고객 콘솔 — 화면 렌더러 · VRCM 실연동 + mock 폴백.
   라우팅/모달/토스트/버스는 ../shared/app.js,
   데이터는 ../shared/mock-api.js → ../shared/vrcm-api.js 가 NC.api를
   라이브 어댑터로 교체(vrcm :8000 기동 시 실데이터, 아니면 mock 폴백).
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

  /* ══ 현재 테넌트 (라이브: vrcm 테넌트 / 폴백: mock fin-corp) ═══ */
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

  function renderAlertFeeds(alerts) {
    alerts = alerts || [];
    var html = alerts.map(alertItem).join("");
    ["#dash-alerts", "#alerts-feed"].forEach(function (sel) {
      var el = $(sel);
      if (el) el.innerHTML = html;
    });
    var n = String(alerts.length);
    var bd = $("#mi-alerts-bd"); if (bd) bd.textContent = n;
    var bell = $("#tb-bell-n"); if (bell) bell.textContent = n;
    var unread = $("#alerts-unread"); if (unread) unread.textContent = "미확인 " + n;
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

  function renderTicketList(list) {
    var html = list.length
      ? list.map(ticketCard).join("")
      : '<div class="mini" style="margin-top:0">접수된 티켓이 없습니다 — ' +
        '"+ 생성" 버튼으로 접수하세요</div>';
    ["#dash-tickets", "#support-tickets"].forEach(function (sel) {
      var el = $(sel);
      if (el) el.innerHTML = html;
    });
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
      "VRCM 실시간</span></div>" +
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
        // vrcm /tenants 목록엔 allocations가 없어 racks=0으로 옴 —
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
          mine.length + " · " + racks + "랙 가동 중 (VRCM 실시간)";
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
      f.innerHTML = "VRCM 4계층 격리 실검증: " +
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
    tb.innerHTML = rows.map(function (r) {
      return '<tr><td style="width:130px">' + r[0] + "</td><td>" +
        r[1] + "</td></tr>";
    }).join("");
    if (sub) sub.textContent = esc(last.order) + " · " + last.racks + "랙" +
      (pkgs.length > 1 ? " (외 " + (pkgs.length - 1) + "건)" : "") +
      " · VRCM 실시간";
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

  /* 노드 — nodes(tid)+cpuNodes(tid) 실 테이블 (null → 정적 유지) */
  function renderNodes() {
    refreshTickets();
    loadTenant().then(function (t) {
      if (!t || !NC.api.nodes) return;
      Promise.all([NC.api.nodes(t.id),
        NC.api.cpuNodes ? NC.api.cpuNodes(t.id) : null
      ]).then(function (res) {
        var ns = res[0], cpus = res[1] || [];
        var tb = $("#nodes-tbody");
        if (!ns || !tb) return;              // 폴백 — mock 테이블 유지
        var inSvc = ns.filter(function (n) {
          return n.state === "in_service";
        }).length;
        var LIMIT = 10;
        var rows = ns.slice(0, LIMIT).map(function (n) {
          return "<tr" +
            (n.state === "in_service" ? "" : ' class="fault"') +
            '><td class="id">' + esc(n.tray_id) + "</td>" +
            '<td class="id" style="color:var(--muted)">' +
            esc(n.nico_instance_id || "—") + "</td>" +
            '<td style="color:var(--muted)">' + esc(n.blueprint_key) +
            " · 4× Rubin · 2× Vera</td>" +
            "<td>" + stateChipHtml(n.state) + "</td>" +
            '<td class="num" style="color:var(--muted)">—</td>' +
            '<td><button class="tbtn" data-open="console_access">콘솔' +
            '</button> · <button class="tbtn a" data-open="reboot">재부팅' +
            "</button></td></tr>";
        });
        cpus.slice(0, 5).forEach(function (c) {
          rows.push('<tr><td class="id">' + esc(c.id) + "</td>" +
            '<td class="id">' + esc(c.host_ip || "—") + "</td>" +
            '<td style="color:var(--muted)">CPU 노드 · ' +
            esc(c.cpu_arch || "") + " " + (c.cores || "—") + "c · " +
            (c.mem_tb || "—") + "TB</td>" +
            "<td>" + stateChipHtml(c.state) + "</td>" +
            '<td class="num" style="color:var(--muted)">—</td>' +
            '<td><button class="tbtn" data-open="console_access">콘솔' +
            "</button></td></tr>");
        });
        if (ns.length > LIMIT) rows.push(
          '<tr><td colspan="6" style="color:var(--muted2)">… 외 ' +
          (ns.length - LIMIT) + " GPU 노드 — VRCM 실데이터</td></tr>");
        tb.innerHTML = rows.join("");
        $$("[data-node-summary]").forEach(function (el) {
          el.textContent = ns.length + " GPU 노드 · in-service " + inSvc +
            (ns.length - inSvc ? " · 기타 " + (ns.length - inSvc) : "") +
            " · CPU " + cpus.length;
        });
      }).catch(function () {});
    });
  }

  function stateChipHtml(s) {
    var color = s === "in_service" || s === "allocated" ? "green"
      : (s === "provisioning" || s === "reserved" ? "blue" : "amber");
    return statusChip(color, s === "in_service" ? "in-service" : s);
  }

  /* 내 DHCP 임대 — leases() 전 호스트를 nodes(tid) tray_id로 필터.
     폴백/내 임대 없음: 패널 숨김 */
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
        var LIMIT = 8;
        var html = rows.slice(0, LIMIT).map(function (l) {
          return '<tr><td class="id">' + esc(l.host_id) + "</td>" +
            '<td class="id">' + esc(l.ip) + "</td>" +
            '<td class="id" style="color:var(--muted)">' + esc(l.mac) +
            "</td>" +
            '<td class="num">' + Math.round((l.lease_s || 0) / 3600) +
            "h</td>" +
            '<td class="id" style="color:var(--muted)">' +
            esc(l.dhcp_server || "—") + "</td></tr>";
        }).join("");
        if (rows.length > LIMIT) html +=
          '<tr><td colspan="5" style="color:var(--muted2)">… 외 ' +
          (rows.length - LIMIT) + "개 임대 — NICo DHCP 실데이터</td></tr>";
        tb.innerHTML = html;
        var sub = $("#net-dhcp-sub");
        if (sub) sub.textContent = "임대 " + rows.length +
          "건 · NICo DHCP · VRCM 실시간";
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

  /* 스토리지 — storageViews() 현재 테넌트 필터 실렌더 */
  function renderStorage() {
    loadTenant().then(function (t) {
      if (!t || !NC.api.storageViews) return;
      NC.api.storageViews().then(function (vs) {
        var tb = $("#storage-volumes");
        if (!vs || !tb) return;              // 폴백 — 정적 유지
        var mine = (Array.isArray(vs) ? vs : []).filter(function (v) {
          return v.tenant_ref === t.id;
        });
        tb.innerHTML = mine.length ? mine.map(function (v) {
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
        }).join("")
          : '<tr><td colspan="5" style="color:var(--muted2)">할당된 볼륨 ' +
            "없음 — 클러스터 주문 시 자동 프로비저닝됩니다</td></tr>";
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

  /* 빌링 — billingUsage()+billingRates() 실렌더 (없으면 정적 유지) */
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
        var html = mine.map(function (l) {
          sum += l.amount_usd || 0;
          proj += l.projected_monthly_usd || 0;
          return "<tr><td>컴퓨트 — " + esc(l.order_id) + " (" +
            esc(l.blueprint_key) + " " + l.racks + "랙" +
            (l.active ? "" : " · 종료") + ")</td>" +
            '<td class="num id">' + usd(l.amount_usd) + "</td>" +
            '<td class="num" style="color:var(--muted);width:150px">' +
            (l.rack_hours || 0).toFixed(1) + " rack-h × $" +
            (l.rate_usd || 0) + "</td></tr>";
        }).join("");
        html += '<tr><td style="color:var(--strong);font-weight:700">합계 ' +
          '(MTD)</td><td class="num id" style="color:var(--strong);' +
          'font-weight:700">' + usd(sum) + "</td>" +
          '<td class="num" style="color:var(--muted)">월 환산 ' + usd(proj) +
          "</td></tr>";
        tb.innerHTML = html;
        var src = $("#bill-lines-src");
        if (src) src.textContent = "VRCM billing/usage 실데이터";
        var mtd = $("#bill-kpi-mtd"), msub = $("#bill-kpi-mtd-sub");
        var pj = $("#bill-kpi-proj"), psub = $("#bill-kpi-proj-sub");
        if (mtd) mtd.innerHTML = usdC(sum);
        if (msub) msub.textContent = "주문 " + mine.length +
          "건 · rack-hour 기반";
        if (pj) pj.innerHTML = usdC(proj);
        if (psub) psub.textContent = "활성 주문 월 환산 (VRCM)";
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
        (f.gpus_total || 0).toLocaleString("en-US") + " 기준 · VRCM 실측정";
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
  function renderAlerts() {
    NC.api.alerts().then(renderAlertFeeds);
    renderFaultKpis();
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
        " · VRCM 실측정) · 크레딧 발생 없음";
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
        " — 인도 " + secs.length + "건 실계산 (VRCM)";
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
     폴백(vrcm 다운): emuClusters()가 null → 정적 prod-training 패널 유지 */
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
      '<div class="mini">VRCM emu 실시간 텔레메트리 — 워크로드 프로파일을 ' +
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
      if (ks) ks.textContent = "bare-metal " + mine.length + " · VRCM 실시간";
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

  function renderClusters() {
    loadTenant().then(function (t) {
      applyTenant(t);
      renderClusterCards(t);
    });
    refreshTickets();
  }

  /* ══ 이미지 — spec() 블루프린트 카탈로그 실렌더 (폴백: 정적 표 유지)
     상세 사양(세대·MaxQ/MaxP)은 /api/v1/blueprints 보강 — 실패해도
     spec 기반으로 렌더. 커스텀 이미지 행(#images-custom)은 항상 유지 */
  var VRCM_BASE = localStorage.getItem("nc-vrcm") || "http://127.0.0.1:8000";

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
      fetch(VRCM_BASE + "/api/v1/blueprints")
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
          if (src) src.textContent = "VRCM 블루프린트 " +
            sp.blueprints.length +
            "종 — 기본 이미지 ubuntu-24.04-nvidia (CUDA 13.1 · NCCL 2.24)";
        });
    }).catch(function () {});
  }

  /* ══ 설정 — iamRealm(tid): realm·롤 3종·클라이언트 표 실렌더.
     apikey 발급 이력(localStorage)을 클라이언트별로 연계 표기.
     폴백(vrcm 다운): iamRealm null → 패널 숨김 · 정적 멤버 표 유지 */
  function renderSettings() {
    loadTenant().then(function (t) {
      var panel = $("#iam-realm-panel");
      if (!panel || !t || !NC.api.iamRealm) return;
      NC.api.iamRealm(t.id).then(function (r) {
        if (!r) { panel.style.display = "none"; return; } // 폴백 — 숨김
        var sub = $("#iam-realm-sub");
        if (sub) sub.textContent = "realm " + r.realm +
          (r.display ? " (" + r.display + ")" : "") + " · " +
          (r.state || "—") + " — Keycloak · VRCM 실시간";
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
     vrcm 대응물 없는 액션·폴백: 데모 토스트 유지 — "(PoC 미연동)" 명시. */
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
    var body = { tenant_id: curTenant.id, kind: "new",
                 blueprint_key: bp, racks: racks, storage_mode: "auto" };
    if (stMode === "manual") {
      body.storage_mode = "manual";
      body.storage_tb = racks * 1000;
      body.storage_gbps = racks * 80;
    }
    NC.closeModal();
    NC.api.createOrder(body).then(function (o) {
      if (!o) {
        NC.toast("주문 실패 — VRCM 응답 없음 (콘솔 로그 확인)", "warn");
        return;
      }
      if (o.state === "delivered") {
        NC.toast(o.id + " → delivered · GPU " +
          (racks * 72).toLocaleString("en-US") + "개 할당 (" + bp + " " +
          racks + "랙 · " + ((o.allocation_ids || [])[0] || "") + ")");
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
      if (!o) { NC.toast("확장 실패 — VRCM 응답 없음", "warn"); return; }
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
      if (!o) { NC.toast("회수 실패 — VRCM 응답 없음", "warn"); return; }
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
        NC.toast("지원 티켓 " + t.id + " 접수 완료 — VRCM 실 생성 (" +
          severity + ")");
        if (subjEl) subjEl.value = "";
        refreshTickets();
      } else {
        NC.toast(ACTION_TOAST.ticket);       // 라이브 이탈 → 데모 폴백
      }
    }).catch(function () {
      NC.toast("티켓 접수 실패 — 잠시 후 다시 시도해주세요", "warn");
    });
  }

  document.addEventListener("click", function (e) {
    /* 워크로드 프로파일 세그먼트 — setWorkload 실전환 (라이브 전용) */
    var wl = e.target.closest("[data-wl-p]");
    if (wl) {
      var wrap = wl.closest("[data-wl]");
      if (wrap && !wl.classList.contains("on")) {
        var wlTid = wrap.dataset.wl, wlProf = wl.dataset.wlP;
        if (NC.live && NC.api.setWorkload) {
          NC.api.setWorkload(wlTid, wlProf).then(function (r) {
            if (!r) {
              NC.toast("워크로드 전환 실패 — VRCM 응답 없음", "warn");
              return;
            }
            NC.toast("워크로드 프로파일 전환: " + (r.profile || wlProf) +
              " — emu 텔레메트리 패턴이 실제로 변경됩니다 (VRCM 실전환)");
            loadTenant().then(renderClusterCards);
          }).catch(function () {
            NC.toast("워크로드 전환 실패 — 잠시 후 다시 시도해주세요", "warn");
          });
        } else {
          NC.toast("워크로드 전환은 VRCM 연동 시 사용할 수 있습니다 " +
            "(mock 모드)", "warn");
        }
      }
      return;
    }
    var act = e.target.closest("[data-act]");
    if (act) {
      var a = act.dataset.act;
      var liveReady = NC.live && curTenant;  // 미기동 → 데모 토스트 폴백
      if (a === "ticket" && liveReady && NC.api.createTicket) {
        submitTicketLive(); return;          // VRCM 실 접수
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
      return;
    }
    var san = e.target.closest(".san-pdf");
    if (san && !san.disabled) {
      var pdf = sanState ? sanState.pdf : "SAN-0691-cert.pdf";
      NC.toast("Sanitization 증명서 " + pdf + " 다운로드를 시작합니다 (데모)");
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
