/* 데모 센터 — NOCP 데모 러너(/api/v1/demo/*)로 v2 기능을 끝까지 시연한다.
   - 시나리오 목록 · 전체 실행/단계 실행/다음 단계/나머지 실행 · 초기화(결정적 시드)
   - 실시간 단계 타임라인: SSE(/runs/{id}/events) 우선, 실패 시 폴링(GET /runs/{id})
   - 단계마다 나레이션·기대값·검증 결과·요청/응답 요약·원문(펼침)·바뀐 화면 딥링크
   - 발표 모드(큰 글씨·사이드바 숨김), KO/EN (러너가 주는 _ko/_en 문자열을 그대로 사용)
   - 라이브 전용: NOCP가 없으면 mock 대신 "미연결"을 표시한다 (시연은 실제 동작만 보여준다).
   라우트 진입은 NC.bus "route" 로 감지 (ops/app.js NC.start 맵 수정 없음).
   브라우저(window.NC.demoCenter)와 node 테스트(module.exports) 양쪽에서 동작한다. */
(function (root, factory) {
  var mod = factory();
  if (typeof module === "object" && module.exports) module.exports = mod;
  if (root && root.document) mod.mount(root);
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  var T = {
    ko: {
      title: "데모 센터", sub: "v2 기능 종단 시연 · NOCP /api/v1/demo",
      live: "● NOCP 라이브", offline: "◌ NOCP 미연결 — 데모 러너는 라이브 전용",
      reset: "초기화", resetAll: "전체 초기화(NICo·AI-Infra 포함)", presenter: "발표 모드", presenterOff: "발표 모드 끄기",
      runAll: "전체 실행", stepMode: "단계 실행", next: "다음 단계", cont: "나머지 실행",
      pace: "속도", fast: "빠르게", normal: "보통", slow: "천천히",
      scenarios: "시나리오", steps: "단계", pendingF: "대기 기능", noScenario: "왼쪽에서 시나리오를 고르세요.",
      expect: "기대", result: "결과", request: "요청", response: "응답", raw: "요청·응답 원문",
      links: "바뀐 화면", verdict: { pass: "통과", fail: "실패", pass_with_pending: "통과(대기 기능 있음)", running: "실행 중" },
      state: { waiting: "○ 대기", running: "▲ 실행 중", passed: "● 통과", failed: "■ 실패", pending: "◌ 기능 대기", skipped: "↷ 건너뜀" },
      resetDone: "초기화 완료 — 결정적 시드로 되돌렸습니다", started: "실행 시작", done: "시나리오 완료",
      loadErr: "불러오기 실패", total: "합계", fallback: "기존 API로 대체 실행",
    },
    en: {
      title: "Demo Center", sub: "v2 end-to-end demos · NOCP /api/v1/demo",
      live: "● NOCP live", offline: "◌ NOCP not connected — the demo runner is live only",
      reset: "Reset", resetAll: "Reset all (incl. NICo, AI-Infra)", presenter: "Presenter mode", presenterOff: "Exit presenter",
      runAll: "Run all", stepMode: "Step mode", next: "Next step", cont: "Run the rest",
      pace: "Pace", fast: "fast", normal: "normal", slow: "slow",
      scenarios: "Scenarios", steps: "steps", pendingF: "pending features", noScenario: "Pick a scenario on the left.",
      expect: "Expect", result: "Result", request: "Request", response: "Response", raw: "Raw request · response",
      links: "Screens that changed", verdict: { pass: "pass", fail: "fail", pass_with_pending: "pass (features pending)", running: "running" },
      state: { waiting: "○ waiting", running: "▲ running", passed: "● passed", failed: "■ failed", pending: "◌ pending feature", skipped: "↷ skipped" },
      resetDone: "Reset — back to the deterministic seed", started: "Run started", done: "Scenario finished",
      loadErr: "Load failed", total: "total", fallback: "ran the pre-v2 equivalent",
    },
  };
  var STATE_CLS = { waiting: "unknown", running: "warn", passed: "ok", failed: "crit", pending: "info", skipped: "unknown" };
  var VERDICT_CLS = { pass: "ok", fail: "crit", pass_with_pending: "info", running: "warn" };
  var PACE = { fast: 150, normal: 700, slow: 1600 };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function L(o, key, lang) { return o ? (o[key + "_" + lang] || o[key + "_ko"] || "") : ""; }
  function t(lang) { return T[lang] || T.ko; }

  function badge(state, feature, lang) {
    var label = t(lang).state[state] || state;
    if (state === "pending" && feature) label += " " + feature;
    return '<span class="nc-badge ' + (STATE_CLS[state] || "unknown") + '">' + esc(label) + "</span>";
  }
  function verdictBadge(v, lang) {
    return '<span class="nc-badge ' + (VERDICT_CLS[v] || "unknown") + '">' + esc(t(lang).verdict[v] || v) + "</span>";
  }
  /* 딥링크: ops 화면은 해시 라우트, 다른 콘솔은 상대 경로 */
  function href(link) {
    var c = (link && link.console) || "ops", r = (link && link.route) || "";
    return c === "ops" ? "#/" + r : "../" + c + "/index.html#/" + r;
  }
  function linksHtml(links, lang) {
    if (!links || !links.length) return "";
    return '<div class="dc-links"><span class="dc-k">' + esc(t(lang).links) + "</span>" + links.map(function (l) {
      return '<a class="dc-link" href="' + esc(href(l)) + '"' + (l.console && l.console !== "ops" ? ' target="_blank" rel="noopener"' : "") +
        ">" + esc(L(l, "label", lang)) + " ↗</a>";
    }).join("") + "</div>";
  }

  function renderList(scenarios, selected, lang) {
    if (!scenarios || !scenarios.length) return '<p class="dc-muted">—</p>';
    return '<ul class="dc-list" role="list">' + scenarios.map(function (s) {
      var on = s.id === selected;
      var pend = (s.pending_features || []).length
        ? '<span class="nc-badge info">' + esc(t(lang).pendingF) + " " + esc(s.pending_features.join(" ")) + "</span>" : "";
      return '<li><button type="button" class="dc-scn' + (on ? " on" : "") + '" data-dc-scn="' + esc(s.id) + '" aria-pressed="' + on + '">' +
        '<span class="dc-scn-t">' + esc(L(s, "title", lang)) + "</span>" +
        '<span class="dc-scn-m"><span class="mono">' + esc(s.feature || "") + "</span> · " + esc(s.steps) + " " + esc(t(lang).steps) + " " + pend + "</span>" +
        "</button></li>";
    }).join("") + "</ul>";
  }

  function stepHtml(st, i, lang) {
    var a = st.assertion || {}, req = st.request, res = st.response;
    var reqLine = req ? '<div class="dc-req mono"><span class="dc-k">' + esc(t(lang).request) + "</span>" +
      esc(req.method) + " " + esc(req.url) + "</div>" : "";
    var resLine = res ? '<div class="dc-res mono"><span class="dc-k">' + esc(t(lang).response) + "</span>" + esc(res.summary) + "</div>" : "";
    var raw = (req || res) ? '<details class="dc-raw"><summary>' + esc(t(lang).raw) + '</summary><pre class="mono">' +
      esc(JSON.stringify({ request: req, response: res }, null, 2)) + "</pre></details>" : "";
    var exp = L(st, "expect", lang);
    return '<li class="dc-step s-' + esc(st.state) + '" data-step="' + i + '">' +
      '<div class="dc-step-h"><span class="dc-no mono">' + esc(st.id) + "</span>" +
      '<span class="dc-step-t">' + esc(L(st, "title", lang)) + "</span>" + badge(st.state, st.feature, lang) +
      (st.duration_ms != null ? '<span class="dc-ms mono">' + esc(st.duration_ms) + " ms</span>" : "") + "</div>" +
      '<p class="dc-narr">' + esc(L(st, "narration", lang)) + "</p>" +
      (exp ? '<div class="dc-exp"><span class="dc-k">' + esc(t(lang).expect) + "</span>" + esc(exp) + "</div>" : "") +
      (a.detail_ko || a.detail_en ? '<div class="dc-res-line"><span class="dc-k">' + esc(t(lang).result) + "</span>" +
        esc(L(a, "detail", lang)) + (st.fallback ? ' <span class="nc-badge unknown">' + esc(t(lang).fallback) + "</span>" : "") + "</div>" : "") +
      reqLine + resLine + linksHtml(st.links, lang) + raw + "</li>";
  }

  function countsHtml(run, lang) {
    var c = run.counts || {};
    return '<div class="dc-counts" role="status">' + verdictBadge(run.verdict, lang) +
      ["passed", "failed", "pending", "skipped"].map(function (k) {
        return '<span class="dc-c">' + esc(t(lang).state[k]) + " " + esc(c[k] || 0) + "</span>";
      }).join("") + '<span class="dc-c mono">' + esc(t(lang).total) + " " + esc(run.total_ms || 0) + " ms</span></div>";
  }

  /* 시나리오 상세 + 실행 타임라인. run 이 없으면 시나리오 단계를 대기 상태로 보여준다. */
  function renderDetail(sc, run, lang, busy) {
    if (!sc) return '<p class="dc-muted">' + esc(t(lang).noScenario) + "</p>";
    var steps = run ? run.steps : (sc.steps || []).map(function (s) {
      return { id: s.id, title_ko: s.title_ko, title_en: s.title_en, narration_ko: s.narration_ko,
        narration_en: s.narration_en, expect_ko: s.expect_ko, expect_en: s.expect_en,
        feature: s.feature, links: s.links, state: s.pending ? "pending" : "waiting" };
    });
    var stepMode = run && run.mode === "step" && run.state !== "done";
    var dis = busy ? " disabled" : "";
    var btns = '<div class="dc-actions">' +
      '<button type="button" class="btn" data-dc-act="run"' + dis + ">" + esc(t(lang).runAll) + "</button>" +
      '<button type="button" class="btn-ghost" data-dc-act="step"' + dis + ">" + esc(t(lang).stepMode) + "</button>" +
      (stepMode ? '<button type="button" class="btn-ghost" data-dc-act="next"' + dis + ">" + esc(t(lang).next) + "</button>" +
        '<button type="button" class="btn-ghost" data-dc-act="cont"' + dis + ">" + esc(t(lang).cont) + "</button>" : "") +
      "</div>";
    return '<div class="dc-head"><h2 class="dc-h">' + esc(L(sc, "title", lang)) + "</h2>" +
      '<p class="dc-sum">' + esc(L(sc, "summary", lang)) + (sc.story ? ' <span class="mono dc-muted">' + esc(sc.story) + "</span>" : "") + "</p>" +
      btns + (run ? countsHtml(run, lang) + '<div class="dc-muted mono">run ' + esc(run.id) + "</div>" : "") + "</div>" +
      '<ol class="dc-timeline">' + steps.map(function (s, i) { return stepHtml(s, i, lang); }).join("") + "</ol>";
  }

  /* NOCP 데모 러너 클라이언트 (fetch 주입 가능 — node 테스트용) */
  function createClient(opts) {
    opts = opts || {};
    var f = opts.fetch || (typeof fetch !== "undefined" ? fetch.bind(globalThis) : null);
    function base() { return typeof opts.base === "function" ? opts.base() : (opts.base || "http://127.0.0.1:8000"); }
    async function req(method, path, body) {
      var r = await f(base() + "/api/v1/demo" + path, {
        method: method, headers: body !== undefined ? { "Content-Type": "application/json" } : {},
        body: body !== undefined ? JSON.stringify(body) : undefined });
      var text = await r.text();
      var data = null;
      try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
      if (!r.ok) { var err = new Error((data && data.detail) || ("HTTP " + r.status)); err.status = r.status; throw err; }
      return data;
    }
    return {
      base: base,
      scenarios: function () { return req("GET", "/scenarios"); },
      scenario: function (id) { return req("GET", "/scenarios/" + encodeURIComponent(id)); },
      run: function (id, mode, pace) { return req("POST", "/scenarios/" + encodeURIComponent(id) + "/run", { mode: mode, pace_ms: pace || 0 }); },
      step: function (rid) { return req("POST", "/runs/" + encodeURIComponent(rid) + "/step"); },
      cont: function (rid, pace) { return req("POST", "/runs/" + encodeURIComponent(rid) + "/continue?pace_ms=" + (pace || 0)); },
      get: function (rid) { return req("GET", "/runs/" + encodeURIComponent(rid)); },
      reset: function (scope) { return req("POST", "/reset", { scope: scope || "nocp" }); },
      eventsUrl: function (rid) { return base() + "/api/v1/demo/runs/" + encodeURIComponent(rid) + "/events"; },
    };
  }

  var CSS =
    "#demo-center-root{--dc-scale:1}" +
    ".dc-top{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px}" +
    ".dc-top h2{font-size:calc(16px*var(--dc-scale));margin:0}.dc-top .rt{margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap}" +
    ".dc-top label{font-size:var(--fs-xs);color:var(--muted)}.dc-top select{background:var(--card);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:5px 7px}" +
    ".dc-grid{display:grid;grid-template-columns:minmax(220px,300px) 1fr;gap:14px;align-items:start}" +
    "@media (max-width:860px){.dc-grid{grid-template-columns:1fr}}" +
    ".dc-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}" +
    ".dc-scn{width:100%;text-align:left;background:var(--card);color:var(--text);border:1px solid var(--line);border-radius:var(--radius);padding:9px 10px;cursor:pointer;display:flex;flex-direction:column;gap:4px;font:inherit}" +
    ".dc-scn:hover{border-color:var(--accent-line)}.dc-scn.on{border-color:var(--green);background:var(--surface-hover)}" +
    ".dc-scn-t{font-size:calc(12.5px*var(--dc-scale));font-weight:var(--fw-semi)}.dc-scn-m{font-size:calc(11px*var(--dc-scale));color:var(--muted);display:flex;gap:6px;align-items:center;flex-wrap:wrap}" +
    ".dc-h{font-size:calc(15px*var(--dc-scale));margin:0 0 4px}.dc-sum{font-size:calc(12px*var(--dc-scale));color:var(--text-2);margin:0 0 10px;line-height:var(--lh-body)}" +
    ".dc-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}.dc-counts{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:calc(11.5px*var(--dc-scale));margin-bottom:4px}" +
    ".dc-timeline{list-style:none;margin:12px 0 0;padding:0;border-left:2px solid var(--line);display:flex;flex-direction:column;gap:10px}" +
    ".dc-step{margin-left:12px;padding:10px 12px;background:var(--card);border:1px solid var(--line);border-radius:var(--radius);position:relative}" +
    ".dc-step:before{content:'';position:absolute;left:-19px;top:14px;width:10px;height:10px;border-radius:50%;background:var(--dot-off);border:2px solid var(--surface-0)}" +
    ".dc-step.s-passed:before{background:var(--ok)}.dc-step.s-failed:before{background:var(--crit)}.dc-step.s-running:before{background:var(--warn)}.dc-step.s-pending:before{background:var(--info)}" +
    ".dc-step.s-failed{border-color:var(--crit-line)}.dc-step.s-running{border-color:var(--warn-line)}" +
    ".dc-step-h{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.dc-no{color:var(--muted2);font-size:calc(11px*var(--dc-scale))}" +
    ".dc-step-t{font-weight:var(--fw-semi);font-size:calc(13px*var(--dc-scale))}.dc-ms{margin-left:auto;color:var(--muted2);font-size:calc(11px*var(--dc-scale))}" +
    ".dc-narr{margin:6px 0;color:var(--text-2);font-size:calc(12px*var(--dc-scale));line-height:var(--lh-body)}" +
    ".dc-exp,.dc-res-line,.dc-req,.dc-res,.dc-links{font-size:calc(11.5px*var(--dc-scale));margin-top:3px;overflow-wrap:anywhere}" +
    ".dc-k{display:inline-block;min-width:64px;color:var(--muted);margin-right:6px;font-family:var(--font-sans)}" +
    ".dc-links{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.dc-link{color:var(--green-text)}" +
    ".dc-raw summary{cursor:pointer;color:var(--muted);font-size:calc(11px*var(--dc-scale));margin-top:5px}" +
    ".dc-raw pre{max-height:300px;overflow:auto;background:var(--surface-1);border:1px solid var(--line-soft);border-radius:6px;padding:8px;font-size:11px;white-space:pre-wrap}" +
    ".dc-muted{color:var(--muted);font-size:var(--fs-xs)}" +
    "body.demo-presenter #nc-sidebar,body.demo-presenter .sb-toggle,body.demo-presenter .sb-scrim,body.demo-presenter .topbar .search{display:none!important}" +
    "body.demo-presenter #demo-center-root{--dc-scale:1.45}body.demo-presenter .content{padding:22px 34px}";

  /* ── 브라우저 마운트 ─────────────────────────────────────────── */
  function mount(win) {
    var doc = win.document;
    var NC = win.NC = win.NC || {};
    var client = createClient({ base: function () {
      return (win.NC_AUTH && win.NC_AUTH.base) ? win.NC_AUTH.base(win) : "http://127.0.0.1:8000";
    } });
    var st = { scenarios: [], sel: null, detail: null, run: null, live: null, busy: false, es: null, poll: null,
      pace: "normal", presenter: false, err: "" };
    NC.demoCenter = { state: st, client: client };

    function lang() { return (win.NC_I18N && win.NC_I18N.lang) ? win.NC_I18N.lang() : "ko"; }
    function $(id) { return doc.getElementById(id); }
    function announce(m) { if (NC.toast) NC.toast(esc(m)); }

    if (!doc.getElementById("dc-style")) {
      var s = doc.createElement("style");
      s.id = "dc-style";
      s.textContent = CSS;
      (doc.head || doc.documentElement).appendChild(s);
    }

    function render() {
      var root = $("demo-center-root");
      if (!root) return;
      var lg = lang(), tx = t(lg);
      var src = st.live === false
        ? '<span class="src-badge mock" role="status">' + esc(tx.offline) + (st.err ? " · " + esc(st.err) : "") + "</span>"
        : st.live ? '<span class="src-badge live" role="status">' + esc(tx.live) + '</span><span class="dc-muted mono">' + esc(client.base()) + "</span>" : "";
      var pace = '<label for="dc-pace">' + esc(tx.pace) + '</label><select id="dc-pace">' +
        ["fast", "normal", "slow"].map(function (k) {
          return '<option value="' + k + '"' + (st.pace === k ? " selected" : "") + ">" + esc(tx[k]) + "</option>";
        }).join("") + "</select>";
      root.setAttribute("lang", lg);
      root.innerHTML = '<div class="dc-top"><h2>' + esc(tx.title) + '</h2><span class="dc-muted">' + esc(tx.sub) + "</span>" + src +
        '<span class="rt">' + pace +
        '<button type="button" class="btn-warn" data-dc-act="reset">' + esc(tx.reset) + "</button>" +
        '<button type="button" class="btn-warn" data-dc-act="reset-all">' + esc(tx.resetAll) + "</button>" +
        '<button type="button" class="btn-ghost" data-dc-act="presenter" aria-pressed="' + st.presenter + '">' +
        esc(st.presenter ? tx.presenterOff : tx.presenter) + "</button></span></div>" +
        '<div class="dc-grid"><div class="panel"><div class="ph"><span class="tick"></span><span class="t">' + esc(tx.scenarios) +
        '</span><span class="c">' + esc(st.scenarios.length) + "</span></div>" + renderList(st.scenarios, st.sel, lg) + "</div>" +
        '<div class="panel" aria-live="polite" aria-busy="' + st.busy + '">' + renderDetail(st.detail, st.run, lg, st.busy) + "</div></div>";
    }

    async function load() {
      try {
        var d = await client.scenarios();
        st.scenarios = d.scenarios || [];
        st.live = true; st.err = "";
        if (!st.sel && st.scenarios.length) await select(st.scenarios[0].id, true);
      } catch (e) {
        st.live = false; st.err = e.status ? "HTTP " + e.status : "";
      }
      render();
    }
    async function select(id, quiet) {
      stopLive();
      st.sel = id; st.run = null;
      try { st.detail = await client.scenario(id); } catch (e) { st.detail = null; }
      if (!quiet) render();
    }
    function stopLive() {
      if (st.es) { st.es.close(); st.es = null; }
      if (st.poll) { clearInterval(st.poll); st.poll = null; }
    }
    function finish() {
      stopLive(); st.busy = false;
      client.get(st.run.id).then(function (r) { st.run = r; render(); announce(t(lang()).done); }).catch(render);
    }
    function poll() {
      if (st.poll) return;
      st.poll = setInterval(async function () {
        try {
          var r = await client.get(st.run.id);
          st.run = r; render();
          if (r.state === "done") finish();
        } catch (e) { stopLive(); st.busy = false; render(); }
      }, 700);
    }
    function follow() {
      stopLive();
      st.busy = true;
      if (typeof win.EventSource !== "function") return poll();
      try {
        var es = st.es = new win.EventSource(client.eventsUrl(st.run.id));
        es.addEventListener("step", function (ev) {
          var d = JSON.parse(ev.data).data;
          if (st.run && st.run.steps[d.index]) { st.run.steps[d.index] = d.step; render(); }
        });
        es.addEventListener("done", function (ev) {
          var d = JSON.parse(ev.data).data;
          st.run.verdict = d.verdict; st.run.counts = d.counts; st.run.state = "done";
          finish();
        });
        es.onerror = function () { if (st.es) { st.es.close(); st.es = null; } poll(); };
      } catch (e) { poll(); }
    }

    async function act(a) {
      var lg = lang();
      try {
        if (a === "presenter") {
          st.presenter = !st.presenter;
          doc.body.classList.toggle("demo-presenter", st.presenter);
          return render();
        }
        if (a === "reset" || a === "reset-all") {
          stopLive(); st.busy = true; render();
          await client.reset(a === "reset" ? "nocp" : "all");
          st.busy = false; st.run = null;
          announce(t(lg).resetDone);
          return load();
        }
        if (!st.sel) return;
        if (a === "run") {
          st.run = await client.run(st.sel, "all", PACE[st.pace]);
          announce(t(lg).started); render(); return follow();
        }
        if (a === "step") { st.run = await client.run(st.sel, "step"); return render(); }
        if (a === "next" && st.run) {
          st.busy = true; render();
          st.run = await client.step(st.run.id); st.busy = false;
          if (st.run.state === "done") announce(t(lg).done);
          return render();
        }
        if (a === "cont" && st.run) {
          st.run = await client.cont(st.run.id, PACE[st.pace]); render(); return follow();
        }
      } catch (e) {
        st.busy = false;
        if (NC.toast) NC.toast(esc(t(lg).loadErr + ": " + e.message), "warn");
        render();
      }
    }

    doc.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-dc-act],[data-dc-scn]");
      if (!b || !b.closest("#demo-center-root")) return;
      if (b.dataset.dcScn) return select(b.dataset.dcScn);
      act(b.dataset.dcAct);
    });
    doc.addEventListener("change", function (e) {
      if (e.target && e.target.id === "dc-pace") { st.pace = e.target.value; }
    });
    doc.addEventListener("keydown", function (e) {
      if (!st.presenter || !$("demo-center-root")) return;
      if (e.key === "Escape") act("presenter");
      else if ((e.key === "ArrowRight" || e.key === "PageDown") && st.run && st.run.mode === "step" && st.run.state !== "done") act("next");
    });
    /* 언어 토글(html lang 변경) 시 다시 그리기 — 러너 문자열은 KO/EN 둘 다 받는다 */
    try {
      new win.MutationObserver(function () { if ($("demo-center-root") && $("demo-center-root").offsetParent !== null) render(); })
        .observe(doc.documentElement, { attributes: true, attributeFilter: ["lang"] });
    } catch (e) { /* old browsers */ }

    if (NC.bus) NC.bus.on("route", function (id) {
      if (id === "demo-center") load();
      else { stopLive(); if (st.presenter) { st.presenter = false; doc.body.classList.remove("demo-presenter"); } }
    });
  }

  return { T: T, badge: badge, verdictBadge: verdictBadge, href: href, renderList: renderList,
    renderDetail: renderDetail, stepHtml: stepHtml, createClient: createClient, mount: mount, CSS: CSS };
});
