/* 고객 콘솔 — 상품 선택(BMaaS / Managed K8s NVKE) · NVKE 클러스터 마법사 ·
   kubeconfig 다운로드 · 업그레이드 진행 · 사용량(미터링).
   데이터: NC.dsx (shared/dsx-api.js) — NOCP /api/v1/{catalog,nvke/*,metering/usage}.
   테넌트 세션 헤더(X-Tenant-Id/Role)는 dsx-api가 NC.session()에서 부착한다.
   라우트 "nvke" 진입은 NC.bus "route"로 감지 (customer/app.js NC.start 맵 불변). */
(function () {
  var NC = window.NC = window.NC || {};
  var D = NC.dsx;
  if (!D) return;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(n) { return n == null || isNaN(+n) ? "—" : (+n).toLocaleString("en-US", { maximumFractionDigits: 1 }); }
  function $(id) { return document.getElementById(id); }
  function toast(m, k) { if (NC.toast) NC.toast(esc(m), k); }
  function sess() { return typeof NC.session === "function" ? NC.session() : null; }
  function tenant() { var s = sess(); return s ? s.tenant_id : "tnt-fin-corp"; }
  function canWrite() { var s = sess(); return !s || s.role !== "viewer"; }
  function src(r) {
    return r && r.live ? '<span class="st green">● NOCP 라이브</span>' : '<span class="st gray">◌ NOCP 미연동 — mock</span>';
  }
  function stc(s) {
    s = String(s || "");
    var c = /fail|error/.test(s) ? "red" : /provision|upgrad|pending|creat/.test(s) ? "amber" : /run|ready|active/.test(s) ? "green" : "blue";
    return '<span class="st ' + c + '">' + esc(s || "—") + "</span>";
  }

  var css = document.createElement("style");
  css.textContent =
    ".nvke-prod{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-bottom:16px}" +
    ".nvke-card{border:1px solid var(--line);border-radius:10px;padding:14px 16px;background:var(--card);cursor:pointer}" +
    ".nvke-card:hover,.nvke-card.on{border-color:var(--green)}.nvke-card h4{margin:0 0 6px;font-size:13px}" +
    ".nvke-card p{margin:0;color:var(--muted);font-size:11.5px;line-height:1.5}" +
    ".nvke-steps{display:flex;gap:6px;margin-bottom:12px;font-size:11px}.nvke-steps span{padding:4px 10px;border-radius:12px;border:1px solid var(--line);color:var(--muted)}" +
    ".nvke-steps span.on{border-color:var(--green);color:var(--green)}" +
    ".nvke-f{display:grid;grid-template-columns:160px 1fr;gap:8px 12px;align-items:center;font-size:12px;max-width:640px}" +
    ".nvke-f input,.nvke-f select{background:var(--card);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:6px 8px;font-size:12px}" +
    ".nvke-prog{height:6px;border-radius:3px;background:#233043;width:140px;display:inline-block;vertical-align:middle}.nvke-prog>i{display:block;height:100%;border-radius:3px;background:var(--amber)}";
  document.head.appendChild(css);

  var W = { step: 0, rel: null, image: null, itype: null, name: "", np: "gpu-pool", count: 2, workload: "training" };
  var REL = null;
  var tick = null;

  async function render() {
    var root = $("nvke-root");
    if (!root) return;
    var r = await Promise.all([D.catalog(), D.nvkeReleases(), D.nvkeClusters(tenant()), D.metering(tenant())]);
    var cat = (r[0].data && r[0].data.products) || [];
    REL = r[1].data || {};
    var cls = r[2].data || [];
    var use = r[3].data || {};
    var rels = REL.releases || [];
    if (!W.rel) { var df = rels.find(function (x) { return x.default; }) || rels[0]; W.rel = df && (df.k8s || df.version); }
    if (!W.image) W.image = relImage(W.rel) || (REL.node_images || [])[0];
    if (!W.itype) W.itype = (REL.instance_types || [])[0];

    var cards = cat.map(function (p) {
      var id = p.id || p.name;
      return '<div class="nvke-card" data-nvke-prod="' + esc(id) + '"><h4>' + esc(p.name || id) + ' <span class="st blue">' +
        esc(p.tier || id) + "</span></h4><p>" + esc(p.desc || p.description || "") + "</p>" +
        '<p style="margin-top:6px">과금 단위: <b>' + esc(p.unit || "—") + "</b></p></div>";
    }).join("");

    var rows = cls.map(function (c) {
      var up = c.upgrade || {};
      var prog = c.status === "upgrading"
        ? ' <span class="nvke-prog"><i style="width:' + (+up.progress || 0) + '%"></i></span> ' + fmt(up.progress) + "% → " + esc(up.target)
        : "";
      var nps = (c.nodepools || []).map(function (p) {
        return esc(p.name) + " · " + esc(p.instance_type) + " × " + fmt(p.count);
      }).join("<br>");
      var opts = rels.map(function (x) {
        var k = x.k8s || x.version;
        return '<option value="' + esc(k) + '"' + (k === c.k8s_version || x.version === c.k8s_version ? " selected" : "") + ">" + esc(k) + "</option>";
      }).join("");
      return "<tr><td class='id'>" + esc(c.id) + "<br><span style='color:var(--muted)'>" + esc(c.name) + "</span></td><td>" +
        esc(c.k8s_version) + " · NVKE " + esc(c.nvke_version || D.MATRIX.nvke) + "</td><td>" + esc(c.node_image || "—") +
        "</td><td>" + nps + "</td><td>" + stc(c.status) + prog + "</td><td style='white-space:nowrap'>" +
        '<button class="btn-ghost" data-nvke-kc="' + esc(c.id) + '">kubeconfig ↓</button> ' +
        '<button type="button" class="btn-ghost" data-nvke-topo="' + esc(c.id) + '">노드·토폴로지</button> ' +
        (canWrite() ? '<select data-nvke-upv="' + esc(c.id) + '">' + opts + '</select> <button class="btn-ghost" data-nvke-up="' + esc(c.id) +
          '">업그레이드</button> <button class="btn-ghost" data-nvke-np="' + esc(c.id) + '">+ nodepool</button>' : "") +
        "</td></tr>";
    }).join("");

    root.innerHTML =
      '<div style="display:flex;gap:10px;align-items:center;margin-bottom:12px">' + src(r[2]) +
      '<span style="color:var(--muted2);font-size:11px">DSX OS ' + esc(D.MATRIX.dsx_os) + " · NVKE " + esc(D.MATRIX.nvke) +
      " · K8s " + esc(D.MATRIX.k8s.join("/")) + " · " + esc(D.MATRIX.platform) + "</span></div>" +
      '<div class="panel"><div class="ph"><span class="tick"></span><span class="t">상품 선택</span><span class="c">/api/v1/catalog</span></div>' +
      '<div class="nvke-prod">' + cards + "</div></div>" +
      '<div class="panel" id="nvke-wiz"><div class="ph"><span class="tick"></span><span class="t">Managed K8s (NVKE) 클러스터 생성</span>' +
      '<span class="c">POST /api/v1/nvke/clusters</span></div>' + wizard() + "</div>" +
      '<div class="panel"><div class="ph"><span class="tick"></span><span class="t">NVKE 클러스터</span><span class="c">' + esc(tenant()) + "</span></div>" +
      '<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>클러스터</th><th>버전</th><th>노드 이미지</th><th>NodePool</th><th>상태</th><th>작업</th></tr></thead><tbody>' +
      (rows || "<tr><td colspan=6>NVKE 클러스터 없음</td></tr>") + "</tbody></table></div></div>" +
      '<div class="panel"><div class="ph"><span class="tick"></span><span class="t">사용량</span><span class="c">/api/v1/metering/usage · ' + esc(use.period || "") + "</span></div>" +
      '<div class="kpi-band">' +
      '<div class="kpi"><div class="k">GPU-hour</div><div class="v">' + fmt(use.gpu_hours) + '</div><div class="s">BMaaS</div></div>' +
      '<div class="kpi"><div class="k">instance-hour</div><div class="v">' + fmt(use.instance_hours) + '</div><div class="s">BMaaS</div></div>' +
      '<div class="kpi"><div class="k">K8s node-hour</div><div class="v">' + fmt(use.k8s_node_hours) + '</div><div class="s">Managed K8s (NVKE)</div></div>' +
      "</div></div>";

    var busy = cls.some(function (c) { return c.status === "provisioning" || c.status === "upgrading"; });
    clearTimeout(tick);
    if (busy) tick = setTimeout(function () {
      if (location.hash.indexOf("#/nvke") !== 0) return;
      if (!r[2].live) D.mockTick();
      render();
    }, 3000);
  }

  function wizard() {
    if (!canWrite()) return '<div style="color:var(--muted);font-size:11.5px">viewer 역할은 읽기 전용입니다 (read-only role)</div>';
    var steps = ["① K8s 버전", "② 노드 이미지", "③ NodePool", "④ 검토"];
    var head = '<div class="nvke-steps">' + steps.map(function (s, i) {
      return '<span class="' + (i === W.step ? "on" : "") + '">' + esc(s) + "</span>";
    }).join("") + "</div>";
    var rels = (REL && REL.releases) || [];
    var body = "";
    if (W.step === 0) {
      body = '<div class="nvke-f"><label>K8s 버전</label><select id="nvke-w-rel">' + rels.map(function (x) {
        var k = x.k8s || x.version;
        return '<option value="' + esc(k) + '"' + (k === W.rel ? " selected" : "") + ">" + esc(x.version || k) + (x.default ? " (default)" : "") + "</option>";
      }).join("") + '</select><label>클러스터 이름</label><input id="nvke-w-name" value="' + esc(W.name) + '" placeholder="예: fin-infer">' +
        '<label>워크로드 (AICR recipe)</label><select id="nvke-w-wl"><option value="training"' + (W.workload === "training" ? " selected" : "") +
        '>training</option><option value="inference"' + (W.workload === "inference" ? " selected" : "") + ">inference</option></select></div>";
    } else if (W.step === 1) {
      body = '<div class="nvke-f"><label>노드 이미지</label><select id="nvke-w-img">' + ((REL && REL.node_images) || []).map(function (x) {
        return '<option value="' + esc(x) + '"' + (x === W.image ? " selected" : "") + ">" + esc(x) + "</option>";
      }).join("") + "</select></div>";
    } else if (W.step === 2) {
      body = '<div class="nvke-f"><label>NodePool 이름</label><input id="nvke-w-np" value="' + esc(W.np) + '">' +
        '<label>Instance type</label><select id="nvke-w-it">' + ((REL && REL.instance_types) || []).map(function (x) {
          return '<option value="' + esc(x) + '"' + (x === W.itype ? " selected" : "") + ">" + esc(x) + "</option>";
        }).join("") + '</select><label>노드 수</label><input id="nvke-w-cnt" type="number" min="1" value="' + esc(W.count) + '"></div>';
    } else {
      body = '<div class="nvke-f"><label>이름</label><b>' + esc(W.name || "—") + "</b><label>K8s</label><b>" + esc(W.rel) +
        " · NVKE " + esc(D.MATRIX.nvke) + "</b><label>노드 이미지</label><b>" + esc(W.image) + "</b><label>NodePool</label><b>" +
        esc(W.np) + " · " + esc(W.itype) + " × " + esc(W.count) + "</b><label>AICR recipe</label><b>" + esc(W.workload) + "</b></div>";
    }
    var nav = '<div style="margin-top:12px;display:flex;gap:8px">' +
      (W.step > 0 ? '<button class="btn-ghost" data-nvke-w="prev">← 이전</button>' : "") +
      (W.step < 3 ? '<button class="btn" data-nvke-w="next">다음 →</button>' : '<button class="btn" data-nvke-w="create">클러스터 생성</button>') + "</div>";
    return head + body + nav;
  }
  function relImage(k) {
    var x = ((REL && REL.releases) || []).find(function (r) { return r.k8s === k; });
    return x && x.node_image;
  }
  function readStep() {
    var g = function (id) { var e = $(id); return e ? e.value : null; };
    if (W.step === 0) { var pr = W.rel; W.rel = g("nvke-w-rel") || W.rel; if (W.rel !== pr) W.image = relImage(W.rel) || W.image; W.name = (g("nvke-w-name") || "").trim(); W.workload = g("nvke-w-wl") || W.workload; }
    if (W.step === 1) W.image = g("nvke-w-img") || W.image;
    if (W.step === 2) { W.np = (g("nvke-w-np") || "").trim() || "gpu-pool"; W.itype = g("nvke-w-it") || W.itype; W.count = Math.max(1, +g("nvke-w-cnt") || 1); }
  }
  function repaintWizard() {
    var host = $("nvke-wiz");
    if (!host) return;
    var ph = host.querySelector(".ph").outerHTML;
    host.innerHTML = ph + wizard();
  }
  function download(name, text) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "application/yaml" }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  document.addEventListener("click", async function (e) {
    var t = e.target.closest("[data-nvke-prod],[data-nvke-w],[data-nvke-kc],[data-nvke-up],[data-nvke-np]");
    if (!t) return;
    if (t.dataset.nvkeProd) {
      if (/bmaas/i.test(t.dataset.nvkeProd)) { if (NC.openModal) NC.openModal("create_cluster"); return; }
      var w = $("nvke-wiz"); if (w) w.scrollIntoView({ behavior: "smooth" });
      return;
    }
    if (t.dataset.nvkeW) {
      readStep();
      if (t.dataset.nvkeW === "next") {
        if (W.step === 0 && !W.name) return toast("클러스터 이름을 입력하세요", "warn");
        W.step = Math.min(3, W.step + 1); return repaintWizard();
      }
      if (t.dataset.nvkeW === "prev") { W.step = Math.max(0, W.step - 1); return repaintWizard(); }
      var r = await D.nvkeCreate({ name: W.name, tenant_id: tenant(), k8s_version: W.rel, node_image: W.image,
        workload: W.workload, nodepools: [{ name: W.np, instance_type: W.itype, count: W.count }] });
      if (r.error) return toast("실패: " + r.error, "warn");
      toast("NVKE 클러스터 생성 요청 — " + W.name + (r.live ? "" : " (mock)"));
      W.step = 0; W.name = "";
      return render();
    }
    if (t.dataset.nvkeKc) {
      var k = await D.nvkeKubeconfig(t.dataset.nvkeKc);
      var txt = k.data && (k.data.kubeconfig || k.data.content);
      if (!txt) return toast("kubeconfig 없음", "warn");
      download(t.dataset.nvkeKc + ".kubeconfig.yaml", txt);
      return toast("kubeconfig 다운로드 — " + t.dataset.nvkeKc + (k.live ? "" : " (mock)"));
    }
    if (t.dataset.nvkeUp) {
      var sel = document.querySelector('[data-nvke-upv="' + t.dataset.nvkeUp + '"]');
      var r2 = await D.nvkeUpgrade(t.dataset.nvkeUp, { k8s_version: sel ? sel.value : null });
      toast(r2.error ? "실패: " + r2.error : "업그레이드 시작 → " + (sel && sel.value) + (r2.live ? "" : " (mock)"), r2.error ? "warn" : "");
      return render();
    }
    if (t.dataset.nvkeNp) {
      var r3 = await D.nvkeAddNodepool(t.dataset.nvkeNp, { name: "pool-" + Date.now().toString(36).slice(-4),
        instance_type: W.itype || "vr-nvl72.tray", count: 1 });
      toast(r3.error ? "실패: " + r3.error : "NodePool 추가" + (r3.live ? "" : " (mock)"), r3.error ? "warn" : "");
      return render();
    }
  });

  NC.nvkeRender = render;
  if (NC.bus) NC.bus.on("route", function (id) { if (id === "nvke") render(); });
})();
