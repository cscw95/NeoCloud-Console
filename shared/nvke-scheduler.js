/* F30 KAI 스케줄러 화면 — 큐·쿼터·갱·NVL72 클리크 우선 배치·선점 (KO/EN).
   마운트: 고객 #nvke-sched-root (route "nvke"), 운영 #nvke-sched-ops-root (route "nvke-sched").
   데이터: NC.schedMkt (NOCP /api/v1/nvke/clusters/{id}/queues|workloads|scheduler).
   운영 화면만: 시연 실행(데모 센터 f30-kai-scheduling) · 장애 주입(전력 감축 72 GPU / 해제). */
(function () {
  var NC = window.NC = window.NC || {};
  var A = NC.schedMkt;
  if (!A) return;
  var S = { cluster: null, busy: false, last: null };

  function lang() { try { return localStorage.getItem("nc-lang") === "en" ? "en" : "ko"; } catch (e) { return "ko"; } }
  function L(ko, en) { return lang() === "en" ? en : ko; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function st(s) {
    s = String(s || "—");
    var c = /fail|unsched|overlimit|overquota/i.test(s) ? "red" : /pend|preempt|reclaim|stale|curtail/i.test(s) ? "amber"
      : /run|ready|complete/i.test(s) ? "green" : "blue";
    return '<span class="st ' + c + '">' + esc(s) + "</span>";
  }
  function sess() { return typeof NC.session === "function" ? NC.session() : null; }
  function isOps() { return !!document.getElementById("nvke-sched-ops-root"); }
  function root() { return document.getElementById("nvke-sched-ops-root") || document.getElementById("nvke-sched-root"); }
  function toast(msg, warn) { if (NC.toast) NC.toast(esc(msg), warn ? "warn" : ""); }

  var css = document.createElement("style");
  css.textContent =
    ".ks-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12px;margin:6px 0 10px}" +
    ".ks-bar select,.ks-form input,.ks-form select{background:var(--card);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:5px 8px;font-size:12px}" +
    ".ks-bar select:focus-visible,.ks-form input:focus-visible,.ks-form select:focus-visible,.ks-root button:focus-visible{outline:2px solid var(--green);outline-offset:2px}" +
    ".ks-cap{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin-bottom:12px}" +
    ".ks-cl{border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:var(--card);font-size:11.5px}" +
    ".ks-cl h4{margin:0 0 6px;font-size:12px;word-break:break-all}" +
    ".ks-meter{height:8px;border-radius:4px;background:var(--line);overflow:hidden;display:flex;margin:6px 0}" +
    ".ks-meter i{display:block;height:100%}.ks-meter .u{background:var(--green)}.ks-meter .f{background:var(--amber)}" +
    ".ks-form{display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end;font-size:11.5px;margin:8px 0}" +
    ".ks-form label{display:flex;flex-direction:column;gap:2px;color:var(--muted)}" +
    ".ks-form input{width:90px}.ks-form input.w{width:130px}" +
    ".ks-log{font-size:11px;color:var(--muted);max-height:200px;overflow:auto;margin:6px 0 0;padding-left:18px}" +
    ".ks-two{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}" +
    ".ks-cl .kg-stack,.ks-cl .ks-st{margin:6px 0}" +
    ".ks-q{display:inline-flex;gap:6px;align-items:center}.ks-qb{display:inline-block;width:64px;height:8px;border-radius:var(--radius-pill);background:var(--track);overflow:hidden}" +
    ".ks-qb i{display:block;height:100%;background:var(--info)}.ks-qb i.o{background:var(--warn)}" +
    ".ks-chip{display:inline-block;margin:1px 4px 1px 0;padding:1px 7px;border-radius:var(--radius-pill);border:1px solid var(--info-line);background:var(--info-bg);color:var(--info-text);font-size:var(--fs-2xs);white-space:nowrap}" +
    ".ks-chip.ok{border-color:var(--ok-line);background:var(--ok-bg);color:var(--ok)}";
  document.head.appendChild(css);

  function meter(c) {
    var g = c.gpus || 1;
    if (NC.kpi) {                                   /* v2 공유 컴포넌트: 누적 막대 + 텍스트 범례 */
      var used = c.used_gpus || 0, fenced = c.fenced_gpus || 0;
      return NC.kpi.stack([{ label: L("사용", "used"), value: used, tone: "info" },
        { label: L("감축 차단", "fenced"), value: fenced, tone: "warn" },
        { label: L("여유", "free"), value: Math.max(0, (c.gpus || 0) - used - fenced), tone: "ok" }],
        { label: "GPU", total: c.gpus || 0 });
    }
    return '<div class="ks-meter" role="img" aria-label="' + esc(L("사용 ", "used ") + c.used_gpus + "/" + c.gpus + " GPU") + '">' +
      '<i class="u" style="width:' + (100 * c.used_gpus / g) + '%"></i><i class="f" style="width:' + (100 * (c.fenced_gpus || 0) / g) + '%"></i></div>';
  }
  /* 큐 할당/쿼터 막대 (색 + 숫자 텍스트) */
  function qbar(q) {
    var cap = Math.max(q.quota_gpus || 0, q.allocated_gpus || 0, 1), p = Math.round(100 * (q.allocated_gpus || 0) / cap);
    var over = (q.allocated_gpus || 0) > (q.quota_gpus || 0);
    return '<span class="ks-q"><span class="ks-qb" role="img" aria-label="' + esc(L("할당 ", "allocated ") + q.allocated_gpus + " / " + L("쿼터 ", "quota ") +
      q.quota_gpus + " GPU" + (over ? L(" · 쿼터 초과", " · over quota") : "")) + '"><i class="' + (over ? "o" : "") + '" style="width:' + p + '%"></i></span>' +
      '<span class="tabnum">' + q.allocated_gpus + "</span></span>";
  }

  async function render() {
    var host = root();
    if (!host) return;
    var s = sess();
    var tenant = isOps() ? null : (s ? s.tenant_id : null);
    var cr = await A.clusters(tenant);
    var cls = (cr.data || []).filter(function (c) { return c.source !== "nkd"; });
    if (!S.cluster || !cls.some(function (c) { return c.id === S.cluster; })) S.cluster = cls[0] ? cls[0].id : null;
    var head = '<div class="ph"><span class="tick"></span><span class="t">' + L("작업 스케줄링 · KAI (F30)", "Workload scheduling · KAI (F30)") +
      '</span><span class="c">/api/v1/nvke/clusters/{id}/{queues,workloads,scheduler}</span>' +
      (cr.live ? "" : ' <span class="st amber">mock</span>') + "</div>";
    var bar = '<div class="ks-bar"><label for="ks-cluster">' + L("클러스터", "Cluster") + '</label><select id="ks-cluster">' +
      (cls.map(function (c) {
        return '<option value="' + esc(c.id) + '"' + (c.id === S.cluster ? " selected" : "") + ">" + esc(c.id + " · " + c.name) + "</option>";
      }).join("") || '<option value="">' + L("NVKE 클러스터 없음", "no NVKE cluster") + "</option>") + "</select>" +
      ' <button class="btn-ghost" data-ks="refresh" type="button">' + L("새로고침", "Refresh") + "</button>" +
      (isOps() ? ' <button class="btn" data-ks="demo" type="button">' + L("시연 실행", "Run demo") + "</button>" +
        ' <button class="btn-ghost" data-ks="curtail" type="button"' + (S.cluster ? "" : " disabled") + ">" +
        L("장애 주입: 전력 감축 72 GPU", "Inject: curtail 72 GPUs") + "</button>" +
        ' <button class="btn-ghost" data-ks="release" type="button"' + (S.cluster ? "" : " disabled") + ">" +
        L("감축 해제", "Release curtailment") + "</button>" : "") + "</div>";
    if (!S.cluster) {
      host.innerHTML = '<div class="panel ks-root">' + head + bar + '<div style="color:var(--muted);font-size:12px">' +
        L("NVKE 클러스터를 만들면 큐와 작업을 여기서 관리합니다.", "Create an NVKE cluster to manage queues and workloads here.") + "</div></div>";
      return;
    }
    var sc = (await A.scheduler(S.cluster)).data || {};
    var wl = (await A.workloads(S.cluster)).data || [];
    var cap = sc.capacity || {};
    var qs = (sc.queues || []).filter(function (q) { return q.name !== "default-parent-queue"; });
    var capHtml = '<div class="ks-bar">' + esc(sc.scheduler || "kai-scheduler") + " " + esc(sc.version || "") + " · " +
      L("세션 ", "sessions ") + (sc.cycles || 0) + " · GPU " + (cap.used_gpus || 0) + "/" + (cap.gpus || 0) +
      (cap.fenced_gpus ? " · " + st(L("감축 차단 ", "fenced ") + cap.fenced_gpus + " GPU") : "") + "</div>" +
      '<div class="ks-cap">' + (sc.cliques || []).map(function (c) {
        return '<div class="ks-cl"><h4>' + esc(c.rack) + "</h4>" + meter(c) +
          "<div>" + L("사용", "used") + " <b>" + c.used_gpus + "</b>/" + c.gpus + " GPU · " + c.nodes + L(" 노드", " nodes") +
          (c.not_ready ? " · " + st(c.not_ready + " not ready") : "") + '</div><div style="color:var(--muted);word-break:break-all" title="nvidia.com/gpu.clique">' +
          esc(c.clique) + "</div></div>";
      }).join("") + "</div>";
    var qTable = '<div style="overflow-x:auto"><table class="tbl"><caption style="text-align:left;font-size:12px;padding:4px 0">' +
      L("큐 (scheduling.run.ai/v2 Queue)", "Queues (scheduling.run.ai/v2 Queue)") + "</caption><thead><tr><th>" + L("이름", "Name") +
      "</th><th>" + L("우선순위", "Priority") + "</th><th>" + L("쿼터", "Quota") + "</th><th>" + L("한도", "Limit") + "</th><th>" +
      L("공정 몫", "Fair share") + "</th><th>" + L("할당", "Allocated") + "</th><th>" + L("실행/대기", "Run/Wait") + "</th></tr></thead><tbody>" +
      qs.map(function (q) {
        return "<tr><td class='id'>" + esc(q.name) + "</td><td>" + q.priority + "</td><td>" + q.quota_gpus + "</td><td>" +
          (q.limit_gpus < 0 ? "∞" : q.limit_gpus) + "</td><td>" + esc(q.fair_share_gpus) + "</td><td>" + qbar(q) +
          "</td><td>" + q.workloads.running + " / " + q.workloads.pending + "</td></tr>";
      }).join("") + "</tbody></table></div>" +
      '<form class="ks-form" data-ks-form="queue" aria-label="' + L("큐 만들기", "Create queue") + '">' +
      '<label>' + L("큐 이름", "Queue name") + '<input class="w" name="name" required pattern="[a-z0-9][-a-z0-9]*" placeholder="research"></label>' +
      "<label>" + L("쿼터 GPU", "Quota GPU") + '<input name="quota_gpus" type="number" min="0" value="72"></label>' +
      "<label>" + L("한도 GPU (-1=없음)", "Limit GPU (-1=none)") + '<input name="limit_gpus" type="number" min="-1" value="-1"></label>' +
      "<label>" + L("우선순위", "Priority") + '<input name="priority" type="number" value="100"></label>' +
      '<button class="btn" type="submit">' + L("큐 만들기", "Create queue") + "</button></form>";
    var wTable = '<div style="overflow-x:auto"><table class="tbl"><caption style="text-align:left;font-size:12px;padding:4px 0">' +
      L("작업 (PodGroup 갱)", "Workloads (PodGroup gangs)") + "</caption><thead><tr><th>" + L("이름", "Name") + "</th><th>" +
      L("큐", "Queue") + "</th><th>GPU</th><th>" + L("우선순위 클래스", "Priority class") + "</th><th>" + L("상태", "State") +
      "</th><th>" + L("배치", "Placement") + "</th><th>" + L("사유", "Reason") + "</th><th></th></tr></thead><tbody>" +
      (wl.filter(function (w) { return w.state !== "Completed"; }).map(function (w) {
        var pl = w.placement || {};
        var where = pl.clique_count ? (pl.cliques || []).map(function (c) {
          return '<span class="ks-chip">' + esc(c.rack) + " · " + c.gpus + " GPU</span>"; }).join("") +
          (pl.single_clique ? '<span class="ks-chip ok">✓ ' + L("단일 클리크", "single clique") + "</span>" : "") : "—";
        return "<tr><td class='id'>" + esc(w.name) + '<div style="color:var(--muted);font-size:10.5px">' + esc(w.kind) + " · " + w.pods +
          L(" 파드", " pods") + "</div></td><td>" + esc(w.queue) + "</td><td>" + w.gpus + (w.over_quota ? ' <span class="st blue">' +
          L("쿼터 초과", "over quota") + "</span>" : "") + "</td><td>" + esc(w.priority_class) + (w.preemptible ? "" : ' <span class="st blue">' +
          L("선점 불가", "non-preemptible") + "</span>") + "</td><td>" + st(w.state) + "</td><td>" + where + "</td><td>" +
          esc(w.reason ? w.reason + ": " + w.message : "") + '</td><td><button class="btn-ghost" type="button" data-ks="complete" data-name="' +
          esc(w.name) + '" aria-label="' + esc(L("작업 종료 ", "Finish job ") + w.name) + '">' + L("종료", "Finish") + "</button></td></tr>";
      }).join("") || "<tr><td colspan=8>—</td></tr>") + "</tbody></table></div>" +
      '<form class="ks-form" data-ks-form="job" aria-label="' + L("PyTorchJob 제출", "Submit PyTorchJob") + '">' +
      "<label>" + L("작업 이름", "Job name") + '<input class="w" name="name" pattern="[a-z0-9][-a-z0-9]*" placeholder="llm-pretrain"></label>' +
      '<label>GPU<input name="gpus" type="number" min="4" step="4" value="144" required></label>' +
      "<label>" + L("큐", "Queue") + '<select name="queue">' + qs.map(function (q) {
        return '<option value="' + esc(q.name) + '">' + esc(q.name) + "</option>";
      }).join("") + "</select></label>" +
      "<label>" + L("우선순위 클래스", "Priority class") + '<select name="priority_class">' +
      ["train", "interactive-preemptible", "build", "inference"].map(function (p) { return '<option value="' + p + '">' + p + "</option>"; }).join("") +
      "</select></label>" +
      "<label>" + L("토폴로지", "Topology") + '<select name="topology"><option value="preferred">' + L("클리크 우선", "clique preferred") +
      '</option><option value="required">' + L("클리크 필수", "clique required") + "</option></select></label>" +
      '<button class="btn" type="submit">' + L("PyTorchJob 제출", "Submit PyTorchJob") + "</button></form>";
    var log = '<details open><summary style="font-size:12px;cursor:pointer">' + L("스케줄링 세션 기록 (allocate → reclaim → preempt → stalegangeviction)",
      "Scheduling session log (allocate → reclaim → preempt → stalegangeviction)") + '</summary><ol class="ks-log" aria-live="polite">' +
      (sc.log || []).slice(-25).reverse().map(function (e) {
        return "<li>#" + e.cycle + " <b>" + esc(e.action) + "</b> — " + esc(e.message) + "</li>";
      }).join("") + "</ol></details>";
    host.innerHTML = '<div class="panel ks-root">' + head + bar + capHtml + '<div class="ks-two"><div>' + qTable + "</div><div>" +
      wTable + "</div></div>" + log + "</div>";
  }

  function num(v) { return v === "" || v == null ? undefined : Number(v); }

  document.addEventListener("submit", async function (e) {
    var f = e.target.closest && e.target.closest("[data-ks-form]");
    if (!f || !S.cluster) return;
    e.preventDefault();
    var d = {};
    Array.prototype.forEach.call(f.elements, function (el) { if (el.name) d[el.name] = el.value; });
    var r;
    if (f.dataset.ksForm === "queue") {
      r = await A.createQueue(S.cluster, { name: d.name, quota_gpus: num(d.quota_gpus) || 0,
        limit_gpus: num(d.limit_gpus) == null ? -1 : num(d.limit_gpus), priority: num(d.priority) || 100 });
      if (!r.error) toast(L("큐 생성 ", "queue created ") + d.name);
    } else {
      var body = { kind: "PyTorchJob", gpus: num(d.gpus), queue: d.queue, priority_class: d.priority_class, topology: d.topology };
      if (d.name) body.name = d.name;
      r = await A.submit(S.cluster, body);
      if (!r.error) {
        var w = r.data || {};
        toast(w.name + " → " + w.state + (w.preempted && w.preempted.length ? " · " + L("축출: ", "evicted: ") + w.preempted.join(", ") : "") +
          (w.reason ? " · " + w.reason : ""), w.state !== "Running");
      }
    }
    if (r.error) toast(L("실패: ", "failed: ") + r.error, true);
    render();
  });
  document.addEventListener("change", function (e) {
    if (e.target && e.target.id === "ks-cluster") { S.cluster = e.target.value; render(); }
  });
  document.addEventListener("click", async function (e) {
    if (e.target && e.target.id === "lang-toggle" && root()) { setTimeout(render, 0); return; }
    var t = e.target.closest && e.target.closest("[data-ks]");
    if (!t) return;
    var k = t.dataset.ks, r;
    if (k === "refresh") return render();
    if (k === "demo") { location.hash = "#/demo-center?scenario=f30-kai-scheduling"; return; }
    if (!S.cluster) return;
    if (k === "complete") {
      r = await A.complete(S.cluster, t.dataset.name);
      if (!r.error) toast(t.dataset.name + L(" 종료", " finished") + ((r.data || {}).started && r.data.started.length
        ? " · " + L("재시작: ", "started: ") + r.data.started.join(", ") : ""));
    } else if (k === "curtail") {
      r = await A.curtail(S.cluster, { gpus: 72, reason: "DSX Flex load target (console inject)" });
      if (!r.error) toast(L("감축: 축출 ", "curtailed: evicted ") + (((r.data || {}).evicted || []).join(", ") || "—"), true);
    } else if (k === "release") {
      r = await A.releaseCurtail(S.cluster);
      if (!r.error) toast(L("감축 해제 · 재시작 ", "released · started ") + (((r.data || {}).started || []).join(", ") || "—"));
    }
    if (r && r.error) toast(L("실패: ", "failed: ") + r.error, true);
    render();
  });

  NC.nvkeSchedulerRender = render;
  if (NC.bus) NC.bus.on("route", function (id) { if (id === "nvke" || id === "nvke-sched") render(); });
})();
