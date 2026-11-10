/* 사업 콘솔 v2 Phase 1 — 약정(예약) 계약 F06 (POST/GET/PATCH /api/v1/contracts, …/activate) · 청구서 합계 F05.
   기존 "계약 목록"(주문에서 유도, shared/nocp-api.js) 위에 계약 API 패널을 얹는다. 매출 화면에는 청구서(KRW) 합계.
   데이터: NC.v2 — NOCP 라이브 우선, 실패 시 MOCK 배지. 라우트 contracts · revenue (NC.bus "route"). */
(function () {
  var NC = window.NC = window.NC || {};
  var A = NC.v2, U = NC.v2ui;
  if (!A || !U) return;
  var L = U.L, esc = U.esc, fmt = U.fmt, $ = U.$;
  var PRODUCTS = ["bmaas", "managed-k8s", "token-api"];
  var V = function () { return NC.billingViz; };
  /* v2 쇼케이스: 계약 카드(약정 기간 진행 · 최소 월액) + 매출(월별 누적 막대) + FinOps 마진(원가 /api/v1/finops/cost?by=tenant).
     FinOps 는 NC.v2 에 없어 여기서 같은 인증 헤더(NC_AUTH)로 직접 부른다. 실패 시 MOCK 배지. */
  function won(n) { return BVf().won(n); }
  function BVf() { return NC.billingViz || { won: U.krw }; }
  /* 마진율 — 원가가 매출의 10배를 넘으면 % 대신 배수로(유휴 랙 원가가 큰 진행 중인 달) */
  function marginNote(rev, cost) {
    var pct = Math.round((rev - cost) / rev * 100);
    return Math.abs(pct) < 1000 ? pct + "%" : L("원가 = 매출의 ", "cost = ") + fmt(Math.round(cost / rev)) + L("배", "× revenue");
  }
  async function finopsCost(period) {
    var url = A.base() + "/api/v1/finops/cost?by=tenant&period=" + encodeURIComponent(period);
    try {
      var h = window.NC_AUTH ? NC_AUTH.headers(null, window, NC_AUTH.token(window)) : {};
      var res = await fetch(url, { headers: h });
      if (!res.ok) return { live: false, status: res.status, src: "/api/v1/finops/cost", data: null };
      return { live: true, src: "/api/v1/finops/cost?by=tenant", data: await res.json() };
    } catch (e) { return { live: false, src: "/api/v1/finops/cost", data: null }; }
  }

  async function renderContracts() {
    var root = $("v2-contracts-root"); if (!root) return;
    var r = await A.contracts();
    var list = r.data || [], BV = V();
    var act = list.filter(function (c) { return c.status === "active"; });
    var minSum = act.reduce(function (s, c) { return s + (+c.min_monthly_amount || 0); }, 0);
    var unit = function (c) { return c.unit_price < 1 ? "₩" + esc(c.unit_price) : U.krw(c.unit_price); };
    var rows = list.map(function (c) {
      var pl = c.placement && c.placement.same_ib_zone ? L("같은 IB 구역", "same IB zone") : "—";
      return "<tr><td class='id'>" + esc(c.id) + "</td><td><b>" + esc(c.tenant_id) + "</b></td><td>" + esc(c.product) + "</td><td class='num'>" + (c.racks ? fmt(c.racks) : "—") +
        "</td><td>" + esc(c.start_date) + " · " + fmt(c.term_months) + L("개월", " mo") + "</td><td class='num'>" + unit(c) +
        "</td><td class='num'>" + U.krw(c.min_monthly_amount) + "</td><td>" + esc(pl) + "</td><td>" + esc(c.sla_tier || "") + "</td><td>" + U.st(c.status) + "</td><td>" +
        (c.status === "draft" ? '<button type="button" class="btn-ghost" data-v2-ctr-act="' + esc(c.id) + '">' + esc(L("활성화", "Activate")) + "</button>" : "") + "</td></tr>";
    });
    var cards = BV ? '<div class="bv-ctr">' + list.slice(0, 6).map(function (c) {
      var t = BV.term(c.start_date, c.term_months);
      return '<article class="bv-ctr-c ' + esc(c.status) + '"><div class="bv-ctr-h"><h3>' + esc(c.tenant_id) + "<small>" + esc(c.id) + " · " + esc(c.product) +
        (c.racks ? " · " + fmt(c.racks) + L("랙", " racks") : "") + "</small></h3>" + U.st(c.status) + "</div>" +
        '<dl class="v2-kv"><dt>' + esc(L("기간", "Term")) + "</dt><dd>" + esc(c.start_date) + " → " + esc(t.end) + "</dd><dt>" + esc(L("단가", "Unit price")) + "</dt><dd>" + unit(c) +
        "</dd><dt>" + esc(L("최소 월액", "Monthly min")) + "</dt><dd>" + U.krw(c.min_monthly_amount) + "</dd><dt>SLA</dt><dd>" + esc(c.sla_tier || "—") +
        (c.placement && c.placement.same_ib_zone ? " · " + esc(L("같은 IB 구역", "same IB zone")) : "") + "</dd></dl>" +
        '<div class="bv-budget"><div class="bv-budget-h">' + esc(L("약정 진행 ", "Term elapsed ")) + "<b>" + fmt(t.elapsed) + "</b> / " + fmt(c.term_months) + esc(L("개월", " mo")) + "</div>" +
        '<span class="bv-meter" role="img" aria-label="' + esc(L("약정 진행 ", "Term elapsed ") + Math.round(t.ratio * 100) + "%") + '"><i style="width:' + Math.round(t.ratio * 100) + '%"></i></span></div>' +
        (c.status === "draft" ? '<button type="button" class="btn-ghost" data-v2-ctr-act="' + esc(c.id) + '">' + esc(L("활성화", "Activate")) + "</button>" : "") + "</article>";
    }).join("") + "</div>" : "";
    var opts = PRODUCTS.map(function (p) { return "<option>" + p + "</option>"; }).join("");
    root.innerHTML = (NC.v2demo ? NC.v2demo.host("contract") : "") +
      '<div class="kpi-band">' + U.kpi(L("약정 계약", "Reserved contracts"), fmt(list.length), L("활성 ", "active ") + fmt(act.length)) +
      U.kpi(L("약정 최소 월액 합", "Committed monthly minimum"), U.krw(minSum), L("활성 계약", "active contracts")) +
      U.kpi(L("예약 랙", "Reserved racks"), fmt(act.reduce(function (s, c) { return s + (+c.racks || 0); }, 0)), L("bmaas · managed-k8s", "bmaas · managed-k8s")) + "</div>" +
      U.panel(L("약정 계약 (계약 API)", "Reserved contracts (contract API)"), U.src(r),
        cards +
        U.table(["ID", L("테넌트", "Tenant"), L("상품", "Product"), L("#랙", "#Racks"), L("기간", "Term"), L("#단가", "#Unit price"), L("#최소 월액", "#Monthly min"), L("배치", "Placement"), "SLA", L("상태", "Status"), ""],
          rows, L("계약 없음", "No contracts")) +
        '<div class="v2-row" style="margin-top:10px">' +
        U.field("v2-ct-t", L("테넌트", "Tenant"), '<input id="v2-ct-t" value="tnt-fin-corp">') +
        U.field("v2-ct-p", L("상품", "Product"), '<select id="v2-ct-p">' + opts + "</select>") +
        U.field("v2-ct-r", L("랙", "Racks"), '<input id="v2-ct-r" type="number" min="0" value="4">') +
        U.field("v2-ct-m", L("기간(개월)", "Term (months)"), '<input id="v2-ct-m" type="number" min="1" value="12">') +
        U.field("v2-ct-s", L("시작일", "Start date"), '<input id="v2-ct-s" type="date">') +
        U.field("v2-ct-u", L("단가 (KRW)", "Unit price (KRW)"), '<input id="v2-ct-u" type="number" min="0" step="any" value="310000">') +
        U.field("v2-ct-min", L("최소 월액 (KRW)", "Monthly min (KRW)"), '<input id="v2-ct-min" type="number" min="0" value="890000000">') +
        U.field("v2-ct-sla", "SLA", '<select id="v2-ct-sla"><option>99.9</option><option>99.95</option></select>') +
        '<div class="v2-f"><label for="v2-ct-ib">' + esc(L("같은 IB 구역", "Same IB zone")) + '</label><input type="checkbox" id="v2-ct-ib" checked></div>' +
        '<button type="button" class="btn" id="v2-ct-add">' + esc(L("+ 계약 등록 (draft)", "+ Create contract (draft)")) + "</button></div>" +
        '<p class="v2-note">' + esc(L("주문에 contract_id 를 넣으면 랙 수·배치 제약을 계약에서 가져오고, 과금 시작 = max(시작일, 인도일).",
          "An order with contract_id takes rack count and placement from the contract; billing starts at max(start date, delivery).")) + "</p>");
  }

  async function renderRevenue() {
    var root = $("v2-biz-rev-root"); if (!root) return;
    var per = new Date().toISOString().slice(0, 7), BV = V();
    var r = await A.invoices(null, null);
    var inv = r.data || [];
    var by = {};
    inv.forEach(function (x) { var p = by[x.period] = by[x.period] || { n: 0, total: 0, paid: 0, sub: 0, credit: 0 }; p.n++; p.total += x.total || 0; p.sub += x.subtotal || 0;
      p.credit += BV ? BV.invoiceMath(x).credits : 0; if (x.status === "paid") p.paid += x.total || 0; });
    var pers = Object.keys(by).sort().reverse();
    var rows = pers.map(function (p) {
      return "<tr><td>" + esc(p) + "</td><td class='num'>" + fmt(by[p].n) + "</td><td class='num'>" + U.krw(by[p].total) + "</td><td class='num'>" + U.krw(by[p].paid) +
        "</td><td class='num'>" + (by[p].credit ? "−" + U.krw(by[p].credit) : "—") + "</td></tr>";
    });
    var kPaid = L("결제 완료", "Paid"), kOpen = L("미결제", "Open");
    var chart = BV && pers.length ? BV.stack(pers.slice().reverse().map(function (p) {
      var o = {}; o[kPaid] = by[p].paid; o[kOpen] = by[p].total - by[p].paid; return { label: p, parts: o };
    }), [kPaid, kOpen], L, L("월별 청구 합계 (결제 완료 · 미결제)", "Monthly invoice totals (paid · open)")) : "";
    var tot = U.panel(L("청구서 합계 (KRW, VAT 포함)", "Invoice totals (KRW, incl. VAT)"), U.src(r) + " · " + L("이번 달 ", "this month ") + U.krw((by[per] || {}).total),
      chart + U.table([L("기간", "Period"), L("#청구서", "#Invoices"), L("#합계", "#Total"), L("#결제 완료", "#Paid"), L("#SLA 크레딧", "#SLA credits")], rows, L("청구서 없음", "No invoices")));
    /* FinOps: 테넌트별 매출(공급가액) vs 원가 */
    var f = await finopsCost(per), fc = f.data || {}, items = fc.items || [], ft = fc.totals || {};
    var rev = {};
    inv.filter(function (x) { return x.period === per; }).forEach(function (x) { rev[x.tenant_id] = (rev[x.tenant_id] || 0) + (+x.subtotal || 0); });
    var keys = Object.keys(rev);
    items.forEach(function (i) { if (keys.indexOf(i.key) < 0) keys.push(i.key); });
    var revSum = keys.reduce(function (s, k) { return s + (rev[k] || 0); }, 0), costSum = f.live ? +ft.net_cost_krw || +ft.total_cost_krw || 0 : 0;
    var mrows = keys.map(function (k) {
      var it = items.find(function (i) { return i.key === k; }) || {}, c = +it.total_cost_krw || 0, rv = rev[k] || 0, mg = rv - c;
      return "<tr><td class='id'>" + esc(k) + "</td><td>" + esc(it.kind || "tenant") + "</td><td class='num'>" + U.krw(rv) + "</td><td class='num'>" + (f.live ? U.krw(c) : "—") +
        "</td><td class='num'>" + (f.live ? (mg < 0 ? "▼ " : "▲ ") + won(mg) : "—") + "</td><td>" + (f.live && rv ? marginNote(rv, c) : "—") + "</td></tr>";
    });
    var margin = U.panel(L("FinOps — 매출 vs 원가 (이번 달)", "FinOps — revenue vs cost (this month)"), U.src(f) + (fc.window && fc.window.complete === false ? " · " + esc(L("진행 중인 달", "month in progress")) : ""),
      '<div class="kpi-band">' + U.kpi(L("매출 (공급가액)", "Revenue (subtotal)"), U.krw(revSum), esc(per)) +
      U.kpi(L("원가 (플릿 전체 · 전력 + 감가상각)", "Cost (whole fleet · power + depreciation)"), f.live ? U.krw(costSum) : "—", f.live ? fmt(ft.energy_kwh) + " kWh" : L("원가 API 미연동", "cost API not connected")) +
      U.kpi(L("운영 마진 (플릿 전체)", "Operating margin (whole fleet)"), f.live ? won(revSum - costSum) : "—", f.live && revSum ? marginNote(revSum, costSum) : "", f.live ? (revSum - costSum < 0 ? "red" : "green") : "") + "</div>" +
      U.table([L("키", "Key"), L("종류", "Kind"), L("#매출", "#Revenue"), L("#원가", "#Cost"), L("#마진", "#Margin"), L("마진율", "Margin %")], mrows, L("데이터 없음", "No data")) +
      '<p class="v2-note">' + esc(L("idle(유휴) 행 = 아직 테넌트에 배정되지 않은 랙의 원가. 원가 배분 가정은 운영 콘솔 FinOps 화면에 있습니다.",
        "The idle row is the cost of racks not yet allocated to a tenant. Cost allocation assumptions are on the ops console FinOps screen.")) + "</p>");
    root.innerHTML = tot + margin;
  }

  document.addEventListener("click", async function (e) {
    var t = e.target.closest && e.target.closest("#v2-ct-add,[data-v2-ctr-act]");
    if (!t) return;
    var r;
    if (t.id === "v2-ct-add") {
      var g = function (id) { return $(id).value; };
      if (!g("v2-ct-s")) return U.toast(L("시작일을 입력하세요", "Enter a start date"), "warn");
      var racks = +g("v2-ct-r");
      r = await A.contractCreate({ tenant_id: g("v2-ct-t").trim(), product: g("v2-ct-p"), commitment: "reserved", racks: racks || undefined,
        blueprint_key: racks ? "vr-nvl72" : undefined, term_months: +g("v2-ct-m"), start_date: g("v2-ct-s"), unit_price: +g("v2-ct-u"),
        min_monthly_amount: +g("v2-ct-min") || undefined, placement: $("v2-ct-ib").checked ? { same_ib_zone: true } : undefined, sla_tier: g("v2-ct-sla") });
      U.toast(r.error ? L("실패: ", "Failed: ") + r.error : L("계약 등록 — ", "Contract created — ") + r.data.id + (r.live ? "" : " (MOCK)"), r.error ? "warn" : "");
    } else {
      r = await A.contractActivate(t.dataset.v2CtrAct);
      U.toast(r.error ? L("실패: ", "Failed: ") + r.error : L("활성화 — ", "Activated — ") + t.dataset.v2CtrAct + (r.live ? "" : " (MOCK)"), r.error ? "warn" : "");
    }
    renderContracts();
  });

  U.onRoute({ contracts: renderContracts, revenue: renderRevenue });
})();
