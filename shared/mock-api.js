/* NeoCloud 콘솔 공용 mock API — handoff README "데이터 시나리오" 표 기준.
   3개 콘솔이 같은 데이터셋을 공유해 시나리오 일관성을 보장한다.
   실구현 시 이 파일만 REST 바인딩으로 교체 (모든 getter는 Promise). */
(function () {
  const NC = (window.NC = window.NC || {});

  /* ── 시나리오 데이터셋 (규모 상수 + 6개 흐름) ─────────────── */
  const DB = {
    scale: {
      sites: [
        { id: "gasan", name: "STT 가산", racks: 36, region: "Seoul" },
        { id: "ansan", name: "IGIS 안산", racks: 104, region: "Ansan" },
      ],
      racks_total: 140, gpus_total: 10080, gpu_per_rack: 72,
      mrr_usd: 36700000,
    },
    tenants: [
      { id: "fin-corp",  name: "fin-corp",  racks: 32, site: "ansan",
        clusters: 2, contract: "active",  pkey: "0x8012" },
      { id: "acme-ai",   name: "acme-ai",   racks: 16, site: "gasan",
        clusters: 1, contract: "renewal_d83", pkey: "0x8009" },
      { id: "beta-ai",   name: "beta-ai",   racks: 4,  site: "ansan",
        clusters: 1, contract: "active",  pkey: "0x8005" },
      { id: "gamma-labs", name: "gamma-labs", racks: 8, site: "ansan",
        clusters: 0, contract: "provisioning", pkey: "0x8014" },
    ],
    // ① gamma-labs 개통 ord-9 — 운영 승인 게이트 · P_Key 예약 · 비즈 "개통 중"
    provisioning: {
      id: "ord-9", tenant: "gamma-labs", racks: 8, su: "su-8",
      state: "approval_pending", gate: "프로비저닝 승인 게이트",
      pkey_reserved: "0x8014", requested_at: "2026-07-08 14:20",
    },
    // ② delta-corp 24랙 딜 — 용량 시뮬레이션 · 소프트 홀드 · 파이프라인 90%
    pipeline: [
      { id: "delta-corp", stage: "협상(90%)", prob: 90, racks: 24,
        mrr_usd: 6300000, hold: { sus: ["su-9", "su-10"], expires_d: 14 },
        state: "open", note: "용량 소프트 홀드 D-14 · 계약 전환 대기" },
      { id: "epsilon-ml", stage: "제안(60%)", prob: 60, racks: 8,
        mrr_usd: 2100000, state: "open" },
      { id: "zeta-fund",  stage: "리드(20%)", prob: 20, racks: 16,
        mrr_usd: 4200000, state: "open" },
    ],
    // ③ 증설 su-12·13 (32랙) — 발주 D-90 · 파트너 리드타임 12주
    expansion: {
      sus: ["su-12", "su-13"], racks: 32, order_d: 90, leadtime_w: 12,
      partner: "SK hynix · NVIDIA", state: "onboarding",
      steps: ["발주", "입고", "랙 실장", "케이블링", "번인", "인수시험"],
      step_now: 0,
    },
    // ④ INC-0412 — tray-11 GPU 장애 (고객 TCK-1204 · RMA · 정비 창 07-09)
    incidents: [
      { id: "INC-0412", sev: "P2", target: "su-5-rack-03 / tray-11",
        kind: "GPU XID 79 반복", state: "mitigating",
        tenant: "fin-corp", ticket: "TCK-1204", rma: "RMA-0088",
        window: "2026-07-09 02:00–04:00 KST",
        timeline: [
          ["07-08 13:42", "DCGM XID 79 감지 — tray-11 GPU4"],
          ["07-08 13:44", "자동 cordon · 워크로드 드레인"],
          ["07-08 14:05", "고객 티켓 TCK-1204 자동 연계"],
          ["07-08 15:30", "RMA-0088 발주 — 정비 창 07-09 02:00"],
        ] },
    ],
    tickets: [
      { id: "TCK-1204", tenant: "fin-corp", sev: "high", state: "open",
        subject: "su-5-rack-03 GPU 성능 저하", linked: "INC-0412",
        node_state: "복구 중", type: "tech", routed_to: "ops" },
      { id: "TCK-1198", tenant: "fin-corp", sev: "low", state: "resolved",
        subject: "스토리지 QoS 상향 (40→60GB/s)", linked: "",
        node_state: null, type: "change", change_scope: "in_contract",
        routed_to: "ops" },
    ],
    // ⑤ SAN-0691 — Sanitization 7단계 · 증명서
    sanitization: {
      id: "SAN-0691", tenant: "(전) omega-lab", racks: 4,
      steps: ["NVMe crypto-erase", "GPU HBM wipe", "시스템 메모리 소거",
              "TPM reset", "펌웨어 re-attestation", "BMC 자격증명 로테이션",
              "검증 리포트"],
      step_now: 5, cert_ready: false, pdf: "SAN-0691-cert.pdf",
    },
    // ⑥ acme-ai 갱신 D-83 — 계약 알림 · 플레이북
    contracts: [
      { id: "CT-2024-011", tenant: "fin-corp", kind: "Reserved 36개월",
        racks: 32, mrr_usd: 22400000, state: "active", renewal_d: 812 },
      { id: "CT-2025-004", tenant: "acme-ai", kind: "Reserved 24개월",
        racks: 16, mrr_usd: 11200000, state: "renewal", renewal_d: 83,
        playbook: "갱신 D-90 플레이북 — EBO 미팅·사용량 리뷰·확장 제안" },
      { id: "CT-2025-009", tenant: "beta-ai", kind: "On-demand",
        racks: 4, mrr_usd: 2800000, state: "active", renewal_d: null },
      { id: "CT-2026-003", tenant: "gamma-labs", kind: "Reserved 12개월",
        racks: 8, mrr_usd: 5600000, state: "provisioning",
        note: "개통 중 — ord-9 승인 게이트" },
    ],
    alerts: [
      { id: "AL-311", sev: "warn", msg: "su-5-rack-03 GPU 온도 상승",
        at: "07-08 13:41" },
      { id: "AL-312", sev: "warn", msg: "tray-11 cordon — 워크로드 재배치",
        at: "07-08 13:44" },
      { id: "AL-313", sev: "info", msg: "정비 창 예약 07-09 02:00 (2h)",
        at: "07-08 15:32" },
    ],
    // ⑦ CP-004 인수 검증 — PT 리포트 완료 · 고객 승인 대기 (Deemed D-3)
    acceptance: {
      order: { id: "ord-accept-demo", tenant: "fin-corp", tenant_id: "fin-corp",
        racks: 4, blueprint_key: "vr-nvl72", state: "acceptance",
        managed_k8s: false },
      status: "pending",              // pending | approved | rejected | deemed
      report: {
        nodes_tested: 72, report_ts: "2026-07-19 22:40",
        checks: [
          { name: "NCCL all-reduce (8노드)", status: "pass",
            value: "486 GB/s", detail: "기준 ≥460 GB/s" },
          { name: "NCCL all-to-all (풀랙)", status: "pass",
            value: "412 GB/s", detail: "기준 ≥400 GB/s" },
          { name: "fio 스토리지 대역폭", status: "pass",
            value: "162 GB/s", detail: "기준 ≥150 GB/s · NFSoRDMA" },
          { name: "GPU Burn-in 48h", status: "pass",
            value: "288/288 통과", detail: "ECC·XID 이상 없음" },
          { name: "전력·냉각 프로파일", status: "pass",
            value: "MaxQ 132kW/랙", detail: "설계 한계 이내" },
        ],
      },
      deemed_deadline:
        new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10),
      billing_start_date: null,
      reject_reason: null,
    },
    // ⑧ IF-08 Fulfillment 진행 데모 — 폴링마다 한 스테이지씩 진행
    fulfillment: {
      id: "ord-fulfill-demo", tenant: "fin-corp", tenant_id: "fin-corp",
      racks: 8, blueprint_key: "vr-nvl72", managed_k8s: true, seq: 3,
      stages: [
        ["received", "신규 개통 주문 접수 — vr-nvl72 × 8 rack"],
        ["validated", "policy: tenant/spec ok — 배치 결정 (NVL 도메인 무결성)"],
        ["reserved", "144 node(s) across 8 rack(s) — ReserveHost 완료"],
        ["provisioning", "테넌트 OS 배포 — cloud-init · UEFI 잠금 · 144 tray"],
        ["isolating", "네트워크·패브릭 격리 — VRF·L3VNI · IB P_Key enforced"],
        ["storage_binding", "VAST 볼륨 바인딩 — 4PB · 320GB/s QoS"],
        ["k8s_installing", "Managed K8s 설치 — NKD CP 3노드 · 애드온 구성"],
        ["acceptance", "Performance Test 완료 — 고객 인수 대기"],
      ],
    },
    // ⑨ CP-012 종료 워크플로우 — 요청 전 null · terminationStart로 생성
    termination: null,
    // ⑩ CP-011 서비스 상태 · RCA 보관함
    status: {
      components: [
        { name: "Compute (GPU 노드)", status: "operational",
          uptime_90d: 99.97 },
        { name: "GPU Fabric (NVLink · IB)", status: "operational",
          uptime_90d: 99.99 },
        { name: "Storage (VAST)", status: "degraded", uptime_90d: 99.95,
          note: "백업 풀 리밸런싱 지연 — QoS 영향 없음" },
        { name: "Network · VPC", status: "operational", uptime_90d: 99.98 },
        { name: "Portal · API", status: "operational", uptime_90d: 99.99 },
      ],
      incidents: [
        { id: "PINC-0207", sev: "P2", state: "monitoring",
          title: "VAST 백업 풀 지연 — 고객 QoS 영향 없음",
          started_at: "07-19 22:10",
          updates: [
            ["07-20 09:30", "리밸런싱 80% — 성능 정상 범위 복귀 중"],
            ["07-19 23:05", "원인 식별 — 백업 풀 리밸런싱 지연"],
            ["07-19 22:10", "감지 — 백업 스냅샷 지연 경보"],
          ] },
      ],
      history_90d: { availability_pct: 99.96, incidents_total: 4,
        maintenance: 2 },
    },
    rca: [
      { id: "RCA-2026-0612", incident: "INC-0355 (P1)",
        title: "su-4 리프 스위치 이중화 절체 실패", date: "2026-06-14",
        impact: "NVLink 대역 12% 저하 · 42분",
        root_cause: "스위치 펌웨어 버그 — LACP 타임아웃 경합",
        actions: "펌웨어 전 사이트 롤아웃 완료 · 절체 리허설 월 1회 정례화",
        status: "published" },
      { id: "RCA-2026-0528", incident: "INC-0341 (P2)",
        title: "VAST 메타데이터 노드 페일오버 지연", date: "2026-05-30",
        impact: "스토리지 지연 p99 +40ms · 18분",
        root_cause: "메타데이터 캐시 워밍 미흡 — 페일오버 후 콜드 스타트",
        actions: "캐시 프리워밍 자동화 · 페일오버 드릴 분기 1회",
        status: "published" },
    ],
    // ⑪ BP-006 월별 SLA 리포트 · Service Credit
    sla: {
      "2026-07": { month: "2026-07", availability_pct: 99.95,
        target_pct: 99.9, violated: false, downtime_min: 21,
        incidents: [
          { id: "INC-0412", desc: "tray-11 GPU 장애 (XID 79)",
            downtime_min: 21, mttr_min: 38 },
        ],
        credits: [] },
      "2026-06": { month: "2026-06", availability_pct: 99.82,
        target_pct: 99.9, violated: true, downtime_min: 79,
        incidents: [
          { id: "INC-0355", desc: "su-4 리프 스위치 절체 실패",
            downtime_min: 42, mttr_min: 42 },
          { id: "INC-0361", desc: "전력 이벤트 — su-5 부분 파워캡",
            downtime_min: 37, mttr_min: 55 },
        ],
        credits: [
          { id: "CR-2026-06-01", amount_usd: 120000, status: "applied",
            invoice: "INV-2026-07 (차기 조정)",
            note: "가용성 99.82% < 99.9% — 월 청구액 10% 크레딧" },
        ] },
      "2026-05": { month: "2026-05", availability_pct: 99.99,
        target_pct: 99.9, violated: false, downtime_min: 4,
        incidents: [], credits: [] },
    },
  };

  const delay = v => new Promise(r => setTimeout(() => r(v), 120));
  const clone = o => JSON.parse(JSON.stringify(o));

  /* ── 조회 API ─────────────────────────────────────────── */
  NC.api = {
    scale:        () => delay(clone(DB.scale)),
    tenants:      () => delay(clone(DB.tenants)),
    provisioning: () => delay(clone(DB.provisioning)),
    pipeline:     () => delay(clone(DB.pipeline)),
    expansion:    () => delay(clone(DB.expansion)),
    incidents:    () => delay(clone(DB.incidents)),
    tickets:      () => delay(clone(DB.tickets)),
    sanitization: () => delay(clone(DB.sanitization)),
    contracts:    () => delay(clone(DB.contracts)),
    alerts:       () => delay(clone(DB.alerts)),

    /* ── 액션 API — 낙관적 갱신 + 이벤트 버스 전파 ────────── */
    approveProvision() {                     // 운영: ord-9 승인
      DB.provisioning.state = "provisioning";
      DB.provisioning.gate = "승인 완료 — 베어메탈 배포 중";
      NC.bus.emit("provision.approved", clone(DB.provisioning));
      return delay({ ok: true, id: "ord-9" });
    },
    rejectProvision(reason) {
      DB.provisioning.state = "rejected";
      NC.bus.emit("provision.rejected", { id: "ord-9", reason });
      return delay({ ok: true });
    },
    convertDeal(id) {                        // 비즈: delta-corp 계약 전환
      const d = DB.pipeline.find(p => p.id === id);
      if (d) { d.state = "won"; d.stage = "수주(100%)"; d.prob = 100; }
      DB.contracts.push({ id: "CT-2026-007", tenant: id,
        kind: "Reserved 24개월", racks: d ? d.racks : 24,
        mrr_usd: d ? d.mrr_usd : 6300000, state: "provisioning",
        note: "소프트 홀드 su-9·10 → 확정 전환" });
      NC.bus.emit("deal.converted", { id });
      return delay({ ok: true });
    },
    resolveIncident(id) {                    // 운영: INC-0412 해결
      const i = DB.incidents.find(x => x.id === id);
      if (i) { i.state = "resolved";
        i.timeline.push(["07-09 04:05", "RMA 교체 완료 — 번인 통과, uncordon"]); }
      const t = DB.tickets.find(x => x.linked === id);
      if (t) { t.state = "resolved"; t.node_state = "정상"; }
      NC.bus.emit("incident.resolved", { id });
      return delay({ ok: true });
    },
    advanceSanitization() {                  // 운영: SAN 단계 진행/증명서
      const s = DB.sanitization;
      if (s.step_now < s.steps.length) s.step_now += 1;
      if (s.step_now >= s.steps.length) s.cert_ready = true;
      NC.bus.emit("sanitization.step", clone(s));
      return delay(clone(s));
    },
    reserveCapacity(id) {                    // 운영: 소프트 홀드 연장 등
      NC.bus.emit("capacity.hold", { id });
      return delay({ ok: true });
    },

    /* ══ 고객 콘솔 시나리오 갭 (CP-004 · IF-08 · CP-012 · CP-011 ·
       BP-006 · CP-016) — nocp 대응 엔드포인트 미가동 시 폴백 데이터 ══ */

    /* CP-004 인수 검증 — 승인 대기 주문 목록 + PT 리포트 + 승인/반려 */
    acceptanceOrders() {
      const a = DB.acceptance;
      return delay(a.status === "approved" ? [] : [clone(a.order)]);
    },
    acceptanceReport() {
      const a = DB.acceptance;
      // 기한 경과 시 Deemed Acceptance 자동 승인 시뮬레이션
      if (a.status === "pending" &&
          Date.parse(a.deemed_deadline + "T23:59:59") < Date.now()) {
        a.status = "deemed";
        a.billing_start_date = a.deemed_deadline;
      }
      return delay({ status: a.status, report: clone(a.report),
        deemed_deadline: a.deemed_deadline,
        billing_start_date: a.billing_start_date,
        reject_reason: a.reject_reason, _mock: true });
    },
    acceptanceDecision(orderId, body) {
      const a = DB.acceptance;
      body = body || {};
      if (body.decision === "approve") {
        a.status = "approved";
        a.billing_start_date = new Date().toISOString().slice(0, 10);
        NC.bus.emit("acceptance.approved", { order: orderId });
        return delay({ ok: true, status: "approved",
          billing_start_date: a.billing_start_date, _mock: true });
      }
      a.status = "rejected";
      a.reject_reason = body.reason || "";
      NC.bus.emit("acceptance.rejected", { order: orderId });
      return delay({ ok: true, status: "rejected", _mock: true });
    },

    /* IF-08 Fulfillment — 진행 중 주문 + /orders/{id}/flow 타임라인 */
    fulfillOrders() {
      const f = DB.fulfillment;
      const st = f.stages[Math.min(f.seq, f.stages.length - 1)][0];
      return delay([{ id: f.id, tenant_id: f.tenant, racks: f.racks,
        blueprint_key: f.blueprint_key, kind: "new", state: st,
        managed_k8s: f.managed_k8s }]);
    },
    orderFlow(id) {
      const f = DB.fulfillment;
      if (id === DB.acceptance.order.id) {   // 인수 대기 주문 — 전 단계 완료
        return delay({ order_id: id, state: "acceptance",
          racks: DB.acceptance.order.racks,
          stages: f.stages.map(s =>
            ({ state: s[0], detail: s[1], at: "" })) });
      }
      if (id !== f.id) return delay(null);
      if (f.seq < f.stages.length - 1) f.seq += 1;   // 폴링마다 진행
      const cur = f.stages.slice(0, f.seq + 1);
      return delay({ order_id: f.id, state: cur[cur.length - 1][0],
        racks: f.racks,
        stages: cur.map(s => ({ state: s[0], detail: s[1], at: "" })) });
    },

    /* CP-012 종료 워크플로우 — 요청서 → 백업 게이트(409) → Secure Erase →
       Wipe 증명서. terminationStatus() 폴링마다 소거 진행률 전진 */
    terminationStart(tid, body) {
      body = body || {};
      DB.termination = { tenant: tid, state: "awaiting_backup",
        reason: body.reason || "", backup_plan: body.backup_plan || "",
        allocation_id: body.allocation_id || null,
        checklist: { extracted: false, migrated: false, verified: false },
        phase: null, progress: 0, wipe_step: 0,
        wipe_certificate: null, requested_at:
          new Date().toISOString().slice(0, 16).replace("T", " "),
        _mock: true };
      NC.bus.emit("termination.started", clone(DB.termination));
      return delay(clone(DB.termination));
    },
    terminationBackupConfirm(tid, checklist) {
      const t = DB.termination;
      if (!t) return delay({ error: "종료 요청이 없습니다", status: 404 });
      const c = checklist || {};
      const all = c.extracted && c.migrated && c.verified;
      if (!all)                              // 백엔드 409 시맨틱 재현
        return delay({ error: "백업 확인 미완료 — 데이터 추출·이관·백업 검증 " +
          "3개 항목이 모두 확인되기 전에는 시스템이 종료를 차단합니다",
          status: 409, _mock: true });
      t.checklist = { extracted: true, migrated: true, verified: true };
      t.state = "erasing"; t.phase = "drain"; t.progress = 4;
      NC.bus.emit("termination.erasing", clone(t));
      return delay(clone(t));
    },
    terminationStatus() {
      const t = DB.termination;
      if (!t) return delay(null);
      if (t.state === "erasing") {           // drain → release → 7단계 소거
        t.progress = Math.min(100, t.progress + 12);
        t.phase = t.progress < 15 ? "drain"
          : t.progress < 30 ? "release" : "secure_erase";
        t.wipe_step = t.progress < 30 ? 0
          : Math.min(7, Math.ceil((t.progress - 30) / 10));
        if (t.progress >= 100) {
          t.state = "wiped"; t.wipe_step = 7;
          t.wipe_certificate = { cert_id: "WIPE-2026-0720-01",
            sha256: "3f9a1c77b2e04d8f6a5c9e21d47b830fa1e6c2d94b7f5a08c3d1e6f2a9b4c7d0",
            method: "NIST SP 800-88 Purge — NVMe crypto-erase · HBM wipe · " +
              "TPM reset 포함 7단계",
            issued_at: new Date().toISOString().slice(0, 16)
              .replace("T", " ") };
          NC.bus.emit("termination.wiped", clone(t));
        }
      }
      return delay(clone(t));
    },
    terminationCert() {
      const t = DB.termination;
      return delay(t && t.wipe_certificate ? clone(t.wipe_certificate) : null);
    },

    /* CP-011 서비스 상태 · RCA — 플랫폼 상태 보드 (mock 스냅샷) */
    serviceStatus: () => delay(clone(DB.status)),
    rcaReports:    () => delay(clone(DB.rca)),

    /* BP-006 월별 SLA 리포트 · Service Credit */
    slaReport(tid, month) {
      const m = month || "2026-07";
      return delay(DB.sla[m] ? clone(DB.sla[m]) : null);
    },

    /* CP-016 공개 문의 (contact) — 오프라인 데모 접수 */
    publicInquiry(body) {
      const id = "INQ-2026-" +
        String(Math.floor(1000 + Math.random() * 9000));
      NC.bus.emit("inquiry.created", { id, body });
      return delay({ ok: true, id,
        note: "영업 담당자 배정 후 1영업일 내 연락 (데모 접수)", _mock: true });
    },
  };

  /* 규모 상수 헬퍼 (동기) — KPI 밴드 등에서 즉시 사용 */
  NC.CONST = clone(DB.scale);
})();
