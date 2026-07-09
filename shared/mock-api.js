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
        node_state: "복구 중" },
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
  };

  /* 규모 상수 헬퍼 (동기) — KPI 밴드 등에서 즉시 사용 */
  NC.CONST = clone(DB.scale);
})();
