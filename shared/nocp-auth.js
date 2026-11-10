/* NOCP 운영자 헤더 shim — PLAN.md §C 보안 보완 대응.
   NOCP는 NOCP_DEV_OPERATOR_DEFAULT=0(기본)일 때 X-Tenant-Id 없는 요청에
   `X-Operator: true`를 요구한다. ops/biz 콘솔의 모든 NOCP 호출(nocp-api.js,
   ops/app.js obsFetch, mk8s.js DS, biz/app.js)에 한 곳에서 헤더를 부착한다.
   - 고객 콘솔(/customer/)에서는 비활성 (테넌트 세션 헤더만 사용 — 권한 상승 방지)
   - 이미 X-Tenant-Id 또는 X-Operator가 있으면 손대지 않는다
   - NOCP base(localStorage nc-nocp, 기본 :8000)로 가는 요청만 대상 */
(function () {
  if (typeof window === "undefined" || !window.fetch) return;
  if (/^\/customer\//.test(location.pathname)) return;
  var orig = window.fetch.bind(window);
  function base() {
    try { return localStorage.getItem("nc-nocp") || "http://127.0.0.1:8000"; }
    catch (e) { return "http://127.0.0.1:8000"; }
  }
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    if (url.indexOf(base()) !== 0) return orig(input, init);
    init = Object.assign({}, init);
    var h = new Headers(init.headers || (typeof input !== "string" && input.headers) || {});
    if (!h.has("X-Tenant-Id") && !h.has("X-Operator")) h.set("X-Operator", "true");
    init.headers = h;
    return orig(input, init);
  };
})();
