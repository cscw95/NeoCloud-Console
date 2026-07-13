/* NeoCloud Biz 콘솔 — 화면 데이터 바인딩 · 모달 액션.
   공통 런타임(../shared/app.js) + mock API(../shared/mock-api.js) 위에서 동작하며,
   ../shared/nocp-api.js 가 NC.api 를 교체해 nocp(:8000) 기동 시 실데이터로 전환된다
   (NC.live 플래그 · getter 단위 mock 폴백 · 반환 shape 동일 ·
    라이브 전용 getter(billingUsage/billingRates 등)는 폴백 시 null → 반드시 가드).
   핵심 시나리오:
   - delta-corp 24랙 협상(90%) · 소프트 홀드 su-9·10 D-14 → convert 모달 확정 시
     NC.api.convertDeal("delta-corp") →
       라이브: 실제 nocp 테넌트 + 승인 모드 개통 주문 생성({order,pending} 토스트)
       폴백:   수주 전환 + 계약 CT-2026-007 추가 → 재렌더
   - "개통 중" 계약 — provision.approved({id,pending,state}) 수신 시 상태 문구 갱신
     (mock 은 gamma-labs ord-9 · 라이브는 note 의 주문 id 로 행 매칭)
   - MRR KPI — 라이브면 contracts() mrr_usd 합계, 폴백이면 NC.CONST 유지
   - 기간 토글(월간/분기/연간) — 대시보드 전면 연동: 매출 KPI·파이프라인 KPI·
     금액 셀(.js-scale)·컬럼 헤더(.js-mrr-col)·보조 문구(.js-psub)·하단 요약을
     ×1/×3/×12 환산 전환 · billingUsage 라이브 월 예상 반영 · localStorage 유지
   - 성과보고 내보내기 — contracts()+billingUsage() 합산 CSV 다운로드 (폴백: mock 계약)
   - 파이프라인 딜 보드 — 5스테이지(리드→상담→제안/견적→협상→계약 전환) 동적 렌더,
     카드 클릭 → 딜 상세 모달(스테이지 스텝퍼 이동 · 세부 단계 3종 체크 토글 ·
     메모 · 견적/전환 연계 · 실주). 상태는 세션 로컬 · delta-corp 만 라이브 convert
   - 리드 등록 — DEALS 배열 push → 보드·퍼널·배지 재렌더 (새로고침 시 초기화)
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

  /* ── 기간 토글 (월간/분기/연간) — 대시보드 전면 연동 ─────────
       선택은 localStorage("nc-biz-period")에 저장. 라이브/mock 공통.
       바인딩 클래스: .js-mrr(매출 KPI) · .js-scale[data-usd=월기준USD](금액 셀/KPI)
       · .js-mrr-col(금액 컬럼 헤더) · .js-psub[data-m/q/y](기간별 보조 문구)
       · .js-mrr-k / .js-mrr-label(라벨) · #dash-sum(하단 요약 · 라이브 usage 반영) */
  var PERIODS = {
    "월간": { mult: 1,  k: "월 매출 (MRR)",       sfx: "",
              key: "m", col: "MRR" },
    "분기": { mult: 3,  k: "분기 매출 (MRR×3)",   sfx: " — 분기 환산",
              key: "q", col: "분기액" },
    "연간": { mult: 12, k: "연 매출 (ARR)",       sfx: " — 연간 환산(ARR)",
              key: "y", col: "연액(ARR)" }
  };
  var period = localStorage.getItem("nc-biz-period") || "월간";
  if (!PERIODS[period]) period = "월간";
  var usageMonthly = null;   // billingUsage 라이브 totals.projected_monthly_usd

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
    $$(".js-scale").forEach(function (el) {       // 월 기준 금액 × 기간 배수
      var v = (parseFloat(el.dataset.usd) || 0) * p.mult;
      if (el.dataset.fmt === "kpi") el.innerHTML = mrrHtml(v);
      else el.textContent = fmtM(v);
    });
    $$(".js-mrr-col").forEach(function (el) { el.textContent = p.col; });
    $$(".js-psub").forEach(function (el) {        // 기간별 보조 문구 (data-m/q/y)
      var v = el.dataset[p.key];
      if (v) el.textContent = v;
    });
    var ds = $("#dash-sum");                      // 대시보드 하단 요약 문구
    if (ds) ds.innerHTML = '표시 기준: <b class="soft">' + period +
      "</b> — 금액 컬럼은 " + p.col + " 환산" +
      (usageMonthly != null
        ? ' · 실사용 과금 ' + p.col + ' 예상 <b class="soft">' +
          fmtM(usageMonthly * p.mult) + "</b> (Control-Plane 빌링 라이브)"
        : " · 실사용 과금 — Control-Plane 미연동 (mock)");
  }
  function applyPeriod() {
    $$(".topbar .pd .p").forEach(function (x) {
      x.classList.toggle("act", x.textContent.trim() === period);
    });
    renderMrr();
  }
  function bindPeriod() {
    $$(".topbar .pd .p").forEach(function (p) {
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
      var bdDeal = byId(DEALS, "delta-corp");      // 보드 딜 상태 동기 (세션 로컬)
      if (bdDeal) {
        var changed = false;
        if (won && bdDeal.state !== "won") {
          bdDeal.state = "won"; bdDeal.prob = 100;
          bdDeal.stage = 4; bdDeal.done = mkDone(STAGES.length, 0);
          changed = true;
        } else if (!won && bdDeal.prob !== d.prob) {
          bdDeal.prob = d.prob; changed = true;
        }
        if (changed) { renderBoard(); renderLeads(); }
      }
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

  /* ── 파이프라인 딜 보드 — 스테이지 · 세부 단계 (세션 로컬, CRM 미연동)
       카드 클릭 → 딜 상세 모달(스테이지 스텝퍼 · 세부 단계 체크 · 메모 · 실주).
       delta-corp 는 라이브 딜(convert 모달 연계) — 나머지는 세션 로컬 상태.
       스테이지 이동·체크 상태는 새로고침 시 초기화. ───────────── */
  var STAGES = ["리드", "상담", "제안/견적", "협상", "계약 전환"];
  var SUBSTEPS = [
    ["인바운드 접수 확인", "BANT 자격 검증", "담당 배정"],
    ["니즈 파악 콜", "기술 미팅", "현장 방문"],
    ["견적 산정", "제안서 발송", "PoC 진행"],
    ["가격 협상", "법무 검토", "이사회 승인"],
    ["서명본 수령", "용량 홀드 확인", "개통 요청 발행"]
  ];
  function mkDone(stage, cur) {        // stage 이전 단계 전부 완료 · 현 단계 cur개 완료
    return SUBSTEPS.map(function (ss, i) {
      return ss.map(function (_, j) {
        return i < stage || (i === stage && j < cur);
      });
    });
  }
  function mkDeal(id, name, racks, prob, arr, owner, term, stage, cur, sub) {
    return { id: id, name: name, racks: racks, prob: prob, arr: arr,
      owner: owner, term: term, stage: stage, done: mkDone(stage, cur),
      memo: "", sub: sub || "", state: "open", added: false };
  }
  var DEALS = [
    mkDeal("epsilon-lab", "epsilon-lab", 4, 20, 9e6, "이민준", "on-demand", 0, 1, "추론 · 인바운드"),
    mkDeal("zeta-fund", "zeta-fund", 16, 20, 16.8e6, "박서연", "reserved 1y", 0, 0, "학습 클러스터 검토"),
    mkDeal("omega-motors", "omega-motors", 8, 30, 21e6, "이민준", "reserved 1y", 1, 1, "자율주행 학습"),
    mkDeal("rfq-031", "RFQ-031 공공 AI 센터", 32, 40, 81.3e6, "박서연", "reserved 3y", 2, 1, "CSAP 필수 · 응답 D-3"),
    mkDeal("kappa-search", "kappa-search", 8, 40, 19.7e6, "이민준", "reserved 1y", 2, 2, "견적 발송됨"),
    mkDeal("theta-ai", "theta-ai", 8, 60, 6.8e6, "이민준", "reserved 1y", 3, 1, "할인 8% 승인 대기"),
    mkDeal("delta-corp", "delta-corp", 24, 90, 61e6, "박서연", "reserved 3y", 4, 2, "법무 검토")
  ];
  var curDealId = null;    // 딜 상세 모달이 보고 있는 딜
  var addedLeads = 0;      // 세션 중 등록된 신규 리드 수 (배지 가산)

  function dealPct(d) {                // 전체 진행률 — 15개 세부 단계 기준
    var t = 0, c = 0;
    SUBSTEPS.forEach(function (ss, i) {
      ss.forEach(function (_, j) { t += 1; if (d.done[i][j]) c += 1; });
    });
    return Math.round(c / t * 100);
  }
  function nextAction(d) {             // 카드·모달 공용 "다음 액션"
    if (d.state === "won") return "수주 완료 — 개통 진행";
    var ss = SUBSTEPS[d.stage];
    for (var j = 0; j < ss.length; j++)
      if (!d.done[d.stage][j]) return ss[j];
    return d.stage < STAGES.length - 1
      ? "스테이지 이동 — " + STAGES[d.stage + 1]
      : "계약 전환 확정";
  }

  var LANE_TONE = ["", "", "blue", "amber", "green"];
  function renderBoard() {
    var box = $("#lanes-box");
    if (!box) return;
    box.innerHTML = STAGES.map(function (s, i) {
      var ds = DEALS.filter(function (d) { return d.stage === i; });
      var w = ds.reduce(function (sum, d) {
        return sum + d.arr * d.prob / 100;
      }, 0) / 1e6;
      var cards = ds.map(function (d) {
        var pct = dealPct(d);
        return '<div class="lc ' + LANE_TONE[i] + '" data-deal="' + esc(d.id) +
          '" style="cursor:pointer" title="클릭 — 딜 상세 · 세부 단계">' +
          "<b>" + esc(d.name) + "</b>" +
          (d.state === "won" ? ' <span class="st green">수주</span>' : "") +
          '<div class="s"' + (d.id === "delta-corp" ? ' id="delta-card-sub"' : "") +
          ">" + d.racks + "랙 · 확률 " + d.prob + "% · " + esc(nextAction(d)) +
          "</div>" +
          '<div class="pbar"><i style="width:' + pct + '%"></i></div>' +
          '<div class="mut2" style="font-size:10px;margin-top:3px">진행 ' + pct +
          "% · " + esc(d.owner) + "</div></div>";
      }).join("") || '<div class="mut2" style="font-size:11px">딜 없음</div>';
      var tone = i === 4 ? ' style="color:var(--green-text)"'
        : i === 3 ? ' class="amber"'
        : i === 2 ? ' style="color:var(--blue-text)"' : ' class="mut"';
      return '<div class="lane"><div class="lh"><span' + tone + ">" + esc(s) +
        '</span><span class="n">' + ds.length + " · $" + Math.round(w) +
        "M</span></div>" + cards + "</div>";
    }).join("");
  }
  function renderLeads() {             // 퍼널 카운트 · 사이드바 배지 (DEALS 기준)
    var cnt = function (f) { return DEALS.filter(f).length; };
    var set = function (cls, v) {
      $$(cls).forEach(function (el) { el.textContent = v; });
    };
    set(".js-lead-n", cnt(function (d) { return d.stage <= 1; }));
    set(".js-fun-q", cnt(function (d) { return d.stage === 2; }));
    set(".js-fun-n", cnt(function (d) { return d.stage === 3; }));
    set(".js-fun-c", cnt(function (d) { return d.stage === 4; }));
    var bd = $("#bd-pipeline");        // 액션 필요 2건(theta 승인·delta 전환) + 신규 리드
    if (bd) bd.textContent = 2 + addedLeads;
  }

  /* ── 로컬 딜 실전환 — NC.api.convertDeal 은 mock.pipeline 에서만 딜을
       찾아 신규 리드는 racks 폴백(24)이 되므로, 보드 딜은 racks 를 명시해
       Control-Plane 에 직접 테넌트 + 랙 주문(approval_mode)을 생성한다.
       (delta-corp 만 기존 convert 모달 → NC.api.convertDeal 경로 유지) ── */
  var CP_BASE = localStorage.getItem("nc-nocp") || "http://127.0.0.1:8000";
  function cpPost(path, body) {
    return fetch(CP_BASE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) {
        throw new Error(t || ("HTTP " + r.status));
      });
      return r.json();
    });
  }
  function markWon(d) {
    d.state = "won"; d.prob = 100;
    d.done = mkDone(STAGES.length, 0);
  }
  function convertLocalDeal(d) {
    if (NC.live) {                     // 라이브: 실제 테넌트 + racks 명시 주문
      return cpPost("/api/v1/tenants",
        { name: d.name, isolation_tier: "bare_metal_dedicated" })
        .then(function (t) {
          return cpPost("/api/v1/orders", { tenant_id: t.id, kind: "new",
            blueprint_key: "vr-nvl72", racks: d.racks, approval_mode: true })
            .then(function (o) { return { tenant: t, order: o }; });
        })
        .then(function (res) {
          markWon(d);
          NC.bus.emit("deal.converted",
            { id: d.id, order: res.order.id, tenant: res.tenant.id });
          renderBoard(); renderLeads(); renderDealModal();
          NC.toast(d.name + " 계약 전환 — 테넌트 " + res.tenant.id + " · 주문 " +
            res.order.id + " (" + d.racks + "랙) 생성 · " +
            '<b class="soft">운영 콘솔 승인 후 개통</b> (대기: ' +
            (res.order.pending_stage || "validated") + ")");
          return res;
        });
    }
    markWon(d);                        // 폴백: 세션 로컬 수주 (계약 미생성)
    NC.bus.emit("deal.converted", { id: d.id });
    renderBoard(); renderLeads(); renderDealModal();
    NC.toast(d.name + " 수주 전환 — 세션 로컬 처리 (Control-Plane 미기동 · " +
      "계약 미생성 · 재기동 후 운영 승인 게이트로 개통)", "warn");
    return Promise.resolve(null);
  }

  function openDeal(id) {
    var d = byId(DEALS, id);
    if (!d) return;
    curDealId = id;
    renderDealModal();
    NC.openModal("deal");
  }
  function renderDealModal() {
    var d = byId(DEALS, curDealId);
    if (!d) return;
    var t = $("#deal-title");
    if (t) t.textContent = "딜 상세 — " + d.name + " (" + d.racks + "랙)" +
      (d.state === "won" ? " · 수주" : "");
    var body = $("#deal-body");
    if (!body) return;
    var steps = STAGES.map(function (s, i) {
      return '<div class="step ' +
        (i === d.stage ? "on" : i < d.stage ? "done" : "") +
        '" data-dstage="' + i + '" title="클릭 — 스테이지 이동">' +
        (i < d.stage ? "✓ " : "") + esc(s) + "</div>";
    }).join("");
    var ss = SUBSTEPS[d.stage];
    var doneN = d.done[d.stage].filter(Boolean).length;
    var subs = ss.map(function (s, j) {
      var on = d.done[d.stage][j];
      return '<div class="ck" data-dsub="' + j +
        '" style="cursor:pointer" title="클릭 — 완료 토글">' +
        '<span class="st ' + (on ? "green" : "gray") + '">' +
        (on ? "✓" : "…") + "</span>" +
        '<span class="' + (on ? "mut" : "soft") + '">' + esc(s) +
        "</span></div>";
    }).join("");
    var pct = dealPct(d);
    body.innerHTML =
      '<div class="stepper">' + steps + "</div>" +
      '<div class="mut" style="font-size:11px;margin-bottom:6px">세부 단계 — ' +
        esc(STAGES[d.stage]) + " (" + doneN + "/" + ss.length +
        " 완료 · 항목 클릭으로 토글)</div>" +
      '<div class="ckl" style="margin-bottom:4px">' + subs + "</div>" +
      '<div class="pbar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="mut2" style="font-size:10.5px;margin:4px 0 12px">전체 진행률 ' +
        pct + "% — 5스테이지 × 3세부 단계 기준</div>" +
      '<table class="kv2"><tbody>' +
      "<tr><td>고객 / 조건</td><td><b>" + esc(d.name) + "</b> — " + d.racks +
        "랙 · " + esc(d.term) + (d.sub ? ' · <span class="mut">' + esc(d.sub) +
        "</span>" : "") + "</td></tr>" +
      '<tr><td>예상 ARR</td><td class="id">' + fmtM(d.arr) + " · 성사 확률 " +
        d.prob + "%</td></tr>" +
      "<tr><td>담당</td><td>" + esc(d.owner) + "</td></tr>" +
      '<tr><td>다음 액션</td><td class="soft">' + esc(nextAction(d)) +
        "</td></tr></tbody></table>" +
      (d.stage === STAGES.length - 1 && d.state !== "won"
        ? '<div class="callout" style="margin-top:10px">계약 전환 확정 시 ' +
          "Control-Plane 에 <b class=\"soft\">테넌트 + " + d.racks +
          '랙 주문(approval_mode)</b>이 생성되며, <b class="soft">운영 콘솔 승인 후 ' +
          "개통</b>됩니다 (승인 전 상태: received · 대기: validated)</div>"
        : d.state === "won"
        ? '<div class="callout" style="margin-top:10px">수주 완료 — 개통 주문이 ' +
          '<b class="soft">운영 콘솔 승인 게이트</b>에 대기 중입니다</div>'
        : "") +
      '<label style="margin-top:12px">메모 (세션 로컬 · CRM 미연동)</label>' +
      '<textarea rows="2" id="deal-memo" placeholder="예: 09-01 개통 희망 · IB 토폴로지 요건 확인">' +
        esc(d.memo || "") + "</textarea>" +
      '<div style="display:flex;gap:8px;margin-top:12px;align-items:center">' +
      '<input type="text" id="deal-lost-reason" placeholder="실주 사유 (필수 입력)" style="flex:1">' +
      '<button class="btn-danger sm" data-act="deal-lost" type="button">실주 처리</button></div>';
    var foot = $("#deal-foot");
    if (foot) foot.innerHTML =
      '<button class="btn-plain" data-close type="button">닫기</button>' +
      '<button class="btn-plain" data-act="deal-quote" type="button">견적 재발행</button>' +
      '<button class="btn" data-act="deal-convert" type="button">계약 전환' +
      (d.stage < STAGES.length - 1 ? " (계약 스테이지 필요)" : "") + "</button>";
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
          '<td class="num id js-scale" data-usd="' + (c.mrr_usd || 0) + '">' +
          fmtM((c.mrr_usd || 0) * PERIODS[period].mult) + "</td>";
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

  /* ── 대시보드 — MRR KPI + 딜/계약 위젯 + 라이브 usage 요약 ── */
  function renderDashboard() {
    renderMrr();
    syncDeal();
    renderContracts();
    renderLeads();
    var p = NC.api.billingUsage      // 라이브 실사용 월 예상 → 하단 요약 반영
      ? NC.api.billingUsage().catch(function () { return null; })
      : Promise.resolve(null);
    p.then(function (u) {
      usageMonthly = u && u.totals && u.totals.projected_monthly_usd != null
        ? u.totals.projected_monthly_usd : null;
      renderMrr();
    });
  }
  function renderPipeline() {
    renderBoard();
    renderLeads();
    syncDeal();
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
      // CSAP 제출자료 진척(증명서 완료 시 +1) → 사이드바 배지에 미완 건수 반영
      var done = 7 + (s.cert_ready ? 1 : 0);
      var out = 12 - done;
      var setc = function (id, v) { var e = $("#" + id); if (e) e.textContent = v; };
      setc("csap-progress", done + "/12");
      setc("csap-ck-cap", done + "/12 완료");
      var bd = $("#bd-compliance");
      if (bd) bd.textContent = out;
    });
  }

  /* ── 견적 · RFQ — 세션 로컬 접수함 + billingRates 자동산정 ─────
       접수함은 세션 로컬(새로고침 시 초기화 · CRM 미연동). 자동산정 단가는
       billingRates() 라이브(on-demand 기준) × 기간 배수 × 720h. ── */
  var RFQ_TERMS = { "1": "on-demand", "0.85": "1y −15%", "0.7": "3y −30%" };
  var rfqRate = null;               // 라이브 on-demand 단가 (usd/rack-h)
  var rfqFilter = "all";
  var rfqSeq = 33;
  var rfqList = [
    { id: "RFQ-031", customer: "공공 AI 센터", racks: 32, mult: 0.7,
      term: "reserved 3y", deadline_d: 3, status: "pending",
      note: "CSAP 필수 · 물리 분리 구성안 첨부 대기" },
    { id: "RFQ-032", customer: "pi-genomics", racks: 12, mult: 0.85,
      term: "reserved 1y", deadline_d: 6, status: "pending",
      note: "추론 파이프라인 · 스토리지 8PB · SLA 협의" },
    { id: "RFQ-030", customer: "kappa-search", racks: 8, mult: 0.85,
      term: "reserved 1y", deadline_d: 0, status: "responded" },
    { id: "RFI-027", customer: "omega-motors", racks: 0, mult: 1,
      term: "기술 질의 14항", deadline_d: 0, status: "responded" }
  ];
  function rfqBaseRate() { return rfqRate || QUOTE_STATIC_RATE; }
  function rfqTcv(r) {                          // 36개월 TCV (컴퓨트 + 스토리지 $0.4M/월)
    if (!r.racks) return "—";
    var mo = r.racks * rfqBaseRate() * r.mult * 720;
    return fmtM((mo + 400000) * 36);
  }
  function renderRfqInbox() {
    var box = $("#rfq-inbox");
    if (!box) return;
    var pend = rfqList.filter(function (r) { return r.status === "pending"; });
    var view = rfqList.filter(function (r) {
      return rfqFilter === "all" ? true : r.status === rfqFilter;
    });
    box.innerHTML = view.map(function (r) {
      var done = r.status === "responded";
      var chip = done
        ? '<span class="fr st green">응답 완료</span>'
        : '<span class="fr st ' + (r.deadline_d <= 3 ? "amber" : "blue") +
          '">응답 D-' + r.deadline_d + "</span>";
      var meta = r.racks
        ? r.racks + "랙 · " + esc(r.term) + " · 예상 TCV " + rfqTcv(r)
        : esc(r.term);
      var body = done ? "" :
        '<div class="sub">' + esc(r.note || "") + "</div>" +
        '<div style="display:flex;gap:7px;margin-top:8px">' +
          '<button class="btn-plain sm" data-act="rfq-calc" data-id="' + esc(r.id) +
            '">견적 산정</button>' +
          '<button class="btn sm" data-act="rfq-respond" data-id="' + esc(r.id) +
            '">응답 (견적 발송)</button>' +
          '<button class="btn-plain sm" data-act="rfq-done" data-id="' + esc(r.id) +
            '">응답 완료 처리</button></div>';
      return '<div class="deal ' + (done ? "done" : "blue") +
        '" style="margin-bottom:8px"><div class="hd"><b class="id' +
        (done ? " mut" : "") + '" style="font-size:11px">' + esc(r.id) +
        '</b><span class="soft" style="font-size:12px">' + esc(r.customer) +
        " — " + meta + "</span>" + chip + "</div>" + body + "</div>";
    }).join("") ||
      '<div class="mut" style="font-size:12px">해당 상태의 RFQ가 없습니다.</div>';
    var cap = $("#rfq-count");
    if (cap) cap.textContent = "응답 대기 " + pend.length + " · 완료 " +
      (rfqList.length - pend.length) + " · SLA 5영업일";
  }
  function renderRfqCalc() {
    var racksEl = $("#rfq-racks"), termEl = $("#rfq-term");
    var racks = Math.max(1, parseInt(racksEl && racksEl.value, 10) || 32);
    var mult = parseFloat(termEl && termEl.value) || 0.7;
    var eff = Math.round(rfqBaseRate() * mult);
    var mo = racks * eff * 720;
    var set = function (id, v) { var e = $("#" + id); if (e) e.textContent = v; };
    set("rfq-racks-txt", racks);
    set("rfq-rate-txt", "$" + eff);
    set("rfq-term-txt", RFQ_TERMS[String(mult)] || (mult + "×"));
    set("rfq-compute", fmtM(mo) + "/월");
    set("rfq-tcv", fmtM((mo + 400000) * 36));
    var cap = $("#rfq-rate-cap");
    if (cap) cap.textContent = rfqRate
      ? "기준 단가 $" + rfqRate + "/rack-h — Control-Plane billing/rates 라이브"
      : "랙 수 · 전력 · GPU 기반 · 가격표 v2.4 (정적)";
  }
  function renderRfq() {
    renderRfqInbox();
    renderRfqCalc();
    var p = NC.api.billingRates
      ? NC.api.billingRates().catch(function () { return null; })
      : Promise.resolve(null);
    p.then(function (r) {
      var v = pickRate(r);
      if (v) { rfqRate = v; renderRfqInbox(); renderRfqCalc(); }
    });
  }

  /* ── 파트너 · 공급망 — 리드타임 요약을 expansion()에 연동 ────── */
  function renderPartners() {
    return NC.api.expansion().then(function (x) {
      var su = x.sus.join("·").replace(/·su-/g, "·");
      var el = $("#partner-lead");
      if (el) el.innerHTML = '증설 <b class="soft">' + esc(su) + " (" + x.racks +
        '랙 · VR)</b> — 발주 결정 <b class="amber">D-' + x.order_d +
        '</b> · 파트너 리드타임 <b class="soft">' + x.leadtime_w +
        "주</b> 기준 10월 초 발주 확정 필요 · 공급 파트너 " + esc(x.partner);
      var lt = $("#partner-lt-rack");
      if (lt) lt.textContent = x.leadtime_w + "주";
    });
  }

  /* ── 시장 · 경쟁 분석 (P2 · mock) — 정렬·추가 로컬 상태 ─────── */
  var mktSortAsc = true, mktSeq = 0;
  var marketRows = [
    { name: "CoreWeave", product: "GB300 · VR 대규모 · Slurm/K8s",
      note: "랙 단위 지정(targetRacks) · Billing Insights — 고객 콘솔 벤치마크 반영" },
    { name: "Lambda", product: "온디맨드 중심 · 개발자 UX",
      note: "셀프서비스 온보딩 속도 — 스타트업 프로그램으로 대응" },
    { name: "Crusoe", product: "에너지 연계 DC",
      note: "전력 원가 우위 — PUE 1.18 · MaxQ 운전으로 대응" },
    { name: "Nebius", product: "유럽 · 풀스택 플랫폼",
      note: "마켓플레이스 · 추론 서비스 — P2 로드맵 참고" }
  ];
  function renderMarket() {
    var body = $("#mkt-body");
    if (!body) return;
    var rows = marketRows.slice().sort(function (a, b) {
      return mktSortAsc ? a.name.localeCompare(b.name)
                        : b.name.localeCompare(a.name);
    });
    body.innerHTML = rows.map(function (r) {
      return "<tr><td><b>" + esc(r.name) + '</b></td><td class="mut">' +
        esc(r.product) + '</td><td class="mut">' + esc(r.note) +
        '</td><td class="num"><button class="btn-plain sm" data-demo="' +
        esc(r.name) + ' 상세 벤치마크 리포트 (P2 · mock)">상세</button></td></tr>';
    }).join("");
    var cap = $("#mkt-cap");
    if (cap) cap.textContent = "리서치 아카이브 · " + marketRows.length +
      "개사 · 분기 갱신";
  }

  /* ── 채널 · 리셀러 (P2 · mock) — 리드 추가·검증 로컬 상태 ────── */
  var chanSeq = 0;
  var chanRows = [
    { partner: "MSP-한강클라우드", customer: "sigma-bio 소개 — 2랙",
      racks: 2, status: "리드 등록" },
    { partner: "리셀러-DX파트너스", customer: "omega-motors 소개 — 8랙",
      racks: 8, status: "검증 중" }
  ];
  function renderChannel() {
    var body = $("#chan-body");
    if (!body) return;
    body.innerHTML = chanRows.map(function (r, i) {
      var done = r.status === "검증 완료";
      return "<tr><td><b>" + esc(r.partner) + '</b></td><td class="mut">' +
        esc(r.customer) + '</td><td class="num"><span class="st ' +
        (done ? "green" : "blue") + '">' + esc(r.status) + "</span></td>" +
        '<td class="num">' + (done ? "" :
          '<button class="btn-plain sm" data-act="chan-verify" data-i="' + i +
          '">검증 진행</button>') + "</td></tr>";
    }).join("");
    var arr = chanRows.reduce(function (s, r) {
      return s + (r.racks || 0) * 980 * 720 * 12;
    }, 0) / 1e6;
    var a = $("#chan-arr");
    if (a) a.textContent = "$" + Math.round(arr) + "M";
    var cap = $("#chan-cap");
    if (cap) cap.textContent = chanRows.length + "건 등록";
  }

  /* ── data-act 라우터 (data-demo/필터는 bindClicks에서 분기) ──── */
  function byId(list, id) {
    return list.filter(function (x) { return x.id === id; })[0];
  }
  function onAct(el) {
    var a = el.dataset.act, id = el.dataset.id, r;
    if (a === "rfq-add") {
      var nid = "RFQ-0" + (rfqSeq++);
      rfqList.unshift({ id: nid, customer: "신규 인바운드 " + nid.slice(-3),
        racks: 8, mult: 0.85, term: "reserved 1y", deadline_d: 5,
        status: "pending", note: "자동 접수 — 요건 확인 대기" });
      renderRfqInbox();
      NC.toast(nid + " 접수 등록 — 응답 대기 (세션 로컬 · CRM 미연동)");
    } else if (a === "rfq-calc") {
      r = byId(rfqList, id); if (!r) return;
      var rk = $("#rfq-racks"), tm = $("#rfq-term");
      if (rk) rk.value = r.racks || 32;
      if (tm) tm.value = String(r.mult);
      renderRfqCalc();
      NC.toast(r.id + " 자동산정 로드 — " + (r.racks || 0) + "랙 · " + r.term);
    } else if (a === "rfq-respond") {
      r = byId(rfqList, id); if (!r) return;
      var q = $("#q-racks"); if (q && r.racks) q.value = r.racks;
      NC.openModal("quote");
      NC.toast(r.id + " 견적 응답 — " + (r.racks || 0) +
        "랙 견적서 편집 (발송 시 응답 완료 처리)");
    } else if (a === "rfq-done") {
      r = byId(rfqList, id); if (!r) return;
      r.status = "responded"; r.deadline_d = 0;
      renderRfqInbox();
      NC.toast(r.id + " 응답 완료 처리 — 접수함 갱신");
    } else if (a === "rfq-calc-run") {
      renderRfqCalc();
      NC.toast("견적 자동산정 완료 — " + ($("#rfq-compute") || {}).textContent +
        " (단가 " + (rfqRate ? "Control-Plane 라이브" : "정적 v2.4") + ")");
    } else if (a === "mkt-sort") {
      mktSortAsc = !mktSortAsc;
      el.textContent = "이름순 " + (mktSortAsc ? "▲" : "▼");
      renderMarket();
      NC.toast("경쟁사 벤치마크 " + (mktSortAsc ? "오름차순" : "내림차순") +
        " 정렬 (P2 · mock)");
    } else if (a === "mkt-add") {
      mktSeq += 1;
      marketRows.push({ name: "신규 경쟁사 " + mktSeq,
        product: "프로파일 조사 대기", note: "P2 벤치마크 큐 등록 — 리서치 예정" });
      renderMarket();
      NC.toast("경쟁사 추가 — 신규 경쟁사 " + mktSeq + " (P2 · mock · 세션 로컬)");
    } else if (a === "chan-add") {
      chanSeq += 1;
      chanRows.push({ partner: "신규 채널 " + chanSeq,
        customer: "소개 고객 확인 중 — 4랙", racks: 4, status: "리드 등록" });
      renderChannel();
      NC.toast("채널 리드 추가 — 신규 채널 " + chanSeq +
        " (P2 · mock · 세션 로컬)");
    } else if (a === "chan-verify") {
      var i = parseInt(el.dataset.i, 10);
      if (chanRows[i]) {
        chanRows[i].status = "검증 완료";
        renderChannel();
        NC.toast(chanRows[i].partner + " 채널 리드 검증 완료 (P2 · mock)");
      }
    } else if (a === "deal-quote") {             // 딜 상세 → 견적 재발행 연계
      var dq = byId(DEALS, curDealId); if (!dq) return;
      var qr = $("#q-racks"); if (qr) qr.value = dq.racks || 24;
      NC.closeModal("deal");
      NC.openModal("quote");
      NC.toast(dq.name + " 견적 재발행 — " + dq.racks + "랙 프리필");
    } else if (a === "deal-convert") {           // 딜 상세 → 계약 전환
      var dv = byId(DEALS, curDealId); if (!dv) return;
      if (dv.state === "won") {
        NC.toast("이미 수주 전환된 딜입니다 — " + dv.name); return;
      }
      if (dv.stage < STAGES.length - 1) {        // 계약 스테이지 가드 (모달 유지)
        NC.toast("계약 전환은 '계약 전환' 스테이지에서만 가능합니다 — 현재: " +
          STAGES[dv.stage] + " (스텝퍼에서 이동 후 재시도)", "warn");
        return;
      }
      if (dv.id === "delta-corp") {              // 라이브 딜 — convert 모달 연계
        NC.closeModal("deal");
        NC.openModal("convert");
        return;
      }
      el.disabled = true;                        // 그 외 딜 — 실제 테넌트+랙 주문 생성
      convertLocalDeal(dv).catch(function (err) {
        NC.toast("계약 전환 실패 — " + ((err && err.message) || "다시 시도해 주세요"),
          "warn");
      }).then(function () { el.disabled = false; });
    } else if (a === "deal-lost") {              // 실주 — 사유 필수
      var dl = byId(DEALS, curDealId); if (!dl) return;
      var rEl = $("#deal-lost-reason");
      var reason = rEl && rEl.value.trim();
      if (!reason) {
        NC.toast("실주 사유를 입력해 주세요", "warn");
        if (rEl) rEl.focus();
        return;
      }
      DEALS.splice(DEALS.indexOf(dl), 1);
      NC.closeModal("deal");
      renderBoard(); renderLeads();
      NC.toast(dl.name + " 실주 처리 — 사유: " + esc(reason) +
        " (세션 로컬 · 보드에서 제외)", "warn");
    } else {
      NC.toast("요청이 접수되었습니다 (데모 · PoC 미연동)");
    }
  }

  /* ── 전역 클릭 위임 — data-demo · data-act · RFQ 필터 · 딜 보드 ── */
  function bindClicks() {
    document.addEventListener("click", function (e) {
      var demo = e.target.closest("[data-demo]");
      if (demo) { NC.toast(demo.dataset.demo + " (데모 · PoC 미연동)"); return; }
      var act = e.target.closest("[data-act]");
      if (act) { onAct(act); return; }
      var rf = e.target.closest("[data-rfqf]");
      if (rf) {
        rfqFilter = rf.dataset.rfqf;
        $$("#rfq-filter .p").forEach(function (p) {
          p.classList.toggle("act", p === rf);
        });
        renderRfqInbox();
        return;
      }
      var stg = e.target.closest("[data-dstage]");     // 딜 모달 — 스테이지 스텝퍼
      if (stg) {
        var sd = byId(DEALS, curDealId);
        if (sd) {
          var si = parseInt(stg.dataset.dstage, 10);
          if (si === sd.stage) {
            NC.toast("현재 스테이지 — " + STAGES[si]);
          } else {
            sd.stage = si;                             // 앞/뒤 모두 이동 가능
            NC.toast(sd.name + " 스테이지 이동 — " + STAGES[si] + " (세션 로컬)");
          }
          renderDealModal(); renderBoard(); renderLeads();
        }
        return;
      }
      var sub = e.target.closest("[data-dsub]");       // 딜 모달 — 세부 단계 토글
      if (sub) {
        var xd = byId(DEALS, curDealId);
        if (xd) {
          var j = parseInt(sub.dataset.dsub, 10);
          xd.done[xd.stage][j] = !xd.done[xd.stage][j];
          renderDealModal(); renderBoard();
        }
        return;
      }
      var card = e.target.closest("[data-deal]");      // 보드/대시보드 딜 카드
      if (card && !e.target.closest(                   // 카드 내 컨트롤과 충돌 방지
        "[data-open],[data-close],[data-act],[data-demo],button,a")) {
        openDeal(card.dataset.deal);
      }
    });
    document.addEventListener("input", function (e) {
      if (!e.target) return;
      if (e.target.id === "rfq-racks") renderRfqCalc();   // 자동산정 즉시 갱신
      if (e.target.id === "deal-memo") {                  // 딜 메모 세션 저장
        var d = byId(DEALS, curDealId);
        if (d) d.memo = e.target.value;
      }
    });
    document.addEventListener("change", function (e) {
      if (e.target && (e.target.id === "rfq-term")) renderRfqCalc();
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
      var name = nameEl && nameEl.value.trim();
      if (!name) {                    // 빈 값 가드 — 모달 유지
        NC.toast("고객명을 입력해 주세요", "warn");
        if (nameEl) nameEl.focus();
        return;
      }
      var racks = parseInt(($("#lead-racks") || {}).value, 10) || 8;
      var prob = parseInt(($("#lead-prob") || {}).value, 10) || 20;
      var nd = mkDeal("lead-" + Date.now(), name, racks, prob,
        racks * 980 * 720 * 12, "이민준", "미정", 0, 0, "신규 리드");
      nd.added = true;
      DEALS.unshift(nd);                // 보드 리드 레인 최상단 + 퍼널·배지 반영
      addedLeads += 1;
      renderBoard();
      renderLeads();
      NC.closeModal("lead");
      if (nameEl) nameEl.value = "";
      NC.toast("리드 등록 — " + esc(name) + " · " + racks + "랙 · 확률 " + prob +
        '% <span class="mut">(세션 로컬 저장 — 새로고침 시 초기화 · CRM 미연동)</span>');
    });

    var qt = $("#cf-quote");          // 견적서 생성 — 산정 결과를 토스트로 확정
    if (qt) qt.addEventListener("click", function () {
      var raw = ($("#q-racks") || {}).value;
      var racks = parseInt(raw, 10);
      if (!racks || racks < 1) {      // 빈 값/유효성 가드 — 모달 유지
        NC.toast("랙 수를 1 이상 입력해 주세요", "warn");
        var re = $("#q-racks"); if (re) re.focus();
        return;
      }
      var rate = quoteRate || QUOTE_STATIC_RATE;
      var mo = racks * rate * 720;
      NC.closeModal("quote");
      NC.toast("견적서 생성 — delta-corp v3 · " + racks + "랙 · 월 " + fmtM(mo) +
        " · 연 " + fmtM(mo * 12) + " (단가 $" + rate + "/rack-h " +
        (quoteRate ? "Control-Plane 라이브" : "정적 v2.4") + " · 유효 30일)");
    });

    onConfirm("cf-discount", "discount",
      "theta-ai 할인 8% 승인 — 견적 자동 재발행 · CRM 딜 단계 갱신 (PoC 미연동 데모)");
    onConfirm("cf-contract", "contract",
      "계약이 등록되었습니다 — 잔여 TCV·MRR 대시보드 자동 반영 (PoC 미연동 데모)");

    var rj = $("#cf-reject");         // 반려 — 사유 필수 (빈 값 가드)
    if (rj) rj.addEventListener("click", function () {
      var el = $("#reject-reason");
      var reason = el && el.value.trim();
      if (!reason) {
        NC.toast("반려 사유를 입력해 주세요", "warn");
        if (el) el.focus();
        return;
      }
      NC.closeModal("reject");
      if (el) el.value = "";
      NC.toast("할인 요청 반려 — 사유가 담당자(이민준)에게 전달되었습니다 " +
        "(PoC 미연동 데모)", "warn");
    });

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
      syncDeal();                                  // 파이프라인 상태도 함께 갱신
    });
    NC.bus.on("deal.converted", function () {      // 크로스 포털: 딜 → 계약 전환
      syncDeal();                                  // 내부에서 보드 won 동기까지 수행
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
    getLeads: function () {
      return DEALS.filter(function (d) { return d.added; });
    },
    getDeals: function () { return DEALS.slice(); },
    convertLocalDeal: convertLocalDeal,
    getRfq: function () { return rfqList.slice(); },
    getMarket: function () { return marketRows.slice(); },
    getChannel: function () { return chanRows.slice(); }
  };

  /* ── 부트스트랩 ─────────────────────────────────────────── */
  bindActions();
  bindBus();
  bindClicks();
  bindPeriod();
  bindQuote();
  renderBoard();          // 스테이지 보드 최초 렌더 (라우팅 전에도 내용 존재)
  renderLeads();
  renderRfqInbox();       // 접수함 · P2 표 최초 렌더
  renderMarket();
  renderChannel();
  renderCompliance();     // 사이드바 컴플라이언스 배지 초기화
  NC.start({
    dashboard: renderDashboard,
    pipeline: renderPipeline,
    rfq: renderRfq,
    contracts: renderContracts,
    revenue: renderRevenue,
    pricing: renderPricing,
    planning: renderPlanning,
    partners: renderPartners,
    compliance: renderCompliance,
    market: renderMarket,
    channel: renderChannel
  });
})();
