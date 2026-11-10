/* F30 KAI 스케줄러 · F32 마켓플레이스 데이터 계층 — NOCP /api/v1 경유 전용.
   dsx-api.js와 같은 규칙: 게터는 { live, data, src } (NOCP 미기동·404·5xx → 결정적 mock, live:false),
   액션은 4xx(404 제외) → { live:true, error }, 네트워크/404 → { live:false, error:"offline" }.
   인증 헤더는 shared/nocp-auth.js(NC_AUTH). 브라우저(window.NC.schedMkt)·node 테스트(create) 겸용. */
(function (root, factory) {
  var mod = factory();
  if (typeof module === "object" && module.exports) module.exports = mod;
  if (root && root.document) {
    root.NC = root.NC || {};
    root.NC.schedMkt = mod.create({});
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  var MOCK_MODELS = [
    { id: "llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct", publisher: "Meta", license: "Llama 3.3 Community",
      params_b: 70, context_length: 131072, tp: 4, reasoning: false, engine: "mock",
      description_ko: "범용 대화·요약.", description_en: "General chat and summarisation.",
      price_usd_per_1m_tokens: { input: 0.6, cached_input: 0.15, output: 0.9 },
      tiers: [{ id: "serverless", gpus: 4, billing: "per_token", label_ko: "서버리스", label_en: "Serverless" },
        { id: "dedicated", gpus: 12, billing: "per_gpu_hour", label_ko: "전용", label_en: "Dedicated",
          price: { usd_per_hour: 78 } }] },
  ];

  function create(opts) {
    opts = opts || {};
    var g = typeof window !== "undefined" ? window : globalThis;
    var doFetch = opts.fetch || (g.fetch ? g.fetch.bind(g) : null);
    var timeoutMs = opts.timeoutMs || 4000;
    function base() {
      if (opts.base) return opts.base;
      if (g.NC && g.NC.dsx && typeof g.NC.dsx.base === "function") return g.NC.dsx.base();
      try { return g.localStorage.getItem("nc-nocp") || "http://127.0.0.1:8000"; }
      catch (e) { return "http://127.0.0.1:8000"; }
    }
    var AUTH = g.NC_AUTH || (typeof require === "function" ? require("./nocp-auth.js") : null);
    function headers() {
      var s = opts.session ? opts.session()
        : (g.NC && typeof g.NC.session === "function" ? g.NC.session() : null);
      var tok = opts.token !== undefined ? opts.token : (AUTH ? AUTH.token(g) : null);
      return AUTH ? AUTH.headers(s, g, tok) : {};
    }
    async function req(path, method, body) {
      if (!doFetch) throw Object.assign(new Error("no fetch"), { network: true });
      var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var t = ctl ? setTimeout(function () { ctl.abort(); }, timeoutMs) : null;
      var h = headers();
      if (body !== undefined) h["Content-Type"] = "application/json";
      try {
        var r;
        try {
          r = await doFetch(base() + "/api/v1" + path, { method: method || "GET", headers: h,
            body: body !== undefined ? JSON.stringify(body) : undefined, signal: ctl ? ctl.signal : undefined });
        } catch (e) { throw Object.assign(new Error((e && e.message) || "network"), { network: true }); }
        var txt = await r.text(), j = null;
        try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = null; }
        if (!r.ok) {
          var d = j && j.detail != null ? j.detail : txt || ("HTTP " + r.status);
          throw Object.assign(new Error(typeof d === "string" ? d : JSON.stringify(d)), { status: r.status });
        }
        return j;
      } finally { if (t) clearTimeout(t); }
    }
    async function get(path, mockFn) {
      try { return { live: true, src: "/api/v1" + path, data: await req(path) }; }
      catch (e) {
        if (e.status === 403) return { live: true, src: "/api/v1" + path, error: e.message, status: 403, data: mockFn() };
        return { live: false, src: "mock", data: mockFn() };
      }
    }
    async function act(path, method, body) {
      try { return { live: true, src: "/api/v1" + path, data: await req(path, method, body) }; }
      catch (e) {
        if (e.status && e.status >= 400 && e.status < 500 && e.status !== 404)
          return { live: true, src: "/api/v1" + path, error: e.message, status: e.status };
        return { live: false, src: "mock", error: "offline", status: e.status || 0 };
      }
    }
    function c(id) { return "/nvke/clusters/" + encodeURIComponent(id); }
    function qs(o) {
      var s = Object.keys(o || {}).filter(function (k) { return o[k] != null && o[k] !== ""; })
        .map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(o[k]); }).join("&");
      return s ? "?" + s : "";
    }
    return {
      base: base,
      /* F30 — KAI scheduler */
      clusters: function (tenant) {
        return get("/nvke/clusters" + qs({ tenant_id: tenant, include_nkd: "false" }), function () { return []; });
      },
      scheduler: function (id) {
        return get(c(id) + "/scheduler", function () {
          return { cluster_id: id, scheduler: "kai-scheduler", version: "—", cycles: 0,
            capacity: { nodes: 0, gpus: 0, schedulable_gpus: 0, used_gpus: 0, fenced_gpus: 0 },
            cliques: [], queues: [], workloads: {}, log: [] };
        });
      },
      queues: function (id) { return get(c(id) + "/queues", function () { return []; }); },
      createQueue: function (id, body) { return act(c(id) + "/queues", "POST", body); },
      deleteQueue: function (id, name) { return act(c(id) + "/queues/" + encodeURIComponent(name), "DELETE"); },
      workloads: function (id) { return get(c(id) + "/workloads", function () { return []; }); },
      submit: function (id, body) { return act(c(id) + "/workloads", "POST", body); },
      complete: function (id, name) { return act(c(id) + "/workloads/" + encodeURIComponent(name), "DELETE"); },
      curtail: function (id, body) { return act(c(id) + "/scheduler/curtail", "POST", body); },
      releaseCurtail: function (id) { return act(c(id) + "/scheduler/curtail", "DELETE"); },
      podgroups: function (id) {
        return get(c(id) + "/apis/scheduling.run.ai/v2alpha2/podgroups", function () { return { items: [] }; });
      },
      /* F32 — marketplace */
      models: function () {
        return get("/marketplace/models", function () { return { object: "list", source: "mock", data: MOCK_MODELS }; });
      },
      deploy: function (body) { return act("/marketplace/deploy", "POST", body); },
      deployments: function (tenant) {
        return get("/marketplace/deployments" + qs({ tenant_id: tenant }), function () { return []; });
      },
      deployment: function (id) {
        return get("/marketplace/deployments/" + encodeURIComponent(id), function () { return null; });
      },
      undeploy: function (id) { return act("/marketplace/deployments/" + encodeURIComponent(id), "DELETE"); },
    };
  }

  return { create: create, MOCK_MODELS: MOCK_MODELS };
});
