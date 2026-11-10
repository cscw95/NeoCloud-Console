/* 고객 NVKE 상세 — "노드·토폴로지" 탭 (F11: CAPI · CAPNICo · IMEX ComputeDomain · gpu.clique 라벨).
   NVKE 목록(customer/nvke.js)의 "토폴로지" 버튼이 NC.nvkeTopo(id) 를 부른다.
   데이터: NC.v2.nvkeCapi / nvkeNodes / nvkeDomains — 라이브 우선, 실패 시 MOCK 배지.
   #nvke-topo-root 는 #nvke-root 밖에 있어 목록 재렌더(3초 폴링)에 지워지지 않는다. */
(function () {
  var NC = window.NC = window.NC || {};
  var A = NC.v2, U = NC.v2ui;
  if (!A || !U) return;
  var L = U.L, esc = U.esc, fmt = U.fmt, $ = U.$;
  var TP = { id: null, tab: "cliques" };
  var TABS = [["cliques", "클리크 (NVL72)", "Cliques (NVL72)"], ["nodes", "노드", "Nodes"], ["domains", "ComputeDomain (IMEX)", "ComputeDomains (IMEX)"],
    ["capi", "CAPI · NicoMachine", "CAPI · NicoMachine"]];

  async function render() {
    var root = $("nvke-topo-root"); if (!root) return;
    if (!TP.id) { root.innerHTML = ""; return; }
    var cid = TP.id;
    var r = await Promise.all([A.nvkeCapi(cid), A.nvkeNodes(cid), A.nvkeDomains(cid)]);
    if (TP.id !== cid) return;
    var capi = r[0].data || {}, nodes = r[1].data || [], doms = r[2].data || [];
    var groups = A.groupByClique(nodes);
    var tabs = '<div class="v2-tabs" role="tablist" aria-label="' + esc(L("토폴로지 보기", "Topology view")) + '">' + TABS.map(function (t) {
      return '<button type="button" role="tab" id="nvke-tp-tab-' + t[0] + '" aria-controls="nvke-tp-panel" aria-selected="' + (TP.tab === t[0]) +
        '" data-nvke-tp="' + t[0] + '">' + esc(L(t[1], t[2])) + "</button>";
    }).join("") + '<button type="button" class="btn-ghost" data-nvke-tp-close="1" style="margin-left:auto">' + esc(L("닫기", "Close")) + "</button></div>";
    var body = "", res = r[1];
    if (TP.tab === "cliques") {
      body = '<div class="v2-grid">' + groups.map(function (g) {
        var rack = g.nodes[0] && g.nodes[0].labels ? g.nodes[0].labels["topology.kubernetes.io/zone"] : "";
        var spine = g.nodes[0] && g.nodes[0].labels ? g.nodes[0].labels["network.topology.nvidia.com/ib-spine"] : "";
        var gpus = g.nodes.reduce(function (s, n) { return s + (n.gpus || 4); }, 0);
        return '<div class="v2-card"><h3 class="id">' + esc(g.clique) + "</h3>" +
          '<p class="v2-note">' + esc(L("랙 ", "rack ")) + esc(rack || "—") + " · IB " + esc(spine || "—") + " · " + fmt(g.nodes.length) + L("노드 · ", " nodes · ") + fmt(gpus) + " GPU</p>" +
          '<div class="v2-chips" aria-label="' + esc(L("노드", "Nodes")) + '">' + g.nodes.map(function (n) {
            return '<span title="' + esc(n.nico_instance_id || "") + '">' + esc(String(n.name).split("-").pop()) + "</span>";
          }).join("") + "</div></div>";
      }).join("") + "</div>" +
        '<p class="v2-note">' + esc(L("같은 클리크(nvidia.com/gpu.clique) = 같은 NVLink 도메인. 학습 잡은 한 클리크 안에 배치하세요.",
          "Same clique (nvidia.com/gpu.clique) = same NVLink domain. Keep a training job inside one clique.")) + "</p>";
    } else if (TP.tab === "nodes") {
      body = U.table([L("노드", "Node"), "NodePool", L("NICo 인스턴스", "NICo instance"), "gpu.clique", "zone", "TPM", "SPIFFE ID", "join"],
        nodes.map(function (n) {
          var lb = n.labels || {}, at = n.attestation || {}, jn = n.join || {};
          return "<tr><td class='id'>" + esc(n.name) + "</td><td>" + esc(n.nodepool) + "</td><td class='id'>" + esc(n.nico_instance_id) + "</td><td class='id'>" +
            esc(lb["nvidia.com/gpu.clique"]) + "</td><td>" + esc(lb["topology.kubernetes.io/zone"]) + "</td><td>" + U.st(at.tpm) + "</td><td class='id'>" +
            esc(at.spiffe_id) + "</td><td>" + U.st(jn.state, (jn.agent || "") + " " + (jn.state || "")) + "</td></tr>";
        }), L("노드 없음", "No nodes"));
    } else if (TP.tab === "domains") {
      res = r[2];
      body = U.table([L("이름", "Name"), "NodePool", L("랙", "Racks"), L("#IMEX 채널", "#IMEX channels"), L("상태", "Status")],
        doms.map(function (d) {
          return "<tr><td class='id'>" + esc(d.name) + "</td><td>" + esc(d.nodepool) + "</td><td>" + esc((d.racks || []).join(", ")) + "</td><td class='num'>" +
            fmt(d.imex_channels) + "</td><td>" + U.st(d.status) + "</td></tr>";
        }), L("ComputeDomain 없음", "No ComputeDomains")) +
        '<div class="v2-row" style="margin-top:10px">' + U.field("nvke-cd-name", L("이름", "Name"), '<input id="nvke-cd-name" placeholder="' + esc(cid) + '-cd-train">') +
        U.field("nvke-cd-racks", L("랙 (쉼표)", "Racks (comma)"), '<input id="nvke-cd-racks" placeholder="' + esc(groups[0] && groups[0].nodes[0] ? groups[0].nodes[0].labels["topology.kubernetes.io/zone"] : "") + '">') +
        '<button type="button" class="btn-ghost" id="nvke-cd-add">' + esc(L("+ ComputeDomain", "+ ComputeDomain")) + "</button></div>";
    } else {
      res = r[0];
      var cl = capi.cluster || {};
      body = '<dl class="v2-kv"><dt>Cluster</dt><dd class="id">' + esc(cl.name) + "</dd><dt>phase</dt><dd>" + U.st(cl.phase) + "</dd></dl>" +
        U.table(["MachineDeployment", "#replicas", "failure_domain"], (capi.machine_deployments || []).map(function (m) {
          return "<tr><td class='id'>" + esc(m.name) + "</td><td class='num'>" + fmt(m.replicas) + "</td><td>" + esc(m.failure_domain) + "</td></tr>";
        }), "—") +
        U.table(["NicoMachine", L("NICo 인스턴스", "NICo instance"), L("랙", "Rack"), "phase"], (capi.nico_machines || []).map(function (m) {
          return "<tr><td class='id'>" + esc(m.name) + "</td><td class='id'>" + esc(m.nico_instance_id) + "</td><td>" + esc(m.rack_id) + "</td><td>" + U.st(m.phase) + "</td></tr>";
        }), "—");
    }
    var gp = nodes.reduce(function (s, n) { return s + (n.gpus || 4); }, 0);
    if (NC.v2demo) NC.v2demo.select("cluster", cid);
    root.innerHTML = (NC.v2demo ? NC.v2demo.host("nvke-topology") : "") + U.panel(L("노드 · 토폴로지 — ", "Nodes · topology — ") + cid, U.src(res) + " · " + fmt(groups.length) + L(" 클리크 · ", " cliques · ") + fmt(doms.length) +
      " ComputeDomain · " + fmt(gp) + " GPU", tabs + '<div id="nvke-tp-panel" role="tabpanel" aria-labelledby="nvke-tp-tab-' + TP.tab + '">' + body + "</div>");
  }

  NC.nvkeTopo = function (id) {
    TP.id = id; TP.tab = "cliques";
    render().then(function () { var e = $("nvke-topo-root"); if (e && e.scrollIntoView) e.scrollIntoView({ behavior: "smooth", block: "start" }); });
  };

  document.addEventListener("click", async function (e) {
    var t = e.target.closest && e.target.closest("[data-nvke-topo],[data-nvke-tp],[data-nvke-tp-close],#nvke-cd-add");
    if (!t) return;
    if (t.dataset.nvkeTopo) return NC.nvkeTopo(t.dataset.nvkeTopo);
    if (t.dataset.nvkeTp) { TP.tab = t.dataset.nvkeTp; await render(); var b = $("nvke-tp-tab-" + TP.tab); if (b) b.focus(); return; }
    if (t.dataset.nvkeTpClose) { TP.id = null; return render(); }
    if (t.id === "nvke-cd-add") {
      var nm = $("nvke-cd-name").value.trim(), rk = $("nvke-cd-racks").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      if (!nm || !rk.length) return U.toast(L("이름과 랙을 입력하세요", "Enter a name and racks"), "warn");
      var r = await A.nvkeDomainCreate(TP.id, { name: nm, nodepool: "np1", racks: rk });
      U.toast(r.error ? L("실패: ", "Failed: ") + r.error : "ComputeDomain " + nm + (r.live ? "" : " (MOCK)"), r.error ? "warn" : "");
      return render();
    }
  });
  /* ←/→ 로 탭 이동 (WAI-ARIA tabs) */
  document.addEventListener("keydown", function (e) {
    var t = e.target;
    if (!t.dataset || !t.dataset.nvkeTp || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
    var i = TABS.findIndex(function (x) { return x[0] === t.dataset.nvkeTp; });
    TP.tab = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length][0];
    e.preventDefault();
    render().then(function () { var b = $("nvke-tp-tab-" + TP.tab); if (b) b.focus(); });
  });
  if (NC.bus) NC.bus.on("route", function (id) { if (id !== "nvke") TP.id = null; });
  U.onRoute({ "*": function () { if (U.current() === "nvke" && TP.id) render(); } });
  NC.nvkeTopoRender = render;
})();
