/* v2 쇼케이스 — 운영 토큰 API 화면 #/v2-token (F01·F02·F04·F33·F32).
   ops/v2.js 의 renderToken 이 NC.tokenOps 로 위임한다(쿼터 컨트롤 id v2-q-* 그대로 — 저장·감축 클릭은 ops/v2.js 가 처리).
   구성: 함대 핵심 지표(TTFT·TPOT p99 vs SLO 2 s / 50 ms, tokens/s/MW, KV 캐시 적중) → 배포별 SLO 밴드 → 전력 효율 순위
   (tokens/s/MW, 용량 대비) → KV 계층(G1 HBM → G2 LPDDR5X → G3 NVMe → G4 VAST) 적중·점유·요청 스윔레인 → 배포 · 쿼터 · 계측 대조.
   데이터: NOCP /api/v1/token/{slo,deployments,quotas}, /api/v1/metering/reconcile, KV 는 NOCP 데모 러너의 최근 f33-kv-tiers 실행
   (/api/v1/demo/runs — 단계 응답 = AI-Infra /dynamo/v1/kv/tiers 원문). 실패 시 MOCK 배지. */
(function () {
  var NC = window.NC = window.NC || {};
  var A = NC.v2, U = NC.v2ui, V = NC.tokenViz;
  if (!A || !U || !V) return;
  var L = U.L, esc = U.esc, fmt = U.fmt, $ = U.$;
  var K = NC.kpi, F = NC.flow, MSG = NC.msg;
  var KV_SCN = "f33-kv-tiers";
  var KVS = { busy: false, err: null };

  async function demoGet(path) {
    try {
      var r = await fetch(A.base() + "/api/v1/demo" + path);
      if (!r.ok) return { live: true, error: "HTTP " + r.status, status: r.status };
      return { live: true, data: await r.json(), src: "/api/v1/demo" + path.split("?")[0] };
    } catch (e) { return { live: false, error: String(e && e.message || e) }; }
  }
  /* 최근 f33-kv-tiers 실행 → V.kvFromRun. 없으면 null (MOCK) */
  async function kvLoad() {
    var runs = await demoGet("/runs");
    if (!runs.data || !Array.isArray(runs.data)) return { res: runs, kv: null, run: null };
    var last = runs.data.find(function (x) { return x.scenario_id === KV_SCN && x.state === "done"; });
    if (!last) return { res: runs, kv: null, run: null };
    var one = await demoGet("/runs/" + encodeURIComponent(last.run_id || last.id));
    return { res: one, kv: one.data ? V.kvFromRun(one.data) : null, run: one.data };
  }
  async function kvRun() {
    KVS.busy = true; KVS.err = null; render();
    try {
      var r = await fetch(A.base() + "/api/v1/demo/scenarios/" + KV_SCN + "/run?wait=true", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!r.ok) KVS.err = "HTTP " + r.status;
    } catch (e) { KVS.err = String(e && e.message || e); }
    KVS.busy = false;
    U.toast(KVS.err ? L("KV 시연 실패: ", "KV demo failed: ") + KVS.err : L("KV 계층 시연 완료 (f33)", "KV tier demo finished (f33)"), KVS.err ? "warn" : "");
    render();
  }

  function fleetTiles(S, sloRes, kv) {
    if (!K) return "";
    var f = S.fleet, t = S.target;
    return K.grid([
      K.target({ label: { ko: "함대 TTFT p99", en: "Fleet TTFT p99" }, value: f.ttft, target: t.ttft_p99_ms, band: [0, t.ttft_p99_ms],
        max: Math.max(t.ttft_p99_ms * 1.3, (f.ttft || 0) * 1.1), unit: "ms", lowerBetter: true, sub: { ko: "배포 중 최댓값 · SLO ≤ 2 s", en: "worst deployment · SLO ≤ 2 s" } }),
      K.target({ label: { ko: "함대 TPOT p99", en: "Fleet TPOT p99" }, value: f.tpot, target: t.tpot_p99_ms, band: [0, t.tpot_p99_ms],
        max: Math.max(t.tpot_p99_ms * 1.3, (f.tpot || 0) * 1.1), unit: "ms", digits: 1, lowerBetter: true, sub: { ko: "배포 중 최댓값 · SLO ≤ 50 ms", en: "worst deployment · SLO ≤ 50 ms" } }),
      K.stat({ label: "tokens/s/MW", value: f.tpsPerMw, digits: 0, sub: { ko: fmt(f.tps) + " tok/s ÷ " + fmt(f.kw ? f.kw / 1000 : null, 3) + " MW",
        en: fmt(f.tps) + " tok/s ÷ " + fmt(f.kw ? f.kw / 1000 : null, 3) + " MW" } }),
      K.gauge({ label: { ko: "KV 캐시 적중 (입력 토큰)", en: "KV cache hit (input tokens)" }, value: kv.ratio, min: 0, max: 100, unit: "%", digits: 1, size: 140,
        sub: kv.mock ? { ko: "모의값 — f33 시연을 실행하세요", en: "mock — run the f33 demo" } : { ko: "cached " + fmt(kv.cached) + " / prompt " + fmt(kv.prompt), en: "cached " + fmt(kv.cached) + " / prompt " + fmt(kv.prompt) } })
    ], { min: 220 }) + '<p class="tk-src">' + U.src(sloRes) + " · " + esc(L("창 1시간", "1 h window")) + "</p>";
  }

  function sloBands(S) {
    var t = S.target;
    var rows = S.rows.map(function (r) {
      return '<li class="tk-dep' + (r.breach ? " tk-breach" : "") + '"><div class="tk-dh"><b class="id">' + esc(r.deployment) + '</b><span class="tk-dm">' + esc(r.model) +
        "</span>" + U.st(r.breach ? "breach" : "ok", r.breach ? L("SLO 위반", "SLO breach") : L("SLO 안", "within SLO")) +
        (r.source ? '<span class="tk-dm">' + esc(r.source === "observed" ? L("실측", "observed") : r.source === "model" ? L("모델값", "modelled") : r.source) + "</span>" : "") + "</div>" +
        (K ? K.target({ label: "TTFT p99", value: r.ttft, target: t.ttft_p99_ms, band: [0, t.ttft_p99_ms], max: Math.max(t.ttft_p99_ms * 1.3, (r.ttft || 0) * 1.1), unit: "ms", lowerBetter: true }) +
          K.target({ label: "TPOT p99", value: r.tpot, target: t.tpot_p99_ms, band: [0, t.tpot_p99_ms], max: Math.max(t.tpot_p99_ms * 1.3, (r.tpot || 0) * 1.1), unit: "ms", digits: 1, lowerBetter: true }) : "") +
        '<span class="tk-qs">' + esc(L("요청 ", "requests ")) + fmt(r.requests) + "</span></li>";
    }).join("");
    return U.panel(L("배포별 SLO 밴드 (p99)", "SLO bands by deployment (p99)"), esc(L("초록 밴드 = 허용 구간, 눈금 = 목표", "green band = allowed range, tick = target")),
      '<ul class="tk-deps">' + (rows || '<li class="v2-note">—</li>') + "</ul>");
  }

  /* tokens/s/MW 순위 — 막대 = 서빙 중 처리량 ÷ 배포 전력. 용량(capacity_tokens_per_s)은 같은 전력 기준이 아니라 비율로만 보인다. */
  function efficiency(S, caps) {
    var rows = S.rows.filter(function (r) { return r.tpsPerMw != null; }).sort(function (a, b) { return b.tpsPerMw - a.tpsPerMw; });
    var mx = rows.reduce(function (m, r) { return Math.max(m, r.tpsPerMw); }, 0) || 1;
    var fleet = S.fleet.tpsPerMw;
    var bars = rows.map(function (r) {
      var cap = caps[r.deployment], use = cap && r.kw ? Math.round(r.tps / (cap * r.kw / 1000) * 100) : null;
      return '<li class="tk-eff">' + (K ? K.target({ label: r.deployment, value: r.tpsPerMw, max: mx * 1.05, target: fleet, unit: "tok/s/MW",
        sub: { ko: fmt(r.tps) + " tok/s · " + fmt(r.kw, 1) + " kW" + (use != null ? " · 용량 사용 " + use + "%" : "") + " · 눈금 = 함대 평균",
          en: fmt(r.tps) + " tok/s · " + fmt(r.kw, 1) + " kW" + (use != null ? " · " + use + "% of capacity" : "") + " · tick = fleet average" } }) : "") + "</li>";
    }).join("");
    return U.panel(L("전력 효율 — tokens/s per MW", "Power efficiency — tokens/s per MW"),
      esc(L("서빙 중 처리량 ÷ 배포 전력", "served throughput ÷ deployment power")),
      '<ol class="tk-effs">' + (bars || '<li class="v2-note">' + esc(L("전력 측정값 없음 (MOCK)", "No power readings (MOCK)")) + "</li>") + "</ol>");
  }

  function kvPanel(kvL, kv) {
    var h = kv.hits;
    var stack = K ? K.stack([{ label: "G1 HBM", value: h.G1, tone: "c1" }, { label: "G2 LPDDR5X", value: h.G2, tone: "c2" }, { label: "G3 NVMe", value: h.G3, tone: "c3" },
      { label: "G4 VAST", value: h.G4, tone: "c5" }, { label: L("미적중 (새로 계산)", "miss (recomputed)"), value: kv.miss, tone: "crit" }],
      { label: L("입력 토큰은 어느 계층에서 왔나", "Where input tokens came from"), unit: "tokens" }) : "";
    var trows = kv.tiers.map(function (t) {
      return "<tr><th scope='row'>" + esc(t.tier) + "</th><td>" + esc(t.medium) + "</td><td>" + U.st(t.enabled ? "active" : "revoked", t.enabled ? L("켜짐", "on") : L("꺼짐", "off")) +
        "</td><td class='num'>" + fmt(t.usedBlocks) + "</td><td class='num'>" + U.big(t.capBlocks) + "</td><td>" + U.bar(t.util) + "</td></tr>";
    });
    var lanes = V.TIERS.map(function (t) { return { id: t, label: t + " · " + V.MEDIUM[t] }; }).concat([{ id: "miss", label: L("미적중", "miss") }]);
    var lane = F && kv.requests.length ? F.swimlane(lanes, kv.requests.map(function (q) {
      return { lane: q.tier && q.cached ? q.tier : "miss", label: { ko: q.title_ko || q.step, en: q.title_en || q.step },
        sub: { ko: "cached " + fmt(q.cached) + " / " + fmt(q.prompt), en: "cached " + fmt(q.cached) + " / " + fmt(q.prompt) }, status: q.cached ? "done" : "warn" };
    }), { ariaLabel: L("요청별 KV 적중 계층", "KV hit tier per request"), caption: L("요청 순서대로 — 칸 = 적중 계층", "Requests in order — row = tier hit") }) : "";
    var tierStep = kvL.run && kvL.run.steps ? kvL.run.steps.find(function (s) { return s.id === "tiers"; }) : null;
    var btn = '<button type="button" class="btn" id="tk-kv-run"' + (KVS.busy ? " disabled" : "") + ">" + esc(KVS.busy ? L("실행 중…", "Running…") : L("f33 KV 시연 실행", "Run f33 KV demo")) + "</button>" +
      ' <a class="btn-ghost" href="#/demo-center?scenario=' + KV_SCN + '">' + esc(L("데모 센터에서 단계별 보기", "Step through in demo center")) + "</a>";
    return U.panel(L("KV 캐시 계층 (Dynamo KVBM)", "KV cache tiers (Dynamo KVBM)"),
      (kv.mock ? U.src({ live: false }) : U.src(kvL.res) + ' <span class="v2-path">run ' + esc(kv.runId) + " · " + esc(U.when(kv.at)) + "</span>"),
      '<div class="v2-row">' + btn + "</div>" + stack + lane +
      U.table([L("계층", "Tier"), L("매체", "Medium"), L("상태", "State"), L("#사용 블록", "#Used blocks"), L("#용량 블록", "#Capacity blocks"), L("점유", "Occupancy")], trows, "—") +
      '<p class="v2-note">' + esc(L("G1 이 차면 블록이 G2 → G3 로 내려가고 G4(VAST)는 사이트 공유 계층입니다. 적중 토큰은 usage.prompt_tokens_details.cached_tokens 로 돌아가 청구서에 cached 행으로 붙습니다.",
        "When G1 fills, blocks move down G2 → G3; G4 (VAST) is the site-shared tier. Hit tokens come back as usage.prompt_tokens_details.cached_tokens and bill on the cached line.")) + "</p>" +
      (tierStep && MSG ? MSG.render(tierStep, { title: L("계층 상태 원문 — GET /dynamo/v1/kv/tiers", "Tier state, raw — GET /dynamo/v1/kv/tiers") }) : ""));
  }

  async function render() {
    var root = $("v2-tokenops-root"); if (!root) return;
    var r = await Promise.all([A.deployments(), A.quotas(), A.slo(null, 3600), A.reconcile(), kvLoad()]);
    var deps = r[0].data || [], quotas = r[1].data || [], S = V.slo(r[2]), rec = r[3].data || {}, kvL = r[4];
    var kv = kvL.kv || V.kvMock(), caps = V.capPerMw(deps);

    var depRows = deps.map(function (d) {
      return "<tr><td class='id'>" + esc(d.deployment || d.model) + "</td><td>" + esc(d.model) + "</td><td>" + esc(d.engine || "dynamo") + " · " + esc(d.mode) + "</td><td class='num'>" + fmt(d.prefill_workers) +
        "</td><td class='num'>" + fmt(d.decode_workers) + "</td><td>" + esc((d.racks || []).join(", ")) + "</td><td class='num'>" + fmt(d.gpus) + "</td><td class='num'>" +
        fmt(d.capacity_tokens_per_s) + "</td><td class='num'>" + fmt(d.power_kw, 1) + "</td><td>" + U.st(d.state) + "</td></tr>";
    });
    var qRows = quotas.map(function (q) {
      return "<tr><td class='id'>" + esc(q.tenant_id) + "</td><td>" + esc(q.tier) + "</td><td class='num'>" + U.big(q.tpm) + "</td><td>" + U.bar(q.tpm ? (q.used_tpm || 0) / q.tpm : 0) +
        "</td><td class='num'>" + fmt(q.rpm) + "</td><td>" + U.bar(q.rpm ? (q.used_rpm || 0) / q.rpm : 0) + "</td><td class='num'>" + (q.monthly_token_cap ? U.big(q.monthly_token_cap) : "—") + "</td></tr>";
    });
    var tenants = Array.from(new Set(quotas.map(function (q) { return q.tenant_id; })));
    var tOpts = tenants.map(function (t) { return "<option>" + esc(t) + "</option>"; }).join("");
    var diff = +rec.diff_pct || 0;

    root.innerHTML = (NC.v2demo ? NC.v2demo.host("token-ops") : "") +
      '<div class="tk-head"><h2 class="tk-h">' + esc(L("추론 운영 — SLO · 전력 효율 · KV 캐시", "Inference ops — SLO · power efficiency · KV cache")) + "</h2>" +
      '<a class="btn-ghost tk-mkt" href="#/demo-center?scenario=f32-marketplace-deploy">' + esc(L("마켓플레이스 배포 시연 →", "Marketplace deploy demo →")) + "</a></div>" +
      fleetTiles(S, r[2], kv) +
      '<div class="tk-cols">' + sloBands(S) + efficiency(S, caps) + "</div>" +
      kvPanel(kvL, kv) +
      U.panel(L("엔진 배포 (Dynamo)", "Engine deployments (Dynamo)"), U.src(r[0]),
        U.table([L("배포", "Deployment"), L("모델", "Model"), L("엔진·모드", "Engine · mode"), "#prefill", "#decode", L("랙", "Racks"), "#GPU", L("#용량 tok/s", "#Capacity tok/s"), "#kW", L("상태", "State")], depRows, "—")) +
      U.panel(L("쿼터 (테넌트·등급)", "Quotas (tenant · tier)"), U.src(r[1]),
        U.table([L("테넌트", "Tenant"), L("등급", "Tier"), "#TPM", L("TPM 사용률", "TPM used"), "#RPM", L("RPM 사용률", "RPM used"), L("#월 상한", "#Monthly cap")], qRows, "—") +
        '<div class="v2-row" style="margin-top:10px">' + U.field("v2-q-t", L("테넌트", "Tenant"), '<select id="v2-q-t">' + tOpts + "</select>") +
        U.field("v2-q-tier", L("등급", "Tier"), '<select id="v2-q-tier"><option>interactive</option><option>batch</option></select>') +
        U.field("v2-q-tpm", "TPM", '<input id="v2-q-tpm" type="number" min="1" value="2000000">') + U.field("v2-q-rpm", "RPM", '<input id="v2-q-rpm" type="number" min="1" value="600">') +
        '<button type="button" class="btn" id="v2-q-save">' + esc(L("쿼터 저장", "Save quota")) + "</button>" +
        U.field("v2-q-f", L("감축 배수", "Override factor"), '<input id="v2-q-f" type="number" step="0.1" min="0" max="1" value="0.3">') +
        '<button type="button" class="btn-ghost" id="v2-q-ovr">' + esc(L("batch 감축 주입 (1시간)", "Inject batch override (1 h)")) + "</button></div>") +
      U.panel(L("계측 대조 (게이트웨이 대 엔진)", "Metering reconcile (gateway vs engine)"), U.src(r[3]),
        (K ? K.grid([K.stat({ label: "gateway_tokens", value: rec.gateway_tokens }), K.stat({ label: "engine_tokens", value: rec.engine_tokens }),
          K.stat({ label: "diff_pct", value: diff, unit: "%", digits: 3, target: 0.5, lowerBetter: true, warn: 1 })], { min: 180 }) : "") +
        '<dl class="v2-kv"><dt>' + esc(L("기간", "Period")) + "</dt><dd>" + esc(rec.period) + "</dd><dt>mismatches</dt><dd class='id'>" +
        esc((rec.mismatches || []).join(", ") || "—") + "</dd></dl>");
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("#tk-kv-run");
    if (t && !KVS.busy) kvRun();
  });

  NC.tokenOps = { render: render };
})();
