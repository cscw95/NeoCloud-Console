/* NeoCloud v2 Phase 1 데이터 계층 — IMPROVEMENT-PLAN-v2.md 계약 E–H (F01·F02·F04~F07·F09~F11).
   규칙은 shared/dsx-api.js 와 같다:
   ① NOCP 경유만 (/api/v1, OpenAI 호환 공개 경로 /v1, OIDC /.well-known · /oauth2)
   ② 게터는 { live, src, data } — NOCP 미기동·404·5xx 시 결정적 mock(live:false) → 화면에 MOCK 배지
   ③ 액션은 4xx(404 제외) 시 { live:true, error, status } 로 표면화, 네트워크/404/5xx 는 mock 시뮬레이션
   ④ 인증: 고객 세션 → X-Tenant-Id/X-Tenant-Role, 그 외 → X-Operator (shared/nocp-auth.js),
      토큰 API 호출만 Authorization: Bearer <api-key>
   백엔드가 머지되면 mock 은 자동으로 쓰이지 않는다(라이브 우선). 브라우저(window.NC.v2)와 node 테스트 양쪽에서 동작. */
(function (root, factory) {
  var mod = factory();
  if (typeof module === "object" && module.exports) module.exports = mod;
  if (root && root.document) {
    root.NC = root.NC || {};
    root.NC.v2 = mod.create({});
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  var SLO_TARGET = { ttft_p99_ms: 2000, tpot_p99_ms: 50 };
  var REM_STEPS = ["cordon", "drain", "gpu_reset", "revalidate", "replace", "isolate_sanitize", "rma", "return_to_pool"];
  var VAT = 0.10;

  function pad(n, w) { n = String(n); while (n.length < w) n = "0" + n; return n; }
  function rng(seed) {
    var s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function arr(x, keys) {
    if (Array.isArray(x)) return x;
    if (x && typeof x === "object") {
      var ks = (keys || []).concat(["items", "data", "results"]);
      for (var i = 0; i < ks.length; i++) if (Array.isArray(x[ks[i]])) return x[ks[i]];
    }
    return [];
  }
  function iso(ms) { return new Date(ms).toISOString(); }
  function period(ms) { return iso(ms).slice(0, 7); }
  function sum(a, f) { return a.reduce(function (s, x) { return s + (+f(x) || 0); }, 0); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  /* 청구서 금액 계산 — 계약 F05: lines → subtotal(+true-up −credits) → VAT 10%(원 단위 반올림) → total */
  function priceInvoice(inv) {
    var usage = Math.round(sum(inv.lines, function (l) { return l.amount; }));
    var credits = Math.round(sum(inv.sla_credits || [], function (c) { return c.amount; }));
    var sub = usage + (inv.commitment_true_up || 0) - credits;
    if (sub < 0) sub = 0;
    inv.subtotal = sub;
    inv.vat = Math.round(sub * VAT);
    inv.total = inv.subtotal + inv.vat;
    return inv;
  }

  /* ══ mock 시나리오 (기준 시각 고정 → 새로고침마다 같은 값) ══ */
  function buildMock(now) {
    var r = rng(20261110);
    var T0 = Date.parse("2026-11-10T09:00:00Z");
    var cur = period(now || T0);
    var prev = period(Date.parse(cur + "-01T00:00:00Z") - 86400000);
    var M = { seq: 100, now: now || T0, cur: cur, prev: prev };
    M.tenants = {
      "tnt-fin-corp": { tenant_id: "tnt-fin-corp", org_name: "핀코프", business_reg_no: "214-86-12345", status: "active",
        public_sector: false, admin_email: "admin@fin-corp.example", created_at: "2026-07-01T00:00:00Z" },
      "tnt-gov-lab": { tenant_id: "tnt-gov-lab", org_name: "국가AI연구소", business_reg_no: "105-82-00077", status: "pending_verification",
        public_sector: true, admin_email: "it@gov-lab.example", created_at: iso((now || T0) - 3600000) },
    };
    M.sso = { "tnt-fin-corp": { issuer_url: "", client_id: "", enabled: false } };
    M.contracts = [
      { id: "ctr-0001", tenant_id: "tnt-fin-corp", product: "bmaas", commitment: "reserved", racks: 4,
        blueprint_key: "vr-nvl72", term_months: 12, start_date: "2026-08-01", unit_price: 310000,
        min_monthly_amount: 890000000, placement: { same_ib_zone: true }, sla_tier: "99.9", status: "active" },
      { id: "ctr-0002", tenant_id: "tnt-fin-corp", product: "token-api", commitment: "reserved", term_months: 6,
        start_date: "2026-10-01", unit_price: 0.0021, min_monthly_amount: 20000000, sla_tier: "99.9", status: "active" },
      { id: "ctr-0003", tenant_id: "tnt-gov-lab", product: "managed-k8s", commitment: "reserved", racks: 2,
        blueprint_key: "vr-nvl72", term_months: 24, start_date: "2026-12-01", unit_price: 298000,
        min_monthly_amount: 430000000, placement: { same_ib_zone: true }, sla_tier: "99.95", status: "draft" },
    ];
    M.models = [
      { id: "kanana-2-70b-instruct", object: "model", created: 1760000000, owned_by: "neocloud", context_length: 131072, tiers: ["interactive", "batch"] },
      { id: "llama-4-maverick", object: "model", created: 1760000000, owned_by: "neocloud", context_length: 262144, tiers: ["interactive", "batch"] },
      { id: "qwen3-235b-a22b", object: "model", created: 1760000000, owned_by: "neocloud", context_length: 131072, tiers: ["interactive", "batch"] },
    ];
    M.deployments = M.models.map(function (m, i) {
      return { model: m.id, engine: "dynamo", mode: i === 1 ? "agg" : "disagg", prefill_workers: 4 - i, decode_workers: 8 - 2 * i,
        racks: ["ansan-f1-r" + pad(3 + i, 2)], gpus: 72, state: "ready" };
    });
    M.keys = [
      { key_id: "key-0001", tenant_id: "tnt-fin-corp", name: "prod-backend", scope: "inference", prefix: "nc_sk_fin-corp…",
        created_at: "2026-10-02T01:00:00Z", state: "active", last_used: iso((now || T0) - 120000) },
      { key_id: "key-0002", tenant_id: "tnt-fin-corp", name: "batch-etl", scope: "inference", prefix: "nc_sk_fin-corp…",
        created_at: "2026-10-20T05:00:00Z", state: "active", last_used: null },
    ];
    M.quotas = [
      { tenant_id: "tnt-fin-corp", tier: "interactive", tpm: 2000000, rpm: 600, monthly_token_cap: 5000000000, used_tpm: 412000, used_rpm: 131, month_tokens: 1820000000 },
      { tenant_id: "tnt-fin-corp", tier: "batch", tpm: 6000000, rpm: 120, monthly_token_cap: null, used_tpm: 2100000, used_rpm: 18, month_tokens: 3400000000 },
      { tenant_id: "tnt-gov-lab", tier: "interactive", tpm: 500000, rpm: 200, monthly_token_cap: 500000000, used_tpm: 0, used_rpm: 0, month_tokens: 0 },
    ];
    M.overrides = [];
    M.tokensByType = { input: 2810000000, cached: 1240000000, output: 1050000000, reasoning: 120000000 };
    M.priceBook = { currency: "KRW", items: [
      { product: "bmaas", metric: "rack_hour", unit_price: 310000, commitment: "reserved" },
      { product: "bmaas", metric: "rack_hour", unit_price: 372000, commitment: "on_demand" },
      { product: "managed-k8s", metric: "node_hour", unit_price: 4600, commitment: "on_demand" },
      { product: "token-api", metric: "token", model: "kanana-2-70b-instruct", token_type: "input", tier: "interactive", unit_price: 0.0021 },
      { product: "token-api", metric: "token", model: "kanana-2-70b-instruct", token_type: "cached", tier: "interactive", unit_price: 0.0005 },
      { product: "token-api", metric: "token", model: "kanana-2-70b-instruct", token_type: "output", tier: "interactive", unit_price: 0.0084 },
      { product: "token-api", metric: "token", model: "kanana-2-70b-instruct", token_type: "reasoning", tier: "interactive", unit_price: 0.0084 },
    ] };
    function inv(id, tid, per, status, lines, trueUp, credits) {
      return priceInvoice({ id: id, tenant_id: tid, period: per, currency: "KRW", status: status, lines: lines,
        commitment_true_up: trueUp, sla_credits: credits, issued_at: per + "-01T00:00:00Z" });
    }
    var L = function (product, metric, q, p) { return { product: product, metric: metric, quantity: q, unit_price: p, amount: Math.round(q * p) }; };
    M.invoices = [
      inv("inv-" + prev.replace("-", "") + "-0001", "tnt-fin-corp", prev, "paid", [
        L("bmaas", "rack_hour", 2976, 310000), L("token-api", "token·input", 2810000000, 0.0021),
        L("token-api", "token·cached", 1240000000, 0.0005), L("token-api", "token·output", 1050000000, 0.0084)], 0,
        [{ credit_id: "crd-0007", amount: 46125000, applied_invoice: "inv-" + prev.replace("-", "") + "-0001" }]),
      inv("inv-" + cur.replace("-", "") + "-0001", "tnt-fin-corp", cur, "draft", [
        L("bmaas", "rack_hour", 864, 310000), L("token-api", "token·input", 610000000, 0.0021),
        L("token-api", "token·output", 240000000, 0.0084)], 0, []),
    ];
    M.invoices[0].paid_at = cur + "-03T02:00:00Z";
    M.payMethods = [{ id: "pm-0001", tenant_id: "tnt-fin-corp", kind: "bank_transfer", label: "기업 계좌 이체", default: true }];
    M.slaExceptions = [
      { id: "slx-0001", kind: "grid_curtailment", start: prev + "-14T05:00:00Z", end: prev + "-14T05:40:00Z",
        scope: { site: "ansan" }, contract_clause: "§7.2 전력망 감축 면책" },
      { id: "slx-0002", kind: "maintenance", start: cur + "-04T17:00:00Z", end: cur + "-04T19:00:00Z",
        scope: { racks: ["gasan-f1-r07"] }, contract_clause: "§7.1 계획 점검(72h 사전 통지)" },
    ];
    M.downtime = [
      { instance_id: "inst-fin-0012", start: prev + "-14T05:05:00Z", end: prev + "-14T05:35:00Z", minutes: 30, cause: "grid curtailment", exception_id: "slx-0001" },
      { instance_id: "inst-fin-0031", start: prev + "-22T11:02:00Z", end: prev + "-22T12:10:00Z", minutes: 68, cause: "XID 79 GPU fallen off bus → 교체" },
      { instance_id: "inst-fin-0007", start: cur + "-04T17:00:00Z", end: cur + "-04T18:10:00Z", minutes: 70, cause: "planned maintenance", exception_id: "slx-0002" },
    ];
    M.policy = { mode: "monitor", actions: { cordon: true, drain: true, gpu_reset: true, replace: true, rma: true },
      max_parallel_per_rack: 1, kpi_replace_minutes: 60 };
    var t1 = Date.parse(prev + "-22T11:02:00Z"), t2 = (now || T0) - 50 * 60000;
    function steps(t, names, mins, last) {
      var acc = t;
      return names.map(function (n, i) {
        acc += (mins[i] || 1) * 60000;
        return { name: n, state: i === names.length - 1 && last ? last : "done", at: iso(acc) };
      });
    }
    M.runs = [
      { id: "rem-0001", trigger: { event_id: "evt-xid-5512", kind: "XID 79" },
        target: { machine_id: "gasan-f1-r07-t03", tenant_id: "tnt-fin-corp", cluster_id: "nvke-0003" },
        steps: steps(t1, ["cordon", "drain", "gpu_reset", "revalidate", "replace", "isolate_sanitize", "rma", "return_to_pool"],
          [1, 6, 4, 3, 22, 18, 1, 12]), mttr_min: 36, outcome: "replaced", rma_id: "rma-0042", started_at: iso(t1) },
      { id: "rem-0002", trigger: { event_id: "evt-nvl-0331", kind: "NVLink CRC" },
        target: { machine_id: "ansan-f1-r12-t11", tenant_id: "tnt-fin-corp" },
        steps: steps(Date.parse(cur + "-02T03:00:00Z"), ["cordon", "drain", "gpu_reset", "revalidate"], [1, 5, 3, 4]),
        mttr_min: 13, outcome: "recovered", started_at: cur + "-02T03:00:00Z" },
      { id: "rem-0003", trigger: { event_id: "evt-sel-9021", kind: "SEL PSU" },
        target: { machine_id: "ansan-f2-r03-t02", tenant_id: "tnt-gov-lab" },
        steps: steps(t2, ["cordon", "drain", "gpu_reset", "revalidate", "replace"], [1, 7, 4, 3, 1], "running"),
        mttr_min: null, outcome: null, started_at: iso(t2) },
    ];
    M.nvkeTopo = {};
    M.r = r;
    return M;
  }

  /* NVKE 토폴로지 mock — 계약 F11: 노드풀의 랙마다 클리크 1개 · ComputeDomain 1개(IMEX = NVL72 랙) */
  function mockTopo(M, cid) {
    if (M.nvkeTopo[cid]) return M.nvkeTopo[cid];
    var racks = ["ansan-f1-r" + pad(10 + (cid.length % 5), 2), "ansan-f1-r" + pad(11 + (cid.length % 5), 2)];
    var nodes = [], machines = [];
    racks.forEach(function (rk, ri) {
      for (var t = 1; t <= 18; t++) {
        var name = cid + "-np1-" + pad(ri * 18 + t, 3), iid = "inst-" + rk + "-t" + pad(t, 2);
        nodes.push({ name: name, nodepool: "np1", nico_instance_id: iid,
          labels: { "nvidia.com/gpu.clique": "nvl72-" + rk + "." + (ri + 1),
            "topology.kubernetes.io/zone": rk, "network.topology.nvidia.com/ib-spine": "spine-" + (ri + 1) },
          attestation: { tpm: "verified", spiffe_id: "spiffe://neocloud/nvke/" + cid + "/" + name },
          join: { agent: "nvke-agent", state: "joined" }, gpus: 4 });
        machines.push({ name: "nm-" + name, nico_instance_id: iid, rack_id: rk, phase: "Running" });
      }
    });
    M.nvkeTopo[cid] = {
      capi: { cluster: { name: cid, phase: "Provisioned" },
        machine_deployments: racks.map(function (rk, i) { return { name: cid + "-np1-md" + i, replicas: 18, failure_domain: rk }; }),
        nico_machines: machines },
      nodes: nodes,
      domains: racks.map(function (rk, i) {
        return { name: cid + "-cd-" + (i + 1), nodepool: "np1", racks: [rk], imex_channels: 18, status: "Ready" };
      }),
    };
    return M.nvkeTopo[cid];
  }

  var CANNED = "안녕하세요. NeoCloud 토큰 API 응답 예시입니다. 이 응답은 백엔드가 연결되지 않아 콘솔이 만든 모의 스트림이며, 마지막 청크에 usage 가 붙습니다.";

  /* ══ 팩토리 ═══════════════════════════════════════════════════ */
  function create(opts) {
    opts = opts || {};
    var g = typeof window !== "undefined" ? window : globalThis;
    var doFetch = opts.fetch || (g.fetch ? g.fetch.bind(g) : null);
    var timeoutMs = opts.timeoutMs || 2500;
    var sleep = opts.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    function base() {
      if (opts.base) return opts.base;
      try { return g.localStorage.getItem("nc-nocp") || "http://127.0.0.1:8000"; }
      catch (e) { return "http://127.0.0.1:8000"; }
    }
    var AUTH = g.NC_AUTH || (typeof require === "function" ? require("./nocp-auth.js") : null);
    function tok() { return opts.token !== undefined ? opts.token : AUTH.token(g); }
    function session() {
      return opts.session ? opts.session()
        : (g.NC && typeof g.NC.session === "function" ? g.NC.session() : null);
    }
    function authHeaders() { return AUTH.headers(session(), g, tok()); }
    var M = buildMock(opts.now);
    var state = { lastLive: null };
    /* 원문 기록 — 시연 화면이 실제 요청·응답(헤더·본문)을 보여준다. Authorization 은 앞 12자만. */
    var TRACE = [], traceSubs = [];
    function redact(h) {
      var o = {};
      Object.keys(h || {}).forEach(function (k) {
        o[k] = /^authorization$/i.test(k) ? String(h[k]).slice(0, 12) + "…" : h[k];
      });
      return o;
    }
    function trace(t) {
      t.at = new Date().toISOString();
      if (typeof t.res_body === "string" && t.res_body.length > 4000) t.res_body = t.res_body.slice(0, 4000) + "…";
      TRACE.push(t); if (TRACE.length > 60) TRACE.shift();
      traceSubs.forEach(function (f) { try { f(t); } catch (e) { /* 구독자 오류 무시 */ } });
    }
    function traceMock(url, method, body, data) {
      trace({ method: method || "GET", url: url, req_headers: {}, req_body: body, status: "MOCK", res_headers: {},
        res_body: data === undefined ? "" : JSON.stringify(data, null, 2) });
    }

    async function req(url, method, body, extra) {
      if (!doFetch) throw Object.assign(new Error("no fetch"), { network: true });
      var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var t = ctl ? setTimeout(function () { ctl.abort(); }, timeoutMs) : null;
      var headers = extra && extra.headers ? extra.headers : authHeaders();
      var payload;
      if (body !== undefined) {
        if (extra && extra.form) { headers["Content-Type"] = "application/x-www-form-urlencoded"; payload = body; }
        else { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
      }
      try {
        var r;
        try {
          r = await doFetch(base() + url, { method: method || "GET", headers: headers, body: payload,
            signal: ctl ? ctl.signal : undefined });
        } catch (e) { throw Object.assign(new Error(e && e.message || "network"), { network: true }); }
        var txt = await r.text();
        var j = null;
        try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = null; }
        var rh = {};
        ["content-type", "x-request-id", "retry-after", "x-ratelimit-remaining-tokens", "x-ratelimit-remaining-requests"].forEach(function (k) {
          var v = r.headers && r.headers.get ? r.headers.get(k) : null; if (v != null) rh[k] = v;
        });
        trace({ method: method || "GET", url: base() + url, req_headers: redact(headers), req_body: payload, status: r.status, res_headers: rh,
          res_body: j != null ? JSON.stringify(j, null, 2) : txt });
        if (!r.ok) {
          var d = j && j.detail != null ? j.detail : j && j.error ? (j.error.message || j.error.type) : txt || ("HTTP " + r.status);
          throw Object.assign(new Error(typeof d === "string" ? d : JSON.stringify(d)), { status: r.status, body: j });
        }
        state.lastLive = true;
        return j;
      } finally { if (t) clearTimeout(t); }
    }
    async function get(url, mockFn, norm) {
      try {
        var j = await req(url);
        return { live: true, src: url.split("?")[0], data: norm ? norm(j) : j };
      } catch (e) {
        if (e.status === 401 || e.status === 403)
          return { live: true, src: url.split("?")[0], error: e.message, status: e.status, data: mockFn() };
        state.lastLive = false;
        var md = mockFn();
        traceMock(url, "GET", undefined, md);
        return { live: false, src: "mock", data: md };
      }
    }
    async function act(url, method, body, mockFn, extra) {
      try {
        var j = await req(url, method, body, extra);
        return { live: true, src: url.split("?")[0], data: j };
      } catch (e) {
        if (e.status && e.status >= 400 && e.status < 500 && e.status !== 404)
          return { live: true, src: url.split("?")[0], error: e.message, status: e.status, body: e.body };
        var out;
        try { out = mockFn ? mockFn() : null; }
        catch (me) { traceMock(url, method, body, { detail: me.message }); return { live: false, src: "mock", error: me.message, status: me.status || 400 }; }
        traceMock(url, method, body, out);
        return { live: false, src: "mock", data: out };
      }
    }
    function q(o) {
      var s = Object.keys(o || {}).filter(function (k) { return o[k] != null && o[k] !== ""; })
        .map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(o[k]); }).join("&");
      return s ? "?" + s : "";
    }
    function nextId(p) { M.seq += 1; return p + "-" + pad(M.seq, 4); }
    function fail(msg, status) { throw Object.assign(new Error(msg), { status: status || 409 }); }
    function byTenant(list, tid) { return list.filter(function (x) { return !tid || x.tenant_id === tid; }); }
    function V(p) { return "/api/v1" + p; }

    /* SSE 파서 — "data: {...}\n\n" · "data: [DONE]" */
    function sseFeed(buf, onEvent) {
      var parts = buf.split(/\r?\n\r?\n/);
      var rest = parts.pop();
      parts.forEach(function (blk) {
        blk.split(/\r?\n/).forEach(function (line) {
          if (line.indexOf("data:") !== 0) return;
          var d = line.slice(5).trim();
          if (!d) return;
          if (d === "[DONE]") return onEvent(null, true);
          try { onEvent(JSON.parse(d)); } catch (e) { /* 깨진 청크 무시 */ }
        });
      });
      return rest;
    }
    function mockUsage(messages, text) {
      var p = Math.max(8, Math.round(JSON.stringify(messages || []).length / 3.2));
      var c = Math.max(1, Math.round(text.length / 2.1));
      var cached = Math.floor(p * 0.4);
      return { prompt_tokens: p, cached_tokens: cached, completion_tokens: c, reasoning_tokens: 0, total_tokens: p + c };
    }

    var api = {
      SLO_TARGET: SLO_TARGET, REM_STEPS: REM_STEPS, VAT: VAT, priceInvoice: priceInvoice,
      groupByClique: groupByClique, runDurations: runDurations,
      base: base, isLive: function () { return state.lastLive; }, _mock: M, _sse: sseFeed,
      trace: function () { return TRACE.slice(); }, onTrace: function (f) { traceSubs.push(f); },
      clearTrace: function () { TRACE.length = 0; },
      /* 시연 초기화 — mock 시나리오를 시드부터 다시 만든다(라이브 데이터는 건드리지 않음) */
      resetMock: function () { var n = buildMock(opts.now); Object.keys(M).forEach(function (k) { delete M[k]; }); Object.assign(M, n); TRACE.length = 0; },

      /* ── F07 가입 · 조직 · OIDC ─────────────────────────────── */
      signup: function (b) {
        return act(V("/signup"), "POST", b, function () {
          if (!b || !b.org_name || !b.business_reg_no || !b.admin_email) fail("org_name, business_reg_no, admin_email 필수", 422);
          if (!/^\d{3}-?\d{2}-?\d{5}$/.test(String(b.business_reg_no))) fail("사업자등록번호 형식 오류 (000-00-00000)", 422);
          var tid = "tnt-" + String(b.org_name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 16);
          if (tid === "tnt-") tid = nextId("tnt");
          if (M.tenants[tid]) tid = nextId(tid);
          M.tenants[tid] = { tenant_id: tid, org_name: b.org_name, business_reg_no: b.business_reg_no, status: "pending_verification",
            public_sector: !!b.public_sector, admin_email: b.admin_email, admin_name: b.admin_name, created_at: iso(Date.now()) };
          return { tenant_id: tid, status: "pending_verification" };
        });
      },
      signupVerify: function (tid) {
        return act(V("/signup/" + encodeURIComponent(tid) + "/verify"), "POST", {}, function () {
          var t = M.tenants[tid]; if (!t) fail("tenant not found", 404);
          t.status = "active";
          if (t.public_sector) t.guard_policy = "enforce";
          return { tenant_id: tid, status: "active" };
        });
      },
      /* 운영자 가입 승인 대기열 — 계약에 목록 경로가 없어 기존 GET /tenants 를 읽고 status 로 거른다 */
      signups: function () {
        return get(V("/tenants"), function () {
          return Object.keys(M.tenants).map(function (k) { return clone(M.tenants[k]); });
        }, function (j) { return arr(j, ["tenants"]); });
      },
      oidcConfig: function () {
        return get("/.well-known/openid-configuration", function () {
          var b = base();
          /* OpenID Connect Discovery 1.0 §3 필수 필드 (issuer, authorization_endpoint, jwks_uri, response_types_supported,
             subject_types_supported, id_token_signing_alg_values_supported) */
          return { issuer: b, authorization_endpoint: b + "/oauth2/authorize", token_endpoint: b + "/oauth2/token", jwks_uri: b + "/oauth2/jwks",
            response_types_supported: ["code", "token"], subject_types_supported: ["public"],
            grant_types_supported: ["password", "client_credentials", "refresh_token"],
            id_token_signing_alg_values_supported: ["HS256", "RS256"] };
        });
      },
      oauthToken: function (form) {
        var body = Object.keys(form).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(form[k]); }).join("&");
        return act("/oauth2/token", "POST", body, function () {
          var s = session() || {};
          var claims = { sub: form.username || form.client_id || "user", tid: s.tenant_id || "tnt-fin-corp",
            trole: s.role || "admin", scope: form.scope || "openid", exp: Math.floor(Date.now() / 1000) + 3600 };
          var enc = function (o) { return (typeof btoa === "function" ? btoa(JSON.stringify(o)) : Buffer.from(JSON.stringify(o)).toString("base64")).replace(/=+$/, ""); };
          return { access_token: enc({ alg: "HS256", typ: "JWT" }) + "." + enc(claims) + ".mock-signature",
            token_type: "Bearer", expires_in: 3600, refresh_token: "mock-refresh", claims: claims };
        }, { form: true, headers: {} });
      },
      sso: function (tid) {
        return get(V("/tenants/" + encodeURIComponent(tid) + "/sso"), function () {
          return clone(M.sso[tid] || { issuer_url: "", client_id: "", enabled: false });
        });
      },
      ssoPut: function (tid, b) {
        return act(V("/tenants/" + encodeURIComponent(tid) + "/sso"), "PUT", b, function () {
          if (b.issuer_url && !/^https:\/\//.test(b.issuer_url)) fail("issuer_url 은 https:// 로 시작해야 합니다", 422);
          M.sso[tid] = { issuer_url: b.issuer_url, client_id: b.client_id, enabled: !!(b.issuer_url && b.client_id) };
          return clone(M.sso[tid]);
        });
      },
      members: function () {
        return get(V("/members"), function () {
          return [{ member_id: "mem-0001", email: "admin@fin-corp.example", role: "admin", state: "active" },
            { member_id: "mem-0002", email: "ml-eng@fin-corp.example", role: "developer", state: "active" },
            { member_id: "mem-0003", email: "finance@fin-corp.example", role: "viewer", state: "invited" }];
        });
      },

      /* ── F06 약정 계약 ──────────────────────────────────────── */
      contracts: function (tid) {
        return get(V("/contracts" + q({ tenant_id: tid })), function () { return clone(byTenant(M.contracts, tid)); },
          function (j) { return arr(j, ["contracts"]); });
      },
      contract: function (id) {
        return get(V("/contracts/" + encodeURIComponent(id)), function () {
          return clone(M.contracts.find(function (c) { return c.id === id; }) || null);
        });
      },
      contractCreate: function (b) {
        return act(V("/contracts"), "POST", b, function () {
          if (!b.tenant_id || !b.product || !b.term_months || !b.start_date) fail("tenant_id, product, term_months, start_date 필수", 422);
          if ((b.product === "bmaas" || b.product === "managed-k8s") && !(b.racks > 0)) fail("racks 필수 (bmaas/managed-k8s)", 422);
          var c = Object.assign({ commitment: "reserved", sla_tier: "99.9" }, clone(b), { id: nextId("ctr"), status: "draft" });
          M.contracts.push(c);
          return clone(c);
        });
      },
      contractPatch: function (id, b) {
        return act(V("/contracts/" + encodeURIComponent(id)), "PATCH", b, function () {
          var c = M.contracts.find(function (x) { return x.id === id; }); if (!c) fail("contract not found", 404);
          if (c.status !== "draft") fail("draft 상태에서만 수정할 수 있습니다", 409);
          Object.assign(c, b); return clone(c);
        });
      },
      contractActivate: function (id) {
        return act(V("/contracts/" + encodeURIComponent(id) + "/activate"), "POST", {}, function () {
          var c = M.contracts.find(function (x) { return x.id === id; }); if (!c) fail("contract not found", 404);
          if (c.status !== "draft") fail("이미 " + c.status + " 상태입니다", 409);
          c.status = "active"; return clone(c);
        });
      },

      /* ── F01 토큰 API (OpenAI 호환) · F02 쿼터 · F04 계측 ───── */
      apiKeys: function () {
        var tid = (session() || {}).tenant_id;
        return get(V("/api-keys"), function () { return clone(byTenant(M.keys, tid || "tnt-fin-corp")); });
      },
      apiKeyCreate: function (b) {
        return act(V("/api-keys"), "POST", b, function () {
          var tid = (session() || {}).tenant_id || "tnt-fin-corp";
          var id = nextId("key"), secret = "nc_sk_mock_" + pad((M.seq * 2654435761 >>> 0).toString(16), 8);
          var k = { key_id: id, tenant_id: tid, name: b.name, scope: b.scope || "inference", prefix: secret.slice(0, 14) + "…",
            created_at: iso(Date.now()), state: "active", last_used: null };
          M.keys.push(k);
          return Object.assign({ secret: secret }, k);
        });
      },
      apiKeyRevoke: function (id) {
        return act(V("/api-keys/" + encodeURIComponent(id)), "DELETE", undefined, function () {
          M.keys = M.keys.filter(function (k) { return k.key_id !== id; }); return null;
        });
      },
      models: function (key) {
        var h = key ? { Authorization: "Bearer " + key } : authHeaders();
        return (async function () {
          try {
            var j = await req("/v1/models", "GET", undefined, { headers: h });
            return { live: true, src: "/v1/models", data: arr(j) };
          } catch (e) {
            if (e.status === 401) return { live: true, src: "/v1/models", error: e.message, status: 401, data: clone(M.models) };
            return { live: false, src: "mock", data: clone(M.models) };
          }
        })();
      },
      /* 채팅 완성 — stream=true 면 onDelta(text)·onUsage(usage) 콜백으로 청크를 넘긴다.
         결과 {live, text, usage, request_id, ratelimit:{tokens, requests}, error?, status?, retry_after?} */
      chat: async function (body, key, cb) {
        cb = cb || {};
        var rid = body.request_id || ("req-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e6).toString(36));
        var h = { "Content-Type": "application/json", "x-request-id": rid };
        if (key) h.Authorization = "Bearer " + key;
        var payload = { model: body.model, messages: body.messages, stream: !!body.stream, max_tokens: body.max_tokens,
          service_tier: body.service_tier };
        var r;
        try {
          if (!doFetch) throw new Error("no fetch");
          r = await doFetch(base() + "/v1/chat/completions", { method: "POST", headers: h, body: JSON.stringify(payload) });
        } catch (e) { r = null; }
        if (r && r.status !== 404 && r.status < 500) {
          var rl = { tokens: r.headers && r.headers.get ? r.headers.get("x-ratelimit-remaining-tokens") : null,
            requests: r.headers && r.headers.get ? r.headers.get("x-ratelimit-remaining-requests") : null };
          var reqId = (r.headers && r.headers.get && r.headers.get("x-request-id")) || rid;
          var chatTrace = { method: "POST", url: base() + "/v1/chat/completions", req_headers: redact(h), req_body: JSON.stringify(payload), status: r.status,
            res_headers: { "content-type": r.headers && r.headers.get ? r.headers.get("content-type") : null, "x-request-id": reqId,
              "x-ratelimit-remaining-tokens": rl.tokens, "x-ratelimit-remaining-requests": rl.requests }, res_body: "" };
          if (!r.ok) {
            var et = await r.text(), ej = null;
            try { ej = JSON.parse(et); } catch (e) { ej = null; }
            chatTrace.res_body = et; trace(chatTrace);
            var er = ej && ej.error ? ej.error : { message: (ej && ej.detail) || et };
            return { live: true, error: er.message || er.type, error_type: er.type, status: r.status, request_id: reqId, ratelimit: rl,
              retry_after: r.headers && r.headers.get ? r.headers.get("retry-after") : null };
          }
          state.lastLive = true;
          if (!payload.stream || !r.body || !r.body.getReader) {
            var rawTxt = await r.text();
            chatTrace.res_body = rawTxt; trace(chatTrace);
            var j = JSON.parse(rawTxt);
            if (payload.stream && typeof j === "string") j = null;
            var txt = j && j.choices && j.choices[0] ? ((j.choices[0].message || {}).content || "") : "";
            if (cb.onDelta && txt) cb.onDelta(txt);
            if (cb.onUsage && j && j.usage) cb.onUsage(j.usage);
            return { live: true, text: txt, usage: j && j.usage, request_id: reqId, ratelimit: rl,
              finish_reason: j && j.choices && j.choices[0] && j.choices[0].finish_reason };
          }
          var reader = r.body.getReader(), dec = new TextDecoder(), buf = "", out = "", usage = null, finish = null, rawSse = "";
          for (;;) {
            var chunk = await reader.read();
            if (chunk.done) break;
            var piece = dec.decode(chunk.value, { stream: true });
            rawSse += piece;
            buf = sseFeed(buf + piece, function (ev) {
              if (!ev) return;
              var ch = ev.choices && ev.choices[0];
              var d = ch && ch.delta && ch.delta.content;
              if (d) { out += d; if (cb.onDelta) cb.onDelta(d); }
              if (ch && ch.finish_reason) finish = ch.finish_reason;
              if (ev.usage) { usage = ev.usage; if (cb.onUsage) cb.onUsage(ev.usage); }
            });
          }
          sseFeed(buf + "\n\n", function (ev) { if (ev && ev.usage) { usage = ev.usage; if (cb.onUsage) cb.onUsage(ev.usage); } });
          chatTrace.res_body = rawSse; trace(chatTrace);
          return { live: true, text: out, usage: usage, request_id: reqId, ratelimit: rl, finish_reason: finish };
        }
        /* mock 스트림 — 백엔드 미머지·미기동 */
        state.lastLive = false;
        if (!M.models.some(function (m) { return m.id === body.model; }))
          return { live: false, error: "model not found: " + body.model, error_type: "invalid_request_error", status: 404, request_id: rid };
        var text = CANNED, words = text.split(/(\s+)/), acc = "";
        if (body.max_tokens && body.max_tokens < 40) words = words.slice(0, Math.max(1, body.max_tokens));
        for (var i = 0; i < words.length; i++) {
          acc += words[i];
          if (cb.onDelta) cb.onDelta(words[i]);
          if (payload.stream && /\S/.test(words[i])) await sleep(opts.mockDelayMs != null ? opts.mockDelayMs : 35);
        }
        var u = mockUsage(body.messages, acc);
        if (cb.onUsage) cb.onUsage(u);
        var cid = "chatcmpl-mock-" + rid.slice(-6), created = Math.floor(Date.now() / 1000);
        var mk = function (delta, fin, us) {
          var c = { id: cid, object: "chat.completion.chunk", created: created, model: body.model,
            choices: us ? [] : [{ index: 0, delta: delta, finish_reason: fin || null }] };
          if (us) c.usage = us;
          return "data: " + JSON.stringify(c) + "\n\n";
        };
        trace({ method: "POST", url: base() + "/v1/chat/completions", req_headers: redact(h), req_body: JSON.stringify(payload), status: "MOCK",
          res_headers: { "content-type": payload.stream ? "text/event-stream" : "application/json", "x-request-id": rid },
          res_body: payload.stream ? mk({ role: "assistant", content: "" }) + mk({ content: acc }) + mk({}, "stop") + mk(null, null, u) + "data: [DONE]\n\n"
            : JSON.stringify({ id: cid, object: "chat.completion", created: created, model: body.model,
              choices: [{ index: 0, message: { role: "assistant", content: acc, refusal: null }, logprobs: null, finish_reason: "stop" }], usage: u }, null, 2) });
        var qx = M.quotas.find(function (x) { return x.tier === (body.service_tier || "interactive"); });
        return { live: false, text: acc, usage: u, request_id: rid, finish_reason: "stop",
          ratelimit: { tokens: qx ? String(qx.tpm - qx.used_tpm - u.total_tokens) : null, requests: qx ? String(qx.rpm - qx.used_rpm - 1) : null } };
      },
      quotas: function (tid) {
        return get(V("/token/quotas" + q({ tenant_id: tid })), function () { return clone(byTenant(M.quotas, tid)); },
          function (j) { return arr(j, ["quotas"]); });
      },
      quotaPut: function (tid, b) {
        return act(V("/token/quotas/" + encodeURIComponent(tid)), "PUT", b, function () {
          if (!(b.tpm > 0) || !(b.rpm > 0)) fail("tpm, rpm 은 양수", 422);
          var x = M.quotas.find(function (y) { return y.tenant_id === tid && y.tier === b.tier; });
          if (!x) { x = { tenant_id: tid, tier: b.tier, used_tpm: 0, used_rpm: 0, month_tokens: 0 }; M.quotas.push(x); }
          x.tpm = b.tpm; x.rpm = b.rpm; x.monthly_token_cap = b.monthly_token_cap == null ? null : b.monthly_token_cap;
          return clone(x);
        });
      },
      quotaOverride: function (tid, b) {
        return act(V("/token/quotas/" + encodeURIComponent(tid) + "/override"), "POST", b, function () {
          var o = Object.assign({ tenant_id: tid }, b); M.overrides.push(o); return clone(o);
        });
      },
      deployments: function () {
        return get(V("/token/deployments"), function () { return clone(M.deployments); }, function (j) { return arr(j, ["deployments"]); });
      },
      slo: function (model, window) {
        return get(V("/token/slo" + q({ model: model, window: window || "1h" })), function () {
          var i = Math.max(0, M.models.findIndex(function (m) { return m.id === model; }));
          var ttft = [820, 1460, 2310][i] || 900, tpot = [31, 44, 58][i] || 35;
          return { model: model, window: window || "1h", ttft_p99_ms: ttft, tpot_p99_ms: tpot, target: clone(SLO_TARGET),
            breach: ttft > SLO_TARGET.ttft_p99_ms || tpot > SLO_TARGET.tpot_p99_ms };
        });
      },
      /* 기존 /metering/usage (+ F04 token_lines · tokens_by_type 필드 추가) */
      usage: function (tid) {
        return get(V("/metering/usage" + q({ tenant_id: tid })), function () {
          return { tenant_id: tid, period: M.cur, gpu_hours: 3456, instance_hours: 864, k8s_node_hours: 0,
            tokens_by_type: clone(M.tokensByType),
            token_lines: M.models.slice(0, 2).map(function (m, i) {
              return { model: m.id, tier: i ? "batch" : "interactive", input: i ? 900000000 : 1910000000, cached: i ? 300000000 : 940000000,
                output: i ? 210000000 : 840000000, reasoning: i ? 0 : 120000000, requests: i ? 41200 : 1830400 };
            }) };
        });
      },
      reconcile: function (per) {
        return get(V("/metering/reconcile" + q({ period: per || M.cur })), function () {
          return { period: per || M.cur, gateway_tokens: 5220000000, engine_tokens: 5219400000, diff_pct: 0.011, mismatches: ["req-7h2k-31"] };
        });
      },

      /* ── F05 청구 ───────────────────────────────────────────── */
      priceBook: function () { return get(V("/billing/price-book"), function () { return clone(M.priceBook); }); },
      invoices: function (tid, per) {
        return get(V("/billing/invoices" + q({ tenant_id: tid, period: per })), function () {
          return clone(M.invoices.filter(function (x) { return (!tid || x.tenant_id === tid) && (!per || x.period === per); }));
        }, function (j) { return arr(j, ["invoices"]); });
      },
      invoice: function (id) {
        return get(V("/billing/invoices/" + encodeURIComponent(id)), function () {
          return clone(M.invoices.find(function (x) { return x.id === id; }) || null);
        });
      },
      invoicesRun: function (per) {
        return act(V("/billing/invoices:run"), "POST", { period: per }, function () {
          var out = [];
          ["tnt-fin-corp"].forEach(function (tid) {
            var ex = M.invoices.find(function (x) { return x.tenant_id === tid && x.period === per; });
            if (!ex) { ex = priceInvoice({ id: "inv-" + per.replace("-", "") + "-" + pad(M.invoices.length + 1, 4), tenant_id: tid, period: per,
              currency: "KRW", status: "draft", lines: [], commitment_true_up: 890000000, sla_credits: [] }); M.invoices.push(ex); }
            out.push(ex.id);
          });
          return { period: per, invoices: out };
        });
      },
      invoiceFinalize: function (id) {
        return act(V("/billing/invoices/" + encodeURIComponent(id) + "/finalize"), "POST", {}, function () {
          var x = M.invoices.find(function (y) { return y.id === id; }); if (!x) fail("invoice not found", 404);
          if (x.status !== "draft") fail("finalize 는 draft 에서만 가능 (현재 " + x.status + ")", 409);
          x.status = "finalized"; x.finalized_at = iso(Date.now()); return clone(x);
        });
      },
      invoicePay: function (id, b) {
        return act(V("/billing/invoices/" + encodeURIComponent(id) + "/pay"), "POST", b || {}, function () {
          var x = M.invoices.find(function (y) { return y.id === id; }); if (!x) fail("invoice not found", 404);
          if (x.status !== "finalized") fail("결제는 finalized 청구서만 가능 (현재 " + x.status + ")", 409);
          x.status = "paid"; x.paid_at = iso(Date.now()); return clone(x);
        });
      },
      taxInvoice: function (id) {
        return get(V("/billing/invoices/" + encodeURIComponent(id) + "/tax-invoice"), function () {
          var x = M.invoices.find(function (y) { return y.id === id; }) || {};
          var t = M.tenants[x.tenant_id] || {};
          return { invoice_id: id, approval_no: "2026" + (x.period || "").replace("-", "") + "-41000017-" + pad(M.invoices.indexOf(x) + 1, 8),
            issue_date: (x.finalized_at || x.issued_at || "").slice(0, 10),
            supplier: { name: "SK텔레콤 NeoCloud", business_reg_no: "104-81-37225" },
            buyer: { name: t.org_name || x.tenant_id, business_reg_no: t.business_reg_no || "—" },
            supply_amount: x.subtotal, vat: x.vat, total: x.total, status: x.status === "draft" ? "not_issued" : "issued" };
        });
      },
      paymentMethods: function (tid) {
        return get(V("/billing/payment-methods" + q({ tenant_id: tid })), function () { return clone(byTenant(M.payMethods, tid)); });
      },
      paymentMethodAdd: function (b) {
        return act(V("/billing/payment-methods"), "POST", b, function () {
          var pm = { id: nextId("pm"), tenant_id: b.tenant_id, kind: b.kind, label: b.kind === "card" ? "카드 ···· " + String(b.token || "").slice(-4) : "계좌 이체",
            default: false };
          M.payMethods.push(pm); return clone(pm);
        });
      },

      /* ── F09 SLA ────────────────────────────────────────────── */
      slaReport: function (tid, month) {
        return get(V("/tenants/" + encodeURIComponent(tid) + "/sla-report" + q({ month: month })), function () {
          var per = month || M.prev;
          var dts = M.downtime.filter(function (d) { return d.start.slice(0, 7) === per; });
          var excl = sum(dts.filter(function (d) { return d.exception_id; }), function (d) { return d.minutes; });
          var counted = sum(dts.filter(function (d) { return !d.exception_id; }), function (d) { return d.minutes; });
          var fleet = 30 * 24 * 60;          // 서비스 월 분 (mock 단순화)
          var avail = +(100 - counted / fleet * 100).toFixed(3);
          var inv = M.invoices.find(function (x) { return x.period === per && x.tenant_id === tid; });
          var credits = (inv && inv.sla_credits || []).map(function (c) {
            return { credit_id: c.credit_id, month: per, amount: c.amount, pct_of_monthly: 5, status: "applied", applied_invoice: c.applied_invoice };
          });
          return { tenant_id: tid, month: per, availability_pct: avail, target_pct: 99.9, violated: avail < 99.9,
            exceptions_minutes: excl, incidents: dts.filter(function (d) { return !d.exception_id; }).map(function (d, i) {
              return { id: "inc-" + pad(400 + i, 4), severity: "P1", downtime_min: d.minutes, mttr_min: d.minutes };
            }), credits: credits,
            credit: credits[0] ? { amount: credits[0].amount, applied_invoice: credits[0].applied_invoice } : null };
        });
      },
      downtime: function (tid, per) {
        return get(V("/sla/downtime" + q({ tenant_id: tid, period: per })), function () {
          return clone(M.downtime.filter(function (d) { return !per || d.start.slice(0, 7) === per; }));
        });
      },
      slaExceptions: function () { return get(V("/sla/exceptions"), function () { return clone(M.slaExceptions); }); },
      slaExceptionCreate: function (b) {
        return act(V("/sla/exceptions"), "POST", b, function () {
          if (!b.start || !b.end || b.end <= b.start) fail("start < end 필요", 422);
          var x = Object.assign({ id: nextId("slx") }, clone(b)); M.slaExceptions.push(x); return clone(x);
        });
      },

      /* ── F10 자동 복구 ──────────────────────────────────────── */
      remPolicy: function () { return get(V("/remediation/policy"), function () { return clone(M.policy); }); },
      remPolicyPut: function (b) {
        return act(V("/remediation/policy"), "PUT", b, function () {
          if (b.mode && b.mode !== "monitor" && b.mode !== "auto") fail("mode 는 monitor|auto", 422);
          M.policy = Object.assign(M.policy, clone(b)); return clone(M.policy);
        });
      },
      remRuns: function (tid, st) {
        return get(V("/remediation/runs" + q({ tenant_id: tid, state: st })), function () {
          return clone(M.runs.filter(function (x) { return !tid || x.target.tenant_id === tid; }));
        }, function (j) { return arr(j, ["runs"]); });
      },
      remRun: function (id) {
        return get(V("/remediation/runs/" + encodeURIComponent(id)), function () {
          return clone(M.runs.find(function (x) { return x.id === id; }) || null);
        });
      },
      remRunCreate: function (b) {
        return act(V("/remediation/runs"), "POST", b, function () {
          if (!b.machine_id) fail("machine_id 필수", 422);
          var rack = String(b.machine_id).replace(/-t\d+$/, "");
          var busy = M.runs.some(function (x) { return x.outcome == null && String(x.target.machine_id).replace(/-t\d+$/, "") === rack; });
          if (busy && M.policy.max_parallel_per_rack <= 1) fail("같은 랙에서 복구 실행 중 (max_parallel_per_rack=1)", 409);
          var run = { id: nextId("rem"), trigger: { event_id: null, kind: "manual: " + (b.reason || "") },
            target: { machine_id: b.machine_id, tenant_id: b.tenant_id || null },
            steps: [{ name: "cordon", state: "running", at: iso(Date.now()) }], mttr_min: null, outcome: null, started_at: iso(Date.now()) };
          M.runs.unshift(run); return clone(run);
        });
      },

      /* ── F11 NVKE 토폴로지 ─────────────────────────────────── */
      nvkeCapi: function (cid) {
        return get(V("/nvke/clusters/" + encodeURIComponent(cid) + "/capi"), function () { return clone(mockTopo(M, cid).capi); });
      },
      nvkeNodes: function (cid) {
        return get(V("/nvke/clusters/" + encodeURIComponent(cid) + "/nodes"), function () { return clone(mockTopo(M, cid).nodes); },
          function (j) { return arr(j, ["nodes"]); });
      },
      nvkeDomains: function (cid) {
        return get(V("/nvke/clusters/" + encodeURIComponent(cid) + "/compute-domains"), function () { return clone(mockTopo(M, cid).domains); },
          function (j) { return arr(j, ["compute_domains", "domains"]); });
      },
      nvkeDomainCreate: function (cid, b) {
        return act(V("/nvke/clusters/" + encodeURIComponent(cid) + "/compute-domains"), "POST", b, function () {
          if (!b.name || !b.racks || !b.racks.length) fail("name, racks 필수", 422);
          var d = { name: b.name, nodepool: b.nodepool, racks: b.racks, imex_channels: 18 * b.racks.length, status: "Pending" };
          mockTopo(M, cid).domains.push(d); return clone(d);
        });
      },
    };
    return api;
  }

  /* 클리크별 묶음 — labels["nvidia.com/gpu.clique"] = "<domainId>.<cliqueId>" */
  function groupByClique(nodes) {
    var g = {};
    (nodes || []).forEach(function (n) {
      var k = (n.labels && n.labels["nvidia.com/gpu.clique"]) || "(라벨 없음)";
      (g[k] = g[k] || []).push(n);
    });
    return Object.keys(g).sort().map(function (k) { return { clique: k, nodes: g[k] }; });
  }
  /* 복구 run 단계별 소요(분)과 MTTR — steps[].at 차이, 시작은 started_at */
  function runDurations(run) {
    var prev = Date.parse(run.started_at || (run.steps[0] && run.steps[0].at));
    return (run.steps || []).map(function (s) {
      var t = Date.parse(s.at), d = isNaN(t) || isNaN(prev) ? null : Math.max(0, Math.round((t - prev) / 60000));
      prev = t;
      return { name: s.name, state: s.state, at: s.at, minutes: d };
    });
  }

  return { create: create, groupByClique: groupByClique, runDurations: runDurations, priceInvoice: priceInvoice,
    SLO_TARGET: SLO_TARGET, REM_STEPS: REM_STEPS };
});
