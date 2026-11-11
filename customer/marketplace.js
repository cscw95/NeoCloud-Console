/* F32 마켓플레이스 — 모델 카탈로그 · 원클릭 배포(DynamoGraphDeployment) → 토큰 API (KO/EN).
   마운트: 고객 #mkt-root (route "marketplace"). 기존 P2 mock 카드(.p2strip/.mkt)는 live일 때 숨긴다.
   데이터: NC.schedMkt (NOCP /api/v1/marketplace/models|deploy|deployments). */
(function () {
  var NC = window.NC = window.NC || {};
  var A = NC.schedMkt;
  if (!A) return;
  var S = { tier: {}, open: null };

  function lang() { try { return localStorage.getItem("nc-lang") === "en" ? "en" : "ko"; } catch (e) { return "ko"; } }
  function L(ko, en) { return lang() === "en" ? en : ko; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function st(s) {
    s = String(s || "—");
    var c = /fail/i.test(s) ? "red" : /pend|degrad/i.test(s) ? "amber" : /ready|run/i.test(s) ? "green" : "blue";
    return '<span class="st ' + c + '">' + esc(s) + "</span>";
  }
  function sess() { return typeof NC.session === "function" ? NC.session() : null; }
  function tenant() { var s = sess(); return s ? s.tenant_id : null; }
  function toast(msg, warn) { if (NC.toast) NC.toast(esc(msg), warn ? "warn" : ""); }
  function root() { return document.getElementById("mkt-root"); }

  var css = document.createElement("style");
  css.textContent =
    ".mk-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin:8px 0 14px}" +
    ".mk-card{border:1px solid var(--line);border-radius:10px;padding:12px 14px;background:var(--card);font-size:11.5px;display:flex;flex-direction:column;gap:6px}" +
    ".mk-card h4{margin:0;font-size:13px}.mk-card .m{color:var(--muted)}" +
    ".mk-tiers{display:flex;gap:6px;flex-wrap:wrap}.mk-tiers label{border:1px solid var(--line);border-radius:8px;padding:4px 8px;cursor:pointer}" +
    ".mk-tiers input:checked+span{color:var(--green);font-weight:600}" +
    ".mk-root button:focus-visible,.mk-tiers input:focus-visible+span{outline:2px solid var(--green);outline-offset:2px}" +
    ".mk-pre{font-size:11px;max-height:260px;overflow:auto;background:var(--card-sub);border:1px solid var(--line);border-radius:6px;padding:8px;white-space:pre-wrap;word-break:break-all}";
  document.head.appendChild(css);

  function price(t, m) {
    if (t.billing === "per_token") {
      var p = (t.price && t.price.usd_per_1m_tokens) || m.price_usd_per_1m_tokens || {};
      return "$" + p.input + " / $" + p.output + " " + L("(입력/출력, 1M 토큰)", "(in/out per 1M tokens)");
    }
    return "$" + ((t.price || {}).usd_per_hour) + L("/시간", "/hour");
  }

  /* v2 쇼케이스 — 배포 → 토큰 API 흐름 (customer/token-viz.js · NC.flow) + 플레이그라운드로 바로 이동 */
  function tokenFlow(d) {
    if (!NC.flow || !NC.tokenViz) return "";
    var model = (d.endpoint || {}).model || d.model;
    return '<div class="tk-mflow"><div class="tk-mflow-h">' + L("원클릭 배포 → 토큰 API", "One-click deploy → token API") + "</div>" +
      NC.flow.timeline(NC.tokenViz.deployFlow(d), { orientation: "horizontal", progress: true, ariaLabel: L("배포에서 토큰 API 호출까지", "From deployment to a token API call") }) +
      '<a class="btn" href="#/token" data-mk="try" data-model="' + esc(model) + '">' + L("플레이그라운드에서 시험", "Try in the playground") + " → model=" + esc(model) + "</a></div>";
  }

  async function render() {
    var host = root();
    if (!host) return;
    var mr = await A.models();
    var models = (mr.data || {}).data || [];
    var dr = await A.deployments(tenant());
    var deps = dr.data || [];
    var sec = host.closest("section");
    if (sec) Array.prototype.forEach.call(sec.querySelectorAll(".p2strip,.mkt"), function (el) { el.hidden = !!mr.live; });
    var cards = models.map(function (m) {
      var tier = S.tier[m.id] || "serverless";
      return '<div class="mk-card"><h4>' + esc(m.name || m.id) + "</h4>" +
        '<div class="m">' + esc(m.publisher) + " · " + esc(m.license) + " · " + m.params_b + "B · ctx " + Math.round(m.context_length / 1024) + "K · TP" + m.tp +
        (m.reasoning ? ' · <span class="st blue">reasoning</span>' : "") + "</div>" +
        "<div>" + esc(L(m.description_ko, m.description_en)) + "</div>" +
        '<fieldset class="mk-tiers" style="border:0;padding:0;margin:0"><legend class="m" style="padding:0">' + L("티어", "Tier") + "</legend>" +
        (m.tiers || []).map(function (t) {
          return '<label><input type="radio" name="mk-tier-' + esc(m.id) + '" value="' + esc(t.id) + '" data-mk-tier="' + esc(m.id) + '"' +
            (t.id === tier ? " checked" : "") + '> <span>' + esc(L(t.label_ko, t.label_en)) + " · " + t.gpus + " GPU · " + esc(price(t, m)) + "</span></label>";
        }).join("") + "</fieldset>" +
        '<div class="m">' + L("엔진", "Engine") + ": " + esc(m.engine) + " · " + L("배포 중", "deployed") + " " + (m.marketplace_deployments || 0) + "</div>" +
        '<button class="btn" type="button" data-mk="deploy" data-model="' + esc(m.id) + '"' + (mr.live ? "" : " disabled") + ">" +
        L("원클릭 배포", "Deploy in one click") + "</button></div>";
    }).join("");
    var rows = deps.map(function (d) {
      return "<tr><td class='id'>" + esc(d.id) + '<div style="color:var(--muted);font-size:11px">' + esc(d.namespace + "/" + d.name) +
        "</div></td><td>" + esc(d.model) + "</td><td>" + esc(d.tier) + "</td><td>" + st(d.state) + "</td><td>" + esc(d.engine) +
        "</td><td>" + d.gpus + "</td><td><code>" + esc(d.endpoint.chat_completions) + "</code> model=<code>" + esc(d.endpoint.model) +
        '</code></td><td><button class="btn-ghost" type="button" data-mk="detail" data-id="' + esc(d.id) + '" aria-expanded="' + (S.open === d.id) +
        '">' + L("상세", "Details") + '</button> <button class="btn-ghost" type="button" data-mk="delete" data-id="' + esc(d.id) + '" aria-label="' +
        esc(L("배포 삭제 ", "Delete deployment ") + d.id) + '">' + L("삭제", "Delete") + "</button></td></tr>";
    }).join("");
    var open = deps.filter(function (d) { return d.id === S.open; })[0];
    var detail = open ? '<div class="panel" style="margin-top:10px"><div class="ph"><span class="tick blue"></span><span class="t">' +
      esc(open.id) + " · DynamoGraphDeployment</span><span class=\"c\">" + esc(open.upstream.request.method + " " + open.upstream.request.path) + "</span></div>" +
      '<div style="font-size:11.5px;margin-bottom:6px">' + L("호출 예시", "Call it") + ':</div><pre class="mk-pre">' + esc(open.endpoint.curl) + "</pre>" +
      '<div style="font-size:11.5px;margin:6px 0">' + L("요청 본문 (DGD 매니페스트)", "Request body (DGD manifest)") + '</div><pre class="mk-pre">' +
      esc(JSON.stringify(open.upstream.request.body, null, 2)) + "</pre>" +
      '<div style="font-size:11.5px;margin:6px 0">' + L("응답 상태 (DGD status)", "Response status (DGD status)") + " · HTTP " +
      esc(open.upstream.response.status == null ? "stub" : open.upstream.response.status) + '</div><pre class="mk-pre">' +
      esc(JSON.stringify((open.dgd || {}).status || {}, null, 2)) + "</pre>" + tokenFlow(open) + "</div>" : "";
    host.innerHTML = '<div class="panel mk-root"><div class="ph"><span class="tick"></span><span class="t">' +
      L("모델 마켓플레이스 (F32)", "Model marketplace (F32)") + '</span><span class="c">/api/v1/marketplace/{models,deploy,deployments}</span>' +
      (mr.live ? "" : ' <span class="st amber">mock</span>') +
      ' <a class="btn-ghost" style="margin-left:auto;font-size:11.5px" href="../ops/index.html#/demo-center?scenario=f32-marketplace-deploy">' +
      L("시연 실행 (데모 센터)", "Run demo (demo center)") + "</a></div>" +
      '<div style="font-size:12px;color:var(--muted)">' + L("모델과 티어를 고르면 Dynamo DGD가 배포되고 OpenAI 호환 /v1/chat/completions 로 바로 호출합니다.",
        "Pick a model and tier: a Dynamo DGD is deployed and you call it right away on the OpenAI-compatible /v1/chat/completions.") + "</div>" +
      '<div class="mk-grid">' + cards + "</div>" +
      '<div style="overflow-x:auto"><table class="tbl"><caption style="text-align:left;font-size:12px;padding:4px 0">' + L("내 배포", "My deployments") +
      "</caption><thead><tr><th>ID</th><th>" + L("모델", "Model") + "</th><th>" + L("티어", "Tier") + "</th><th>" + L("상태", "State") +
      "</th><th>" + L("엔진", "Engine") + "</th><th>GPU</th><th>" + L("엔드포인트", "Endpoint") + "</th><th></th></tr></thead><tbody>" +
      (rows || "<tr><td colspan=8>—</td></tr>") + "</tbody></table></div>" + detail + "</div>";
  }

  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t && t.dataset && t.dataset.mkTier) S.tier[t.dataset.mkTier] = t.value;
  });
  document.addEventListener("click", async function (e) {
    if (e.target && e.target.id === "lang-toggle" && root()) { setTimeout(render, 0); return; }
    var t = e.target.closest && e.target.closest("[data-mk]");
    if (!t) return;
    var k = t.dataset.mk, r;
    if (k === "try") { if (NC.tokenUI) NC.tokenUI.preset(t.dataset.model); return; }
    if (k === "deploy") {
      var body = { model: t.dataset.model, tier: S.tier[t.dataset.model] || "serverless" };
      if (tenant()) body.tenant_id = tenant();
      t.disabled = true;
      r = await A.deploy(body);
      if (!r.error) {
        S.open = r.data.id;
        toast(L("배포됨 ", "deployed ") + r.data.id + " · " + r.data.model + " (" + r.data.tier + ", " + r.data.engine + ")");
      }
    } else if (k === "detail") {
      S.open = S.open === t.dataset.id ? null : t.dataset.id;
    } else if (k === "delete") {
      r = await A.undeploy(t.dataset.id);
      if (!r.error) { toast(L("삭제됨 ", "deleted ") + t.dataset.id); if (S.open === t.dataset.id) S.open = null; }
    }
    if (r && r.error) toast(L("실패: ", "failed: ") + r.error, true);
    render();
  });

  NC.marketplaceRender = render;
  if (NC.bus) NC.bus.on("route", function (id) { if (id === "marketplace") render(); });
})();
