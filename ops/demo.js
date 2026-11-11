/* 데모 센터 — NOCP 데모 러너(/api/v1/demo/*)로 v2 기능을 끝까지 시연한다.
   - 시나리오 목록(Day 0 구축 · Day 1 개통 · Day 2 운영, 순서 = DEMO-ORDER.md) · 전체 실행/단계 실행/다음 단계/나머지 실행 · 초기화(결정적 시드)
   - Day 0→2 전체 실행: NOCP GET /api/v1/demo/playlist(없으면 내장 표) 순서대로 시나리오 실행과 화면 시연(콘솔 화면 + 자막 카드)을 이어 간다
   - 실시간 단계 타임라인: SSE(/runs/{id}/events) 우선, 실패 시 폴링(GET /runs/{id})
   - 단계마다 나레이션·기대값·검증 결과·요청/응답 요약·원문(펼침)·바뀐 화면 딥링크
   - 보기 전환: 타임라인 | 스윔레인(레인 = 업무 영역, 열 = 단계 순서) + 단계별 요청·응답 원문 뷰어(업스트림 형식 그대로)
   - 진행 막대, 현재 단계 강조, 실행이 끝나면 결과 요약 카드(판정·집계·실패 단계·열어 볼 화면)
   - 발표 모드: 목록·사이드바를 숨기고 큰 글씨 · 단계 띠 · 현재 단계 스포트라이트(토크 트랙 = docs/DEMO.md) ·
     ←/→ 단계 이동(단계 모드에서 → = 다음 단계), Home/End, Esc 해제
   - 흐름 컴포넌트는 design-core 의 NC.flow(shared/flow-timeline.js)가 있으면 그것을 쓰고, 없으면 같은 모양의 로컬 렌더러를 쓴다.
   - KO/EN (러너가 주는 _ko/_en 문자열 + TALK 표). 라이브 전용: NOCP가 없으면 mock 대신 "미연결"을 표시한다.
   라우트 진입은 NC.bus "route" 로 감지 (ops/app.js NC.start 맵 수정 없음).
   브라우저(window.NC.demoCenter)와 node 테스트(module.exports) 양쪽에서 동작한다. */
