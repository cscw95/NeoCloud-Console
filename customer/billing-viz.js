/* 계정·계약·청구 v2 쇼케이스 시각화 — 고객 콘솔(청구서·SLA·조직) + 사업 콘솔(계약·매출) 공용.
   순수 문자열 빌더(DOM 없음, node 테스트 가능 UMD). 색은 customer/billing.css 의 클래스 → shared/tokens.css
   semantic/차트 토큰(--ok/--crit/--chart-n)만 쓴다. 모든 그림은 role="img" + aria-label 요약, 수치는 텍스트로도 보인다.
   문자열은 호출자가 넘기는 L(ko, en) 로 KO/EN 을 함께 적는다.
   SLA 크레딧 구간: NOCP app/scenario_api.py SLA_CREDIT_TABLE (99.9 미만 10% · 99.0 미만 25% · 95.0 미만 50%). */
(function (root, factory) {
  var m = factory();
  if (typeof module === "object" && module.exports) module.exports = m;
  else { root.NC = root.NC || {}; root.NC.billingViz = m; }
})(typeof window !== "undefined" ? window : globalThis, function () {
  var CREDIT_TABLE = [{ below_pct: 95.0, credit_pct: 50 }, { below_pct: 99.0, credit_pct: 25 }, { below_pct: 99.9, credit_pct: 10 }];
  function id(ko) { return ko; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function won(n) { return n == null || isNaN(+n) ? "—" : (+n < 0 ? "−" : "") + "₩" + Math.abs(Math.round(+n)).toLocaleString("en-US"); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function r1(x) { return Math.round(x * 10) / 10; }

  /* ── 기간 · 다운타임 예산 ─────────────────────────────── */
  function minutesInMonth(period) {
    var m = /^(\d{4})-(\d{2})/.exec(String(period || ""));
    if (!m) return 30 * 1440;
    return new Date(Date.UTC(+m[1], +m[2], 0)).getUTCDate() * 1440;
  }
  /* target 99.9 · 30일 → 허용 43.2분. counted = 가용성에 반영된(예외 제외) 다운타임 분 */
  function budget(targetPct, period, counted) {
    var mins = minutesInMonth(period), allowed = r1((1 - (+targetPct || 99.9) / 100) * mins), used = r1(+counted || 0);
    return { minutes: mins, allowed: allowed, used: used, left: r1(Math.max(0, allowed - used)), over: r1(Math.max(0, used - allowed)),
      ratio: allowed ? used / allowed : 0 };
  }
  /* 가용성 → 크레딧 % (표는 below_pct 오름차순으로 검사: 가장 낮은 구간이 먼저) */
  function creditFor(avail, table) {
    var t = (table && table.length ? table : CREDIT_TABLE).slice().sort(function (a, b) { return a.below_pct - b.below_pct; });
    if (avail == null || isNaN(+avail)) return 0;
    for (var i = 0; i < t.length; i++) if (+avail < t[i].below_pct) return t[i].credit_pct;
    return 0;
  }

  /* ── 가용성 반원 게이지 (99.0–100 % 확대 눈금) ───────── */
  function arcPt(cx, cy, r, t) { var a = Math.PI * (1 - t); return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; }
  function arc(cx, cy, r, t0, t1) {
    var p0 = arcPt(cx, cy, r, t0), p1 = arcPt(cx, cy, r, t1);
    return "M" + p0[0].toFixed(2) + " " + p0[1].toFixed(2) + " A" + r + " " + r + " 0 0 1 " + p1[0].toFixed(2) + " " + p1[1].toFixed(2);
  }
  function gauge(o) {
    var L = o.L || id, lo = o.lo != null ? o.lo : 99, hi = o.hi != null ? o.hi : 100;
    var v = o.value, tg = o.target != null ? +o.target : 99.9;
    var has = v != null && !isNaN(+v);
    var t = has ? clamp((+v - lo) / (hi - lo), 0, 1) : 0, tt = clamp((tg - lo) / (hi - lo), 0, 1);
    var bad = has && +v < tg, cx = 110, cy = 104, r = 84;
    var tp0 = arcPt(cx, cy, r - 14, tt), tp1 = arcPt(cx, cy, r + 12, tt);
    var label = L("가용성 ", "Availability ") + (has ? (+v).toFixed(3) + "%" : "—") + " · " + L("목표 ", "target ") + tg + "% · " +
      (bad ? L("목표 미달", "below target") : L("목표 충족", "meets target"));
    return '<figure class="bv-gauge' + (bad ? " is-bad" : has ? " is-ok" : "") + '"><svg viewBox="0 0 220 122" role="img" aria-label="' + esc(label) + '">' +
      '<path class="bv-g-track" d="' + arc(cx, cy, r, 0, 1) + '"/>' +
      (has && t > 0 ? '<path class="bv-g-val" d="' + arc(cx, cy, r, 0, t) + '"/>' : "") +
      '<line class="bv-g-tgt" x1="' + tp0[0].toFixed(2) + '" y1="' + tp0[1].toFixed(2) + '" x2="' + tp1[0].toFixed(2) + '" y2="' + tp1[1].toFixed(2) + '"/>' +
      '<text class="bv-g-num" x="' + cx + '" y="' + (cy - 14) + '" text-anchor="middle">' + (has ? (+v).toFixed(3) : "—") + '<tspan class="bv-g-pct">%</tspan></text>' +
      '<text class="bv-g-ax" x="' + (cx - r) + '" y="' + (cy + 16) + '" text-anchor="middle">' + lo + '</text>' +
      '<text class="bv-g-ax" x="' + (cx + r) + '" y="' + (cy + 16) + '" text-anchor="middle">' + hi + "</text></svg>" +
      '<figcaption><span class="bv-g-cap">' + (bad ? "▲ " + esc(L("목표 미달", "Below target")) : has ? "● " + esc(L("목표 충족", "Meets target")) : "◌ —") +
      "</span> · " + esc(L("목표", "Target")) + " " + esc(tg) + "% " + esc(L("(눈금 ", "(scale ")) + lo + "–" + hi + "%)</figcaption></figure>";
  }

  /* ── 다운타임 예산 막대 ─────────────────────────────── */
  function budgetBar(b, L) {
    L = L || id;
    var p = Math.round(clamp(b.ratio, 0, 1) * 100), cls = b.ratio > 1 ? "crit" : b.ratio >= 0.7 ? "warn" : "ok";
    var label = L("다운타임 예산 ", "Downtime budget ") + b.used + "/" + b.allowed + L("분 사용", " min used");
    return '<div class="bv-budget"><div class="bv-budget-h"><b>' + esc(b.used) + "</b> / " + esc(b.allowed) + " " + esc(L("분", "min")) +
      ' <span class="bv-muted">' + esc(b.over ? L("초과 ", "over by ") + b.over + L("분", " min") : L("남음 ", "left ") + b.left + L("분", " min")) + "</span></div>" +
      '<span class="bv-meter ' + cls + '" role="img" aria-label="' + esc(label) + '"><i style="width:' + p + '%"></i></span></div>';
  }

  /* ── 크레딧 구간 사다리 ─────────────────────────────── */
  function ladder(avail, table, L) {
    L = L || id;
    var t = (table && table.length ? table : CREDIT_TABLE).slice().sort(function (a, b) { return b.below_pct - a.below_pct; });
    var cur = creditFor(avail, t);
    var rows = [{ range: "≥ " + t[0].below_pct + "%", pct: 0 }].concat(t.map(function (x, i) {
      var upper = x.below_pct, lower = t[i + 1] ? t[i + 1].below_pct : null;
      return { range: (lower != null ? lower + "–" : "< ") + upper + "%", pct: x.credit_pct };
    }));
    return '<ol class="bv-ladder" aria-label="' + esc(L("SLA 크레딧 구간", "SLA credit tiers")) + '">' + rows.map(function (r) {
      var on = r.pct === cur;
      return '<li class="' + (on ? "on" : "") + '"' + (on ? ' aria-current="true"' : "") + '><span class="bv-lad-r">' + esc(r.range) + '</span><span class="bv-lad-p">' +
        (r.pct ? esc(L("월 요금의 ", "")) + r.pct + "%" + esc(L(" 크레딧", " credit")) : esc(L("크레딧 없음", "no credit"))) + "</span>" +
        (on ? '<span class="bv-lad-now">◀ ' + esc(L("이번 기간", "this period")) + "</span>" : "") + "</li>";
    }).join("") + "</ol>";
  }

  /* ── 청구서 계산 (사용료 + 약정 정산 − 크레딧 = 공급가액, VAT 10% 원 미만 절사) ── */
  function invoiceMath(x) {
    x = x || {};
    var usage = x.usage_amount != null ? +x.usage_amount : (x.lines || []).reduce(function (s, l) { return s + (+l.amount || 0); }, 0);
    var trueUp = +x.commitment_true_up || 0;
    var credits = x.credit_total != null ? +x.credit_total : (x.sla_credits || []).reduce(function (s, c) { return s + (+c.amount || 0); }, 0);
    var subtotal = x.subtotal != null ? +x.subtotal : usage + trueUp - credits;
    var vat = x.vat != null ? +x.vat : Math.floor(subtotal * 0.1);
    var total = x.total != null ? +x.total : subtotal + vat;
    return { usage: usage, trueUp: trueUp, credits: credits, subtotal: subtotal, vat: vat, total: total,
      consistent: Math.round(usage + trueUp - credits) === Math.round(subtotal) && Math.round(subtotal + vat) === Math.round(total) };
  }
  /* 워터폴 — steps [{label, amount, kind: up|down|sum}] */
  function waterfall(steps, L, aria) {
    L = L || id;
    var run = 0, max = 0, pos = [];
    steps.forEach(function (s) {
      var a = Math.abs(+s.amount || 0), from, to;
      if (s.kind === "sum") { from = 0; to = run = s.amount != null ? +s.amount : run; }
      else if (s.kind === "down") { from = run - a; to = run; run -= a; }
      else { from = run; to = run + a; run += a; }
      max = Math.max(max, from, to); pos.push([from, to]);
    });
    max = max || 1;
    return '<ol class="bv-wf" aria-label="' + esc(aria || L("청구 금액 흐름", "Invoice amount flow")) + '">' + steps.map(function (s, i) {
      var l = pos[i][0] / max * 100, w = Math.max(0.6, (pos[i][1] - pos[i][0]) / max * 100);
      var sign = s.kind === "down" ? "−" : s.kind === "up" && i ? "+" : "";
      return '<li class="bv-wf-' + (s.kind || "up") + (s.tone ? " " + s.tone : "") + '"><span class="bv-wf-l">' + esc(s.label) + '</span><span class="bv-wf-t" aria-hidden="true"><i style="left:' +
        l.toFixed(2) + "%;width:" + w.toFixed(2) + '%"></i></span><span class="bv-wf-v">' + sign + won(Math.abs(+s.amount || 0)) + "</span></li>";
    }).join("") + "</ol>";
  }
  function invoiceSteps(x, L) {
    L = L || id;
    var m = invoiceMath(x), out = [{ label: L("사용료", "Usage"), amount: m.usage, kind: "up" }];
    if (m.trueUp) out.push({ label: L("약정 정산 (true-up)", "Commitment true-up"), amount: m.trueUp, kind: "up" });
    if (m.credits) out.push({ label: L("SLA 크레딧", "SLA credit"), amount: m.credits, kind: "down", tone: "credit" });
    out.push({ label: L("공급가액", "Subtotal"), amount: m.subtotal, kind: "sum" });
    out.push({ label: L("부가세 10%", "VAT 10%"), amount: m.vat, kind: "up" });
    out.push({ label: L("합계 (청구 금액)", "Total due"), amount: m.total, kind: "sum", tone: "total" });
    return out;
  }

  /* ── 단계 표시 (가입 → … → 청구서, 청구서 상태) ───────── */
  function stepper(steps, aria) {
    return '<ol class="bv-steps" aria-label="' + esc(aria || "") + '">' + steps.map(function (s, i) {
      var st = s.state || "todo", g = st === "done" ? "✓" : st === "current" ? "●" : st === "failed" ? "■" : "○";
      return '<li class="' + st + '"' + (st === "current" ? ' aria-current="step"' : "") + '><span class="bv-st-n" aria-hidden="true">' + g + '</span><span class="bv-st-t"><b>' +
        (i + 1) + ". " + esc(s.label) + "</b>" + (s.sub ? "<small>" + esc(s.sub) + "</small>" : "") + "</span></li>";
    }).join("") + "</ol>";
  }
  var FLOW = ["draft", "finalized", "paid"];
  function invoiceFlowSteps(x, L) {
    L = L || id;
    var i = FLOW.indexOf(x && x.status), v = x && x.status === "void";
    return [
      { label: L("초안", "Draft"), sub: x && x.created_at ? String(x.created_at).slice(0, 10) : L("계량 집계", "metering roll-up"), state: i > 0 ? "done" : i === 0 ? "current" : "todo" },
      { label: L("확정", "Finalized"), sub: x && x.finalized_at ? String(x.finalized_at).slice(0, 10) : L("금액 고정 · 웹훅", "amount locked · webhook"), state: i > 1 ? "done" : i === 1 ? "current" : v ? "failed" : "todo" },
      { label: L("결제", "Paid"), sub: x && x.paid_at ? String(x.paid_at).slice(0, 10) : L("결제 대기", "awaiting payment"), state: i === 2 ? "done" : "todo" },
      { label: L("세금계산서", "Tax invoice"), sub: x && x.tax_invoice ? L("발행 ", "issued ") + (x.tax_invoice.issue_date || "") : L("확정 후 발행", "after finalize"), state: x && x.tax_invoice ? "done" : "todo" }
    ];
  }
  function invoiceFlow(x, L) { return stepper(invoiceFlowSteps(x, L), (L || id)("청구서 진행 단계", "Invoice lifecycle")); }

  /* ── design-core 공유 컴포넌트 연결 (V2-DESIGN-COMPONENTS.md): 브라우저에 NC.flow / NC.kpi 가 있으면 그것으로,
     없으면(node 테스트 · 단독 페이지) 위의 자체 빌더로 그린다. ─────────────────────────── */
  function shared(k) { var g = typeof window !== "undefined" ? window : null; return g && g.NC && g.NC[k] ? g.NC[k] : null; }
  var ST = { done: "done", current: "active", todo: "pending", failed: "fail" };
  function steps(list, aria) {
    var F = shared("flow");
    if (!F) return stepper(list, aria);
    return F.timeline(list.map(function (s) { return { label: s.label, sub: s.sub, status: ST[s.state] || "pending" }; }),
      { orientation: "horizontal", ariaLabel: aria, progress: list.length > 3 });
  }
  /* 가용성 게이지 — 공유 NC.kpi.gauge (warn = target: 목표 미달이면 곧 SLA 위반 → crit) + 눈금 설명 */
  function availGauge(o) {
    var K = shared("kpi"), L = o.L || id;
    if (!K) return gauge(o);
    var tg = o.target != null ? +o.target : 99.9;
    return K.gauge({ label: L("가용성", "Availability"), value: o.value, min: o.lo != null ? o.lo : 99, max: o.hi != null ? o.hi : 100,
      target: tg, warn: tg, unit: "%", digits: 3, size: 200 }) +
      '<p class="bv-g-note">' + esc(L("눈금 99–100% 확대 · 목표 ", "scale zoomed to 99–100% · target ")) + tg + "%</p>";
  }

  /* ── 누적 막대 (월 × 상품) ────────────────────────────── */
  function stack(rows, keys, L, aria) {
    L = L || id;
    var max = rows.reduce(function (m, r) { return Math.max(m, keys.reduce(function (s, k) { return s + (+r.parts[k] || 0); }, 0)); }, 0) || 1;
    var legend = '<ul class="bv-legend">' + keys.map(function (k, i) { return '<li><span class="bv-sw bv-c' + (i % 6 + 1) + '" aria-hidden="true"></span>' + esc(k) + "</li>"; }).join("") + "</ul>";
    var body = rows.map(function (r) {
      var tot = keys.reduce(function (s, k) { return s + (+r.parts[k] || 0); }, 0);
      var desc = keys.filter(function (k) { return +r.parts[k]; }).map(function (k) { return k + " " + won(r.parts[k]); }).join(", ");
      return '<li><span class="bv-sb-l">' + esc(r.label) + '</span><span class="bv-sb-t" role="img" aria-label="' + esc(r.label + ": " + (desc || "0")) + '">' +
        keys.map(function (k, i) { var w = (+r.parts[k] || 0) / max * 100; return w ? '<i class="bv-c' + (i % 6 + 1) + '" style="width:' + w.toFixed(2) + '%"></i>' : ""; }).join("") +
        '</span><span class="bv-sb-v">' + won(tot) + "</span></li>";
    }).join("");
    return '<div class="bv-stack">' + legend + '<ol aria-label="' + esc(aria || L("기간별 금액", "Amount by period")) + '">' + body + "</ol></div>";
  }
  function productOf(l) { return String(l.product || l.metric || "other"); }
  /* 청구서 목록 → 월 × 상품 행 (FinOps 비용 추이). 크레딧은 별도 키 */
  function spendRows(invoices) {
    var by = {}, keys = [];
    (invoices || []).forEach(function (x) {
      var r = by[x.period] = by[x.period] || { label: x.period, parts: {} };
      (x.lines || []).forEach(function (l) { var k = productOf(l); if (keys.indexOf(k) < 0) keys.push(k); r.parts[k] = (r.parts[k] || 0) + (+l.amount || 0); });
      if (+x.commitment_true_up) { if (keys.indexOf("true-up") < 0) keys.push("true-up"); r.parts["true-up"] = (r.parts["true-up"] || 0) + +x.commitment_true_up; }
      if (!(x.lines || []).length && x.usage_amount) { if (keys.indexOf("usage") < 0) keys.push("usage"); r.parts.usage = (r.parts.usage || 0) + +x.usage_amount; }
    });
    return { keys: keys, rows: Object.keys(by).sort().map(function (k) { return by[k]; }) };
  }
  /* 진행 중 월의 말일 예측 (선형) */
  function forecast(amount, period, now) {
    var mins = minutesInMonth(period), m = /^(\d{4})-(\d{2})/.exec(period || "");
    if (!m) return null;
    var start = Date.UTC(+m[1], +m[2] - 1, 1), el = ((now || Date.now()) - start) / 60000;
    if (el <= 0) return null;
    if (el >= mins) return { amount: +amount || 0, ratio: 1 };
    return { amount: Math.round((+amount || 0) * mins / el), ratio: el / mins };
  }

  /* ── 전자세금계산서 양식 (형식 모사 · 국세청 실연동 아님) ──── */
  function taxDoc(t, L) {
    L = L || id;
    t = t || {};
    var s = t.supplier || {}, b = t.buyer || {};
    var vat = t.tax_amount != null ? t.tax_amount : t.vat, sup = t.supply_amount;
    var items = (t.items && t.items.length ? t.items : [{ date: t.issue_date, name: L("이용료", "Service fee"), supply_amount: sup, tax_amount: vat }]);
    function party(title, cls, p) {
      return '<div class="bv-tx-party ' + cls + '"><div class="bv-tx-pt">' + esc(title) + '</div><dl>' +
        "<dt>" + esc(L("등록번호", "Reg. no.")) + "</dt><dd class='id'>" + esc(p.business_reg_no || L("미등록", "not registered")) + "</dd>" +
        "<dt>" + esc(L("상호", "Company")) + "</dt><dd>" + esc(p.name || "—") + "</dd>" +
        "<dt>" + esc(L("대표자", "Representative")) + "</dt><dd>" + esc(p.representative || "—") + "</dd>" +
        (p.biz_type || p.biz_item ? "<dt>" + esc(L("업태 · 종목", "Type · item")) + "</dt><dd>" + esc((p.biz_type || "—") + " · " + (p.biz_item || "—")) + "</dd>" : "") +
        "</dl></div>";
    }
    return '<article class="bv-tax" aria-label="' + esc(L("전자세금계산서", "Electronic tax invoice")) + '">' +
      '<header class="bv-tx-h"><h3>' + esc(L("전자세금계산서", "Electronic tax invoice")) + ' <small>' + esc(L("(공급받는자 보관용)", "(buyer copy)")) + "</small></h3>" +
      '<dl class="bv-tx-meta"><dt>' + esc(L("승인번호", "Approval no.")) + "</dt><dd class='id'>" + esc(t.approval_no || "—") + "</dd><dt>" + esc(L("작성일자", "Issue date")) + "</dt><dd>" +
      esc(t.issue_date || "—") + "</dd></dl></header>" +
      '<div class="bv-tx-parties">' + party(L("공급자", "Supplier"), "sup", s) + party(L("공급받는자", "Buyer"), "buy", b) + "</div>" +
      '<div class="v2-scroll"><table class="tbl bv-tx-items"><thead><tr><th scope="col">' + esc(L("월일", "Date")) + '</th><th scope="col">' + esc(L("품목", "Item")) +
      '</th><th scope="col" class="num">' + esc(L("공급가액", "Supply amount")) + '</th><th scope="col" class="num">' + esc(L("세액", "Tax")) + "</th></tr></thead><tbody>" +
      items.map(function (it) {
        return "<tr><td>" + esc(String(it.date || "").slice(5) || "—") + "</td><td>" + esc(it.name || "—") + "</td><td class='num'>" + won(it.supply_amount) + "</td><td class='num'>" + won(it.tax_amount) + "</td></tr>";
      }).join("") + "</tbody></table></div>" +
      '<footer class="bv-tx-f"><dl><dt>' + esc(L("공급가액", "Supply")) + "</dt><dd>" + won(sup) + "</dd><dt>" + esc(L("세액", "Tax")) + "</dt><dd>" + won(vat) +
      "</dd><dt>" + esc(L("합계금액", "Total")) + "</dt><dd><b>" + won(t.total != null ? t.total : (+sup || 0) + (+vat || 0)) + "</b></dd></dl>" +
      '<p>' + esc(L("이 금액을 ", "This amount is ")) + "<b>" + esc(t.purpose === "영수" ? L("영수", "received") : L("청구", "claimed")) + "</b>" + esc(L("함", "")) + "</p></footer>" +
      (b.business_reg_no ? "" : '<p class="bv-tx-warn" role="note">▲ ' + esc(L("공급받는자 사업자등록번호가 없습니다 — 조직 설정에서 등록하세요.", "Buyer business registration number is missing — add it in organization settings.")) + "</p>") +
      "</article>";
  }

  /* ── 약정 기간 진행 ─────────────────────────────────── */
  function term(start, months, now) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(start || ""));
    if (!m || !+months) return { ratio: 0, elapsed: 0, end: "—", left: 0 };
    var s = Date.UTC(+m[1], +m[2] - 1, +m[3]), e = Date.UTC(+m[1], +m[2] - 1 + +months, +m[3]);
    var n = now || Date.now(), ratio = clamp((n - s) / (e - s), 0, 1);
    var el = Math.max(0, Math.min(+months, Math.floor((n - s) / (30.44 * 86400000))));
    return { ratio: ratio, elapsed: el, left: +months - el, end: new Date(e).toISOString().slice(0, 10) };
  }

  /* ── 역할 권한표 (customer/app.js can(): viewer 변경 불가 · member admin 전용 불가) ── */
  function roleMatrix(L, mine) {
    L = L || id;
    var roles = ["admin", "member", "viewer"];
    var acts = [[L("조회 (리소스 · 청구서 · SLA)", "View (resources · invoices · SLA)"), [1, 1, 1]],
      [L("리소스 생성 · 변경", "Create · change resources"), [1, 1, 0]],
      [L("API 키 발급 · 폐기", "Issue · revoke API keys"), [1, 1, 0]],
      [L("결제 · 결제 수단", "Pay · payment methods"), [1, 0, 0]],
      [L("SSO · 멤버 · 역할", "SSO · members · roles"), [1, 0, 0]]];
    return '<div class="v2-scroll"><table class="tbl bv-rm"><caption class="bv-sr">' + esc(L("역할별 권한", "Permissions by role")) + "</caption><thead><tr><th scope='col'>" +
      esc(L("권한", "Permission")) + "</th>" + roles.map(function (r) { return '<th scope="col" class="c' + (r === mine ? " me" : "") + '">' + esc(r) + (r === mine ? " ★" : "") + "</th>"; }).join("") +
      "</tr></thead><tbody>" + acts.map(function (a) {
        return '<tr><th scope="row">' + esc(a[0]) + "</th>" + a[1].map(function (v, i) {
          return '<td class="c' + (roles[i] === mine ? " me" : "") + '">' + (v ? '<span class="bv-yes">✓<span class="bv-sr">' + esc(L("허용", "allowed")) + "</span></span>"
            : '<span class="bv-no">—<span class="bv-sr">' + esc(L("불가", "not allowed")) + "</span></span>") + "</td>";
        }).join("") + "</tr>";
      }).join("") + "</tbody></table></div>";
  }

  return { CREDIT_TABLE: CREDIT_TABLE, esc: esc, won: won, minutesInMonth: minutesInMonth, budget: budget, creditFor: creditFor, gauge: gauge,
    budgetBar: budgetBar, ladder: ladder, invoiceMath: invoiceMath, waterfall: waterfall, invoiceSteps: invoiceSteps, stepper: stepper,
    invoiceFlow: invoiceFlow, invoiceFlowSteps: invoiceFlowSteps, steps: steps, availGauge: availGauge, stack: stack, spendRows: spendRows, forecast: forecast, taxDoc: taxDoc, term: term, roleMatrix: roleMatrix };
});
