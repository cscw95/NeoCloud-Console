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
    document.querySelectorAll(".mi[data-route]").forEach(mi =>
      mi.classList.toggle("act", mi.dataset.route === target));
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

  NC.start = function (onShowMap) {
    NC.registerScreens(onShowMap);
    addEventListener("hashchange", NC.route);
    NC.route();
  };
})();
