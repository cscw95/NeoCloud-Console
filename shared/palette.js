/* 공통 커맨드 팔레트(⌘K) + 알림 드롭다운.
   - 팔레트: 사이드바 메뉴(라우트) + 라이브 엔티티(테넌트·주문·티켓·호스트) 검색 → 이동
   - 알림: [data-notif] 버튼 클릭 → NC.api.alerts() 드롭다운
   콘솔별 엔티티→라우트 매핑은 window.NC_PALETTE_ROUTES로 재정의 가능. */
(function () {
  const NC = (window.NC = window.NC || {});
  const R = Object.assign(
    { tenant: "dashboard", order: "provisioning", ticket: "support",
      host: "assets" }, window.NC_PALETTE_ROUTES || {});

  /* ── 스타일 ─────────────────────────────────────────────── */
  const css = document.createElement("style");
  css.textContent = `
  #ncp-ov{position:fixed;inset:0;background:rgba(5,9,15,.6);z-index:70;
    display:none;align-items:flex-start;justify-content:center;padding-top:12vh}
  #ncp-ov.open{display:flex}
  #ncp{width:560px;max-width:92vw;background:var(--card);
    border:1px solid var(--line);border-radius:12px;overflow:hidden;
    box-shadow:0 18px 50px rgba(0,0,0,.5)}
  #ncp input{width:100%;background:var(--card-sub);border:0;
    border-bottom:1px solid var(--line);padding:13px 16px;color:var(--text);
    font-size:13.5px;font-family:inherit;outline:none}
  #ncp-list{max-height:46vh;overflow-y:auto;padding:6px}
  .ncp-grp{color:var(--muted2);font-size:9.5px;font-weight:800;
    letter-spacing:.08em;padding:8px 10px 3px}
  .ncp-it{display:flex;align-items:center;gap:9px;padding:8px 10px;
    border-radius:7px;cursor:pointer;font-size:12.5px;color:var(--text)}
  .ncp-it .sub{color:var(--muted2);font-size:10.5px;font-family:Menlo,monospace;
    margin-left:auto}
  .ncp-it.sel,.ncp-it:hover{background:var(--menu-hover)}
  .ncp-it .dot{width:6px;height:6px}
  #ncp-foot{border-top:1px solid var(--line);padding:7px 14px;
    color:var(--muted2);font-size:10px;display:flex;gap:14px}
  #nc-notif{position:fixed;z-index:71;width:340px;background:var(--card);
    border:1px solid var(--line);border-radius:10px;display:none;
    box-shadow:0 14px 40px rgba(0,0,0,.5);overflow:hidden}
  #nc-notif .hd{padding:10px 14px;border-bottom:1px solid var(--line);
    color:#fff;font-weight:700;font-size:12.5px}
  #nc-notif .it{padding:9px 14px;border-bottom:1px solid var(--line-soft);
    font-size:11.5px;display:flex;gap:8px;align-items:flex-start}
  #nc-notif .it .at{margin-left:auto;color:var(--muted2);font-size:10px;
    font-family:Menlo,monospace;white-space:nowrap}`;
  document.head.appendChild(css);

  /* ── 팔레트 DOM ─────────────────────────────────────────── */
  const ov = document.createElement("div");
  ov.id = "ncp-ov";
  ov.innerHTML = `<div id="ncp">
    <input id="ncp-in" placeholder="화면 · 테넌트 · 주문 · 티켓 · 호스트 검색…">
    <div id="ncp-list"></div>
    <div id="ncp-foot"><span>↑↓ 이동</span><span>⏎ 열기</span>
      <span>esc 닫기</span><span id="ncp-src" style="margin-left:auto"></span></div>
  </div>`;
  document.addEventListener("DOMContentLoaded", () =>
    document.body.appendChild(ov));

  let items = [], sel = 0, cache = null, cacheAt = 0;

  function menuItems() {
    return [...document.querySelectorAll(".mi[data-route]")].map(mi => ({
      grp: "화면", label: mi.textContent.replace(/\d+$|P2$/g, "").trim(),
      sub: "#/" + mi.dataset.route, go: () => NC.nav(mi.dataset.route) }));
  }
  async function entityItems() {
    if (cache && Date.now() - cacheAt < 30000) return cache;
    const out = [];
    try {
      const [ts, os, ks] = await Promise.all(
        [NC.api.tenants(), NC.api.orders ? NC.api.orders() : null,
         NC.api.tickets()]);
      (ts || []).forEach(t => out.push({ grp: "테넌트",
        label: `${t.name} — ${t.racks}랙`, sub: t.pkey,
        go: () => { if (NC.setTenant) NC.setTenant(t.id); NC.nav(R.tenant); } }));
      (os || []).forEach(o => out.push({ grp: "주문",
        label: `${o.id} · ${o.tenant_id || o.tenant} · ${o.kind || ""} ${o.racks || ""}랙`,
        sub: o.state, go: () => NC.nav(R.order) }));
      (ks || []).forEach(k => out.push({ grp: "티켓",
        label: `${k.id} · ${k.subject}`, sub: k.state,
        go: () => NC.nav(R.ticket) }));
      if (NC.api.hosts) {
        const hs = await NC.api.hosts({ limit: 3000 });
        (hs || []).slice(0, 3000).forEach(h => out.push({ grp: "호스트",
          label: h.host_id, sub: h.state, lazy: true,
          go: () => { location.hash = "#/" + R.host + "?q=" + h.host_id;
                      NC.bus.emit("palette.host", h.host_id); } }));
      }
    } catch (e) { /* 라이브 미가용 — 메뉴만 */ }
    cache = out; cacheAt = Date.now();
    return out;
  }
  function render(list) {
    items = list.slice(0, 40); sel = 0;
    const box = document.getElementById("ncp-list");
    let grp = "", html = "";
    items.forEach((it, i) => {
      if (it.grp !== grp) { grp = it.grp;
        html += `<div class="ncp-grp">${grp}</div>`; }
      html += `<div class="ncp-it${i === 0 ? " sel" : ""}" data-i="${i}">
        <span class="dot ${i === 0 ? "green" : "gray"}"></span>${it.label}
        <span class="sub">${it.sub || ""}</span></div>`;
    });
    box.innerHTML = html ||
      '<div class="ncp-grp">결과 없음</div>';
    document.getElementById("ncp-src").textContent =
      NC.live ? "VRCM 라이브 검색" : "메뉴 + mock";
  }
  async function refresh(q) {
    const base = menuItems().concat(await entityItems());
    const qq = (q || "").toLowerCase();
    render(qq ? base.filter(it =>
      (it.label + " " + (it.sub || "")).toLowerCase().includes(qq)) : base);
  }
  function openPal() {
    ov.classList.add("open");
    const inp = document.getElementById("ncp-in");
    inp.value = ""; inp.focus(); refresh("");
  }
  const closePal = () => ov.classList.remove("open");

  document.addEventListener("keydown", e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault(); openPal(); return;
    }
    if (!ov.classList.contains("open")) return;
    if (e.key === "Escape") return closePal();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      sel = Math.max(0, Math.min(items.length - 1,
        sel + (e.key === "ArrowDown" ? 1 : -1)));
      document.querySelectorAll(".ncp-it").forEach((el, i) => {
        el.classList.toggle("sel", i === sel);
        el.querySelector(".dot").className = "dot " + (i === sel ? "green" : "gray");
        if (i === sel) el.scrollIntoView({ block: "nearest" });
      });
    }
    if (e.key === "Enter" && items[sel]) { closePal(); items[sel].go(); }
  });
  document.addEventListener("click", e => {
    if (e.target === ov) return closePal();
    const it = e.target.closest(".ncp-it");
    if (it) { const i = +it.dataset.i; closePal(); items[i].go(); }
    if (e.target.closest(".search")) openPal();       // 톱바 검색창 클릭
  });
  document.addEventListener("input", e => {
    if (e.target.id === "ncp-in") refresh(e.target.value);
  });

  /* ── 알림 드롭다운 — [data-notif] 버튼 ───────────────────── */
  const nb = document.createElement("div");
  nb.id = "nc-notif";
  document.addEventListener("DOMContentLoaded", () =>
    document.body.appendChild(nb));
  async function openNotif(btn) {
    const alerts = await NC.api.alerts();
    nb.innerHTML = `<div class="hd">알림 · 이벤트</div>` +
      (alerts || []).map(a => `<div class="it">
        <span class="dot ${a.sev === "warn" ? "amber" : "blue"}"
          style="margin-top:4px"></span>
        <span>${a.msg}</span><span class="at">${a.at || ""}</span></div>`)
        .join("") || "";
    const r = btn.getBoundingClientRect();
    nb.style.top = (r.bottom + 8) + "px";
    nb.style.left = Math.max(8, Math.min(r.right - 340,
      innerWidth - 350)) + "px";
    nb.style.display = "block";
  }
  document.addEventListener("click", e => {
    const btn = e.target.closest("[data-notif]");
    if (btn) {
      if (nb.style.display === "block") nb.style.display = "none";
      else openNotif(btn);
      e.stopPropagation(); return;
    }
    if (!e.target.closest("#nc-notif")) nb.style.display = "none";
  });
})();
