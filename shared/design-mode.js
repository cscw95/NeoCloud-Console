/* NeoCloud 콘솔 공통 — 디자인 모드 스위치 (주간 ☀ = Blueprint 신규 디자인,
   야간 ☾ = 기존 레거시 디자인). localStorage["nc-design-mode"] 로 3콘솔 공유.
   순수 스타일 레이어: body[data-design] 속성만 전환, 기능/데이터 무변경.
   <body> 여는 태그 직후에 로드해 첫 페인트 전에 모드를 적용한다(FOUC 방지). */
(function () {
  var KEY = "nc-design-mode";

  function mode() {
    var v = null;
    try { v = localStorage.getItem(KEY); } catch (e) {}
    return v === "legacy" ? "legacy" : "blueprint";   // 기본값: 주간(blueprint)
  }

  function apply(m) {
    document.body.dataset.design = m;
    var t = document.getElementById("design-toggle");
    if (t) {
      ["blueprint", "legacy"].forEach(function (k) {
        var b = t.querySelector('[data-dm="' + k + '"]');
        b.classList.toggle("on", m === k);
        b.setAttribute("aria-pressed", m === k ? "true" : "false");
      });
    }
  }

  function set(m) {
    try { localStorage.setItem(KEY, m); } catch (e) {}
    apply(m);
  }

  // 첫 페인트 전에 즉시 적용 (스크립트가 <body> 직후에 위치)
  apply(mode());

  // 헤더 우측(.tb-right)에 ☀/☾ 토글 주입
  function mount() {
    if (document.getElementById("design-toggle")) return;
    var host = document.querySelector(".tb-right") || document.querySelector(".topbar");
    if (!host) return;
    var t = document.createElement("span");
    t.id = "design-toggle";
    t.className = "design-toggle";
    t.setAttribute("role", "group");
    t.setAttribute("aria-label", "화면 테마");
    // 네이티브 <button> — Tab 포커스 · Enter/Space 활성 (WCAG 2.1.1)
    t.innerHTML =
      '<button type="button" data-dm="blueprint" title="주간 모드 — Blueprint 디자인" aria-label="주간 모드">☀</button>' +
      '<button type="button" data-dm="legacy" title="야간 모드 — 기존 디자인" aria-label="야간 모드">☾</button>';
    t.addEventListener("click", function (e) {
      var b = e.target && e.target.closest && e.target.closest("[data-dm]");
      var m = b && b.getAttribute("data-dm");
      if (m) set(m);
    });
    host.insertBefore(t, host.firstChild);
    apply(mode());
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else { mount(); }

  // 다른 탭/콘솔에서 전환 시 실시간 동기화
  window.addEventListener("storage", function (e) {
    if (e.key === KEY) apply(mode());
  });
})();