(function (root, factory) {
  var mod = factory(root);
  if (typeof module === "object" && module.exports) module.exports = mod;
  if (root && root.document) mod.mount(root);
})(typeof window !== "undefined" ? window : globalThis, function (G) {
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
      loadErr: "불러오기 실패", total: "합계",
      showcase: "쇼케이스 8", featureScn: "기능 시나리오", view: "보기", vTimeline: "타임라인", vSwim: "스윔레인",
      progress: "진행", stepOf: "단계", now: "지금", talk: "말할 것", shows: "무엇을 보여주나",
      summary: "결과 요약", attention: "확인할 단계", openScreens: "열어 볼 화면", noAttention: "모든 단계가 통과했습니다.",
      headers: "헤더", body: "본문", status: "상태", noMsg: "이 단계는 HTTP 메시지가 없습니다(내부 호출).",
      area: "영역", swimCap: "레인 = 업무 영역, 열 = 단계 순서. 칩을 누르면 아래에 원문이 열립니다.", prev: "이전", nextFocus: "다음",
      keys: "←/→ 단계 이동 · Esc 발표 모드 끄기", msgOf: "단계 메시지",
      day: ["Day 0 구축", "Day 1 개통", "Day 2 운영"],
      daySub: ["설치·검증, 판매 가능 재고가 되기까지", "고객 가입·주문·서비스 시작", "사용·과금·장애·전력망"],
      other: "기타 시나리오", playAll: "Day 0→2 전체 실행", playStop: "플레이리스트 중지",
      screenOnly: "화면 시연", openScreen: "화면 열기", nextItem: "다음 순서", prevItem: "이전 순서", backDc: "데모 센터로",
      plOf: "순서", plDone: "Day 0→2 시연을 마쳤습니다", plNocp: "NOCP 플레이리스트", plLocal: "기본 순서(DEMO-ORDER)",
      auto: "자동 진행", upNext: "다음", plMissing: "NOCP에 없는 시나리오라 건너뜁니다", plKeys: "→ 다음 순서 · ← 이전 순서 · Esc 중지",
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
      loadErr: "Load failed", total: "total",
      showcase: "Showcase 8", featureScn: "Feature scenarios", view: "View", vTimeline: "Timeline", vSwim: "Swimlane",
      progress: "Progress", stepOf: "Step", now: "now", talk: "Talk track", shows: "What it shows",
      summary: "Result summary", attention: "Steps to check", openScreens: "Screens to open", noAttention: "Every step passed.",
      headers: "Headers", body: "Body", status: "Status", noMsg: "This step has no HTTP message (internal call).",
      area: "Area", swimCap: "Lane = business area, column = step order. Pick a chip to open its raw messages below.", prev: "Previous", nextFocus: "Next",
      keys: "←/→ move between steps · Esc exits presenter", msgOf: "Step messages",
      day: ["Day 0 Build", "Day 1 Onboard", "Day 2 Operate"],
      daySub: ["Install and validate until the racks are sellable inventory", "Customer signup, order and service start", "Usage, billing, faults and the power grid"],
      other: "Other scenarios", playAll: "Run Day 0→2", playStop: "Stop playlist",
      screenOnly: "Screen walkthrough", openScreen: "Open screen", nextItem: "Next item", prevItem: "Previous item", backDc: "Back to Demo Center",
      plOf: "Item", plDone: "Day 0→2 walkthrough finished", plNocp: "NOCP playlist", plLocal: "Default order (DEMO-ORDER)",
      auto: "Auto-advance", upNext: "Up next", plMissing: "Scenario not on this NOCP, skipping", plKeys: "→ next item · ← previous item · Esc stops",
    },
  };
  var STATE_CLS = { waiting: "unknown", running: "warn", passed: "ok", failed: "crit", pending: "info", skipped: "unknown" };
  var VERDICT_CLS = { pass: "ok", fail: "crit", pass_with_pending: "info", running: "warn" };
  var FLOW_ST = { waiting: "pending", running: "active", passed: "done", failed: "fail", pending: "warn", skipped: "skip" };
  var PACE = { fast: 150, normal: 700, slow: 1600 };

  /* 시나리오 소개 토크 트랙 — NOCP docs/DEMO.md §5 "무엇을 보여주나" (KO 원문 + EN 번역). 단계 토크 트랙은 러너 narration_ko/en. */
  var TALK = {
    "a-signup-to-invoice": { ko: "기업 고객이 웹 가입부터 첫 원화 청구서·세금계산서를 받기까지 (Phase 1 DoD 체인 a).",
      en: "A business customer goes from web signup to its first KRW invoice and tax invoice (Phase 1 DoD chain a)." },
    "b-token-api": { ko: "OpenAI SDK 그대로 base_url만 바꿔 호출하고, 같은 요청 ID는 한 번만 청구된다 (DoD 체인 b).",
      en: "Call with the stock OpenAI SDK by changing only base_url; the same request ID is billed once (DoD chain b)." },
    "c-xid-remediation": { ko: "GPU가 버스에서 떨어지면 NVSentinel 흐름대로 자동 교체되고, 가용성 미달분이 다음 청구서에서 빠진다 (DoD 체인 c).",
      en: "When a GPU falls off the bus it is replaced automatically along the NVSentinel flow, and the availability shortfall comes off the next invoice (DoD chain c)." },
    "d-grid-curtailment": { ko: "전력망 감축 요청이 오면 예약 고객 랙은 그대로 두고 토큰 Batch·스팟부터 줄인 뒤 원복·정산한다 (Phase 2 DoD ①).",
      en: "On a grid curtailment request, reserved customer racks stay untouched; token Batch and spot shrink first, then restore and settle (Phase 2 DoD ①)." },
    "e-leak-workload-move": { ko: "트레이 냉각수 누수가 감지되면 해당 노드를 격리하고 NVKE 워크로드를 예비 노드로 옮긴다 (Phase 2 DoD ②).",
      en: "When a tray coolant leak is detected, the node is cordoned and its NVKE workload moves to a spare node (Phase 2 DoD ②)." },
    "f-rack-bringup": { ko: "DCIM 등록부터 판매 가능 재고까지 자동 진행. 케이블이 계획과 다르면 04 LLDP 검증에서 멈춘다 (Phase 2 DoD ③).",
      en: "From DCIM registration to sellable inventory, automatically. If cabling differs from the plan, it stops at the 04 LLDP check (Phase 2 DoD ③)." },
    "g-nvke-clique": { ko: "2랙 노드풀을 만들면 랙 단위 NVLink 클리크·IMEX 도메인이 생기고 kubeconfig가 나온다 (US-04).",
      en: "Creating a 2-rack node pool yields per-rack NVLink cliques and IMEX domains, and a kubeconfig (US-04)." },
    "h-bmaas-baseline": { ko: "v2 이전부터 있던 흐름: 테넌트 → 1랙 주문 → 격리 → 인수 → 계측 → 반납.",
      en: "The flow that predates v2: tenant → 1-rack order → isolation → acceptance → metering → reclaim." },
  };
  function isShowcase(id) { return /^[a-h]-/.test(String(id || "")); }

  /* ── Day 0 → Day 1 → Day 2 시연 순서 ─────────────────────────────
     기준: work/neocloud/DEMO-ORDER.md (god, 2026-11-11). NOCP GET /api/v1/demo/playlist 가 있으면 그것을 쓰고,
     없으면(404·미연결) 아래 표를 쓴다. 항목 하나 = 시나리오 실행 하나 또는 화면 시연 하나(콘솔 화면 + 자막 카드).
     n = DEMO-ORDER 번호, also = 같은 순서에 속하지만 전체 실행에서는 돌리지 않는 보조 시나리오(목록 묶음용). */
  var PLAYLIST = [
    { n: 1, day: 0, kind: "scenario", scenario: "f-rack-bringup", also: ["f23-rack-bringup"] },
    { n: 2, day: 0, kind: "scenario", scenario: "f24-firmware-bundle" },
    { n: 3, day: 0, kind: "scenario", scenario: "f25-attestation" },
    { n: 4, day: 0, kind: "scenario", scenario: "f28-health-validation", also: ["f12-machine-events", "f35-capacity-scenarios"] },
    { n: 5, day: 0, kind: "screen", console: "ops", route: "dsx-power",
      title_ko: "MaxLPS 전력 도메인 예산 확인", title_en: "Check the MaxLPS power-domain budget",
      caption_ko: "랙 MaxP 227 kW · MaxQ 187 kW, 전력 도메인 32.3 MW 안에서 새 랙의 전력 예산이 잡혔는지 확인합니다.",
      caption_en: "Confirm the new racks fit the power budget: rack MaxP 227 kW, MaxQ 187 kW, inside the 32.3 MW power domain." },
    { n: 6, day: 1, kind: "scenario", scenario: "f07-identity", also: ["a-signup-to-invoice"] },
    { n: 7, day: 1, kind: "screen", console: "biz", route: "contracts",
      title_ko: "약정 계약(예약 NVL72 랙)", title_en: "Commitment contract (reserved NVL72 racks)",
      caption_ko: "영업이 예약 NVL72 랙 약정 계약을 등록하고 활성화합니다. 사업 콘솔 계약 화면에서 보여줍니다.",
      caption_en: "Sales registers and activates a reserved NVL72 rack commitment. Shown on the business console contracts screen." },
    { n: 8, day: 1, kind: "scenario", scenario: "h-bmaas-baseline" },
    { n: 8, day: 1, kind: "scenario", scenario: "f08-nico-rest" },
    { n: 9, day: 1, kind: "scenario", scenario: "g-nvke-clique", also: ["f11-nvke-capi"] },
    { n: 10, day: 1, kind: "scenario", scenario: "f32-marketplace-deploy", also: ["f29-packaging"] },
    { n: 11, day: 2, kind: "scenario", scenario: "b-token-api", also: ["f01-token-gateway", "f02-f04-quota-metering"] },
    { n: 12, day: 2, kind: "scenario", scenario: "f33-kv-tiers" },
    { n: 13, day: 2, kind: "scenario", scenario: "f30-kai-scheduling" },
    { n: 13, day: 2, kind: "scenario", scenario: "f31-slurm" },
    { n: 14, day: 2, kind: "scenario", scenario: "c-xid-remediation", also: ["f10-f09-recovery-sla"] },
    { n: 15, day: 2, kind: "scenario", scenario: "e-leak-workload-move", also: ["f22-leak-response"] },
    { n: 16, day: 2, kind: "scenario", scenario: "d-grid-curtailment", also: ["f20-dsx-flex", "f21-curtailment", "f13-status-notices"] },
    { n: 17, day: 2, kind: "scenario", scenario: "f05-billing-lago-stripe" },
    { n: 17, day: 2, kind: "scenario", scenario: "f27-finops" },
    { n: 18, day: 2, kind: "scenario", scenario: "f26-metrics" },
    { n: 18, day: 2, kind: "scenario", scenario: "f34-compliance-evidence" },
  ];
  function dayNum(v) {
    if (typeof v === "number" && isFinite(v)) return v;
    var m = String(v == null ? "" : v).match(/\d+/);
    return m ? +m[0] : null;
  }
  /* 화면 경로 정규화: "dsx-power" · "#/dsx-power" · "/biz/index.html#/contracts" · "../biz/#/contracts" → {console, route} */
  function screenRef(route, con) {
    var r = String(route || ""), c = con || "";
    var m = r.match(/(?:^|\/)(ops|customer|biz)\/(?:index\.html)?#\/?(.*)$/);
    if (m) { c = c || m[1]; r = m[2]; }
    r = r.replace(/^#?\/?/, "");
    return { console: c || "ops", route: r };
  }
  /* NOCP 플레이리스트(모양이 조금 달라도 받는다) → {source, days:[{day,title_ko,title_en}], items:[...]} . 못 읽으면 null */
  function normPlaylist(data) {
    if (!data) return null;
    var raw = [], days = [];
    var src = Array.isArray(data) ? data : (data.items || data.playlist || data.entries || null);
    if (Array.isArray(src)) raw = src.slice();
    var groups = !Array.isArray(data) && (data.days || data.groups);
    if (Array.isArray(groups)) groups.forEach(function (g) {
      var d = dayNum(g.day != null ? g.day : g.id);
      days.push({ day: d, title_ko: g.title_ko || g.label_ko || "", title_en: g.title_en || g.label_en || "" });
      (g.items || g.entries || []).forEach(function (it) { raw.push(Object.assign({ day: d }, it)); });
    });
    var items = [];
    raw.forEach(function (it, i) {
      if (!it) return;
      if (typeof it === "string") it = { scenario: it };
      var kind = String(it.kind || it.type || "").toLowerCase();
      var scn = it.scenario_id || it.scenario || null;
      kind = /screen|navigate|route|page/.test(kind) ? "screen" : (kind === "scenario" || scn ? "scenario" : (it.route ? "screen" : "scenario"));
      if (kind === "scenario" && !scn) scn = it.id || null;
      var d = dayNum(it.day);
      var o = { n: +(it.order || it.n || it.seq || i + 1), day: d == null ? 2 : d, kind: kind,
        title_ko: it.title_ko || "", title_en: it.title_en || "",
        caption_ko: it.caption_ko || it.narration_ko || it.note_ko || "", caption_en: it.caption_en || it.narration_en || it.note_en || "",
        also: it.also || [] };
      if (kind === "scenario") { if (!scn) return; o.scenario = String(scn); }
      else { var sr = screenRef(it.route || it.path || it.href, it.console); if (!sr.route) return; o.console = sr.console; o.route = sr.route; }
      items.push(o);
    });
    if (!items.length) return null;
    return { source: "nocp", days: days, items: items };
  }
  function fallbackPlaylist() { return { source: "local", days: [], items: PLAYLIST.map(function (x) { return Object.assign({}, x); }) }; }
  function dayLabel(pl, d, lang) {
    var g = pl && (pl.days || []).filter(function (x) { return x.day === d; })[0];
    var own = g && (g["title_" + lang] || g.title_ko);
    if (own) return /day\s*\d/i.test(own) ? own : "Day " + d + " " + own;
    return t(lang).day[d] || ("Day " + d);
  }
  /* 시나리오 id → 플레이리스트 위치 {day, n, item}. 실행 항목이 보조(also)보다 우선. */
  function dayIndex(pl) {
    var m = {};
    (pl ? pl.items : []).forEach(function (it, i) { if (it.kind === "scenario" && !m[it.scenario]) m[it.scenario] = { day: it.day, n: it.n, i: i, run: true }; });
    (pl ? pl.items : []).forEach(function (it, i) { (it.also || []).forEach(function (id) { if (!m[id]) m[id] = { day: it.day, n: it.n, i: i, run: false }; }); });
    return m;
  }
  function itemTitle(it, scenarios, lang) {
    if (it.kind === "screen") return L(it, "title", lang) || it.route;
    var sc = (scenarios || []).filter(function (s) { return s.id === it.scenario; })[0];
    return (sc && L(sc, "title", lang)) || L(it, "title", lang) || it.scenario;
  }

  /* 스윔레인 레인 — 요청 경로로 업무 영역을 고른다(원문 URL 그대로, 순서 = 표시 우선순위) */
  var LANES = [
    { id: "inject", ko: "장애·주입", en: "Injection", test: function (r) { return r.service === "internal" || /\/bringup\/inject/.test(r.path); } },
    { id: "identity", ko: "고객·계정", en: "Customer · identity", test: function (r) { return /^\/api\/v1\/(signup|tenants(\/[^/]+)?$|api-keys|realms)|^\/realms\/|\/\.well-known\//.test(r.path); } },
    { id: "token", ko: "Token API", en: "Token API", test: function (r) { return /^\/v1\/|^\/api\/v1\/token\//.test(r.path); } },
    { id: "billing", ko: "계약·청구", en: "Contract · billing", test: function (r) { return /^\/api\/v1\/(contracts|billing)/.test(r.path); } },
    { id: "metering", ko: "계측·정산", en: "Metering · FinOps", test: function (r) { return /^\/api\/v1\/(metering|finops|isolation)/.test(r.path); } },
    { id: "bmaas", ko: "BMaaS·bring-up", en: "BMaaS · bring-up", test: function (r) { return /^\/api\/v1\/(orders|dcim|bringup|allocations)/.test(r.path) || r.service === "nico"; } },
    { id: "nvke", ko: "NVKE", en: "NVKE", test: function (r) { return /^\/api\/v1\/nvke/.test(r.path); } },
    { id: "power", ko: "전력·전력망", en: "Power · grid", test: function (r) { return /^\/api\/v1\/power/.test(r.path) || r.service === "ai"; } },
    { id: "recovery", ko: "복구·SLA·상태", en: "Recovery · SLA · status", test: function (r) { return /^\/api\/v1\/(remediation|rma|sla|status|oob)|sla-report/.test(r.path); } },
  ];
  var LANE_OTHER = { id: "nocp", ko: "NOCP", en: "NOCP" };
  function pathOf(url) { return String(url || "").replace(/^[a-z]+:\/\/[^/]+/i, "").split("?")[0]; }
  function laneOf(step) {
    var r = step && step.request;
    if (!r) return step && /inject/.test(step.id || "") ? "inject" : LANE_OTHER.id;
    var x = { service: r.service || "nocp", path: pathOf(r.url) };
    for (var i = 0; i < LANES.length; i++) if (LANES[i].test(x)) return LANES[i].id;
    return LANE_OTHER.id;
  }
  function lanesFor(steps) {
    var seen = {}, out = [];
    (steps || []).forEach(function (s) { var id = laneOf(s); if (!seen[id]) { seen[id] = 1; out.push(id); } });
    return out.map(function (id) {
      var d = LANES.filter(function (l) { return l.id === id; })[0] || LANE_OTHER;
      return { id: d.id, label: { ko: d.ko, en: d.en } };
    });
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function L(o, key, lang) { return o ? (o[key + "_" + lang] || o[key + "_ko"] || "") : ""; }
  function t(lang) { return T[lang] || T.ko; }
  function flow() { return G && G.NC && G.NC.flow && typeof G.NC.flow.swimlane === "function" ? G.NC.flow : null; }

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
  function linkA(l, lang) {
    return '<a class="dc-link" href="' + esc(href(l)) + '"' + (l.console && l.console !== "ops" ? ' target="_blank" rel="noopener"' : "") +
      ">" + esc(L(l, "label", lang)) + " ↗</a>";
  }
  function linksHtml(links, lang) {
    if (!links || !links.length) return "";
    return '<div class="dc-links"><span class="dc-k">' + esc(t(lang).links) + "</span>" +
      links.map(function (l) { return linkA(l, lang); }).join("") + "</div>";
  }

  function scnButton(s, selected, lang, pos) {
    var on = s.id === selected;
    var pend = (s.pending_features || []).length
      ? '<span class="nc-badge info">' + esc(t(lang).pendingF) + " " + esc(s.pending_features.join(" ")) + "</span>" : "";
    var ord = pos ? '<span class="dc-ord mono' + (pos.run ? "" : " sub") + '">' + esc(pos.n) + "</span>" : "";
    return '<li><button type="button" class="dc-scn' + (on ? " on" : "") + '" data-dc-scn="' + esc(s.id) + '" aria-pressed="' + on + '">' +
      '<span class="dc-scn-t">' + ord + esc(L(s, "title", lang)) + "</span>" +
      '<span class="dc-scn-m"><span class="mono">' + esc(s.feature || "") + "</span> · " + esc(s.steps) + " " + esc(t(lang).steps) + " " + pend + "</span>" +
      "</button></li>";
  }
  function screenButton(it, lang) {
    return '<li><div class="dc-scn dc-scr"><span class="dc-scn-t"><span class="dc-ord mono">' + esc(it.n) + "</span>" + esc(L(it, "title", lang)) + "</span>" +
      '<span class="dc-scn-m"><span class="nc-badge unknown">' + esc(t(lang).screenOnly) + "</span>" +
      '<a class="dc-link" href="' + esc(href(it)) + '"' + (it.console !== "ops" ? ' target="_blank" rel="noopener"' : "") + ">" +
      esc(it.console + "/" + it.route) + " ↗</a></span></div></li>";
  }
  /* 목록: Day 0 구축 / Day 1 개통 / Day 2 운영 (플레이리스트 순서) — 각 Day 안에서 실행 항목 순서대로, 보조 시나리오는 그 뒤.
     어느 Day에도 없는 시나리오는 "기타 시나리오"로 접어 둔다(고른 것이 거기 있으면 펼친다). */
  function renderList(scenarios, selected, lang, pl) {
    if (!scenarios || !scenarios.length) return '<p class="dc-muted">—</p>';
    pl = pl || fallbackPlaylist();
    var idx = dayIndex(pl), byId = {}, used = {}, tx = t(lang);
    scenarios.forEach(function (s) { byId[s.id] = s; });
    var dayIds = [];
    pl.items.forEach(function (it) { if (dayIds.indexOf(it.day) < 0) dayIds.push(it.day); });
    dayIds.sort(function (a, b) { return a - b; });
    var out = dayIds.map(function (d) {
      var rows = [];
      pl.items.forEach(function (it) {
        if (it.day !== d) return;
        if (it.kind === "screen") { rows.push(screenButton(it, lang)); return; }
        if (byId[it.scenario] && !used[it.scenario]) { used[it.scenario] = 1; rows.push(scnButton(byId[it.scenario], selected, lang, idx[it.scenario])); }
      });
      pl.items.forEach(function (it) {
        if (it.day !== d) return;
        (it.also || []).forEach(function (id) { if (byId[id] && !used[id]) { used[id] = 1; rows.push(scnButton(byId[id], selected, lang, idx[id])); } });
      });
      if (!rows.length) return "";
      return '<h3 class="dc-gh dc-day d' + esc(d) + '">' + esc(dayLabel(pl, d, lang)) +
        (tx.daySub[d] ? ' <span class="dc-muted">' + esc(tx.daySub[d]) + "</span>" : "") + "</h3>" +
        '<ul class="dc-list" role="list">' + rows.join("") + "</ul>";
    }).join("");
    var rest = scenarios.filter(function (s) { return !used[s.id]; });
    if (!out) return '<ul class="dc-list" role="list">' + scenarios.map(function (s) { return scnButton(s, selected, lang); }).join("") + "</ul>";
    if (rest.length) {
      var openRest = rest.some(function (s) { return s.id === selected; });
      out += '<details class="dc-more"' + (openRest ? " open" : "") + '><summary class="dc-gh">' + esc(tx.other) +
        ' <span class="dc-muted">' + rest.length + "</span></summary>" +
        '<ul class="dc-list" role="list">' + rest.map(function (s) { return scnButton(s, selected, lang); }).join("") + "</ul></details>";
    }
    return out;
  }

  /* 발표 모드 Day 띠: 지금 Day · 순서 n/전체 · 다음 항목 */
  function dayBanner(pl, pos, lang, scenarios) {
    if (!pl || pos == null || !pl.items[pos]) return "";
    var tx = t(lang), it = pl.items[pos], nx = pl.items[pos + 1];
    return '<div class="dc-dayband d' + esc(it.day) + '" role="status"><span class="dc-dayk">' + esc(dayLabel(pl, it.day, lang)) + "</span>" +
      '<span class="mono">' + esc(tx.plOf) + " " + (pos + 1) + " / " + pl.items.length + " · #" + esc(it.n) + "</span>" +
      (nx ? '<span class="dc-upnext">' + esc(tx.upNext) + ": " + (nx.day !== it.day ? esc(dayLabel(pl, nx.day, lang)) + " · " : "") + esc(itemTitle(nx, scenarios, lang)) + "</span>" : "") +
      "</div>";
  }
  /* 화면 시연 자막 카드 — 콘솔 화면 위에 떠 있다 (본문 아래쪽 고정) */
  function captionHtml(pl, pos, lang, o) {
    o = o || {};
    var tx = t(lang), it = pl && pl.items[pos];
    if (!it) return "";
    var other = it.console && it.console !== "ops";
    return '<section class="dc-cap d' + esc(it.day) + '" role="region" aria-labelledby="dc-cap-h" lang="' + esc(lang) + '">' +
      dayBanner(pl, pos, lang, o.scenarios) +
      '<h3 id="dc-cap-h" class="dc-cap-t">' + esc(L(it, "title", lang) || it.route) + ' <span class="nc-badge unknown">' + esc(tx.screenOnly) + "</span></h3>" +
      (L(it, "caption", lang) ? '<p class="dc-cap-p">' + esc(L(it, "caption", lang)) + "</p>" : "") +
      '<div class="dc-cap-nav">' +
      '<button type="button" class="btn-ghost" data-dc-pl="prev"' + (pos <= 0 ? " disabled" : "") + ">← " + esc(tx.prevItem) + "</button>" +
      '<button type="button" class="btn" data-dc-pl="next">' + esc(pos >= pl.items.length - 1 ? tx.playStop : tx.nextItem) + " →</button>" +
      (other ? '<a class="btn-ghost dc-cap-open" href="' + esc(href(it)) + '" target="_blank" rel="noopener">' + esc(tx.openScreen) + " ↗</a>" : "") +
      '<button type="button" class="btn-ghost" data-dc-pl="home">' + esc(tx.backDc) + "</button>" +
      '<button type="button" class="btn-ghost" data-dc-pl="stop">' + esc(tx.playStop) + "</button>" +
      '<span class="dc-muted">' + esc(tx.plKeys) + "</span></div></section>";
  }

  function stepHtml(st, i, lang, cur) {
    var a = st.assertion || {}, req = st.request, res = st.response;
    var reqLine = req ? '<div class="dc-req mono"><span class="dc-k">' + esc(t(lang).request) + "</span>" +
      esc(req.method) + " " + esc(req.url) + "</div>" : "";
    var resLine = res ? '<div class="dc-res mono"><span class="dc-k">' + esc(t(lang).response) + "</span>" + esc(res.summary) + "</div>" : "";
    var raw = (req || res) ? '<details class="dc-raw"><summary>' + esc(t(lang).raw) + "</summary>" + msgHtml(st, lang) + "</details>" : "";
    var exp = L(st, "expect", lang);
    return '<li class="dc-step' + (cur ? " cur" : "") + " s-" + esc(st.state) + '" data-step="' + i + '"' + (cur ? ' aria-current="step"' : "") + ">" +
      '<div class="dc-step-h"><span class="dc-no mono">' + esc(st.id) + "</span>" +
      '<span class="dc-step-t">' + esc(L(st, "title", lang)) + "</span>" + badge(st.state, st.feature, lang) +
      (cur ? '<span class="dc-now">' + esc(t(lang).now) + "</span>" : "") +
      (st.duration_ms != null ? '<span class="dc-ms mono">' + esc(st.duration_ms) + " ms</span>" : "") + "</div>" +
      '<p class="dc-narr">' + esc(L(st, "narration", lang)) + "</p>" +
      (exp ? '<div class="dc-exp"><span class="dc-k">' + esc(t(lang).expect) + "</span>" + esc(exp) + "</div>" : "") +
      (a.detail_ko || a.detail_en ? '<div class="dc-res-line"><span class="dc-k">' + esc(t(lang).result) + "</span>" +
        esc(L(a, "detail", lang)) + "</div>" : "") +
      reqLine + resLine + linksHtml(st.links, lang) + raw + "</li>";
  }

  /* 요청·응답 원문 뷰어 — 러너가 준 메서드·URL·헤더·본문·상태를 손대지 않고 보여준다(인증 값은 러너가 이미 가림). */
  function pretty(b) {
    if (b == null || b === "") return "";
    if (typeof b === "string") { try { return JSON.stringify(JSON.parse(b), null, 2); } catch (e) { return b; } }
    return JSON.stringify(b, null, 2);
  }
  function hdrs(h) {
    var k = Object.keys(h || {});
    if (!k.length) return "";
    return k.map(function (n) { return '<span class="dc-hn">' + esc(n) + ":</span> " + esc(h[n]); }).join("\n");
  }
  function statusCls(s) { s = +s || 0; return s >= 500 ? "crit" : s >= 400 ? "warn" : s >= 200 ? "ok" : "unknown"; }
  function msgHtml(st, lang) {
    var tx = t(lang), req = st && st.request, res = st && st.response;
    if (!req && !res) return '<p class="dc-muted">' + esc(tx.noMsg) + "</p>";
    var M = G && G.NC && G.NC.msg;
    if (M && typeof M.render === "function") {
      return '<div class="dc-msg-core">' + M.render(st, { open: true, layout: "split", title: (st.id || "") + " " + L(st, "title", lang) }) + "</div>";
    }
    var reqStart = req ? esc(req.method || "") + " " + esc(pathOf(req.url) + (String(req.url || "").indexOf("?") >= 0 ? "?" + String(req.url).split("?").slice(1).join("?") : "")) : "";
    var host = req ? String(req.url || "").replace(/^[a-z]+:\/\/([^/]+).*$/i, "$1") : "";
    var reqH = req ? (host && host !== req.url ? '<span class="dc-hn">Host:</span> ' + esc(host) + (hdrs(req.headers) ? "\n" : "") : "") + hdrs(req.headers) : "";
    var reqB = req ? pretty(req.body) : "";
    var resB = res ? pretty(res.body) : "";
    return '<div class="dc-msg" role="group" aria-label="' + esc(tx.msgOf + " " + (st.id || "")) + '">' +
      (req ? '<section class="dc-pane"><h4 class="dc-ph">' + esc(tx.request) +
        (req.service ? ' <span class="dc-svc mono">' + esc(req.service) + "</span>" : "") + "</h4>" +
        '<pre class="mono dc-wire" tabindex="0"><span class="dc-start">' + reqStart + "</span>" +
        (reqH ? "\n" + reqH : "") + (reqB ? "\n\n" + esc(reqB) : "") + "</pre></section>" : "") +
      (res ? '<section class="dc-pane"><h4 class="dc-ph">' + esc(tx.response) + ' <span class="nc-badge ' + statusCls(res.status) + '">HTTP ' +
        esc(res.status) + "</span></h4>" +
        '<pre class="mono dc-wire" tabindex="0">' + (hdrs(res.headers) || "") + (resB ? (hdrs(res.headers) ? "\n\n" : "") + esc(resB) : "") + "</pre></section>" : "") +
      "</div>";
  }

  /* 진행 막대 — 끝난 단계(대기·실행 중이 아닌 것) / 전체 */
  function progressHtml(steps, lang, big) {
    var total = steps.length, done = steps.filter(function (s) { return s.state !== "waiting" && s.state !== "running"; }).length;
    var fail = steps.some(function (s) { return s.state === "failed"; });
    var F = flow();
    if (F && F.progress) return F.progress(done, total, { label: t(lang).progress, big: big, fail: fail });
    var p = total ? Math.round(done / total * 100) : 0;
    return '<div class="dc-prog' + (big ? " big" : "") + '"><div class="dc-prog-h"><span>' + esc(t(lang).progress) + '</span><span class="mono">' +
      done + " / " + total + " · " + p + "%</span></div>" +
      '<div class="dc-prog-bar' + (fail ? " fail" : p >= 100 ? " done" : "") + '" role="progressbar" aria-label="' + esc(t(lang).progress) +
      '" aria-valuemin="0" aria-valuemax="' + total + '" aria-valuenow="' + done + '" aria-valuetext="' + done + " / " + total + '"><i style="width:' + p + '%"></i></div></div>';
  }

  /* 현재 단계: 실행 중인 단계 → 단계 모드에서 마지막으로 실행한 단계 → 첫 실패 → 마지막 단계 */
  function currentIndex(steps, run) {
    var i;
    for (i = 0; i < steps.length; i++) if (steps[i].state === "running") return i;
    if (run && run.state !== "done") {
      for (i = steps.length - 1; i >= 0; i--) if (steps[i].state !== "waiting") return i;
      return 0;
    }
    if (run) { for (i = 0; i < steps.length; i++) if (steps[i].state === "failed") return i; return steps.length - 1; }
    return 0;
  }

  /* 스윔레인: NC.flow.swimlane 이 있으면 그것, 없으면 같은 표 구조의 로컬 렌더러 */
  function swimHtml(steps, lang, sel, big) {
    var lanes = lanesFor(steps), tx = t(lang);
    var items = steps.map(function (s, i) {
      return { id: String(i), lane: laneOf(s), status: FLOW_ST[s.state] || "pending",
        label: { ko: s.title_ko || s.id, en: s.title_en || s.title_ko || s.id },
        sub: s.id + (s.request ? " · " + s.request.method + (s.response && s.response.status ? " " + s.response.status : "") : "") };
    });
    var F = flow();
    if (F) return F.swimlane(lanes, items, { selectable: true, selected: String(sel), big: big, caption: tx.swimCap, ariaLabel: tx.vSwim });
    var ICON = { done: "✓", active: "●", pending: "○", fail: "✕", skip: "–", warn: "◌" };
    var head = '<tr><th scope="col" class="dc-sl-corner">' + esc(tx.area) + "</th>" +
      items.map(function (_, i) { return '<th scope="col" class="mono">' + (i + 1) + "</th>"; }).join("") + "</tr>";
    var rows = lanes.map(function (ln) {
      return '<tr><th scope="row" class="dc-sl-lane">' + esc(ln.label[lang] || ln.label.ko) + "</th>" + items.map(function (it, i) {
        if (it.lane !== ln.id) return "<td></td>";
        var on = String(sel) === it.id;
        return '<td class="has"><button type="button" class="dc-chip ' + it.status + (on ? " sel" : "") + '" data-ft-step="' + i +
          '" aria-pressed="' + on + '"><span aria-hidden="true" class="dc-ic">' + ICON[it.status] + "</span>" +
          esc(it.label[lang] || it.label.ko) + '<span class="sr-only"> — ' + esc(tx.state[steps[i].state] || "") + "</span>" +
          (it.sub ? '<span class="dc-chip-s mono">' + esc(it.sub) + "</span>" : "") + "</button></td>";
      }).join("") + "</tr>";
    }).join("");
    return '<div class="dc-sl-wrap" role="region" tabindex="0" aria-label="' + esc(tx.vSwim) + '"><table class="dc-sl"><caption>' + esc(tx.swimCap) +
      "</caption><thead>" + head + "</thead><tbody>" + rows + "</tbody></table></div>";
  }

  /* 결과 요약 카드 — 실행이 끝났을 때 */
  function summaryCard(run, steps, lang) {
    var tx = t(lang), c = run.counts || {};
    var att = steps.map(function (s, i) { return { s: s, i: i }; }).filter(function (x) { return x.s.state === "failed" || x.s.state === "pending" || x.s.state === "skipped"; });
    var seen = {}, links = [];
    steps.forEach(function (s) { (s.links || []).forEach(function (l) { var k = (l.console || "ops") + ":" + l.route; if (!seen[k]) { seen[k] = 1; links.push(l); } }); });
    return '<section class="dc-sumcard v-' + esc(run.verdict) + '" aria-labelledby="dc-sum-h"><h3 id="dc-sum-h" class="dc-sumh">' + esc(tx.summary) + "</h3>" +
      '<div class="dc-sumrow"><span class="dc-verdict">' + verdictBadge(run.verdict, lang) + "</span>" +
      '<span class="dc-big mono">' + esc(c.passed || 0) + " / " + steps.length + "</span>" +
      ["failed", "pending", "skipped"].map(function (k) { return '<span class="dc-c">' + esc(tx.state[k]) + " " + esc(c[k] || 0) + "</span>"; }).join("") +
      '<span class="dc-c mono">' + esc(tx.total) + " " + esc(run.total_ms || 0) + " ms</span></div>" +
      '<div class="dc-sumgrid"><div><h4 class="dc-ph">' + esc(tx.attention) + "</h4>" +
      (att.length ? '<ul class="dc-att">' + att.map(function (x) {
        return '<li><button type="button" class="dc-attb" data-dc-focus="' + x.i + '">' + badge(x.s.state, x.s.feature, lang) +
          ' <span class="mono">' + esc(x.s.id) + "</span> " + esc(L(x.s, "title", lang)) + "</button>" +
          (x.s.assertion ? '<div class="dc-muted">' + esc(L(x.s.assertion, "detail", lang)) + "</div>" : "") + "</li>";
      }).join("") + "</ul>" : '<p class="dc-muted">' + esc(tx.noAttention) + "</p>") + "</div>" +
      "<div><h4 class=\"dc-ph\">" + esc(tx.openScreens) + '</h4><div class="dc-links">' +
      links.map(function (l) { return linkA(l, lang); }).join("") + "</div></div></div></section>";
  }

  /* 발표 모드 스포트라이트 — 큰 글씨로 지금 단계 하나 */
  function spotlight(steps, idx, lang, run) {
    var tx = t(lang), s = steps[idx];
    if (!s) return "";
    var a = s.assertion || {}, exp = L(s, "expect", lang);
    var strip = '<ol class="dc-strip" aria-label="' + esc(tx.steps) + '">' + steps.map(function (x, i) {
      return '<li><button type="button" class="dc-dot s-' + esc(x.state) + (i === idx ? " on" : "") + '" data-dc-focus="' + i +
        '" aria-pressed="' + (i === idx) + '" aria-label="' + esc(x.id + " " + L(x, "title", lang) + " — " + (tx.state[x.state] || x.state)) + '">' + (i + 1) + "</button></li>";
    }).join("") + "</ol>";
    return '<section class="dc-spot s-' + esc(s.state) + '" aria-live="polite" aria-labelledby="dc-spot-h">' + strip +
      '<div class="dc-spot-k"><span class="mono">' + esc(tx.stepOf) + " " + (idx + 1) + " / " + steps.length + "</span> · " +
      '<span class="mono">' + esc(s.id) + "</span> " + badge(s.state, s.feature, lang) +
      (s.duration_ms != null ? ' <span class="dc-ms mono">' + esc(s.duration_ms) + " ms</span>" : "") + "</div>" +
      '<h3 id="dc-spot-h" class="dc-spot-t">' + esc(L(s, "title", lang)) + "</h3>" +
      '<div class="dc-talk"><span class="dc-k">' + esc(tx.talk) + "</span><p>" + esc(L(s, "narration", lang)) + "</p></div>" +
      (exp ? '<div class="dc-exp"><span class="dc-k">' + esc(tx.expect) + "</span>" + esc(exp) + "</div>" : "") +
      (a.detail_ko || a.detail_en ? '<div class="dc-res-line"><span class="dc-k">' + esc(tx.result) + "</span>" + esc(L(a, "detail", lang)) + "</div>" : "") +
      (s.request ? '<div class="dc-req mono"><span class="dc-k">' + esc(tx.request) + "</span>" + esc(s.request.method) + " " + esc(pathOf(s.request.url)) +
        (s.response ? ' → <span class="nc-badge ' + statusCls(s.response.status) + '">HTTP ' + esc(s.response.status) + "</span>" : "") + "</div>" : "") +
      linksHtml(s.links, lang) +
      ((s.request || s.response) ? '<details class="dc-raw"><summary>' + esc(tx.raw) + "</summary>" + msgHtml(s, lang) + "</details>" : "") +
      '<div class="dc-spot-nav"><button type="button" class="btn-ghost" data-dc-act="prev"' + (idx <= 0 ? " disabled" : "") + ">← " + esc(tx.prev) + "</button>" +
      '<button type="button" class="btn-ghost" data-dc-act="fnext"' + (idx >= steps.length - 1 ? " disabled" : "") + ">" + esc(tx.nextFocus) + " →</button>" +
      '<span class="dc-muted">' + esc(tx.keys) + "</span></div></section>";
  }

  /* 시나리오 상세 + 실행 타임라인. run 이 없으면 시나리오 단계를 대기 상태로 보여준다.
     o: {view:"timeline"|"swim", focus:index|null, presenter:boolean,
         pl: 플레이리스트, plPos: 전체 실행 중인 항목 위치(없으면 null), scenarios: 목록(다음 항목 제목용)} */
  function stepsOf(sc, run) {
    return run ? run.steps : (sc.steps || []).map(function (s) {
      return { id: s.id, title_ko: s.title_ko, title_en: s.title_en, narration_ko: s.narration_ko,
        narration_en: s.narration_en, expect_ko: s.expect_ko, expect_en: s.expect_en,
        feature: s.feature, links: s.links, state: s.pending ? "pending" : "waiting" };
    });
  }
  function renderDetail(sc, run, lang, busy, o) {
    o = o || {};
    if (!sc) return '<p class="dc-muted">' + esc(t(lang).noScenario) + "</p>";
    var tx = t(lang), steps = stepsOf(sc, run);
    var cur = currentIndex(steps, run);
    var focus = o.focus != null && steps[o.focus] ? o.focus : cur;
    var stepMode = run && run.mode === "step" && run.state !== "done";
    var dis = busy ? " disabled" : "";
    var btns = '<div class="dc-actions">' +
      '<button type="button" class="btn" data-dc-act="run"' + dis + ">" + esc(tx.runAll) + "</button>" +
      '<button type="button" class="btn-ghost" data-dc-act="step"' + dis + ">" + esc(tx.stepMode) + "</button>" +
      (stepMode ? '<button type="button" class="btn-ghost" data-dc-act="next"' + dis + ">" + esc(tx.next) + "</button>" +
        '<button type="button" class="btn-ghost" data-dc-act="cont"' + dis + ">" + esc(tx.cont) + "</button>" : "") +
      (o.plPos != null && o.pl && run && run.state === "done" ? '<button type="button" class="btn" data-dc-pl="next">' +
        esc(o.plPos >= o.pl.items.length - 1 ? tx.playStop : tx.nextItem) + " →</button>" : "") +
      "</div>";
    var pl = o.pl || fallbackPlaylist(), pos = dayIndex(pl)[sc.id];
    var chip = pos ? '<span class="dc-daychip d' + esc(pos.day) + '">' + esc(dayLabel(pl, pos.day, lang)) + " · #" + esc(pos.n) + "</span>" : "";
    var band = !o.presenter ? "" : o.plPos != null ? dayBanner(pl, o.plPos, lang, o.scenarios)
      : pos ? '<div class="dc-dayband d' + esc(pos.day) + '" role="status"><span class="dc-dayk">' + esc(dayLabel(pl, pos.day, lang)) + '</span><span class="mono">#' + esc(pos.n) + "</span></div>" : "";
    var talk = TALK[sc.id];
    var head = '<div class="dc-head">' + band + '<h2 class="dc-h">' + (o.presenter ? "" : chip) + esc(L(sc, "title", lang)) + "</h2>" +
      '<p class="dc-sum">' + esc(L(sc, "summary", lang)) + (sc.story ? ' <span class="mono dc-muted">' + esc(sc.story) + "</span>" : "") + "</p>" +
      (talk && (talk[lang] || talk.ko) !== L(sc, "summary", lang) ? '<p class="dc-shows"><span class="dc-k">' + esc(tx.shows) + "</span>" + esc(talk[lang] || talk.ko) + "</p>" : "") +
      btns + (run ? countsHtml(run, lang) + '<div class="dc-muted mono">run ' + esc(run.id) + "</div>" : "") +
      progressHtml(steps, lang, !!o.presenter) + "</div>";
    var done = run && run.state === "done" ? summaryCard(run, steps, lang) : "";
    if (o.presenter) return head + spotlight(steps, focus, lang, run) + done;
    var view = o.view === "swim" ? "swim" : "timeline";
    var tabs = '<div class="dc-views" role="group" aria-label="' + esc(tx.view) + '">' +
      ["timeline", "swim"].map(function (v) {
        return '<button type="button" class="dc-vbtn' + (view === v ? " on" : "") + '" data-dc-view="' + v + '" aria-pressed="' + (view === v) + '">' +
          esc(v === "swim" ? tx.vSwim : tx.vTimeline) + "</button>";
      }).join("") + "</div>";
    var body = view === "swim"
      ? swimHtml(steps, lang, focus, false) + '<div class="dc-swimmsg"><div class="dc-step-h"><span class="dc-no mono">' + esc(steps[focus] ? steps[focus].id : "") +
        "</span>" + '<span class="dc-step-t">' + esc(steps[focus] ? L(steps[focus], "title", lang) : "") + "</span>" +
        (steps[focus] ? badge(steps[focus].state, steps[focus].feature, lang) : "") + "</div>" +
        (steps[focus] ? '<p class="dc-narr">' + esc(L(steps[focus], "narration", lang)) + "</p>" + linksHtml(steps[focus].links, lang) + msgHtml(steps[focus], lang) : "") + "</div>"
      : '<ol class="dc-timeline">' + steps.map(function (s, i) { return stepHtml(s, i, lang, !!run && i === cur && run.state !== "done"); }).join("") + "</ol>";
    return head + done + tabs + body;
  }

  function countsHtml(run, lang) {
    var c = run.counts || {};
    return '<div class="dc-counts" role="status">' + verdictBadge(run.verdict, lang) +
      ["passed", "failed", "pending", "skipped"].map(function (k) {
        return '<span class="dc-c">' + esc(t(lang).state[k]) + " " + esc(c[k] || 0) + "</span>";
      }).join("") + '<span class="dc-c mono">' + esc(t(lang).total) + " " + esc(run.total_ms || 0) + " ms</span></div>";
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
      playlist: function () { return req("GET", "/playlist"); },
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
    ".dc-grid{display:grid;grid-template-columns:minmax(220px,300px) minmax(0,1fr);gap:14px;align-items:start}" +
    "@media (max-width:860px){.dc-grid{grid-template-columns:minmax(0,1fr)}}.dc-grid>.panel{min-width:0;max-width:100%}" +
    ".dc-gh{font-size:var(--fs-xs);color:var(--muted);font-weight:var(--fw-semi);margin:4px 0 6px;letter-spacing:.02em}" +
    ".dc-more{margin-top:10px}.dc-more>summary{cursor:pointer}" +
    ".dc-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}" +
    ".dc-scn{width:100%;text-align:left;background:var(--card);color:var(--text);border:1px solid var(--line);border-radius:var(--radius);padding:9px 10px;cursor:pointer;display:flex;flex-direction:column;gap:4px;font:inherit}" +
    ".dc-scn:hover{border-color:var(--accent-line)}.dc-scn.on{border-color:var(--accent);background:var(--accent-soft);box-shadow:inset 3px 0 0 var(--accent)}" +
    ".dc-scn-t{font-size:calc(12.5px*var(--dc-scale));font-weight:var(--fw-semi)}.dc-scn-m{font-size:calc(11px*var(--dc-scale));color:var(--muted);display:flex;gap:6px;align-items:center;flex-wrap:wrap}" +
    ".dc-h{font-size:calc(15px*var(--dc-scale));margin:0 0 4px}.dc-sum{font-size:calc(12px*var(--dc-scale));color:var(--text-2);margin:0 0 6px;line-height:var(--lh-body)}" +
    ".dc-shows{font-size:calc(12px*var(--dc-scale));color:var(--text);margin:0 0 10px;line-height:var(--lh-body);padding:6px 10px;border-left:3px solid var(--accent);background:var(--surface-2);border-radius:0 6px 6px 0}" +
    ".dc-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}.dc-counts{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:calc(11.5px*var(--dc-scale));margin-bottom:4px}" +
    /* 진행 막대(로컬 대체) */
    ".dc-prog,.ft-prog{margin:10px 0 4px}.dc-prog-h{display:flex;justify-content:space-between;gap:8px;color:var(--text-2);font-size:calc(11.5px*var(--dc-scale));margin-bottom:4px}" +
    ".dc-prog-bar{height:8px;border-radius:var(--radius-pill);background:var(--track);overflow:hidden}.dc-prog.big .dc-prog-bar{height:14px}" +
    ".dc-prog-bar>i{display:block;height:100%;background:var(--info);transition:width var(--dur) var(--ease)}.dc-prog-bar.done>i{background:var(--ok)}.dc-prog-bar.fail>i{background:var(--crit)}" +
    /* 보기 전환 */
    ".dc-views{display:inline-flex;border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;margin:12px 0 4px}" +
    ".dc-vbtn{background:var(--card);color:var(--text-2);border:0;padding:6px 14px;font:inherit;font-size:calc(12px*var(--dc-scale));cursor:pointer}" +
    ".dc-vbtn+.dc-vbtn{border-left:1px solid var(--line)}.dc-vbtn.on{background:var(--accent);color:var(--on-accent);font-weight:var(--fw-semi)}" +
    /* 타임라인 */
    ".dc-timeline{list-style:none;margin:12px 0 0;padding:0;border-left:2px solid var(--line);display:flex;flex-direction:column;gap:10px}" +
    ".dc-step{margin-left:12px;padding:10px 12px;background:var(--card);border:1px solid var(--line);border-radius:var(--radius);position:relative;min-width:0}" +
    ".dc-step:before{content:'';position:absolute;left:-19px;top:14px;width:10px;height:10px;border-radius:50%;background:var(--dot-off);border:2px solid var(--surface-0)}" +
    ".dc-step.s-passed:before{background:var(--ok)}.dc-step.s-failed:before{background:var(--crit)}.dc-step.s-running:before{background:var(--warn)}.dc-step.s-pending:before{background:var(--info)}" +
    ".dc-step.s-failed{border-color:var(--crit-line)}.dc-step.s-running{border-color:var(--warn-line)}" +
    ".dc-step.cur{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft)}" +
    ".dc-now{font-size:var(--fs-2xs);font-weight:var(--fw-bold);color:var(--on-accent);background:var(--accent);border-radius:var(--radius-pill);padding:1px 8px}" +
    ".dc-step-h{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.dc-no{color:var(--muted);font-size:calc(11px*var(--dc-scale))}" +
    ".dc-step-t{font-weight:var(--fw-semi);font-size:calc(13px*var(--dc-scale))}.dc-ms{margin-left:auto;color:var(--muted);font-size:calc(11px*var(--dc-scale))}" +
    ".dc-narr{margin:6px 0;color:var(--text-2);font-size:calc(12px*var(--dc-scale));line-height:var(--lh-body)}" +
    ".dc-exp,.dc-res-line,.dc-req,.dc-res,.dc-links{font-size:calc(11.5px*var(--dc-scale));margin-top:3px;overflow-wrap:anywhere}" +
    ".dc-k{display:inline-block;min-width:64px;color:var(--muted);margin-right:6px;font-family:var(--font-sans)}" +
    ".dc-links{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.dc-link{color:var(--accent-text)}" +
    ".dc-raw summary{cursor:pointer;color:var(--muted);font-size:calc(11px*var(--dc-scale));margin-top:5px}" +
    /* 원문 뷰어 */
    "#demo-center-root .dc-msg-core{min-width:0;max-width:100%;overflow-x:auto;position:relative}" +
    ".dc-msg{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:10px;margin-top:8px}" +
    ".dc-pane{min-width:0;border:1px solid var(--line-soft);border-radius:6px;background:var(--surface-1);overflow:hidden}" +
    ".dc-ph{margin:0;padding:6px 10px;font-size:var(--fs-xs);font-weight:var(--fw-semi);color:var(--text-2);background:var(--surface-2);display:flex;gap:8px;align-items:center}" +
    ".dc-svc{font-weight:var(--fw-reg);color:var(--muted)}" +
    ".dc-wire{margin:0;max-height:320px;overflow:auto;padding:8px 10px;font-size:11px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--text)}" +
    ".dc-start{font-weight:var(--fw-bold);color:var(--accent-text)}.dc-hn{color:var(--text-2)}" +
    /* 스윔레인(로컬 대체) */
    "#demo-center-root .dc-sl-wrap,#demo-center-root .fsl-wrap{overflow-x:auto;max-width:100%;width:100%;margin-top:8px;position:relative}" +
    ".dc-sl{border-collapse:separate;border-spacing:0;font-size:calc(11.5px*var(--dc-scale))}.dc-sl caption{text-align:left;color:var(--text-2);padding:0 0 6px}" +
    ".dc-sl th,.dc-sl td{border-bottom:1px solid var(--line-soft);padding:4px 6px;vertical-align:middle}" +
    ".dc-sl thead th{color:var(--muted);font-size:var(--fs-xs);font-weight:var(--fw-semi);text-align:center}" +
    ".dc-sl-lane{text-align:left;white-space:nowrap;color:var(--text-2);font-weight:var(--fw-semi);position:sticky;left:0;background:var(--card);z-index:1}" +
    ".dc-sl td.has{background:var(--surface-2)}" +
    "#demo-center-root .fsl td,#demo-center-root .dc-sl td{min-width:136px}#demo-center-root .fsl-chip,#demo-center-root .dc-chip{max-width:190px}" +
    ".dc-chip{display:inline-flex;flex-direction:column;align-items:center;gap:1px;padding:4px 8px;border-radius:var(--radius);border:1px solid var(--line);background:var(--card);color:var(--text);font:inherit;max-width:150px;cursor:pointer;text-align:center}" +
    ".dc-chip:hover{background:var(--surface-hover)}.dc-chip.sel{box-shadow:0 0 0 2px var(--accent)}.dc-ic{font-weight:var(--fw-bold)}" +
    ".dc-chip.done{border-color:var(--ok-line);background:var(--ok-bg)}.dc-chip.done .dc-ic{color:var(--ok)}" +
    ".dc-chip.fail{border-color:var(--crit-line);background:var(--crit-bg)}.dc-chip.fail .dc-ic{color:var(--crit)}" +
    ".dc-chip.active{border-color:var(--warn-line);background:var(--warn-bg)}.dc-chip.warn{border-color:var(--info-line);background:var(--info-bg)}" +
    ".dc-chip-s{font-size:var(--fs-2xs);color:var(--text-2)}" +
    ".dc-swimmsg{margin-top:12px;padding:10px 12px;border:1px solid var(--line);border-radius:var(--radius);background:var(--card)}" +
    /* 결과 요약 카드 */
    ".dc-sumcard{margin:12px 0;padding:12px 14px;border:1px solid var(--line);border-left:4px solid var(--ok);border-radius:var(--radius);background:var(--card)}" +
    ".dc-sumcard.v-fail{border-left-color:var(--crit)}.dc-sumcard.v-pass_with_pending{border-left-color:var(--info)}" +
    ".dc-sumh{margin:0 0 8px;font-size:calc(13px*var(--dc-scale))}" +
    ".dc-sumrow{display:flex;gap:12px;align-items:center;flex-wrap:wrap;font-size:calc(12px*var(--dc-scale))}" +
    ".dc-big{font-size:calc(22px*var(--dc-scale));font-weight:var(--fw-bold);color:var(--text)}" +
    ".dc-sumgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:12px;margin-top:10px}" +
    ".dc-sumgrid .dc-ph{background:none;padding:0 0 6px}" +
    ".dc-att{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;font-size:calc(12px*var(--dc-scale))}" +
    ".dc-attb{background:none;border:0;padding:0;color:var(--text);font:inherit;cursor:pointer;text-align:left}.dc-attb:hover{text-decoration:underline}" +
    /* 발표 모드 스포트라이트 */
    ".dc-strip{list-style:none;margin:0 0 14px;padding:0;display:flex;gap:6px;flex-wrap:wrap}" +
    ".dc-dot{min-width:34px;height:34px;border-radius:50%;border:2px solid var(--border-strong);background:var(--card);color:var(--text-2);font:inherit;font-weight:var(--fw-bold);cursor:pointer}" +
    ".dc-dot.s-passed{border-color:var(--ok);background:var(--ok-bg);color:var(--ok)}.dc-dot.s-failed{border-color:var(--crit);background:var(--crit-bg);color:var(--crit)}" +
    ".dc-dot.s-running{border-color:var(--warn);background:var(--warn-bg);color:var(--warn)}.dc-dot.s-pending{border-color:var(--info);background:var(--info-bg);color:var(--info-text)}" +
    ".dc-dot.on{background:var(--accent);border-color:var(--accent);color:var(--on-accent);transform:scale(1.15)}" +
    ".dc-spot{margin-top:12px;padding:18px 22px;border:2px solid var(--accent);border-radius:var(--radius-lg);background:var(--card)}" +
    ".dc-spot.s-failed{border-color:var(--crit)}" +
    ".dc-spot-k{font-size:calc(12px*var(--dc-scale));color:var(--text-2);display:flex;gap:8px;align-items:center;flex-wrap:wrap}" +
    ".dc-spot-t{font-size:calc(22px*var(--dc-scale));margin:8px 0 10px;line-height:var(--lh-tight)}" +
    ".dc-talk{font-size:calc(15px*var(--dc-scale));line-height:var(--lh-body);margin-bottom:10px}.dc-talk p{margin:4px 0 0}" +
    ".dc-spot-nav{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:14px}" +
    ".dc-muted{color:var(--muted);font-size:var(--fs-xs)}" +
    /* Day 0/1/2 묶음 · 플레이리스트 */
    ".dc-day{display:flex;flex-direction:column;gap:1px;margin-top:14px;padding:4px 0 4px 8px;border-left:3px solid var(--accent);color:var(--text);font-size:calc(12px*var(--dc-scale))}" +
    ".dc-day:first-child{margin-top:4px}.dc-day.d1{border-left-color:var(--info)}.dc-day.d2{border-left-color:var(--ok)}.dc-day .dc-muted{font-weight:var(--fw-reg)}" +
    ".dc-ord{display:inline-block;min-width:22px;margin-right:6px;padding:0 5px;border-radius:var(--radius-pill);background:var(--accent);color:var(--on-accent);font-size:var(--fs-2xs);text-align:center;vertical-align:1px}" +
    ".dc-ord.sub{background:var(--surface-2);color:var(--text-2);border:1px solid var(--line)}" +
    ".dc-scr{cursor:default;border-style:dashed}.dc-scr .dc-link{font-size:var(--fs-2xs)}" +
    ".dc-daychip{display:inline-block;margin-right:8px;padding:1px 8px;border-radius:var(--radius-pill);border:1px solid var(--accent-line);color:var(--accent-text);font-size:var(--fs-2xs);font-weight:var(--fw-semi);vertical-align:2px}" +
    ".dc-dayband{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:0 0 10px;padding:8px 12px;border-radius:var(--radius);background:var(--accent-soft);border-left:5px solid var(--accent);font-size:calc(12px*var(--dc-scale))}" +
    ".dc-dayband.d1{border-left-color:var(--info)}.dc-dayband.d2{border-left-color:var(--ok)}" +
    ".dc-dayk{font-size:calc(15px*var(--dc-scale));font-weight:var(--fw-bold);color:var(--text)}.dc-upnext{color:var(--text-2);margin-left:auto;overflow-wrap:anywhere}" +
    ".dc-cap{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:90;width:min(880px,calc(100vw - 32px));max-height:60vh;overflow:auto;" +
    "padding:14px 18px;border:2px solid var(--accent);border-radius:var(--radius-lg);background:var(--card);color:var(--text);box-shadow:var(--elev-modal)}" +
    ".dc-cap .dc-dayband{--dc-scale:1.2}.dc-cap-t{margin:0 0 6px;font-size:20px;line-height:var(--lh-tight)}.dc-cap-p{margin:0 0 10px;font-size:15px;line-height:var(--lh-body)}" +
    ".dc-cap-nav{display:flex;gap:8px;align-items:center;flex-wrap:wrap}a.dc-cap-open{text-decoration:none}" +
    ".dc-plbtn[aria-pressed=true]{box-shadow:0 0 0 2px var(--accent-soft)}" +
    "@media (max-width:560px){.dc-cap{bottom:8px;padding:10px 12px}.dc-cap-t{font-size:16px}.dc-cap-p{font-size:13px}.dc-upnext{margin-left:0}}" +
    "@media (max-width:560px){.dc-spot{padding:12px}.dc-k{min-width:0;display:block}.dc-ms{margin-left:0}}" +
    "body.demo-presenter #nc-sidebar,body.demo-presenter .sb-toggle,body.demo-presenter .sb-scrim,body.demo-presenter .topbar .search{display:none!important}" +
    "body.demo-presenter #demo-center-root{--dc-scale:1.45}body.demo-presenter .content{padding:22px 34px}" +
    "body.demo-presenter .dc-grid{grid-template-columns:minmax(0,1fr)}body.demo-presenter .dc-listcol{display:none}" +
    "@media (max-width:560px){body.demo-presenter #demo-center-root{--dc-scale:1.15}body.demo-presenter .content{padding:12px 16px}}";

  /* ── 브라우저 마운트 ─────────────────────────────────────────── */
  function mount(win) {
    var doc = win.document;
    var NC = win.NC = win.NC || {};
    /* NOCP 주소는 다른 화면과 같은 곳에서: NC.dsx.base() → localStorage 'nc-nocp' → :8000 */
    var client = createClient({ base: function () {
      if (NC.dsx && typeof NC.dsx.base === "function") return NC.dsx.base();
      try { return win.localStorage.getItem("nc-nocp") || "http://127.0.0.1:8000"; }
      catch (e) { return "http://127.0.0.1:8000"; }
    } });
    var st = { scenarios: [], sel: null, detail: null, run: null, live: null, busy: false, es: null, poll: null,
      pace: "normal", presenter: false, err: "", view: "timeline", focus: null,
      playlist: null, plPos: null, plAuto: true, plTimer: null, route: String(win.location && win.location.hash || "").replace(/^#\/?/, "") };
    NC.demoCenter = { state: st, client: client };
    NC.demoCenter.go = function (i) { return plGo(i); }; /* 발표·자동 점검용: 플레이리스트 i번 항목으로 */

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
      /* 다시 그려도 포커스를 잃지 않게: 포커스된 컨트롤의 식별자를 기억했다가 되돌린다 */
      var ae = doc.activeElement, keep = null;
      if (ae && root.contains(ae)) {
        ["data-dc-act", "data-dc-scn", "data-dc-view", "data-dc-focus", "data-ft-step"].some(function (k) {
          if (ae.hasAttribute(k)) { keep = "[" + k + '="' + ae.getAttribute(k) + '"]'; return true; } return false;
        });
        if (!keep && ae.id) keep = "#" + ae.id;
      }
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
        esc(st.presenter ? tx.presenterOff : tx.presenter) + "</button>" +
        '<label class="dc-auto"><input type="checkbox" id="dc-auto"' + (st.plAuto ? " checked" : "") + "> " + esc(tx.auto) + "</label>" +
        '<button type="button" class="btn dc-plbtn" data-dc-act="playlist" aria-pressed="' + (st.plPos != null) + '" title="' +
        esc(st.playlist && st.playlist.source === "nocp" ? tx.plNocp : tx.plLocal) + '">' + esc(st.plPos != null ? tx.playStop : tx.playAll) + "</button></span></div>" +
        '<div class="dc-grid"><div class="panel dc-listcol"><div class="ph"><span class="tick"></span><span class="t">' + esc(tx.scenarios) +
        '</span><span class="c">' + esc(st.scenarios.length) + "</span></div>" + renderList(st.scenarios, st.sel, lg, st.playlist) + "</div>" +
        '<div class="panel" aria-busy="' + st.busy + '">' +
        renderDetail(st.detail, st.run, lg, st.busy, { view: st.view, focus: st.focus, presenter: st.presenter,
          pl: st.playlist, plPos: st.plPos, scenarios: st.scenarios }) + "</div></div>";
      if (keep) { var el = root.querySelector(keep); if (el && !el.disabled) try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }
      renderCaption();
    }
    /* 화면 시연 자막 카드: 본문 밖(body)에 붙여 다른 콘솔 화면 위에 띄운다 */
    function renderCaption() {
      var host = $("dc-cap-host");
      var it = st.plPos != null && st.playlist ? st.playlist.items[st.plPos] : null;
      if (!it || it.kind !== "screen") { if (host) host.innerHTML = ""; return; }
      if (!host) { host = doc.createElement("div"); host.id = "dc-cap-host"; doc.body.appendChild(host); }
      var ae = doc.activeElement, keep = ae && host.contains(ae) && ae.getAttribute("data-dc-pl");
      host.innerHTML = captionHtml(st.playlist, st.plPos, lang(), { scenarios: st.scenarios });
      var b = host.querySelector(keep ? '[data-dc-pl="' + keep + '"]' : '[data-dc-pl="next"]');
      if (b) try { b.focus({ preventScroll: true }); } catch (e) { b.focus(); }
    }

    async function load() {
      try {
        if (!st.playlist) {
          try { st.playlist = normPlaylist(await client.playlist()); } catch (e) { st.playlist = null; }
          if (!st.playlist) st.playlist = fallbackPlaylist();
        }
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
      st.sel = id; st.run = null; st.focus = null;
      try { st.detail = await client.scenario(id); } catch (e) { st.detail = null; }
      if (!quiet) render();
    }
    function stopLive() {
      if (st.es) { st.es.close(); st.es = null; }
      if (st.poll) { clearInterval(st.poll); st.poll = null; }
    }
    function finish() {
      stopLive(); st.busy = false;
      client.get(st.run.id).then(function (r) { st.run = r; render(); announce(t(lang()).done); plAfterRun(r); }).catch(render);
    }

    /* ── Day 0→2 플레이리스트 ── */
    var DWELL = { fast: 4000, normal: 9000, slow: 15000 }, GAP = { fast: 1200, normal: 3000, slow: 5000 };
    function plItem() { return st.plPos != null && st.playlist ? st.playlist.items[st.plPos] : null; }
    function plClear() { if (st.plTimer) { clearTimeout(st.plTimer); st.plTimer = null; } }
    function plLater(ms) { plClear(); if (st.plAuto) st.plTimer = setTimeout(function () { st.plTimer = null; plGo(st.plPos + 1); }, ms); }
    function plAfterRun(r) {
      var it = plItem();
      if (it && it.kind === "scenario" && r && r.scenario_id === it.scenario) plLater(GAP[st.pace] || 3000);
    }
    function goRoute(id) { if (st.route !== id && NC.nav) NC.nav(id); }
    /* 전체 실행은 결정적 시드에서 시작한다(시나리오가 같은 NOCP 상태를 공유하므로): 전체 초기화 → 0번 항목 */
    async function plStart() {
      if (!st.playlist) st.playlist = fallbackPlaylist();
      if (!st.presenter) { st.presenter = true; doc.body.classList.add("demo-presenter"); }
      stopLive(); st.busy = true; st.plPos = 0; render();
      try { await client.reset("all"); announce(t(lang()).resetDone); } catch (e) { /* 초기화 실패해도 진행 */ }
      st.busy = false; st.run = null;
      if (st.plPos === 0) plGo(0);
    }
    function plStop(home) {
      plClear(); st.plPos = null;
      if (home) goRoute("demo-center");
      render();
    }
    async function plGo(i) {
      plClear();
      var items = st.playlist ? st.playlist.items : [];
      if (i < 0) return;
      if (i >= items.length) { announce(t(lang()).plDone); return plStop(true); }
      st.plPos = i;
      var it = items[i];
      if (it.kind === "screen") {
        stopLive(); st.busy = false;
        if (it.console === "ops") goRoute(it.route);
        render();
        return plLater(DWELL[st.pace] || 9000);
      }
      var known = st.scenarios.some(function (x) { return x.id === it.scenario; });
      if (!known) {
        announce(t(lang()).plMissing + ": " + it.scenario);
        st.plTimer = setTimeout(function () { st.plTimer = null; plGo(i + 1); }, 400);
        return;
      }
      goRoute("demo-center");
      try {
        await select(it.scenario, true);
        if (st.plPos !== i) return; /* 그 사이 중지·이동됨 */
        st.run = await client.run(it.scenario, "all", PACE[st.pace]);
        announce(t(lang()).started); render(); follow();
      } catch (e) {
        st.busy = false;
        if (NC.toast) NC.toast(esc(t(lang()).loadErr + ": " + e.message), "warn");
        render(); plLater(GAP[st.pace] || 3000);
      }
    }
    function plAct(a) {
      if (st.plPos == null) return;
      if (a === "next") return plGo(st.plPos + 1);
      if (a === "prev") return plGo(Math.max(0, st.plPos - 1));
      if (a === "home") { plClear(); goRoute("demo-center"); return render(); }
      if (a === "stop") return plStop(true);
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
      st.busy = true; st.focus = null;
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
    function stepCount() { return st.detail ? stepsOf(st.detail, st.run).length : 0; }
    function focusNow() { var s = st.detail ? stepsOf(st.detail, st.run) : []; return st.focus != null ? st.focus : currentIndex(s, st.run); }
    function moveFocus(d) {
      var n = stepCount(); if (!n) return;
      st.focus = d === "home" ? 0 : d === "end" ? n - 1 : Math.max(0, Math.min(n - 1, focusNow() + d));
      render();
    }

    async function act(a) {
      var lg = lang();
      try {
        if (a === "presenter") {
          st.presenter = !st.presenter;
          doc.body.classList.toggle("demo-presenter", st.presenter);
          if (!st.presenter && st.plPos != null) return plStop(true);
          return render();
        }
        if (a === "playlist") return st.plPos != null ? plStop(true) : plStart();
        if (a === "prev") return moveFocus(-1);
        if (a === "fnext") return moveFocus(1);
        if (a === "reset" || a === "reset-all") {
          stopLive(); st.busy = true; render();
          await client.reset(a === "reset" ? "nocp" : "all");
          st.busy = false; st.run = null; st.focus = null;
          announce(t(lg).resetDone);
          return load();
        }
        if (!st.sel) return;
        if (a === "run") {
          st.run = await client.run(st.sel, "all", PACE[st.pace]);
          announce(t(lg).started); render(); return follow();
        }
        if (a === "step") { st.run = await client.run(st.sel, "step"); st.focus = null; return render(); }
        if (a === "next" && st.run) {
          st.busy = true; st.focus = null; render();
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
      var p = e.target.closest && e.target.closest("[data-dc-pl]");
      if (p && (p.closest("#demo-center-root") || p.closest("#dc-cap-host"))) return plAct(p.dataset.dcPl);
      var b = e.target.closest && e.target.closest("[data-dc-act],[data-dc-scn],[data-dc-view],[data-dc-focus],[data-ft-step]");
      if (!b || !b.closest("#demo-center-root")) return;
      if (b.dataset.dcScn) return select(b.dataset.dcScn);
      if (b.dataset.dcView) { st.view = b.dataset.dcView; return render(); }
      if (b.dataset.dcFocus != null) { st.focus = +b.dataset.dcFocus; return render(); }
      if (b.dataset.ftStep != null) { st.focus = +b.dataset.ftStep; return render(); }
      act(b.dataset.dcAct);
    });
    /* NC.flow 의 키보드 선택 이벤트(스윔레인 칩)도 받는다 */
    doc.addEventListener("nc-flow-select", function (e) {
      var id = e.detail && (e.detail.id != null ? e.detail.id : e.detail);
      if (e.target && e.target.closest && e.target.closest("#demo-center-root") && id != null && !isNaN(+id)) { st.focus = +id; render(); }
    });
    doc.addEventListener("change", function (e) {
      if (e.target && e.target.id === "dc-pace") { st.pace = e.target.value; }
      if (e.target && e.target.id === "dc-auto") { st.plAuto = !!e.target.checked; if (!st.plAuto) plClear(); else if (st.plPos != null && !st.busy) plLater(GAP[st.pace] || 3000); }
    });
    doc.addEventListener("keydown", function (e) {
      if (!st.presenter || !$("demo-center-root")) return;
      var tg = e.target && e.target.tagName;
      if (tg === "SELECT" || tg === "INPUT" || tg === "TEXTAREA") return;
      var stepping = st.run && st.run.mode === "step" && st.run.state !== "done";
      var pit = plItem();
      if (pit && pit.kind === "screen") {
        if (e.key === "Escape") { e.preventDefault(); act("presenter"); }
        else if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); plAct("next"); }
        else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); plAct("prev"); }
        return;
      }
      var runDone = st.run && st.run.state === "done";
      if (pit && runDone && (e.key === "ArrowRight" || e.key === "PageDown") && focusNow() >= stepCount() - 1) { e.preventDefault(); return plAct("next"); }
      if (e.key === "Escape") act("presenter");
      else if ((e.key === "ArrowRight" || e.key === "PageDown") && stepping && st.focus == null && !st.busy) { e.preventDefault(); act("next"); }
      else if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); moveFocus(1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); moveFocus(-1); }
      else if (e.key === "Home") { e.preventDefault(); moveFocus("home"); }
      else if (e.key === "End") { e.preventDefault(); moveFocus("end"); }
    });
    /* 언어 토글(html lang 변경) 시 다시 그리기 — 러너 문자열은 KO/EN 둘 다 받는다 */
    try {
      new win.MutationObserver(function () { if ($("demo-center-root") && $("demo-center-root").offsetParent !== null) render(); })
        .observe(doc.documentElement, { attributes: true, attributeFilter: ["lang"] });
    } catch (e) { /* old browsers */ }

    if (NC.bus) NC.bus.on("route", function (id) {
      st.route = id;
      if (id === "demo-center") load();
      else if (st.plPos != null) renderCaption(); /* 플레이리스트 화면 시연 중: 발표 모드·자막 유지 */
      else { stopLive(); if (st.presenter) { st.presenter = false; doc.body.classList.remove("demo-presenter"); } }
    });
  }

  return { T: T, TALK: TALK, LANES: LANES, badge: badge, verdictBadge: verdictBadge, href: href, renderList: renderList,
    renderDetail: renderDetail, stepHtml: stepHtml, msgHtml: msgHtml, swimHtml: swimHtml, laneOf: laneOf, lanesFor: lanesFor,
    summaryCard: summaryCard, spotlight: spotlight, progressHtml: progressHtml, currentIndex: currentIndex, isShowcase: isShowcase,
    PLAYLIST: PLAYLIST, normPlaylist: normPlaylist, fallbackPlaylist: fallbackPlaylist, dayIndex: dayIndex, dayLabel: dayLabel,
    dayBanner: dayBanner, captionHtml: captionHtml, screenRef: screenRef,
    createClient: createClient, mount: mount, CSS: CSS };
});
