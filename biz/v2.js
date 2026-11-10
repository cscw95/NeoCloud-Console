/* 사업 콘솔 v2 Phase 1 — 약정(예약) 계약 F06 (POST/GET/PATCH /api/v1/contracts, …/activate) · 청구서 합계 F05.
   기존 "계약 목록"(주문에서 유도, shared/nocp-api.js) 위에 계약 API 패널을 얹는다. 매출 화면에는 청구서(KRW) 합계.
   데이터: NC.v2 — NOCP 라이브 우선, 실패 시 MOCK 배지. 라우트 contracts · revenue (NC.bus "route"). */
(function () {
  var NC = window.NC = window.NC || {};
  var A = NC.v2, U = NC.v2ui;
  if (!A || !U) return;
  var L = U.L, esc = U.esc, fmt = U.fmt, $ = U.$;
  var PRODUCTS = ["bmaas", "managed-k8s", "token-api"];

  async function renderContracts() {
    var root = $("v2-contracts-root"); if (!root) return;
    var r = await A.contracts();
    var list = r.data || [];
    var act = list.filter(function (c) { return c.status === "active"; });
    var minSum = act.reduce(function (s, c) { return s + (+c.min_monthly_amount || 0); }, 0);
    var rows = list.map(function (c) {
      var pl = c.placement && c.placement.same_ib_zone ? L("같은 IB 구역", "same IB zone") : "—";
      return "<tr><td class='id'>" + esc(c.id) + "</td><td><b>" + esc(c.tenant_id) + "</b></td><td>" + esc(c.product) + "</td><td class='num'>" + (c.racks ? fmt(c.racks) : "—") +
        "</td><td>" + esc(c.start_date) + " · " + fmt(c.term_months) + L("개월", " mo") + "</td><td class='num'>" + (c.unit_price < 1 ? "₩" + esc(c.unit_price) : U.krw(c.unit_price)) +
        "</td><td class='num'>" + U.krw(c.min_monthly_amount) + "</td><td>" + esc(pl) + "</td><td>" + esc(c.sla_tier || "") + "</td><td>" + U.st(c.status) + "</td><td>" +
        (c.status === "draft" ? '<button type="button" class="btn-ghost" data-v2-ctr-act="' + esc(c.id) + '">' + esc(L("활성화", "Activate")) + "</button>" : "") + "</td></tr>";
    });
    var opts = PRODUCTS.map(function (p) { return "<option>" + p + "</option>"; }).join("");
    root.innerHTML = (NC.v2demo ? NC.v2demo.host("contract") : "") +
      '<div class="kpi-band">' + U.kpi(L("약정 계약", "Reserved contracts"), fmt(list.length), L("활성 ", "active ") + fmt(act.length)) +
      U.kpi(L("약정 최소 월액 합", "Committed monthly minimum"), U.krw(minSum), L("활성 계약", "active contracts")) +
      U.kpi(L("예약 랙", "Reserved racks"), fmt(act.reduce(function (s, c) { return s + (+c.racks || 0); }, 0)), L("bmaas · managed-k8s", "bmaas · managed-k8s")) + "</div>" +
      U.panel(L("약정 계약 (계약 API)", "Reserved contracts (contract API)"), U.src(r),
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
    var per = new Date().toISOString().slice(0, 7);
    var r = await A.invoices(null, null);
    var inv = r.data || [];
    var by = {};
    inv.forEach(function (x) { var p = by[x.period] = by[x.period] || { n: 0, total: 0, paid: 0 }; p.n++; p.total += x.total || 0; if (x.status === "paid") p.paid += x.total || 0; });
    var rows = Object.keys(by).sort().reverse().map(function (p) {
      return "<tr><td>" + esc(p) + "</td><td class='num'>" + fmt(by[p].n) + "</td><td class='num'>" + U.krw(by[p].total) + "</td><td class='num'>" + U.krw(by[p].paid) + "</td></tr>";
    });
    root.innerHTML = U.panel(L("청구서 합계 (KRW, VAT 포함)", "Invoice totals (KRW, incl. VAT)"), U.src(r) + " · " + L("이번 달 ", "this month ") + U.krw((by[per] || {}).total),
      U.table([L("기간", "Period"), L("#청구서", "#Invoices"), L("#합계", "#Total"), L("#결제 완료", "#Paid")], rows, L("청구서 없음", "No invoices")));
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
