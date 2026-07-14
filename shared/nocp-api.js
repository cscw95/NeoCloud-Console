/* NOCP 실연동 어댑터 — mock-api.js 다음에 로드되어 NC.api를 라이브 구현으로 교체.
   원칙: ① mock과 동일한 반환 shape ② nocp(:8000) 미기동 시 getter 단위 mock 폴백
   ③ nocp에 대응물이 없는 도메인(pipeline·expansion·sanitization)은 mock 유지.
   크로스 포털 흐름: 비즈 convertDeal→실제 테넌트+승인주문 생성 → 운영 approve→
   POST /orders/{id}/approve (단계 게이트) → 고객 콘솔에서 실 클러스터 조회. */
(function () {
  const NC = (window.NC = window.NC || {});
  const BASE = localStorage.getItem("nc-nocp") || "http://127.0.0.1:8000";
  const V = BASE + "/api/v1";
  const mock = Object.assign({}, NC.api);   // 폴백 보관

  /* ── 저수준 fetch (1.5s 타임아웃) + 생존 캐시 ─────────────── */
  let aliveUntil = 0, dead = false;
  async function raw(url, opt) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 1500);
    try {
      const r = await fetch(url, Object.assign({ signal: ctl.signal }, opt));
      if (!r.ok) throw new Error(await r.text().catch(() => r.status));
      dead = false; aliveUntil = Date.now() + 10000;
      return r.json();
    } finally { clearTimeout(t); }
  }
  const jp = (u, body, method) => raw(u, {
    method: method || "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body) });
  async function live() {                       // 도달성 (10s 캐시)
    if (Date.now() < aliveUntil) return true;
    if (dead) return false;
    const t0 = (performance && performance.now) ? performance.now() : Date.now();
    try {
      await raw(V + "/spec");
      _latency = Math.round(((performance && performance.now
        ? performance.now() : Date.now()) - t0));
      setBadge(true); return true;
    } catch { dead = true; setTimeout(() => (dead = false), 15000);
            setBadge(false); return false; }
  }

  /* ── 톱바 연동 상태 배지 (Control-Plane + 하위 NICo 체인) ──── */
  let _latency = null;
  function setBadge(on) {
    NC.live = on;
    let b = document.getElementById("nc-livesrc");
    if (!b) {
      const right = document.querySelector(".tb-right");
      if (!right) return;
      b = document.createElement("span");
      b.id = "nc-livesrc"; b.className = "tb-chip";
      right.prepend(b);
    }
    const lat = on && _latency != null ? ` · ${_latency}ms` : "";
    b.innerHTML = on
      ? `<span class="dot" style="background:var(--green)"></span>Control-Plane 연동${lat}`
      : '<span class="dot" style="background:var(--amber)"></span>Control-Plane 미연동';
    b.title = on ? "NeoCloud OS Control-Plane API " + BASE + " 실연동 중 (라이브 데이터)"
                 : "Control-Plane 미기동 — 시나리오 mock 데이터로 동작 (오프라인)";
    if (on) refreshChain(b);       // Control-Plane → NICo 체인 상태 덧붙임
  }

  // Control-Plane이 NICo(사이트 컨트롤러)와 연동됐는지 표시 (하위 체인).
  // 내부 인프라 체인은 운영 콘솔 전용 — 고객·비즈에는 노출하지 않음.
  let _chainAt = 0;
  async function refreshChain(b) {
    if (!/\/ops(\/|$)/.test(location.pathname)) return;
    if (Date.now() - _chainAt < 8000) return;
    _chainAt = Date.now();
    let c = document.getElementById("nc-chain");
    try {
      const r = await fetch(BASE + "/api/v1/integration/nico");
      if (!r.ok) throw 0;
      const n = await r.json();
      if (!c) {
        c = document.createElement("span");
        c.id = "nc-chain"; c.className = "tb-chip";
        (document.querySelector(".tb-right") || b.parentNode).prepend(c);
      }
      const up = n.reachable;
      const mode = n.adapter_active ? "실연동" : "상태감시";  // http vs local
      c.innerHTML =
        `<span class="dot" style="background:${up ? "var(--green)" : "var(--dot-off)"}"></span>` +
        `NICo ${up ? (n.adapter_active ? "연동" : "감시") : "오프라인"}`;
      c.title = up
        ? `Control-Plane → NICo Emulator ${n.adapter_mode === "http"
            ? "실연동(NicoHttpAdapter)" : "상태 감시(local FakeNico)"} · `
          + `${n.model} ${n.compute_trays} trays / ${n.dpus} DPU · ${n.latency_ms}ms`
        : "NICo Emulator 오프라인";
    } catch (e) {
      if (c) c.innerHTML =
        '<span class="dot" style="background:var(--dot-off)"></span>NICo 오프라인';
    }
  }

  /* ── 헬퍼: 테넌트/패브릭 병합 ───────────────────────────── */
  async function fabricByTenant() {
    try {
      const f = await raw(V + "/fabric/ib");
      const m = {};
      (f.tenants || []).forEach(t => (m[t.tenant_id] = t));
      return m;
    } catch { return {}; }
  }

  /* ── 라이브 구현 (mock shape 유지) ──────────────────────── */
  const liveApi = {
    async scale() {
      const [sum, inv] = await Promise.all(
        [raw(V + "/inventory/summary"), raw(V + "/inventory/sites")]);
      return {
        sites: inv.sites.map(s => ({
          id: s.site, name: s.site, racks: s.racks_total || s.racks ||
            (s.racks_sellable + s.racks_allocated + (s.racks_abnormal || 0)),
          sellable: s.racks_sellable, contractable: s.racks_contractable,
        })),
        racks_total: sum.racks, gpus_total: sum.gpus, gpu_per_rack: 72,
        mrr_usd: NC.CONST.mrr_usd, capped_mw: sum.capped_power_mw,
        gpus_by_state: sum.gpus_by_state,
      };
    },
    async tenants() {
      // 랙/사이트/P_Key는 fabric/ib 테넌트 뷰가 정본 (목록 API엔 할당 미포함)
      const [ts, fab] = await Promise.all(
        [raw(V + "/tenants"), fabricByTenant()]);
      return ts.map(t => {
        const f = fab[t.id] || {};
        return { id: t.id, name: t.name, racks: f.racks || 0,
          gpus: f.gpus || 0, site: f.site || "—",
          clusters: f.racks ? 1 : 0, sus: f.sus || [],
          contract: "active", pkey: f.pkey || "—" };
      });
    },
    async provisioning() {                 // 승인 게이트 대기 주문 (최신 1건)
      const os = await raw(V + "/orders");
      const pend = os.filter(o => o.approval_mode && o.pending_stage &&
        !["delivered", "failed", "rejected", "closed"].includes(o.state))
        .sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
      if (pend.length) {
        const o = pend[0];
        return { id: o.id, tenant: o.tenant_id, racks: o.racks, su: "배치 예정",
          state: "approval_pending",
          gate: `승인 게이트 — 다음 단계: ${o.pending_stage}`,
          pkey_reserved: "할당 시 발급", requested_at: (o.history[0] || {}).at,
          pending_stage: o.pending_stage, queue: pend.length };
      }
      const last = os.filter(o => o.approval_mode)
        .sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }))[0];
      if (last) return { id: last.id, tenant: last.tenant_id, racks: last.racks,
        su: "—", state: last.state === "delivered" ? "provisioning" : last.state,
        gate: last.state === "delivered" ? "승인 완료 — 인도됨"
              : `상태: ${last.state}`, pkey_reserved: "—", queue: 0 };
      // 라이브 연결 상태에서 승인형 주문이 없으면 mock 데모 주문(ord-9)을
      // 보여주지 않는다 — 유령 주문이 "진행 안 됨"으로 오인되기 때문.
      return { id: "—", tenant: "승인 대기 주문 없음", racks: 0, su: "—",
        state: "idle", gate: "진행 중 개통 주문 없음 — 신규 주문 접수 시 표시",
        pkey_reserved: "—", requested_at: "—", queue: 0, empty: true };
    },
    async incidents() {
      const f = await raw(V + "/emu/faults");
      const list = (f.recent || []).slice(0, 6).map((x, i) => ({
        id: "INC-" + String(x.seq || i + 400).padStart(4, "0"),
        sev: "P2", target: x.tray_id || x.host || "—",
        kind: `GPU XID ${x.xid || "?"}`,
        state: x.resolved ? "resolved" : "mitigating",
        tenant: x.tenant_id || "—", ticket: "—", rma: "—",
        window: "—",
        timeline: [[(x.at || "").slice(5, 16), `XID ${x.xid} 감지 — ${x.tray_id || ""}`]]
          .concat(x.resolved ? [[(x.resolved_at || "").slice(5, 16),
            `자동 복구 완료 (TTR ${x.ttr_s || "?"}s)`]] : []),
      }));
      return list.length ? list : mock.incidents();
    },
    async tickets() {
      const ts = await raw(V + "/tickets");
      return ts.map(t => ({ id: t.id, tenant: t.tenant_id, sev: t.severity,
        state: t.status, subject: t.subject, linked: "",
        node_state: t.status === "resolved" ? "정상" : "확인 중" }));
    },
    async alerts() {
      const f = await raw(V + "/emu/faults");
      const rec = (f.recent || []).slice();
      // firing 우선 상위 6건 — 트윈 전 도메인(랙 제어·냉각·패브릭·스토리지) 포함
      rec.sort((x, y) => (x.resolved === y.resolved) ? 0 : (x.resolved ? 1 : -1));
      const a = rec.slice(0, 6).map((x, i) => ({
        id: "AL-" + (300 + i), sev: x.resolved ? "info" : "warn",
        msg: (x.kind && x.kind !== "reprovision" && x.detail
                ? x.detail.slice(0, 72)
                : `${x.tray_id || "tray"} XID ${x.xid}`) +
             (x.resolved ? " — 복구 완료" : " — 대응 중"),
        at: (x.at || "").slice(5, 16) }));
      return a.length ? a : mock.alerts();
    },
    async contracts() {
      const [ts, os, rates] = await Promise.all([liveApi.tenants(),
        raw(V + "/orders"), raw(V + "/billing/rates").catch(() => null)]);
      // rates.rates = {"vr-nvl72": <usd/rack-h>, ...} 객체맵 (배열 아님)
      const rmap = rates && rates.rates ? rates.rates : {};
      const perRack = (rmap["vr-nvl72"] || Object.values(rmap)[0] || 980) * 720;
      return ts.map((t, i) => {
        const racks = t.racks;
        const pend = os.find(o => o.tenant_id === t.id && o.approval_mode &&
          o.pending_stage);
        return { id: "CT-2026-" + String(i + 1).padStart(3, "0"),
          tenant: t.name, kind: "Reserved", racks,
          mrr_usd: Math.round(racks * perRack),
          state: pend ? "provisioning" : (racks ? "active" : "pending"),
          renewal_d: null,
          note: pend ? `개통 중 — ${pend.id} 승인 게이트(${pend.pending_stage})` : "" };
      });
    },

    /* ── 액션: 실제 nocp 라이프사이클 ───────────────────── */
    async approveProvision() {
      const p = await liveApi.provisioning();
      if (!p || p.state !== "approval_pending")
        return { ok: false, msg: "승인 대기 주문 없음" };
      await jp(`${V}/orders/${p.id}/approve`, {});
      const after = await raw(`${V}/orders/${p.id}`);
      NC.bus.emit("provision.approved", { id: p.id,
        pending: after.pending_stage, state: after.state });
      return { ok: true, id: p.id, next: after.pending_stage,
        state: after.state };
    },
    async rejectProvision(reason) {
      const p = await liveApi.provisioning();
      if (!p || p.state !== "approval_pending")
        return { ok: false, msg: "승인 대기 주문 없음" };
      await jp(`${V}/orders/${p.id}/reject`, { reason: reason || "운영 거절" });
      NC.bus.emit("provision.rejected", { id: p.id, reason });
      return { ok: true, id: p.id };
    },
    async convertDeal(dealId) {            // 비즈: 딜 → 실제 계약(테넌트)+개통 주문
      const deal = (await mock.pipeline()).find(d => d.id === dealId)
        || { racks: 24 };
      const t = await jp(V + "/tenants",
        { name: dealId, isolation_tier: "bare_metal_dedicated" });
      const o = await jp(V + "/orders", { tenant_id: t.id, kind: "new",
        blueprint_key: "vr-nvl72", racks: deal.racks, approval_mode: true });
      await mock.convertDeal(dealId);      // 파이프라인 상태도 동기
      NC.bus.emit("deal.converted", { id: dealId, order: o.id, tenant: t.id });
      return { ok: true, order: o.id, tenant: t.id, state: o.state,
        pending: o.pending_stage };
    },
    async resolveIncident(id) {
      const ts = await raw(V + "/tickets").catch(() => []);
      const open = ts.find(t => t.status !== "resolved");
      if (open) await jp(`${V}/tickets/${open.id}`,
        { status: "resolved" }, "PATCH").catch(() => {});
      await mock.resolveIncident(id);      // 시나리오 상태 동기 + 버스
      return { ok: true };
    },
    async createTicket(body) {             // 고객: 실 티켓 접수
      const t = await jp(V + "/tickets", body);
      NC.bus.emit("ticket.created", t);
      return t;
    },

    /* ── 고객 콘솔 풀연동 (라이브 전용) ─────────────────────── */
    iamRealm: tid => raw(`${BASE}/fake-shared/iam/realms/${tid}`),
    leases: () => raw(BASE + "/fake-nico/dhcp/leases"),
    async setWorkload(tid, profile) {      // 클러스터 워크로드 프로파일 전환
      const r = await jp(`${V}/emu/clusters/${tid}/workload`,
        { profile });
      NC.bus.emit("workload.changed", { tenant: tid, profile });
      return r;
    },

    /* ── 셀프서비스·과금·IAM (라이브 전용) ──────────────────── */
    async createOrder(body) {              // 고객: 클러스터 신규/확장 실주문
      const o = await jp(V + "/orders", body);
      NC.bus.emit("order.created", o);
      return o;
    },
    async terminateOrder(tenant_id, allocation_id) {  // 고객: 회수 실주문
      const o = await jp(V + "/orders",
        { tenant_id, kind: "terminate", allocation_id });
      NC.bus.emit("order.terminated", o);
      return o;
    },
    billingRates: () => raw(V + "/billing/rates"),
    async iamToken(body) {                 // API 키 — 실 IAM 토큰 발급
      const t = await jp(BASE + "/fake-shared/iam/token", body);
      NC.bus.emit("iam.token", t);
      return t;
    },
    accessPackages: async tid => {         // 딜리버리 접속 패키지
      const os = await raw(V + "/orders" + (tid ? "?tenant_id=" + tid : ""));
      return os.filter(o => o.access_package)
        .map(o => ({ order: o.id, racks: o.racks, pkg: o.access_package }));
    },

    /* ── 운영 콘솔 풀연동 getter/액션 (라이브 전용) ─────────── */
    hosts: p => raw(BASE + "/fake-nico/hosts?" + new URLSearchParams(p || {})),
    hostHardware: id => raw(`${BASE}/fake-nico/hosts/${id}/hardware`),
    sanitizeReport: id =>
      raw(`${BASE}/fake-nico/hosts/${id}/sanitize-report`),
    segments: () => raw(BASE + "/fake-nico/segments"),
    fabric: () => raw(V + "/fabric/ib"),
    spec: () => raw(V + "/spec"),
    emuHistoryGlobal: n => raw(`${V}/emu/history?limit=${n || 120}`),
    emuStatus: () => raw(V + "/emu/status"),
    faultMetrics: () => raw(V + "/emu/faults"),
    nodesSummary: () => raw(V + "/nodes/summary"),
    topologyTree: () => raw(V + "/topology/tree"),
    audit: n => raw(`${BASE}/fake-shared/audit?limit=${n || 30}`)
      .catch(() => raw(BASE + "/fake-shared/audit")),
    pamSessions: () => raw(BASE + "/fake-shared/pam/sessions"),
    isolation: tid => raw(`${V}/tenants/${tid}/isolation`),
    async runReconcile() {                 // 실 reconcile 감사 실행
      const r = await jp(V + "/reconcile/run", {});
      NC.bus.emit("reconcile.done", r);
      return r;
    },
    async equipmentSet(kind, id, state) {  // 정비/복구/RMA — 실 장비 상태 전환
      const r = await jp(V + "/equipment/state",
        { kind, id, state }, "PATCH");
      NC.bus.emit("equipment.changed", { kind, id, state });
      return r;
    },
    async pamOpen(body) {
      const r = await jp(BASE + "/fake-shared/pam/sessions", body);
      NC.bus.emit("pam.opened", r);
      return r;
    },
    async pamClose(id) {
      const r = await jp(`${BASE}/fake-shared/pam/sessions/${id}/close`, {});
      NC.bus.emit("pam.closed", { id });
      return r;
    },

    /* ── 콘솔 확장 getter (라이브 전용, 실패 시 null) ───────── */
    emuClusters: () => raw(V + "/emu/clusters"),
    emuHistory: (tid, n) =>
      raw(`${V}/emu/history?tenant_id=${tid}&limit=${n || 120}`),
    nodes: tid => raw(`${V}/nodes?tenant_id=${tid}`),
    storageViews: () => raw(BASE + "/fake-vast/views"),
    cpuNodes: tid => raw(`${V}/cpu-nodes?tenant_id=${tid}`),
    equipment: () => raw(V + "/health/equipment"),
    sitesInventory: () => raw(V + "/inventory/sites"),
    orders: () => raw(V + "/orders"),
    billingUsage: () => raw(V + "/billing/usage"),
  };

  /* ── NC.api 교체: 라이브 시도 → getter 단위 mock 폴백 ────── */
  const wrapped = {};
  Object.keys(mock).forEach(k => {
    wrapped[k] = async function (...args) {
      if (liveApi[k] && await live()) {
        try { return await liveApi[k](...args); }
        catch (e) { console.warn("[nocp-api]", k, "폴백:", e.message); }
      }
      return mock[k](...args);
    };
  });
  Object.keys(liveApi).forEach(k => {
    if (!wrapped[k]) wrapped[k] = async function (...args) {
      if (await live()) {
        try { return await liveApi[k](...args); } catch (e) {
          console.warn("[nocp-api]", k, e.message); return null; }
      }
      return null;
    };
  });
  NC.api = wrapped;

  /* 현재 테넌트(고객 콘솔 로그인 매핑) — 할당 보유 테넌트 우선 */
  NC.currentTenantId = localStorage.getItem("nc-tenant") || null;
  NC.setTenant = id => { NC.currentTenantId = id;
    localStorage.setItem("nc-tenant", id); NC.bus.emit("tenant.changed", id); };
  NC.api.currentTenant = async function () {
    const ts = await NC.api.tenants();
    return ts.find(t => t.id === NC.currentTenantId)
      || ts.find(t => t.racks > 0) || ts[0] || null;
  };

  live();                                   // 부팅 시 배지 초기화
})();
