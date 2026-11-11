/* v2 쇼케이스 — 고객 토큰 API 화면 #/token (F01·F02·F04·F33).
   customer/v2.js 의 renderToken/sendPlay 가 NC.tokenUI 로 위임한다(상태 TK 공유, 컨트롤 id 그대로: v2-key-*, v2-pg-*).
   구성: SLO 핵심 지표(TTFT·TPOT p99 vs 2 s / 50 ms) → 흐름 타임라인(키 → 호출 → usage → 미터링 → 청구) → API 키 ·
   스트리밍 플레이그라운드(토큰 도착 표시 + TTFT·TPOT·tokens/s 실측 + 요청·응답 원문) → 사용량(유형별 누적 막대, cached 비중) · 쿼터.
   공유 컴포넌트: NC.kpi · NC.flow · NC.msg (design-core, shared/*.js). 데이터: NC.v2 (NOCP 라이브 우선, 실패 시 MOCK). */
(function () {
  var NC = window.NC = window.NC || {};
  var A = NC.v2, U = NC.v2ui, V = NC.tokenViz;
  if (!A || !U || !V) return;
  var L = U.L, esc = U.esc, fmt = U.fmt, $ = U.$;
  var K = NC.kpi, F = NC.flow, MSG = NC.msg;
  var SLOW = 3600;

  function sess() { return typeof NC.session === "function" ? NC.session() : null; }
  function tenant() { var s = sess(); return (s && s.tenant_id) || "tnt-fin-corp"; }
  function canWrite() { var s = sess(); return !s || s.role !== "viewer"; }
  function reduced() { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } }

  /* 실측 상태 — 마지막 스트리밍 호출 */
  var RUN = { stats: null, usage: null, live: false, error: null };
  var LAST = { keys: 0, total: 0 }, PRESET = null;
  function flowHtml() {
    return F.timeline(V.customerFlow({ keys: LAST.keys, called: !!RUN.usage, callFailed: !!RUN.error, total: LAST.total }),
      { orientation: "horizontal", progress: true, ariaLabel: L("토큰 API 흐름: 키 발급부터 청구서까지", "Token API flow: from API key to invoice") });
  }

  function sloTiles(S, res) {
    var f = S.fleet, t = S.target;
    if (!K) return "";
    return K.grid([
      K.target({ label: { ko: "TTFT p99 (첫 토큰)", en: "TTFT p99 (first token)" }, value: f.ttft, target: t.ttft_p99_ms, band: [0, t.ttft_p99_ms],
        max: Math.max(t.ttft_p99_ms * 1.3, (f.ttft || 0) * 1.1), unit: "ms", lowerBetter: true,
        sub: { ko: "SLO ≤ 2 s · 최근 1시간", en: "SLO ≤ 2 s · last hour" } }),
      K.target({ label: { ko: "TPOT p99 (토큰 간격)", en: "TPOT p99 (per output token)" }, value: f.tpot, target: t.tpot_p99_ms, band: [0, t.tpot_p99_ms],
        max: Math.max(t.tpot_p99_ms * 1.3, (f.tpot || 0) * 1.1), unit: "ms", digits: 1, lowerBetter: true,
        sub: { ko: "SLO ≤ 50 ms · 최근 1시간", en: "SLO ≤ 50 ms · last hour" } }),
      K.stat({ label: { ko: "모델 배포 (Ready)", en: "Model deployments (Ready)" }, value: S.rows.filter(function (r) { return /ready/i.test(r.state); }).length || S.rows.length,
        sub: S.fleet.breach ? { ko: "SLO 위반 배포 있음", en: "a deployment breaches SLO" } : { ko: "모두 SLO 안", en: "all within SLO" } })
    ], { min: 220 }) + '<p class="tk-src">' + U.src(res) + "</p>";
  }

  function usageTiles(N, q) {
    if (!K) return "";
    var left = q.tpm != null ? q.tpm - (q.used_tpm || 0) : null;
    return K.grid([
      K.stat({ label: { ko: "이번 달 토큰", en: "Tokens this month" }, value: U.big(N.total), sub: N.period || "" }),
      K.gauge({ label: { ko: "캐시된 입력 비중", en: "Cached share of input" }, value: N.cachedShare, min: 0, max: 100, unit: "%", digits: 1, size: 140,
        sub: { ko: "prompt_tokens_details.cached_tokens", en: "prompt_tokens_details.cached_tokens" } }),
      K.target({ label: { ko: "TPM 사용 (interactive)", en: "TPM used (interactive)" }, value: q.used_tpm || 0, max: q.tpm || 1, target: q.tpm ? q.tpm * 0.8 : null,
        lowerBetter: true, unit: "tok/min", sub: { ko: "남은 " + U.big(left) + " · 한도 " + U.big(q.tpm), en: "left " + U.big(left) + " · limit " + U.big(q.tpm) } }),
      K.stat({ label: { ko: "월 상한", en: "Monthly cap" }, value: q.monthly_token_cap ? U.big(q.monthly_token_cap) : L("없음", "none"),
        sub: q.monthly_token_cap ? { ko: "사용 " + Math.round(N.total / q.monthly_token_cap * 100) + "%", en: Math.round(N.total / q.monthly_token_cap * 100) + "% used" } : "" })
    ], { min: 200 });
  }

  function liveMeter() {
    var s = RUN.stats || {}, t = V.SLO;
    function cell(id, k, v, unit, ok) {
      return '<div class="tk-m" id="' + id + '"><span class="tk-mk">' + esc(k) + '</span><b class="tabnum' + (ok == null ? "" : ok ? " kg-t-ok" : " kg-t-crit") + '">' +
        esc(v == null ? "—" : fmt(v, unit === "ms" && v < 100 ? 1 : 0)) + '</b><span class="tk-mu">' + esc(unit) + "</span></div>";
    }
    return '<div class="tk-meter" id="tk-meter" role="group" aria-label="' + esc(L("스트리밍 실측", "Streaming measurements")) + '">' +
      cell("tk-m-ttft", "TTFT", s.ttft, "ms", s.ttft == null ? null : s.ttft <= t.ttft_p99_ms) +
      cell("tk-m-tpot", "TPOT", s.tpot, "ms", s.tpot == null ? null : s.tpot <= t.tpot_p99_ms) +
      cell("tk-m-tps", L("속도", "Speed"), s.tps, "tok/s") +
      cell("tk-m-n", L("청크", "Chunks"), s.chunks, L("개", "chunks")) + "</div>";
  }

  function usageLine() {
    if (RUN.error) return RUN.error;
    var u = RUN.usage; if (!u) return "";
    return '<span class="tk-u">prompt <b>' + fmt(u.prompt) + "</b></span><span class=\"tk-u\">cached <b>" + fmt(u.cached) + "</b></span>" +
      '<span class="tk-u">completion <b>' + fmt(u.completion) + "</b></span><span class=\"tk-u\">reasoning <b>" + fmt(u.reasoning) + "</b></span>" +
      '<span class="tk-u">total <b>' + fmt(u.total) + "</b></span>";
  }

  function rawLast() {
    if (!MSG || !A.trace) return "";
    var tr = A.trace().filter(function (x) { return /\/v1\/chat\/completions$/.test(x.url || ""); });
    if (!tr.length) return '<p class="v2-note">' + esc(L("보내기를 누르면 실제 요청·응답 원문(SSE)이 여기에 보입니다.", "Press Send to see the raw request and response (SSE) here.")) + "</p>";
    return MSG.render(tr[tr.length - 1], { title: L("마지막 호출 원문", "Last call, raw"), layout: "split" });
  }

  async function render(TK) {
    var root = $("v2-token-root"); if (!root) return;
    var tid = tenant();
    var r = await Promise.all([A.apiKeys(), A.models(TK.key || null), A.quotas(tid), A.usage(tid), A.slo(null, SLOW)]);
    var keys = r[0].data || [], quotas = r[2].data || [], N = V.usage(r[3].data), S = V.slo(r[4]);
    var mLive = r[1].live && !r[1].error;
    var models = mLive ? (r[1].data || []).map(function (m) { return m.id; }) : [];
    if (!models.length && r[4].live) S.rows.forEach(function (x) { if (x.model && models.indexOf(x.model) < 0) models.push(x.model); });
    if (!models.length) models = (r[1].data || []).map(function (m) { return m.id; });
    if (PRESET) { TK.model = PRESET; PRESET = null; }
    if (TK.model && models.indexOf(TK.model) < 0) models.unshift(TK.model);
    if (!TK.model && models[0]) TK.model = models[0];
    var qi = quotas.find(function (q) { return q.tier === "interactive"; }) || quotas[0] || {};
    LAST = { keys: keys.length, total: N.total };

    var flow = F ? '<section class="panel tk-flow" aria-label="' + esc(L("토큰 API 흐름", "Token API flow")) + '">' +
      flowHtml() + "</section>" : "";

    var keyRows = keys.map(function (k) {
      return "<tr><td class='id'>" + esc(k.key_id) + "</td><td>" + esc(k.name) + "</td><td class='id'>" + esc(k.prefix || "") +
        "</td><td>" + U.when(k.created_at) + "</td><td>" + U.st(k.state || (k.revoked ? "revoked" : "active")) +
        "</td><td>" + (canWrite() ? '<button type="button" class="btn-ghost" data-v2-revoke="' + esc(k.key_id) + '" aria-label="' + esc(L("키 폐기 ", "Revoke key ") + k.key_id) + '">' + esc(L("폐기", "Revoke")) + "</button>" : "") + "</td></tr>";
    });
    var newKey = TK.secret ? '<p class="v2-note tk-secret" role="status"><b>' + esc(L("새 키 (한 번만 표시)", "New key (shown once)")) + ':</b> <code class="id">' +
      esc(TK.secret) + '</code> <button type="button" class="btn" data-v2-usekey="1">' + esc(L("플레이그라운드에 사용", "Use in playground")) + "</button></p>" : "";
    var keysP = U.panel(L("① API 키", "① API keys"), U.src(r[0]),
      (canWrite() ? '<div class="v2-row">' + U.field("v2-key-name", L("키 이름", "Key name"), '<input id="v2-key-name" placeholder="prod-backend" maxlength="40">') +
        '<button type="button" class="btn" id="v2-key-create">' + esc(L("+ 키 발급", "+ Issue key")) + "</button></div>" : "") + newKey +
      U.table([L("ID", "ID"), L("이름", "Name"), L("접두어", "Prefix"), L("발급", "Created"), L("상태", "State"), ""], keyRows, L("발급된 키 없음", "No keys")) +
      '<p class="v2-note">' + esc(L("키는 발급 때 한 번만 보입니다. 호출은 Authorization: Bearer <키>.", "The key is shown only once. Call with Authorization: Bearer <key>.")) + "</p>");

    var modelOpts = models.map(function (m) { return '<option value="' + esc(m) + '"' + (m === TK.model ? " selected" : "") + ">" + esc(m) + "</option>"; }).join("");
    var play = U.panel(L("② 스트리밍 플레이그라운드", "② Streaming playground"), "POST /v1/chat/completions · " + U.src(mLive ? r[1] : r[4]),
      '<div class="v2-row">' +
      U.field("v2-pg-key", L("API 키 (Bearer)", "API key (Bearer)"), '<input id="v2-pg-key" type="password" autocomplete="off" value="' + esc(TK.key) + '" placeholder="nc_sk_…">') +
      U.field("v2-pg-model", L("모델", "Model"), '<select id="v2-pg-model">' + modelOpts + "</select>") +
      U.field("v2-pg-tier", L("등급", "Tier"), '<select id="v2-pg-tier"><option value="interactive"' + (TK.tier === "interactive" ? " selected" : "") +
        '>interactive</option><option value="batch"' + (TK.tier === "batch" ? " selected" : "") + ">batch</option></select>") +
      U.field("v2-pg-max", "max_tokens", '<input id="v2-pg-max" type="number" min="1" max="8192" value="' + esc(TK.max) + '">') +
      '<div class="v2-f"><label for="v2-pg-stream">stream</label><input id="v2-pg-stream" type="checkbox"' + (TK.stream ? " checked" : "") + "></div></div>" +
      U.field("v2-pg-prompt", L("메시지 (user) — Ctrl/⌘+Enter 로 보내기", "Message (user) — Ctrl/⌘+Enter to send"),
        '<textarea id="v2-pg-prompt" rows="3">' + esc(TK.prompt || L("NVL72 랙 한 대의 GPU 수는?", "How many GPUs are in one NVL72 rack?")) + "</textarea>") +
      '<div class="v2-row tk-send"><button type="button" class="btn" id="v2-pg-send"' + (TK.busy ? " disabled" : "") + ">" +
      esc(TK.busy ? L("생성 중…", "Generating…") : L("보내기", "Send")) + "</button>" + liveMeter() + "</div>" +
      '<div class="v2-out tk-out" id="v2-pg-out" aria-live="polite" aria-label="' + esc(L("응답 (토큰이 도착하는 대로 표시)", "Response (tokens appear as they arrive)")) + '"></div>' +
      '<p class="v2-note tk-meta" id="v2-pg-meta">' + usageLine() + "</p>" +
      '<div id="tk-raw">' + rawLast() + "</div>");

    var Nl = N.lines.map(function (l) {
      return "<tr><td class='id'>" + esc(l.model) + "</td><td>" + esc(l.tier || "—") + "</td><td class='num'>" + U.big(l.input) + "</td><td class='num'>" +
        U.big(l.cached) + "</td><td class='num'>" + U.big(l.output) + "</td><td class='num'>" + U.big(l.reasoning) + "</td><td class='num'>" + fmt(l.requests) + "</td></tr>";
    });
    var b = N.byType;
    var usage = U.panel(L("③ 사용량 (토큰 유형별)", "③ Usage by token type"), U.src(r[3]),
      (K ? K.stack([{ label: "input", value: b.input, tone: "c1" }, { label: "cached", value: b.cached, tone: "ok" }, { label: "output", value: b.output, tone: "c3" },
        { label: "reasoning", value: b.reasoning, tone: "c4" }], { label: L("이번 달 토큰 구성", "This month's token mix"), unit: "tokens" }) : "") +
      U.table([L("모델", "Model"), L("등급", "Tier"), "#input", "#cached", "#output", "#reasoning", L("#요청", "#Requests")], Nl, L("토큰 사용 없음", "No token usage")) +
      '<p class="v2-note">' + esc(L("cached 는 KV 캐시(G1 HBM~G4 VAST)에서 읽은 입력 토큰으로, 청구서에 input 보다 싼 별도 행으로 붙습니다.",
        "cached = input tokens read from the KV cache (G1 HBM to G4 VAST); billed on their own, cheaper invoice line.")) + "</p>");

    var qcards = quotas.map(function (q) {
      return K ? '<div class="tk-q"><b class="tk-qt">' + esc(q.tier) + "</b>" +
        K.target({ label: "TPM", value: q.used_tpm || 0, max: q.tpm || 1, target: q.tpm, unit: "tok/min", lowerBetter: true }) +
        K.target({ label: "RPM", value: q.used_rpm || 0, max: q.rpm || 1, target: q.rpm, unit: "req/min", lowerBetter: true }) +
        '<span class="tk-qs">' + esc(L("월 상한 ", "Monthly cap ")) + (q.monthly_token_cap ? U.big(q.monthly_token_cap) : "—") + "</span></div>" : "";
    }).join("");
    var quota = U.panel(L("④ 쿼터 · 속도 제한", "④ Quotas · rate limits"), U.src(r[2]),
      '<div class="tk-qgrid">' + (qcards || '<p class="v2-note">' + esc(L("쿼터 없음", "No quotas")) + "</p>") + "</div>" +
      '<p class="v2-note">' + esc(L("한도 초과 시 429 rate_limit_exceeded 와 Retry-After 헤더가 옵니다.", "Over the limit the API returns 429 rate_limit_exceeded with a Retry-After header.")) + "</p>");

    var curl = "curl " + A.base() + "/v1/chat/completions \\\n  -H \"Authorization: Bearer $NEOCLOUD_API_KEY\" \\\n  -H \"Content-Type: application/json\" \\\n" +
      "  -d '{\"model\":\"" + (TK.model || "llama-3.3-70b-instruct") + "\",\"stream\":true,\"messages\":[{\"role\":\"user\",\"content\":\"hello\"}]}'";
    var sdk = "from openai import OpenAI\nclient = OpenAI(base_url=\"" + A.base() + "/v1\", api_key=os.environ[\"NEOCLOUD_API_KEY\"])";
    var ex = U.panel(L("예제", "Examples"), "OpenAI " + L("호환", "compatible"),
      '<div class="v2-out" aria-label="curl">' + esc(curl) + '</div><div class="v2-out" style="margin-top:8px" aria-label="Python SDK">' + esc(sdk) + "</div>");

    root.innerHTML = (NC.v2demo ? NC.v2demo.host("token-api") : "") +
      '<div class="tk-head"><h2 class="tk-h">' + esc(L("토큰 API — OpenAI 호환 추론", "Token API — OpenAI-compatible inference")) + '</h2><code class="tk-base">' + esc(A.base()) + "/v1</code>" +
      '<a class="btn-ghost tk-mkt" href="#/marketplace">' + esc(L("마켓플레이스에서 모델 배포 →", "Deploy a model from the marketplace →")) + "</a></div>" +
      sloTiles(S, r[4]) + usageTiles(N, qi) + flow +
      '<div class="tk-cols">' + keysP + play + "</div>" + '<div class="tk-cols">' + usage + quota + "</div>" + ex;
  }

  /* 스트리밍 호출 — 토큰(청크)이 도착하는 대로 칩으로 붙이고 TTFT·TPOT·tokens/s 를 실측한다 */
  async function send(TK) {
    if (!TK.prompt || !TK.prompt.trim()) return U.toast(L("메시지를 입력하세요", "Enter a message"), "warn");
    var out = $("v2-pg-out"), meta = $("v2-pg-meta"), btn = $("v2-pg-send");
    TK.busy = true; RUN = { stats: null, usage: null, live: false, error: null };
    if (btn) { btn.disabled = true; btn.textContent = L("생성 중…", "Generating…"); }
    if (out) { out.textContent = ""; out.setAttribute("aria-busy", "true"); }
    if (meta) meta.textContent = "";
    var t0 = performance.now(), marks = [], pend = false, anim = !reduced();
    function paint() {
      pend = false;
      var s = V.stream(t0, marks); RUN.stats = s;
      var m = $("tk-meter"); if (m) m.outerHTML = liveMeter();
    }
    var cb = { onDelta: function (d) {
      marks.push(performance.now());
      if (out) { var sp = document.createElement("span"); sp.className = "tk-tok" + (anim ? " tk-in" : ""); sp.textContent = d; out.appendChild(sp); }
      if (!pend) { pend = true; requestAnimationFrame(paint); }
    } };
    var body = { model: TK.model, stream: TK.stream, max_tokens: TK.max, service_tier: TK.tier, messages: [{ role: "user", content: TK.prompt }] };
    var res = await A.chat(body, TK.key || null, cb), note = "";
    /* 게이트웨이에 닿지 못하면(네트워크·CORS) 모의 스트림은 모의 카탈로그 모델만 안다 — 첫 모의 모델로 다시 보여 준다 */
    var mm = A._mock && A._mock.models && A._mock.models[0];
    if (!res.live && res.status === 404 && mm && mm.id !== body.model) {
      body.model = mm.id; t0 = performance.now(); marks = [];
      res = await A.chat(body, null, cb);
      note = '<span class="tk-u">' + esc(L("게이트웨이 연결 실패 — 모의 스트림", "Gateway unreachable — mock stream") + " (" + mm.id + ")") + "</span>";
    }
    TK.busy = false;
    if (out) out.removeAttribute("aria-busy");
    if (btn) { btn.disabled = false; btn.textContent = L("보내기", "Send"); }
    RUN.live = !!res.live;
    if (res.error) {
      RUN.error = U.st("failed", String(res.status || "") + " " + (res.error_type || "")) + " " + esc(res.error) +
        (res.retry_after ? " · Retry-After " + esc(res.retry_after) + "s" : "") + " · x-request-id <span class='id'>" + esc(res.request_id || "") + "</span>";
    } else {
      RUN.usage = V.usageTokens(res.usage);
      RUN.stats = V.stream(t0, marks, RUN.usage.completion || null);
    }
    var m = $("tk-meter"); if (m) m.outerHTML = liveMeter();
    if (meta) meta.innerHTML = note + (res.error ? "" : (res.live ? U.src({ live: true, src: "/v1/chat/completions" }) : U.src({ live: false })) + " ") + usageLine() +
      (res.error ? "" : " · x-request-id <span class='id'>" + esc(res.request_id || "") + "</span>" +
        (res.ratelimit && res.ratelimit.tokens != null ? " · " + esc(L("남은 토큰 ", "remaining tokens ")) + esc(res.ratelimit.tokens) : "") +
        (res.finish_reason ? " · finish " + esc(res.finish_reason) : ""));
    var raw = $("tk-raw"); if (raw) raw.innerHTML = rawLast();
    var fl = document.querySelector("#v2-token-root .tk-flow"); if (fl && F) fl.innerHTML = flowHtml();
  }

  /* 마켓플레이스 배포 → 플레이그라운드 모델 미리 선택 */
  function preset(model) { PRESET = model || null; }

  NC.tokenUI = { render: render, send: send, preset: preset, _run: function () { return RUN; } };
})();
