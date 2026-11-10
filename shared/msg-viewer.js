/* v2 공통 컴포넌트 — 요청·응답 원문 뷰어: 시작줄 · 헤더 · JSON 정렬/색 · 복사(본문 · curl)
   (V2-DESIGN-COMPONENTS.md §3). UMD: 브라우저 window.NC.msg, node require(). 렌더 함수는 HTML 문자열.
   입력 형식 두 가지를 normalize() 로 하나로 맞춘다:
     · shared/v2-api.js trace — {method, url, req_headers, req_body, status, res_headers, res_body, at}
     · 데모 러너 step — {request:{method, path|url, headers, body}, response:{status, headers, body, summary}}
   Authorization/Cookie/x-api-key 값은 뷰어에서도 한 번 더 가린다(앞 12자). 본문은 4000자 넘으면 잘라 표시 + 전체 복사 가능.
   복사 버튼은 문서에 위임 리스너 하나(install) — navigator.clipboard, 안 되면 textarea 폴백. 결과는 aria-live 로 알린다. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.document) { root.NC = root.NC || {}; root.NC.msg = api; api.install(root.document); }
})(typeof window !== "undefined" ? window : null, function (W) {
  function lang() {
    try { if (W && W.NC_I18N && W.NC_I18N.lang) return W.NC_I18N.lang(); } catch (e) { /* noop */ }
    return api && api._lang || "ko";
  }
  function L(ko, en) { return lang() === "en" ? en : ko; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var SECRET = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key)$/i;
  var MAX = 4000;
  var store = {}, seq = 0; /* 복사용 원문 (DOM 속성에 큰 문자열을 넣지 않음) */
  function keep(s) { var k = "m" + (++seq); store[k] = s; if (seq > 400) delete store["m" + (seq - 400)]; return k; }

  function redactHeaders(h) {
    var o = {};
    Object.keys(h || {}).forEach(function (k) {
      var v = String(h[k]);
      o[k] = SECRET.test(k) && !/…$/.test(v) ? v.slice(0, 12) + "…" : v;
    });
    return o;
  }
  function asText(b) {
    if (b == null) return "";
    if (typeof b === "string") return b;
    try { return JSON.stringify(b, null, 2); } catch (e) { return String(b); }
  }
  /* 두 입력 형식 → {method, url, status, reqHeaders, reqBody, resHeaders, resBody, at, summary, mock} */
  function normalize(e) {
    e = e || {};
    if (e.request || e.response) {
      var q = e.request || {}, r = e.response || {};
      return { method: String(q.method || "GET").toUpperCase(), url: q.url || q.path || "", status: r.status != null ? r.status : "",
        reqHeaders: redactHeaders(q.headers), reqBody: asText(q.body != null ? q.body : q.json),
        resHeaders: redactHeaders(r.headers), resBody: asText(r.body != null ? r.body : r.json), at: e.at || r.at || "",
        summary: r.summary || "", mock: r.status === "MOCK" };
    }
    return { method: String(e.method || "GET").toUpperCase(), url: e.url || "", status: e.status != null ? e.status : "",
      reqHeaders: redactHeaders(e.req_headers), reqBody: asText(e.req_body), resHeaders: redactHeaders(e.res_headers),
      resBody: asText(e.res_body), at: e.at || "", summary: e.summary || "", mock: e.status === "MOCK" };
  }
  function statusTone(s) {
    if (s === "MOCK") return "mock";
    var n = +s; if (!n) return "info";
    return n >= 500 ? "crit" : n >= 400 ? "warn" : n >= 300 ? "info" : "ok";
  }
  var REASON = { 200: "OK", 201: "Created", 202: "Accepted", 204: "No Content", 301: "Moved Permanently", 302: "Found", 304: "Not Modified",
    400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 409: "Conflict", 410: "Gone",
    412: "Precondition Failed", 415: "Unsupported Media Type", 422: "Unprocessable Entity", 429: "Too Many Requests",
    500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout" };

  /* JSON 정렬 + 색 — pretty(text) → HTML. JSON 이 아니면 이스케이프만. */
  function pretty(text) {
    var s = text == null ? "" : String(text), out = s;
    var t = s.trim();
    if (t && (t[0] === "{" || t[0] === "[")) {
      try { out = JSON.stringify(JSON.parse(t), null, 2); } catch (e) { out = s; }
    }
    var cut = out.length > MAX;
    var shown = cut ? out.slice(0, MAX) : out;
    /* 원문에서 토큰을 찾고 조각마다 이스케이프 — 이스케이프 뒤 정규식은 &#39; 같은 엔티티를 깨뜨린다 */
    var re = /("(?:[^"\\\n]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)/g, html = "", last = 0, m;
    while ((m = re.exec(shown))) {
      html += esc(shown.slice(last, m.index));
      if (m[1]) html += '<span class="' + (m[2] ? "mv-k" : "mv-s") + '">' + esc(m[1]) + "</span>" + (m[2] || "");
      else if (m[3]) html += '<span class="mv-b">' + m[3] + "</span>";
      else html += '<span class="mv-n">' + m[4] + "</span>";
      last = re.lastIndex;
    }
    html += esc(shown.slice(last));
    return html + (cut ? '\n<span class="mv-cut">… ' + "(" + (out.length - MAX) + " " + esc(L("자 더 — 복사하면 전체", "more chars — copy for full text")) + ")" + "</span>" : "");
  }
  function headersHtml(h) {
    var ks = Object.keys(h || {});
    if (!ks.length) return '<p class="mv-none">' + esc(L("헤더 없음", "No headers")) + "</p>";
    return '<dl class="mv-hd">' + ks.map(function (k) { return "<dt>" + esc(k) + "</dt><dd>" + esc(h[k]) + "</dd>"; }).join("") + "</dl>";
  }
  function headerText(h) { return Object.keys(h || {}).map(function (k) { return k + ": " + h[k]; }).join("\n"); }
  function shq(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }
  /* curl 명령 — 비밀 헤더는 가린 값 대신 $TOKEN 자리표시 */
  function curl(e) {
    var m = e && e.reqHeaders ? e : normalize(e);
    var parts = ["curl -sS"];
    if (m.method && m.method !== "GET") parts.push("-X " + m.method);
    parts.push(shq(m.url));
    Object.keys(m.reqHeaders || {}).forEach(function (k) {
      var v = SECRET.test(k) ? (/^authorization$/i.test(k) ? "Bearer $TOKEN" : "$SECRET") : m.reqHeaders[k];
      parts.push("-H " + shq(k + ": " + v));
    });
    if (m.reqBody) parts.push("-d " + shq(m.reqBody));
    return parts.join(" \\\n  ");
  }
  function rawText(m) {
    return m.method + " " + m.url + "\n" + headerText(m.reqHeaders) + (m.reqBody ? "\n\n" + m.reqBody : "") +
      "\n\n— " + (m.status || "") + (REASON[m.status] ? " " + REASON[m.status] : "") + "\n" + headerText(m.resHeaders) + (m.resBody ? "\n\n" + m.resBody : "");
  }
  function copyBtn(label, text, extra) {
    return '<button type="button" class="mv-copy" data-mv-copy="' + keep(text) + '"' + (extra || "") + ">" + esc(label) + "</button>";
  }
  function section(kind, headers, body) {
    var isReq = kind === "req";
    var title = isReq ? L("요청", "Request") : L("응답", "Response");
    return '<section class="mv-sec mv-' + kind + '" aria-label="' + esc(title) + '"><div class="mv-sh"><h4>' + esc(title) + "</h4>" +
      (body ? copyBtn(L("본문 복사", "Copy body"), body) : "") + "</div>" +
      '<details class="mv-hdbox"' + (Object.keys(headers || {}).length <= 4 ? " open" : "") + "><summary>" +
      esc(L("헤더", "Headers")) + " <span class=\"tabnum\">(" + Object.keys(headers || {}).length + ")</span></summary>" + headersHtml(headers) + "</details>" +
      (body ? '<pre class="mv-body mono" tabindex="0" aria-label="' + esc(title + " " + L("본문", "body")) + '">' + pretty(body) + "</pre>"
        : '<p class="mv-none">' + esc(L("본문 없음", "No body")) + "</p>") + "</section>";
  }

  /* 한 건 — render(entry, {open, title, layout:"stack"|"split"}) → <details> 카드 */
  function render(entry, o) {
    o = o || {};
    var m = normalize(entry), tn = statusTone(m.status);
    var path = String(m.url).replace(/^https?:\/\/[^/]+/, "");
    var head = '<span class="mv-m mv-m-' + esc(m.method.toLowerCase()) + '">' + esc(m.method) + "</span>" +
      '<span class="mv-u mono" title="' + esc(m.url) + '">' + esc(path || m.url) + "</span>" +
      '<span class="mv-st mv-' + tn + ' tabnum">' + esc(m.status === "MOCK" ? "MOCK" : m.status + (REASON[m.status] ? " " + REASON[m.status] : "")) + "</span>" +
      (m.at ? '<span class="mv-at tabnum">' + esc(String(m.at).replace("T", " ").slice(11, 19) || m.at) + "</span>" : "");
    return '<details class="mv' + (o.layout === "split" ? " mv--split" : "") + '"' + (o.open ? " open" : "") + ">" +
      '<summary class="mv-sum">' + (o.title ? '<span class="mv-title">' + esc(o.title) + "</span>" : "") + head + "</summary>" +
      '<div class="mv-tools">' + copyBtn(L("curl 복사", "Copy as curl"), curl(m)) + copyBtn(L("원문 전체 복사", "Copy raw exchange"), rawText(m)) +
      (m.summary ? '<span class="mv-summ">' + esc(m.summary) + "</span>" : "") + "</div>" +
      '<div class="mv-grid">' + section("req", m.reqHeaders, m.reqBody) + section("res", m.resHeaders, m.resBody) + "</div></details>";
  }

  /* 여러 건 — list(entries, {limit=20, newestFirst=true, empty, ariaLabel, filter(fn)}) */
  function list(entries, o) {
    o = o || {}; var arr = (entries || []).slice();
    if (o.filter) arr = arr.filter(o.filter);
    if (o.newestFirst !== false) arr.reverse();
    arr = arr.slice(0, o.limit || 20);
    var aria = o.ariaLabel || L("요청·응답 원문", "Raw requests · responses");
    if (!arr.length) return '<div class="mv-list" role="region" aria-label="' + esc(aria) + '"><p class="mv-none">' +
      esc(o.empty || L("아직 기록된 요청이 없습니다.", "No requests recorded yet.")) + "</p></div>";
    return '<div class="mv-list" role="region" aria-label="' + esc(aria) + '">' + arr.map(function (e, i) { return render(e, { open: o.openFirst && i === 0, layout: o.layout }); }).join("") + "</div>";
  }

  /* 실시간 부착 — attach(el, client, opts): client.trace()/onTrace(f) (NC.v2 클라이언트) 를 구독해 el 을 다시 그린다. */
  function attach(el, client, o) {
    if (!el || !client || !client.trace) return function () {};
    var on = true;
    function draw() { if (on && el.isConnected !== false) el.innerHTML = list(client.trace(), o); }
    draw();
    if (client.onTrace) client.onTrace(function () { draw(); });
    return function () { on = false; };
  }

  function announce(doc, msg) {
    var r = doc.getElementById("mv-live");
    if (!r) { r = doc.createElement("div"); r.id = "mv-live"; r.className = "sr-only"; r.setAttribute("aria-live", "polite"); doc.body.appendChild(r); }
    r.textContent = ""; setTimeout(function () { r.textContent = msg; }, 20);
  }
  function copyText(doc, text) {
    var nav = W && W.navigator;
    if (nav && nav.clipboard && nav.clipboard.writeText) return nav.clipboard.writeText(text);
    return new Promise(function (res, rej) {
      var ta = doc.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      doc.body.appendChild(ta); ta.select();
      try { doc.execCommand("copy") ? res() : rej(new Error("copy")); } catch (e) { rej(e); } finally { ta.remove(); }
    });
  }
  function onClick(e) {
    var b = e.target && e.target.closest ? e.target.closest("[data-mv-copy]") : null; if (!b) return;
    var doc = b.ownerDocument, text = store[b.getAttribute("data-mv-copy")];
    if (text == null) return;
    var orig = b.textContent;
    copyText(doc, text).then(function () {
      b.textContent = L("복사됨 ✓", "Copied ✓"); announce(doc, L("클립보드에 복사했습니다", "Copied to clipboard"));
    }, function () {
      b.textContent = L("복사 실패", "Copy failed"); announce(doc, L("복사하지 못했습니다", "Could not copy"));
    }).then(function () { setTimeout(function () { b.textContent = orig; }, 1400); });
  }

  var CSS =
    ".sr-only{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}" +
    ".mv-list{display:flex;flex-direction:column;gap:var(--sp-2)}" +
    ".mv{border:1px solid var(--border);border-radius:var(--radius);background:var(--surface-1);min-width:0}" +
    ".mv[open]{border-color:var(--border-strong)}" +
    ".mv-sum{display:flex;gap:var(--sp-2);align-items:center;padding:var(--sp-2) var(--sp-3);cursor:pointer;font-size:var(--fs-sm);flex-wrap:wrap;list-style-position:inside}" +
    ".mv-sum:hover{background:var(--surface-hover)}" +
    ".mv-title{font-weight:var(--fw-semi);color:var(--text-1)}" +
    ".mv-m{font-family:var(--font-mono);font-weight:var(--fw-bold);font-size:var(--fs-2xs);padding:1px 6px;border-radius:var(--radius-sm);background:var(--info-bg);color:var(--info-text);border:1px solid var(--info-line)}" +
    ".mv-m-post,.mv-m-put,.mv-m-patch{background:var(--ok-bg);color:var(--ok);border-color:var(--ok-line)}" +
    ".mv-m-delete{background:var(--crit-bg);color:var(--crit);border-color:var(--crit-line)}" +
    ".mv-u{flex:1 1 200px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-1);font-size:var(--fs-sm)}" +
    ".mv-st{font-family:var(--font-mono);font-size:var(--fs-2xs);font-weight:var(--fw-bold);padding:1px 6px;border-radius:var(--radius-pill);border:1px solid}" +
    ".mv-ok{color:var(--ok);background:var(--ok-bg);border-color:var(--ok-line)}.mv-warn{color:var(--warn);background:var(--warn-bg);border-color:var(--warn-line)}" +
    ".mv-crit{color:var(--crit);background:var(--crit-bg);border-color:var(--crit-line)}.mv-info{color:var(--info-text);background:var(--info-bg);border-color:var(--info-line)}" +
    ".mv-mock{color:var(--mock);background:var(--mock-bg);border-color:var(--mock-line)}" +
    ".mv-at{color:var(--text-3);font-size:var(--fs-2xs);font-family:var(--font-mono)}" +
    ".mv-tools{display:flex;gap:var(--sp-2);align-items:center;flex-wrap:wrap;padding:0 var(--sp-3) var(--sp-2)}" +
    ".mv-summ{color:var(--text-2);font-size:var(--fs-xs)}" +
    ".mv-copy{font:inherit;font-size:var(--fs-xs);padding:3px 8px;min-height:24px;border:1px solid var(--border-strong);border-radius:var(--radius-sm);background:var(--surface-2);color:var(--text-1);cursor:pointer}" +
    ".mv-copy:hover{background:var(--surface-hover)}" +
    ".mv-grid{display:grid;grid-template-columns:1fr;gap:var(--sp-2);padding:0 var(--sp-3) var(--sp-3)}" +
    ".mv--split .mv-grid{grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))}" +
    ".mv-sec{min-width:0;border-top:1px solid var(--border-soft);padding-top:var(--sp-2)}" +
    ".mv-sh{display:flex;justify-content:space-between;align-items:center;gap:var(--sp-2)}" +
    ".mv-sh h4{margin:0;font-size:var(--fs-xs);color:var(--text-2);text-transform:uppercase;letter-spacing:.04em}" +
    ".mv-hdbox summary{cursor:pointer;font-size:var(--fs-xs);color:var(--text-2);margin:var(--sp-1) 0}" +
    ".mv-hd{display:grid;grid-template-columns:minmax(90px,max-content) 1fr;gap:2px var(--sp-3);margin:0 0 var(--sp-2);font-family:var(--font-mono);font-size:var(--fs-2xs)}" +
    ".mv-hd dt{color:var(--text-2)}.mv-hd dd{margin:0;color:var(--text-1);overflow-wrap:anywhere}" +
    ".mv-body{margin:0;max-height:320px;overflow:auto;background:var(--surface-2);border:1px solid var(--border-soft);border-radius:var(--radius-sm);padding:var(--sp-2);font-size:var(--fs-2xs);line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--text-1)}" +
    ".mv-k{color:var(--info-text)}.mv-s{color:var(--ok)}.mv-n{color:var(--warn)}.mv-b{color:var(--purple-text)}.mv-cut{color:var(--text-3)}" +
    ".mv-none{color:var(--text-3);font-size:var(--fs-xs);margin:var(--sp-1) 0}";

  function install(doc) {
    if (!doc || doc.getElementById("nc-msg-css")) return;
    var s = doc.createElement("style"); s.id = "nc-msg-css"; s.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(s);
    doc.addEventListener("click", onClick);
  }

  var api = { version: "1.0.0", normalize: normalize, render: render, list: list, pretty: pretty, curl: curl, raw: function (e) { return rawText(normalize(e)); },
    attach: attach, install: install, css: CSS, _lang: "ko", _store: store };
  return api;
});
