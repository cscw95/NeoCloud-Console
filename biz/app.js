/* NeoCloud Biz 콘솔 — 화면 데이터 바인딩 · 모달 액션.
   공통 런타임(../shared/app.js) + mock API(../shared/mock-api.js) 위에서 동작하며,
   ../shared/vrcm-api.js 가 NC.api 를 교체해 vrcm(:8000) 기동 시 실데이터로 전환된다
   (NC.live 플래그 · getter 단위 mock 폴백 · 반환 shape 동일 ·
    라이브 전용 getter(billingUsage/billingRates 등)는 폴백 시 null → 반드시 가드).
   핵심 시나리오:
   - delta-corp 24랙 협상(90%) · 소프트 홀드 su-9·10 D-14 → convert 모달 확정 시
     NC.api.convertDeal("delta-corp") →
       라이브: 실제 vrcm 테넌트 + 승인 모드 개통 주문 생성({order,pending} 토스트)
       폴백:   수주 전환 + 계약 CT-2026-007 추가 → 재렌더
   - "개통 중" 계약 — provision.approved({id,pending,state}) 수신 시 상태 문구 갱신
     (mock 은 gamma-labs ord-9 · 라이브는 note 의 주문 id 로 행 매칭)
   - MRR KPI — 라이브면 contracts() mrr_usd 합계, 폴백이면 NC.CONST 유지
   - 기간 토글(월간/분기/연간) — MRR 표시값 ×1/×3/×12(ARR) 전환 · localStorage 유지
   - 성과보고 내보내기 — contracts()+billingUsage() 합산 CSV 다운로드 (폴백: mock 계약)
   - 리드 등록 — 세션 로컬 배열 push → 보드·퍼널·배지 재렌더 (새로고침 시 초기화)
   - 견적(quote) — billingRates() 라이브 단가 × 랙 수 × 720h 자동 산정 (폴백 $980 정적)
   - revenue — billingUsage() 라이브 시 테넌트별 사용량·금액 표 (폴백: 정적 유지)
   - pricing — billingRates() 라이브 시 실 단가 표 (폴백: 정적 유지)
   - SAN-0691 체크리스트 — sanitization cert_ready/step_now 반영 */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) {
    return Array.prototype.slice.call((r || document).querySelectorAll(s));
  };
  var fmtM = function (v) {
    var m = v / 1e6;
    return "$" + (m >= 100 ? Math.round(m) : m.toFixed(1)) + "M";
  };
  var fmtUsd = function (v) {
    return "$" + Math.round(v || 0).toLocaleString("en-US");
  };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  };

  var provisionApproved = false;   // 운영 provision.approved 수신 여부 (mock ord-9)
  var provisionEvt = null;         // 라이브 승인 이벤트 최신 페이로드 {id,pending,state}

  /* ── 기간 토글 (월간/분기/연간) — MRR 표시 배수 전환 ─────────
       선택은 localStorage("nc-biz-period")에 저장. 라이브/mock 공통. */
  var PERIODS = {
    "월간": { mult: 1,  k: "MRR",               sfx: "" },
    "분기": { mult: 3,  k: "매출 (분기 · MRR×3)", sfx: " — 분기 환산" },
    "연간": { mult: 12, k: "ARR (MRR×12)",       sfx: " — 연간 환산(ARR)" }
  };
  var period = localStorage.getItem("nc-biz-period") || "월간";
  if (!PERIODS[period]) period = "월간";

  /* ── MRR KPI — 기본 NC.CONST.mrr_usd, 라이브면 renderContracts 가
       실계약 합계(mrrBase)로 덮어쓴다. 표시값은 기간 배수 적용. ── */
  var mrrBase = NC.CONST.mrr_usd;
  function mrrHtml(v) {
    var m = v / 1e6;
    return "$" + (m >= 100 ? Math.round(m) : m.toFixed(1)) + "<small>M</small>";
  }
  function renderMrr() {
    var p = PERIODS[period];
    $$(".js-mrr").forEach(function (el) {
      el.innerHTML = mrrHtml(mrrBase * p.mult);
    });
    $$(".js-mrr-k").forEach(function (el) { el.textContent = p.k; });
    $$(".js-mrr-label").forEach(function (el) {   // 차트 패널 제목에 기간 표기
      if (!el.dataset.base) el.dataset.base = el.textContent;
      el.textContent = el.dataset.base + p.sfx;
    });
  }
  function applyPeriod() {
    $$(".pd .p").forEach(function (x) {
      x.classList.toggle("act", x.textContent.trim() === period);
    });
    renderMrr();
  }
  function bindPeriod() {
    $$(".pd .p").forEach(function (p) {
      p.addEventListener("click", function () {
        period = p.textContent.trim();
        if (!PERIODS[period]) period = "월간";
        localStorage.setItem("nc-biz-period", period);
        applyPeriod();
      });
    });
    applyPeriod();
  }

  /* ── delta-corp 딜 동기화 (api.pipeline)
       대시보드 카드 · 스테이지 보드 · 딜 상세를 함께 갱신 ───── */
  function syncDeal() {
    return NC.api.pipeline().then(function (deals) {
      var d = deals.filter(function (p) { return p.id === "delta-corp"; })[0];
      if (!d) return;
      var won = d.state === "won";
      $$("[data-delta-stage]").forEach(function (el) {
        el.textContent = won ? "수주 · 100%" : "계약 임박 · " + d.prob + "%";
      });
      var sub = $("#delta-card-sub");
      if (sub) sub.textContent = won
        ? "24랙 3y · 수주 — 개통 요청 발행"
        : "24랙 3y · 법무 검토";
      var hold = $("#delta-hold");
      if (hold) hold.innerHTML = won
        ? '안산 su-9·10 — <span class="st green">소프트 홀드 → 확정 배치 전환</span> (운영 콘솔 연동)'
        : '안산 su-9·10 가배치 — <span class="st amber">용량 소프트 홀드 D-' +
          d.hold.expires_d + "</span> (운영 콘솔 연동)";
      var next = $("#delta-next");
      if (next) next.innerHTML = won
        ? '수주 확정 — 계약 CT-2026-007 등록 · 개통 요청(ord) 발행 → <b class="soft">운영 승인 게이트</b> 대기'
        : "법무 검토 완료 (D-5 예상) → 서명 → 비즈 개통 요청 → 운영 승인 게이트";
      var btn = $("#btn-convert");
      if (btn) {
        btn.disabled = won;
        btn.textContent = won ? "전환 완료" : "계약 전환";
        if (won) btn.removeAttribute("data-open");
      }
    });
  }

  /* ── 로컬 리드 (세션 로컬 — 새로고침 시 초기화, CRM 미연동) ── */
  var localLeads = [];
  var LEAD_BASE = { count: 3, weightedM: 46, badge: 2 };  // 정적 시나리오 기준값
  function renderLeads() {
    var extra = $("#lane-lead-extra");
    if (extra) extra.innerHTML = localLeads.map(function (d) {
      return '<div class="lc"><b>' + esc(d.name) + '</b><div class="s">' +
        d.racks + "랙 · 확률 " + d.prob +
        '% · <span class="mut2">세션 로컬</span></div></div>';
    }).join("");
    var n = localLeads.length;
    var addM = localLeads.reduce(function (s, d) {   // 가중 ARR 추정 (on-demand 단가)
      return s + d.racks * 980 * 720 * 12 * (d.prob / 100);
    }, 0) / 1e6;
    var ln = $("#lane-lead-n");                      // 스테이지 보드 리드 레인 헤더
    if (ln) ln.textContent = (LEAD_BASE.count + n) + " · $" +
      Math.round(LEAD_BASE.weightedM + addM) + "M";
    $$(".js-lead-n").forEach(function (el) {         // 대시보드 퍼널 카운트
      el.textContent = LEAD_BASE.count + n;
    });
    var bd = $("#bd-pipeline");                      // 사이드바 배지
    if (bd) bd.textContent = LEAD_BASE.badge + n;
  }

  /* ── 계약 목록 (api.contracts) — 계약 화면 6열 · 대시보드 5열 ── */
  var CT_TERM = {                       // mock에 없는 표시용 만기 메타
    "CT-2024-011": "~2029-06",
    "CT-2025-004": "~2026-10",
    "CT-2025-009": "월 단위 자동 갱신",
    "CT-2026-003": "서명 완료",
    "CT-2026-007": "서명 완료"
  };
  function ctTCV(c) {
    if (c.renewal_d) return fmtM(c.mrr_usd * c.renewal_d / 30.44);
    var m = /(\d+)개월/.exec(c.kind || "");
    return m ? fmtM(c.mrr_usd * Number(m[1])) : "—";
  }
  function ctTerm(c) {
    if (c.renewal_d != null) return '<span class="st amber">' +
      (CT_TERM[c.id] || "") + " · D-" + c.renewal_d + "</span>";
    if (NC.live)                        // 라이브: renewal_d null — note(개통 중 등) 표시
      return '<span class="mut">' + (c.note || "—") + "</span>";
    return '<span class="mut">' + (CT_TERM[c.id] || "—") + "</span>";
  }
  function ctState(c) {
    if (c.state === "active") return '<span class="st green">활성</span>';
    if (c.state === "renewal") return '<span class="st amber">갱신 협의</span>';
    if (c.state === "provisioning") {
      var label, tone = "blue";
      if (provisionEvt && c.note &&
          c.note.indexOf(provisionEvt.id) !== -1) {   // 라이브 승인 이벤트 반영 행
        if (provisionEvt.state === "delivered") {
          label = "개통 완료"; tone = "green";
        } else {
          label = provisionEvt.id + " 승인 진행 — 다음: " +
            (provisionEvt.pending || "—");
        }
      } else if (!NC.live && c.tenant === "gamma-labs") {
        label = provisionApproved ? "개통 중 — 승인 완료 · 배포" : "개통 중 (ord-9)";
      } else {
        label = "개통 중";
      }
      return '<span class="st ' + tone + '">' + label + "</span>";
    }
    return '<span class="st gray">' + (c.state || "—") + "</span>";
  }
  function renderContracts() {
    return NC.api.contracts().then(function (list) {
      var six = "", five = "", sum = 0;
      list.forEach(function (c) {
        sum += c.mrr_usd || 0;
        var name = "<td><b>" + c.tenant +
          '</b> <span class="mut2" style="font-size:10px">' + (c.kind || "") + "</span></td>";
        var base = '<td class="num">' + (c.racks || 0) + '랙</td>' +
          '<td class="num id">' + fmtM(c.mrr_usd || 0) + "</td>";
        var tail = "<td>" + ctTerm(c) + "</td><td>" + ctState(c) + "</td>";
        six += "<tr>" + name + base +
          '<td class="num id">' + ctTCV(c) + "</td>" + tail + "</tr>";
        five += "<tr>" + name + base + tail + "</tr>";
      });
      var b1 = $("#ct-body"); if (b1) b1.innerHTML = six;
      var b2 = $("#ct-body-dash"); if (b2) b2.innerHTML = five;
      if (NC.live) mrrBase = sum;       // 라이브: 실계약 합계 MRR (기간 배수는 renderMrr)
      renderMrr();
      var acme = list.filter(function (c) { return c.tenant === "acme-ai"; })[0];
      if (acme && acme.renewal_d != null)   // 라이브에 acme-ai 없거나 D값 없으면
        $$(".js-acme-d").forEach(function (el) {          // mock 문구(D-83) 정적 유지
          el.textContent = "D-" + acme.renewal_d;
        });
    });
  }

  /* ── 성과보고 내보내기 — 계약·매출 리포트 CSV ───────────────
       contracts()(라이브/mock 공통) + billingUsage()(라이브 전용, 폴백 null) 합산.
       usage 는 tenant_id(예: tnt-delta-corp) 기준 집계 후 계약 tenant 명으로 매칭. */
  function csvEsc(v) {
    v = v == null ? "" : String(v);
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function downloadCsv(name, rows) {
    var csv = "\uFEFF" + rows.map(function (r) {   // BOM — 엑셀 한글 인코딩
      return r.map(csvEsc).join(",");
    }).join("\r\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function buildReportRows(contracts, usage) {
    var rows = [["고객", "계약", "유형", "랙", "MRR_USD", "상태",
                 "사용량_rack_h", "누적청구_USD"]];
    var um = {};                                   // tenant_id → 사용량 집계
    ((usage && usage.lines) || []).forEach(function (l) {
      var k = l.tenant_id || "unknown";
      var u = (um[k] = um[k] || { rh: 0, amt: 0, used: false });
      u.rh += l.rack_hours || 0;
      u.amt += l.amount_usd || 0;
    });
    function usageOf(t) {                          // "tnt-<이름>" 관용 매칭
      if (um[t]) return um[t];
      var k = Object.keys(um).filter(function (id) {
        return id === "tnt-" + t || id.indexOf(t) !== -1;
      })[0];
      return k ? um[k] : null;
    }
    (contracts || []).forEach(function (c) {
      var u = usageOf(c.tenant);
      if (u) u.used = true;
      rows.push([c.tenant, c.id, c.kind || "", c.racks || 0, c.mrr_usd || 0,
        c.state || "", u ? u.rh.toFixed(2) : "", u ? Math.round(u.amt) : ""]);
    });
    Object.keys(um).forEach(function (id) {        // 계약 미매핑 사용량도 포함
      if (um[id].used) return;
      rows.push([id, "", "", "", "", "usage-only",
        um[id].rh.toFixed(2), Math.round(um[id].amt)]);
    });
    return rows;
  }
  function exportReport() {
    var usageP = NC.api.billingUsage
      ? NC.api.billingUsage().catch(function () { return null; })
      : Promise.resolve(null);
    return Promise.all([NC.api.contracts(), usageP]).then(function (res) {
      var rows = buildReportRows(res[0], res[1]);
      var d = new Date();
      var pad = function (n) { return String(n).padStart(2, "0"); };
      downloadCsv("neocloud-biz-report-" + d.getFullYear() +
        pad(d.getMonth() + 1) + pad(d.getDate()) + "-" +
        pad(d.getHours()) + pad(d.getMinutes()) + ".csv", rows);
      NC.toast("계약·매출 리포트 CSV 다운로드 — 계약 " + ((res[0] || []).length) +
        "건 · " + (res[1] ? "billing/usage 라이브 합산" : "mock 데이터 (사용량 없음)"));
      return rows;
    }).catch(function (e) {
      NC.toast("리포트 생성 실패 — " + ((e && e.message) || "다시 시도"), "warn");
    });
  }

  /* ── 견적(quote) — billingRates() 라이브 단가 자동 산정 ─────── */
  var QUOTE_STATIC_RATE = 980;        // 폴백: 가격표 v2.4 on-demand
  var quoteRate = null;               // 라이브 단가 (usd/rack-hour)
  function pickRate(r) {              // {rates:{"vr-nvl72":980}} | [{usd_per_rack_hour}]
    if (!r || !r.rates) return null;
    if (Array.isArray(r.rates)) {
      var x = r.rates[0] || {};
      return x.usd_per_rack_hour || x.rate || null;
    }
    var v = r.rates["vr-nvl72"];
    if (v == null) {
      var ks = Object.keys(r.rates);
      v = ks.length ? r.rates[ks[0]] : null;
    }
    return typeof v === "number" ? v : (v && v.usd_per_rack_hour) || null;
  }
  function quoteRacks() {
    var el = $("#q-racks");
    return Math.max(1, parseInt(el && el.value, 10) || 24);
  }
  function renderQuote() {
    var racks = quoteRacks();
    var rate = quoteRate || QUOTE_STATIC_RATE;
    var mo = racks * rate * 720;
    var calc = $("#q-calc");
    if (calc) calc.innerHTML = "월 " + fmtM(mo) + " · 연 " + fmtM(mo * 12) +
      ' <span class="mut2" style="font-size:10px">(' + racks + "랙 × $" + rate +
      "/rack-h × 720h)</span>";
    var lbl = $("#q-rate");
    if (lbl) lbl.textContent = quoteRate
      ? "단가 $" + quoteRate + "/rack-h — Control-Plane billing/rates 라이브"
      : "단가 $" + QUOTE_STATIC_RATE + "/rack-h — 가격표 v2.4 (정적)";
  }
  function bindQuote() {
    NC.bus.on("modal.open", function (id) {
      if (id !== "quote") return;
      renderQuote();                               // 즉시 정적 단가로 표시
      var p = NC.api.billingRates
        ? NC.api.billingRates().catch(function () { return null; })
        : Promise.resolve(null);
      p.then(function (r) {                        // 라이브면 실 단가로 갱신
        var v = pickRate(r);
        if (v) quoteRate = v;
        renderQuote();
      });
    });
    document.addEventListener("input", function (e) {
      if (e.target && e.target.id === "q-racks") renderQuote();
    });
  }

  /* ── 대시보드 — MRR KPI + 딜/계약 위젯 ───────────────────── */
  function renderDashboard() {
    renderMrr();
    syncDeal();
    renderContracts();
    renderLeads();
  }
  function renderPipeline() {
    syncDeal();
    renderLeads();
  }

  /* ── 매출·수익 분석 — billingUsage() 라이브 시 실사용 표 ───── */
  function renderRevenue() {
    renderMrr();
    var p = NC.api.billingUsage
      ? NC.api.billingUsage().catch(function () { return null; })
      : Promise.resolve(null);
    return p.then(function (u) {
      var panel = $("#rev-live");
      if (!panel) return;
      if (!u || !u.lines || !u.lines.length) {     // 폴백: 정적 화면 유지
        panel.style.display = "none";
        return;
      }
      var body = $("#rev-body");
      if (body) body.innerHTML = u.lines.map(function (l) {
        return '<tr><td class="id">' + esc(l.order_id || "—") + "</td><td><b>" +
          esc(l.tenant_id || "—") + "</b>" +
          (l.active === false ? ' <span class="st gray">종료</span>' : "") +
          '</td><td class="mut">' + esc(l.blueprint_key || "—") +
          '</td><td class="num">' + (l.racks || 0) + "랙" +
          '</td><td class="num">' + (l.rack_hours || 0).toFixed(1) +
          '</td><td class="num">$' + (l.rate_usd || 0) +
          '</td><td class="num id">' + fmtUsd(l.amount_usd) +
          '</td><td class="num id">' + fmtM(l.projected_monthly_usd || 0) +
          "</td></tr>";
      }).join("");
      var t = u.totals || {};
      var tot = $("#rev-total");
      if (tot) tot.innerHTML = '합계 — 사용량 <b class="soft">' +
        (t.rack_hours || 0).toFixed(1) + ' rack-h</b> · 누적 청구 <b class="soft">' +
        fmtUsd(t.amount_usd) + '</b> · 월 예상 <b class="soft">' +
        fmtM(t.projected_monthly_usd || 0) + "</b>";
      var note = $("#rev-note");
      if (note) note.textContent = "GET /api/v1/billing/usage · 기준 " +
        String(u.generated_at || "").slice(0, 16).replace("T", " ");
      panel.style.display = "";
    });
  }

  /* ── 가격 정책 — billingRates() 라이브 시 실 단가 표 ────────── */
  function renderPricing() {
    var p = NC.api.billingRates
      ? NC.api.billingRates().catch(function () { return null; })
      : Promise.resolve(null);
    return p.then(function (r) {
      if (!r || !r.rates) return;                  // 폴백: 정적 가격표 유지
      var body = $("#price-body");
      if (!body) return;
      var rows = "";
      var unit = r.unit || "rack-hour";
      if (Array.isArray(r.rates)) {
        r.rates.forEach(function (x, i) {
          rows += "<tr><td><b>" + esc(x.sku || x.blueprint_key || "rate-" + i) +
            '</b></td><td class="num id">$' + (x.usd_per_rack_hour || x.rate || 0) +
            ' /rack-h</td><td class="num mut">' + (i === 0 ? "기준가" : "—") +
            "</td></tr>";
        });
      } else {
        Object.keys(r.rates).forEach(function (k) {
          var main = k === "vr-nvl72";
          rows += "<tr><td><b>" + esc(k) + "</b>" +
            (main ? ' <span class="st green">주력</span>' : "") +
            '</td><td class="num id">$' + r.rates[k] + " /" + esc(unit) +
            '</td><td class="num mut">' + (main ? "On-demand 기준가" : "—") +
            "</td></tr>";
        });
      }
      if (r.note) rows += '<tr><td colspan="3" class="mut" style="font-size:10.5px">' +
        esc(r.note) + "</td></tr>";
      body.innerHTML = rows;
      var cap = $("#price-cap");
      if (cap) cap.textContent = "Control-Plane billing/rates 라이브 · " +
        (r.currency || "USD") + " / " + unit;
    });
  }

  /* ── 수요·공급 계획 (api.expansion) — su-12·13 · 발주 D-90 · 리드타임 12주 ── */
  function renderPlanning() {
    return NC.api.expansion().then(function (x) {
      var su = x.sus.join("·").replace(/·su-/g, "·");   // su-12·13
      var t = $("#exp-title");
      if (t) t.textContent = su + " (" + x.racks + "랙 · VR)";
      var o = $("#exp-order");
      if (o) o.textContent = "D-" + x.order_d;
      var c = $("#exp-callout");
      if (c) c.innerHTML = "Q1 '27 수요가 공급의 <b class=\"amber\">86%</b> — " +
        '파트너 리드타임 <b class="soft">' + x.leadtime_w + "주</b> 기준 " +
        '<b class="soft">10월 초 ' + su + " 발주 확정</b> 필요 · 공급 파트너 " + x.partner;
    });
  }

  /* ── 컴플라이언스 (api.sanitization) — SAN-0691 · cert_ready 반영 ── */
  function renderCompliance() {
    return NC.api.sanitization().then(function (s) {
      var icon = $("#san-icon"), line = $("#san-line");
      if (icon) {
        icon.textContent = s.cert_ready ? "✓" : "…";
        icon.className = "st " + (s.cert_ready ? "green" : "amber");
      }
      if (line) line.innerHTML = "Sanitization 증명 (" + s.id + ") — 7단계 소거 " +
        s.step_now + "/" + s.steps.length +
        (s.cert_ready
          ? ' · <b class="soft">증명서 발급 완료 (' + s.pdf + ")</b>"
          : " · 증명서 대기 (운영 콘솔 진행)");
    });
  }

  /* ── 모달 확정 액션 ──────────────────────────────────────── */
  function onConfirm(btnId, modalId, msg, kind) {
    var btn = $("#" + btnId);
    if (btn) btn.addEventListener("click", function () {
      NC.closeModal(modalId);
      NC.toast(msg, kind);
    });
  }
  function bindActions() {
    var cv = $("#cf-convert");        // 계약 전환 — 라이브: 실 테넌트+승인 주문 생성
    if (cv) cv.addEventListener("click", function () {
      if (cv.disabled) return;                     // 중복 클릭 방지
      cv.disabled = true;                          // 전환 완료 후에도 disabled 유지
      NC.api.convertDeal("delta-corp").then(function (res) {
        NC.closeModal("convert");
        if (res && res.order)                      // 라이브: {ok,order,tenant,state,pending}
          NC.toast("delta-corp 전환 — " + res.order + " 생성 · 운영 승인 대기(" +
            (res.pending || "—") + ")");
        else                                       // mock 폴백: 기존 시나리오 문구
          NC.toast("delta-corp 수주 전환 — 계약 CT-2026-007 등록 · 개통 요청(ord) 발행 → 운영 승인 게이트");
        syncDeal();
        renderContracts();                         // 라이브면 실 테넌트 delta-corp 행 등장
      }).catch(function (e) {
        cv.disabled = false;                       // 실패 시에만 재시도 허용
        NC.toast("계약 전환 실패 — " + ((e && e.message) || "다시 시도해 주세요"), "warn");
      });
    });

    var ld = $("#cf-lead");           // 리드 등록 — 세션 로컬 파이프라인 push
    if (ld) ld.addEventListener("click", function () {
      var nameEl = $("#lead-name");
      var name = (nameEl && nameEl.value.trim()) ||
        "new-lead-" + (localLeads.length + 1);
      var racks = parseInt(($("#lead-racks") || {}).value, 10) || 8;
      var prob = parseInt(($("#lead-prob") || {}).value, 10) || 20;
      localLeads.push({ name: name, racks: racks, prob: prob });
      renderLeads();
      NC.closeModal("lead");
      if (nameEl) nameEl.value = "";
      NC.toast("리드 등록 — " + esc(name) + " · " + racks + "랙 · 확률 " + prob +
        '% <span class="mut">(세션 로컬 저장 — 새로고침 시 초기화 · CRM 미연동)</span>');
    });

    var qt = $("#cf-quote");          // 견적서 생성 — 산정 결과를 토스트로 확정
    if (qt) qt.addEventListener("click", function () {
      var racks = quoteRacks();
      var rate = quoteRate || QUOTE_STATIC_RATE;
      var mo = racks * rate * 720;
      NC.closeModal("quote");
      NC.toast("견적서 생성 — delta-corp v3 · " + racks + "랙 · 월 " + fmtM(mo) +
        " · 연 " + fmtM(mo * 12) + " (단가 $" + rate + "/rack-h " +
        (quoteRate ? "Control-Plane 라이브" : "정적 v2.4") + " · 유효 30일)");
    });

    onConfirm("cf-discount", "discount",
      "theta-ai 할인 8% 승인 — 견적 자동 재발행 · CRM 딜 단계 갱신 (PoC 미연동 데모)");
    onConfirm("cf-reject", "reject",
      "할인 요청 반려 — 사유가 담당자(이민준)에게 전달되었습니다 (PoC 미연동 데모)", "warn");
    onConfirm("cf-contract", "contract",
      "계약이 등록되었습니다 — 잔여 TCV·MRR 대시보드 자동 반영 (PoC 미연동 데모)");

    var rp = $("#cf-report");         // 성과보고 — 실 CSV 다운로드 (톱바 버튼과 동일 함수)
    if (rp) rp.addEventListener("click", function () {
      NC.closeModal("report");
      exportReport();
    });
  }

  /* ── 이벤트 버스 — 크로스 포털 시나리오 수신 ─────────────── */
  function bindBus() {
    NC.bus.on("provision.approved", function (data) {  // 운영: 개통 주문 승인
      provisionApproved = true;
      if (NC.live && data && data.id) {            // 라이브 페이로드 {id,pending,state}
        provisionEvt = data;
        NC.toast(data.state === "delivered"
          ? data.id + " 개통 완료 — 베어메탈 인도"
          : data.id + " 승인 진행 — 다음: " + (data.pending || "—"));
      } else {                                     // mock: ord-9 시나리오 유지
        NC.toast("gamma-labs ord-9 승인 완료 — 베어메탈 배포 시작 (운영 콘솔 연동)");
      }
      renderContracts();
    });
    NC.bus.on("sanitization.step", function () {   // 운영: SAN-0691 단계 진행
      renderCompliance();
    });
  }

  /* ── 헤드리스 검증용 내부 훅 (UI 미사용) ─────────────────── */
  NC._biz = {
    buildReportRows: buildReportRows,
    exportReport: exportReport,
    pickRate: pickRate,
    getPeriod: function () { return period; },
    getLeads: function () { return localLeads.slice(); }
  };

  /* ── 부트스트랩 ─────────────────────────────────────────── */
  bindActions();
  bindBus();
  bindPeriod();
  bindQuote();
  renderLeads();
  NC.start({
    dashboard: renderDashboard,
    pipeline: renderPipeline,
    contracts: renderContracts,
    revenue: renderRevenue,
    pricing: renderPricing,
    planning: renderPlanning,
    compliance: renderCompliance
  });
})();
