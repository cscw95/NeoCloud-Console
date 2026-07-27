/* NeoCloud consoles — KO→EN translation dictionary (shared by all consoles).
 *
 * Loaded before shared/i18n.js. Two sections:
 *   dict     — exact full-string matches (trimmed). Highest priority.
 *   patterns — [regex, replacement] for strings containing numbers/ids that
 *              the exact map can't enumerate. `$1`.. refer to capture groups.
 *              Anchored (^…$) matches are matched against the trimmed string.
 *
 * Covers BOTH console-native UI strings and backend-surfaced Korean
 * (NOCP/emulator detail/event text rendered into the DOM). Agents append
 * per-console entries here; keep keys sorted-ish by console/screen for sanity.
 */
window.NC_I18N = window.NC_I18N || {};
window.NC_I18N.dict = Object.assign(window.NC_I18N.dict || {}, {
  // ── common shell (sidebar / topbar / footer) ──
  "관제 Overview": "Operations Overview",
  "자산 인벤토리 (CMDB)": "Asset Inventory (CMDB)",
  "용량 관리": "Capacity",
  "프로비저닝": "Provisioning",
  "전력 · 환경 (DCIM)": "Power · Environment (DCIM)",
  "네트워크 — IB · NVLink": "Network — IB · NVLink",
  "텔레메트리": "Telemetry",
  "인시던트": "Incidents",
  "성능 — SLA · MFU": "Performance — SLA · MFU",
  "보안 운영 · Sanitization": "Security Ops · Sanitization",
  "변경 · 유지보수 (CAB)": "Change · Maintenance (CAB)",
  "오케스트레이션": "Orchestration",
  "종합 상황판": "Overview Board",
  "대시보드": "Dashboard",
  "클러스터": "Clusters",
  "노드 · 인스턴스": "Nodes · Instances",
  "이미지 · 부트 설정": "Images · Boot Config",
  "스토리지": "Storage",
  "네트워크 · VPC": "Network · VPC",
  "모니터링": "Monitoring",
  "알림 · 이벤트": "Alerts · Events",
  "빌링 · 비용": "Billing · Cost",
  "지원 티켓": "Support Tickets",
  "보안 · 감사": "Security · Audit",
  "API · CLI · SDK": "API · CLI · SDK",
  "마켓플레이스": "Marketplace",
  "설정 — 조직 · 멤버 · 키": "Settings — Org · Members · Keys",
  "서비스 상태": "Service Status",
  "유지보수 모드": "Maintenance Mode",
  "알림": "Alerts",
  "검색 · 이동 · 실행": "Search · Navigate · Run",
  "읽기 전용": "Read-only",
  "권한 없음 — 다른 테넌트의 리소스입니다": "Access denied — resource belongs to another tenant",
});
window.NC_I18N.patterns = (window.NC_I18N.patterns || []).concat([
  // interpolated examples — extended per console in Phase B
  [/^전체 (\d[\d,]*)랙$/, "$1 racks total"],
  [/^할당 랙 (\d+)개$/, "$1 racks allocated"],
]);
