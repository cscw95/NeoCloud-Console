/* v2 토큰 API 쇼케이스 — 데이터 정규화 도우미 (고객 #/token · 운영 #/v2-token · 마켓플레이스 배포 흐름).
   UMD: 브라우저는 NC.tokenViz, node 는 require("customer/token-viz.js") 로 테스트.
   입력 형식(원본 기준):
   - SLO: NOCP GET /api/v1/token/slo?window=초 → {target, deployments:[{model, deployment, ttft_p99_ms, tpot_p99_ms,
     served_tokens_per_s, power_kw, tokens_per_s_per_mw, breach}]} (AI-Infra /dynamo/v1/stats 원본), mock 은 단일 모델 객체.
   - usage: NOCP GET /api/v1/metering/usage → 라이브는 token_lines 가 token_type 행({token_type, quantity, events}),
     mock 은 모델 행({input, cached, output, reasoning, requests}). 둘 다 같은 모양으로 맞춘다.
   - OpenAI usage: usage.prompt_tokens_details.cached_tokens · completion_tokens_details.reasoning_tokens (평면 필드는 하위 호환만).
   - KV 계층: NOCP 데모 러너 f33-kv-tiers 실행 기록(GET /api/v1/demo/runs/{id}) 의 단계 응답 =
     AI-Infra /dynamo/v1/kv/tiers (Dynamo KVBM G1 HBM → G2 host → G3 disk → G4 VAST) + /dynamo/v1/generate kv_hit_tier.
   SLO 목표: TTFT p99 ≤ 2 s, TPOT p99 ≤ 50 ms (계약 F01, NOCP SLO_TARGET). */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.document) { root.NC = root.NC || {}; root.NC.tokenViz = api; }
})(typeof window !== "undefined" ? window : globalThis, function () {
  var SLO = { ttft_p99_ms: 2000, tpot_p99_ms: 50 };
  var TYPES = ["input", "cached", "output", "reasoning"];
  var TIERS = ["G1", "G2", "G3", "G4"];
  var MEDIUM = { G1: "HBM", G2: "LPDDR5X", G3: "NVMe", G4: "VAST Data" };

  function num(v) { return v == null || v === "" || isNaN(+v) ? null : +v; }
  function round(v, d) { if (v == null) return null; var p = Math.pow(10, d || 0); return Math.round(v * p) / p; }

  /* OpenAI usage → {prompt, cached, completion, reasoning, total} */
  function usageTokens(u) {
    u = u || {};
    var pd = u.prompt_tokens_details || {}, cd = u.completion_tokens_details || {};
    var cached = num(pd.cached_tokens); if (cached == null) cached = num(u.cached_tokens);
    var reas = num(cd.reasoning_tokens); if (reas == null) reas = num(u.reasoning_tokens);
    var p = num(u.prompt_tokens) || 0, c = num(u.completion_tokens) || 0;
    return { prompt: p, cached: cached || 0, completion: c, reasoning: reas || 0, total: num(u.total_tokens) != null ? +u.total_tokens : p + c };
  }

  /* /metering/usage (라이브·mock) → {period, byType, lines:[{model, tier, input, cached, output, reasoning, requests}], total, cachedShare} */
  function usage(use) {
    use = use || {};
    var by = {}, rows = {}, order = [];
    TYPES.forEach(function (k) { by[k] = num((use.tokens_by_type || {})[k]) || 0; });
    (use.token_lines || []).forEach(function (l) {
      var key = (l.model || "—") + "|" + (l.tier || "");
      if (!rows[key]) { rows[key] = { model: l.model || "—", tier: l.tier || "", input: 0, cached: 0, output: 0, reasoning: 0, requests: 0 }; order.push(key); }
      var r = rows[key];
      if (l.token_type) {
        if (TYPES.indexOf(l.token_type) >= 0) r[l.token_type] += num(l.quantity) || 0;
        r.requests = Math.max(r.requests, num(l.events) || 0);
      } else {
        TYPES.forEach(function (k) { r[k] += num(l[k]) || 0; });
        r.requests += num(l.requests) || 0;
      }
    });
    var lines = order.map(function (k) { return rows[k]; });
    var sumBy = TYPES.reduce(function (s, k) { return s + by[k]; }, 0);
    if (!sumBy && lines.length) TYPES.forEach(function (k) { by[k] = lines.reduce(function (s, l) { return s + l[k]; }, 0); });
    var total = TYPES.reduce(function (s, k) { return s + by[k]; }, 0);
    var promptSide = by.input + by.cached;
    return { period: use.period || "", byType: by, lines: lines, total: total,
      cachedShare: promptSide ? round(by.cached / promptSide * 100, 1) : 0 };
  }

  /* /token/slo → {target, rows, fleet:{ttft, tpot, tps, kw, tpsPerMw, breach}, live} */
  function slo(res) {
    var d = (res && res.data) || res || {};
    var target = { ttft_p99_ms: num((d.target || {}).ttft_p99_ms) || SLO.ttft_p99_ms, tpot_p99_ms: num((d.target || {}).tpot_p99_ms) || SLO.tpot_p99_ms };
    var src = Array.isArray(d.deployments) ? d.deployments : (d.model || d.ttft_p99_ms != null ? [d] : []);
    var rows = src.map(function (x) {
      var tps = num(x.served_tokens_per_s), kw = num(x.power_kw), per = num(x.tokens_per_s_per_mw);
      if (per == null && tps != null && kw) per = round(tps / (kw / 1000), 1);
      var ttft = num(x.ttft_p99_ms), tpot = num(x.tpot_p99_ms);
      return { model: x.model || "—", deployment: x.deployment || x.model || "—", state: x.state || "", source: x.source || "",
        requests: num(x.requests), ttft: ttft, tpot: tpot, tps: tps, kw: kw, tpsPerMw: per,
        breach: x.breach != null ? !!x.breach : (ttft != null && ttft > target.ttft_p99_ms) || (tpot != null && tpot > target.tpot_p99_ms) };
    });
    function mx(k) { var v = rows.map(function (r) { return r[k]; }).filter(function (v) { return v != null; }); return v.length ? Math.max.apply(null, v) : null; }
    var tps = rows.reduce(function (s, r) { return s + (r.tps || 0); }, 0), kw = rows.reduce(function (s, r) { return s + (r.tps != null ? r.kw || 0 : 0); }, 0);
    return { target: target, rows: rows,
      fleet: { ttft: num(d.ttft_p99_ms) != null && Array.isArray(d.deployments) ? +d.ttft_p99_ms : mx("ttft"),
        tpot: num(d.tpot_p99_ms) != null && Array.isArray(d.deployments) ? +d.tpot_p99_ms : mx("tpot"),
        tps: tps || null, kw: kw || null, tpsPerMw: kw ? round(tps / (kw / 1000), 1) : null,
        breach: rows.some(function (r) { return r.breach; }) } };
  }

  /* /token/deployments → {deployment: 용량 tokens/s/MW} (capacity_tokens_per_s ÷ MW) */
  function capPerMw(deps) {
    var out = {};
    (deps || []).forEach(function (d) {
      var c = num(d.capacity_tokens_per_s), kw = num(d.power_kw);
      if (c != null && kw) out[d.deployment || d.model] = round(c / (kw / 1000), 1);
    });
    return out;
  }

  /* 스트리밍 측정 — t0(요청 시각), marks:[각 delta 도착 시각], n(완료 토큰 수) → TTFT·TPOT·tokens/s */
  function stream(t0, marks, n) {
    marks = marks || [];
    if (!marks.length) return { ttft: null, tpot: null, tps: null, chunks: 0 };
    var first = marks[0], last = marks[marks.length - 1];
    var toks = n != null && n > 0 ? n : marks.length;
    var tpot = toks > 1 ? (last - first) / (toks - 1) : null;
    var dur = (last - t0) / 1000;
    return { ttft: round(first - t0, 0), tpot: tpot != null ? round(tpot, 1) : null, tps: dur > 0 ? round(toks / dur, 1) : null, chunks: marks.length };
  }

  /* f33-kv-tiers 데모 실행 기록 → {tiers:[{tier, medium, capBlocks, usedBlocks, util, enabled}], hits:{G1..G4}, miss, prompt, cached, ratio, runId, at} */
  function kvFromRun(run) {
    if (!run || !Array.isArray(run.steps)) return null;
    var tiers = null, hits = { G1: 0, G2: 0, G3: 0, G4: 0 }, prompt = 0, cached = 0, reqs = [];
    run.steps.forEach(function (s) {
      var b = s.response && s.response.body;
      if (!b || typeof b !== "object") return;
      if (Array.isArray(b.deployments) && b.tiers && !tiers) {
        var dep = b.deployments[0] || {};
        tiers = (dep.tiers || []).map(function (t) {
          return { tier: t.tier, medium: t.medium || MEDIUM[t.tier], capBlocks: num(t.capacity_blocks), usedBlocks: num(t.used_blocks),
            util: num(t.utilization), enabled: t.enabled !== false, capGb: num(t.capacity_gb) };
        });
      }
      if (b.usage && (s.request || {}).url && /\/generate|\/chat\/completions/.test(s.request.url)) {
        var u = usageTokens(b.usage);
        prompt += u.prompt; cached += u.cached;
        if (b.kv_hit_tier && hits[b.kv_hit_tier] != null && u.cached) hits[b.kv_hit_tier] += u.cached;
        reqs.push({ step: s.id, title_ko: s.title_ko, title_en: s.title_en, tier: b.kv_hit_tier || null, cached: u.cached, prompt: u.prompt });
      }
    });
    return { runId: run.id, at: run.finished_at || run.created_at, verdict: run.verdict || run.state, tiers: tiers || [], hits: hits,
      miss: Math.max(0, prompt - cached), prompt: prompt, cached: cached, ratio: prompt ? round(cached / prompt * 100, 1) : 0, requests: reqs };
  }

  /* KV 모의값 — 백엔드 미기동 시 (f33 실행 결과와 같은 모양) */
  function kvMock() {
    return { runId: null, at: null, verdict: "mock", mock: true,
      tiers: [{ tier: "G1", medium: "HBM", capBlocks: 150, usedBlocks: 125, util: 0.8333, enabled: true },
        { tier: "G2", medium: "LPDDR5X", capBlocks: 150, usedBlocks: 125, util: 0.8333, enabled: true },
        { tier: "G3", medium: "NVMe", capBlocks: 23437500, usedBlocks: 250, util: 0, enabled: true },
        { tier: "G4", medium: "VAST Data", capBlocks: 38146972, usedBlocks: 375, util: 0, enabled: true }],
      hits: { G1: 0, G2: 2000, G3: 2000, G4: 2000 }, miss: 7200, prompt: 13200, cached: 6000, ratio: 45.5, requests: [] };
  }

  /* 고객 토큰 API 흐름(키 → 호출 → usage → 미터링 → 청구) — NC.flow.timeline 단계 */
  function customerFlow(st) {
    st = st || {};
    var hasKey = (st.keys || 0) > 0, called = !!st.called, metered = (st.total || 0) > 0;
    function s(done, active) { return done ? "done" : active ? "active" : "pending"; }
    return [
      { id: "key", label: { ko: "API 키 발급", en: "Issue API key" }, sub: { ko: "POST /api/v1/api-keys", en: "POST /api/v1/api-keys" }, status: s(hasKey, !hasKey) },
      { id: "call", label: { ko: "스트리밍 호출", en: "Streaming call" }, sub: { ko: "POST /v1/chat/completions", en: "POST /v1/chat/completions" },
        status: st.callFailed ? "fail" : s(called || metered, hasKey && !called) },
      { id: "usage", label: { ko: "usage · 캐시", en: "usage · cache" }, sub: { ko: "prompt_tokens_details.cached_tokens", en: "prompt_tokens_details.cached_tokens" },
        status: s(called || metered, false) },
      { id: "meter", label: { ko: "미터링", en: "Metering" }, sub: { ko: "토큰 유형별 이벤트", en: "events by token type" }, status: s(metered, called && !metered) },
      { id: "bill", label: { ko: "청구서 행", en: "Invoice line" }, sub: { ko: "input · cached · output 별도", en: "input · cached · output split" },
        status: st.invoiced ? "done" : metered ? "active" : "pending" }];
  }

  /* 마켓플레이스 원클릭 배포 → 토큰 API (DGD 생성 → Ready → /v1/chat/completions) — NC.flow.timeline 단계 */
  function deployFlow(dep) {
    dep = dep || {};
    var stt = String(dep.state || "").toLowerCase();
    var ready = /ready|running|success/.test(stt), failed = /fail|error/.test(stt);
    var created = !!dep.id;
    return [
      { id: "pick", label: { ko: "모델·티어 선택", en: "Pick model · tier" }, sub: dep.model ? { ko: dep.model + " · " + (dep.tier || ""), en: dep.model + " · " + (dep.tier || "") } : null, status: created ? "done" : "active" },
      { id: "dgd", label: { ko: "DGD 생성", en: "DGD created" }, sub: { ko: "DynamoGraphDeployment", en: "DynamoGraphDeployment" }, status: created ? "done" : "pending" },
      { id: "ready", label: { ko: "엔진 Ready", en: "Engine Ready" }, sub: dep.state ? { ko: String(dep.state), en: String(dep.state) } : null,
        status: failed ? "fail" : ready ? "done" : created ? "active" : "pending" },
      { id: "route", label: { ko: "토큰 API 등록", en: "On the token API" }, sub: { ko: "model=" + ((dep.endpoint || {}).model || dep.model || "…"), en: "model=" + ((dep.endpoint || {}).model || dep.model || "…") },
        status: ready ? "done" : "pending" },
      { id: "try", label: { ko: "플레이그라운드 시험", en: "Try in playground" }, sub: { ko: "#/token", en: "#/token" }, status: ready ? "active" : "pending" }];
  }

  return { SLO: SLO, TYPES: TYPES, TIERS: TIERS, MEDIUM: MEDIUM, usageTokens: usageTokens, usage: usage, slo: slo, capPerMw: capPerMw,
    stream: stream, kvFromRun: kvFromRun, kvMock: kvMock, customerFlow: customerFlow, deployFlow: deployFlow };
});
