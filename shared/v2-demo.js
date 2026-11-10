/* v2 시연 패널 — WAVE-v2.md "시연(데모) 요건" 4·6항.
   화면마다 시나리오(단계 배열)를 등록하면 "시연 실행" · "초기화" 버튼, 단계 진행 표시, 단계별 실제 요청·응답 원문
   (NC.v2.trace: 메서드·URL·헤더·본문·상태)을 보여준다. 단계는 계약 API 를 그대로 부르므로 백엔드가 머지되면 라이브로,
   아니면 MOCK 으로 돈다. NOCP 데모 러너(/api/v1/demo/*, v2-demo 담당)가 생기면 같은 시나리오 id 로 연결한다.
   단계 함수: async (ctx) → { ok:boolean, ko:"결과 문장", en:"result sentence" } — ctx 는 단계 사이 공유 객체. */
(function () {
  var NC = window.NC = window.NC || {};
  var A = NC.v2, U = NC.v2ui;
  if (!A || !U) return;
  var L = U.L, esc = U.esc;
  var REG = {}, RUN = {}, collector = null;   // collector: 실행 중인 단계가 받은 원문 기록
  A.onTrace(function (t) { if (collector) collector.push(t); });

  function register(sc) { REG[sc.id] = sc; }
  function stepState(sid, i) { var r = RUN[sid]; return r && r.results[i]; }

  function html(sid) {
    var sc = REG[sid]; if (!sc) return "";
    var r = RUN[sid] || { results: [] };
    var steps = sc.steps.map(function (s, i) {
      var res = r.results[i], cls = !res ? "" : res.running ? "running" : res.ok ? "done" : "failed";
      return '<li class="' + cls + '"><b>' + (i + 1) + ". " + esc(L(s.ko, s.en)) + "</b>" +
        (res && !res.running ? esc(L(res.ko || "", res.en || res.ko || "")) : res ? esc(L("진행 중…", "running…")) : "") + "</li>";
    }).join("");
    var raw = r.results.map(function (res, i) {
      if (!res || !res.trace || !res.trace.length) return "";
      return res.trace.map(function (t) {
        return "<details><summary>" + esc((i + 1) + ". " + t.method + " " + t.url.replace(/^https?:\/\/[^/]+/, "") + " → " + t.status) + "</summary>" +
          '<div class="v2-out" aria-label="' + esc(L("요청", "Request")) + '">' + esc(t.method + " " + t.url + "\n" +
            Object.keys(t.req_headers || {}).map(function (k) { return k + ": " + t.req_headers[k]; }).join("\n") + (t.req_body ? "\n\n" + t.req_body : "")) + "</div>" +
          '<div class="v2-out" style="margin-top:4px" aria-label="' + esc(L("응답", "Response")) + '">' + esc("HTTP " + t.status + "\n" +
            Object.keys(t.res_headers || {}).filter(function (k) { return t.res_headers[k] != null; }).map(function (k) { return k + ": " + t.res_headers[k]; }).join("\n") +
            "\n\n" + (t.res_body || "")) + "</div></details>";
      }).join("");
    }).join("");
    var done = r.results.filter(function (x) { return x && !x.running; }), okN = done.filter(function (x) { return x.ok; }).length;
    return '<details class="panel v2-demo" data-v2-demo-box="' + esc(sid) + '"' + (r.open ? " open" : "") + "><summary><b>" + esc(L("시연", "Demo")) + "</b> — " +
      esc(L(sc.ko, sc.en)) + ' <span class="v2-path">' + esc(sc.feature) + "</span>" +
      (done.length ? " · " + okN + "/" + sc.steps.length + " " + esc(L("통과", "passed")) : "") + "</summary>" +
      '<div class="v2-row" style="margin-top:10px"><button type="button" class="btn" data-v2-demo-run="' + esc(sid) + '"' + (r.busy ? " disabled" : "") + ">" +
      esc(r.busy ? L("실행 중…", "Running…") : L("▶ 시연 실행", "▶ Run demo")) + '</button><button type="button" class="btn-ghost" data-v2-demo-reset="' + esc(sid) + '">' +
      esc(L("초기화", "Reset")) + "</button>" + (sc.note ? '<span class="v2-note">' + esc(L(sc.note[0], sc.note[1])) + "</span>" : "") + "</div>" +
      '<ol class="v2-tl" aria-live="polite">' + steps + "</ol>" + (raw ? '<h3 class="v2-note">' + esc(L("요청·응답 원문", "Raw request / response")) + "</h3>" + raw : "") + "</details>";
  }
  function paint(sid) {
    document.querySelectorAll('[data-v2-demo-host="' + sid + '"]').forEach(function (el) { el.innerHTML = html(sid); });
  }
  function host(sid) { return '<div data-v2-demo-host="' + esc(sid) + '">' + html(sid) + "</div>"; }

  async function run(sid) {
    var sc = REG[sid]; if (!sc) return null;
    var r = RUN[sid] = { results: [], busy: true, open: true, ctx: {} };
    paint(sid);
    for (var i = 0; i < sc.steps.length; i++) {
      r.results[i] = { running: true };
      paint(sid);
      var got = [], out;
      collector = got;
      try { out = await sc.steps[i].run(r.ctx); } catch (e) { out = { ok: false, ko: "오류: " + e.message, en: "Error: " + e.message }; }
      collector = null;
      out = out || { ok: false };
      out.trace = got;
      r.results[i] = out;
      if (!out.ok && !sc.steps[i].soft) break;
    }
    r.busy = false;
    paint(sid);
    U.refresh();
    return r;
  }
  function reset(sid) {
    var sc = REG[sid];
    A.resetMock();
    RUN[sid] = { results: [], open: true };
    paint(sid);
    U.refresh();
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-v2-demo-run],[data-v2-demo-reset]");
    if (!t) return;
    if (t.dataset.v2DemoRun) run(t.dataset.v2DemoRun);
    else reset(t.dataset.v2DemoReset);
  });
  document.addEventListener("toggle", function (e) {
    var t = e.target;
    if (t && t.dataset && t.dataset.v2DemoBox) { RUN[t.dataset.v2DemoBox] = RUN[t.dataset.v2DemoBox] || { results: [] }; RUN[t.dataset.v2DemoBox].open = t.open; }
  }, true);

  /* 공용 시나리오 등록 (shared/v2-scenarios.js) — env 는 현재 세션·선택값을 읽는다 */
  var envSel = {};
  if (NC.v2scenarios) NC.v2scenarios.build(A, {
    tenant: function () { var s = typeof NC.session === "function" ? NC.session() : null; return (s && s.tenant_id) || "tnt-fin-corp"; },
    cluster: function () { return envSel.cluster || "nvke-0001"; },
    machine: function () { return envSel.machine || "gasan-f2-r05-t07"; },
  }).forEach(register);

  NC.v2demo = { select: function (k, v) { envSel[k] = v; }, register: register, host: host, run: run, reset: reset, paint: paint, scenarios: REG, state: stepState };
})();
