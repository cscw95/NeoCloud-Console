/* DSX OS 데이터 계층 — NOCP(:8000) /api/v1 경유 전용 (PLAN.md §C 계약).
   원칙: ① 모든 호출은 NOCP /api/v1 경로만 사용 (AI-Infra :9100 / NICo :9000 직접 호출 금지)
   ② 게터는 { live, data, src } 를 반환 — NOCP 미기동·404·5xx 시 결정적 mock 폴백(live:false)
   ③ 액션은 4xx(404 제외) 시 { live:true, error } 로 표면화(mock으로 새지 않음),
      네트워크/404 시 mock 시뮬레이션 결과(live:false)
   ④ 인증 헤더: 고객 세션 → X-Tenant-Id/X-Tenant-Role, 그 외(ops/biz) → X-Operator: true
   브라우저(window.NC.dsx)와 node 테스트(module.exports.create) 양쪽에서 동작한다. */
(function (root, factory) {
  var mod = factory();
  if (typeof module === "object" && module.exports) module.exports = mod;
  if (root && root.document) {
    root.NC = root.NC || {};
    root.NC.dsx = mod.create({});
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  /* ── 기준 버전 매트릭스 (PLAN.md — 모든 repo 동일) ───────────── */
  var MATRIX = {
    dsx_os: "2026.05", nico: "2.3.0", nvke: "0.23.1", dps: "0.10",
    mission_control: "2.5", doca: "3.x", gpu_operator: "AICR recipe",
    k8s: ["1.33", "1.34"], platform: "Vera Rubin NVL72",
  };
  var WPPS = ["max-p", "max-q", "training", "inference", "balanced"];
  var RMA_STAGES = ["health_event", "cordon_drain", "isolate", "replace",
    "burn_in", "pool_return"];
  var RACK_PEAK_KW = 187;          // VR NVL72 MaxQ 캡 기준 (ops obs-rack과 동일)

  /* ── 결정적 PRNG (mock이 새로고침마다 바뀌지 않도록) ─────────── */
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  function pad(n, w) { n = String(n); while (n.length < w) n = "0" + n; return n; }
  function arr(x, keys) {
    if (Array.isArray(x)) return x;
    if (x && typeof x === "object") {
      var ks = (keys || []).concat(["items", "data", "results"]);
      for (var i = 0; i < ks.length; i++) if (Array.isArray(x[ks[i]])) return x[ks[i]];
    }
    return [];
  }
  function iso(ms) { return new Date(ms).toISOString(); }
  function sum(a, f) { return a.reduce(function (s, x) { return s + (+f(x) || 0); }, 0); }

  /* ══ mock 시나리오 (가산 80랙 · 안산 60랙 = 140랙 · 10,080 GPU) ══ */
  function buildMock() {
    var r = rng(20260510);
    var sites = [{ id: "gasan", n: 80 }, { id: "ansan", n: 60 }];
    var racks = [];
    sites.forEach(function (s) {
      for (var i = 1; i <= s.n; i++) {
        var id = (s.id === "gasan" ? "GA" : "AN") + "-R" + pad(i, 3);
        var x = r();
        var bmcDown = x > 0.965 ? 1 + Math.floor(r() * 3) : 0;
        var psuBad = r() > 0.95 ? 1 : 0;
        var leak = r() > 0.985 ? "Critical" : r() > 0.97 ? "Warning" : "OK";
        var pw = +(110 + r() * 70).toFixed(1);
        racks.push({
          rack: id, site: s.id,
          group: s.id + "-g" + (1 + Math.floor((i - 1) / 20)),
          bmc_total: 18, bmc_reachable: 18 - bmcDown,
          psu_total: 36, psu_ok: 36 - psuBad,
          leak: leak,
          max_inlet_c: +(24 + r() * 9 + (leak !== "OK" ? 3 : 0)).toFixed(1),
          sel_critical: r() > 0.93 ? 1 + Math.floor(r() * 4) : 0,
          power_kw: pw, cap_kw: RACK_PEAK_KW,
          profile: WPPS[Math.floor(r() * 5)],
        });
      }
    });
    function domain(site, limitKw) {
      var rs = racks.filter(function (k) { return k.site === site; });
      var gids = {};
      rs.forEach(function (k) { (gids[k.group] = gids[k.group] || []).push(k); });
      var groups = Object.keys(gids).map(function (g, i) {
        var list = gids[g];
        return { id: g, name: g.toUpperCase(), domain: "pd-" + site,
          racks: list.map(function (k) { return k.rack; }),
          priority: i === 0 ? "high" : i === 1 ? "medium" : "low",
          min_kw: list.length * 90, max_kw: list.length * RACK_PEAK_KW,
          used_kw: +sum(list, function (k) { return k.power_kw; }).toFixed(1) };
      });
      return { id: "pd-" + site, name: site === "gasan" ? "STT 가산 PowerDomain" : "IGIS 안산 PowerDomain",
        site: site, operating_limit_kw: limitKw, mode: "static", smoothing: false,
        used_kw: +sum(rs, function (k) { return k.power_kw; }).toFixed(1),
        racks: rs.length, groups: groups };
    }
    var t0 = Date.parse("2026-11-10T00:00:00Z");
    var topics = ["power", "thermal", "leak", "grid", "health"];
    var events = [];
    for (var e = 0; e < 24; e++) {
      var k = racks[Math.floor(r() * racks.length)];
      var tp = topics[Math.floor(r() * topics.length)];
      events.push({ id: "ev-" + pad(e + 1, 4), ts: iso(t0 - e * 97000), topic: tp,
        severity: tp === "leak" ? "critical" : r() > 0.6 ? "warning" : "info",
        rack: k.rack, site: k.site,
        message: tp === "leak" ? "LeakDetection " + k.rack + " → Warning"
          : tp === "thermal" ? "Inlet " + k.max_inlet_c + "°C @ " + k.rack
          : tp === "power" ? "PowerLimit SetPoint 변경 " + k.rack
          : tp === "grid" ? "DSX Flex 수요반응 신호 수신"
          : "NVSentinel GPU XID 79 @ " + k.rack });
    }
    var tenants = ["tnt-fin-corp", "tnt-bio-lab", "tnt-auto-ai"];
    var rmas = [
      { id: "rma-0001", machine: "GA-R012-T07", rack: "GA-R012", component: "GPU",
        reason: "NVSentinel XID 79 (GPU fallen off bus)", stage: "replace", tenant: "tnt-fin-corp" },
      { id: "rma-0002", machine: "AN-R033-T02", rack: "AN-R033", component: "PSU",
        reason: "PowerShelf PSU-3 fault", stage: "burn_in", tenant: null },
      { id: "rma-0003", machine: "GA-R041-T15", rack: "GA-R041", component: "ConnectX-8",
        reason: "IB link flap > 20/h", stage: "cordon_drain", tenant: "tnt-bio-lab" },
    ].map(function (x, i) {
      x.opened_at = iso(t0 - (i + 1) * 3600e3 * 5);
      x.stage_index = RMA_STAGES.indexOf(x.stage);
      return x;
    });
    var baseline = [
      { component: "BMC (OpenBMC)", baseline: "2026.04.2" },
      { component: "HMC", baseline: "1.8.0" },
      { component: "GPU VBIOS (Rubin)", baseline: "97.10.2C.00.11" },
      { component: "ConnectX-8 FW", baseline: "40.44.1036" },
      { component: "BlueField-4 (DOCA)", baseline: "3.1.0" },
      { component: "NVSwitch Tray FW", baseline: "2.5.1" },
      { component: "PowerShelf FW", baseline: "1.12" },
    ];
    var drift = [
      { machine: "GA-R007-T03", rack: "GA-R007", component: "BMC (OpenBMC)", current: "2026.02.1", baseline: "2026.04.2", severity: "warning" },
      { machine: "GA-R055-T11", rack: "GA-R055", component: "ConnectX-8 FW", current: "40.43.2050", baseline: "40.44.1036", severity: "warning" },
      { machine: "AN-R019-T01", rack: "AN-R019", component: "GPU VBIOS (Rubin)", current: "97.10.1F.00.04", baseline: "97.10.2C.00.11", severity: "critical" },
    ];
    var nvkeClusters = [
      { id: "nvke-fin-01", name: "fin-train", tenant_id: "tnt-fin-corp", k8s_version: "1.33",
        nvke_version: "0.23.1", node_image: "nvke-ubuntu24.04-cuda13", status: "running",
        aicr_recipe: "aicr-training-vr-nvl72", created_at: iso(t0 - 86400e3 * 9),
        nodepools: [
          { id: "np-fin-gpu", name: "gpu-pool", instance_type: "vr-nvl72.tray", count: 18, status: "ready" },
          { id: "np-fin-sys", name: "system", instance_type: "cpu.c64", count: 3, status: "ready" }] },
    ];
    return {
      racks: racks, events: events, tenants: tenants, rmas: rmas,
      baseline: baseline, drift: drift, flex: [], nvke: nvkeClusters,
      domains: [domain("gasan", 13200), domain("ansan", 9800)],
      seq: 100,
    };
  }

  /* ── mock 계산: static vs dynamic(DPS) 비교 ─────────────────── */
  function simulate(body, domains) {
    var d = (domains || []).find(function (x) { return x.id === body.domain; }) || {};
    var lim = +body.operating_limit_kw || d.operating_limit_kw || 10000;
    var mix = body.workload_mix || { training: 0.6, inference: 0.4 };
    var tr = +mix.training || 0, inf = +mix.inference || 0;
    var tot = (tr + inf) || 1;
    // 정적: 랙 피크(187kW)로 예약 · 동적: 워크로드 혼합 평균 + 스무딩 여유 10%
    var avgFrac = (tr * 0.86 + inf * 0.64) / tot;
    var rackStatic = Math.floor(lim / RACK_PEAK_KW);
    var rackDyn = Math.floor(lim / (RACK_PEAK_KW * avgFrac * 1.1));
    var tokPerRack = (tr * 0.9 + inf * 1.4) / tot * 1.0e6;   // tokens/s per rack (지표용)
    function res(n, perRackKw) {
      var reserved = Math.min(lim, n * perRackKw);
      return { racks_supported: n, gpus_supported: n * 72,
        tokens_per_mw: Math.round(n * tokPerRack / (lim / 1000)),
        headroom_kw: +(lim - reserved).toFixed(1) };
    }
    return { domain: body.domain || d.id || null, operating_limit_kw: lim,
      workload_mix: mix, static: res(rackStatic, RACK_PEAK_KW),
      dynamic: res(rackDyn, RACK_PEAK_KW * avgFrac * 1.1) };
  }

  /* ══ 팩토리 ═══════════════════════════════════════════════════ */
  function create(opts) {
    opts = opts || {};
    var g = typeof window !== "undefined" ? window : globalThis;
    var doFetch = opts.fetch || (g.fetch ? g.fetch.bind(g) : null);
    var timeoutMs = opts.timeoutMs || 2500;
    function base() {
      if (opts.base) return opts.base;
      try { return g.localStorage.getItem("nc-nocp") || "http://127.0.0.1:8000"; }
      catch (e) { return "http://127.0.0.1:8000"; }
    }
    var V = function () { return base() + "/api/v1"; };
    /* 인증 헤더 이름·토큰 조회는 shared/nocp-auth.js(NC_AUTH) 한 곳에서 */
    var AUTH = g.NC_AUTH || (typeof require === "function" ? require("./nocp-auth.js") : null);
    function tok() { return opts.token !== undefined ? opts.token : AUTH.token(g); }
    function authHeaders() {
      var s = opts.session ? opts.session()
        : (g.NC && typeof g.NC.session === "function" ? g.NC.session() : null);
      return AUTH.headers(s, g, tok());
    }
    var M = buildMock();
    var state = { lastLive: null };

    async function req(path, method, body) {
      if (!doFetch) throw Object.assign(new Error("no fetch"), { network: true });
      var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var t = ctl ? setTimeout(function () { ctl.abort(); }, timeoutMs) : null;
      var headers = authHeaders();
      if (body !== undefined) headers["Content-Type"] = "application/json";
      try {
        var r;
        try {
          r = await doFetch(V() + path, { method: method || "GET", headers: headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: ctl ? ctl.signal : undefined });
        } catch (e) { throw Object.assign(new Error(e && e.message || "network"), { network: true }); }
        var txt = await r.text();
        var j = null;
        try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = null; }
        if (!r.ok) {
          var d = j && j.detail != null ? j.detail : txt || ("HTTP " + r.status);
          throw Object.assign(new Error(typeof d === "string" ? d : JSON.stringify(d)), { status: r.status });
        }
        state.lastLive = true;
        return j;
      } finally { if (t) clearTimeout(t); }
    }
    /* 게터: live 우선, 실패 시 mock */
    async function get(path, mockFn, norm) {
      try {
        var j = await req(path);
        return { live: true, src: "/api/v1" + path, data: norm ? norm(j) : j };
      } catch (e) {
        if (e.status === 403) return { live: true, src: "/api/v1" + path, error: e.message, status: 403, data: mockFn() };
        state.lastLive = false;
        return { live: false, src: "mock", data: mockFn() };
      }
    }
    /* 액션: 4xx(≠404) → error 표면화 · 네트워크/404/5xx → mock 시뮬레이션 */
    async function act(path, method, body, mockFn) {
      try {
        var j = await req(path, method, body);
        return { live: true, src: "/api/v1" + path, data: j };
      } catch (e) {
        if (e.status && e.status >= 400 && e.status < 500 && e.status !== 404)
          return { live: true, src: "/api/v1" + path, error: e.message, status: e.status };
        return { live: false, src: "mock", data: mockFn ? mockFn() : null };
      }
    }
    function nextId(p) { M.seq += 1; return p + "-" + pad(M.seq, 4); }
    function q(o) {
      var s = Object.keys(o || {}).filter(function (k) { return o[k] != null && o[k] !== ""; })
        .map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(o[k]); }).join("&");
      return s ? "?" + s : "";
    }
    function mockDomain(id) {
      return M.domains.find(function (d) { return d.id === id; }) || M.domains[0];
    }
    function mockTelemetry(domainId) {
      var d = domainId ? mockDomain(domainId) : null;
      var rs = M.racks.filter(function (k) { return !d || k.site === d.site; });
      return {
        domain: d ? d.id : null,
        operating_limit_kw: d ? d.operating_limit_kw : sum(M.domains, function (x) { return x.operating_limit_kw; }),
        used_kw: +sum(rs, function (k) { return k.power_kw; }).toFixed(1),
        groups: d ? d.groups : [],
        racks: rs.map(function (k) {
          return { rack: k.rack, group: k.group, power_kw: k.power_kw, cap_kw: k.cap_kw,
            headroom_kw: +(k.cap_kw - k.power_kw).toFixed(1), profile: k.profile,
            gpus: 72, gpu_avg_w: Math.round(k.power_kw * 1000 * 0.82 / 72) };
        }),
      };
    }
    function mockRackDetail(id) {
      var k = M.racks.find(function (x) { return x.rack === id; }) || M.racks[0];
      var r = rng(id.split("").reduce(function (s, c) { return s + c.charCodeAt(0); }, 7));
      var down = k.bmc_total - k.bmc_reachable;
      var trays = [];
      for (var i = 1; i <= 18; i++) {
        trays.push({ machine: k.rack + "-T" + pad(i, 2), tray: i, kind: "compute",
          bmc_reachable: i > 18 - down ? false : true,
          inlet_c: +(k.max_inlet_c - r() * 4).toFixed(1),
          power_w: Math.round(k.power_kw * 1000 / 18 * (0.9 + r() * 0.2)),
          gpus: 4, sel_critical: i === 3 ? k.sel_critical : 0,
          leak: i === 9 ? k.leak : "OK" });
      }
      var shelves = [];
      for (var p = 1; p <= 4; p++) {
        shelves.push({ id: k.rack + "-PS" + p, psu_total: 9,
          psu_ok: p === 2 ? 9 - (k.psu_total - k.psu_ok) : 9, output_kw: +(k.power_kw / 4).toFixed(1) });
      }
      return Object.assign({}, k, { trays: trays, power_shelves: shelves });
    }
    function mockSel(machine) {
      var t0 = Date.parse("2026-11-10T00:00:00Z");
      return [
        { Id: "1", Created: iso(t0 - 7200e3), Severity: "OK", Message: "System boot completed", MessageId: "OpenBMC.0.4.BootSuccess" },
        { Id: "2", Created: iso(t0 - 3600e3), Severity: "Warning", Message: "GPU2 thermal margin < 5°C", MessageId: "Platform.1.0.ThermalWarning" },
        { Id: "3", Created: iso(t0 - 900e3), Severity: "Critical", Message: "PSU input lost (" + machine + ")", MessageId: "Platform.1.0.PowerSupplyFailed" },
      ];
    }
    function mockUsage(tenant) {
      var ts = tenant ? [tenant] : M.tenants;
      var lines = [];
      ts.forEach(function (t, i) {
        var r = rng(t.length * 31 + i);
        lines.push({ tenant_id: t, product: "bmaas", metric: "gpu_hour", quantity: Math.round(18000 + r() * 30000), unit: "GPU-h" });
        lines.push({ tenant_id: t, product: "bmaas", metric: "instance_hour", quantity: Math.round(250 + r() * 400), unit: "instance-h" });
        lines.push({ tenant_id: t, product: "managed-k8s", metric: "k8s_node_hour", quantity: Math.round(300 + r() * 500), unit: "node-h" });
      });
      function tot(m) { return sum(lines.filter(function (l) { return l.metric === m; }), function (l) { return l.quantity; }); }
      return { tenant: tenant || null, period: "2026-11", gpu_hours: tot("gpu_hour"),
        instance_hours: tot("instance_hour"), k8s_node_hours: tot("k8s_node_hour"), lines: lines };
    }
    function mockIsolation(tenant) {
      var n = tenant.replace(/^tnt-/, "");
      return { tenant: tenant, verified_at: "2026-11-10T00:00:00Z", layers: [
        { layer: "VPC / VRF", value: "vpc_" + (4000 + n.length * 17), status: "isolated", detail: "DPU HBN L3 EVPN (FNN)" },
        { layer: "InfiniBand P_Key", value: "0x8" + pad((n.length * 37).toString(16), 3), status: "isolated", detail: "UFM partition (full member)" },
        { layer: "NVLink Partition", value: "nvl-" + n, status: "isolated", detail: "NVLinkLogicalPartition per NVL72 domain" },
        { layer: "Spectrum-X", value: "sx-" + n, status: "isolated", detail: "SpectrumXPartition (RoCE tenant VRF)" },
        { layer: "NetworkSecurityGroup", value: "nsg-" + n + "-default", status: "isolated", detail: "deny-all + bastion:22" },
      ] };
    }
    function mockCatalog() {
      return { products: [
        { id: "bmaas", name: "Bare-Metal as a Service", tier: "BMaaS",
          desc: "NICo 기반 베어메탈 GPU 서버 (VR NVL72 tray 단위) — 테넌트 전용 VPC·P_Key·NVLink 격리",
          unit: "GPU-hour", instance_types: ["vr-nvl72.tray", "vr-nvl72.rack"] },
        { id: "managed-k8s", name: "Managed Kubernetes (NVKE)", tier: "Managed K8s",
          desc: "NVKE " + MATRIX.nvke + " — AICR recipe 기반 GPU/Network Operator, NVSentinel 자동 노드 교체",
          unit: "node-hour", k8s_versions: MATRIX.k8s.slice() },
      ] };
    }
    function mockReleases() {
      return { releases: [
        { version: "1.34.2-nvke." + MATRIX.nvke, k8s: "1.34", nvke: MATRIX.nvke, default: true, channel: "stable" },
        { version: "1.33.6-nvke." + MATRIX.nvke, k8s: "1.33", nvke: MATRIX.nvke, default: false, channel: "stable" },
      ],
      node_images: ["nvke-ubuntu24.04-cuda13", "nvke-rhel9.6-cuda13"],
      instance_types: ["vr-nvl72.tray", "vr-nvl72.rack", "cpu.c64"] };
    }
    function findNvke(id) { return M.nvke.find(function (c) { return c.id === id; }); }
    function kubeconfigText(c) {
      return "apiVersion: v1\nkind: Config\nclusters:\n- name: " + c.name +
        "\n  cluster:\n    server: https://" + c.id + ".nvke.neocloud.local:6443\n" +
        "    certificate-authority-data: LS0tLS1CRUdJTi1NT0NLLUNBLS0tLS0K\n" +
        "users:\n- name: " + c.name + "-admin\n  user:\n    token: mock-" + c.id + "\n" +
        "contexts:\n- name: " + c.name + "\n  context:\n    cluster: " + c.name +
        "\n    user: " + c.name + "-admin\ncurrent-context: " + c.name + "\n";
    }

    var api = {
      MATRIX: MATRIX, WPPS: WPPS, RMA_STAGES: RMA_STAGES, RACK_PEAK_KW: RACK_PEAK_KW,
      base: base, isLive: function () { return state.lastLive; },
      _mock: M,

      /* 플랫폼 */
      versions: function () {
        return get("/platform/versions", function () { return { matrix: MATRIX, components: {} }; },
          function (j) {
            j = j || {};
            if (j.matrix) return j;
            return { matrix: Object.assign({}, MATRIX, j), components: j.components || {} };
          });
      },
      catalog: function () {
        return get("/catalog", mockCatalog, function (j) {
          var ps = arr(j, ["products"]);
          return { products: ps.length ? ps : mockCatalog().products };
        });
      },

      /* MaxLPS 전력 (DPS 프록시) */
      powerDomains: function () {
        return get("/power/domains", function () { return M.domains; },
          function (j) { return arr(j, ["domains"]); });
      },
      powerDomain: function (id) {
        return get("/power/domains/" + encodeURIComponent(id), function () { return mockDomain(id); });
      },
      updateDomain: function (id, patch) {
        return act("/power/domains/" + encodeURIComponent(id), "PATCH", patch, function () {
          var d = mockDomain(id);
          ["operating_limit_kw", "mode", "smoothing"].forEach(function (k) {
            if (patch[k] !== undefined) d[k] = patch[k];
          });
          return d;
        });
      },
      powerProfiles: function () {
        return get("/power/profiles", function () {
          return WPPS.map(function (p) {
            return { id: p, name: p, gpu_cap_w: { "max-p": 2300, "max-q": 1800, training: 2100, inference: 1600, balanced: 1900 }[p] };
          });
        }, function (j) {
          return arr(j, ["profiles"]).map(function (p) { return typeof p === "string" ? { id: p, name: p } : p; });
        });
      },
      powerTelemetry: function (domain) {
        return get("/power/telemetry" + q({ domain: domain }), function () { return mockTelemetry(domain); });
      },
      simulate: function (body) {
        return act("/power/simulate", "POST", body, function () { return simulate(body, M.domains); });
      },
      flexEvent: function (body) {
        return act("/power/flex-events", "POST", body, function () {
          var ev = { id: nextId("flex"), domain: body.domain, reduce_kw: +body.reduce_kw,
            duration_s: +body.duration_s, state: "active", started_at: new Date().toISOString() };
          M.flex.unshift(ev);
          return ev;
        });
      },
      flexEvents: function () {
        return get("/power/flex-events", function () { return M.flex; },
          function (j) { return arr(j, ["events"]); });
      },
      setRackProfile: function (rack, profile) {
        // 계약 C: PowerPolicyUpdate에 dps-dynamic + WPPS 프로파일 추가 → AI-Infra로 전파
        return act("/racks/" + encodeURIComponent(rack) + "/power-policy", "POST", { policy: profile }, function () {
          var k = M.racks.find(function (x) { return x.rack === rack; });
          if (k) k.profile = profile;
          return { rack: rack, policy: profile };
        });
      },

      /* OOB 모니터링 */
      oobSummary: function (site) {
        return get("/oob/summary" + q({ site: site }), function () {
          return M.racks.filter(function (k) { return !site || k.site === site; });
        }, function (j) { return arr(j, ["racks"]); });
      },
      oobRack: function (id) {
        return get("/oob/racks/" + encodeURIComponent(id), function () { return mockRackDetail(id); });
      },
      oobEvents: function (limit) {
        return get("/oob/events" + q({ limit: limit || 50 }), function () { return M.events.slice(0, limit || 50); },
          function (j) { return arr(j, ["events"]); });
      },
      oobSel: function (machine) {
        return get("/oob/sel/" + encodeURIComponent(machine), function () { return mockSel(machine); },
          function (j) { return arr(j, ["entries", "Members"]); });
      },
      /* AC power cycle / OOB GPU reset — NOCP 경로 미정(계약 갭): NICo machine 액션 프록시 가정,
         미구현(404) 시 mock 시뮬레이션 */
      machineAction: function (machine, action) {
        return act("/oob/machines/" + encodeURIComponent(machine) + "/actions/" + encodeURIComponent(action),
          "POST", {}, function () {
            return { machine: machine, action: action, accepted: true, task: nextId("task") };
          });
      },
      /* 이벤트 스트림 — /api/v1/events (SSE, DSX Exchange 재발행). EventSource는 커스텀 헤더를
         못 붙이므로 NC_AUTH.eventsUrl이 events 전용 단기 토큰(?token=)을 붙인다.
         반환값은 close()를 가진 핸들 → 실패 시 onState("error"), 호출측이 폴링/mock으로 전환 */
      openEvents: function (onEvent, onState) {
        var ES = g.EventSource;
        if (!ES) { if (onState) onState("unsupported"); return null; }
        var handle = { es: null, closed: false,
          close: function () { this.closed = true; if (this.es) this.es.close(); } };
        AUTH.eventsUrl(V(), doFetch, g, tok()).then(function (url) {
          if (handle.closed) return;
          try { handle.es = new ES(url); }
          catch (e) { if (onState) onState("error"); return; }
          wire(handle.es);
        }, function () { if (onState) onState("error"); });
        return handle;
        function wire(es) {
        es.onopen = function () { if (onState) onState("open"); };
        es.onerror = function () { if (onState) onState("error"); };
        es.onmessage = function (m) {
          var d = null;
          try { d = JSON.parse(m.data); } catch (e) { d = { message: m.data }; }
          onEvent(d);
        };
        ["power", "thermal", "leak", "grid", "health"].forEach(function (tp) {
          es.addEventListener(tp, function (m) {
            var d = null;
            try { d = JSON.parse(m.data); } catch (e) { d = { message: m.data }; }
            if (d && !d.topic) d.topic = tp;
            onEvent(d);
          });
        });
          return es;
        }
      },

      /* RMA · 펌웨어 */
      rmaList: function () {
        return get("/rma", function () { return M.rmas; }, function (j) { return arr(j, ["cases", "rma"]); });
      },
      rmaCreate: function (body) {
        return act("/rma", "POST", body, function () {
          var x = { id: nextId("rma"), machine: body.machine, rack: body.rack || String(body.machine).replace(/-T\d+$/, ""),
            component: body.component || "GPU", reason: body.reason || "health event",
            stage: "health_event", stage_index: 0, tenant: body.tenant || null,
            opened_at: new Date().toISOString() };
          M.rmas.unshift(x);
          return x;
        });
      },
      rmaAdvance: function (id) {
        return act("/rma/" + encodeURIComponent(id) + "/advance", "POST", {}, function () {
          var x = M.rmas.find(function (c) { return c.id === id; });
          if (x && x.stage_index < RMA_STAGES.length - 1) {
            x.stage_index += 1; x.stage = RMA_STAGES[x.stage_index];
          }
          return x;
        });
      },
      firmwareBaseline: function () {
        return get("/firmware/baseline", function () { return M.baseline; },
          function (j) { return arr(j, ["components", "baseline"]); });
      },
      firmwareDrift: function () {
        return get("/firmware/drift", function () { return M.drift; },
          function (j) { return arr(j, ["drift", "machines"]); });
      },

      /* NCP: 미터링 · 격리 */
      metering: function (tenant) {
        return get("/metering/usage" + q({ tenant: tenant }), function () { return mockUsage(tenant); });
      },
      isolation: function (tenant) {
        return get("/isolation/" + encodeURIComponent(tenant), function () { return mockIsolation(tenant); },
          function (j) {
            if (j && Array.isArray(j.layers)) return j;
            // 평면 dict → layers 정규화
            var layers = Object.keys(j || {}).filter(function (k) { return k !== "tenant" && typeof j[k] === "object"; })
              .map(function (k) { var v = j[k] || {}; return { layer: k, value: v.id || v.value || v.pkey || "", status: v.status || (v.isolated === false ? "violation" : "isolated"), detail: v.detail || "" }; });
            return { tenant: tenant, layers: layers.length ? layers : mockIsolation(tenant).layers };
          });
      },
      tenants: function () { return M.tenants.slice(); },

      /* NVKE Managed K8s */
      nvkeReleases: function () {
        return get("/nvke/releases", mockReleases, function (j) {
          var m = mockReleases();
          var rel = arr(j, ["releases"]);
          return { releases: rel.length ? rel : m.releases,
            node_images: (j && j.node_images) || m.node_images,
            instance_types: (j && j.instance_types) || m.instance_types };
        });
      },
      nvkeClusters: function (tenant) {
        return get("/nvke/clusters" + q({ tenant_id: tenant }), function () {
          return M.nvke.filter(function (c) { return !tenant || c.tenant_id === tenant; });
        }, function (j) { return arr(j, ["clusters"]); });
      },
      nvkeCluster: function (id) {
        return get("/nvke/clusters/" + encodeURIComponent(id), function () { return findNvke(id) || null; });
      },
      nvkeCreate: function (body) {
        return act("/nvke/clusters", "POST", body, function () {
          var c = { id: nextId("nvke"), name: body.name, tenant_id: body.tenant_id,
            k8s_version: body.k8s_version, nvke_version: MATRIX.nvke, node_image: body.node_image,
            status: "provisioning", aicr_recipe: "aicr-" + (body.workload || "training") + "-vr-nvl72",
            created_at: new Date().toISOString(),
            nodepools: (body.nodepools || []).map(function (p, i) {
              return { id: "np-" + M.seq + "-" + i, name: p.name, instance_type: p.instance_type,
                count: +p.count || 1, status: "provisioning" };
            }) };
          M.nvke.unshift(c);
          return c;
        });
      },
      nvkeDelete: function (id) {
        return act("/nvke/clusters/" + encodeURIComponent(id), "DELETE", undefined, function () {
          M.nvke = M.nvke.filter(function (c) { return c.id !== id; });
          return { id: id, deleted: true };
        });
      },
      nvkeNodepools: function (id) {
        return get("/nvke/clusters/" + encodeURIComponent(id) + "/nodepools", function () {
          var c = findNvke(id); return c ? c.nodepools : [];
        }, function (j) { return arr(j, ["nodepools"]); });
      },
      nvkeAddNodepool: function (id, body) {
        return act("/nvke/clusters/" + encodeURIComponent(id) + "/nodepools", "POST", body, function () {
          var c = findNvke(id);
          var p = { id: nextId("np"), name: body.name, instance_type: body.instance_type,
            count: +body.count || 1, status: "provisioning" };
          if (c) c.nodepools.push(p);
          return p;
        });
      },
      nvkeKubeconfig: function (id) {
        return get("/nvke/clusters/" + encodeURIComponent(id) + "/kubeconfig", function () {
          var c = findNvke(id) || { id: id, name: id };
          return { cluster_id: id, kubeconfig: kubeconfigText(c) };
        }, function (j) {
          if (typeof j === "string") return { cluster_id: id, kubeconfig: j };
          return j;
        });
      },
      nvkeUpgrade: function (id, body) {
        return act("/nvke/clusters/" + encodeURIComponent(id) + "/upgrade", "POST", body, function () {
          var c = findNvke(id);
          if (c) { c.status = "upgrading"; c.upgrade = { target: body.k8s_version, progress: 0, started_at: new Date().toISOString() }; }
          return c;
        });
      },
      nvkeAicrRecipe: function (id) {
        return get("/nvke/clusters/" + encodeURIComponent(id) + "/aicr-recipe", function () {
          var c = findNvke(id) || {};
          return { cluster_id: id, recipe: c.aicr_recipe || "aicr-training-vr-nvl72",
            components: [{ name: "gpu-operator", version: "AICR recipe" }, { name: "network-operator", version: "AICR recipe" },
              { name: "nvsentinel", version: "AICR recipe" }, { name: "topograph", version: "AICR recipe" },
              { name: "kai-scheduler", version: "AICR recipe" }] };
        });
      },
      /* mock 진행 틱 — 업그레이드/프로비저닝 진행 시뮬레이션 (live 모드에서는 미사용) */
      mockTick: function () {
        M.nvke.forEach(function (c) {
          if (c.status === "provisioning") {
            c.status = "running";
            c.nodepools.forEach(function (p) { p.status = "ready"; });
          } else if (c.status === "upgrading" && c.upgrade) {
            c.upgrade.progress = Math.min(100, c.upgrade.progress + 25);
            if (c.upgrade.progress >= 100) { c.k8s_version = c.upgrade.target; c.status = "running"; }
          }
        });
      },
    };
    return api;
  }

  return { create: create, MATRIX: MATRIX, WPPS: WPPS, RMA_STAGES: RMA_STAGES, simulate: simulate, _buildMock: buildMock };
});
