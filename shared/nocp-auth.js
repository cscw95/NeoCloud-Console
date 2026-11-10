/* NOCP 인증 — 헤더 이름과 토큰 조회를 한 곳에서 관리 (NeoCloud-Control-Plane app/auth.py와 동일 방식).
   - 신원: `Authorization: Bearer <token>`. 토큰은 window.NOCP_TOKEN 또는 localStorage 'nocp_token'.
     (운영자 토큰은 NOCP_TOKENS env 또는 POST /api/v1/auth/tokens 로 발급)
   - SSE(/api/v1/events): EventSource는 헤더를 못 붙이므로 POST /api/v1/events/token 으로
     단기 토큰을 받아 ?token= 으로 연다 (eventsUrl).
   - 레거시 헤더(X-Tenant-Id/X-Tenant-Role/X-Operator)는 NOCP_DEV_INSECURE_HEADERS=1 개발 모드 전용.
     `X-Operator: true`는 더 이상 하드코딩하지 않는다 — window.NOCP_LEGACY_OPERATOR=true 또는
     localStorage 'nocp_legacy_operator'='1' 일 때만, 고객 콘솔(/customer/) 밖에서만 붙인다.
   - fetch shim: NOCP base(localStorage nc-nocp, 기본 :8000)로 가는 요청에만 헤더를 부착한다.
   브라우저에서는 window.NC_AUTH, Node(테스트·dsx-api)에서는 module.exports. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.fetch) { root.NC_AUTH = api; api.installFetchShim(root); }
})(typeof window !== "undefined" ? window : null, function () {
  var H = {
    AUTH: "Authorization", SCHEME: "Bearer",
    TENANT: "X-Tenant-Id", ROLE: "X-Tenant-Role", OPERATOR: "X-Operator",
  };
  var TOKEN_KEY = "nocp_token", LEGACY_KEY = "nocp_legacy_operator", BASE_KEY = "nc-nocp";
  var DEFAULT_BASE = "http://127.0.0.1:8000";

  function ls(g, k) {
    try { return g && g.localStorage ? g.localStorage.getItem(k) : null; } catch (e) { return null; }
  }
  function token(g) {
    var t = (g && g.NOCP_TOKEN) || ls(g, TOKEN_KEY);
    return t && String(t).trim() ? String(t).trim() : null;
  }
  function legacyOperator(g) {
    return !!(g && g.NOCP_LEGACY_OPERATOR === true) || ls(g, LEGACY_KEY) === "1";
  }
  function isCustomer(g) {
    return !!(g && g.location && /^\/customer\//.test(g.location.pathname || ""));
  }
  function base(g) { return ls(g, BASE_KEY) || DEFAULT_BASE; }

  /* 요청 헤더. session = {tenant_id, role} (고객 콘솔) 또는 null. tok 지정 시 그 토큰 사용. */
  function headers(session, g, tok) {
    var t = tok !== undefined ? tok : token(g);
    var out = {};
    if (t) { out[H.AUTH] = H.SCHEME + " " + t; return out; }
    if (session && session.tenant_id) {             // dev: NOCP_DEV_INSECURE_HEADERS=1
      out[H.TENANT] = session.tenant_id;
      out[H.ROLE] = session.role || "viewer";
      return out;
    }
    if (legacyOperator(g) && !isCustomer(g)) out[H.OPERATOR] = "true";
    return out;
  }

  /* SSE URL: 토큰이 있으면 events 전용 단기 토큰을 발급받아 ?token= 으로. */
  async function eventsUrl(v1, doFetch, g, tok) {
    var t = tok !== undefined ? tok : token(g);
    if (!t || !doFetch) return v1 + "/events";
    var h = {}; h[H.AUTH] = H.SCHEME + " " + t;
    var r = await doFetch(v1 + "/events/token", { method: "POST", headers: h });
    if (!r || !r.ok) throw new Error("events token request failed");
    var j = await r.json();
    return v1 + "/events?token=" + encodeURIComponent(j.token);
  }

  function installFetchShim(g) {
    if (!g || !g.fetch || g.fetch.__ncAuth) return;
    var orig = g.fetch.bind(g);
    var shim = function (input, init) {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      if (url.indexOf(base(g)) !== 0) return orig(input, init);
      init = Object.assign({}, init);
      var h = new g.Headers(init.headers || (typeof input !== "string" && input.headers) || {});
      if (!h.has(H.AUTH)) {
        var add = headers(null, g);
        Object.keys(add).forEach(function (k) {
          if (k === H.OPERATOR && (h.has(H.TENANT) || h.has(H.OPERATOR))) return;
          if (k === H.AUTH) { h.delete(H.TENANT); h.delete(H.ROLE); h.delete(H.OPERATOR); }
          h.set(k, add[k]);
        });
      }
      init.headers = h;
      return orig(input, init);
    };
    shim.__ncAuth = true;
    g.fetch = shim;
  }

  return { HEADERS: H, TOKEN_KEY: TOKEN_KEY, LEGACY_KEY: LEGACY_KEY,
           token: token, legacyOperator: legacyOperator, headers: headers,
           eventsUrl: eventsUrl, installFetchShim: installFetchShim };
});
