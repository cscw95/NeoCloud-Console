/* F11 NVKE 노드·토폴로지 / CAPI 상태 / IMEX ComputeDomain 패널 (KO/EN).
   마운트: 고객 #nvke-topo-root (route "nvke"), 운영 #nvke-capi-root (route "nvke-capi").
   데이터: NC.dsx nvkeClusters · nvkeCapi · nvkeNodes · nvkeComputeDomains (NOCP /api/v1/nvke/*).
   운영 화면만: 시연 실행(데모 센터 f11-nvke-capi) · 장애 주입(NVSentinel 노드 교체). */
(function () {
  var NC = window.NC = window.NC || {};
  var D = NC.dsx;
  if (!D) return;
  var CLIQUE = "nvidia.com/gpu.clique", ZONE = "topology.kubernetes.io/zone",
    LEAF = "network.topology.nvidia.com/ib-leaf", SPINE = "network.topology.nvidia.com/ib-spine";
  var S = { cluster: null, tab: "nodes" };

  function lang() { try { return localStorage.getItem("nc-lang") === "en" ? "en" : "ko"; } catch (e) { return "ko"; } }
  function L(ko, en) { return lang() === "en" ? en : ko; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function st(s) {
    s = String(s || "—");
    var c = /fail|notready|delet/i.test(s) ? "red" : /pend|provisioning|updat|scaling/i.test(s) ? "amber"
      : /run|ready|provisioned|joined|verified/i.test(s) ? "green" : "blue";
    return '<span class="st ' + c + '">' + esc(s) + "</span>";
  }
  function sess() { return typeof NC.session === "function" ? NC.session() : null; }
  function isOps() { return !!document.getElementById("nvke-capi-root"); }
  function root() { return document.getElementById("nvke-capi-root") || document.getElementById("nvke-topo-root"); }

  var css = document.createElement("style");
  css.textContent =
    ".nvt-tabs{display:flex;gap:4px;margin:8px 0 12px;flex-wrap:wrap}" +
    ".nvt-tabs button{background:none;border:1px solid var(--line);color:var(--muted);border-radius:14px;padding:4px 12px;font-size:11.5px;cursor:pointer}" +
    ".nvt-tabs button[aria-selected=true]{border-color:var(--green);color:var(--green)}" +
    ".nvt-tabs button:focus-visible,.nvt-bar select:focus-visible,.nvt-bar button:focus-visible{outline:2px solid var(--green);outline-offset:2px}" +
    ".nvt-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12px}" +
    ".nvt-bar select{background:var(--card);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:5px 8px;font-size:12px}" +
    ".nvt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}" +
    ".nvt-cl{border:1px solid var(--line);border-radius:10px;padding:12px 14px;background:var(--card)}" +
    ".nvt-cl h4{margin:0 0 6px;font-size:12.5px;word-break:break-all}.nvt-cl dl{display:grid;grid-template-columns:110px 1fr;gap:3px 8px;margin:0;font-size:11.5px}" +
    ".nvt-cl dt{color:var(--muted)}.nvt-cl dd{margin:0;word-break:break-all}" +
    ".nvt-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}.nvt-chips span{font-size:10.5px;border:1px solid var(--line);border-radius:8px;padding:1px 6px;color:var(--muted)}" +
    ".nvt-hist{font-size:11px;color:var(--muted);max-height:220px;overflow:auto;margin:8px 0 0;padding-left:16px}";
  document.head.appendChild(css);

  async function render() {
    var host = root();
    if (!host) return;
    var s = sess();
    var tenant = isOps() ? null : (s ? s.tenant_id : "tnt-fin-corp");
    var cls = ((await D.nvkeClusters(tenant)).data || []).filter(function (c) { return c.source !== "nkd"; });
    if (!S.cluster || !cls.some(function (c) { return c.id === S.cluster; })) S.cluster = cls[0] ? cls[0].id : null;
    var tabs = [["nodes", "노드·토폴로지", "Nodes & topology"], ["capi", "CAPI 상태", "CAPI status"],
      ["imex", "IMEX ComputeDomain", "IMEX ComputeDomain"]];
    var bar = '<div class="nvt-bar"><label for="nvt-cluster">' + L("클러스터", "Cluster") + '</label>' +
      '<select id="nvt-cluster">' + (cls.map(function (c) {
        return '<option value="' + esc(c.id) + '"' + (c.id === S.cluster ? " selected" : "") + ">" + esc(c.id + " · " + c.name) + "</option>";
      }).join("") || '<option value="">' + L("NVKE 클러스터 없음", "no NVKE cluster") + "</option>") + "</select>" +
      (isOps() ? ' <button class="btn" data-nvt="demo">' + L("시연 실행", "Run demo") + "</button>" +
        ' <button class="btn-ghost" data-nvt="inject"' + (S.cluster ? "" : " disabled") + ">" +
        L("장애 주입: 노드 교체", "Inject fault: replace node") + "</button>" : "") + "</div>";
    var tl = '<div class="nvt-tabs" role="tablist" aria-label="' + L("NVKE 상세", "NVKE detail") + '">' + tabs.map(function (t) {
      var on = t[0] === S.tab;
      return '<button role="tab" id="nvt-tab-' + t[0] + '" aria-controls="nvt-panel" aria-selected="' + on + '" tabindex="' +
        (on ? 0 : -1) + '" data-nvt-tab="' + t[0] + '">' + esc(L(t[1], t[2])) + "</button>";
    }).join("") + "</div>";
    var body = S.cluster ? await panel(S.cluster) : '<div style="color:var(--muted);font-size:12px">' +
      L("클러스터를 만들면 CAPI 객체·클리크·ComputeDomain이 여기에 보입니다.", "Create a cluster to see CAPI objects, cliques and ComputeDomains.") + "</div>";
    host.innerHTML = '<div class="panel"><div class="ph"><span class="tick"></span><span class="t">' +
      L("NVKE 노드·토폴로지 (F11)", "NVKE nodes & topology (F11)") + '</span><span class="c">/api/v1/nvke/clusters/{id}/{nodes,capi,compute-domains}</span></div>' +
      bar + tl + '<div id="nvt-panel" role="tabpanel" aria-labelledby="nvt-tab-' + S.tab + '">' + body + "</div></div>";
  }

  async function panel(cid) {
    if (S.tab === "capi") {
      var c = (await D.nvkeCapi(cid)).data || {};
      var mds = c.machine_deployments || [];
      return '<div class="nvt-bar" style="margin-bottom:8px">Cluster ' + st((c.cluster || {}).phase) + " · failureDomains " +
        esc(((c.cluster || {}).failure_domains || []).join(", ")) + " · NicoMachine " + (c.nico_machines || []).length +
        " · Machine " + (c.machines || []).length + "</div>" +
        '<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>MachineDeployment</th><th>NodePool</th><th>failureDomain</th>' +
        "<th>" + L("복제", "Replicas") + "</th><th>Ready</th><th>UpToDate</th><th>" + L("버전", "Version") + "</th><th>Phase</th></tr></thead><tbody>" +
        (mds.map(function (m) {
          return "<tr><td class='id'>" + esc(m.name) + "</td><td>" + esc(m.nodepool) + "</td><td>" + esc(m.failure_domain) + "</td><td>" +
            m.replicas + "</td><td>" + m.ready_replicas + "</td><td>" + m.up_to_date_replicas + "</td><td>" + esc(m.version) + "</td><td>" + st(m.phase) + "</td></tr>";
        }).join("") || "<tr><td colspan=8>—</td></tr>") + "</tbody></table></div>" +
        '<ol class="nvt-hist" aria-label="' + L("단계 이력", "Phase history") + '">' + (c.history || []).slice(-15).reverse().map(function (h) {
          return "<li>" + esc(h.at) + " · " + esc(h.kind) + " <b>" + esc(h.name) + "</b> → " + esc(h.phase) + " — " + esc(h.detail) + "</li>";
        }).join("") + "</ol>";
    }
    if (S.tab === "imex") {
      var cds = (await D.nvkeComputeDomains(cid)).data || [];
      return '<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>ComputeDomain</th><th>NodePool</th><th>' + L("랙", "Racks") +
        "</th><th>" + L("노드", "Nodes") + "</th><th>Clique</th><th>IMEX " + L("채널", "channels") + "</th><th>" + L("상태", "Status") + "</th></tr></thead><tbody>" +
        (cds.map(function (d) {
          return "<tr><td class='id'>" + esc(d.name) + (d.auto ? ' <span class="st blue">auto</span>' : "") + "</td><td>" + esc(d.nodepool) +
            "</td><td>" + esc(d.racks.join(", ")) + "</td><td>" + d.num_nodes + "</td><td>" + d.cliques.length + "</td><td>" +
            esc(((d.imex_channels || [])[0] || {}).count) + "</td><td>" + st(d.status) + "</td></tr>";
        }).join("") || "<tr><td colspan=7>—</td></tr>") + "</tbody></table></div>";
    }
    var nodes = (await D.nvkeNodes(cid)).data || [];
    var by = {};
    nodes.forEach(function (n) { var k = n.labels[CLIQUE] || ("cpu · " + n.labels[ZONE]); (by[k] = by[k] || []).push(n); });
    return '<div class="nvt-grid">' + (Object.keys(by).sort().map(function (k) {
      var ns = by[k], n0 = ns[0], joined = ns.filter(function (n) { return n.join.state === "Joined"; }).length;
      var tpm = ns.filter(function (n) { return n.attestation.tpm === "verified"; }).length;
      return '<div class="nvt-cl"><h4>gpu.clique ' + esc(k) + "</h4><dl>" +
        "<dt>" + L("랙 (zone)", "Rack (zone)") + "</dt><dd>" + esc(n0.labels[ZONE]) + "</dd>" +
        "<dt>NodePool</dt><dd>" + esc(n0.nodepool) + "</dd>" +
        "<dt>" + L("노드", "Nodes") + "</dt><dd>" + ns.length + "</dd>" +
        "<dt>IB leaf / spine</dt><dd>" + esc(n0.labels[LEAF] || "—") + " / " + esc(n0.labels[SPINE] || "—") + "</dd>" +
        "<dt>nvke-agent</dt><dd>" + st(joined + "/" + ns.length + " Joined") + "</dd>" +
        "<dt>TPM</dt><dd>" + st(tpm + "/" + ns.length + " verified") + "</dd></dl>" +
        '<div class="nvt-chips">' + ns.map(function (n) {
          return '<span title="' + esc(n.provider_id + " · " + n.machine_phase) + '">' + esc(n.name) + "</span>";
        }).join("") + "</div></div>";
    }).join("") || '<div style="color:var(--muted)">—</div>') + "</div>";
  }

  document.addEventListener("change", function (e) {
    if (e.target && e.target.id === "nvt-cluster") { S.cluster = e.target.value; render(); }
  });
  document.addEventListener("keydown", function (e) {
    var t = e.target.closest && e.target.closest("[data-nvt-tab]");
    if (!t || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
    var all = Array.prototype.slice.call(document.querySelectorAll("[data-nvt-tab]"));
    var i = (all.indexOf(t) + (e.key === "ArrowRight" ? 1 : all.length - 1)) % all.length;
    S.tab = all[i].dataset.nvtTab;
    render().then(function () { var b = document.getElementById("nvt-tab-" + S.tab); if (b) b.focus(); });
  });
  document.addEventListener("click", async function (e) {
    var t = e.target.closest && e.target.closest("[data-nvt-tab],[data-nvt]");
    if (!t) return;
    if (t.dataset.nvtTab) { S.tab = t.dataset.nvtTab; return render(); }
    if (t.dataset.nvt === "demo") { location.hash = "#/demo-center?scenario=f11-nvke-capi"; return; }
    if (t.dataset.nvt === "inject" && S.cluster) {
      var nodes = (await D.nvkeNodes(S.cluster)).data || [];
      if (!nodes.length) return;
      var r = await D.nvkeReplaceNode(S.cluster, nodes[nodes.length - 1].name,
        { reason: "XID 79 (console inject)", source: "nvsentinel" });
      var d = r.data || {};
      if (NC.toast) NC.toast(esc(r.error ? L("실패: ", "failed: ") + r.error
        : L("노드 교체 ", "replaced ") + d.node + " → " + d.new_host + " · " + L("같은 랙 유지 ", "same rack kept ") + d.failure_domain_kept), r.error ? "warn" : "");
      S.tab = "capi";
      return render();
    }
  });

  NC.nvkeTopologyRender = render;
  if (NC.bus) NC.bus.on("route", function (id) { if (id === "nvke" || id === "nvke-capi") render(); });
})();
