/* v2 인프라 화면 보강 (design-infra) — F28 헬스 검증 게이트 · F31 Slurm 잡 (KO/EN).
   마운트: #hv-gate-root (route "p2-attest", 증명 화면 아래) · #slurm-ops-root (route "nvke-sched", KAI 아래).
   데이터: NOCP /api/v1/readiness/* · /api/v1/slurm/* 만 (에뮬레이터 직접 호출 없음). NOCP 미기동 → 결정적 mock + mock 배지.
   공유 컴포넌트: NC.flow(타임라인·진행) · NC.kpi(게이지·누적 막대·타일) · NC.msg(원문 뷰어). 없으면 표만 그린다.
   문자열은 L(ko, en) 한 자리에 둘 다 — 언어 토글 시 다시 그린다. */
(function () {
  var NC = window.NC = window.NC || {};
  var DOMAINS = ["xid", "gpu", "nvlink", "infiniband", "node"];
  var HV = { rack: "su-2-rack-00", gate: null, rules: null, live: null, calls: [], busy: false };
  var SL = { cluster: null, clusters: [], jobs: [], nodes: [], topo: "", live: null, job: null, busy: false };

  function lang() { try { return localStorage.getItem("nc-lang") === "en" ? "en" : "ko"; } catch (e) { return "ko"; } }
  function L(ko, en) { return lang() === "en" ? en : ko; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function $(id) { return document.getElementById(id); }
  function toast(m, k) { if (NC.toast) NC.toast(esc(m), k); }
  function base() {
    try { return window.localStorage.getItem("nc-nocp") || "http://127.0.0.1:8000"; }
    catch (e) { return "http://127.0.0.1:8000"; }
  }
  function headers() {
    var A = window.NC_AUTH;
    var s = typeof NC.session === "function" ? NC.session() : null;
    return A ? A.headers(s, window, A.token(window)) : {};
  }
  /* NOCP 호출 → {status, data, text, trace}. 네트워크 실패 → status 0 */
  async function api(method, path, body) {
    var h = headers();
    if (body !== undefined) h["Content-Type"] = "application/json";
    var tr = { method: method, url: path, req_body: body, at: new Date().toISOString() };
    try {
      var r = await fetch(base() + path, { method: method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
      var txt = await r.text(), j = null;
      try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = null; }
      tr.status = r.status; tr.res_body = j != null ? j : txt;
      return { status: r.status, data: j, text: txt, trace: tr };
    } catch (e) { tr.status = 0; return { status: 0, data: null, text: "", trace: tr }; }
  }
  function ok(r) { return r && r.status >= 200 && r.status < 300; }
  function src(live, path) {
    return (live ? '<span class="obs-src src-badge live" role="status">● ' + L("NOCP 라이브", "NOCP live") + "</span>"
      : '<span class="obs-src src-badge mock" role="status">◌ ' + L("NOCP 미연동 — mock", "NOCP offline — mock") + "</span>") +
      '<span class="iv-path">' + esc(path) + "</span>";
  }
  function head(title, sub, live, path, tick) {
    return '<div class="ph"><span class="tick' + (tick ? " " + tick : "") + '"></span><span class="t">' + esc(title) + '</span><span class="c">' +
      esc(sub) + "</span></div>" + '<div class="iv-src">' + src(live, path) + "</div>";
  }
  var SEV = { PASS: ["ok", "✓"], WARNING: ["warn", "!"], CRITICAL: ["crit", "✕"], UNKNOWN: ["warn", "?"], SKIPPED: ["none", "–"] };
  function sev(s) {
    s = String(s || "UNKNOWN").toUpperCase();
    var p = SEV[s] || SEV.UNKNOWN;
    return '<span class="iv-sev ' + p[0] + '"><span aria-hidden="true">' + p[1] + "</span> " + esc(s) + "</span>";
  }

  /* ── 결정적 mock ─────────────────────────────────────────── */
  function mockGate(rack) {
    var nodes = [];
    for (var t = 0; t < 18; t++) {
      var bad = t === 3, n = rack + "-tray-" + (t < 10 ? "0" : "") + t, by = {};
      DOMAINS.forEach(function (d) { by[d] = bad && d === "xid" ? "CRITICAL" : "PASS"; });
      nodes.push({ node: n, source: "local", ready: !bad, overall_severity: bad ? "CRITICAL" : "PASS",
        failing_checks: bad ? ["gpu-xid-critical"] : [], verdict: { severity_by_domain: by } });
    }
    return { ready: false, nodes_total: 18, nodes_failed: [rack + "-tray-03"], source: ["local"], schema_version: "0.5", nodes: nodes };
  }
  var MOCK_RULES = { source: "local", rules: [
    { name: "gpu-xid-critical", category: "xid", severity: "CRITICAL", expr: "gpus.exists(g, g.DCGM_FI_DEV_XID_ERROR in thresholds.critical_xids)", remediation: ["RESET_GPU", "REBOOT_NODE", "REPLACE_TRAY"] },
    { name: "gpu-ecc-dbe", category: "gpu", severity: "CRITICAL", expr: "DCGM_FI_DEV_ECC_DBE_VOL_TOTAL > thresholds.max_dbe", remediation: ["RESET_GPU"] },
    { name: "nvlink-crc-flit", category: "nvlink", severity: "WARNING", expr: "nvlink.crc_flit_errors > thresholds.max", remediation: ["REBOOT_NODE"] },
    { name: "ib-link-down", category: "infiniband", severity: "CRITICAL", expr: "ib.ports.exists(p, p.state != 'ACTIVE')", remediation: ["REPLACE_TRAY"] }] };
  function mockSlurm() {
    var nodes = [], st = function (i) { return i === 5 ? "DOWN" : i === 23 ? "DRAIN" : i < 18 ? "ALLOCATED" : "IDLE"; };
    for (var i = 0; i < 36; i++) nodes.push({ name: "gpu-" + ("00" + i).slice(-3), state: [st(i)], gres: "gpu:4",
      reason: i === 5 ? "XID 79 GPU fell off the bus" : i === 23 ? "prolog failed: gpu-xid-critical" : "",
      "x-neocloud": { block: i < 18 ? "su-1-rack-00" : "su-1-rack-01", tray_id: "" } });
    return {
      clusters: [{ id: "slurm-001", name: "demo-train", slurmrestd: "v0.0.42", topology_plugin: "topology/block", racks: ["su-1-rack-00", "su-1-rack-01"],
        nodes_total: 36, gpus_total: 144, nodes_by_state: { IDLE: 16, ALLOCATED: 18, DRAIN: 1, DOWN: 1 }, jobs_by_state: { RUNNING: 1, COMPLETED: 1 },
        prolog: { health_validation: true } }],
      jobs: [{ job_id: 2, name: "pretrain-b", job_state: ["RUNNING"], nodes: "gpu-[000-004,006-018]", tres_req_str: "gres/gpu=72,node=18", restart_cnt: 2,
        state_reason: "None", "x-neocloud": { history: [
          { state: "PENDING", message: "submitted" }, { state: "CONFIGURING", message: "allocated gpu-[018-035] (one NVL72 block); running prolog" },
          { state: "REQUEUED", message: "prolog failed on gpu-023 → nodes drained, job requeued" },
          { state: "RUNNING", message: "prolog passed on 18 nodes" }, { state: "NODE_FAIL", message: "gpu-005 failed: XID 79 GPU fell off the bus" },
          { state: "REQUEUED", message: "requeued from checkpoint excluding gpu-005 (restart_cnt=2)" }, { state: "RUNNING", message: "prolog passed on 18 nodes" }],
          prolog: [] } },
        { job_id: 1, name: "pretrain-a", job_state: ["COMPLETED"], nodes: "gpu-[000-017]", tres_req_str: "gres/gpu=72,node=18", restart_cnt: 0,
          state_reason: "None", "x-neocloud": { history: [{ state: "PENDING", message: "submitted" }, { state: "RUNNING", message: "prolog passed on 18 nodes" },
            { state: "COMPLETED", message: "exit 0" }], prolog: [] } }],
      nodes: nodes, topo: "BlockName=su-1-rack-00 Nodes=gpu-[000-017]\nBlockName=su-1-rack-01 Nodes=gpu-[018-035]\nBlockSizes=18\n" };
  }

  /* ── F28 헬스 검증 게이트 ────────────────────────────────── */
  async function hvLoad(evaluate) {
    var rr = await api("GET", "/api/v1/readiness/rules");
    HV.live = ok(rr);
    HV.rules = HV.live ? rr.data : MOCK_RULES;
    if (!HV.live) { HV.gate = mockGate(HV.rack); return; }
    if (evaluate || !HV.gate) {
      var g = await api("POST", "/api/v1/readiness/evaluate", { rack: HV.rack, who: "console" });
      HV.gate = ok(g) ? g.data : mockGate(HV.rack);
      HV.calls.unshift(g.trace);
    }
    HV.calls = HV.calls.slice(0, 6);
  }
  function hvMatrix(gate) {
    var rows = (gate.nodes || []).map(function (n) {
      var by = (n.verdict && n.verdict.severity_by_domain) || {};
      return "<tr" + (n.ready ? "" : ' class="bad"') + '><th scope="row" class="mono">' + esc(String(n.node).replace(HV.rack + "-", "")) + "</th>" +
        DOMAINS.map(function (d) { return "<td>" + sev(by[d] || "PASS") + "</td>"; }).join("") +
        "<td>" + sev(n.overall_severity) + "</td><td class=\"mono\">" + esc((n.failing_checks || []).join(", ") || "—") + "</td></tr>";
    }).join("");
    return '<div class="iv-scroll" role="region" tabindex="0" aria-label="' + esc(L("노드 × 도메인 판정표", "Node × domain verdict table")) + '">' +
      '<table class="tbl iv-mx"><caption>' + esc(L("노드별 도메인 판정 (NodeVerdict 0.5)", "Per-node domain verdict (NodeVerdict 0.5)")) + "</caption><thead><tr>" +
      '<th scope="col">' + esc(L("노드", "Node")) + "</th>" + DOMAINS.map(function (d) { return '<th scope="col">' + esc(d) + "</th>"; }).join("") +
      '<th scope="col">' + esc(L("종합", "Overall")) + '</th><th scope="col">' + esc(L("실패 검사", "Failing checks")) + "</th></tr></thead><tbody>" +
      rows + "</tbody></table></div>";
  }
  function hvRules(rules) {
    return '<div class="iv-scroll"><table class="tbl"><caption>' + esc(L("적용 규칙 (CEL)", "Applied rules (CEL)")) + "</caption><thead><tr>" +
      '<th scope="col">' + esc(L("규칙", "Rule")) + '</th><th scope="col">' + esc(L("도메인", "Domain")) + '</th><th scope="col">' + esc(L("심각도", "Severity")) +
      '</th><th scope="col">' + esc(L("식", "Expression")) + '</th><th scope="col">' + esc(L("조치", "Remediation")) + "</th></tr></thead><tbody>" +
      (rules || []).map(function (r) {
        return '<tr><td class="mono">' + esc(r.name) + "</td><td>" + esc(r.category) + "</td><td>" + sev(r.severity) +
          '</td><td class="mono iv-expr">' + esc(r.expr) + "</td><td>" + esc((r.remediation || []).join(" → ")) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }
  function hvRender() {
    var root = $("hv-gate-root");
    if (!root) return;
    var g = HV.gate || { nodes: [], nodes_failed: [] }, rules = (HV.rules && HV.rules.rules) || [];
    var total = g.nodes_total || (g.nodes || []).length, bad = (g.nodes_failed || []).length, readyN = total - bad;
    var K = NC.kpi;
    var tiles = K ? K.grid([
      K.gauge({ label: L("준비된 노드", "Ready nodes"), value: total ? Math.round(readyN / total * 1000) / 10 : 0, min: 0, max: 100, target: 100, unit: "%", digits: 1, size: 140 }),
      K.stat({ label: L("게이트 판정", "Gate verdict"), value: g.ready ? "PASS" : "FAIL", sub: readyN + " / " + total + L(" 노드 준비", " nodes ready") }),
      K.stat({ label: L("적용 규칙", "Rules"), value: rules.length, sub: L("출처 ", "source ") + ((HV.rules && HV.rules.source) || "—") })
    ], { min: 170 }) : "";
    var banner = '<div class="iv-ban ' + (g.ready ? "ok" : "bad") + '" role="' + (g.ready ? "status" : "alert") + '"><span class="iv-bi" aria-hidden="true">' +
      (g.ready ? "✓" : "✕") + "</span><div><b>" + esc(g.ready ? L("게이트 통과 — 테넌트에 넘길 수 있음", "Gate passed — ready to hand to tenants")
        : L("게이트 실패 — 노드 격리 후 재평가", "Gate failed — quarantine nodes, then re-evaluate")) + "</b><p>" +
      esc(bad ? L("실패 노드: ", "Failed nodes: ") + g.nodes_failed.join(", ") : L("모든 노드 PASS", "All nodes PASS")) + "</p></div></div>";
    var raw = NC.msg && HV.calls.length ? '<details class="iv-raw"><summary>' + esc(L("원본 요청/응답", "Raw request / response")) + " " + HV.calls.length +
      "</summary>" + NC.msg.list(HV.calls, { limit: 6, openFirst: false, ariaLabel: L("게이트 원본 요청/응답", "Gate raw requests") }) + "</details>" : "";
    root.innerHTML = '<div class="panel iv">' + head(L("헬스 검증 게이트 (F28)", "Health validation gate (F28)"),
      L("DCGM · NVLink · IB · NCCL 규칙 → 노드 판정 → 준비 게이트", "DCGM · NVLink · IB · NCCL rules → node verdict → readiness gate"),
      HV.live, "/api/v1/readiness/{rules,evaluate,inject}", g.ready ? "" : "red") +
      '<div class="iv-bar"><label for="hv-rack">' + esc(L("랙", "Rack")) + '</label><input id="hv-rack" value="' + esc(HV.rack) + '">' +
      '<button type="button" class="btn" data-iv="hv-eval"' + (HV.busy ? " disabled" : "") + ">" + esc(L("게이트 평가", "Evaluate gate")) + "</button>" +
      '<button type="button" class="btn-warn" data-iv="hv-inject"' + (HV.busy ? " disabled" : "") + ">" + esc(L("장애 주입: tray-03 XID 79", "Inject: tray-03 XID 79")) + "</button>" +
      '<button type="button" class="btn-ghost" data-iv="hv-clear"' + (HV.busy ? " disabled" : "") + ">" + esc(L("주입 해제", "Clear injection")) + "</button>" +
      '<a class="btn-ghost" href="#/demo-center?scenario=f28-health-validation">' + esc(L("데모 센터", "Demo center")) + "</a></div>" +
      '<div class="iv-top">' + banner + tiles + "</div>" + hvMatrix(g) +
      '<details class="iv-raw"><summary>' + esc(L("적용 규칙", "Applied rules")) + " " + rules.length + "</summary>" + hvRules(rules) + "</details>" + raw + "</div>";
  }
  async function hvShow(evaluate) { await hvLoad(evaluate); hvRender(); }
  async function hvAction(kind) {
    if (!HV.live) { toast(L("NOCP 미연동 — mock 화면에서는 실행할 수 없습니다", "NOCP offline — not available in mock"), "warn"); return; }
    var inp = $("hv-rack");
    if (inp && inp.value) HV.rack = inp.value.trim();
    var node = HV.rack + "-tray-03", r = null;
    HV.busy = true; hvRender();
    if (kind === "hv-inject") r = await api("POST", "/api/v1/readiness/inject", { node: node, gpu: 0, signals: { DCGM_FI_DEV_XID_ERROR: 79 } });
    if (kind === "hv-clear") r = await api("DELETE", "/api/v1/readiness/inject/" + encodeURIComponent(node));
    if (r) { HV.calls.unshift(r.trace); if (!ok(r)) toast(L("요청 실패 — HTTP ", "Request failed — HTTP ") + r.status, "err"); }
    HV.busy = false;
    await hvShow(true);
  }

  /* ── F31 Slurm (Slinky · slurmrestd) ─────────────────────── */
  var NODE_ST = { IDLE: ["ok", "I", "유휴", "idle"], ALLOCATED: ["info", "A", "할당", "allocated"], MIXED: ["info", "M", "일부 할당", "mixed"],
    DRAIN: ["warn", "D", "드레인", "drain"], DOWN: ["crit", "X", "다운", "down"] };
  var JOB_TONE = { RUNNING: "active", COMPLETED: "done", PENDING: "pending", CONFIGURING: "active", REQUEUED: "warn", NODE_FAIL: "fail", FAILED: "fail", CANCELLED: "skip" };
  async function slLoad() {
    var c = await api("GET", "/api/v1/slurm/clusters");
    SL.live = ok(c);
    if (!SL.live) {
      var m = mockSlurm();
      SL.clusters = m.clusters; SL.cluster = "slurm-001"; SL.jobs = m.jobs; SL.nodes = m.nodes; SL.topo = m.topo; return;
    }
    SL.clusters = Array.isArray(c.data) ? c.data : (c.data && c.data.items) || [];
    if (!SL.cluster || !SL.clusters.some(function (x) { return x.id === SL.cluster; })) SL.cluster = SL.clusters[0] ? SL.clusters[0].id : null;
    if (!SL.cluster) { SL.jobs = []; SL.nodes = []; SL.topo = ""; return; }
    var id = encodeURIComponent(SL.cluster), cl = SL.clusters.filter(function (x) { return x.id === SL.cluster; })[0] || {};
    var j = await api("GET", "/api/v1/slurm/clusters/" + id + "/jobs");
    var n = await api("GET", "/api/v1/slurm/clusters/" + id + "/slurm/" + (cl.slurmrestd || "v0.0.42") + "/nodes");
    var t = await api("GET", "/api/v1/slurm/clusters/" + id + "/topology.conf");
    SL.jobs = ok(j) ? ((j.data && j.data.jobs) || []).slice().reverse() : [];
    SL.nodes = ok(n) ? (n.data && n.data.nodes) || [] : [];
    SL.topo = ok(t) ? t.text : "";
  }
  /* slurmrestd state 는 배열(["IDLE","DRAIN"]) — 가장 심각한 것을 대표로 */
  function nodeState(n) {
    var xs = n.state || [];
    for (var i = 0, P = ["DOWN", "DRAIN", "ALLOCATED", "MIXED", "IDLE"]; i < P.length; i++) if (xs.indexOf(P[i]) >= 0) return P[i];
    return "IDLE";
  }
  function blocks(nodes) {
    var by = {}, order = [];
    nodes.forEach(function (n) {
      var b = (n["x-neocloud"] && n["x-neocloud"].block) || "—";
      if (!by[b]) { by[b] = []; order.push(b); }
      by[b].push(n);
    });
    return '<ul class="sl-blocks">' + order.map(function (b) {
      var ns = by[b], cnt = {};
      ns.forEach(function (n) { var s = nodeState(n); cnt[s] = (cnt[s] || 0) + 1; });
      var sum = Object.keys(cnt).map(function (s) { return L(NODE_ST[s][2], NODE_ST[s][3]) + " " + cnt[s]; }).join(" · ");
      return '<li class="sl-block"><div class="sl-bh"><b class="mono">' + esc(b) + '</b><span>NVL72 · ' + ns.length + L("노드", " nodes") + "</span></div>" +
        '<div class="sl-cells" role="img" aria-label="' + esc(b + " — " + sum) + '">' + ns.map(function (n) {
          var s = nodeState(n), p = NODE_ST[s];
          return '<span class="sl-c ' + p[0] + '" title="' + esc(n.name + " · " + s + (n.reason ? " · " + n.reason : "")) + '">' + p[1] + "</span>";
        }).join("") + '</div><div class="sl-bs">' + esc(sum) + "</div></li>";
    }).join("") + "</ul>" +
      '<p class="sl-leg">' + Object.keys(NODE_ST).map(function (s) {
        var p = NODE_ST[s]; return '<span><span class="sl-c ' + p[0] + '" aria-hidden="true">' + p[1] + "</span> " + esc(s) + "</span>";
      }).join("") + "</p>";
  }
  function jobState(j) { return (j.job_state || [])[0] || "PENDING"; }
  function jobDetail(j) {
    if (!j) return "";
    var x = j["x-neocloud"] || {}, pro = x.prolog || [];
    var hist = (x.history || []).map(function (h, i) {
      return { id: "h" + i, label: h.state, sub: h.message, status: JOB_TONE[h.state] || "pending", at: h.at };
    });
    if (hist.length) hist[hist.length - 1].status = jobState(j) === "RUNNING" ? "active" : hist[hist.length - 1].status;
    var bad = pro.filter(function (p) { return p.exit_code; });
    return '<div class="sl-det" aria-live="polite"><div class="sl-dh"><b>#' + esc(j.job_id) + " " + esc(j.name) + "</b> " +
      '<span class="iv-sev ' + (jobState(j) === "RUNNING" ? "ok" : jobState(j) === "COMPLETED" ? "none" : "warn") + '">' + esc(jobState(j)) + "</span>" +
      '<span class="mono">' + esc(j.nodes || "—") + "</span><span>" + esc(L("재시작 ", "restarts ") + (j.restart_cnt || 0)) + "</span></div>" +
      '<div class="sl-two"><div><div class="iv-k">' + esc(L("잡 이력 (x-neocloud.history)", "Job history (x-neocloud.history)")) + "</div>" +
      (NC.flow ? NC.flow.timeline(hist, { ariaLabel: L("잡 이력", "Job history") }) : "") + "</div>" +
      '<div><div class="iv-k">' + esc(L("prolog 헬스 검증 (F28)", "Prolog health validation (F28)")) + "</div>" +
      "<p>" + esc(pro.length ? L("검사 ", "checked ") + pro.length + L("회 · 실패 ", " · failed ") + bad.length : L("기록 없음", "no record")) + "</p>" +
      (bad.length ? '<ul class="sl-bad">' + bad.map(function (p) {
        return "<li>" + sev(p.overall_severity) + ' <span class="mono">' + esc(p.node + " (" + p.tray_id + ")") + "</span> " +
          esc((p.failing_checks || []).join(", ")) + "</li>";
      }).join("") + "</ul>" : "") + "</div></div></div>";
  }
  function slRender() {
    var root = $("slurm-ops-root");
    if (!root) return;
    var c = SL.clusters.filter(function (x) { return x.id === SL.cluster; })[0];
    var hd = head(L("Slurm 잡 · Slinky (F31)", "Slurm jobs · Slinky (F31)"),
      L("sbatch → topology/block 배치 → prolog 헬스 검증 → 장애 시 DRAIN·재큐", "sbatch → topology/block placement → prolog health validation → DRAIN · requeue on failure"),
      SL.live, "/api/v1/slurm/clusters/{id}/{jobs,slurm/v0.0.42/*,topology.conf}");
    var bar = '<div class="iv-bar"><label for="sl-cluster">' + esc(L("클러스터", "Cluster")) + '</label><select id="sl-cluster">' +
      (SL.clusters.map(function (x) {
        return '<option value="' + esc(x.id) + '"' + (x.id === SL.cluster ? " selected" : "") + ">" + esc(x.id + " · " + x.name) + "</option>";
      }).join("") || '<option value="">' + esc(L("Slurm 클러스터 없음", "no Slurm cluster")) + "</option>") + "</select>" +
      '<button type="button" class="btn-ghost" data-iv="sl-refresh">' + esc(L("새로고침", "Refresh")) + "</button>" +
      '<a class="btn-ghost" href="#/demo-center?scenario=f31-slurm">' + esc(L("데모 센터", "Demo center")) + "</a></div>";
    if (!c) {
      root.innerHTML = '<div class="panel iv">' + hd + bar + '<p class="iv-none">' +
        esc(L("Slurm 클러스터를 만들면 잡과 노드가 여기에 보입니다 (데모 센터 f31).", "Create a Slurm cluster to see jobs and nodes here (demo center f31).")) + "</p></div>";
      return;
    }
    var byS = c.nodes_by_state || {}, K = NC.kpi;
    var parts = ["ALLOCATED", "IDLE", "DRAIN", "DOWN"].map(function (s) {
      return { label: L(NODE_ST[s][2], NODE_ST[s][3]), value: byS[s] || 0, tone: NODE_ST[s][0] };
    });
    var running = SL.jobs.filter(function (j) { return jobState(j) === "RUNNING"; }).length;
    var tiles = K ? K.grid([
      K.stat({ label: L("노드", "Nodes"), value: c.nodes_total, sub: (c.racks || []).length + L("랙 · ", " racks · ") + (c.gpus_total || 0) + " GPU" }),
      K.stat({ label: L("실행 중 잡", "Running jobs"), value: running, sub: L("전체 ", "total ") + SL.jobs.length }),
      K.stack(parts, { label: L("노드 상태", "Node states"), total: c.nodes_total })
    ], { min: 200 }) : "";
    if (!SL.job || !SL.jobs.some(function (j) { return String(j.job_id) === String(SL.job); })) SL.job = SL.jobs[0] ? String(SL.jobs[0].job_id) : null;
    var sel = SL.jobs.filter(function (j) { return String(j.job_id) === String(SL.job); })[0];
    var jt = '<div class="iv-scroll"><table class="tbl"><caption>' + esc(L("잡 (slurmrestd v0.0.42)", "Jobs (slurmrestd v0.0.42)")) + "</caption><thead><tr>" +
      ["ID", L("이름", "Name"), L("상태", "State"), L("노드", "Nodes"), "TRES", L("재시작", "Restarts"), ""].map(function (h) {
        return '<th scope="col">' + esc(h) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      (SL.jobs.map(function (j) {
        var s = jobState(j), on = String(j.job_id) === String(SL.job);
        return "<tr" + (on ? ' class="sel"' : "") + '><td class="mono">' + esc(j.job_id) + "</td><td>" + esc(j.name) + "</td><td>" +
          '<span class="iv-sev ' + (s === "RUNNING" ? "ok" : s === "COMPLETED" ? "none" : "warn") + '">' + esc(s) + "</span></td>" +
          '<td class="mono">' + esc(j.nodes || "—") + '</td><td class="mono">' + esc(j.tres_req_str || "") + "</td><td>" + esc(j.restart_cnt || 0) + "</td>" +
          '<td><button type="button" class="btn-ghost" data-iv="sl-job" data-job="' + esc(j.job_id) + '" aria-pressed="' + on + '">' +
          esc(L("이력", "History")) + "</button>" + (s === "RUNNING" ? ' <button type="button" class="btn-ghost" data-iv="sl-done" data-job="' + esc(j.job_id) +
            '" aria-label="' + esc(L("잡 종료 ", "Complete job ") + j.job_id) + '">' + esc(L("종료", "Complete")) + "</button>" : "") + "</td></tr>";
      }).join("") || '<tr><td colspan="7">—</td></tr>') + "</tbody></table></div>";
    root.innerHTML = '<div class="panel iv">' + hd + bar + tiles +
      '<div class="iv-k">' + esc(L("블록 배치 (topology/block — 한 잡은 NVL72 블록 하나 우선)", "Block placement (topology/block — one job per NVL72 block first)")) + "</div>" +
      blocks(SL.nodes) + jt + jobDetail(sel) +
      (SL.topo ? '<details class="iv-raw"><summary>topology.conf</summary><pre class="iv-pre">' + esc(SL.topo) + "</pre></details>" : "") + "</div>";
  }
  async function slShow() { await slLoad(); slRender(); }

  var css = document.createElement("style");
  css.textContent =
    ".iv-src{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:-4px 0 10px}.iv-path{color:var(--text-3);font-size:var(--fs-xs);font-family:var(--font-mono)}" +
    ".iv-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 12px}.iv-bar label{font-size:var(--fs-xs);color:var(--text-2)}" +
    ".iv-bar input,.iv-bar select{background:var(--surface-1);color:var(--text-1);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:5px 7px;font-size:var(--fs-sm);max-width:100%}" +
    ".iv input:focus-visible,.iv select:focus-visible,.iv button:focus-visible,.iv a:focus-visible,.iv summary:focus-visible,.iv-scroll:focus-visible{outline:2px solid var(--focus);outline-offset:2px}" +
    ".iv-top{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:12px;align-items:start;margin-bottom:12px}" +
    ".iv-ban{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--ok-line);background:var(--ok-bg);border-left:4px solid var(--ok);border-radius:var(--radius);padding:10px 12px}" +
    ".iv-ban.bad{border-color:var(--crit-line);background:var(--crit-bg);border-left-color:var(--crit)}" +
    ".iv-ban b{color:var(--text-1);font-size:var(--fs-md)}.iv-ban p{margin:4px 0 0;color:var(--text-1);font-size:var(--fs-sm);overflow-wrap:anywhere}" +
    ".iv-bi{flex:0 0 28px;height:28px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:var(--fw-bold);color:var(--ok);box-shadow:inset 0 0 0 2px var(--ok)}" +
    ".iv-ban.bad .iv-bi{background:var(--crit);color:var(--on-crit);box-shadow:none}" +
    ".iv-scroll{overflow-x:auto;max-width:100%;position:relative}.iv-mx td,.iv-mx th{white-space:nowrap}.iv-mx tr.bad th{color:var(--crit)}" +
    ".iv .tbl caption{text-align:left;color:var(--text-2);font-size:var(--fs-xs);padding:2px 0 4px}" +
    ".iv-sev{display:inline-flex;gap:3px;align-items:center;font-size:var(--fs-2xs);font-weight:var(--fw-bold);padding:1px 6px;border-radius:var(--radius-pill);border:1px solid var(--border);color:var(--text-2);white-space:nowrap}" +
    ".iv-sev.ok{color:var(--ok);border-color:var(--ok-line);background:var(--ok-bg)}.iv-sev.warn{color:var(--warn);border-color:var(--warn-line);background:var(--warn-bg)}" +
    ".iv-sev.crit{color:var(--crit);border-color:var(--crit-line);background:var(--crit-bg)}" +
    ".iv-expr{max-width:380px;white-space:normal;overflow-wrap:anywhere}.mono{font-family:var(--font-mono)}" +
    ".iv-raw{margin-top:10px}.iv-raw summary{cursor:pointer;font-size:var(--fs-sm);color:var(--text-2)}.iv-none{color:var(--text-2);font-size:var(--fs-sm)}" +
    ".iv-k{font-size:var(--fs-xs);color:var(--text-2);font-weight:var(--fw-semi);margin:10px 0 6px}" +
    ".iv-pre{white-space:pre-wrap;font-size:var(--fs-xs);background:var(--surface-2);border:1px solid var(--border);padding:8px;border-radius:var(--radius);color:var(--text-1)}" +
    ".sl-blocks{list-style:none;margin:0 0 6px;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr));gap:10px}" +
    ".sl-block{border:1px solid var(--border);border-radius:var(--radius-lg);padding:8px 10px;background:var(--surface-2)}" +
    ".sl-bh{display:flex;justify-content:space-between;gap:6px;font-size:var(--fs-xs);color:var(--text-2);margin-bottom:6px}.sl-bh b{color:var(--text-1)}" +
    ".sl-cells{display:grid;grid-template-columns:repeat(9,1fr);gap:3px}" +
    ".sl-c{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:22px;border-radius:var(--radius-sm);font-size:var(--fs-2xs);font-weight:var(--fw-bold);font-family:var(--font-mono);border:1px solid var(--border);color:var(--text-2);background:var(--surface-1)}" +
    ".sl-c.ok{border-color:var(--ok-line);color:var(--ok);background:var(--ok-bg)}.sl-c.info{border-color:var(--info-line);color:var(--info-text);background:var(--info-bg)}" +
    ".sl-c.warn{border-color:var(--warn);color:var(--warn);background:var(--warn-bg)}.sl-c.crit{border-color:var(--crit);color:var(--on-crit);background:var(--crit)}" +
    ".sl-bs{font-size:var(--fs-xs);color:var(--text-2);margin-top:6px}.sl-leg{display:flex;gap:12px;flex-wrap:wrap;font-size:var(--fs-xs);color:var(--text-2);margin:0 0 10px}" +
    ".sl-leg>span{display:inline-flex;gap:4px;align-items:center}" +
    ".iv tr.sel td{background:var(--accent-soft)}" +
    ".sl-det{margin-top:10px;border:1px solid var(--border);border-radius:var(--radius-lg);padding:10px 12px;background:var(--surface-2)}" +
    ".sl-dh{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:var(--fs-sm)}.sl-dh b{font-size:var(--fs-md)}" +
    ".sl-two{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:12px}.sl-two p{font-size:var(--fs-sm);color:var(--text-1);margin:0 0 6px}" +
    ".sl-bad{margin:0;padding-left:16px;font-size:var(--fs-xs)}" +
    "@media (max-width:900px){.iv-top,.sl-two{grid-template-columns:1fr}}";
  if (document.head && document.head.appendChild) document.head.appendChild(css);

  if (document.addEventListener) {
    document.addEventListener("click", function (e) {
      if (e.target && e.target.closest && e.target.closest("#lang-toggle [data-lang]")) {
        setTimeout(function () { if ($("hv-gate-root")) hvRender(); if ($("slurm-ops-root")) slRender(); }, 0);
        return;
      }
      var t = e.target && e.target.closest && e.target.closest("[data-iv]");
      if (!t) return;
      var k = t.getAttribute("data-iv");
      if (k === "hv-eval") { var i = $("hv-rack"); if (i && i.value) HV.rack = i.value.trim(); return hvShow(true); }
      if (k === "hv-inject" || k === "hv-clear") return hvAction(k);
      if (k === "sl-refresh") return slShow();
      if (k === "sl-job") { SL.job = t.getAttribute("data-job"); slRender(); var b = document.querySelector('[data-iv="sl-job"][data-job="' + SL.job + '"]'); if (b) b.focus(); return; }
      if (k === "sl-done") {
        if (!SL.live) { toast(L("NOCP 미연동 — mock 화면에서는 실행할 수 없습니다", "NOCP offline — not available in mock"), "warn"); return; }
        return api("POST", "/api/v1/slurm/clusters/" + encodeURIComponent(SL.cluster) + "/jobs/" + t.getAttribute("data-job") + ":complete", { exit_code: 0 })
          .then(function (r) { toast(ok(r) ? L("잡 종료됨", "Job completed") : L("요청 실패 — HTTP ", "Request failed — HTTP ") + r.status, ok(r) ? "ok" : "err"); return slShow(); });
      }
    });
    document.addEventListener("change", function (e) {
      if (e.target && e.target.id === "sl-cluster") { SL.cluster = e.target.value; SL.job = null; slShow(); }
    });
  }

  NC.infraV2 = { hvShow: hvShow, slShow: slShow, mockGate: mockGate, mockSlurm: mockSlurm, state: { hv: HV, sl: SL } };
  if (NC.bus) NC.bus.on("route", function (id) {
    if (id === "p2-attest") return hvShow(false);
    if (id === "nvke-sched") return slShow();
  });
})();
