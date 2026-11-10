/* v2 화면 공통 UI 도우미 — 이스케이프 · 숫자 · 배지 · 패널 · KO/EN.
   문자열은 L(ko, en) 로 한 자리에서 둘 다 적는다(사전 누락 없음). 언어 토글([data-lang]) 클릭 시
   현재 v2 화면을 다시 그린다 — 전역 i18n 엔진은 KO 원문만 번역하므로 EN 으로 그린 노드는 건드리지 않는다.
   배지·색은 shared/shell.css 의 .src-badge / .st 토큰을 그대로 쓴다(새 색 없음). */
(function () {
  var NC = window.NC = window.NC || {};
  function lang() { return window.NC_I18N && NC_I18N.lang ? NC_I18N.lang() : "ko"; }
  function L(ko, en) { return lang() === "en" ? en : ko; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(n, d) {
    if (n == null || n === "" || isNaN(+n)) return "—";
    return (+n).toLocaleString("en-US", { maximumFractionDigits: d == null ? 0 : d });
  }
  function krw(n) { return n == null || isNaN(+n) ? "—" : "₩" + Math.round(+n).toLocaleString("en-US"); }
  function big(n) {
    if (n == null || isNaN(+n)) return "—";
    n = +n;
    if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return String(Math.round(n));
  }
  function when(s) { return s ? String(s).replace("T", " ").slice(0, 16) : "—"; }
  /* 라이브/모의 배지 — 라이브면 경로, mock 이면 MOCK (백엔드 미머지·미기동) */
  function src(res) {
    if (res && res.live && res.error)
      return '<span class="src-badge mock" role="status">' + esc(L("권한 오류", "Access error")) + " " + esc(res.status || "") +
        '</span> <span class="v2-path">' + esc(res.src) + "</span>";
    return res && res.live
      ? '<span class="src-badge live" role="status">● ' + esc(L("NOCP 라이브", "NOCP live")) + '</span> <span class="v2-path">' + esc(res.src) + "</span>"
      : '<span class="src-badge mock" role="status" title="' + esc(L("백엔드 미연동 — 계약 기반 모의 데이터", "Backend not connected — contract-shaped mock data")) + '">◌ MOCK</span>';
  }
  function tone(s) {
    s = String(s || "").toLowerCase();
    return /fail|violat|breach|void|revoked|expired|terminated|crit/.test(s) ? "red"
      : /draft|pending|running|monitor|invited|finalized|warn|not_issued/.test(s) ? "amber"
      : /active|paid|ok|ready|recovered|replaced|done|verified|joined|running|issued|provisioned|auto/.test(s) ? "green" : "blue";
  }
  function st(s, label) { return '<span class="st ' + tone(s) + '">' + esc(label || s || "—") + "</span>"; }
  function panel(title, sub, body, extra) {
    return '<section class="panel" aria-label="' + esc(title) + '"><div class="ph"><span class="tick"></span><h2 class="t v2-h">' + esc(title) +
      '</h2><span class="c">' + (sub || "") + "</span>" + (extra || "") + "</div>" + body + "</section>";
  }
  function kpi(k, v, s, cls) {
    return '<div class="kpi"><div class="k">' + esc(k) + '</div><div class="v' + (cls ? " " + cls : "") + '">' + v +
      '</div><div class="s">' + (s || "") + "</div></div>";
  }
  function table(heads, rows, empty) {
    return '<div class="v2-scroll"><table class="tbl"><thead><tr>' + heads.map(function (h) {
      return '<th scope="col"' + (/^#/.test(h) ? ' class="num"' : "") + ">" + esc(h.replace(/^#/, "")) + "</th>";
    }).join("") + "</tr></thead><tbody>" + (rows.length ? rows.join("") : '<tr><td colspan="' + heads.length + '">' + esc(empty || "—") + "</td></tr>") +
      "</tbody></table></div>";
  }
  function field(id, label, input) {
    return '<div class="v2-f"><label for="' + esc(id) + '">' + esc(label) + "</label>" + input + "</div>";
  }
  function bar(ratio) {
    var p = Math.max(0, Math.min(100, Math.round((ratio || 0) * 100)));
    return '<span class="v2-bar' + (p >= 90 ? " red" : p >= 70 ? " amber" : "") + '" role="img" aria-label="' + p + '%"><i style="width:' + p + '%"></i></span> ' + p + "%";
  }
  function toast(m, k) { if (NC.toast) NC.toast(esc(m), k); }
  function $(id) { return document.getElementById(id); }

  var css = document.createElement("style");
  css.textContent =
    ".v2-path{color:var(--muted2);font-size:11px;font-family:monospace}" +
    ".v2-h{font-size:inherit;font-weight:inherit;margin:0;display:inline}" +
    ".v2-scroll{overflow-x:auto}" +
    ".v2-row{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px}" +
    ".v2-f{display:flex;flex-direction:column;gap:4px;min-width:140px}" +
    ".v2-f label{font-size:11px;color:var(--muted)}" +
    ".v2-f input,.v2-f select,.v2-f textarea,.v2-row select{background:var(--card);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:6px 8px;font-size:12px;font-family:inherit}" +
    ".v2-f textarea{min-height:64px;resize:vertical}" +
    ".v2-bar{display:inline-block;vertical-align:middle;width:80px;height:6px;border-radius:3px;background:var(--track)}" +
    ".v2-bar>i{display:block;height:100%;border-radius:3px;background:var(--green)}.v2-bar.amber>i{background:var(--amber)}.v2-bar.red>i{background:var(--red)}" +
    ".v2-tabs{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap}" +
    ".v2-tabs button{background:none;border:1px solid var(--line);color:var(--muted);border-radius:6px;padding:5px 11px;font-size:11.5px;cursor:pointer}" +
    ".v2-tabs button[aria-selected=true]{border-color:var(--green);color:var(--green-text)}" +
    ".v2-out{background:var(--track);border:1px solid var(--line);border-radius:6px;padding:10px;font-family:monospace;font-size:12px;white-space:pre-wrap;word-break:break-word;min-height:64px;max-height:320px;overflow:auto}" +
    ".v2-tl{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:4px}" +
    ".v2-tl li{flex:1 1 92px;border-top:4px solid var(--track);padding:6px 4px 0;font-size:11px;color:var(--muted)}" +
    ".v2-tl li.done{border-color:var(--green)}.v2-tl li.running{border-color:var(--amber)}.v2-tl li.failed{border-color:var(--red)}" +
    ".v2-tl li b{display:block;color:var(--text);font-size:11.5px}" +
    ".v2-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}" +
    ".v2-card{border:1px solid var(--line);border-radius:8px;padding:10px 12px}" +
    ".v2-card h3{margin:0 0 6px;font-size:12.5px}" +
    ".v2-chips{display:flex;flex-wrap:wrap;gap:3px}.v2-chips span{font-size:11px;padding:1px 5px;border-radius:4px;background:var(--track);color:var(--muted)}" +
    ".v2-kv{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;font-size:12px}.v2-kv dt{color:var(--muted)}.v2-kv dd{margin:0}" +
    ".v2-note{font-size:11.5px;color:var(--muted);margin:6px 0 0}";
  document.head.appendChild(css);

  /* 언어 토글 → 등록된 v2 화면 재렌더 */
  var renderers = {}, always = [];   // "*" = 화면과 무관하게 언어 전환 때마다 부를 함수
  function onRoute(map) {
    Object.keys(map).forEach(function (k) { if (k === "*") always.push(map[k]); else renderers[k] = map[k]; });
  }
  function current() { return (location.hash.replace(/^#\/?/, "") || "").split("?")[0]; }
  if (NC.bus) NC.bus.on("route", function (id) { if (renderers[id]) renderers[id](); });
  document.addEventListener("click", function (e) {
    if (!e.target.closest || !e.target.closest("#lang-toggle [data-lang]")) return;
    setTimeout(function () {
      var id = current();
      if (renderers[id]) renderers[id]();
      always.forEach(function (f) { f(); });
    }, 0);
  });

  function refresh() { var id = current(); if (renderers[id]) renderers[id](); always.forEach(function (f) { f(); }); }
  NC.v2ui = { refresh: refresh, L: L, lang: lang, esc: esc, fmt: fmt, krw: krw, big: big, when: when, src: src, st: st, tone: tone, panel: panel,
    kpi: kpi, table: table, field: field, bar: bar, toast: toast, $: $, onRoute: onRoute, current: current };
})();
