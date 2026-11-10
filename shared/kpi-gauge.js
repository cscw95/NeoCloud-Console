/* v2 공통 컴포넌트 — 핵심 지표 시각화: 게이지 · 목표 밴드(불릿) · 스파크라인 · 누적 막대 · 지표 타일
   (V2-DESIGN-COMPONENTS.md §2). UMD: 브라우저 window.NC.kpi, node require(). 렌더 함수는 HTML/SVG 문자열.
   색은 CSS 클래스로만 칠한다(.kg-ok → var(--ok) …) — 테마(주간/야간)가 바뀌면 다시 그리지 않아도 따라간다.
   SVG 는 role="img" + aria-label 에 수치·목표·판정을 문장으로 담는다(색만으로 뜻을 전하지 않음, WCAG 1.4.1).
   판정 규칙 tone(): 높을수록 좋음(기본) — value ≥ target 이면 ok, ≥ warn 이면 warn, 그 아래 crit.
   lowerBetter:true(지연·비용) — value ≤ target 이면 ok, ≤ warn 이면 warn, 초과 crit. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.document) { root.NC = root.NC || {}; root.NC.kpi = api; api.install(root.document); }
})(typeof window !== "undefined" ? window : null, function (W) {
  function lang() {
    try { if (W && W.NC_I18N && W.NC_I18N.lang) return W.NC_I18N.lang(); } catch (e) { /* noop */ }
    return api && api._lang || "ko";
  }
  function L(ko, en) { return lang() === "en" ? en : ko; }
  function txt(v) {
    if (v == null) return "";
    if (typeof v === "object" && ("ko" in v || "en" in v)) return lang() === "en" ? (v.en != null ? v.en : v.ko) : (v.ko != null ? v.ko : v.en);
    return String(v);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function isNum(v) { return v != null && v !== "" && !isNaN(+v) && isFinite(+v); }
  function fmt(v, d) {
    if (!isNum(v)) return "—";
    var n = +v; if (d == null) d = Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 1 : 2;
    return n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 });
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  var TONE_SR = { ok: ["목표 충족", "on target"], warn: ["주의", "warning"], crit: ["목표 미달", "off target"], none: ["판정 없음", "no target"] };
  function toneText(t) { var p = TONE_SR[t] || TONE_SR.none; return L(p[0], p[1]); }

  /* tone(value, {target, warn, lowerBetter}) → "ok" | "warn" | "crit" | "none" */
  function tone(value, o) {
    o = o || {};
    if (!isNum(value) || !isNum(o.target)) return o.tone || "none";
    var v = +value, t = +o.target;
    if (o.lowerBetter) {
      if (v <= t) return "ok";
      var w = isNum(o.warn) ? +o.warn : t * 1.2;
      return v <= w ? "warn" : "crit";
    }
    if (v >= t) return "ok";
    var w2 = isNum(o.warn) ? +o.warn : t - Math.abs(t) * 0.05;
    return v >= w2 ? "warn" : "crit";
  }
  function unitOf(o) { return o.unit ? txt(o.unit) : ""; }
  function vs(o, v, d) { return fmt(v, d) + (unitOf(o) ? (unitOf(o) === "%" ? "%" : " " + unitOf(o)) : ""); }
  function ariaSentence(o, t) {
    var s = txt(o.label) + " " + vs(o, o.value, o.digits);
    if (isNum(o.target)) s += ", " + L("목표", "target") + " " + (o.lowerBetter ? "≤ " : "≥ ") + vs(o, o.target, o.digits);
    if (o.band && isNum(o.band[0]) && isNum(o.band[1])) s += ", " + L("허용 범위", "band") + " " + vs(o, o.band[0], o.digits) + "–" + vs(o, o.band[1], o.digits);
    if (t !== "none") s += " — " + toneText(t);
    return s;
  }

  /* 반원 게이지 — gauge({label, value, min=0, max=100, target, warn, band:[lo,hi], unit, digits, lowerBetter, sub, size=160, tone})
     예: 가용성 99.9% → gauge({label:"가용성", value:99.95, min:99, max:100, target:99.9, unit:"%", digits:3}) */
  function gauge(o) {
    o = o || {};
    var min = isNum(o.min) ? +o.min : 0, max = isNum(o.max) ? +o.max : 100;
    if (max <= min) max = min + 1;
    var t = tone(o.value, o);
    var size = o.size || 160, r = 40, cx = 50, cy = 50, sw = 9;
    function pt(v) { var f = clamp((v - min) / (max - min), 0, 1), a = Math.PI * (1 - f); return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; }
    function arc(a, b) {
      var p = pt(a), q = pt(b), large = 0;
      return "M" + p[0].toFixed(2) + " " + p[1].toFixed(2) + " A" + r + " " + r + " 0 " + large + " 1 " + q[0].toFixed(2) + " " + q[1].toFixed(2);
    }
    var v = isNum(o.value) ? clamp(+o.value, min, max) : min;
    var svg = '<svg class="kg-svg" viewBox="0 0 100 60" width="' + size + '" height="' + Math.round(size * 0.6) + '" aria-hidden="true" focusable="false">' +
      '<path class="kg-track" d="' + arc(min, max) + '" stroke-width="' + sw + '" fill="none"/>';
    if (o.band && isNum(o.band[0]) && isNum(o.band[1]))
      svg += '<path class="kg-band" d="' + arc(Math.max(min, +o.band[0]), Math.min(max, +o.band[1])) + '" stroke-width="' + (sw + 4) + '" fill="none"/>';
    if (isNum(o.value) && v > min) svg += '<path class="kg-val kg-' + t + '" d="' + arc(min, v) + '" stroke-width="' + sw + '" fill="none" stroke-linecap="butt"/>';
    if (isNum(o.target)) {
      var f = clamp((+o.target - min) / (max - min), 0, 1), a = Math.PI * (1 - f);
      var x1 = cx + (r - 8) * Math.cos(a), y1 = cy - (r - 8) * Math.sin(a), x2 = cx + (r + 8) * Math.cos(a), y2 = cy - (r + 8) * Math.sin(a);
      svg += '<line class="kg-target" x1="' + x1.toFixed(2) + '" y1="' + y1.toFixed(2) + '" x2="' + x2.toFixed(2) + '" y2="' + y2.toFixed(2) + '" stroke-width="2"/>';
    }
    svg += "</svg>";
    return '<figure class="kg kg-gauge" role="img" aria-label="' + esc(ariaSentence(o, t)) + '" data-tone="' + t + '">' + svg +
      '<div class="kg-read"><span class="kg-v kg-t-' + t + ' tabnum">' + esc(fmt(o.value, o.digits)) +
      (unitOf(o) ? '<span class="kg-u">' + esc(unitOf(o)) + "</span>" : "") + "</span>" +
      '<span class="kg-l">' + esc(txt(o.label)) + "</span>" +
      (isNum(o.target) ? '<span class="kg-tg tabnum">' + esc(L("목표", "Target")) + " " + (o.lowerBetter ? "≤ " : "≥ ") + esc(vs(o, o.target, o.digits)) + "</span>" : "") +
      (o.sub ? '<span class="kg-s">' + esc(txt(o.sub)) + "</span>" : "") +
      '<span class="kg-judge kg-t-' + t + '">' + (t === "ok" ? "✓ " : t === "warn" ? "! " : t === "crit" ? "✕ " : "") + esc(t === "none" ? "" : toneText(t)) + "</span>" +
      "</div></figure>";
  }

  /* 목표 밴드(불릿) — target({label, value, target, warn, max, min=0, band:[lo,hi], unit, digits, lowerBetter, sub, compare})
     예: TTFT p99 vs SLO → target({label:"TTFT p99", value:182, target:250, max:400, unit:"ms", lowerBetter:true})
     compare: 두 번째 막대(예: 감축 후) {value, label} — 전력 예산 vs 감축. */
  function target(o) {
    o = o || {};
    var min = isNum(o.min) ? +o.min : 0;
    var max = isNum(o.max) ? +o.max : Math.max(+o.value || 0, +o.target || 0, o.compare ? +o.compare.value || 0 : 0) * 1.25 || 1;
    if (max <= min) max = min + 1;
    function pct(v) { return (clamp((+v - min) / (max - min), 0, 1) * 100).toFixed(2); }
    var t = tone(o.value, o);
    var band = o.band && isNum(o.band[0]) && isNum(o.band[1])
      ? '<span class="kb-band" style="left:' + pct(o.band[0]) + "%;width:" + (pct(o.band[1]) - pct(o.band[0])).toFixed(2) + '%"></span>' : "";
    var bar = isNum(o.value) ? '<span class="kb-val kg-bg-' + t + '" style="width:' + pct(o.value) + '%"></span>' : "";
    var cmp = o.compare && isNum(o.compare.value) ? '<span class="kb-cmp" style="width:' + pct(o.compare.value) + '%"></span>' : "";
    var tick = isNum(o.target) ? '<span class="kb-tick" style="left:' + pct(o.target) + '%"></span>' : "";
    var aria = ariaSentence(o, t) + (o.compare && isNum(o.compare.value) ? ", " + txt(o.compare.label || L("비교", "compare")) + " " + vs(o, o.compare.value, o.digits) : "");
    return '<div class="kg kb" role="img" aria-label="' + esc(aria) + '" data-tone="' + t + '">' +
      '<div class="kb-h"><span class="kb-l">' + esc(txt(o.label)) + '</span><span class="kb-v kg-t-' + t + ' tabnum">' + esc(vs(o, o.value, o.digits)) + "</span></div>" +
      '<div class="kb-track">' + band + bar + cmp + tick + "</div>" +
      '<div class="kb-f tabnum">' +
      (isNum(o.target) ? "<span>" + esc(L("목표", "Target")) + " " + (o.lowerBetter ? "≤ " : "≥ ") + esc(vs(o, o.target, o.digits)) + "</span>" : "<span></span>") +
      (o.compare && isNum(o.compare.value) ? '<span class="kb-cmp-l">▭ ' + esc(txt(o.compare.label || L("비교", "compare"))) + " " + esc(vs(o, o.compare.value, o.digits)) + "</span>" : "") +
      '<span class="kg-judge kg-t-' + t + '">' + esc(t === "none" ? "" : toneText(t)) + "</span></div>" +
      (o.sub ? '<div class="kg-s">' + esc(txt(o.sub)) + "</div>" : "") + "</div>";
  }

  /* 스파크라인 — spark(values, {label, w=120, h=28, area, target, unit, digits, tone})
     values: 숫자 배열(null 은 끊김). 마지막 점을 강조. */
  function spark(values, o) {
    o = o || {}; values = (values || []).map(function (v) { return isNum(v) ? +v : null; });
    var w = o.w || 120, h = o.h || 28, pad = 2;
    var nums = values.filter(function (v) { return v != null; });
    if (!nums.length) return '<span class="kg ks ks-empty" role="img" aria-label="' + esc(txt(o.label) + " — " + L("데이터 없음", "no data")) + '">—</span>';
    var lo = Math.min.apply(null, nums.concat(isNum(o.target) ? [+o.target] : [])), hi = Math.max.apply(null, nums.concat(isNum(o.target) ? [+o.target] : []));
    if (hi === lo) { hi += 1; lo -= 1; }
    var n = values.length, dx = n > 1 ? (w - pad * 2) / (n - 1) : 0;
    function X(i) { return pad + i * dx; } function Y(v) { return h - pad - (v - lo) / (hi - lo) * (h - pad * 2); }
    var d = "", pen = false, last = null;
    values.forEach(function (v, i) { if (v == null) { pen = false; return; } d += (pen ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1); pen = true; last = i; });
    var cls = "kg-" + (o.tone || "line");
    var svg = '<svg class="ks-svg" viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '" aria-hidden="true" focusable="false" preserveAspectRatio="none">';
    if (isNum(o.target)) svg += '<line class="ks-target" x1="0" x2="' + w + '" y1="' + Y(+o.target).toFixed(1) + '" y2="' + Y(+o.target).toFixed(1) + '"/>';
    if (o.area && n > 1) {
      var first = values.findIndex(function (v) { return v != null; });
      svg += '<path class="ks-area ' + cls + '" d="' + d + "L" + X(last).toFixed(1) + " " + (h - pad) + "L" + X(first).toFixed(1) + " " + (h - pad) + 'Z"/>';
    }
    svg += '<path class="ks-line ' + cls + '" d="' + d + '" fill="none"/>' +
      '<circle class="ks-dot ' + cls + '" cx="' + X(last).toFixed(1) + '" cy="' + Y(values[last]).toFixed(1) + '" r="2.2"/></svg>';
    var u = unitOf(o), sfx = u ? (u === "%" ? "%" : " " + u) : "";
    var aria = txt(o.label) + " " + L("추이", "trend") + ": " + L("최소", "min") + " " + fmt(Math.min.apply(null, nums), o.digits) + sfx +
      ", " + L("최대", "max") + " " + fmt(Math.max.apply(null, nums), o.digits) + sfx + ", " + L("최근", "latest") + " " + fmt(values[last], o.digits) + sfx;
    return '<span class="kg ks" role="img" aria-label="' + esc(aria) + '">' + svg + "</span>";
  }

  /* 누적 막대 — stack(parts, {label, unit, digits, total})  parts: [{label, value, tone?:"ok|warn|crit|info|c1..c6"}]
     예: KV 계층 히트율 G1 GPU · G2 CPU · G3 SSD · miss. 범례는 텍스트로 함께 표시. */
  function stack(parts, o) {
    o = o || {}; parts = (parts || []).filter(function (p) { return p && isNum(p.value); });
    var total = isNum(o.total) ? +o.total : parts.reduce(function (a, p) { return a + +p.value; }, 0) || 1;
    var u = unitOf(o), sfx = u ? (u === "%" ? "%" : " " + u) : "";
    var segs = parts.map(function (p, i) {
      return '<span class="kst-seg kg-bg-' + esc(p.tone || "c" + (i % 6 + 1)) + '" style="width:' + (clamp(+p.value / total, 0, 1) * 100).toFixed(2) + '%"></span>';
    }).join("");
    var legend = parts.map(function (p, i) {
      return '<li><span class="kst-sw kg-bg-' + esc(p.tone || "c" + (i % 6 + 1)) + '" aria-hidden="true"></span>' + esc(txt(p.label)) +
        ' <b class="tabnum">' + esc(fmt(p.value, o.digits) + sfx) + "</b></li>";
    }).join("");
    var aria = txt(o.label) + ": " + parts.map(function (p) { return txt(p.label) + " " + fmt(p.value, o.digits) + sfx; }).join(", ");
    return '<div class="kg kst"><div class="kst-l">' + esc(txt(o.label)) + '</div><div class="kst-track" role="img" aria-label="' + esc(aria) + '">' + segs +
      '</div><ul class="kst-lg">' + legend + "</ul></div>";
  }

  /* 지표 타일 — stat({label, value, unit, digits, sub, delta, deltaGoodWhen:"up"|"down", target, warn, lowerBetter, spark:[…], big})
     value 에 문자열을 주면 그대로(예: "₩12,345,000"). */
  function stat(o) {
    o = o || {};
    var t = tone(o.value, o);
    var v = isNum(o.value) ? fmt(o.value, o.digits) : esc(o.value == null ? "—" : txt(o.value));
    var d = "";
    if (isNum(o.delta)) {
      var up = +o.delta >= 0, good = (o.deltaGoodWhen || "up") === "up" ? up : !up;
      d = '<span class="kt-d ' + (+o.delta === 0 ? "" : good ? "kg-t-ok" : "kg-t-crit") + ' tabnum">' + (up ? "▲ " : "▼ ") + esc(fmt(Math.abs(+o.delta), o.digits)) + "</span>";
    }
    return '<div class="kg kt' + (o.big ? " kt--big" : "") + '" data-tone="' + t + '">' +
      '<div class="kt-l">' + esc(txt(o.label)) + "</div>" +
      '<div class="kt-v tabnum kg-t-' + t + '">' + v + (unitOf(o) ? '<span class="kg-u">' + esc(unitOf(o)) + "</span>" : "") + d + "</div>" +
      (isNum(o.target) ? '<div class="kt-tg tabnum">' + esc(L("목표", "Target")) + " " + (o.lowerBetter ? "≤ " : "≥ ") + esc(vs(o, o.target, o.digits)) +
        (t !== "none" ? ' · <span class="kg-t-' + t + '">' + esc(toneText(t)) + "</span>" : "") + "</div>" : "") +
      (o.spark ? '<div class="kt-sp">' + spark(o.spark, { label: o.label, target: o.target, unit: o.unit, digits: o.digits, tone: t === "none" ? "line" : t, area: true, w: 140 }) + "</div>" : "") +
      (o.sub ? '<div class="kt-s">' + esc(txt(o.sub)) + "</div>" : "") + "</div>";
  }

  /* 타일 격자 — grid(htmlArray, {min=180}) */
  function grid(items, o) {
    o = o || {};
    return '<div class="kg-grid" style="--kg-min:' + (o.min || 180) + 'px">' + (items || []).join("") + "</div>";
  }

  var CSS =
    ".kg{min-width:0;margin:0;color:var(--text-1)}" +
    ".kg-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(var(--kg-min),100%),1fr));gap:var(--sp-3)}" +
    /* 톤 → 토큰 (글자) */
    ".kg-t-ok{color:var(--ok)}.kg-t-warn{color:var(--warn)}.kg-t-crit{color:var(--crit)}.kg-t-none{color:var(--text-1)}" +
    /* 톤 → 토큰 (채움/선) */
    ".kg-bg-ok{background:var(--ok)}.kg-bg-warn{background:var(--warn)}.kg-bg-crit{background:var(--crit)}.kg-bg-none,.kg-bg-info{background:var(--info)}" +
    ".kg-bg-c1{background:var(--chart-1)}.kg-bg-c2{background:var(--chart-2)}.kg-bg-c3{background:var(--chart-3)}.kg-bg-c4{background:var(--chart-4)}.kg-bg-c5{background:var(--chart-5)}.kg-bg-c6{background:var(--chart-6)}" +
    ".kg-bg-track{background:var(--track)}" +
    /* 게이지 */
    ".kg-gauge{display:flex;flex-direction:column;align-items:center;text-align:center}" +
    ".kg-svg{display:block;max-width:100%;height:auto}" +
    ".kg-track{stroke:var(--track)}.kg-band{stroke:var(--accent-soft)}.kg-target{stroke:var(--text-1)}" +
    ".kg-val.kg-ok{stroke:var(--ok)}.kg-val.kg-warn{stroke:var(--warn)}.kg-val.kg-crit{stroke:var(--crit)}.kg-val.kg-none{stroke:var(--info)}" +
    ".kg-read{display:flex;flex-direction:column;align-items:center;gap:1px;margin-top:calc(-1*var(--sp-5))}" +
    ".kg-v{font-size:var(--fs-kpi);font-weight:var(--fw-bold);line-height:var(--lh-tight)}" +
    ".kg-u{font-size:var(--fs-sm);font-weight:var(--fw-semi);margin-left:2px;color:var(--text-2)}" +
    ".kg-l{font-size:var(--fs-xs);color:var(--text-2);font-weight:var(--fw-semi)}" +
    ".kg-tg,.kt-tg{font-size:var(--fs-2xs);color:var(--text-3)}" +
    ".kg-s,.kt-s{font-size:var(--fs-2xs);color:var(--text-3)}" +
    ".kg-judge{font-size:var(--fs-2xs);font-weight:var(--fw-bold)}" +
    /* 불릿(목표 밴드) */
    ".kb-h{display:flex;justify-content:space-between;gap:var(--sp-2);align-items:baseline;margin-bottom:var(--sp-1)}" +
    ".kb-l{font-size:var(--fs-xs);color:var(--text-2);font-weight:var(--fw-semi)}.kb-v{font-weight:var(--fw-bold);font-size:var(--fs-md)}" +
    ".kb-track{position:relative;height:12px;background:var(--track);border-radius:var(--radius-sm);overflow:visible}" +
    ".kb-band{position:absolute;top:0;bottom:0;background:var(--accent-soft);border-left:1px dashed var(--accent-line);border-right:1px dashed var(--accent-line)}" +
    ".kb-val{position:absolute;left:0;top:2px;bottom:2px;border-radius:var(--radius-sm)}" +
    ".kb-cmp{position:absolute;left:0;top:0;bottom:0;border:2px solid var(--text-2);border-radius:var(--radius-sm);background:transparent}" +
    ".kb-tick{position:absolute;top:-3px;bottom:-3px;width:2px;margin-left:-1px;background:var(--text-1)}" +
    ".kb-f{display:flex;justify-content:space-between;gap:var(--sp-2);font-size:var(--fs-2xs);color:var(--text-3);margin-top:var(--sp-1);flex-wrap:wrap}" +
    /* 스파크라인 */
    ".ks{display:inline-block;vertical-align:middle;line-height:0}.ks-svg{overflow:visible}" +
    ".ks-line{stroke-width:1.6;stroke:var(--chart-1)}.ks-area{stroke:none;fill:var(--chart-1);opacity:.14}.ks-dot{fill:var(--chart-1)}" +
    ".ks-line.kg-ok{stroke:var(--ok)}.ks-area.kg-ok,.ks-dot.kg-ok{fill:var(--ok)}" +
    ".ks-line.kg-warn{stroke:var(--warn)}.ks-area.kg-warn,.ks-dot.kg-warn{fill:var(--warn)}" +
    ".ks-line.kg-crit{stroke:var(--crit)}.ks-area.kg-crit,.ks-dot.kg-crit{fill:var(--crit)}" +
    ".ks-target{stroke:var(--text-3);stroke-dasharray:3 2;stroke-width:1}" +
    /* 누적 막대 */
    ".kst-l{font-size:var(--fs-xs);color:var(--text-2);font-weight:var(--fw-semi);margin-bottom:var(--sp-1)}" +
    ".kst-track{display:flex;height:12px;background:var(--track);border-radius:var(--radius-sm);overflow:hidden;gap:1px}" +
    ".kst-seg{display:block;height:100%}" +
    ".kst-lg{list-style:none;margin:var(--sp-2) 0 0;padding:0;display:flex;flex-wrap:wrap;gap:var(--sp-1) var(--sp-3);font-size:var(--fs-xs);color:var(--text-2)}" +
    ".kst-lg b{color:var(--text-1)}.kst-sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:-1px}" +
    /* 타일 */
    ".kt{background:var(--surface-3);border:1px solid var(--border-soft);border-radius:var(--radius);padding:var(--sp-3)}" +
    ".kt-l{font-size:var(--fs-xs);color:var(--text-2);font-weight:var(--fw-semi)}" +
    ".kt-v{font-size:var(--fs-kpi);font-weight:var(--fw-bold);line-height:var(--lh-tight);margin:2px 0;display:flex;align-items:baseline;gap:4px;flex-wrap:wrap}" +
    ".kt-d{font-size:var(--fs-xs);font-weight:var(--fw-semi)}.kt-sp{margin-top:var(--sp-1)}" +
    ".kt--big .kt-v{font-size:calc(var(--fs-kpi)*1.5)}.kt--big .kt-l{font-size:var(--fs-md)}";

  function install(doc) {
    if (!doc || doc.getElementById("nc-kpi-css")) return;
    var s = doc.createElement("style"); s.id = "nc-kpi-css"; s.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(s);
  }

  var api = { version: "1.0.0", gauge: gauge, target: target, spark: spark, stack: stack, stat: stat, grid: grid,
    tone: tone, fmt: fmt, install: install, css: CSS, _lang: "ko" };
  return api;
});
