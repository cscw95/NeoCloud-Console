/* v2 공통 컴포넌트 — 흐름 시각화: 단계 타임라인 · 스윔레인 · 진행 막대 (V2-DESIGN-COMPONENTS.md §1).
   UMD: 브라우저는 window.NC.flow, node 는 require() — 렌더 함수는 HTML 문자열만 돌려준다(DOM 없음, 테스트 가능).
   색은 shared/tokens.css semantic 토큰만(--ok/--warn/--crit/--info/--accent/--text-*). 새 색 없음.
   상태: done(완료) · active(진행) · pending(대기) · fail(실패) · skip(건너뜀) · warn(주의).
   라벨은 문자열 또는 {ko, en} — 현재 언어로 고른다. 키보드: 선택 가능한 단계는 <button>,
   ←/→/↑/↓/Home/End 로 단계 사이 포커스 이동, Enter/Space 로 선택(nc-flow-select 이벤트). */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.document) { root.NC = root.NC || {}; root.NC.flow = api; api.install(root.document); }
})(typeof window !== "undefined" ? window : null, function (W) {
  var STATUS = ["done", "active", "pending", "fail", "skip", "warn"];
  var ICON = { done: "✓", active: "●", pending: "○", fail: "✕", skip: "–", warn: "!" };
  var SR = {
    done: ["완료", "done"], active: ["진행 중", "in progress"], pending: ["대기", "pending"],
    fail: ["실패", "failed"], skip: ["건너뜀", "skipped"], warn: ["주의", "warning"]
  };

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
  function norm(s) { s = String(s || "pending").toLowerCase(); return STATUS.indexOf(s) >= 0 ? s : "pending"; }
  function srText(s) { var p = SR[norm(s)]; return L(p[0], p[1]); }

  /* 상태 집계 — {done, active, fail, total, ratio} */
  function summary(steps) {
    var o = { done: 0, active: 0, fail: 0, pending: 0, skip: 0, warn: 0, total: (steps || []).length };
    (steps || []).forEach(function (s) { o[norm(s.status)]++; });
    o.ratio = o.total ? (o.done + o.skip) / o.total : 0;
    return o;
  }

  /* 진행 막대 — progress(done, total, {label, tone, big}) */
  function progress(done, total, opts) {
    opts = opts || {};
    total = Math.max(0, +total || 0); done = Math.max(0, Math.min(total, +done || 0));
    var p = total ? Math.round(done / total * 100) : 0;
    var label = opts.label != null ? txt(opts.label) : L("진행", "Progress");
    var tone = opts.tone || (opts.fail ? "fail" : p >= 100 ? "done" : "active");
    return '<div class="ft-prog' + (opts.big ? " ft--big" : "") + '"><div class="ft-prog-h"><span>' + esc(label) +
      '</span><span class="tabnum">' + done + " / " + total + " · " + p + '%</span></div>' +
      '<div class="ft-prog-bar ' + esc(norm(tone)) + '" role="progressbar" aria-label="' + esc(label) +
      '" aria-valuemin="0" aria-valuemax="' + total + '" aria-valuenow="' + done + '" aria-valuetext="' +
      esc(done + " / " + total) + '"><i style="width:' + p + '%"></i></div></div>';
  }

  /* 단계 타임라인 — timeline(steps, opts)
     steps: [{id, label, sub?, status, at?, detail? (HTML, 신뢰 입력만), badge?}]
     opts:  {orientation: "vertical"|"horizontal" (기본 vertical), ariaLabel, selectable, selected (id),
             big (발표 모드 큰 글씨), progress (true면 위에 진행 막대), numbered (기본 true), id} */
  function timeline(steps, opts) {
    opts = opts || {}; steps = steps || [];
    var horiz = opts.orientation === "horizontal";
    var aria = opts.ariaLabel != null ? txt(opts.ariaLabel) : L("단계 타임라인", "Step timeline");
    var num = opts.numbered !== false;
    var head = "";
    if (opts.progress) { var s = summary(steps); head = progress(s.done + s.skip, s.total, { big: opts.big, fail: s.fail > 0 }); }
    var items = steps.map(function (st, i) {
      var status = norm(st.status), id = st.id != null ? String(st.id) : String(i + 1);
      var isSel = opts.selected != null && String(opts.selected) === id;
      var label = txt(st.label), sub = txt(st.sub);
      var inner = '<span class="ft-node" aria-hidden="true">' + (num && status !== "done" && status !== "fail" ? (i + 1) : ICON[status]) + "</span>" +
        '<span class="ft-body"><span class="ft-label">' + esc(label) +
        (st.badge ? ' <span class="ft-badge">' + esc(txt(st.badge)) + "</span>" : "") + "</span>" +
        '<span class="sr-only"> — ' + esc(srText(status)) + "</span>" +
        (sub ? '<span class="ft-sub">' + esc(sub) + "</span>" : "") +
        (st.at ? '<span class="ft-at tabnum">' + esc(String(st.at).replace("T", " ").slice(0, 19)) + "</span>" : "") +
        "</span>";
      var core = opts.selectable
        ? '<button type="button" class="ft-hit" data-ft-step="' + esc(id) + '" aria-pressed="' + (isSel ? "true" : "false") + '">' + inner + "</button>"
        : '<div class="ft-hit">' + inner + "</div>";
      return '<li class="ft-step ' + status + (isSel ? " sel" : "") + '"' + (status === "active" ? ' aria-current="step"' : "") +
        ' data-status="' + status + '">' + core + (st.detail ? '<div class="ft-detail">' + st.detail + "</div>" : "") + "</li>";
    }).join("");
    return '<div class="ft-wrap' + (opts.big ? " ft--big" : "") + '"' + (opts.id ? ' id="' + esc(opts.id) + '"' : "") + ">" + head +
      '<ol class="ft ' + (horiz ? "ft--h" : "ft--v") + '" aria-label="' + esc(aria) + '">' + items + "</ol></div>";
  }

  /* 스윔레인 — swimlane(lanes, steps, opts)
     lanes: [{id, label}]  steps: [{id, lane, label, status, sub?}] — 순서대로 한 열씩. 같은 col 을 주면 같은 열.
     opts:  {ariaLabel, selectable, selected, big, caption}
     <table> 로 그린다(행 = 레인, 열 = 순서) — 스크린리더가 행/열 머리로 읽는다. 좁은 화면은 가로 스크롤. */
  function swimlane(lanes, steps, opts) {
    opts = opts || {}; lanes = lanes || []; steps = steps || [];
    var aria = opts.ariaLabel != null ? txt(opts.ariaLabel) : L("스윔레인", "Swimlane");
    var cols = 0, placed = steps.map(function (s, i) {
      var c = s.col != null ? +s.col : (i ? null : 0);
      return { s: s, c: c, i: i };
    });
    var cur = -1;
    placed.forEach(function (p) { p.c = p.c != null ? p.c : cur + 1; cur = p.c; cols = Math.max(cols, p.c + 1); });
    var head = '<tr><th scope="col" class="fsl-corner">' + esc(L("구성요소", "Actor")) + "</th>";
    for (var c = 0; c < cols; c++) head += '<th scope="col" class="tabnum">' + (c + 1) + "</th>";
    head += "</tr>";
    var rows = lanes.map(function (ln) {
      var r = '<tr><th scope="row" class="fsl-lane">' + esc(txt(ln.label)) + "</th>";
      for (var c = 0; c < cols; c++) {
        var here = placed.filter(function (p) { return p.c === c && String(p.s.lane) === String(ln.id); });
        r += "<td" + (here.length ? ' class="has"' : "") + ">" + here.map(function (p) {
          var st = norm(p.s.status), id = p.s.id != null ? String(p.s.id) : String(p.i + 1);
          var isSel = opts.selected != null && String(opts.selected) === id;
          var chip = '<span class="fsl-ic" aria-hidden="true">' + ICON[st] + "</span>" + esc(txt(p.s.label)) +
            '<span class="sr-only"> — ' + esc(srText(st)) + "</span>" +
            (p.s.sub ? '<span class="fsl-sub">' + esc(txt(p.s.sub)) + "</span>" : "");
          return opts.selectable
            ? '<button type="button" class="fsl-chip ' + st + (isSel ? " sel" : "") + '" data-ft-step="' + esc(id) + '" aria-pressed="' + (isSel ? "true" : "false") + '">' + chip + "</button>"
            : '<span class="fsl-chip ' + st + '">' + chip + "</span>";
        }).join("") + "</td>";
      }
      return r + "</tr>";
    }).join("");
    return '<div class="fsl-wrap' + (opts.big ? " ft--big" : "") + '" role="region" tabindex="0" aria-label="' + esc(aria) + '">' +
      '<table class="fsl">' + (opts.caption ? "<caption>" + esc(txt(opts.caption)) + "</caption>" : "") +
      "<thead>" + head + "</thead><tbody>" + rows + "</tbody></table></div>";
  }

  /* 데모 러너 단계 → 타임라인 단계 (shared/v2-demo · NOCP /api/v1/demo/* 의 step 형식) */
  function fromDemo(steps) {
    return (steps || []).map(function (s) {
      var st = s.status || (s.ok === true ? "done" : s.ok === false ? "fail" : s.running ? "active" : "pending");
      if (st === "passed" || st === "ok" || st === "pass") st = "done";
      if (st === "failed" || st === "error") st = "fail";
      if (st === "running") st = "active";
      return { id: s.id, label: { ko: s.title_ko || s.title || s.id, en: s.title_en || s.title || s.id },
        sub: s.result_ko || s.result_en ? { ko: s.result_ko || "", en: s.result_en || "" } : null, status: st, at: s.at };
    });
  }

  var CSS =
    ".sr-only{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}" +
    ".ft-wrap{--ft-fs:var(--fs-sm);--ft-node:22px}.ft--big{--ft-fs:var(--fs-lg);--ft-node:30px}" +
    ".ft{list-style:none;margin:0;padding:0;font-size:var(--ft-fs)}" +
    ".ft-step{position:relative;min-width:0}" +
    ".ft-hit{display:flex;gap:var(--sp-2);align-items:flex-start;width:100%;text-align:left;background:none;border:0;color:inherit;font:inherit;padding:var(--sp-1);border-radius:var(--radius-sm)}" +
    "button.ft-hit{cursor:pointer}button.ft-hit:hover{background:var(--surface-hover)}" +
    ".ft-step.sel>.ft-hit{background:var(--accent-soft);box-shadow:inset 0 0 0 1px var(--accent-line)}" +
    ".ft-node{flex:0 0 var(--ft-node);height:var(--ft-node);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:calc(var(--ft-fs) - 1px);font-weight:var(--fw-bold);border:2px solid var(--border-strong);color:var(--text-2);background:var(--surface-1);position:relative;z-index:1}" +
    ".ft-step.done .ft-node{border-color:var(--ok);background:var(--ok-bg);color:var(--ok)}" +
    ".ft-step.active .ft-node{border-color:var(--info);background:var(--info);color:var(--on-info)}" +
    ".ft-step.fail .ft-node{border-color:var(--crit);background:var(--crit-bg);color:var(--crit)}" +
    ".ft-step.warn .ft-node{border-color:var(--warn);background:var(--warn-bg);color:var(--warn)}" +
    ".ft-step.skip .ft-node{border-style:dashed;color:var(--text-3)}" +
    ".ft-body{display:flex;flex-direction:column;gap:2px;min-width:0;padding-top:2px}" +
    ".ft-label{font-weight:var(--fw-semi);color:var(--text-1);overflow-wrap:anywhere}" +
    ".ft-step.pending .ft-label,.ft-step.skip .ft-label{color:var(--text-2);font-weight:var(--fw-med)}" +
    ".ft-step.active .ft-label{color:var(--info-text)}" +
    ".ft-sub{color:var(--text-2);font-size:calc(var(--ft-fs) - 1px);overflow-wrap:anywhere}" +
    ".ft-at{color:var(--text-3);font-size:var(--fs-2xs);font-family:var(--font-mono)}" +
    ".ft-badge{display:inline-block;font-size:var(--fs-2xs);font-weight:var(--fw-bold);padding:0 6px;border-radius:var(--radius-pill);background:var(--info-bg);color:var(--info-text);border:1px solid var(--info-line);vertical-align:1px}" +
    ".ft-detail{margin:var(--sp-1) 0 var(--sp-2) calc(var(--ft-node) + var(--sp-3));font-size:var(--fs-sm)}" +
    /* 세로: 노드 사이 연결선 */
    ".ft--v .ft-step:not(:last-child)::before{content:'';position:absolute;left:calc(var(--sp-1) + var(--ft-node)/2 - 1px);top:calc(var(--sp-1) + var(--ft-node));bottom:calc(-1*var(--sp-1));width:2px;background:var(--border)}" +
    ".ft--v .ft-step.done:not(:last-child)::before{background:var(--ok)}" +
    /* 가로: 넘치면 스크롤, 좁은 화면(≤560px)에서는 세로로 */
    ".ft--h{display:flex;gap:0;overflow-x:auto;padding-bottom:var(--sp-1)}" +
    ".ft--h .ft-step{flex:1 0 120px}" +
    ".ft--h .ft-hit{flex-direction:column;align-items:center;text-align:center}" +
    ".ft--h .ft-body{align-items:center}" +
    ".ft--h .ft-step:not(:last-child)::before{content:'';position:absolute;top:calc(var(--sp-1) + var(--ft-node)/2 - 1px);left:calc(50% + var(--ft-node)/2);right:calc(-50% + var(--ft-node)/2);height:2px;background:var(--border)}" +
    ".ft--h .ft-step.done:not(:last-child)::before{background:var(--ok)}" +
    ".ft--h .ft-detail{margin:var(--sp-1) var(--sp-2)}" +
    "@media (max-width:560px){.ft--h{flex-direction:column;overflow:visible}.ft--h .ft-step{flex:none}.ft--h .ft-hit{flex-direction:row;align-items:flex-start;text-align:left}.ft--h .ft-body{align-items:flex-start}.ft--h .ft-step:not(:last-child)::before{left:calc(var(--sp-1) + var(--ft-node)/2 - 1px);right:auto;top:calc(var(--sp-1) + var(--ft-node));bottom:calc(-1*var(--sp-1));width:2px;height:auto}}" +
    /* 진행 막대 */
    ".ft-prog{margin-bottom:var(--sp-3);font-size:var(--ft-fs,var(--fs-sm))}.ft-prog.ft--big{--ft-fs:var(--fs-lg)}" +
    ".ft-prog-h{display:flex;justify-content:space-between;gap:var(--sp-2);color:var(--text-2);margin-bottom:var(--sp-1)}" +
    ".ft-prog-bar{height:8px;border-radius:var(--radius-pill);background:var(--track);overflow:hidden}.ft--big .ft-prog-bar{height:12px}" +
    ".ft-prog-bar>i{display:block;height:100%;background:var(--info);transition:width var(--dur) var(--ease)}" +
    ".ft-prog-bar.done>i{background:var(--ok)}.ft-prog-bar.fail>i{background:var(--crit)}" +
    /* 스윔레인 */
    ".fsl-wrap{overflow-x:auto;max-width:100%}" +
    ".fsl{border-collapse:separate;border-spacing:0;font-size:var(--ft-fs,var(--fs-sm));min-width:100%}" +
    ".fsl caption{text-align:left;color:var(--text-2);padding:0 0 var(--sp-2)}" +
    ".fsl th,.fsl td{border-bottom:1px solid var(--border-soft);padding:var(--sp-1) var(--sp-2);vertical-align:middle}" +
    ".fsl thead th{color:var(--text-3);font-size:var(--fs-xs);font-weight:var(--fw-semi);text-align:center}" +
    ".fsl .fsl-corner{text-align:left}" +
    ".fsl-lane{text-align:left;white-space:nowrap;color:var(--text-2);font-weight:var(--fw-semi);position:sticky;left:0;background:var(--surface-1);z-index:1}" +
    ".fsl td{min-width:96px;text-align:center}.fsl td.has{background:var(--surface-2)}" +
    ".fsl-chip{display:inline-flex;flex-direction:column;align-items:center;gap:1px;padding:var(--sp-1) var(--sp-2);border-radius:var(--radius);border:1px solid var(--border);background:var(--surface-1);color:var(--text-1);font:inherit;font-size:inherit;max-width:160px}" +
    "button.fsl-chip{cursor:pointer}button.fsl-chip:hover{background:var(--surface-hover)}.fsl-chip.sel{box-shadow:0 0 0 2px var(--accent)}" +
    ".fsl-ic{font-weight:var(--fw-bold)}" +
    ".fsl-chip.done{border-color:var(--ok-line);background:var(--ok-bg)}.fsl-chip.done .fsl-ic{color:var(--ok)}" +
    ".fsl-chip.active{border-color:var(--info);background:var(--info-bg)}.fsl-chip.active .fsl-ic{color:var(--info-text)}" +
    ".fsl-chip.fail{border-color:var(--crit-line);background:var(--crit-bg)}.fsl-chip.fail .fsl-ic{color:var(--crit)}" +
    ".fsl-chip.warn{border-color:var(--warn-line);background:var(--warn-bg)}.fsl-chip.warn .fsl-ic{color:var(--warn)}" +
    ".fsl-chip.pending,.fsl-chip.skip{color:var(--text-2)}" +
    ".fsl-sub{color:var(--text-2);font-size:var(--fs-2xs)}";

  /* 키보드: 같은 목록 안의 [data-ft-step] 버튼 사이 화살표 이동 + 선택 이벤트 */
  function onKey(e) {
    var t = e.target; if (!t || !t.getAttribute || t.getAttribute("data-ft-step") == null) return;
    var box = t.closest(".ft,.fsl"); if (!box) return;
    var all = Array.prototype.slice.call(box.querySelectorAll("[data-ft-step]"));
    var i = all.indexOf(t), n = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") n = Math.min(all.length - 1, i + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = Math.max(0, i - 1);
    else if (e.key === "Home") n = 0; else if (e.key === "End") n = all.length - 1;
    if (n >= 0 && all[n]) { e.preventDefault(); all[n].focus(); }
  }
  function onClick(e) {
    var t = e.target && e.target.closest ? e.target.closest("[data-ft-step]") : null; if (!t) return;
    var box = t.closest(".ft,.fsl");
    if (box) Array.prototype.forEach.call(box.querySelectorAll("[data-ft-step]"), function (b) {
      var on = b === t; b.setAttribute("aria-pressed", on ? "true" : "false");
      var li = b.closest(".ft-step"); if (li) li.classList.toggle("sel", on); else b.classList.toggle("sel", on);
    });
    t.dispatchEvent(new CustomEvent("nc-flow-select", { bubbles: true, detail: { id: t.getAttribute("data-ft-step") } }));
  }
  function install(doc) {
    if (!doc || doc.getElementById("nc-flow-css")) return;
    var s = doc.createElement("style"); s.id = "nc-flow-css"; s.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(s);
    doc.addEventListener("keydown", onKey); doc.addEventListener("click", onClick);
  }

  var api = { version: "1.0.0", STATUS: STATUS, timeline: timeline, swimlane: swimlane, progress: progress,
    summary: summary, fromDemo: fromDemo, install: install, css: CSS, _lang: "ko", _esc: esc, _txt: txt };
  return api;
});
