/* NeoCloud 콘솔 공통 런타임 — 해시 라우터 · 모달 다이얼로그 · 이벤트 버스.
   레퍼런스 Component 클래스의 state.screen → 라우트(#/<id>),
   state.modal → 다이얼로그(data-modal/<data-open>)로 매핑한다. */
(function () {
  const NC = (window.NC = window.NC || {});

  /* ── 이벤트 버스 (크로스 포털 효과는 mock에선 콘솔 내 전파) ── */
  const subs = {};
  NC.bus = {
    on(ev, fn) { (subs[ev] = subs[ev] || []).push(fn); },
    emit(ev, data) {
      (subs[ev] || []).forEach(fn => fn(data));
      (subs["*"] || []).forEach(fn => fn(ev, data));
    },
  };

  /* ── 라우터: 사이드바 메뉴 id = 라우트 (#/dashboard 등) ────── */
  const screens = {};   // id -> {el, onShow}
  let defaultScreen = null;

  NC.registerScreens = function (onShowMap) {
    document.querySelectorAll("[data-screen]").forEach(el => {
      const id = el.dataset.screen;
      screens[id] = { el, onShow: (onShowMap || {})[id] };
      if (!defaultScreen) defaultScreen = id;
    });
  };

  NC.route = function () {
    const id = (location.hash.replace(/^#\/?/, "") || defaultScreen)
      .split("?")[0];
    const target = screens[id] ? id : defaultScreen;
    Object.entries(screens).forEach(([sid, s]) =>
      s.el.style.display = sid === target ? "" : "none");
    document.querySelectorAll(".mi[data-route]").forEach(mi => {
      const on = mi.dataset.route === target;
      mi.classList.toggle("act", on);
      if (on) mi.setAttribute("aria-current", "page");
      else mi.removeAttribute("aria-current");
    });
    const crumb = document.querySelector(".crumb .cur");
    const act = document.querySelector(`.mi[data-route="${target}"]`);
    if (crumb && act) crumb.textContent =
      act.textContent.replace(/\d+$|P2$/g, "").trim();
    if (screens[target] && screens[target].onShow)
      screens[target].onShow();
    NC.bus.emit("route", target);
  };

  NC.nav = id => { location.hash = "#/" + id; };

  /* ── 모달: 버튼 data-open="<id>" → 다이얼로그 data-modal="<id>" ── */
  NC.openModal = function (id) {
    const ov = document.querySelector(`.modal-ov[data-modal="${id}"]`);
    if (ov) { ov.classList.add("open"); NC.bus.emit("modal.open", id); }
  };
  NC.closeModal = function (id) {
    const ov = id
      ? document.querySelector(`.modal-ov[data-modal="${id}"]`)
      : document.querySelector(".modal-ov.open");
    if (ov) { ov.classList.remove("open"); NC.bus.emit("modal.close", ov.dataset.modal); }
  };

  document.addEventListener("click", e => {
    const opener = e.target.closest("[data-open]");
    if (opener) { NC.openModal(opener.dataset.open); return; }
    const closer = e.target.closest("[data-close]");
    if (closer) { NC.closeModal(closer.closest(".modal-ov").dataset.modal); return; }
    const ov = e.target.classList && e.target.classList.contains("modal-ov")
      ? e.target : null;                       // 오버레이 클릭 → 닫기
    if (ov) NC.closeModal(ov.dataset.modal);
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") NC.closeModal();
  });

  /* ── 토스트 (액션 확정 피드백) ─────────────────────────── */
  NC.toast = function (msg, kind) {
    let box = document.getElementById("nc-toast");
    if (!box) {
      box = document.createElement("div");
      box.id = "nc-toast";
      box.setAttribute("role", "status");        // 스크린리더 알림 (WCAG 4.1.3)
      box.setAttribute("aria-live", "polite");
      box.style.cssText = "position:fixed;bottom:22px;right:22px;z-index:99;" +
        "display:flex;flex-direction:column;gap:8px";
      document.body.appendChild(box);
    }
    const t = document.createElement("div");
    t.style.cssText = "background:var(--card);border:1px solid " +
      (kind === "warn" ? "var(--amber-line)" : "var(--green-line)") +
      ";border-radius:8px;padding:10px 14px;font-size:12px;color:var(--text);" +
      "max-width:340px";
    t.innerHTML = (kind === "warn"
      ? '<b style="color:var(--amber)">⚠</b> '
      : '<b style="color:var(--green-text)">✓</b> ') + msg;
    box.appendChild(t);
    setTimeout(() => t.remove(), 3800);
  };

  /* ── 키보드 접근성 (WCAG 2.1.1) ─────────────────────────────
     span/div/tr 에 붙은 클릭 핸들러(칩·히트맵 셀·클릭 행·모달 ×·mk8s onclick div)는
     마크업 무변경으로 tabindex="0"(+role="button")을 주입하고 Enter/Space → click()으로 위임한다.
     동적 렌더는 MutationObserver가 다시 훑는다. */
  NC.A11Y_CLICKABLE = [
    "[onclick]", "[data-open]", "[data-nav]", "[data-demo]", "[data-deal]", "[data-close]",
    "[style*='cursor:pointer']", "[style*='cursor: pointer']",
    ".chip", ".scope-chip", ".qchip", ".nq-swchip", ".mh .x", ".lnk",
    ".hm-cell", ".obs-hm .hc", "tr.click", "tr[data-tenant]", "#ov-faults tr",
    ".kcard", ".cdu-card", ".obs-dcard", ".switch", ".ftc", ".ft-sp", ".deal",
    ".nav1", ".nav2", ".mi",
  ].join(",");
  const NATIVE = "a[href],button,input,select,textarea,label,summary,option,[contenteditable]";
  NC.a11y = function (root) {
    (root || document).querySelectorAll(NC.A11Y_CLICKABLE).forEach(el => {
      if (el.hasAttribute("tabindex") || el.matches(NATIVE) || el.closest("[disabled],[aria-disabled=true]")) return;
      if (el.parentElement && el.parentElement.closest(NATIVE)) return;
      el.setAttribute("tabindex", "0");
      el.setAttribute("data-nc-kb", "");
      const tag = el.tagName;
      if (!el.hasAttribute("role") && tag !== "TR" && tag !== "TD") el.setAttribute("role", "button");
      if (el.matches(".mh .x") && !el.hasAttribute("aria-label")) el.setAttribute("aria-label", "닫기");
    });
  };
  document.addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
    const el = e.target;
    if (!el || !el.hasAttribute || !el.hasAttribute("data-nc-kb")) return;
    e.preventDefault();
    el.click();
  });
  let a11yQueued = false;
  const a11yObs = new MutationObserver(() => {
    if (a11yQueued) return;
    a11yQueued = true;
    setTimeout(() => { a11yQueued = false; NC.a11y(); }, 120);
  });
  const a11yStart = () => {
    NC.a11y();
    a11yObs.observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", a11yStart);
  else a11yStart();

  /* ── 스킵 링크 · 모바일 사이드바 드로어 (<768px) ───────────────
     #nc-main 해시는 라우터와 충돌하므로 기본 동작 대신 포커스만 이동한다. */
  document.addEventListener("click", e => {
    const sk = e.target.closest && e.target.closest(".skip-link");
    if (!sk) return;
    e.preventDefault();
    const m = document.getElementById("nc-main");
    if (m) m.focus();
  });
  NC.drawer = function (open) {
    const btn = document.querySelector(".sb-toggle");
    const on = open === undefined ? !document.body.classList.contains("sb-open") : !!open;
    document.body.classList.toggle("sb-open", on);
    if (btn) btn.setAttribute("aria-expanded", on ? "true" : "false");
    if (on) {
      const first = document.querySelector("#nc-sidebar .mi");
      if (first) first.focus();
    } else if (btn && document.activeElement && document.activeElement.closest &&
               document.activeElement.closest("#nc-sidebar")) {
      btn.focus();
    }
  };
  const mountDrawer = () => {
    const sb = document.getElementById("nc-sidebar");
    const top = document.querySelector(".topbar");
    if (!sb || !top || top.querySelector(".sb-toggle")) return;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sb-toggle";
    b.setAttribute("aria-controls", "nc-sidebar");
    b.setAttribute("aria-expanded", "false");
    b.setAttribute("aria-label", "메뉴 열기/닫기");
    b.textContent = "☰";
    b.addEventListener("click", () => NC.drawer());
    top.insertBefore(b, top.firstChild);
    const scrim = document.createElement("div");
    scrim.className = "sb-scrim";
    scrim.addEventListener("click", () => NC.drawer(false));
    sb.parentNode.insertBefore(scrim, sb.nextSibling);
    sb.addEventListener("click", e => {
      if (e.target.closest && e.target.closest(".mi")) NC.drawer(false);
    });
  };
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && document.body.classList.contains("sb-open")) NC.drawer(false);
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountDrawer);
  else mountDrawer();

  NC.start = function (onShowMap) {
    NC.registerScreens(onShowMap);
    addEventListener("hashchange", NC.route);
    NC.route();
  };
})();
