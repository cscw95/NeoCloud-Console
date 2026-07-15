/* 자동 생성 — ops/build-mk8s-inline.py (원본: managed-k8s.html) · 수동 편집 금지
   iframe 없이 콘솔에 인라인 통합: 내부 라우터(App.state.route), #mk8s-root 스코프 */

'use strict';
/* ============================================================
 * NEOCLOUD_DATA — 목업 전역 데이터 (추후 API 응답 스키마 초안)
 * 가정: Vera Rubin NVL72 · 테넌트 5 × 100랙 (랙 = 18 tray × 4 GPU = 72 GPU)
 * 오늘: 2026-07-09
 * ============================================================ */

/* ---------- 시드 RNG ---------- */
function hashStr(s){ let h=1779033703; for(let i=0;i<s.length;i++){ h=Math.imul(h^s.charCodeAt(i),3432918353); h=(h<<13)|(h>>>19);} return h>>>0; }
function mulberry32(seed){ return function(){ seed|=0; seed=(seed+0x6D2B79F5)|0; let t=Math.imul(seed^(seed>>>15),1|seed); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; }

const NEOCLOUD_DATA = {};

/* ---------- 테넌트 ---------- */
NEOCLOUD_DATA.tenants = [
  { id:'tenant-alpha',  short:'a', company:'CLAUDE',        workload:'vLLM 추론 서비스',        lifecycle:'Active',      day:2, racks:100, gpus:7200,
    k8sVersion:'v1.32.4', nkdVersion:'NKD 25.06', zone:'AIDC-1 / Zone A', vpc:'vpc-alpha-01',
    domainSuffix:'claude.neocloud.skt.com', f5Partition:'part-alpha · route-domain 101',
    apiEndpoint:'k8s-alpha.api.neocloud.skt.com:6443', allowlist:['211.45.112.0/24','13.209.88.14/32'],
    nsList:['default','slurm','dynamo'], since:'2026-03-12', hotSpareTrays:4, note:null,
    dynamoDGDs:[ {name:'chat-maverick', mode:'P/D 분리 (prefill 8 · decode 16)'}, {name:'embed-bge', mode:'hybrid (22 worker)'} ] },
  { id:'tenant-beta',   short:'b', company:'OpenAI',     workload:'LLM Pretraining (학습)',   lifecycle:'Provisioned', day:1, racks:100, gpus:7200,
    k8sVersion:'v1.33.2', nkdVersion:'NKD 25.06', zone:'AIDC-1 / Zone B', vpc:'vpc-beta-01',
    domainSuffix:'openai.neocloud.skt.com', f5Partition:'part-beta · route-domain 102',
    apiEndpoint:'k8s-beta.api.neocloud.skt.com:6443', allowlist:['147.6.90.0/24'],
    nsList:['default','slurm','dynamo'], since:null, hotSpareTrays:4, note:'설치 진행 중 (batch 11/17)' },
  { id:'tenant-gamma',  short:'g', company:'Google',     workload:'사내 LLM (검토 단계)',     lifecycle:'Requested',   day:0, racks:100, gpus:7200,
    k8sVersion:'-', nkdVersion:'-', zone:'AIDC-1 / Zone C (예정)', vpc:'-',
    domainSuffix:'google.neocloud.skt.com', f5Partition:'-',
    apiEndpoint:'-', allowlist:[],
    nsList:['default','slurm','dynamo'], since:null, hotSpareTrays:4, note:'설치 요청 승인 대기' },
  { id:'tenant-delta',  short:'d', company:'Meta',         workload:'PoC 종료 — 반납 진행',     lifecycle:'Retired',     day:2, racks:100, gpus:7200,
    k8sVersion:'v1.31.9', nkdVersion:'NKD 24.12', zone:'AIDC-1 / Zone A', vpc:'vpc-delta-01',
    domainSuffix:'meta.neocloud.skt.com', f5Partition:'part-delta · route-domain 104',
    apiEndpoint:'(회수됨)', allowlist:[],
    nsList:['default'], since:'2025-11-20', hotSpareTrays:0, note:'Secure Wipe 41% 진행 중' },
  { id:'tenant-epsilon',short:'e', company:'SKHynix',   workload:'Foundation Model 학습 (Slurm)', lifecycle:'Active', day:2, racks:100, gpus:7200,
    k8sVersion:'v1.32.4', nkdVersion:'NKD 25.06', zone:'AIDC-1 / Zone D', vpc:'vpc-eps-01',
    domainSuffix:'skhynix.neocloud.skt.com', f5Partition:'part-eps · route-domain 105',
    apiEndpoint:'k8s-eps.api.neocloud.skt.com:6443', allowlist:['203.255.14.0/24','52.78.201.9/32'],
    nsList:['default','slurm','dynamo'], since:'2026-01-28', hotSpareTrays:4, note:null },
];
NEOCLOUD_DATA.tenant = id => NEOCLOUD_DATA.tenants.find(t=>t.id===id);
NEOCLOUD_DATA.systemNs = ['kube-system','monitoring','gpu-operator','network-operator','csi-provisioner'];
NEOCLOUD_DATA.lifecycleSteps = ['Requested','Approved','Reserved','Provisioned','Ready','Active','Healthy','Retired'];

/* ---------- 요청 (사업포탈 연동) ---------- */
NEOCLOUD_DATA.requests = [
  { id:'REQ-2607-014', tenantId:'tenant-gamma', kind:'설치', title:'Managed K8S 신규 설치', status:'접수대기',
    racks:100, gpuModel:'Vera Rubin NVL72', k8sVersion:'v1.33.2', wantDate:'2026-08-01', from:'Biz. 포털', createdAt:'2026-07-08 16:41',
    specSummary:'VR NVL72 × 100랙 · CP 3식 · Hot Spare 4 tray · VAST CSI(GDS) · ingress-nginx + external-dns',
    availability:{ ok:true, detail:'Zone C 가용 128랙 ≥ 요청 100랙 · 동일 Fabric 배치 가능 · F5 partition 여유 6' } },
  { id:'REQ-2606-087', tenantId:'tenant-gamma', kind:'견적', title:'DR존 추가 구성 견적 검토', status:'검토중',
    reviewer:'younghoon.jo@sk.com', reviewStartedAt:'2026-06-28 09:30',
    racks:20, gpuModel:'Vera Rubin NVL72', k8sVersion:'v1.33.2', wantDate:'2026-10-01', from:'Biz. 포털', createdAt:'2026-06-27 10:22',
    specSummary:'Zone D DR 용도 20랙 · Async 복제 요건 협의 중',
    availability:{ ok:false, detail:'Zone D 가용 12랙 < 요청 20랙 — 8월 증설분 반영 시 가능' } },
  { id:'REQ-2606-052', tenantId:'tenant-beta', kind:'설치', title:'Managed K8S 신규 설치', status:'진행중',
    reviewer:'dan.park@sk.com', reviewStartedAt:'2026-06-19 10:00',
    racks:100, gpuModel:'Vera Rubin NVL72', k8sVersion:'v1.33.2', wantDate:'2026-07-15', from:'Biz. 포털', createdAt:'2026-06-18 09:12',
    specSummary:'VR NVL72 × 100랙 · Slurm(SUNK) 포함 · WEKA CSI · 학습 전용(외부노출 최소)',
    availability:{ ok:true, detail:'Zone B 배치 확정 (2026-06-20 승인)' } },
  { id:'REQ-2607-002', tenantId:'tenant-delta', kind:'반납', title:'서비스 해지 · 자원 반납', status:'진행중',
    reviewer:'younghoon.jo@sk.com', reviewStartedAt:'2026-07-02 15:00',
    racks:100, gpuModel:'Vera Rubin NVL72', k8sVersion:'v1.31.9', wantDate:'2026-07-20', from:'Biz. 포털', createdAt:'2026-07-02 14:05',
    specSummary:'PoC 계약 만료 · kubeconfig 전량 회수 완료 · Secure Erase 후 Pool 복귀',
    availability:{ ok:true, detail:'반납 절차 진행 중 — wipe 41%' } },
  { id:'REQ-2603-004', tenantId:'tenant-alpha', kind:'설치', title:'Managed K8S 신규 설치', status:'개통완료',
    racks:100, gpuModel:'Vera Rubin NVL72', k8sVersion:'v1.32.1', wantDate:'2026-03-10', from:'Biz. 포털', createdAt:'2026-02-20 11:30',
    specSummary:'추론 서비스용 · External LB 2 VIP · 와일드카드 DNS', availability:{ ok:true, detail:'2026-03-12 개통' } },
  { id:'REQ-2601-017', tenantId:'tenant-epsilon', kind:'설치', title:'Managed K8S 신규 설치', status:'개통완료',
    racks:100, gpuModel:'Vera Rubin NVL72', k8sVersion:'v1.31.6', wantDate:'2026-01-25', from:'Biz. 포털', createdAt:'2026-01-05 15:47',
    specSummary:'Slurm 대규모 학습 · GDS 필수 · NCCL 성능 SLA 포함', availability:{ ok:true, detail:'2026-01-28 개통' } },
];

/* ---------- 진행 작업 ---------- */
NEOCLOUD_DATA.jobs = [
  { id:'JOB-1182', type:'install', tenantId:'tenant-beta', title:'클러스터 설치 — OpenAI', progress:62,
    currentStage:'애드온 설치 (batch 11/17)', startedAt:'2026-07-06 09:00', racksDone:62,
    stages:[
      {name:'BM 준비 (100랙 인벤토리·펌웨어)', status:'done',  at:'2026-07-06 09:00'},
      {name:'NKD 클러스터 설치 (CP 3식 + Worker join)', status:'done',  at:'2026-07-07 03:20'},
      {name:'애드온 설치 (CSI·GPU Operator·NVSentinel·모니터링)', status:'now', at:'2026-07-08 11:45'},
      {name:'NS/RBAC 구성 (default/slurm/dynamo + 템플릿)', status:'pending', at:null},
      {name:'Acceptance 검증 (NCCL/DCGM/Storage)', status:'pending', at:null},
    ] },
  { id:'JOB-1179', type:'upgrade', tenantId:'tenant-alpha', title:'K8s 업그레이드 v1.32.4 → v1.33.2', progress:0,
    currentStage:'Maintenance Window 예약됨 (07-16 02:00)', startedAt:null, racksDone:0,
    stages:[
      {name:'Control Plane 업그레이드 (무중단)', status:'pending', at:null},
      {name:'Worker 롤링 (cordon→drain→upgrade)', status:'pending', at:null},
      {name:'애드온 호환성 검증', status:'pending', at:null},
    ] },
  { id:'JOB-1175', type:'retire', tenantId:'tenant-delta', title:'반납 — Secure Erase & 자원 회수', progress:41,
    currentStage:'Secure Erase (rack 41/100)', startedAt:'2026-07-03 08:00', racksDone:41,
    stages:[
      {name:'kubeconfig 전량 회수 · RBAC 제거', status:'done', at:'2026-07-03 08:10'},
      {name:'클러스터 삭제 (NKD teardown)', status:'done', at:'2026-07-03 17:40'},
      {name:'Secure Erase (NVMe crypto-erase + 검증)', status:'now', at:'2026-07-04 06:00'},
      {name:'진단·Burn-in 후 Pool 복귀', status:'pending', at:null},
    ] },
];

/* ---------- External LB (F5) ---------- */
NEOCLOUD_DATA.lbVips = [
  { id:'vip-alpha-ingress', tenantId:'tenant-alpha', vip:'211.234.100.17', ports:'443, 80 (TCP)', type:'공유 Ingress (L4 passthrough)',
    boundSvc:'ingress-nginx/ingress-nginx-controller', partition:'part-alpha', health:'healthy',
    poolMembers:[
      {node:'vr72-a-003-t02', ep:'10.10.3.12:31443', state:'up'},
      {node:'vr72-a-021-t11', ep:'10.10.21.61:31443', state:'up'},
      {node:'vr72-a-047-t05', ep:'10.10.47.25:31443', state:'up'},
      {node:'vr72-a-088-t14', ep:'10.10.88.74:31443', state:'up'},
    ],
    note:'externalTrafficPolicy: Local — ingress Pod 배치 노드만 pool 등록', tpGbps:[38,42,51,47,55,62,58,64,71,66,74,69] },
  { id:'vip-alpha-grpc', tenantId:'tenant-alpha', vip:'211.234.100.23', ports:'9000 (TCP)', type:'전용 VIP (non-HTTP · gRPC)',
    boundSvc:'default/triton-grpc', partition:'part-alpha', health:'degraded',
    poolMembers:[
      {node:'vr72-a-012-t03', ep:'10.10.12.13:30900', state:'up'},
      {node:'vr72-a-034-t09', ep:'10.10.34.49:30900', state:'up'},
      {node:'vr72-a-034-t10', ep:'10.10.34.50:30900', state:'down'},
      {node:'vr72-a-056-t01', ep:'10.10.56.11:30900', state:'up'},
    ],
    note:'Service type=LoadBalancer 전용 IP — 공인 IPv4 1개 소비 (과금 연계)', tpGbps:[12,14,11,16,18,15,19,22,17,21,24,20] },
  { id:'vip-eps-ingress', tenantId:'tenant-epsilon', vip:'211.234.100.31', ports:'443 (TCP)', type:'공유 Ingress (L4 passthrough)',
    boundSvc:'ingress-nginx/ingress-nginx-controller', partition:'part-eps', health:'healthy',
    poolMembers:[
      {node:'vr72-e-009-t07', ep:'10.14.9.37:31443', state:'up'},
      {node:'vr72-e-041-t02', ep:'10.14.41.12:31443', state:'up'},
    ],
    note:'학습 테넌트 — 관리/실험 UI 노출용 최소 구성', tpGbps:[2,3,2,4,3,5,4,3,6,4,5,3] },
];

/* ---------- Service type=LoadBalancer 감지 현황 ----------
 * phase: detected → ensure(EnsureLoadBalancer) → assigned → writeback(완료) */
NEOCLOUD_DATA.lbServices = [
  { tenantId:'tenant-alpha', ns:'ingress-nginx', name:'ingress-nginx-controller', ports:'443:31443/TCP, 80:31080/TCP',
    phase:'writeback', vip:'211.234.100.17', createdAt:'2026-03-12 10:02', annotation:'neocloud.skt.com/lb-type: public' },
  { tenantId:'tenant-alpha', ns:'default', name:'triton-grpc', ports:'9000:30900/TCP',
    phase:'writeback', vip:'211.234.100.23', createdAt:'2026-04-03 15:26', annotation:'neocloud.skt.com/lb-type: public' },
  { tenantId:'tenant-alpha', ns:'dynamo', name:'dynamo-frontend', ports:'8080:31280/TCP',
    phase:'ensure', vip:null, createdAt:'2026-07-09 09:47', annotation:'neocloud.skt.com/lb-type: public' },
  { tenantId:'tenant-epsilon', ns:'ingress-nginx', name:'ingress-nginx-controller', ports:'443:31443/TCP',
    phase:'writeback', vip:'211.234.100.31', createdAt:'2026-01-28 11:15', annotation:'neocloud.skt.com/lb-type: public' },
];

/* ---------- DNS (ExternalDNS) ---------- */
NEOCLOUD_DATA.dnsRecords = [
  { tenantId:'tenant-alpha', fqdn:'*.claude.neocloud.skt.com', type:'A', target:'211.234.100.17', ttl:300,
    source:'온보딩 와일드카드 (1회 등록)' },
  { tenantId:'tenant-alpha', fqdn:'grpc.claude.neocloud.skt.com', type:'A', target:'211.234.100.23', ttl:300,
    source:'Service: default/triton-grpc' },
  { tenantId:'tenant-alpha', fqdn:'grpc.claude.neocloud.skt.com', type:'TXT', target:'"heritage=external-dns,external-dns/owner=neocloud-alpha,external-dns/resource=service/default/triton-grpc"', ttl:300,
    source:'TXT registry (소유권)' },
  { tenantId:'tenant-epsilon', fqdn:'*.skhynix.neocloud.skt.com', type:'A', target:'211.234.100.31', ttl:300,
    source:'온보딩 와일드카드 (1회 등록)' },
];
NEOCLOUD_DATA.dnsPolicy = {
  provider:'AWS Route53 (zone: neocloud.skt.com)',
  flags:['--source=service --source=ingress --source=crd','--domain-filter=<tenant>.neocloud.skt.com','--policy=upsert-only','--txt-owner-id=neocloud-<tenant>'],
  gate:'자체 컨트롤러가 정책 검사 후 DNSEndpoint CRD 발행 → ExternalDNS는 CRD만 등록 (사용자 리소스 직접 미연동)',
  admission:'Kyverno: Ingress host가 *.<tenant>.neocloud.skt.com 패턴이 아니면 생성 거부',
};

/* ---------- Ingress / cert-manager ---------- */
NEOCLOUD_DATA.ingressControllers = [
  { tenantId:'tenant-alpha', name:'ingress-nginx', cls:'nginx', replicas:'4 / HPA 2–8', vip:'211.234.100.17', version:'1.13.1' },
  { tenantId:'tenant-epsilon', name:'ingress-nginx', cls:'nginx', replicas:'2 / HPA 2–4', vip:'211.234.100.31', version:'1.13.1' },
];
NEOCLOUD_DATA.ingresses = [
  { tenantId:'tenant-alpha', ns:'default', name:'chat-web', host:'chat.claude.neocloud.skt.com', path:'/', backend:'chat-web:80', tls:'wildcard-claude-tls' },
  { tenantId:'tenant-alpha', ns:'default', name:'vllm-api', host:'api.claude.neocloud.skt.com', path:'/v1', backend:'vllm-api:8000', tls:'api-claude-tls' },
  { tenantId:'tenant-alpha', ns:'dynamo', name:'dynamo-console', host:'console.claude.neocloud.skt.com', path:'/', backend:'dynamo-console:3000', tls:'wildcard-claude-tls' },
  { tenantId:'tenant-epsilon', ns:'slurm', name:'mlflow', host:'mlflow.skhynix.neocloud.skt.com', path:'/', backend:'mlflow:5000', tls:'wildcard-skhynix-tls' },
];
NEOCLOUD_DATA.certs = [
  { tenantId:'tenant-alpha', name:'wildcard-claude-tls', cn:'*.claude.neocloud.skt.com', issuer:'lets-encrypt-dns01', notAfter:'2026-09-07', daysLeft:60 },
  { tenantId:'tenant-alpha', name:'api-claude-tls', cn:'api.claude.neocloud.skt.com', issuer:'lets-encrypt-dns01', notAfter:'2026-07-21', daysLeft:12 },
  { tenantId:'tenant-epsilon', name:'wildcard-skhynix-tls', cn:'*.skhynix.neocloud.skt.com', issuer:'lets-encrypt-dns01', notAfter:'2026-10-02', daysLeft:85 },
];

/* ---------- kubeconfig (Vault PKI) ---------- */
/* nsScope: tenant-user는 발급 시 선택한 NS만 · operator/admin은 '전체' */
NEOCLOUD_DATA.kubeconfigs = [
  { user:'김도현', email:'dohyun.kim@claude.ai',  tenantId:'tenant-alpha', role:'tenant-user',     nsScope:['default'], serial:'5f:2a:91:c4:07:be', issuedAt:'2026-07-08 09:00', expiresAt:'2026-07-11 09:00', ttl:'72h', status:'active' },
  { user:'이서연', email:'seoyeon.lee@claude.ai', tenantId:'tenant-alpha', role:'tenant-operator', nsScope:'전체', serial:'8d:41:0c:aa:39:12', issuedAt:'2026-07-08 09:00', expiresAt:'2026-07-11 09:00', ttl:'72h', status:'active' },
  { user:'박민준', email:'minjun.park@claude.ai', tenantId:'tenant-alpha', role:'tenant-user',     nsScope:['dynamo'], serial:'2b:77:e3:15:c8:90', issuedAt:'2026-07-07 14:20', expiresAt:'2026-07-10 14:20', ttl:'72h', status:'active' },
  { user:'최수아', email:'sua.choi@claude.ai',    tenantId:'tenant-alpha', role:'tenant-user',     nsScope:['default','dynamo'], serial:'c1:09:5d:6f:24:e7', issuedAt:'2026-07-06 18:05', expiresAt:'2026-07-09 18:05', ttl:'72h', status:'expiring' },
  { user:'조영훈(NOC)', email:'younghoon.jo@sk.com', tenantId:'tenant-alpha', role:'skt-admin',      nsScope:'전체', serial:'77:be:12:38:a0:41', issuedAt:'2026-07-09 06:00', expiresAt:'2026-07-09 18:00', ttl:'12h', status:'active' },
  { user:'한지민', email:'jimin.han@skhynix.com',    tenantId:'tenant-epsilon', role:'tenant-operator', nsScope:'전체', serial:'19:c4:8e:52:b3:07', issuedAt:'2026-07-08 08:30', expiresAt:'2026-07-11 08:30', ttl:'72h', status:'active' },
  { user:'오세훈', email:'sehoon.oh@skhynix.com',    tenantId:'tenant-epsilon', role:'tenant-user',   nsScope:['slurm'], serial:'4a:d0:26:91:7c:35', issuedAt:'2026-07-08 08:30', expiresAt:'2026-07-11 08:30', ttl:'72h', status:'active' },
  { user:'배수진', email:'sujin.bae@skhynix.com',    tenantId:'tenant-epsilon', role:'tenant-user',   nsScope:['slurm'], serial:'e8:3f:b1:04:59:d2', issuedAt:'2026-07-08 08:30', expiresAt:'2026-07-11 08:30', ttl:'72h', status:'active' },
  { user:'권태양', email:'taeyang.kwon@skhynix.com', tenantId:'tenant-epsilon', role:'tenant-user',   nsScope:['slurm'], serial:'0d:65:aa:c7:18:4b', issuedAt:'2026-07-05 10:00', expiresAt:'2026-07-08 10:00', ttl:'72h', status:'expired' },
  { user:'전PoC팀(3명)', email:'poc@meta.com',      tenantId:'tenant-delta', role:'tenant-user',     nsScope:['default'], serial:'(일괄 회수)', issuedAt:'2025-11-20 00:00', expiresAt:'2026-07-03 08:10', ttl:'72h', status:'revoked' },
];

NEOCLOUD_DATA.rbacRoles = [
  { id:'skt-admin', label:'SKT Admin', group:'skt-admin', bindingKind:'ClusterRoleBinding',
    scope:'클러스터 전체 — 테넌트 NS는 조회(R), Control Node·System NS는 CRUD',
    rules:[
      { apiGroups:['*'], resources:['*'], verbs:['get','list','watch'], where:'클러스터 전체' },
      { apiGroups:['*'], resources:['*'], verbs:['*'], where:'kube-system · monitoring · gpu-operator · network-operator · csi-provisioner' },
    ]},
  { id:'tenant-operator', label:'Tenant-operator', group:'tenant-operator', bindingKind:'RoleBinding (테넌트 NS 전체) + nodes-reader',
    scope:'테넌트 소유 NS 전체 (default / slurm / dynamo) — CRUD · nodes 조회(R)',
    rules:[
      { apiGroups:['"" · apps · batch · networking.k8s.io'], resources:['pods','pods/log','deployments','jobs','services','ingresses','configmaps','secrets','persistentvolumeclaims'], verbs:['*'], where:'default · slurm · dynamo (전체)' },
      { apiGroups:['""'], resources:['nodes','nodes/status'], verbs:['get','list','watch'], where:'클러스터 스코프 (전용 클러스터라 안전)' },
    ]},
  { id:'tenant-user', label:'Tenant-user', group:'tenant-user-<ns>', bindingKind:'RoleBinding (발급 시 선택한 NS만) + nodes-reader',
    scope:'발급 시 선택한 NS만 CRUD (예: dynamo만, slurm만) · nodes 조회(R)',
    rules:[
      { apiGroups:['"" · apps · batch · networking.k8s.io'], resources:['pods','pods/log','deployments','jobs','services','ingresses','configmaps','secrets','persistentvolumeclaims'], verbs:['*'], where:'선택 NS만 (인증서 O=tenant-user-<ns> 그룹별 바인딩)' },
      { apiGroups:['""'], resources:['nodes','nodes/status'], verbs:['get','list','watch'], where:'클러스터 스코프 (전용 클러스터라 안전)' },
    ]},
];

/* ---------- 업그레이드 / CVE ---------- */
NEOCLOUD_DATA.upgrades = [
  { tenantId:'tenant-alpha', current:'v1.32.4', target:'v1.33.2', nkdTarget:'NKD 25.06.2',
    window:'2026-07-16 02:00 – 06:00 KST', status:'예약됨', approvedBy:'고객 협의 완료 (07-04)',
    plan:'CP 3식 무중단 선행 → Worker 100랙 롤링 (동시 5랙, PDB 존중)' },
  { tenantId:'tenant-epsilon', current:'v1.32.4', target:null, nkdTarget:null, window:null, status:'계획 미수립', approvedBy:null, plan:null },
  { tenantId:'tenant-beta', current:'v1.33.2', target:null, nkdTarget:null, window:null, status:'최신 (설치 중)', approvedBy:null, plan:null },
];
NEOCLOUD_DATA.cves = [
  { id:'CVE-2026-32871', comp:'containerd 2.1.x', sev:'Critical', cvss:9.8, desc:'컨테이너 탈출 — 호스트 권한 상승 가능', affected:['tenant-alpha','tenant-epsilon'], patch:'containerd 2.1.4 (NKD 25.06.2 포함)', due:'2026-07-16' },
  { id:'CVE-2026-1974',  comp:'ingress-nginx 1.13.x', sev:'High', cvss:8.1, desc:'Annotation 인젝션을 통한 설정 우회', affected:['tenant-alpha','tenant-epsilon'], patch:'ingress-nginx 1.13.2', due:'2026-07-23' },
  { id:'CVE-2025-7342',  comp:'runc 1.3.x', sev:'Medium', cvss:6.5, desc:'심볼릭 링크 처리 결함 (제한적 조건)', affected:['tenant-alpha','tenant-beta','tenant-epsilon'], patch:'runc 1.3.3', due:'2026-08-15' },
];

/* ---------- NVSentinel (v1.11 실물 스키마 기반 — /Users/1108779/NVSentinel 조사 반영) ----------
 * HealthEvent proto: agent/componentClass/checkName/errorCode/isFatal/recommendedAction
 * 상태머신 라벨: dgxc.nvidia.com/nvsentinel-state
 * healtheventstatus: nodeQuarantined / userPodsEvictionStatus / faultRemediated */
NEOCLOUD_DATA.sentinelEvents = [
  { id:'EVT-90412', tenantId:'tenant-alpha', sev:'critical', isFatal:true,
    agent:'syslog-health-monitor', componentClass:'GPU', checkName:'SysLogsGPUFallenOff', errorCode:['XID-79'],
    node:'vr72-a-017-t09', gpu:'GPU 2 (gpu_index=2)', at:'2026-07-09 06:12:31',
    msg:'GPU has fallen off the bus — hardware failure 의심',
    recommendedAction:'RESTART_BM', state:'draining',
    status:{ nodeQuarantined:'Quarantined', eviction:'InProgress (2/4 pods)', faultRemediated:false },
    remediation:[
      { step:'탐지 — syslog-health-monitor → health_events 기록', status:'done', at:'06:12:31', by:'NVSentinel' },
      { step:'quarantined — fault-quarantine CEL 룰 매칭 → cordon', status:'done', at:'06:12:38', by:'NVSentinel' },
      { step:'draining — node-drainer eviction (2/4 pods)', status:'now', at:'06:13:02', by:'NVSentinel' },
      { step:'remediating — RebootNode CRD 생성 → janitor 실행', status:'pending', at:null, by:'NVSentinel' },
      { step:'Hot spare tray 투입 (vr72-a-017-t18)', status:'pending', at:null, by:'자체 (NKD/Ansible — NVSentinel 범위 밖)' },
    ]},
  { id:'EVT-90398', tenantId:'tenant-alpha', sev:'warning', isFatal:false,
    agent:'gpu-health-monitor', componentClass:'GPU', checkName:'GpuThermalWatch', errorCode:['DCGM_FR_TEMP_VIOLATION'],
    node:'vr72-a-052-t04', gpu:'GPU 0', at:'2026-07-09 04:55:10',
    msg:'GPU 온도 89°C — throttle 임계 접근. non-fatal → condition 아닌 K8s Event(Warning)로 기록',
    recommendedAction:'NONE', state:null, status:null, remediation:null },
  { id:'EVT-90371', tenantId:'tenant-epsilon', sev:'warning', isFatal:false,
    agent:'syslog-health-monitor', componentClass:'NVSwitch', checkName:'SysLogsSXIDError', errorCode:['SXID-24007'],
    node:'vr72-e-063-t11', gpu:'NVLink 1↔3', at:'2026-07-08 22:17:44',
    msg:'NVLink replay error rate 상승 — 링크 품질 모니터링 중 (누적 시 fatal 전환 룰)',
    recommendedAction:'NONE', state:null, status:null, remediation:null },
  { id:'EVT-90350', tenantId:'tenant-alpha', sev:'info', isFatal:false,
    agent:'gpu-health-monitor', componentClass:'GPU', checkName:'GpuMemWatch', errorCode:['DCGM_FR_ECC_CORRECTABLE'],
    node:'vr72-a-088-t02', gpu:'GPU 3', at:'2026-07-08 15:03:29',
    msg:'Single-bit ECC corrected — 누적 임계 미달 (STORE_ONLY 관측 전용)',
    recommendedAction:'NONE', state:null, status:null, remediation:null },
  { id:'EVT-90344', tenantId:'tenant-epsilon', sev:'warning', isFatal:false,
    agent:'preflight', componentClass:'GPU', checkName:'preflight-nccl-allreduce', errorCode:['PREFLIGHT-FAIL'],
    node:'vr72-e-092-t16', gpu:'gang 16 GPU', at:'2026-07-08 13:40:00',
    msg:'스케줄 전 preflight allreduce 검증 실패 — 해당 Pod Init:Error 유지, 워크로드 미배치 (정상 시 이벤트 미발생)',
    recommendedAction:'RUN_FIELDDIAG', state:null, status:null, remediation:null },
];
NEOCLOUD_DATA.sentinelModules = {
  detection:[  /* 기본 설치가 켜두는 것 — 탐지/표시 전용 */
    { name:'gpu-health-monitor',    kind:'DaemonSet',  enabled:true,  desc:'DCGM 폴링 · dcgmerrorsmapping.csv 121종' },
    { name:'syslog-health-monitor', kind:'DaemonSet',  enabled:true,  desc:'XID/SXID/GPU fallen off (저널 감시)' },
    { name:'nic-health-monitor',    kind:'DaemonSet',  enabled:true,  desc:'NIC/RoCE 링크 상태' },
    { name:'health-events-analyzer',kind:'Deployment', enabled:false, desc:'패턴·상관 분석 (동일 랙 다중 실패 등)' },
  ],
  action:[  /* upstream 기본값은 전부 false — NeoCloud는 검증 후 활성 */
    { name:'fault-quarantine', enabled:true, dryRun:false, desc:'CEL ruleset 매칭 → cordon (+taint opt-in)' },
    { name:'node-drainer',     enabled:true, dryRun:false, desc:'NS별 전략 eviction · evictionTimeout 60s · partialDrain' },
    { name:'fault-remediation',enabled:true, dryRun:false, desc:'RecommendedAction → 유지보수 CRD 생성' },
    { name:'janitor + gpu-reset', enabled:true, dryRun:false, desc:'RebootNode/GPUReset CR 실행 (MTTR 계측)' },
  ],
  circuitBreaker:{ enabled:true, percentage:50, duration:'5m', status:'CLOSED', utilization:2 },
  preflight:{ enabled:true, optInNs:['slurm'], checks:['preflight-dcgm-diag (단일노드, 30s~15m)','preflight-nccl-loopback (NVLink/PCIe, ~5s)','preflight-nccl-allreduce (멀티노드 gang, ~30s)'] },
};
/* Hot spare 자동 투입 = NVSentinel 기능 아님 — 자체 개발 (NKD/NKE + Ansible, plan_r10) */
NEOCLOUD_DATA.hotSpare=[ {tenantId:'tenant-alpha', total:4, used:0}, {tenantId:'tenant-beta', total:4, used:0}, {tenantId:'tenant-epsilon', total:4, used:1} ];

/* ---------- 스토리지 (CSI / GDS) ---------- */
NEOCLOUD_DATA.storage = [
  { tenantId:'tenant-alpha', vendor:'VAST Data (csi.vastdata.com)', gds:true, capacityTB:2048, usedTB:1310,
    volumes:[
      { pvc:'model-weights', ns:'default', mode:'RWX', sizeTB:512, gds:true, sc:'vast-rwx-gds' },
      { pvc:'kv-cache-spill', ns:'default', mode:'RWO', sizeTB:128, gds:true, sc:'vast-rwo-gds' },
      { pvc:'dynamo-artifacts', ns:'dynamo', mode:'RWX', sizeTB:64, gds:false, sc:'vast-rwx' },
    ]},
  { tenantId:'tenant-beta', vendor:'WEKA (csi.weka.io)', gds:true, capacityTB:4096, usedTB:220,
    volumes:[ { pvc:'dataset-common-crawl', ns:'slurm', mode:'RWX', sizeTB:2048, gds:true, sc:'weka-rwx-gds' } ]},
  { tenantId:'tenant-epsilon', vendor:'VAST Data (csi.vastdata.com)', gds:true, capacityTB:8192, usedTB:6520,
    volumes:[
      { pvc:'pretrain-dataset-v4', ns:'slurm', mode:'RWX', sizeTB:4096, gds:true, sc:'vast-rwx-gds' },
      { pvc:'ckpt-store', ns:'slurm', mode:'RWX', sizeTB:2048, gds:true, sc:'vast-rwx-gds' },
      { pvc:'tensorboard-logs', ns:'slurm', mode:'RWX', sizeTB:32, gds:false, sc:'vast-rwx' },
    ]},
  { tenantId:'tenant-delta', vendor:'VAST Data (csi.vastdata.com)', gds:false, capacityTB:512, usedTB:0,
    volumes:[] },
];

/* ---------- 로그 원본 (스트리밍 재료) ---------- */
NEOCLOUD_DATA.logs = {
  vllm:[
    "INFO 07-09 10:42:01 [api_server.py:212] vLLM API server version 0.9.2",
    "INFO 07-09 10:42:01 [config.py:542] model='meta-llama/Llama-4-Maverick-17B-128E-Instruct', tensor_parallel_size=8, dtype=bfloat16",
    "INFO 07-09 10:42:03 [distributed.py:96] NCCL backend initialized — 8 ranks on local NVL72 domain",
    "INFO 07-09 10:42:18 [model_runner.py:1024] Loading model weights: 34.2 GiB (safetensors, GDS direct read)",
    "INFO 07-09 10:42:55 [gpu_executor.py:78] # GPU blocks: 27648, # CPU blocks: 8192 (KV cache 41.8 GiB)",
    "INFO 07-09 10:43:02 [api_server.py:245] Started server process — listening on http://0.0.0.0:8000",
    "INFO:     10.244.3.17:48122 - \"POST /v1/chat/completions HTTP/1.1\" 200 OK",
    "INFO 07-09 10:43:19 [metrics.py:341] Avg prompt throughput: 8412.3 tokens/s, Avg generation throughput: 1893.6 tokens/s",
    "INFO:     10.244.3.17:48166 - \"POST /v1/chat/completions HTTP/1.1\" 200 OK",
    "INFO:     10.244.8.51:39004 - \"POST /v1/embeddings HTTP/1.1\" 200 OK",
    "INFO 07-09 10:43:34 [metrics.py:341] Running: 47 reqs, Waiting: 3 reqs, GPU KV cache usage: 61.2%",
    "INFO:     10.244.3.17:48201 - \"POST /v1/chat/completions HTTP/1.1\" 200 OK",
    "WARNING 07-09 10:43:41 [scheduler.py:1188] Sequence group cmpl-88f2 preempted — KV cache pressure (recompute)",
    "INFO:     10.244.6.20:52310 - \"GET /v1/models HTTP/1.1\" 200 OK",
    "INFO 07-09 10:43:49 [metrics.py:341] Avg prompt throughput: 9107.8 tokens/s, Avg generation throughput: 2011.4 tokens/s",
    "INFO:     10.244.3.17:48244 - \"POST /v1/chat/completions HTTP/1.1\" 200 OK",
    "INFO:     10.244.9.33:41276 - \"POST /v1/chat/completions HTTP/1.1\" 200 OK",
    "INFO 07-09 10:44:04 [metrics.py:341] Running: 52 reqs, Waiting: 0 reqs, GPU KV cache usage: 58.7%",
  ],
  nccl:[
    "vr72-e-014-t03:214:214 [0] NCCL INFO Bootstrap : Using ens1f0np0:10.14.14.13<0>",
    "vr72-e-014-t03:214:214 [0] NCCL INFO NET/IB : Using [0]mlx5_0:1/RoCE [1]mlx5_1:1/RoCE ; OOB ens1f0np0",
    "vr72-e-014-t03:214:214 [0] NCCL INFO Using network IBext_v9",
    "vr72-e-014-t03:214:290 [0] NCCL INFO NVLS multicast support is available on 72 GPUs (NVL72 domain)",
    "vr72-e-014-t03:214:290 [0] NCCL INFO Channel 00/24 : 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15",
    "vr72-e-014-t03:214:290 [0] NCCL INFO Connected all rings, use NVLS for allreduce",
    "vr72-e-014-t03:214:290 [0] NCCL INFO comm 0x5f8e2a0 rank 0 nranks 576 cudaDev 0 nvmlDev 0 busId 1b000 commId 0x8a412f - Init COMPLETE",
    "[train] epoch 12 step 48210 | loss 1.8342 | lr 2.4e-5 | grad_norm 0.87 | tokens/s/gpu 18,742",
    "[train] epoch 12 step 48220 | loss 1.8317 | lr 2.4e-5 | grad_norm 0.91 | tokens/s/gpu 18,801",
    "[ckpt] async checkpoint shard 114/576 written to /mnt/vast/ckpt-store/step-48000 (GDS, 4.2 GB/s)",
    "[train] epoch 12 step 48230 | loss 1.8290 | lr 2.4e-5 | grad_norm 0.84 | tokens/s/gpu 18,766",
    "vr72-e-014-t03:214:311 [2] NCCL INFO allreduce 512MiB busbw 486.1 GB/s (NVLS, in-network reduction)",
    "[train] epoch 12 step 48240 | loss 1.8265 | lr 2.4e-5 | grad_norm 0.89 | tokens/s/gpu 18,793",
  ],
  installer:[
    "[nkd] 11:45:02 PLAY [addon-install] ***********************************************",
    "[nkd] 11:45:04 TASK [csi : WEKA CSI driver DaemonSet 배포] ok: [batch-11]",
    "[nkd] 11:45:19 TASK [gpu-operator : NVIDIA GPU Operator v25.6 helm install] ok: [batch-11]",
    "[nkd] 11:45:47 TASK [gpu-operator : driver 580.82 + CUDA 13.1 rollout] changed: [vr72-b-061..066]",
    "[nkd] 11:46:30 TASK [nvsentinel : agent DaemonSet + drainer 배포] ok: [batch-11]",
    "[nkd] 11:47:12 TASK [monitoring : DCGM exporter + Prometheus remote-write 구성] ok: [batch-11]",
    "[nkd] 11:48:26 TASK [network-operator : RDMA shared device plugin] ok: [batch-11]",
    "[nkd] 11:49:15 INFO  batch 11/17 (rack vr72-b-061..066) addon install 완료 — 62/100 racks done",
    "[nkd] 11:49:16 INFO  다음 batch 12/17 시작 (rack vr72-b-067..072)",
    "[nkd] 11:49:21 TASK [csi : WEKA CSI driver DaemonSet 배포] ok: [batch-12]",
  ],
  wipe:[
    "[wipe] 09:12:40 rack vr72-d-041 tray 09: nvme format --ses=2 (crypto erase) /dev/nvme0n1 ... OK (3.2s)",
    "[wipe] 09:12:44 rack vr72-d-041 tray 09: nvme format --ses=2 /dev/nvme1n1 ... OK (3.1s)",
    "[wipe] 09:12:51 rack vr72-d-041 tray 09: verify pass — random sector read 0x00 confirmed (4096 samples)",
    "[wipe] 09:13:02 rack vr72-d-041 tray 10: nvme format --ses=2 /dev/nvme0n1 ... OK (3.4s)",
    "[wipe] 09:13:15 rack vr72-d-041 완료 (18/18 tray) — 증적 해시 sha256:8a41f2... 기록",
    "[wipe] 09:13:16 rack vr72-d-042 시작 (42/100)",
  ],
};

/* ---------- 랙 생성기 (시드 기반, 테넌트당 100랙 × 18 tray × 4 GPU) ---------- */
function genRacks(tenantId){
  genRacks.cache = genRacks.cache || {};
  if (genRacks.cache[tenantId]) return genRacks.cache[tenantId];
  const t = NEOCLOUD_DATA.tenant(tenantId);
  const rnd = mulberry32(hashStr(tenantId));
  const racks = [];
  for (let r=1;r<=100;r++){
    const rid = 'vr72-'+t.short+'-'+String(r).padStart(3,'0');
    let rackStatus = 'active';
    if (t.id==='tenant-gamma') rackStatus='pending';
    else if (t.id==='tenant-beta') rackStatus = (r<=62)?'active':'provisioning';
    else if (t.id==='tenant-delta') rackStatus = (r<=41)?'wiped':'wiping';
    const baseUtil = t.id==='tenant-epsilon' ? 86+rnd()*12 : t.id==='tenant-alpha' ? 55+rnd()*35 : rnd()*18;
    const trays = [];
    for (let y=1;y<=18;y++){
      const node = rid+'-t'+String(y).padStart(2,'0');
      let status='Ready';
      if (rackStatus==='pending') status='—';
      else if (rackStatus==='provisioning') status='Provisioning';
      else if (rackStatus==='wiping'||rackStatus==='wiped') status='Wiping';
      const gpus=[];
      for (let g=0; g<4; g++){
        gpus.push({ idx:g, util: rackStatus==='active'? Math.max(0,Math.min(100,Math.round(baseUtil+(rnd()*16-8)))) : 0,
          temp: rackStatus==='active'? Math.round(52+rnd()*24) : 0, xid:null });
      }
      /* alpha 랙 17 tray 09 GPU2 = XID 79 (sentinelEvents 정합) */
      const isXid = (t.id==='tenant-alpha' && r===17 && y===9);
      if (isXid){ status='NotReady,SchedulingDisabled'; gpus[2].xid='XID 79'; gpus[2].util=0; gpus[2].temp=0; }
      const pods=[];
      if (rackStatus==='active' && (status==='Ready' || isXid)){
        const suf=()=> (rnd()*46656|0).toString(36).padStart(3,'0')+(rnd()*1296|0).toString(36).padStart(2,'0');
        if (t.id==='tenant-alpha'){
          pods.push({name:'vllm-inference-'+suf(), ns:'default', kind:'vllm', restarts:0, age:'27d'});
          if (rnd()<0.4) pods.push({name:'dynamo-worker-'+suf(), ns:'dynamo', kind:'vllm', restarts:rnd()<0.1?1:0, age:'12d'});
        } else if (t.id==='tenant-epsilon'){
          pods.push({name:'slurmd-'+node, ns:'slurm', kind:'nccl', restarts:0, age:'88d'});
        } else if (t.id==='tenant-beta'){
          if (rnd()<0.15) pods.push({name:'burnin-nccl-'+suf(), ns:'slurm', kind:'nccl', restarts:0, age:'1d'});
        }
        pods.push({name:'dcgm-exporter-'+suf(), ns:'monitoring', kind:'system', restarts:0, age:'118d'});
        pods.push({name:'nvsentinel-agent-'+suf(), ns:'gpu-operator', kind:'system', restarts:0, age:'118d'});
      }
      trays.push({ tray:y, node, status, gpus, pods });
    }
    const util = rackStatus==='active' ? Math.round(baseUtil) : 0;
    racks.push({ rack:rid, idx:r, status:rackStatus, util,
      temp: rackStatus==='active'? Math.round(58+rnd()*14):0,
      alarm: (t.id==='tenant-alpha' && r===17), trays });
  }
  genRacks.cache[tenantId] = racks;
  return racks;
}

/* ---------- API 사이드패널 스펙 (뷰 태스크에서 채움) ---------- */
NEOCLOUD_DATA.apiSpecs = {};

/* ============================================================
 * core.js — 셸 / 라우터 / 역할 / 공통 컴포넌트
 * ============================================================ */

/* ---------- 헬퍼 ---------- */
function esc(s){ return String(s??'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function el(html){ const t=document.createElement('template'); t.innerHTML=html.trim(); return t.content.firstElementChild; }

function badge(state){
  const map={ Active:'b-green', Healthy:'b-green', Ready:'b-green', Provisioned:'b-blue', Reserved:'b-blue',
    Approved:'b-blue', Requested:'b-amber', Retired:'b-gray', healthy:'b-green', degraded:'b-amber',
    active:'b-green', expiring:'b-amber', expired:'b-red', revoked:'b-gray',
    Critical:'b-red', High:'b-amber', Medium:'b-blue', critical:'b-red', warning:'b-amber', info:'b-blue',
    writeback:'b-green', ensure:'b-amber', detected:'b-gray', assigned:'b-blue' };
  const label={ writeback:'write-back 완료', ensure:'EnsureLoadBalancer', detected:'감지됨', assigned:'VIP 할당' }[state]||state;
  return `<span class="badge ${map[state]||'b-gray'}">${esc(label)}</span>`;
}
function dayChip(day){ return `<span class="chip day">Day ${day}</span>`; }
function bar(pct, color){ return `<div class="bar-o"><div class="bar-i" style="width:${pct}%${color?';background:'+color:''}"></div></div>`; }
function sparkline(vals, w=90, h=26){
  const max=Math.max(...vals)*1.15, pts=vals.map((v,i)=>`${(i/(vals.length-1)*w).toFixed(1)},${(h-v/max*h).toFixed(1)}`).join(' ');
  return `<svg width="${w}" height="${h}" class="sparkline"><polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="1.6"/></svg>`;
}
function utilColor(u){
  if (u<=0) return '#223142';
  if (u<30) return '#173350'; if (u<55) return '#22507c'; if (u<75) return '#2f6ea8'; if (u<90) return '#3d8ad0'; return '#5aa7e8';
}
function toast(msg){
  let w=document.querySelector('.toast-wrap'); if(!w){ w=el('<div class="toast-wrap"></div>'); (document.getElementById('mk8s-root')||document.body).appendChild(w); }
  const t=el(`<div class="toast">✓ ${esc(msg)}</div>`); w.appendChild(t); setTimeout(()=>t.remove(), 3200);
}

/* ---------- 역할 ---------- */
const ROLE_LABEL={ admin:'관리자 (플랫폼/제공)', operator:'운영자 (서비스 운영)' };
/* admin 전용 액션 목록 — operator는 비활성 */
const ADMIN_ACTIONS=['approve','reject','install','upgrade','patch','retire','wipe','policy','settings','provision'];
function can(action){ return App.state.role==='admin' || !ADMIN_ACTIONS.includes(action); }
function actionBtn(label, action, onclick, opts={}){
  const cls = opts.danger?'btn btn-danger':(opts.secondary?'btn':'btn btn-primary');
  const sm = opts.sm?' btn-sm':'';
  if (!can(action)) return `<button class="btn${sm} btn-disabled tip" data-tip="관리자 권한 필요">${esc(label)} 🔒</button>`;
  return `<button class="${cls}${sm}" onclick="${onclick}">${esc(label)}</button>`;
}

/* ---------- 코드 하이라이팅 (YAML/JSON 단순) ---------- */
function hl(code){
  return esc(code)
    .replace(/(#[^\n]*)/g,'<span class="tok-c">$1</span>')
    .replace(/^(\s*)([\w.\-\/&;']+)(:)(?=\s|$)/gm,'$1<span class="tok-k">$2</span>$3')
    .replace(/(&quot;[^&\n]*?&quot;)/g,'<span class="tok-s">$1</span>')
    .replace(/\b(GET|POST|PUT|PATCH|DELETE|WATCH)\b/g,'<span class="tok-m">$1</span>')
    .replace(/\b(true|false|null)\b/g,'<span class="tok-n">$1</span>');
}
let _cpSeq=0;
function codeBlock(title, code){
  const id='cp'+(++_cpSeq);
  return `<div class="code-panel"><div class="cp-h">${esc(title)}
    <button class="copy" onclick="navigator.clipboard&&navigator.clipboard.writeText(document.getElementById('${id}').textContent);toast('복사됨')">복사</button></div>
    <pre id="${id}">${hl(code)}</pre></div>`;
}

/* ---------- API 사이드패널 ---------- */
function apiIcon(specId){ return `<span class="api-ico tip" data-tip="API 보기" onclick="event.stopPropagation();openApiPanel('${specId}')">&lt;/&gt;</span>`; }
function openApiPanel(specId){
  const spec=NEOCLOUD_DATA.apiSpecs[specId];
  if(!spec){ toast('스펙 준비 중: '+specId); return; }
  closeApiPanel();
  const tabs=Object.keys(spec.tabs);
  const d=el(`<div class="drawer" id="api-drawer">
    <div class="d-h"><span class="api-ico" style="cursor:default">&lt;/&gt;</span> ${esc(spec.title)}
      <button class="x" onclick="closeApiPanel()">✕</button></div>
    <div class="tabs" style="margin:0 18px">${tabs.map((t,i)=>`<button class="${i===0?'on':''}" onclick="apiTab(this,'${specId}','${esc(t)}')">${esc(t)}</button>`).join('')}</div>
    <div class="d-b" id="api-body">${spec.intro?`<p class="muted small" style="margin-bottom:12px">${spec.intro}</p>`:''}${codeBlock(tabs[0], spec.tabs[tabs[0]])}</div>
  </div>`);
  (document.getElementById('mk8s-root')||document.body).appendChild(d);
  requestAnimationFrame(()=>d.classList.add('open'));
}
function apiTab(btn, specId, tab){
  const spec=NEOCLOUD_DATA.apiSpecs[specId];
  btn.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('on')); btn.classList.add('on');
  document.getElementById('api-body').innerHTML=(spec.intro?`<p class="muted small" style="margin-bottom:12px">${spec.intro}</p>`:'')+codeBlock(tab, spec.tabs[tab]);
}
function closeApiPanel(){ const d=document.getElementById('api-drawer'); if(d) d.remove(); }
document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ closeApiPanel(); closeModal(); } });

/* ---------- 모달 ---------- */
function openModal(title, bodyHtml, footHtml){
  closeModal();
  const o=el(`<div class="overlay" id="modal-ov" onclick="if(event.target===this)closeModal()">
    <div class="modal"><div class="m-h">${title}<button class="x" onclick="closeModal()">✕</button></div>
    <div class="m-b" id="modal-body">${bodyHtml}</div>${footHtml?`<div class="m-f" id="modal-foot">${footHtml}</div>`:''}</div></div>`);
  (document.getElementById('mk8s-root')||document.body).appendChild(o);
}
function closeModal(){ const o=document.getElementById('modal-ov'); if(o) o.remove(); }

/* ---------- 로그 스트리밍 (mock follow) ---------- */
let _logTimer=null;
function startLogStream(box, lines, opts={}){
  stopLogStream();
  const tail = Math.min(opts.tail||200, 300);
  let i=0;
  const colorize=(ln)=>{
    let cls='';
    if(/WARN|warning/i.test(ln)) cls='lg-warn'; else if(/ERROR|Err\b|fail/i.test(ln)) cls='lg-err';
    else if(/INFO|\bok\b/.test(ln)) cls='lg-info';
    return `<div class="${cls}">${esc(ln)}</div>`;
  };
  const filter=opts.filter? (ln=>ln.toLowerCase().includes(opts.filter.toLowerCase())) : (()=>true);
  const src=lines.filter(filter);
  if(!src.length){ box.innerHTML='<div class="muted">— 필터와 일치하는 로그 없음 —</div>'; return; }
  const seed=[];
  for(let k=0;k<Math.min(tail, src.length*3);k++) seed.push(colorize(src[k%src.length]));
  box.innerHTML=seed.join(''); box.scrollTop=box.scrollHeight;
  i=seed.length;
  if (opts.follow===false) return;
  _logTimer=setInterval(()=>{
    const n=1+Math.floor(Math.random()*3);
    let add='';
    for(let k=0;k<n;k++){ add+=colorize(src[i%src.length]); i++; }
    box.insertAdjacentHTML('beforeend', add);
    while(box.childNodes.length>500) box.removeChild(box.firstChild);
    box.scrollTop=box.scrollHeight;
  }, 380);
}
function stopLogStream(){ if(_logTimer){ clearInterval(_logTimer); _logTimer=null; } }

/* ---------- 메뉴 정의 ---------- */
const MENU1=[
  { id:'home', ico:'🏠', label:'대시보드', route:'#/k8s/overview' },
  { id:'bmaas', ico:'🖥️', label:'BMaaS (자원/서버)', route:'#/bmaas' },
  { id:'k8s', ico:'☸️', label:'Managed K8S', expand:true },
  { id:'obs', ico:'📊', label:'Observability', route:'#/obs' },
  { id:'ticket', ico:'🎫', label:'티켓 / SLA', route:'#/ticket' },
  { id:'billing', ico:'💰', label:'미터링 / 과금', route:'#/billing' },
  { id:'platform', ico:'⚙️', label:'플랫폼 설정', route:'#/platform' },
];
const MENU2=[
  { route:'#/k8s/overview',   label:'Overview' },
  { route:'#/k8s/workflow',   label:'요청·작업', tag:'2' },
  { route:'#/k8s/clusters',   label:'클러스터' },
  { route:'#/k8s/networking', label:'네트워킹·외부노출' },
  { route:'#/k8s/access',     label:'접근관리 (kubeconfig)' },
  { route:'#/k8s/upgrade',    label:'업그레이드·패치' },
  { route:'#/k8s/sentinel',   label:'장애관리 (NVSentinel)', tag:'1' },
  { route:'#/k8s/storage',    label:'스토리지 (GDS)' },
  { route:'#/k8s/monitoring', label:'모니터링' },
  { route:'#/k8s/settings',   label:'설정 (Day0)', adminOnly:true },
];

/* ---------- App ---------- */
const App={
  state:{ role:'admin', route:'#/k8s/overview', params:{} },
  views:{},
  register(path, fn){ this.views[path]=fn; },

  init(){
    document.getElementById('mk8s-root').innerHTML=`
      <div class="topbar">
        <div class="logo"><span class="dot"></span>NeoCloud <small>Operations Portal</small></div>
        <div class="gsearch">🔍 <input placeholder="테넌트, 클러스터, 노드, VIP 검색…"></div>
        <div class="spacer"></div>
        <button class="btn btn-sm tip" data-tip="승인/설치/발급 등 데모 중 변경한 상태를 모두 초기화" onclick="App.resetDemo()">↺ 데모 리셋</button>
        <button class="bell" title="알림">🔔<span class="n">3</span></button>
        <div class="roleswitch" id="roleswitch">
          <button data-r="admin" class="on">관리자</button><button data-r="operator">운영자</button>
        </div>
        <div class="whoami"><b>dan.park@sk.com</b><span id="role-label">${ROLE_LABEL.admin} · Keycloak SSO</span></div>
        <div class="avatar">DP</div>
      </div>
      <nav class="sidebar" id="sidebar"></nav>
      <main class="main" id="main"></main>`;
    document.getElementById('roleswitch').addEventListener('click',e=>{
      const b=e.target.closest('button[data-r]'); if(!b) return;
      this.state.role=b.dataset.r;
      document.querySelectorAll('#roleswitch button').forEach(x=>x.classList.toggle('on',x===b));
      document.getElementById('role-label').textContent=ROLE_LABEL[this.state.role]+' · Keycloak SSO';
      this.renderSidebar(); this.render();
      toast('역할 전환: '+ROLE_LABEL[this.state.role]);
    });
    this.state.route=this.state.route||'#/k8s/overview';
    this.renderSidebar(); this.render();
  },

  renderSidebar(){
    const cur=this.state.route||'#/k8s/overview';
    const k8sOpen=cur.startsWith('#/k8s');
    let html='<div class="sect">NeoCloud Services</div>';
    for(const m of MENU1){
      if(m.expand){
        html+=`<div class="nav-group">
          <div class="nav1 ${k8sOpen?'active open':''}" onclick="App.navigate('#/k8s/overview')">
            <span class="ico">${m.ico}</span>${m.label}<span class="chev">▶</span></div>
          <div class="nav2wrap ${k8sOpen?'open':''}">
            ${MENU2.filter(s=>!s.adminOnly||this.state.role==='admin').map(s=>
              `<div class="nav2 ${cur.split('?')[0].startsWith(s.route)?'active':''}" onclick="App.navigate('${s.route}')">${s.label}
               ${s.tag?`<span class="tag">${s.tag}</span>`:''}</div>`).join('')}
          </div></div>`;
      } else {
        html+=`<div class="nav1 ${cur.startsWith(m.route)?'active':''}" onclick="App.navigate('${m.route}')">
          <span class="ico">${m.ico}</span>${m.label}</div>`;
      }
    }
    document.getElementById('sidebar').innerHTML=html;
  },

  navigate(hash){ this.state.route=hash; this.render(); },

  resetDemo(){
    /* 모든 mock 상태는 메모리 전용 — 새로고침이 곧 완전 초기화 */
    location.hash='#/mk8s?v=overview';
    location.reload();
  },

  resolve(hash){
    const paths=Object.keys(this.views).sort((a,b)=>
      ((a.split(':').length-1)-(b.split(':').length-1)) || (b.length-a.length));
    const seg=hash.split('?')[0].split('/').filter(Boolean);
    for(const p of paths){
      const ps=p.split('/').filter(Boolean);
      if(ps.length!==seg.length) continue;
      const params={}; let ok=true;
      for(let i=0;i<ps.length;i++){
        if(ps[i].startsWith(':')) params[ps[i].slice(1)]=decodeURIComponent(seg[i]);
        else if(ps[i]!==seg[i]){ ok=false; break; }
      }
      if(ok){
        const q=hash.split('?')[1];
        if(q) q.split('&').forEach(kv=>{ const [k,v]=kv.split('='); params[k]=decodeURIComponent(v||''); });
        return { fn:this.views[p], params };
      }
    }
    return null;
  },

  render(){
    stopLogStream(); closeApiPanel(); closeModal();
    if(window._monDashTimer){ clearInterval(window._monDashTimer); window._monDashTimer=null; }
    const hash=this.state.route||'#/k8s/overview';
    this.state.route=hash;
    this.renderSidebar();
    const main=document.getElementById('main');
    const m=this.resolve(hash);
    if(m){ this.state.params=m.params; main.innerHTML=''; m.fn(main, m.params); }
    else renderPlaceholder(main, hash);
    main.scrollTop=0;
    if(window.__mk8sOnRoute) window.__mk8sOnRoute(hash);
  },
};

/* ---------- Placeholder ---------- */
function renderPlaceholder(elm, hash){
  const names={'#/bmaas':'BMaaS (자원/서버)','#/obs':'Observability','#/ticket':'티켓 / SLA','#/billing':'미터링 / 과금','#/platform':'플랫폼 설정'};
  const name=names[hash.split('?')[0]]||hash;
  elm.innerHTML=`
    <div class="page-h"><div><h1>${esc(name)}</h1><div class="sub">NeoCloud 통합 포탈 영역</div></div></div>
    <div class="card"><div class="empty"><div class="big">🚧</div>
      <b>${esc(name)}</b><p class="muted" style="margin-top:6px">이 영역은 본 목업(Managed K8S) 범위 밖입니다.<br>
      좌측 <b>Managed K8S</b> 메뉴에서 목업 기능을 확인하세요.</p></div></div>`;
}

/* ============================================================
 * 개요 대시보드 — lifecycle 카드 · KPI · 주의 필요 피드
 * ============================================================ */
App.register('#/k8s/overview', function(elm){
  const D=NEOCLOUD_DATA;
  const activeTenants=D.tenants.filter(t=>t.lifecycle==='Active').length;
  const pendingReqs=D.requests.filter(r=>['접수대기','검토중'].includes(r.status)).length;
  const critAlarms=D.sentinelEvents.filter(e=>e.sev==='critical').length;
  const totalRacks=D.tenants.reduce((s,t)=>s+t.racks,0);
  const totalGpus=D.tenants.reduce((s,t)=>s+t.gpus,0);

  const kpis=`
    <div class="grid" style="grid-template-columns:repeat(4,1fr)">
      <div class="card kpi"><span class="v">${totalRacks.toLocaleString()} <span class="muted" style="font-size:14px">racks</span></span>
        <span class="l">Vera Rubin NVL72 총 할당</span><span class="d muted">테넌트 5 × 100랙 · GPU ${totalGpus.toLocaleString()}기</span></div>
      <div class="card kpi"><span class="v" style="color:var(--green)">${activeTenants} / ${D.tenants.length}</span>
        <span class="l">Active 테넌트</span><span class="d muted">Provisioning 1 · Requested 1 · Retiring 1</span></div>
      <div class="card kpi"><span class="v" style="color:var(--amber)">${pendingReqs}</span>
        <span class="l">미처리 요청 (Biz. 포털)</span><span class="d"><a href="#/k8s/workflow">요청·작업 보드 →</a></span></div>
      <div class="card kpi"><span class="v" style="color:var(--red)">${critAlarms}</span>
        <span class="l">Critical 알람 (NVSentinel)</span><span class="d"><a href="#/k8s/sentinel">장애관리 →</a></span></div>
    </div>`;

  const lifecycleCard=(t)=>{
    const stepIdx=D.lifecycleSteps.indexOf(t.lifecycle);
    const steps=D.lifecycleSteps.map((s,i)=>{
      const cls=i<stepIdx?'done':(i===stepIdx?'now':'');
      return `<div class="step ${cls}"><span class="ball">${i<stepIdx?'✓':i+1}</span>${s}</div>${i<7?'<div class="step '+(i<stepIdx?'done':'')+'"><span class="bar"></span></div>':''}`;
    }).join('');
    return `<div class="card" style="cursor:pointer" onclick="App.navigate('#/k8s/clusters/${t.id}')">
      <div class="card-h">${esc(t.company)} <span class="muted small">${t.id}</span>
        ${badge(t.lifecycle)} ${dayChip(t.day)}
        <div class="right small muted">${esc(t.workload)}</div></div>
      <div class="card-b">
        <div class="stepper" style="margin-bottom:12px">${steps}</div>
        <div style="display:flex;gap:26px;flex-wrap:wrap" class="small">
          <span><b>${t.racks}</b> racks · <b>${t.gpus.toLocaleString()}</b> GPU</span>
          <span class="muted">K8s <b>${t.k8sVersion}</b> · ${t.nkdVersion}</span>
          <span class="muted">${esc(t.zone)}</span>
          ${t.since?`<span class="muted">개통 ${t.since}</span>`:''}
          ${t.note?`<span style="color:var(--amber);font-weight:600">⚠ ${esc(t.note)}</span>`:''}
        </div>
      </div></div>`;
  };

  const attention=[
    { sev:'critical', txt:'XID 79 — vr72-a-017-t09 (CLAUDE) remediation 진행 중', link:'#/k8s/sentinel' },
    { sev:'warning',  txt:'kubeconfig 만료 임박 — 최수아 (CLAUDE, 오늘 18:05)', link:'#/k8s/access' },
    { sev:'warning',  txt:'TLS 인증서 D-12 — api.claude.neocloud.skt.com', link:'#/k8s/networking' },
    { sev:'info',     txt:'설치 요청 승인 대기 — Google (VR NVL72 × 100랙)', link:'#/k8s/workflow' },
    { sev:'info',     txt:'업그레이드 예약 — CLAUDE v1.33.2 (07-16 02:00)', link:'#/k8s/upgrade' },
    { sev:'info',     txt:'Service <pending> — dynamo/dynamo-frontend VIP 할당 중', link:'#/k8s/networking' },
  ];

  elm.innerHTML=`
    <div class="page-h"><div><h1>Managed K8S Overview</h1>
      <div class="sub">테넌트별 클러스터 Lifecycle 현황 — Reserved 자원 기반 (Vera Rubin NVL72)</div></div>
      <div class="right"><span class="chip">2026-07-09 (수) 10:52 KST</span></div></div>
    ${kpis}
    <div class="grid" style="grid-template-columns:2.2fr 1fr;margin-top:14px;align-items:start">
      <div class="grid">${D.tenants.map(lifecycleCard).join('')}</div>
      <div class="card">
        <div class="card-h">⚡ 주의 필요 <span class="muted small">(${attention.length})</span></div>
        <div class="card-b" style="padding:6px 0">
          ${attention.map(a=>`
            <div style="display:flex;gap:10px;padding:9px 16px;cursor:pointer;border-bottom:1px solid var(--line-soft)"
                 onmouseover="this.style.background='var(--accent-soft)'" onmouseout="this.style.background=''"
                 onclick="App.navigate('${a.link}')">
              ${badge(a.sev)}<span class="small" style="flex:1">${esc(a.txt)}</span></div>`).join('')}
        </div>
      </div>
    </div>`;
});

/* ============================================================
 * 요청·작업 — 접수/검토/승인 칸반 + 진행 중 작업
 *   접수대기(담당자 미지정) → [검토 시작] → 검토중 → [승인]/[반려]
 * ============================================================ */
const WF_COLS=['접수대기','검토중','승인','진행중','검증중','개통완료','반려'];
const WF_REJECT_CODES=['가용성 부족 (랙/존/Fabric)','스펙 협의 필요','일정 조정 필요','계약 조건 미충족','기타'];

App.register('#/k8s/workflow', function(elm){
  const D=NEOCLOUD_DATA;
  const kanban=WF_COLS.map(col=>{
    const cards=D.requests.filter(r=>r.status===col);
    return `<div class="kcol" ${col==='반려'?'style="background:var(--red-soft)"':''}><h4>${col}<span>${cards.length}</span></h4>
      ${cards.map(r=>{
        const t=D.tenant(r.tenantId);
        const quick = r.status==='승인' && r.kind==='설치' && can('install')
          ? `<button class="btn btn-sm btn-primary" style="margin-top:8px;width:100%"
               onclick="event.stopPropagation();App.navigate('#/k8s/clusters/new?req=${r.id}')">🚀 설치 시작</button>`
          : (r.status==='승인' && r.kind==='반납' && can('retire')
          ? `<button class="btn btn-sm" style="margin-top:8px;width:100%"
               onclick="event.stopPropagation();wfStartRetire('${r.id}')">반납 시작</button>`:'');
        return `<div class="kcard" onclick="wfDetail('${r.id}')">
          <b>${esc(t.company)} <span class="chip" style="font-size:9.5px">${r.kind}</span></b>
          <div class="meta"><span>${r.id}</span><span>VR NVL72 × ${r.racks}랙</span><span>희망 ${r.wantDate}</span><span class="muted">${r.from}</span>
          ${r.reviewer?`<span style="color:var(--accent)">👤 ${esc(r.reviewer.split('@')[0])}</span>`:''}
          ${r.rejectReason?`<span style="color:var(--red)">⛔ ${esc(r.rejectReason.code)}</span>`:''}</div>
          ${quick}
        </div>`;
      }).join('')||'<div class="muted small" style="text-align:center;padding:14px 0">—</div>'}
    </div>`;
  }).join('');

  const jobRow=(j)=>{
    const t=NEOCLOUD_DATA.tenant(j.tenantId);
    const typeChip={install:'설치',upgrade:'업그레이드',retire:'반납'}[j.type];
    const link=j.type==='install'?`#/k8s/clusters/${j.tenantId}/progress`:(j.type==='upgrade'?'#/k8s/upgrade':'#/k8s/clusters/'+j.tenantId+'/progress');
    return `<div style="display:grid;grid-template-columns:130px 1fr 240px 120px;gap:14px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line-soft);cursor:pointer"
        onclick="App.navigate('${link}')" onmouseover="this.style.background='var(--accent-soft)'" onmouseout="this.style.background=''">
      <div><span class="chip">${typeChip}</span> <span class="small muted">${j.id}</span></div>
      <div><b class="small">${esc(j.title)}</b><div class="small muted">${esc(j.currentStage)}</div></div>
      <div>${bar(j.progress, j.type==='retire'?'var(--amber)':null)}</div>
      <div class="small" style="text-align:right"><b>${j.progress}%</b> <span class="muted">(${j.racksDone}/100랙)</span></div>
    </div>`;
  };

  elm.innerHTML=`
    <div class="page-h"><div><h1>요청 · 작업</h1>
      <div class="sub">사업(Biz.) 포털 연동 설치/변경/반납 요청 파이프라인 — 접수 → 검토 → 승인 → 설치 → 검증 → 개통 ${apiIcon('workflow-approve')}</div></div>
      <div class="right"><span class="chip">Biz. 포털 웹훅 연결됨 <span style="color:var(--green)">●</span></span></div></div>
    <div class="card" style="margin-bottom:16px"><div class="card-b"><div class="kanban">${kanban}</div></div></div>
    <div class="card"><div class="card-h">진행 중 작업 <span class="muted small">(${NEOCLOUD_DATA.jobs.length})</span></div>
      ${NEOCLOUD_DATA.jobs.map(jobRow).join('')}</div>`;
});

function wfDetail(reqId){
  const r=NEOCLOUD_DATA.requests.find(x=>x.id===reqId);
  const t=NEOCLOUD_DATA.tenant(r.tenantId);
  const specRows=[
    ['상품', r.gpuModel+' × '+r.racks+'랙 (GPU '+(r.racks*72).toLocaleString()+'기)'],
    ['K8s 버전', r.k8sVersion],['희망 개통일', r.wantDate],['접수 경로', r.from+' · '+r.createdAt],
    ['계약 스펙 요약', r.specSummary],
    ...(r.reviewer?[['검토 담당자', r.reviewer+' (검토 시작 '+(r.reviewStartedAt||'-')+')']]:[]),
    ...(r.rejectReason?[['반려 사유', '<b style="color:var(--red)">'+esc(r.rejectReason.code)+'</b> — '+esc(r.rejectReason.text)+'<div class="small muted">'+r.rejectReason.at+' · Biz. 포털 회신 완료</div>']]:[]),
  ].map(([k,v])=>`<tr><td class="muted" style="width:130px">${k}</td><td>${v}</td></tr>`).join('');
  const avail=`<div class="card" style="margin-top:12px;background:${r.availability.ok?'var(--green-soft)':'var(--amber-soft)'};border-color:transparent">
    <div class="card-b" style="display:flex;gap:10px;align-items:center">
      <span style="font-size:18px">${r.availability.ok?'✅':'⚠️'}</span>
      <div><b class="small">가용성 자동 체크 ${r.availability.ok?'통과':'주의'}</b>
      <div class="small muted">${esc(r.availability.detail)}</div></div></div></div>`;
  let foot='', guide='';
  if(r.status==='접수대기'){
    guide='접수대기 = 담당자 미지정. <b>검토 시작</b>으로 담당자를 지정한 뒤 검토중 단계에서 승인/반려를 결정합니다.';
    foot=actionBtn('반려…','reject',`wfRejectModal('${r.id}')`,{secondary:true})
        +actionBtn('검토 시작 (담당자 지정)','approve',`wfStartReview('${r.id}')`);
  } else if(r.status==='검토중'){
    guide='가용성·일정·정책 검토 완료 후 결정하세요. 승인 시 자원 예약(Reserved)이 시작되고 Biz. 포털로 회신됩니다.';
    foot=actionBtn('반려…','reject',`wfRejectModal('${r.id}')`,{secondary:true})
        +actionBtn('승인','approve',`wfApprove('${r.id}')`);
  } else if(r.status==='승인'){
    if(r.kind==='설치'){
      guide='승인 완료 — 자원이 예약(Reserved)되어 있습니다. 설치 마법사에 계약 스펙이 자동 반영됩니다.';
      foot=actionBtn('설치 시작 (마법사)','install',`closeModal();App.navigate('#/k8s/clusters/new?req=${r.id}')`);
    } else if(r.kind==='반납'){
      guide='반납 승인 완료 — kubeconfig 회수 → 클러스터 삭제 → Secure Erase 순으로 진행됩니다.';
      foot=actionBtn('반납 파이프라인 시작 / 진행 보기','retire',`closeModal();wfStartRetire('${r.id}')`);
    } else {
      guide='견적 승인 = Biz. 포털 회신으로 종결됩니다. 고객이 계약을 확정하면 <b>새 설치 요청</b>이 웹훅으로 접수되고, 그때 설치 플로우가 시작됩니다.';
    }
  }
  openModal(`${esc(t.company)} — ${esc(r.title)} <span class="chip">${r.id}</span> ${badge(r.status==='개통완료'?'Active':(r.status==='반려'?'critical':r.status))}`,
    `<table class="table">${specRows}</table>${avail}
     ${guide?`<p class="small muted" style="margin-top:12px">${guide} ${apiIcon('workflow-approve')}</p>`:''}`,
    foot);
}
function wfStartReview(reqId){
  const r=NEOCLOUD_DATA.requests.find(x=>x.id===reqId);
  r.status='검토중'; r.reviewer='dan.park@sk.com'; r.reviewStartedAt='2026-07-09 14:02';
  closeModal(); App.render();
  toast(`${reqId} 검토 시작 — 담당자 dan.park 지정 (Biz. 포털에 InReview 회신)`);
}
function wfApprove(reqId){
  const r=NEOCLOUD_DATA.requests.find(x=>x.id===reqId);
  r.status='승인'; closeModal(); App.render();
  toast(`${reqId} 승인 — 자원 예약(Reserved) 시작 · Biz. 포털 회신됨`);
}
function wfStartRetire(reqId){
  const r=NEOCLOUD_DATA.requests.find(x=>x.id===reqId);
  let job=NEOCLOUD_DATA.jobs.find(j=>j.tenantId===r.tenantId && j.type==='retire');
  if(!job){
    job={ id:'JOB-1184', type:'retire', tenantId:r.tenantId, title:'반납 — Secure Erase & 자원 회수', progress:2,
      currentStage:'kubeconfig 회수 · RBAC 제거', startedAt:'2026-07-09 14:20', racksDone:0,
      stages:[
        {name:'kubeconfig 전량 회수 · RBAC 제거', status:'now', at:'2026-07-09 14:20'},
        {name:'클러스터 삭제 (NKD teardown)', status:'pending', at:null},
        {name:'Secure Erase (NVMe crypto-erase + 검증)', status:'pending', at:null},
        {name:'진단·Burn-in 후 Pool 복귀', status:'pending', at:null},
      ]};
    NEOCLOUD_DATA.jobs.unshift(job);
    toast('반납 파이프라인 시작 — kubeconfig 회수부터 진행');
  }
  r.status='진행중';
  App.navigate('#/k8s/clusters/'+r.tenantId+'/progress');
}

/* ---------- 반려 모달 (사유 코드 + 텍스트) ---------- */
function wfRejectModal(reqId){
  const r=NEOCLOUD_DATA.requests.find(x=>x.id===reqId);
  const t=NEOCLOUD_DATA.tenant(r.tenantId);
  const preset=!r.availability.ok?WF_REJECT_CODES[0]:'';
  openModal(`반려 — ${esc(t.company)} <span class="chip">${r.id}</span>`,
    `<p class="small muted" style="margin-bottom:12px">반려 사유는 Biz. 포털로 회신되어 고객 커뮤니케이션에 사용됩니다. 조정된 요청은 새 웹훅으로 재접수됩니다. ${apiIcon('workflow-approve')}</p>
     <label class="small" style="font-weight:700">사유 코드</label>
     <select id="rj-code" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:6px;margin:5px 0 13px">
       ${WF_REJECT_CODES.map(c=>`<option ${c===preset?'selected':''}>${c}</option>`).join('')}
     </select>
     <label class="small" style="font-weight:700">상세 사유 (고객 회신용)</label>
     <textarea id="rj-text" rows="4" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:6px;margin-top:5px;font:inherit"
       placeholder="예) Zone D 가용 랙 12 < 요청 20랙 — 8월 증설분 반영 후 재접수 요청드립니다.">${!r.availability.ok?esc(r.availability.detail):''}</textarea>
     <div class="small muted" style="margin-top:8px">회신 payload: <code>POST /biz/v1/requests/${r.id}:status {"status":"Rejected","reasonCode":…,"reason":…}</code></div>`,
    `<button class="btn" onclick="closeModal()">취소</button>`
    +actionBtn('반려 확정 · Biz. 포털 회신','reject',`wfRejectExec('${r.id}')`,{danger:true}));
}
function wfRejectExec(reqId){
  const r=NEOCLOUD_DATA.requests.find(x=>x.id===reqId);
  const code=document.getElementById('rj-code').value;
  const text=document.getElementById('rj-text').value||'(상세 사유 미입력)';
  r.status='반려'; r.rejectReason={ code, text, at:'2026-07-09 14:05' };
  closeModal(); App.render();
  toast(`${reqId} 반려 — 사유 회신 완료 (${code})`);
}

/* ---------- API 스펙 ---------- */
NEOCLOUD_DATA.apiSpecs['workflow-approve']={
  title:'요청 상태 전이 — Admin API (사업포탈 연동)',
  intro:'운영자 포탈 자체 Admin API. 검토시작/승인/반려 모두 사업포탈에 상태 콜백. lifecycle 진실원본은 운영자 포탈, Biz.는 구독.',
  tabs:{
    'Approve':
`POST /admin/v1/requests/REQ-2607-014:approve
Authorization: Bearer <keycloak-access-token>
Content-Type: application/json

{
  "approver": "dan.park@sk.com",
  "scheduledInstallDate": "2026-07-21",
  "placement": {
    "zone": "AIDC-1/zone-c",
    "rackCount": 100,
    "fabricDomain": "fd-c-01",          # 동일 Fabric 배치
    "f5Partition": "part-gamma"
  },
  "comment": "Zone C 가용 확인 완료"
}

# Response
{
  "requestId": "REQ-2607-014",
  "status": "Approved",                  # Requested → Approved
  "reservationId": "rsv-9f21c",          # 자원 예약 생성 (Reserved 진입)
  "bizPortalSync": { "notified": true, "at": "2026-07-09T10:55:02+09:00" },
  "nextAction": "POST /admin/v1/clusters (설치 마법사)"
}`,
    'Reject':
`POST /admin/v1/requests/REQ-2606-087:reject
Content-Type: application/json

{
  "rejector": "dan.park@sk.com",
  "reasonCode": "CAPACITY_SHORTAGE",     # 사유 코드 (enum)
  "reason": "Zone D 가용 12랙 < 요청 20랙 — 8월 증설분 반영 후 재접수 요청",
  "reviewLog": ["capacity-check: FAIL", "fabric-check: PASS"]
}

# Response — Biz. 포털 콜백 발송
{
  "requestId": "REQ-2606-087",
  "status": "Rejected",
  "bizPortalSync": { "notified": true },
  "resubmitHint": "조정된 요청은 새 requestId로 웹훅 재접수"
}`,
    'Review (담당자 지정)':
`POST /admin/v1/requests/REQ-2607-014:startReview

{ "reviewer": "dan.park@sk.com" }

# Response
{ "status": "InReview",        # 접수대기 → 검토중
  "checks": {                  # 자동 검토 항목 (비동기 실행)
    "capacity":  "queued",     # 존 가용 랙 / Fabric 배치
    "network":   "queued",     # F5 partition · VLAN Pool 여유
    "schedule":  "queued"      # maintenance calendar 충돌
  } }`,
    '상태 모델':
`# 요청 상태 전이 — plan_r10 lifecycle과 매핑
접수대기 (Received)  : Biz.포털 웹훅 수신, 담당자 미지정
검토중  (InReview)   : 담당자 지정 + 자동 검토(가용성/네트워크/일정)
승인    (Approved)   : 자원 Lock (Reserved) + Biz. 회신
반려    (Rejected)   : 사유코드+텍스트 Biz. 회신 → 재접수는 새 요청
설치중  (Installing) : NKD 파이프라인 (Provisioned)
검증중  (Validating) : Acceptance (Ready)
개통완료 (Active)    : kubeconfig 발급·통지 · 과금 시작`,
  }
};

/* ============================================================
 * 클러스터 — 목록 / 상세 (개요·노드풀·애드온·검증리포트·이벤트)
 * ============================================================ */
App.register('#/k8s/clusters', function(elm){
  const D=NEOCLOUD_DATA;
  const rows=D.tenants.map(t=>`
    <tr class="click" onclick="App.navigate('#/k8s/clusters/${t.id}')">
      <td><b>${esc(t.company)}</b><div class="small muted">${t.id} · ${esc(t.workload)}</div></td>
      <td>${badge(t.lifecycle)}${t.note?`<div class="small" style="color:var(--amber)">${esc(t.note)}</div>`:''}</td>
      <td class="mono">${t.k8sVersion}<div class="small muted">${t.nkdVersion}</div></td>
      <td><b>${t.racks}</b> racks<div class="small muted">${t.gpus.toLocaleString()} GPU · spare ${t.hotSpareTrays} tray</div></td>
      <td class="small">${esc(t.zone)}</td>
      <td class="small muted">${t.since||'—'}</td>
    </tr>`).join('');
  elm.innerHTML=`
    <div class="page-h"><div><h1>클러스터</h1>
      <div class="sub">테넌트 전용 Managed K8S 클러스터 (one-tenant-per-cluster · hosted control plane) ${apiIcon('cluster-crd')}</div></div>
      <div class="right">${actionBtn('+ 클러스터 생성','install',"App.navigate('#/k8s/clusters/new')")}</div></div>
    <div class="card"><table class="table">
      <tr><th>테넌트</th><th>상태</th><th>버전</th><th>자원 (VR NVL72)</th><th>존</th><th>개통일</th></tr>${rows}
    </table></div>`;
});

App.register('#/k8s/clusters/:tenantId', function(elm, p){
  const t=NEOCLOUD_DATA.tenant(p.tenantId);
  if(!t){ elm.innerHTML='<div class="empty">클러스터 없음</div>'; return; }
  const tab=p.tab||'overview';
  const tabs=[['overview','개요'],['nodepool','노드풀'],['addons','애드온'],['accept','검증 리포트'],['events','이벤트']];
  elm.innerHTML=`
    <div class="page-h"><div><h1>${esc(t.company)} <span class="muted" style="font-weight:400;font-size:14px">${t.id}</span> ${badge(t.lifecycle)} ${dayChip(t.day)}</h1>
      <div class="sub">${esc(t.workload)} · ${esc(t.zone)} · K8s ${t.k8sVersion} (${t.nkdVersion})</div></div>
      <div class="right">
        <button class="btn" onclick="App.navigate('#/k8s/monitoring/${t.id}')">모니터링</button>
        ${t.lifecycle==='Provisioned'?`<button class="btn btn-primary" onclick="App.navigate('#/k8s/clusters/${t.id}/progress')">설치 진행 보기</button>`:''}
        ${actionBtn('업그레이드','upgrade',`App.navigate('#/k8s/upgrade')`,{secondary:true})}
      </div></div>
    <div class="tabs">${tabs.map(([k,l])=>`<button class="${tab===k?'on':''}" onclick="App.navigate('#/k8s/clusters/${t.id}?tab=${k}')">${l}</button>`).join('')}</div>
    <div id="cl-tab"></div>`;
  const box=document.getElementById('cl-tab');
  if(tab==='overview') clTabOverview(box,t);
  else if(tab==='nodepool') clTabNodepool(box,t);
  else if(tab==='addons') clTabAddons(box,t);
  else if(tab==='accept') clTabAccept(box,t);
  else clTabEvents(box,t);
});

function clTabOverview(box,t){
  const kv=(rows)=>`<table class="table">${rows.map(([k,v])=>`<tr><td class="muted" style="width:190px">${k}</td><td>${v}</td></tr>`).join('')}</table>`;
  box.innerHTML=`<div class="grid" style="grid-template-columns:1fr 1fr;align-items:start">
    <div class="card"><div class="card-h">클러스터 스펙 ${apiIcon('cluster-crd')}</div>
      ${kv([
        ['Control Plane','전용 3식 (16 vCPU / 64 GB) — hosted, 고객 접근 불가'],
        ['Worker','Vera Rubin NVL72 × '+t.racks+'랙 = 1,800 트레이(노드) · GPU '+t.gpus.toLocaleString()+'기'],
        ['Hot Spare',t.hotSpareTrays+' tray (NVSentinel 자동 투입)'],
        ['GPU 라벨','<code>nvidia.com/gpu.product: Rubin</code> · <code>topology.neocloud.skt/rack</code>'],
        ['K8s / NKD',t.k8sVersion+' / '+t.nkdVersion],
        ['Bastion','1식 (8 vCPU / 16 GB) — kubectl 진입점'],
      ])}</div>
    <div class="card"><div class="card-h">네트워크 / 접근</div>
      ${kv([
        ['VPC / 격리',esc(t.vpc)+' — DPU(NICo) VRF/VXLAN 하드 격리'],
        ['F5 Partition',esc(t.f5Partition)],
        ['테넌트 도메인','<code>*.'+t.domainSuffix+'</code> (suffix 플랫폼 강제)'],
        ['apiserver 노출','<code>'+esc(t.apiEndpoint)+'</code> (L4 passthrough)'],
        ['접근 allowlist',t.allowlist.length?t.allowlist.map(a=>'<code>'+a+'</code>').join(' '):'—'],
        ['kubeconfig','<a href="#/k8s/access">Vault PKI 인증서 기반 — 접근관리 →</a>'],
      ])}</div></div>`;
}

function clTabNodepool(box,t){
  const racks=genRacks(t.id);
  const st={Ready:0, other:0, prov:0, off:0};
  racks.forEach(r=>r.trays.forEach(tr=>{
    if(tr.status==='Ready') st.Ready++;
    else if(tr.status==='Provisioning') st.prov++;
    else if(tr.status==='—'||tr.status==='Wiping') st.off++;
    else st.other++;
  }));
  const total=st.Ready+st.other+st.prov+st.off;
  const donut=(()=> {
    const segs=[[st.Ready,'var(--green)'],[st.prov,'var(--accent)'],[st.other,'var(--red)'],[st.off,'#3a4a5c']];
    let acc=0; const C=2*Math.PI*34;
    const arcs=segs.map(([v,c])=>{
      const len=v/total*C, off=-acc/total*C; acc+=v;
      return `<circle r="34" cx="45" cy="45" fill="none" stroke="${c}" stroke-width="14" stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${off}" transform="rotate(-90 45 45)"/>`;
    }).join('');
    return `<svg width="90" height="90">${arcs}</svg>`;
  })();
  const rackRows=racks.slice(0,12).map(r=>`
    <tr class="click" onclick="App.navigate('#/k8s/monitoring/${t.id}/${r.rack}')">
      <td class="mono">${r.rack}${r.alarm?' <span class="badge b-red">XID</span>':''}</td>
      <td>${badge(r.status==='active'?'Ready':(r.status==='provisioning'?'Provisioned':r.status))}</td>
      <td>18 tray · 72 GPU</td>
      <td style="width:180px">${bar(r.util)}</td><td class="small muted">${r.util}%</td>
    </tr>`).join('');
  box.innerHTML=`<div class="grid" style="grid-template-columns:280px 1fr;align-items:start">
    <div class="card"><div class="card-h">노드 상태 분포 ${apiIcon('nodes-list')}</div>
      <div class="card-b" style="display:flex;gap:16px;align-items:center">${donut}
        <div class="small">
          <div><span class="badge b-green">Ready</span> ${st.Ready.toLocaleString()}</div>
          <div style="margin-top:5px"><span class="badge b-blue">Provisioning</span> ${st.prov.toLocaleString()}</div>
          <div style="margin-top:5px"><span class="badge b-red">NotReady</span> ${st.other.toLocaleString()}</div>
          <div style="margin-top:5px"><span class="badge b-gray">기타</span> ${st.off.toLocaleString()}</div>
          <div class="muted" style="margin-top:8px">총 ${total.toLocaleString()} 트레이(노드)</div>
        </div></div></div>
    <div class="card"><div class="card-h">랙 (VR NVL72) <div class="right small muted">상위 12 / ${racks.length} — 전체는 모니터링 히트맵</div></div>
      <table class="table"><tr><th>랙</th><th>상태</th><th>구성</th><th colspan="2">GPU Util</th></tr>${rackRows}</table>
      <div class="card-b small"><a href="#/k8s/monitoring/${t.id}">… 88 more — 랙 히트맵에서 전체 보기 →</a></div></div></div>`;
}

function clTabAddons(box,t){
  const addons=[
    ['ingress-nginx','1.13.1','L7 라우팅 · TLS 종료',t.lifecycle==='Active'?'Running':'Installing'],
    ['cert-manager','1.18.0','TLS 인증서 발급/갱신 (DNS-01)',t.lifecycle==='Active'?'Running':'Installing'],
    ['external-dns','0.19.1','LB IP → Route53 자동 등록 (DNSEndpoint gate)',t.lifecycle==='Active'?'Running':'Installing'],
    ['NVSentinel','25.06','GPU 헬스 · 자동 remediation',t.lifecycle==='Active'?'Running':'Installing'],
    ['GPU Operator','25.6.0','드라이버 580.82 · CUDA 13.1 · DCGM',t.lifecycle==='Active'?'Running':'Installing'],
    ['CSI ('+((NEOCLOUD_DATA.storage.find(s=>s.tenantId===t.id)||{}).vendor||'VAST')+')','2.6','PVC 동적 프로비저닝 · GDS','Running'],
    ['Prometheus + Grafana + Loki','LGTM 스택','메트릭/로그 수집 · 테넌트 대시보드','Running'],
  ];
  box.innerHTML=`<div class="card"><div class="card-h">애드온</div><table class="table">
    <tr><th>이름</th><th>버전</th><th>역할</th><th>상태</th></tr>
    ${addons.map(a=>`<tr><td><b>${a[0]}</b></td><td class="mono">${a[1]}</td><td class="small">${a[2]}</td>
      <td>${badge(a[3]==='Running'?'Active':'Provisioned')}</td></tr>`).join('')}
  </table></div>`;
}

function clTabAccept(box,t){
  if(typeof renderAcceptance==='function' && (t.lifecycle==='Active'||t.lifecycle==='Retired')){
    renderAcceptance(box, t.id, {readonly:true});
  } else if(typeof renderAcceptance==='function'){
    box.innerHTML='<div class="card"><div class="empty"><div class="big">⏳</div><b>Acceptance 검증 전</b><p class="muted small" style="margin-top:6px">설치 파이프라인의 마지막 단계에서 실행됩니다.</p></div></div>';
  } else {
    box.innerHTML='<div class="card"><div class="empty">리포트 뷰 준비 중</div></div>';
  }
}

function clTabEvents(box,t){
  const evts=[
    ['Normal','NodeReady','node-controller','vr72-'+t.short+'-042-t07','Node became ready','2m'],
    ['Warning','FailedScheduling','default-scheduler','pod/vllm-inference-x1f4q','0/1800 nodes available: insufficient nvidia.com/gpu (cordoned)','6m'],
    ['Normal','EnsuringLoadBalancer','service-controller','service/dynamo-frontend','Ensuring load balancer (F5 AS3)','1h'],
    ['Normal','Pulled','kubelet','pod/vllm-inference-a8c2d','Container image "vllm/vllm-openai:v0.9.2" already present','3h'],
    ['Warning','NodeNotReady','node-controller','vr72-a-017-t09','Node is not ready (XID 79)','4h'],
    ['Normal','CertificateIssued','cert-manager','certificate/wildcard-tls','Certificate issued successfully','2d'],
  ];
  box.innerHTML=`<div class="card"><div class="card-h">이벤트 <span class="muted small">events.k8s.io/v1</span> ${apiIcon('nodes-list')}</div>
    <table class="table"><tr><th>Type</th><th>Reason</th><th>From</th><th>Object</th><th>Message</th><th>Age</th></tr>
    ${evts.map(e=>`<tr><td>${badge(e[0]==='Warning'?'warning':'info')}</td><td class="mono small">${e[1]}</td>
      <td class="small muted">${e[2]}</td><td class="mono small">${e[3]}</td><td class="small">${e[4]}</td><td class="small muted">${e[5]}</td></tr>`).join('')}
    </table></div>`;
}

/* ---------- API 스펙 ---------- */
NEOCLOUD_DATA.apiSpecs['cluster-crd']={
  title:'클러스터 리소스 — CAPI 스타일 CRD',
  intro:'NKD/NKE 프로비저닝 API는 비공개이므로 Cluster API(CAPI) 스타일로 표기. <b># NKD API 확정 시 치환</b>',
  tabs:{
    'YAML (Cluster)':
`# NKD API 확정 시 치환 — CAPI 스타일 표기
apiVersion: cluster.x-k8s.io/v1beta1
kind: Cluster
metadata:
  name: tenant-alpha
  namespace: neocloud-system
  labels:
    neocloud.skt.com/tenant: tenant-alpha
    neocloud.skt.com/zone: aidc1-zone-a
spec:
  controlPlaneRef:
    kind: NKDControlPlane        # hosted CP 3식 (고객 접근 불가)
    name: tenant-alpha-cp
  infrastructureRef:
    kind: NeoCloudBareMetalCluster
    name: tenant-alpha-bm
status:
  phase: Provisioned
  controlPlaneReady: true
  infrastructureReady: true`,
    'YAML (MachineDeployment)':
`apiVersion: cluster.x-k8s.io/v1beta1
kind: MachineDeployment
metadata:
  name: tenant-alpha-gpu-workers
spec:
  clusterName: tenant-alpha
  replicas: 1800                  # 100 racks x 18 trays
  template:
    spec:
      infrastructureRef:
        kind: NeoCloudBareMetalMachineTemplate
        name: vr-nvl72-tray       # Vera Rubin compute tray (4 GPU)
      version: v1.32.4
      nodeLabels:
        nvidia.com/gpu.product: Rubin
        topology.neocloud.skt/rack: "{{ .rack }}"
        neocloud.skt.com/pool: reserved`,
  }
};
NEOCLOUD_DATA.apiSpecs['nodes-list']={
  title:'노드 조회 — 표준 K8s API',
  intro:'운영자 포탈 노드풀/이벤트 화면이 사용하는 표준 kube-apiserver 엔드포인트.',
  tabs:{
    'Request':
`GET /api/v1/nodes?labelSelector=topology.neocloud.skt/rack%3Dvr72-a-017
Authorization: Bearer <sa-token>   # 포탈 백엔드 ServiceAccount

# 이벤트 조회
GET /apis/events.k8s.io/v1/namespaces/default/events?limit=100`,
    'Response (발췌)':
`{
  "kind": "NodeList",
  "items": [{
    "metadata": {
      "name": "vr72-a-017-t09",
      "labels": {
        "nvidia.com/gpu.product": "Rubin",
        "nvidia.com/gpu.count": "4",
        "topology.neocloud.skt/rack": "vr72-a-017",
        "neocloud.skt.com/tenant": "tenant-alpha"
      }
    },
    "spec": {
      "unschedulable": true,                # NVSentinel cordon
      "taints": [{
        "key": "node.kubernetes.io/unschedulable",
        "effect": "NoSchedule"
      }]
    },
    "status": {
      "conditions": [{
        "type": "Ready",
        "status": "False",                  # XID 79
        "reason": "GpuFallenOffBus"
      }],
      "capacity": { "nvidia.com/gpu": "4" }
    }
  }]
}`,
  }
};

/* ============================================================
 * 클러스터 생성 마법사 (6단계) + 설치 진행 + Acceptance 리포트
 * ============================================================ */
const WIZ={ step:1, data:{} };
const WIZ_STEPS=['기본 정보','노드풀','네트워킹','스토리지','애드온','검토 · 실행'];

App.register('#/k8s/clusters/new', function(elm, p){
  /* 승인된 요청에서 진입 시 프리필 */
  if(p.req && WIZ.data.reqId!==p.req){
    const r=NEOCLOUD_DATA.requests.find(x=>x.id===p.req);
    if(r){
      const t=NEOCLOUD_DATA.tenant(r.tenantId);
      WIZ.step=1;
      WIZ.data={ reqId:r.id, tenantId:r.tenantId, name:r.tenantId, k8sVersion:r.k8sVersion,
        zone:t.zone.replace(' (예정)',''), racks:r.racks, spare:4, vpc:'vpc-'+t.short+'-01',
        partition:'part-'+t.id.replace('tenant-',''), suffix:t.domainSuffix,
        endpoint:'k8s-'+t.id.replace('tenant-','')+'.api.neocloud.skt.com:6443', allow:'211.198.10.0/24',
        csi:'VAST Data (csi.vastdata.com)', gds:true, capacity:2048,
        addons:['ingress-nginx','cert-manager','external-dns','NVSentinel','GPU Operator','Prometheus/Grafana/Loki'] };
    }
  }
  if(!WIZ.data.name){
    WIZ.data={ tenantId:null, name:'', k8sVersion:'v1.33.2', zone:'AIDC-1 / Zone C', racks:100, spare:4,
      vpc:'vpc-new-01', partition:'part-new', suffix:'<tenant>.neocloud.skt.com',
      endpoint:'k8s-new.api.neocloud.skt.com:6443', allow:'',
      csi:'VAST Data (csi.vastdata.com)', gds:true, capacity:2048,
      addons:['ingress-nginx','cert-manager','external-dns','NVSentinel','GPU Operator','Prometheus/Grafana/Loki'] };
  }
  elm.innerHTML=`
    <div class="page-h"><div><h1>클러스터 생성</h1>
      <div class="sub">${WIZ.data.reqId?`요청 <b>${WIZ.data.reqId}</b> 스펙 자동 적용 — `:''}NKD/NKE 프로비저닝 · Reserved 자원 자동 배치 ${apiIcon('wizard-submit')}</div></div>
      <div class="right"><button class="btn" onclick="App.navigate('#/k8s/workflow')">← 요청·작업</button></div></div>
    <div class="card"><div class="card-b">
      <div class="stepper" style="margin-bottom:20px">${WIZ_STEPS.map((s,i)=>{
        const n=i+1, cls=n<WIZ.step?'done':(n===WIZ.step?'now':'');
        return `<div class="step ${cls}"><span class="ball">${n<WIZ.step?'✓':n}</span>${s}</div>${n<6?'<div class="step '+(n<WIZ.step?'done':'')+'"><span class="bar"></span></div>':''}`;
      }).join('')}</div>
      <div id="wiz-body"></div>
      <div style="display:flex;justify-content:space-between;margin-top:20px">
        <button class="btn" ${WIZ.step===1?'style="visibility:hidden"':''} onclick="wizGo(${WIZ.step-1})">← 이전</button>
        ${WIZ.step<6?`<button class="btn btn-primary" onclick="wizGo(${WIZ.step+1})">다음 →</button>`
          : actionBtn('🚀 설치 실행','install','wizSubmit()')}
      </div>
    </div></div>`;
  wizBody();
});
function wizGo(n){ wizSave(); WIZ.step=Math.max(1,Math.min(6,n)); App.render(); }
function wizSave(){
  const g=id=>document.getElementById(id);
  const d=WIZ.data;
  if(g('w-name')) { d.name=g('w-name').value; d.k8sVersion=g('w-ver').value; d.zone=g('w-zone').value; }
  if(g('w-racks')) { d.racks=+g('w-racks').value; d.spare=+g('w-spare').value; }
  if(g('w-vpc')) { d.vpc=g('w-vpc').value; d.partition=g('w-part').value; d.suffix=g('w-suffix').value; d.endpoint=g('w-ep').value; d.allow=g('w-allow').value; }
  if(g('w-csi')) { d.csi=g('w-csi').value; d.gds=g('w-gds').classList.contains('on'); d.capacity=+g('w-cap').value; }
  if(document.querySelector('.w-addon')) d.addons=[...document.querySelectorAll('.w-addon:checked')].map(c=>c.value);
}
function wizBody(){
  const d=WIZ.data, box=document.getElementById('wiz-body');
  const F=(label,inner,hint)=>`<div style="margin-bottom:14px"><label class="small" style="font-weight:700;display:block;margin-bottom:5px">${label}</label>${inner}${hint?`<div class="small muted" style="margin-top:4px">${hint}</div>`:''}</div>`;
  const inp=(id,val,mono)=>`<input id="${id}" value="${esc(val)}" style="width:100%;padding:8px 11px;border:1px solid var(--line);border-radius:6px${mono?';font-family:var(--mono);font-size:12px':''}">`;
  if(WIZ.step===1){
    box.innerHTML=`<div class="grid" style="grid-template-columns:1fr 1fr">
      <div>${F('클러스터 이름', inp('w-name',d.name,true),'테넌트 ID와 동일 권장 (one-tenant-per-cluster)')}
      ${F('Kubernetes 버전', `<select id="w-ver" style="width:100%;padding:8px 11px;border:1px solid var(--line);border-radius:6px">
        ${['v1.33.2','v1.32.4','v1.31.9'].map(v=>`<option ${d.k8sVersion===v?'selected':''}>${v}</option>`).join('')}</select>`,'NKD 25.06 지원 버전')}</div>
      <div>${F('존 (Zone)', `<select id="w-zone" style="width:100%;padding:8px 11px;border:1px solid var(--line);border-radius:6px">
        ${['AIDC-1 / Zone A','AIDC-1 / Zone B','AIDC-1 / Zone C','AIDC-1 / Zone D'].map(z=>`<option ${d.zone===z?'selected':''}>${z}</option>`).join('')}</select>`,'가용성: Zone C 128랙 여유')}
      ${F('테넌트', `<div class="chip" style="padding:8px 12px">${d.tenantId?esc(NEOCLOUD_DATA.tenant(d.tenantId).company)+' ('+d.tenantId+')':'신규 테넌트'}</div>`)}</div></div>`;
  } else if(WIZ.step===2){
    box.innerHTML=`
      ${F('Control Plane','<div class="chip" style="padding:8px 12px">전용 3식 — 16 vCPU / 64 GB (hosted · 고객 접근 불가)</div>','plan_r10 소요자원 기준 고정')}
      ${F(`GPU Worker — Vera Rubin NVL72 랙 수량: <b id="w-racks-v">${d.racks}</b>랙 (= GPU ${(d.racks*72).toLocaleString()}기 · 트레이 ${(d.racks*18).toLocaleString()}노드)`,
        `<input type="range" id="w-racks" min="10" max="120" step="10" value="${d.racks}" style="width:100%"
          oninput="document.getElementById('w-racks-v').textContent=this.value">`,
        'Reserved 계약 수량. 랙 = 18 compute tray × 4 GPU')}
      ${F('Hot Spare (tray)', `<select id="w-spare" style="width:130px;padding:8px 11px;border:1px solid var(--line);border-radius:6px">
        ${[2,4,8].map(v=>`<option ${d.spare===v?'selected':''}>${v}</option>`).join('')}</select>`,'NVSentinel 장애 시 자동 투입 예비 트레이')}`;
  } else if(WIZ.step===3){
    box.innerHTML=`<div class="grid" style="grid-template-columns:1fr 1fr">
      <div>${F('VPC / 격리', inp('w-vpc',d.vpc,true),'DPU(NICo) VRF/VXLAN 하드 격리')}
      ${F('F5 Partition (route-domain)', inp('w-part',d.partition,true),'테넌트별 partition 분리 — 격리 유지 필수')}
      ${F('테넌트 도메인 suffix', inp('w-suffix',d.suffix,true),'prefix만 고객 자유 · suffix/존 플랫폼 강제 (ExternalDNS domain-filter)')}</div>
      <div>${F('apiserver 노출 endpoint', inp('w-ep',d.endpoint,true),'L4 passthrough VIP + DNS — 인증/RBAC은 apiserver 내부')}
      ${F('접근 allowlist (CIDR)', inp('w-allow',d.allow,true),'kubectl 접근 허용 대역 (쉼표 구분)')}</div></div>`;
  } else if(WIZ.step===4){
    box.innerHTML=`<div class="grid" style="grid-template-columns:1fr 1fr">
      <div>${F('CSI 벤더', `<select id="w-csi" style="width:100%;padding:8px 11px;border:1px solid var(--line);border-radius:6px">
        ${['VAST Data (csi.vastdata.com)','WEKA (csi.weka.io)','DDN EXAScaler'].map(v=>`<option ${d.csi===v?'selected':''}>${v}</option>`).join('')}</select>`,
        'block(RWO)·공유(RWX 병렬FS) 동적 프로비저닝')}
      ${F('GDS (GPUDirect Storage)', `<span class="switch ${d.gds?'on':''}" id="w-gds" onclick="this.classList.toggle('on')"><span class="tr"></span> 활성화</span>`,'학습 체크포인트/데이터셋 직접 I/O')}</div>
      <div>${F('초기 용량 (TB)', inp('w-cap',d.capacity,true),'테넌트 Quota — 이후 증설 요청으로 확장')}</div></div>`;
  } else if(WIZ.step===5){
    const all=['ingress-nginx','cert-manager','external-dns','NVSentinel','GPU Operator','Prometheus/Grafana/Loki','KAI Scheduler / Kueue','Slurm (SUNK)'];
    const desc={'ingress-nginx':'L7 라우팅·TLS 종료 (VIP 1개 공유)','cert-manager':'인증서 자동 발급/갱신','external-dns':'LB IP→DNS 자동 등록',
      'NVSentinel':'GPU 헬스·자동복구 (필수)','GPU Operator':'드라이버·DCGM (필수)','Prometheus/Grafana/Loki':'모니터링·로그 (필수)',
      'KAI Scheduler / Kueue':'배치/큐 스케줄링 (P1)','Slurm (SUNK)':'HPC 스타일 학습 잡'};
    box.innerHTML=`<div class="grid" style="grid-template-columns:1fr 1fr">${all.map(a=>`
      <label class="card" style="display:flex;gap:10px;padding:12px 14px;cursor:pointer;box-shadow:none">
        <input type="checkbox" class="w-addon" value="${a}" ${d.addons.includes(a)?'checked':''} ${['NVSentinel','GPU Operator','Prometheus/Grafana/Loki'].includes(a)?'onclick="return false" checked':''}>
        <div><b class="small">${a}</b><div class="small muted">${desc[a]}</div></div></label>`).join('')}</div>`;
  } else {
    box.innerHTML=`<table class="table">
      ${[['클러스터',`<code>${esc(d.name)}</code> · ${d.k8sVersion} · ${esc(d.zone)}`],
        ['노드풀',`VR NVL72 × <b>${d.racks}랙</b> (GPU ${(d.racks*72).toLocaleString()} · 노드 ${(d.racks*18).toLocaleString()}) + spare ${d.spare} tray`],
        ['네트워킹',`${esc(d.vpc)} · ${esc(d.partition)} · <code>*.${esc(d.suffix)}</code>`],
        ['apiserver',`<code>${esc(d.endpoint)}</code> · allowlist ${esc(d.allow||'—')}`],
        ['스토리지',`${esc(d.csi)} · GDS ${d.gds?'ON':'OFF'} · ${d.capacity} TB`],
        ['애드온',d.addons.map(a=>`<span class="chip">${a}</span>`).join(' ')],
      ].map(([k,v])=>`<tr><td class="muted" style="width:110px">${k}</td><td>${v}</td></tr>`).join('')}</table>
      <div class="card" style="margin-top:14px;background:var(--accent-soft);border-color:transparent"><div class="card-b small">
        실행 시: Reserved 랙 Lock → NKD 설치(batch) → 애드온 → NS/RBAC(<code>default/slurm/dynamo</code>) → Acceptance 검증(NCCL/DCGM) 순으로 진행됩니다. ${apiIcon('wizard-submit')}
      </div></div>`;
  }
}
function wizSubmit(){
  wizSave();
  const d=WIZ.data;
  if(d.tenantId){
    const t=NEOCLOUD_DATA.tenant(d.tenantId);
    t.lifecycle='Reserved'; t.note='설치 파이프라인 시작됨';
    const r=NEOCLOUD_DATA.requests.find(x=>x.id===d.reqId); if(r) r.status='진행중';
    if(!NEOCLOUD_DATA.jobs.find(j=>j.tenantId===d.tenantId&&j.type==='install')){
      NEOCLOUD_DATA.jobs.unshift({ id:'JOB-1183', type:'install', tenantId:d.tenantId, title:'클러스터 설치 — '+t.company,
        progress:4, currentStage:'BM 준비 (batch 1/17)', startedAt:'2026-07-09 11:02', racksDone:4,
        stages:[
          {name:'BM 준비 ('+d.racks+'랙 인벤토리·펌웨어)', status:'now', at:'2026-07-09 11:02'},
          {name:'NKD 클러스터 설치 (CP 3식 + Worker join)', status:'pending', at:null},
          {name:'애드온 설치 ('+d.addons.length+'종)', status:'pending', at:null},
          {name:'NS/RBAC 구성 (default/slurm/dynamo + 템플릿)', status:'pending', at:null},
          {name:'Acceptance 검증 (NCCL/DCGM/Storage)', status:'pending', at:null},
        ]});
    }
    toast('설치 파이프라인 시작 — '+t.company);
    App.navigate('#/k8s/clusters/'+d.tenantId+'/progress');
  } else {
    toast('설치 파이프라인 시작 (신규 테넌트, mock)');
    App.navigate('#/k8s/workflow');
  }
}

/* ---------- 설치 진행 ---------- */
App.register('#/k8s/clusters/:tenantId/progress', function(elm, p){
  const t=NEOCLOUD_DATA.tenant(p.tenantId);
  const job=NEOCLOUD_DATA.jobs.find(j=>j.tenantId===p.tenantId && (j.type==='install'||j.type==='retire'));
  if(!t||!job){ elm.innerHTML='<div class="empty">진행 중 작업 없음</div>'; return; }
  const isRetire=job.type==='retire';
  const cells=Array.from({length:100},(_,i)=>{
    const done=i<job.racksDone, run=i>=job.racksDone && i<job.racksDone+6 && job.progress<100;
    return `<i class="${done?'done':(run?'run':'')}" title="rack ${String(i+1).padStart(3,'0')}"></i>`;
  }).join('');
  elm.innerHTML=`
    <div class="page-h"><div><h1>${isRetire?'반납 진행':'설치 진행'} — ${esc(t.company)} <span class="chip">${job.id}</span></h1>
      <div class="sub">${esc(job.currentStage)} · 시작 ${job.startedAt} ${apiIcon('install-pipeline')}</div></div>
      <div class="right"><button class="btn" onclick="App.navigate('#/k8s/clusters/${t.id}')">클러스터 상세</button>
        ${job.progress>=100||t.lifecycle==='Active'?'':actionBtn('검증 리포트 미리보기','install',`App.navigate('#/k8s/clusters/${t.id}/acceptance')`,{secondary:true})}</div></div>
    <div class="grid" style="grid-template-columns:1fr 1.4fr;align-items:start">
      <div class="grid">
        <div class="card"><div class="card-h">파이프라인</div><div class="card-b"><div class="timeline">
          ${job.stages.map(s=>`<div class="tl-item ${s.status}">
            <b>${esc(s.name)}</b><div class="small muted">${s.at||'대기'}</div></div>`).join('')}
        </div></div></div>
        <div class="card"><div class="card-h">${isRetire?'Secure Erase':'랙 Batch'} 진행 <div class="right small muted">${job.racksDone}/100랙 (${job.progress}%)</div></div>
          <div class="card-b"><div class="batchgrid">${cells}</div>
          <div style="margin-top:10px">${bar(job.progress, isRetire?'var(--amber)':null)}</div></div></div>
      </div>
      <div class="card" style="display:flex;flex-direction:column;min-height:520px">
        <div class="logctl">
          <b>${isRetire?'wipe.log':'nkd-installer.log'}</b>
          <span class="switch on" onclick="this.classList.toggle('on');progressLog('${t.id}',${isRetire},this.classList.contains('on'))"><span class="tr"></span> follow</span>
          <span class="muted mono" style="margin-left:auto">tail -f · ${isRetire?'secure-erase':'batch '+Math.ceil((job.racksDone+1)/6)+'/17'}</span>
        </div>
        <div class="logbox" id="prog-log" style="flex:1"></div>
      </div>
    </div>`;
  progressLog(t.id, isRetire, true);
});
function progressLog(tenantId, isRetire, follow){
  const box=document.getElementById('prog-log'); if(!box) return;
  startLogStream(box, NEOCLOUD_DATA.logs[isRetire?'wipe':'installer'], {follow, tail:60});
}

/* ---------- Acceptance 리포트 ---------- */
const ACCEPTANCE={
  nccl:[ ['64 MiB','412.7','≥ 380','PASS'], ['256 MiB','455.3','≥ 420','PASS'], ['512 MiB','486.1','≥ 450','PASS'], ['1 GiB','491.8','≥ 450','PASS'] ],
  dcgm:[ ['Diagnostic (r3, 전체 GPU)','7,200 / 7,200 통과','PASS'], ['Memory / PCIe / NVLink','오류 0건','PASS'], ['Thermal / Power','정상 범위','PASS'] ],
  net:[ ['RoCE p2p (tray↔tray)','392 Gbps','≥ 360','PASS'], ['In-rack NVLink (NVL72)','1.71 TB/s','≥ 1.6','PASS'] ],
  sto:[ ['GDS Sequential Read','182 GB/s','≥ 150','PASS'], ['4k Random IOPS','2.4M','≥ 2.0M','PASS'] ],
};
function renderAcceptance(box, tenantId, opts={}){
  const t=NEOCLOUD_DATA.tenant(tenantId);
  const sec=(title,head,rows)=>`<div class="card" style="box-shadow:none;margin-bottom:12px"><div class="card-h small">${title}</div>
    <table class="table"><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr>
    ${rows.map(r=>`<tr>${r.map((c,i)=>`<td class="${i===r.length-1?'ok':''} small">${c==='PASS'?'✓ PASS':c}</td>`).join('')}</tr>`).join('')}</table></div>`;
  box.innerHTML=`
    <div class="card" style="background:var(--green-soft);border-color:transparent;margin-bottom:14px"><div class="card-b" style="display:flex;align-items:center;gap:14px">
      <span style="font-size:26px">✅</span><div><b>Acceptance 종합 PASS</b>
      <div class="small muted">${esc(t.company)} · ${opts.readonly?'개통 시점 리포트 ('+(t.since||'2026-07-09')+')':'2026-07-09 11:58 실행'} · ai-cloud-validation v2.4</div></div>
      ${opts.readonly?'':`<div style="margin-left:auto">${actionBtn('개통 승인 → kubeconfig 발급','approve',`acceptApprove('${tenantId}')`)}</div>`}
    </div></div>
    <div class="grid" style="grid-template-columns:1fr 1fr">
      <div>${sec('NCCL all-reduce (576 GPU 샘플)',['메시지','busbw (GB/s)','기준','판정'],ACCEPTANCE.nccl)}
      ${sec('네트워크',['항목','측정','기준','판정'],ACCEPTANCE.net)}</div>
      <div>${sec('DCGM 진단',['항목','결과','판정'],ACCEPTANCE.dcgm)}
      ${sec('스토리지 (GDS)',['항목','측정','기준','판정'],ACCEPTANCE.sto)}</div>
    </div>`;
}
App.register('#/k8s/clusters/:tenantId/acceptance', function(elm, p){
  const t=NEOCLOUD_DATA.tenant(p.tenantId);
  elm.innerHTML=`<div class="page-h"><div><h1>Acceptance 검증 리포트 — ${esc(t.company)}</h1>
    <div class="sub">NCCL · DCGM · 네트워크 · 스토리지 자동 검증 (설치 파이프라인 5단계)</div></div>
    <div class="right"><button class="btn" onclick="App.navigate('#/k8s/clusters/${t.id}/progress')">← 설치 진행</button></div></div>
    <div id="accept-box"></div>`;
  renderAcceptance(document.getElementById('accept-box'), p.tenantId, {readonly:t.lifecycle==='Active'});
});
function acceptApprove(tenantId){
  const t=NEOCLOUD_DATA.tenant(tenantId);
  t.lifecycle='Active'; t.day=2; t.note=null; t.since='2026-07-09';
  const job=NEOCLOUD_DATA.jobs.find(j=>j.tenantId===tenantId&&j.type==='install');
  if(job){ job.progress=100; job.racksDone=100; job.currentStage='개통 완료'; job.stages.forEach(s=>s.status='done'); }
  const r=NEOCLOUD_DATA.requests.find(x=>x.tenantId===tenantId&&x.kind==='설치'); if(r) r.status='개통완료';
  toast('개통 승인 — 고객포탈/메일로 개통 통지 발송됨 (mock)');
  App.navigate('#/k8s/access?issue='+tenantId);
}

/* ---------- API 스펙 ---------- */
NEOCLOUD_DATA.apiSpecs['wizard-submit']={
  title:'클러스터 생성 요청 — Admin API',
  intro:'마법사 6단계의 최종 제출 페이로드. 백엔드가 NKD/NKE 프로비저닝 API로 변환.',
  tabs:{
    'Request':
`POST /admin/v1/clusters
Authorization: Bearer <keycloak-access-token>
Content-Type: application/json

{
  "requestId": "REQ-2607-014",
  "cluster": {
    "name": "tenant-gamma",
    "kubernetesVersion": "v1.33.2",
    "zone": "AIDC-1/zone-c",
    "controlPlane": { "dedicated": true, "count": 3 },   # 16vCPU/64GB x 3
    "nodePools": [{
      "name": "gpu-workers",
      "machineType": "vr-nvl72-tray",     # Vera Rubin tray (4 GPU)
      "rackCount": 100,                   # = 1,800 nodes / 7,200 GPU
      "hotSpareTrays": 4
    }],
    "networking": {
      "vpc": "vpc-gamma-01",
      "f5Partition": "part-gamma",        # route-domain 분리
      "domainSuffix": "google.neocloud.skt.com",
      "apiServer": {
        "endpoint": "k8s-gamma.api.neocloud.skt.com:6443",
        "allowlist": ["211.198.10.0/24"]
      }
    },
    "storage": { "csi": "vast", "gds": true, "quotaTB": 2048 },
    "addons": ["ingress-nginx","cert-manager","external-dns",
               "nvsentinel","gpu-operator","lgtm-stack"]
  }
}`,
    'Response':
`HTTP/1.1 202 Accepted

{
  "clusterId": "tenant-gamma",
  "jobId": "JOB-1183",
  "status": "Reserved",            # 자원 Lock 완료 → 설치 시작
  "pipeline": [
    "bm-prepare", "nkd-install", "addon-install",
    "ns-rbac", "acceptance"
  ],
  "watch": "GET /admin/v1/jobs/JOB-1183/events (SSE)"
}`,
  }
};
NEOCLOUD_DATA.apiSpecs['install-pipeline']={
  title:'설치 파이프라인 로그/이벤트 스트림',
  intro:'진행 화면의 로그 패널이 소비하는 스트림. 클러스터 내부 로그는 표준 Pod log API 사용.',
  tabs:{
    'Request':
`# 파이프라인 이벤트 (포탈 백엔드 SSE)
GET /admin/v1/jobs/JOB-1183/events
Accept: text/event-stream

# NKD installer Pod 로그 (표준 K8s API)
GET /api/v1/namespaces/neocloud-system/pods/nkd-installer-b11/log
    ?container=installer&follow=true&tailLines=200&timestamps=true`,
    'Response (SSE)':
`event: stage
data: {"job":"JOB-1183","stage":"addon-install","batch":"11/17","racksDone":62}

event: log
data: {"ts":"2026-07-08T11:49:15+09:00","line":"[nkd] batch 11/17 addon install 완료"}

event: stage
data: {"job":"JOB-1183","stage":"acceptance","result":"PASS","report":"/admin/v1/jobs/JOB-1183/acceptance"}`,
  }
};

/* ============================================================
 * 네트워킹·외부노출 — External LB(F5) / Service 감지 / DNS / Ingress
 * ============================================================ */
App.register('#/k8s/networking', function(elm, p){
  const tab=p.tab||'lb';
  const tabs=[['lb','External LB (F5)'],['svc','Service 감지'],['dns','DNS (ExternalDNS)'],['ingress','Ingress / TLS']];
  elm.innerHTML=`
    <div class="page-h"><div><h1>네트워킹 · 외부노출</h1>
      <div class="sub">F5 BIG-IP (L4 공인 VIP) → NodePort → ingress-nginx (L7/TLS) — DNS는 트래픽 경로 밖</div></div>
      <div class="right"><span class="chip">F5 iControl 연결됨 <span style="color:var(--green)">●</span></span><span class="chip">Route53 sync 2분 전</span></div></div>
    <div class="tabs">${tabs.map(([k,l])=>`<button class="${tab===k?'on':''}" onclick="App.navigate('#/k8s/networking?tab=${k}')">${l}</button>`).join('')}</div>
    <div id="net-tab"></div>`;
  const box=document.getElementById('net-tab');
  ({lb:netTabLb, svc:netTabSvc, dns:netTabDns, ingress:netTabIngress}[tab])(box);
});

function netTabLb(box){
  const rows=NEOCLOUD_DATA.lbVips.map(v=>{
    const t=NEOCLOUD_DATA.tenant(v.tenantId);
    const up=v.poolMembers.filter(m=>m.state==='up').length;
    return `<tr class="click" onclick="netVipDetail('${v.id}')">
      <td><b>${esc(t.company)}</b><div class="small muted">${v.partition}</div></td>
      <td class="mono"><b>${v.vip}</b><div class="small muted">${v.ports}</div></td>
      <td class="small">${esc(v.type)}</td>
      <td class="mono small">${esc(v.boundSvc)}</td>
      <td>${badge(v.health)}<div class="small muted">pool ${up}/${v.poolMembers.length} up</div></td>
      <td>${sparkline(v.tpGbps)}<div class="small muted">${v.tpGbps[v.tpGbps.length-1]} Gbps</div></td>
    </tr>`;
  }).join('');
  box.innerHTML=`<div class="card">
    <div class="card-h">공인 VIP 현황 ${apiIcon('svc-lb-3steps')}
      <div class="right small muted">F5 BIG-IP · 200Gbps All-Active × 2식 (공통 관리 plane)</div></div>
    <table class="table"><tr><th>테넌트</th><th>VIP</th><th>유형</th><th>연결 Service</th><th>상태</th><th>처리량</th></tr>${rows}</table>
    <div class="card-b small muted">VIP 소유 = F5 ADC (자체 컨트롤러는 read-back/write-back만, IPAM 안 함) · 테넌트별 partition/route-domain 분리로 DPU 격리 유지</div></div>`;
}
function netVipDetail(vipId){
  const v=NEOCLOUD_DATA.lbVips.find(x=>x.id===vipId);
  const t=NEOCLOUD_DATA.tenant(v.tenantId);
  const members=v.poolMembers.map(m=>`<tr><td class="mono">${m.node}</td><td class="mono">${m.ep}</td>
    <td>${m.state==='up'?'<span class="badge b-green">UP</span>':'<span class="badge b-red">DOWN</span>'}</td></tr>`).join('');
  openModal(`VIP ${v.vip} <span class="chip">${esc(t.company)}</span> ${badge(v.health)}`,
    `<table class="table">
      <tr><td class="muted" style="width:130px">유형</td><td>${esc(v.type)}</td></tr>
      <tr><td class="muted">Listener</td><td class="mono">${v.ports}</td></tr>
      <tr><td class="muted">F5 Partition</td><td class="mono">${v.partition}</td></tr>
      <tr><td class="muted">연결 Service</td><td class="mono">${esc(v.boundSvc)} <a href="#/k8s/networking?tab=svc" onclick="closeModal()">→</a></td></tr>
     </table>
     <h4 class="small" style="margin:14px 0 8px;font-weight:700">Pool Members (노드IP:NodePort) ${apiIcon('svc-lb-3steps')}</h4>
     <table class="table"><tr><th>노드</th><th>Endpoint</th><th>Health</th></tr>${members}</table>
     <p class="small muted" style="margin-top:10px">${esc(v.note)}. Pool member는 EndpointSlice/Node watch로 <b>지속 동기화</b>됩니다.</p>`,
    '');
}

function netTabSvc(box){
  const PHASES=['detected','ensure','assigned','writeback'];
  const rows=NEOCLOUD_DATA.lbServices.map(s=>{
    const t=NEOCLOUD_DATA.tenant(s.tenantId);
    const pi=PHASES.indexOf(s.phase);
    const machine=PHASES.map((ph,i)=>`<span class="chip" style="${i<=pi?'background:var(--accent-soft);color:var(--accent);font-weight:700':''}">${
      {detected:'감지',ensure:'EnsureLB',assigned:'VIP 할당',writeback:'write-back'}[ph]}</span>${i<3?' → ':''}`).join('');
    return `<tr>
      <td><b class="mono small">${s.ns}/${s.name}</b><div class="small muted">${esc(t.company)} · ${s.createdAt}</div></td>
      <td class="mono small">${s.ports}</td>
      <td class="small">${machine}</td>
      <td class="mono">${s.vip?`<b>${s.vip}</b>`:`<span class="badge b-amber">&lt;pending&gt;</span>`}</td>
      <td class="small mono muted">${s.annotation}</td>
    </tr>`;
  }).join('');
  box.innerHTML=`<div class="card">
    <div class="card-h">type=LoadBalancer Service 감지 현황 ${apiIcon('svc-lb-3steps')}
      <div class="right"><code class="small">watch services?fieldSelector=spec.type=LoadBalancer</code></div></div>
    <table class="table"><tr><th>Service</th><th>Ports</th><th>상태머신</th><th>External IP</th><th>Annotation</th></tr>${rows}</table>
    <div class="card-b small muted">자체 LB 컨트롤러 3책무: ① F5 프로비저닝(AS3) ② DNS 등록 위임(ExternalDNS) ③ <code>status.loadBalancer.ingress[].ip</code> write-back — 누락 시 <code>&lt;pending&gt;</code> 고착</div></div>`;
}

function netTabDns(box){
  const D=NEOCLOUD_DATA;
  const rows=D.dnsRecords.map(r=>{
    const t=D.tenant(r.tenantId);
    return `<tr>
      <td class="mono small"><b>${esc(r.fqdn)}</b></td>
      <td><span class="chip">${r.type}</span></td>
      <td class="mono small" style="max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.target)}">${esc(r.target)}</td>
      <td class="small">${esc(r.source)}</td>
      <td class="small muted">${esc(t.company)} · TTL ${r.ttl}</td>
    </tr>`;
  }).join('');
  box.innerHTML=`
    <div class="card" style="margin-bottom:14px">
      <div class="card-h">등록 레코드 (Route53) ${apiIcon('dns-endpoint')}</div>
      <table class="table"><tr><th>FQDN</th><th>Type</th><th>Target</th><th>Source</th><th>테넌트</th></tr>${rows}</table>
      <div class="card-b small muted">DNS는 <b>트래픽 경로 밖</b> — 고객은 질의 후 F5 VIP로 직접 접속. 와일드카드 1회 등록 후 앱 추가 시 DNS 등록 행위 자체가 불필요.</div></div>
    <div class="grid" style="grid-template-columns:1fr 1fr">
      <div class="card"><div class="card-h">테넌트 도메인 정책 ${apiIcon('ingress-policy')}</div><div class="card-b small">
        <p style="margin-bottom:8px"><b>prefix만 자유 · suffix/존은 플랫폼 강제</b></p>
        ${D.dnsPolicy.flags.map(f=>`<div class="mono" style="padding:4px 0;color:var(--ink-2)">${esc(f)}</div>`).join('')}
        <p class="muted" style="margin-top:8px">${esc(D.dnsPolicy.gate)}</p></div></div>
      <div class="card"><div class="card-h">Admission 게이트 (Kyverno)</div><div class="card-b small">
        <p>${esc(D.dnsPolicy.admission)}</p>
        <p class="muted" style="margin-top:8px">TXT registry 레코드로 소유권 충돌 방지, <code>--policy=upsert-only</code>로 오삭제 방지. Provider: ${esc(D.dnsPolicy.provider)}</p></div></div>
    </div>`;
}

function netTabIngress(box){
  const D=NEOCLOUD_DATA;
  const ctrls=D.ingressControllers.map(c=>{
    const t=D.tenant(c.tenantId);
    return `<tr><td><b>${esc(t.company)}</b></td><td class="mono small">${c.name} (class: ${c.cls}) v${c.version}</td>
      <td>${c.replicas}</td><td class="mono">${c.vip}</td><td>${badge('healthy')}</td></tr>`;
  }).join('');
  const ings=D.ingresses.map(i=>{
    const t=D.tenant(i.tenantId);
    return `<tr><td class="mono small"><b>${esc(i.host)}</b><div class="muted">${i.ns}/${i.name} · ${esc(t.company)}</div></td>
      <td class="mono small">${i.path}</td><td class="mono small">${i.backend}</td><td class="mono small">${i.tls}</td></tr>`;
  }).join('');
  const certs=D.certs.map(c=>{
    const t=D.tenant(c.tenantId);
    const cls=c.daysLeft<15?'b-amber':(c.daysLeft<5?'b-red':'b-green');
    return `<tr><td class="mono small"><b>${esc(c.cn)}</b><div class="muted">${c.name} · ${esc(t.company)}</div></td>
      <td class="small">${c.issuer}</td><td class="small">${c.notAfter}</td>
      <td><span class="badge ${cls}">D-${c.daysLeft}</span> <span class="small muted">자동갱신</span></td></tr>`;
  }).join('');
  box.innerHTML=`
    <div class="card" style="margin-bottom:14px"><div class="card-h">Ingress Controller (테넌트당 1세트 · Pod×N + HPA)</div>
      <table class="table"><tr><th>테넌트</th><th>Controller</th><th>Replicas</th><th>VIP</th><th>상태</th></tr>${ctrls}</table></div>
    <div class="grid" style="grid-template-columns:1.3fr 1fr;align-items:start">
      <div class="card"><div class="card-h">Ingress 규칙 ${apiIcon('ingress-policy')}</div>
        <table class="table"><tr><th>Host</th><th>Path</th><th>Backend</th><th>TLS Secret</th></tr>${ings}</table>
        <div class="card-b small muted">앱 추가 = Deployment + Service(ClusterIP) + Ingress 3종뿐 — ADC/DNS 무관 (와일드카드가 커버)</div></div>
      <div class="card"><div class="card-h">TLS 인증서 (cert-manager) ${apiIcon('cert-status')}</div>
        <table class="table"><tr><th>CN</th><th>Issuer</th><th>만료</th><th>상태</th></tr>${certs}</table>
        <div class="card-b small muted">TLS 종료 = ingress-nginx Pod (F5는 L4 통과, 인증서를 ADC에 넘기지 않음)</div></div>
    </div>`;
}

/* ---------- API 스펙 ---------- */
NEOCLOUD_DATA.apiSpecs['svc-lb-3steps']={
  title:'External LB — Service → F5 AS3 → write-back (3단계)',
  intro:'고객이 만드는 표준 <code>Service</code> → 자체 LB 컨트롤러가 F5 프로그래밍 → status write-back. 고객에게는 표준 K8s 규격 그대로.',
  tabs:{
    '① 고객 Service (표준)':
`apiVersion: v1
kind: Service
metadata:
  name: triton-grpc
  namespace: default
  annotations:
    neocloud.skt.com/lb-type: public       # 전용 공인 VIP 요청
    external-dns.alpha.kubernetes.io/hostname: grpc.claude.neocloud.skt.com
spec:
  type: LoadBalancer
  externalTrafficPolicy: Local             # 원본 IP 보존 + 홉 절약
  selector:
    app: triton
  ports:
  - name: grpc
    port: 9000          # Service 앞단 포트
    targetPort: 9000    # Pod가 listen하는 포트
    protocol: TCP
# nodePort(30900)는 자동 할당 — F5가 노드IP:30900으로 포워딩`,
    '② F5 AS3 (컨트롤러 생성)':
`POST https://f5-mgmt.neocloud.skt.com/mgmt/shared/appsvcs/declare
Content-Type: application/json

{
  "class": "AS3",
  "declaration": {
    "class": "ADC", "schemaVersion": "3.50.0",
    "part-alpha": {                          # 테넌트 partition (route-domain 101)
      "class": "Tenant",
      "triton-grpc": {
        "class": "Application",
        "vip_triton_grpc": {
          "class": "Service_TCP",
          "virtualAddresses": ["211.234.100.23"],   # VIP 소유 = ADC
          "virtualPort": 9000,
          "pool": "pool_triton_grpc"
        },
        "pool_triton_grpc": {
          "class": "Pool",
          "monitors": ["tcp"],
          "members": [{
            "servicePort": 30900,                    # nodePort
            "serverAddresses": [
              "10.10.12.13", "10.10.34.49",
              "10.10.34.50", "10.10.56.11"           # EndpointSlice watch로 지속 동기화
            ]
          }]
        }
      }
    }
  }
}`,
    '③ status write-back':
`PATCH /api/v1/namespaces/default/services/triton-grpc/status
Content-Type: application/merge-patch+json

{
  "status": {
    "loadBalancer": {
      "ingress": [
        { "ip": "211.234.100.23" }    # 이 시점에 <pending> 해소
      ]
    }
  }
}

# 이후 kubectl get svc triton-grpc
# NAME          TYPE           EXTERNAL-IP      PORT(S)
# triton-grpc   LoadBalancer   211.234.100.23   9000:30900/TCP`,
  }
};
NEOCLOUD_DATA.apiSpecs['dns-endpoint']={
  title:'DNS 자동 등록 — ExternalDNS (DNSEndpoint CRD 게이트)',
  intro:'자체 컨트롤러가 정책 검사 후 DNSEndpoint CRD 발행 → ExternalDNS가 Route53 등록. DNS API 연동은 OSS에 위임.',
  tabs:{
    'DNSEndpoint CRD':
`apiVersion: externaldns.k8s.io/v1alpha1
kind: DNSEndpoint
metadata:
  name: triton-grpc-public
  namespace: neocloud-system        # 게이트 컨트롤러 전용 NS
  labels:
    neocloud.skt.com/tenant: tenant-alpha
spec:
  endpoints:
  - dnsName: grpc.claude.neocloud.skt.com   # suffix 정책검사 통과분만
    recordType: A
    recordTTL: 300
    targets:
    - "211.234.100.23"                        # Service status의 VIP`,
    'ExternalDNS 설정':
`# external-dns deployment args (테넌트별)
args:
- --source=crd                        # DNSEndpoint만 소비 (게이트 방식)
- --crd-source-apiversion=externaldns.k8s.io/v1alpha1
- --crd-source-kind=DNSEndpoint
- --provider=aws                      # Route53
- --domain-filter=claude.neocloud.skt.com    # 존 밖 등록 불가
- --policy=upsert-only                # 오삭제 방지
- --registry=txt
- --txt-owner-id=neocloud-alpha       # 소유권 충돌 방지`,
    'Route53 결과':
`;; 등록 결과 (dig)
grpc.claude.neocloud.skt.com.  300  IN  A    211.234.100.23
grpc.claude.neocloud.skt.com.  300  IN  TXT  "heritage=external-dns,
  external-dns/owner=neocloud-alpha,
  external-dns/resource=service/default/triton-grpc"

;; 와일드카드 (온보딩 시 1회)
*.claude.neocloud.skt.com.     300  IN  A    211.234.100.17`,
  }
};
NEOCLOUD_DATA.apiSpecs['ingress-policy']={
  title:'Ingress + 도메인 강제 정책 (Kyverno)',
  intro:'고객 Ingress는 표준 규격. host의 suffix는 admission에서 강제.',
  tabs:{
    '고객 Ingress (표준)':
`apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: vllm-api
  namespace: default
  annotations:
    cert-manager.io/cluster-issuer: lets-encrypt-dns01
spec:
  ingressClassName: nginx
  tls:
  - hosts: ["api.claude.neocloud.skt.com"]
    secretName: api-claude-tls
  rules:
  - host: api.claude.neocloud.skt.com     # prefix(api)만 자유
    http:
      paths:
      - path: /v1
        pathType: Prefix
        backend:
          service:
            name: vllm-api
            port: { number: 8000 }`,
    'Kyverno 정책':
`apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: enforce-tenant-domain-suffix
spec:
  validationFailureAction: Enforce      # 위반 시 생성 거부
  rules:
  - name: ingress-host-suffix
    match:
      any:
      - resources:
          kinds: ["Ingress"]
    validate:
      message: "Ingress host must end with .claude.neocloud.skt.com"
      pattern:
        spec:
          rules:
          - host: "*.claude.neocloud.skt.com"`,
  }
};
NEOCLOUD_DATA.apiSpecs['cert-status']={
  title:'TLS 인증서 — cert-manager Certificate',
  intro:'발급·갱신은 cert-manager 자동. F5에는 인증서를 넘기지 않음(L4 통과).',
  tabs:{
    'Certificate':
`apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: wildcard-claude-tls
  namespace: ingress-nginx
spec:
  secretName: wildcard-claude-tls
  commonName: "*.claude.neocloud.skt.com"
  dnsNames: ["*.claude.neocloud.skt.com"]
  issuerRef:
    kind: ClusterIssuer
    name: lets-encrypt-dns01     # DNS-01 챌린지 (Route53 임시 TXT)
  renewBefore: 720h              # 만료 30일 전 자동 갱신
status:
  notAfter: "2026-09-07T02:11:00Z"
  conditions:
  - type: Ready
    status: "True"`,
  }
};

/* ============================================================
 * 접근관리 — kubeconfig 발급/회전/회수 (Vault PKI) + RBAC 매핑
 *   tenant-operator: 테넌트 NS 전체 CRUD
 *   tenant-user   : 발급 시 선택한 NS만 CRUD (O=tenant-user-<ns> 그룹)
 *   전 역할       : nodes 조회(R) — one-tenant-per-cluster라 안전
 * ============================================================ */
const ISSUE={ step:1, tenantId:null, role:'tenant-user', ttl:'72h', user:'', nsScope:['default'] };

App.register('#/k8s/access', function(elm, p){
  const tab=p.tab||'issued';
  const tabs=[['issued','발급 현황'],['rbac','역할 템플릿 · RBAC']];
  elm.innerHTML=`
    <div class="page-h"><div><h1>접근관리 (kubeconfig)</h1>
      <div class="sub">Vault PKI 인증서 기반 · 단기 TTL 자동 회전 — OIDC(Keycloak)는 포탈 SSO 전용, apiserver 인증과 무관 ${apiIcon('vault-issue')}</div></div>
      <div class="right"><button class="btn btn-primary" onclick="issueOpen(${p.issue?`'${p.issue}'`:'null'})">+ kubeconfig 발급</button></div></div>
    <div class="tabs">${tabs.map(([k,l])=>`<button class="${tab===k?'on':''}" onclick="App.navigate('#/k8s/access?tab=${k}')">${l}</button>`).join('')}</div>
    <div id="acc-tab"></div>`;
  const box=document.getElementById('acc-tab');
  if(tab==='issued') accTabIssued(box); else accTabRbac(box);
  if(p.issue){ issueOpen(p.issue); App.state.route='#/k8s/access'; }
});

function nsScopeChips(k){
  if(k.nsScope==='전체') return '<span class="chip" style="background:var(--green-soft);color:var(--green)">NS 전체</span>';
  return (k.nsScope||[]).map(n=>`<span class="chip">${n}</span>`).join(' ');
}
function accTabIssued(box){
  const roleChip=r=>({'skt-admin':'<span class="chip" style="background:#3a1a20;color:#f0a3b0">SKT Admin</span>',
    'tenant-operator':'<span class="chip" style="background:#3a2f12;color:#e8c66a">Tenant-operator</span>',
    'tenant-user':'<span class="chip" style="background:#152a40;color:#9fd0ff">Tenant-user</span>'}[r]);
  const rows=NEOCLOUD_DATA.kubeconfigs.map((k,i)=>{
    const t=NEOCLOUD_DATA.tenant(k.tenantId);
    const dim=k.status==='revoked'||k.status==='expired';
    return `<tr class="${dim?'dim':''}">
      <td><b>${esc(k.user)}</b><div class="small muted">${esc(k.email)}</div></td>
      <td class="small">${esc(t.company)}</td>
      <td>${roleChip(k.role)}<div style="margin-top:3px">${nsScopeChips(k)}</div></td>
      <td class="mono small">${k.serial}</td>
      <td class="small">${k.issuedAt}<div class="muted">TTL ${k.ttl}</div></td>
      <td class="small">${k.expiresAt}</td>
      <td>${badge(k.status)}</td>
      <td style="white-space:nowrap">${dim?'—':
        `<button class="btn btn-sm" onclick="accViewKubeconfig(${i})">보기</button>
         <button class="btn btn-sm" onclick="accReissue(${i})">재발급</button>
         <button class="btn btn-sm" onclick="accRevoke(${i})" style="color:var(--red)">회수</button>`}</td>
    </tr>`;
  }).join('');
  box.innerHTML=`
    <div class="grid" style="grid-template-columns:1fr 1fr 1fr;margin-bottom:14px">
      <div class="card kpi"><span class="v">${NEOCLOUD_DATA.kubeconfigs.filter(k=>k.status==='active').length}</span><span class="l">Active 인증서</span></div>
      <div class="card kpi"><span class="v" style="color:var(--amber)">${NEOCLOUD_DATA.kubeconfigs.filter(k=>k.status==='expiring').length}</span><span class="l">만료 임박 (24h 내)</span></div>
      <div class="card kpi" style="justify-content:center"><span class="l" style="font-size:12.5px">🔄 <b>자동 회전</b> — TTL 72h · 만료 24h 전 자동 재발급<br><span class="muted">Vault PKI role별 발급 · 인증서는 native revoke 불가 → 단기 TTL로 위험 최소화</span></span></div>
    </div>
    <div class="card"><div class="card-h">발급 현황 ${apiIcon('vault-issue')} <div class="right small muted">Vault: pki-&lt;tenant&gt;/ (테넌트별 PKI 엔진 분리)</div></div>
    <table class="table"><tr><th>사용자</th><th>테넌트</th><th>역할 / NS 범위</th><th>인증서 Serial</th><th>발급</th><th>만료</th><th>상태</th><th></th></tr>${rows}</table></div>`;
}

/* 사용자별 kubeconfig 본문 생성 (개인키는 발급 시 1회만 노출 — 서버 미보관) */
function kubeconfigText(k, showKey){
  const t=NEOCLOUD_DATA.tenant(k.tenantId);
  const short=k.tenantId.replace('tenant-','');
  const orgs = k.role==='tenant-user' ? (k.nsScope||['default']).map(ns=>'tenant-user-'+ns)
             : [k.role];
  const defNs = k.role==='skt-admin' ? 'kube-system'
             : (k.nsScope==='전체'||!Array.isArray(k.nsScope)) ? 'default' : k.nsScope[0];
  return `# Subject: CN=${k.email}, ${orgs.map(o=>'O='+o).join(', ')}
# Serial: ${k.serial} · TTL ${k.ttl} · 만료 ${k.expiresAt}
apiVersion: v1
kind: Config
clusters:
- name: ${k.tenantId}
  cluster:
    server: https://k8s-${short}.api.neocloud.skt.com:6443
    certificate-authority-data: LS0tLS1CRUdJTi...  # 클러스터 CA (base64)
users:
- name: ${k.email}
  user:
    client-certificate-data: LS0tLS1CRUdJTi...     # CN/O가 위 Subject
    client-key-data: ${showKey?'LS0tLS1CRUdJTi4uLg==  # ⚠ 개인키 — 안전 보관':'(발급 시 1회만 제공 — 포탈은 개인키를 저장하지 않음)'}
contexts:
- name: ${k.tenantId}
  context: { cluster: ${k.tenantId}, user: ${k.email}, namespace: ${defNs} }
current-context: ${k.tenantId}`;
}
function accViewKubeconfig(i){
  const k=NEOCLOUD_DATA.kubeconfigs[i];
  openModal(`kubeconfig — ${esc(k.user)} ${badge(k.status)}`,
    codeBlock('kubeconfig-'+k.tenantId+'.yaml (미리보기)', kubeconfigText(k, false))+
    `<p class="small muted">포탈에는 인증서 메타데이터(serial·만료)만 보관됩니다. <b>개인키는 발급/재발급 시 1회만 전달</b>되며 서버에 저장하지 않습니다 — 분실 시 재발급이 원칙입니다.</p>`,
    `<button class="btn" onclick="closeModal()">닫기</button>`);
}
function accReissue(i){
  const k=NEOCLOUD_DATA.kubeconfigs[i];
  k.issuedAt='2026-07-09 14:30'; k.expiresAt='2026-07-12 14:30'; k.status='active';
  k.serial=Array.from({length:6},()=>Math.floor(Math.random()*256).toString(16).padStart(2,'0')).join(':');
  App.render();
  openModal(`재발급 완료 — ${esc(k.user)} <span class="chip mono">${k.serial}</span>`,
    codeBlock('kubeconfig-'+k.tenantId+'.yaml (새 인증서 — 이 화면에서만 개인키 포함)', kubeconfigText(k, true))+
    `<p class="small muted">기존 인증서는 남은 TTL 동안 유효하며(revoke 불가), 새 인증서로 교체를 안내하세요.</p>`,
    `<button class="btn btn-primary" onclick="toast('kubeconfig-${k.tenantId}.yaml 다운로드 (mock)')">⬇ 다운로드 (1회)</button>
     <button class="btn" onclick="toast('고객포탈 보안 전달함으로 발송 — ${esc(k.email)} (mock)')">고객포탈 보안 전달함으로 발송</button>
     <button class="btn" onclick="closeModal()">닫기</button>`);
}
function accRevoke(i){
  const k=NEOCLOUD_DATA.kubeconfigs[i];
  openModal(`kubeconfig 회수 — ${esc(k.user)} ${badge(k.status)}`,
    `<div class="card" style="background:var(--amber-soft);border-color:transparent;margin-bottom:14px"><div class="card-b small">
      ⚠️ <b>인증서는 native revoke가 불가</b>합니다 (K8s apiserver는 CRL/OCSP 미지원). 회수는 아래 3단계로 수행됩니다. ${apiIcon('revoke-flow')}</div></div>
     <div class="timeline">
       <div class="tl-item done"><b>① 자동 회전 중단</b><div class="small muted">Vault lease 폐기 — 다음 재발급 차단 (즉시)</div></div>
       <div class="tl-item done"><b>② RBAC 바인딩 제거</b><div class="small muted"><code>kubectl delete rolebinding ${k.role}-${esc(k.user.replace(/[^\w]/g,''))}</code> — 인증은 되나 인가 거부 (즉시)</div></div>
       <div class="tl-item now"><b>③ (선택) apiserver allowlist 제거</b><div class="small muted">해당 사용자 소스 IP 차단 — 네트워크 레벨 즉시 차단</div></div>
     </div>
     <p class="small muted">잔여 인증서는 최대 TTL(${k.ttl}) 후 자연 만료됩니다.</p>`,
    actionBtn('회수 실행','revoke-exec',`accRevokeExec(${i})`,{danger:true})+`<button class="btn" onclick="closeModal()">취소</button>`);
}
function accRevokeExec(i){
  const k=NEOCLOUD_DATA.kubeconfigs[i];
  k.status='revoked'; closeModal(); toast(`회수 완료 — ${k.user} (RoleBinding 삭제 + 회전 중단)`); App.render();
}

/* ---------- 발급 마법사 (모달 3단계) ---------- */
function issueOpen(tenantId){
  ISSUE.step=1; ISSUE.tenantId=tenantId||'tenant-alpha'; ISSUE.role='tenant-user'; ISSUE.ttl='72h'; ISSUE.user='';
  ISSUE.nsScope=['default'];
  issueRender();
}
function issueToggleNs(ns){
  const i=ISSUE.nsScope.indexOf(ns);
  if(i>=0){ if(ISSUE.nsScope.length>1) ISSUE.nsScope.splice(i,1); }  /* 최소 1개 유지 */
  else ISSUE.nsScope.push(ns);
  issueRender();
}
function issueRender(){
  const D=NEOCLOUD_DATA;
  let body='', foot='';
  if(ISSUE.step===1){
    body=`<p class="small" style="font-weight:700;margin-bottom:10px">① 테넌트 / 사용자</p>
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <div><label class="small muted">테넌트</label>
          <select id="is-t" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:6px;margin-top:4px">
          ${D.tenants.filter(t=>['Active','Provisioned'].includes(t.lifecycle)).map(t=>`<option value="${t.id}" ${ISSUE.tenantId===t.id?'selected':''}>${esc(t.company)} (${t.id})</option>`).join('')}</select></div>
        <div><label class="small muted">사용자 이메일</label>
          <input id="is-u" value="${esc(ISSUE.user)}" placeholder="user@customer.com" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:6px;margin-top:4px"></div>
      </div>`;
    foot=`<button class="btn btn-primary" onclick="ISSUE.tenantId=document.getElementById('is-t').value;ISSUE.user=document.getElementById('is-u').value||'newuser@customer.com';ISSUE.step=2;issueRender()">다음 →</button>`;
  } else if(ISSUE.step===2){
    const role=D.rbacRoles.find(r=>r.id===ISSUE.role);
    const t=D.tenant(ISSUE.tenantId);
    /* tenant-user만 NS 선택 — operator/admin은 전체 고정 */
    const nsPicker = ISSUE.role==='tenant-user' ? `
      <div class="card" style="box-shadow:none;background:var(--accent-soft);border-color:transparent;margin-bottom:12px"><div class="card-b">
        <b class="small">허용 Namespace 선택</b> <span class="small muted">— 선택한 NS에만 RoleBinding 생성 (최소 1개)</span>
        <div style="display:flex;gap:8px;margin-top:8px">
          ${t.nsList.map(ns=>`<button class="btn btn-sm ${ISSUE.nsScope.includes(ns)?'btn-primary':''}" onclick="issueToggleNs('${ns}')">${ISSUE.nsScope.includes(ns)?'✓ ':''}${ns}</button>`).join('')}
        </div></div></div>` : '';
    const scopeNs = ISSUE.role==='tenant-user' ? ISSUE.nsScope : t.nsList;
    const resources=['pods','pods/log','deployments','jobs','services','ingresses','secrets','pvc','nodes (R)','clusterroles'];
    const allow=(res)=>{
      if(res==='nodes (R)') return '✓ R';                      /* 전 역할 nodes 조회 허용 */
      if(res==='clusterroles') return ISSUE.role==='skt-admin'?'✓ R':'—';
      if(ISSUE.role==='skt-admin') return '✓ R (시스템 NS는 CRUD)';
      return '✓ CRUD';                                          /* operator=전체 NS · user=선택 NS */
    };
    body=`<p class="small" style="font-weight:700;margin-bottom:10px">② 역할 · 범위 — 권한 미리보기 <span class="muted">(SelfSubjectRulesReview 형식)</span> ${apiIcon('rules-review')}</p>
      <div style="display:flex;gap:8px;margin-bottom:12px">
        ${D.rbacRoles.map(r=>`<button class="btn ${ISSUE.role===r.id?'btn-primary':''}" onclick="ISSUE.role='${r.id}';issueRender()">${r.label}</button>`).join('')}
      </div>
      <div class="small muted" style="margin-bottom:10px">${esc(role.scope)} · ${esc(role.bindingKind)} ${apiIcon('rbac-3roles')}</div>
      ${nsPicker}
      <div class="matrix"><table><tr><th>Resource</th><th>${esc(scopeNs.join(' / '))}</th></tr>
        ${resources.map(res=>`<tr><td class="mono">${res}</td><td class="${allow(res)==='—'?'no':'ok'}">${allow(res)}</td></tr>`).join('')}
      </table></div>`;
    foot=`<button class="btn" onclick="ISSUE.step=1;issueRender()">← 이전</button>
      <button class="btn btn-primary" onclick="ISSUE.step=3;issueRender()">다음 →</button>`;
  } else if(ISSUE.step===3){
    const isUser=ISSUE.role==='tenant-user';
    const groups=isUser?ISSUE.nsScope.map(ns=>'tenant-user-'+ns):[ISSUE.role];
    body=`<p class="small" style="font-weight:700;margin-bottom:10px">③ TTL / 발급</p>
      <div style="display:flex;gap:8px;margin-bottom:14px">
        ${['12h','24h','72h','168h'].map(v=>`<button class="btn ${ISSUE.ttl===v?'btn-primary':''}" onclick="ISSUE.ttl='${v}';issueRender()">${v}</button>`).join('')}
      </div>
      <table class="table">
        <tr><td class="muted" style="width:130px">사용자</td><td>${esc(ISSUE.user)}</td></tr>
        <tr><td class="muted">테넌트</td><td>${esc(NEOCLOUD_DATA.tenant(ISSUE.tenantId).company)} (${ISSUE.tenantId})</td></tr>
        <tr><td class="muted">역할</td><td>${ISSUE.role}${isUser?` · NS: <b>${ISSUE.nsScope.join(', ')}</b>`:' · NS 전체'}</td></tr>
        <tr><td class="muted">인증서 Subject</td><td>CN=<code>${esc(ISSUE.user)}</code>, ${groups.map(g=>`O=<code>${g}</code>`).join(', ')} <span class="small muted">← O 하나가 K8s Group 하나 (NS별 바인딩)</span></td></tr>
        <tr><td class="muted">Vault 경로</td><td class="mono">pki-${ISSUE.tenantId.replace('tenant-','')}/issue/${ISSUE.role} (TTL ${ISSUE.ttl})</td></tr>
      </table>
      <p class="small muted" style="margin-top:10px">발급 즉시 자동 회전 스케줄 등록 (만료 24h 전 재발급). ${apiIcon('vault-issue')} ${apiIcon('kubeconfig-yaml')}</p>`;
    foot=`<button class="btn" onclick="ISSUE.step=2;issueRender()">← 이전</button>
      <button class="btn btn-primary" onclick="issueExec()">🔐 Vault PKI 발급</button>`;
  } else {
    body=`<div style="text-align:center;padding:12px 0">
      <div style="font-size:40px">✅</div><h3 style="margin:8px 0">발급 완료</h3>
      <p class="small muted">인증서 serial <code>9a:1f:44:b8:2e:63</code> · 만료 ${ISSUE.ttl} 후 (자동 회전 등록됨)</p>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:14px">
        <button class="btn btn-primary" onclick="toast('kubeconfig-${ISSUE.tenantId}.yaml 다운로드 (mock)')">⬇ kubeconfig 다운로드</button>
        <button class="btn" onclick="toast('고객포탈 보안 전달함으로 발송 (mock)')">고객포탈로 전달</button>
        <button class="btn" onclick="openApiPanel('kubeconfig-yaml')">파일 구조 보기</button>
      </div></div>`;
    foot=`<button class="btn" onclick="closeModal();App.render()">닫기</button>`;
  }
  openModal(`kubeconfig 발급 <span class="chip">step ${Math.min(ISSUE.step,3)}/3</span>`, body, foot);
}
function issueExec(){
  NEOCLOUD_DATA.kubeconfigs.unshift({ user:ISSUE.user.split('@')[0], email:ISSUE.user, tenantId:ISSUE.tenantId,
    role:ISSUE.role, nsScope:ISSUE.role==='tenant-user'?[...ISSUE.nsScope]:'전체',
    serial:'9a:1f:44:b8:2e:63', issuedAt:'2026-07-09 14:35',
    expiresAt:'2026-07-12 14:35', ttl:ISSUE.ttl, status:'active' });
  ISSUE.step=4; issueRender(); toast('Vault PKI 발급 완료');
}

/* ---------- RBAC 탭 ---------- */
function accTabRbac(box){
  const D=NEOCLOUD_DATA;
  const roleCards=D.rbacRoles.map(r=>`
    <div class="card"><div class="card-h">${r.label} <span class="chip mono">${esc(r.group)}</span>
      <div class="right">${apiIcon('rbac-3roles')}</div></div>
      <div class="card-b small">
        <p style="margin-bottom:8px"><b>${esc(r.bindingKind)}</b><br>${esc(r.scope)}</p>
        ${r.rules.map(rule=>`<div style="padding:7px 10px;background:var(--line-soft);border-radius:6px;margin-bottom:6px" class="mono small">
          verbs: [${rule.verbs.join(', ')}]<br>resources: [${rule.resources.slice(0,5).join(', ')}${rule.resources.length>5?', …':''}]<br>
          <span class="muted"># ${esc(rule.where)}</span></div>`).join('')}
      </div></div>`).join('');
  const nsGrid=`
    <div class="card"><div class="card-h">Namespace 접근 스코프</div><div class="card-b">
      <div class="matrix"><table>
        <tr><th style="text-align:left">Namespace / Resource</th><th>Tenant-user</th><th>Tenant-operator</th><th>SKT Admin</th></tr>
        ${['default','slurm','dynamo'].map(ns=>`<tr><td class="mono">${ns} <span class="chip" style="font-size:9.5px">테넌트</span></td>
          <td class="ok">CRUD<div class="small muted" style="font-weight:400">발급 시 선택한 NS만</div></td><td class="ok">CRUD</td><td class="ok">R</td></tr>`).join('')}
        ${D.systemNs.map(ns=>`<tr><td class="mono">${ns} <span class="chip" style="font-size:9.5px;background:#3a1a20;color:#f0a3b0">시스템</span></td>
          <td class="no">—</td><td class="no">—</td><td class="ok">CRUD</td></tr>`).join('')}
        <tr><td class="mono">nodes <span class="chip" style="font-size:9.5px">클러스터 스코프</span></td>
          <td class="ok">R</td><td class="ok">R</td><td class="ok">R</td></tr>
        <tr><td class="mono">clusterroles / CRD 정의 <span class="chip" style="font-size:9.5px">클러스터 스코프</span></td>
          <td class="no">—</td><td class="no">—</td><td class="ok">R</td></tr>
      </table></div>
      <p class="small muted" style="margin-top:10px">nodes 조회는 전 역할 허용 — one-tenant-per-cluster라 타 테넌트 정보 노출이 없고, <code>kubectl get nodes</code>·스케줄링 디버깅에 필수 (EKS/GKE 동일). 쓰기(cordon 등)는 프로바이더 전용.</p>
    </div></div>`;
  box.innerHTML=`<div class="grid" style="grid-template-columns:1fr 1fr 1fr;margin-bottom:14px">${roleCards}</div>${nsGrid}`;
}

/* ---------- API 스펙 ---------- */
NEOCLOUD_DATA.apiSpecs['vault-issue']={
  title:'kubeconfig 발급 — Vault PKI',
  intro:'테넌트별 PKI 엔진에서 단기 인증서 발급. <b>O(Organization) 하나가 K8s Group 하나</b>로 매핑 — tenant-user는 선택한 NS별 그룹(O=tenant-user-&lt;ns&gt;)을 복수 지정.',
  tabs:{
    'Request':
`POST /v1/pki-alpha/issue/tenant-user
X-Vault-Token: <portal-backend-token>

{
  "common_name": "sua.choi@claude.ai",        # → K8s User
  "organization": "tenant-user-default,tenant-user-dynamo",
                    # → K8s Groups (발급 마법사에서 선택한 NS별 그룹)
  "ttl": "72h",
  "key_type": "ec", "key_bits": 256
}

# tenant-operator는 단일 그룹:
# "organization": "tenant-operator"           # NS 전체 CRUD`,
    'Response':
`{
  "data": {
    "certificate": "-----BEGIN CERTIFICATE-----\\nMIIB...",
    "private_key": "-----BEGIN EC PRIVATE KEY-----\\nMHc...",
    "issuing_ca":  "-----BEGIN CERTIFICATE-----\\nMIIB...",
    "serial_number": "c1:09:5d:6f:24:e7",
    "expiration": 1783334400
  }
}
# apiserver는 --client-ca-file에 이 CA를 신뢰
# Subject: CN=sua.choi@claude.ai,
#          O=tenant-user-default, O=tenant-user-dynamo`,
  }
};
NEOCLOUD_DATA.apiSpecs['kubeconfig-yaml']={
  title:'조립된 kubeconfig 구조',
  intro:'Vault 응답을 표준 kubeconfig로 조립하여 전달. 클라이언트는 apiserver 노출 endpoint로 직접 접속.',
  tabs:{
    'kubeconfig':
`apiVersion: v1
kind: Config
clusters:
- name: tenant-alpha
  cluster:
    server: https://k8s-alpha.api.neocloud.skt.com:6443   # L4 passthrough VIP
    certificate-authority-data: <base64 CA>
users:
- name: sua.choi@claude.ai
  user:
    client-certificate-data: <base64 cert>
        # CN=user, O=tenant-user-default, O=tenant-user-dynamo
    client-key-data: <base64 key>            # TTL 72h — 자동 회전
contexts:
- name: tenant-alpha
  context: { cluster: tenant-alpha, user: sua.choi@claude.ai, namespace: default }
current-context: tenant-alpha`,
  }
};
NEOCLOUD_DATA.apiSpecs['rbac-3roles']={
  title:'RBAC — ClusterRole / RoleBinding (NS별 그룹) / nodes-reader',
  intro:'권한 정의(ClusterRole)는 공용, 부여(RoleBinding)는 NS별 그룹에. tenant-user의 NS 제한은 <b>어느 NS에 어느 그룹을 바인딩하느냐</b>로 구현.',
  tabs:{
    'ClusterRole':
`# 권한 정의 — 재사용 (operator/user 공용 CRUD 묶음)
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: neocloud:tenant-edit
rules:
- apiGroups: ["", "apps", "batch", "networking.k8s.io"]
  resources: ["pods","pods/log","deployments","jobs","services",
              "ingresses","configmaps","secrets","persistentvolumeclaims"]
  verbs: ["*"]
---
# nodes 조회 전용 (전 역할 공통 — 전용 클러스터라 안전)
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: neocloud:nodes-reader
rules:
- apiGroups: [""]
  resources: ["nodes","nodes/status"]
  verbs: ["get","list","watch"]`,
    'RoleBinding (NS별)':
`# tenant-operator — 테넌트 NS "전체"에 동일 바인딩 (default/slurm/dynamo)
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata: { name: tenant-operator-edit, namespace: default }   # x3 NS
subjects:
- { kind: Group, name: tenant-operator, apiGroup: rbac.authorization.k8s.io }
roleRef:
  { kind: ClusterRole, name: neocloud:tenant-edit, apiGroup: rbac.authorization.k8s.io }
---
# tenant-user — "발급 시 선택한 NS"에만 NS별 그룹을 바인딩
# 예: dynamo만 선택한 사용자는 O=tenant-user-dynamo → dynamo에서만 매칭
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata: { name: tenant-user-edit, namespace: dynamo }
subjects:
- { kind: Group, name: tenant-user-dynamo, apiGroup: rbac.authorization.k8s.io }
roleRef:
  { kind: ClusterRole, name: neocloud:tenant-edit, apiGroup: rbac.authorization.k8s.io }`,
    'ClusterRoleBinding':
`# nodes 조회 — 테넌트 그룹 전체에 클러스터 스코프로 부여
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata: { name: tenant-nodes-reader }
subjects:
- { kind: Group, name: tenant-operator, apiGroup: rbac.authorization.k8s.io }
- { kind: Group, name: tenant-user-default, apiGroup: rbac.authorization.k8s.io }
- { kind: Group, name: tenant-user-slurm, apiGroup: rbac.authorization.k8s.io }
- { kind: Group, name: tenant-user-dynamo, apiGroup: rbac.authorization.k8s.io }
roleRef:
  { kind: ClusterRole, name: neocloud:nodes-reader, apiGroup: rbac.authorization.k8s.io }
---
# SKT Admin — 클러스터 전체 조회 (+시스템 NS는 별도 CRUD RoleBinding)
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata: { name: skt-admin-view }
subjects:
- { kind: Group, name: skt-admin, apiGroup: rbac.authorization.k8s.io }
roleRef:
  { kind: ClusterRole, name: view, apiGroup: rbac.authorization.k8s.io }`,
  }
};
NEOCLOUD_DATA.apiSpecs['rules-review']={
  title:'권한 미리보기 — SelfSubjectRulesReview',
  intro:'발급 마법사의 권한 매트릭스는 이 API 결과와 동일 형식 (kubectl auth can-i --list).',
  tabs:{
    'Request':
`POST /apis/authorization.k8s.io/v1/selfsubjectrulesreviews

{
  "apiVersion": "authorization.k8s.io/v1",
  "kind": "SelfSubjectRulesReview",
  "spec": { "namespace": "dynamo" }     # NS별로 조회`,
    'Response':
`{
  "status": {
    "resourceRules": [
      { "verbs": ["*"],
        "apiGroups": ["", "apps", "batch", "networking.k8s.io"],
        "resources": ["pods","deployments","jobs","services", "..."] },
      { "verbs": ["get","list","watch"],
        "apiGroups": [""],
        "resources": ["nodes","nodes/status"] }   # nodes-reader
    ],
    "incomplete": false
  }
}
# 같은 사용자가 선택하지 않은 NS(예: slurm)에서 조회하면
# resourceRules에 nodes-reader만 남음 → CRUD 불가 확인`,
  }
};
NEOCLOUD_DATA.apiSpecs['revoke-flow']={
  title:'kubeconfig 회수 — 회전 중단 + RoleBinding 제거',
  intro:'인증서는 native revoke 불가(apiserver CRL 미지원) → 인가 차단 + 재발급 중단으로 회수.',
  tabs:{
    '① 회전 중단 (Vault)':
`# 해당 사용자의 발급 lease 폐기 → 자동 재발급 차단
PUT /v1/sys/leases/revoke-prefix/pki-alpha/issue/tenant-user
X-Vault-Token: <portal-backend-token>`,
    '② RBAC 제거 (K8s)':
`DELETE /apis/rbac.authorization.k8s.io/v1
       /namespaces/dynamo/rolebindings/tenant-user-edit

# 개인 단위 회수라면 그룹 전체 바인딩 삭제 대신
# 개인 전용 그룹(O=user-<id>-dynamo) 바인딩을 삭제하는 모델 권장
# 이후 해당 인증서로 인증은 되지만 모든 요청이 403 Forbidden
# 잔여 인증서는 최대 TTL(72h) 후 자연 만료`,
    '③ allowlist 제거 (선택)':
`# 즉시 네트워크 차단이 필요한 경우 — apiserver 노출 VIP의 allowlist에서 소스 제거
PATCH /admin/v1/clusters/tenant-alpha/apiserver-allowlist
{ "remove": ["13.209.88.14/32"] }`,
  }
};

/* ============================================================
 * 업그레이드·패치 — 버전 보드 / window 캘린더 / 롤링 모니터 / CVE
 * ============================================================ */
const ROLL={ running:false, nodes:[] };

App.register('#/k8s/upgrade', function(elm){
  const D=NEOCLOUD_DATA;
  const verCards=D.upgrades.map(u=>{
    const t=D.tenant(u.tenantId);
    return `<div class="card"><div class="card-h">${esc(t.company)} <span class="chip mono">${u.current}</span>
      ${u.target?`→ <span class="chip mono" style="background:var(--accent-soft);color:var(--accent)">${u.target}</span>`:''}
      <div class="right small">${u.target?badge('Approved'):`<span class="muted">${esc(u.status)}</span>`}</div></div>
      <div class="card-b small">
        ${u.target?`<div style="margin-bottom:6px">🗓 <b>${u.window}</b> · ${esc(u.approvedBy)}</div>
          <div class="muted">${esc(u.plan)} · ${u.nkdTarget}</div>`
        :`<div class="muted">${u.status==='계획 미수립'?'v1.33.2 업그레이드 계획 수립 필요 (CVE-2026-32871 해소 포함)':esc(u.status)}</div>`}
      </div></div>`;
  }).join('');

  /* 주간 캘린더 (07-13 ~ 07-19) */
  const days=['월 13','화 14','수 15','목 16','금 17','토 18','일 19'];
  const cal=days.map((d,i)=>`
    <div style="border:1px solid var(--line);border-radius:7px;min-height:86px;padding:7px 9px;background:${i===3?'var(--accent-soft)':'var(--panel)'}">
      <div class="small muted" style="font-weight:700">${d}</div>
      ${i===3?`<div class="small" style="margin-top:6px;background:var(--accent);color:#07203a;border-radius:5px;padding:4px 7px;font-weight:600">02:00–06:00<br>CLAUDE v1.33.2</div>`:''}
      ${i===5?`<div class="small" style="margin-top:6px;background:var(--line-soft);border-radius:5px;padding:4px 7px">예비 window</div>`:''}
    </div>`).join('');

  const cveRows=D.cves.map(c=>`
    <tr><td><b class="mono small">${c.id}</b></td>
      <td>${badge(c.sev)}<div class="small muted">CVSS ${c.cvss}</div></td>
      <td class="small">${esc(c.comp)}<div class="muted">${esc(c.desc)}</div></td>
      <td class="small">${c.affected.map(a=>`<span class="chip">${esc(D.tenant(a).company)}</span>`).join(' ')}</td>
      <td class="small">${esc(c.patch)}<div class="muted">기한 ${c.due}</div></td>
      <td>${actionBtn(c.sev==='Critical'?'긴급 패치 예약':'패치 예약','patch',`toast('${c.id} 패치 예약 — maintenance window 협의 요청 발송 (mock)')`,{sm:true, secondary:c.sev!=='Critical'})}</td>
    </tr>`).join('');

  elm.innerHTML=`
    <div class="page-h"><div><h1>업그레이드 · 패치</h1>
      <div class="sub">NKD 버전 관리 · 무중단 롤링 — Control 먼저 → Worker (버전 skew: kubelet ≤ apiserver, 최대 3 minor) ${apiIcon('cordon-evict')}</div></div></div>
    <div class="card" style="background:var(--amber-soft);border-color:transparent;margin-bottom:14px"><div class="card-b small">
      ⚠️ <b>버전 skew 규칙</b> — Control Plane을 먼저 올리고 Worker(kubelet)는 나중에. kubelet은 apiserver보다 최대 3 마이너까지 낮을 수 있음. OS/펌웨어 패치는 K8s 버전과 <b>별개 트랙</b>.</div></div>
    <div class="grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px">${verCards}</div>
    <div class="grid" style="grid-template-columns:1.1fr 1fr;align-items:start;margin-bottom:14px">
      <div class="card"><div class="card-h">Maintenance Window (2026-07-13 주)</div>
        <div class="card-b"><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:7px">${cal}</div></div></div>
      <div class="card"><div class="card-h">롤링 시뮬레이션 — CLAUDE Worker (동시 5랙 · PDB 존중) ${apiIcon('cordon-evict')}
        <div class="right">${actionBtn(ROLL.running?'진행 중…':'▶ 롤링 시작 (시연)','upgrade','rollStart()',{sm:true})}</div></div>
        <div class="card-b" id="roll-box">${rollHtml()}</div></div>
    </div>
    <div class="card"><div class="card-h">CVE / 보안 패치 <span class="muted small">(${D.cves.length})</span></div>
      <table class="table"><tr><th>CVE</th><th>심각도</th><th>컴포넌트</th><th>영향 테넌트</th><th>패치</th><th></th></tr>${cveRows}</table></div>`;
});

const ROLL_STEPS=['대기','cordon','drain','upgrade','uncordon','완료'];
function rollHtml(){
  if(!ROLL.nodes.length){
    ROLL.nodes=['vr72-a-001','vr72-a-002','vr72-a-003','vr72-a-004','vr72-a-005'].map(n=>({rack:n, step:0, pods:0}));
  }
  return ROLL.nodes.map(n=>{
    const chips=ROLL_STEPS.slice(1,5).map((s,i)=>{
      const idx=i+1;
      const on=n.step>=idx, now=n.step===idx;
      return `<span class="chip" style="${now?'background:var(--accent);color:#07203a':(on?'background:var(--green-soft);color:var(--green-text)':'')}">${s}${now&&s==='drain'?` (evicting ${n.pods} pods)`:''}</span>`;
    }).join(' → ');
    return `<div style="display:flex;align-items:center;gap:12px;padding:7px 0;border-bottom:1px solid var(--line-soft)">
      <code style="width:92px">${n.rack}</code><div class="small" style="flex:1">${chips}</div>
      <span class="small ${n.step>=5?'ok':'muted'}">${n.step>=5?'✓ v1.33.2':'v1.32.4'}</span></div>`;
  }).join('')+`<p class="small muted" style="margin-top:8px">랙 단위 롤링 (랙=18노드 동시). cordon → Eviction API(PDB 존중) → kubelet 업그레이드 → uncordon.</p>`;
}
function rollStart(){
  if(ROLL.running) return;
  ROLL.running=true;
  ROLL.nodes.forEach(n=>{ n.step=0; n.pods=0; });
  let tick=0;
  const timer=setInterval(()=>{
    tick++;
    let allDone=true;
    ROLL.nodes.forEach((n,i)=>{
      const start=i*2;   /* 순차 시작 */
      if(tick>start && n.step<5){ n.step=Math.min(5, Math.floor((tick-start)/1.5)); n.pods=n.step===2?(3+i):0; }
      if(n.step<5) allDone=false;
    });
    const box=document.getElementById('roll-box');
    if(!box){ clearInterval(timer); ROLL.running=false; return; }
    box.innerHTML=rollHtml();
    if(allDone){ clearInterval(timer); ROLL.running=false; toast('롤링 업그레이드 완료 (시연) — 5/5랙 v1.33.2'); }
  }, 700);
}

/* ---------- API 스펙 ---------- */
NEOCLOUD_DATA.apiSpecs['cordon-evict']={
  title:'롤링 업그레이드 — cordon + Eviction API (표준)',
  intro:'노드별 cordon → drain(Eviction, PDB 존중) → kubelet 업그레이드 → uncordon. 전부 표준 K8s API.',
  tabs:{
    '① cordon':
`PATCH /api/v1/nodes/vr72-a-001-t01
Content-Type: application/strategic-merge-patch+json

{ "spec": { "unschedulable": true } }

# kubectl 대응: kubectl cordon vr72-a-001-t01`,
    '② drain (Eviction)':
`POST /api/v1/namespaces/default/pods/vllm-inference-a8c2d/eviction
Content-Type: application/json

{
  "apiVersion": "policy/v1",
  "kind": "Eviction",
  "metadata": { "name": "vllm-inference-a8c2d", "namespace": "default" }
}

# PodDisruptionBudget 위반 시:
# HTTP/1.1 429 Too Many Requests
# {"reason":"DisruptionBudget","message":"Cannot evict pod as it would
#  violate the pod's disruption budget."}
# → 컨트롤러는 재시도 (PDB 존중이 무중단의 핵심)`,
    '③ uncordon':
`PATCH /api/v1/nodes/vr72-a-001-t01

{ "spec": { "unschedulable": false } }

# 완료 후 노드 상태 확인
GET /api/v1/nodes/vr72-a-001-t01
# status.nodeInfo.kubeletVersion: "v1.33.2"`,
  }
};

/* ============================================================
 * 장애관리 (NVSentinel v1.11 실물 기반)
 *   이벤트: HealthEvent proto 필드 + 상태머신 라벨
 *   모듈·정책: helm values (enabled/dryRun) + circuit breaker
 *   Preflight: admission webhook 3종 체크
 * ============================================================ */
App.register('#/k8s/sentinel', function(elm, p){
  const tab=p.tab||'fleet';
  const tabs=[['fleet','Fleet 헬스맵'],['events','이벤트'],['policy','모듈 · 정책'],['preflight','Preflight'],['scope','범위 · 역할']];
  elm.innerHTML=`
    <div class="page-h"><div><h1>장애관리 (NVSentinel)</h1>
      <div class="sub">탐지(DaemonSet 모니터) → health_events 저장 → quarantine → drain → 유지보수 CRD — pub-sub 파이프라인 (v1.11) ${apiIcon('healthevent-schema')}</div></div>
      <div class="right">
        <span class="chip">Circuit Breaker: <b style="color:var(--green)">CLOSED</b></span>
        <span class="chip">datastore: MongoDB health_events ●</span></div></div>
    <div class="tabs">${tabs.map(([k,l])=>`<button class="${tab===k?'on':''}" onclick="App.navigate('#/k8s/sentinel?tab=${k}')">${l}</button>`).join('')}</div>
    <div id="sen-tab"></div>`;
  const box=document.getElementById('sen-tab');
  ({fleet:senTabFleet, events:senTabEvents, policy:senTabPolicy, preflight:senTabPreflight, scope:senTabScope}[tab])(box, p);
});

/* ---------- GPU 조망 탭 (전 테넌트 500랙 헬스맵 → 랙 → 트레이 → GPU) ---------- */
/* sentinelEvents의 노드 → 랙별 최고 심각도 맵 */
function senHealthMap(){
  const m={};
  NEOCLOUD_DATA.sentinelEvents.forEach(e=>{
    const rack=e.node.split('-t')[0];
    const rank={critical:3, warning:2, info:1};
    if(!m[rack] || rank[e.sev]>rank[m[rack].sev]) m[rack]={sev:e.sev, evt:e};
  });
  return m;
}
function senTabFleet(box, p){
  const D=NEOCLOUD_DATA;
  const hm=senHealthMap();
  let critRacks=0, warnRacks=0, activeRacks=0;
  const tenantMap=(t)=>{
    const racks=genRacks(t.id);
    const cells=racks.map(r=>{
      const h=hm[r.rack];
      let bg='#223142', cls='';
      if(r.status==='active'){
        activeRacks++;
        bg='#3e6b12';
        if(h){ if(h.sev==='critical'){ bg='var(--red)'; cls='alarm'; critRacks++; }
               else { bg='#e8c66a'; warnRacks++; } }
      } else if(r.status==='provisioning') bg='#28425e';
      return `<div class="hm-cell ${cls}" style="background:${bg}"
        title="${r.rack} · ${r.status}${h?' · '+h.evt.errorCode.join(',')+' ('+h.sev+')':''}"
        onclick="senFleetRack('${t.id}','${r.rack}')">${h?'!':''}</div>`;
    }).join('');
    const tCrit=racks.filter(r=>hm[r.rack]&&hm[r.rack].sev==='critical').length;
    const tWarn=racks.filter(r=>hm[r.rack]&&hm[r.rack].sev!=='critical').length;
    return `<div class="card"><div class="card-h">${esc(t.company)} ${badge(t.lifecycle)}
        <div class="right small">${tCrit?`<span class="badge b-red">critical ${tCrit}</span>`:''}
          ${tWarn?`<span class="badge b-amber">warning ${tWarn}</span>`:''}
          ${!tCrit&&!tWarn&&t.lifecycle==='Active'?'<span class="badge b-green">all healthy</span>':''}</div></div>
      <div class="card-b"><div class="heatmap" style="gap:3px">${cells}</div></div></div>`;
  };
  const maps=D.tenants.map(tenantMap).join('');
  box.innerHTML=`
    <div class="grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:14px">
      <div class="card kpi"><span class="v">36,000</span><span class="l">전체 GPU (500랙 × 72)</span></div>
      <div class="card kpi"><span class="v" style="color:var(--red)">${critRacks}</span><span class="l">Critical 랙 (quarantine 진행)</span></div>
      <div class="card kpi"><span class="v" style="color:var(--amber)">${warnRacks}</span><span class="l">Warning 랙 (관찰 중)</span></div>
      <div class="card kpi"><span class="v" style="color:var(--green)">${(activeRacks-critRacks-warnRacks)}</span><span class="l">Healthy 랙 (가동 중)</span></div>
    </div>
    <div class="grid" style="grid-template-columns:1.35fr 1fr;align-items:start">
      <div class="grid" style="grid-template-columns:1fr 1fr">${maps}
        <div class="card" style="box-shadow:none"><div class="card-b small" style="display:flex;gap:14px;flex-wrap:wrap;align-items:center">
          <b>범례</b>
          <span style="display:inline-flex;align-items:center;gap:5px"><i style="width:12px;height:12px;border-radius:3px;background:#3e6b12;display:inline-block"></i>healthy</span>
          <span style="display:inline-flex;align-items:center;gap:5px"><i style="width:12px;height:12px;border-radius:3px;background:#e8c66a;display:inline-block"></i>warning</span>
          <span style="display:inline-flex;align-items:center;gap:5px"><i style="width:12px;height:12px;border-radius:3px;background:var(--red);display:inline-block"></i>critical (quarantine)</span>
          <span style="display:inline-flex;align-items:center;gap:5px"><i style="width:12px;height:12px;border-radius:3px;background:#28425e;display:inline-block"></i>provisioning</span>
          <span style="display:inline-flex;align-items:center;gap:5px"><i style="width:12px;height:12px;border-radius:3px;background:#223142;display:inline-block"></i>미가동</span>
        </div></div>
      </div>
      <div id="fleet-detail" style="position:sticky;top:0">
        <div class="card"><div class="empty"><div class="big">👈</div>랙을 클릭하면 트레이/GPU 단위로 드릴다운합니다<br>
          <span class="small muted">붉은 셀(!)이 quarantine 진행 중인 랙입니다</span></div></div>
      </div>
    </div>`;
  /* 알람 랙 자동 선택 */
  if(hm['vr72-a-017']) senFleetRack('tenant-alpha','vr72-a-017');
}
function senFleetRack(tenantId, rackId){
  const D=NEOCLOUD_DATA;
  const t=D.tenant(tenantId);
  const rack=genRacks(tenantId).find(r=>r.rack===rackId);
  const hm=senHealthMap();
  const h=hm[rackId];
  const evNode=h?h.evt.node:null;
  const trayRow=(tr)=>{
    const isEvNode=tr.node===evNode;
    const gpus=tr.gpus.map(g=>{
      const bad=g.xid || (isEvNode && h.sev!=='critical' && h.evt.gpu.includes('GPU '+g.idx));
      return `<div class="tip" data-tip="GPU ${g.idx}${g.xid?' — '+g.xid:bad?' — '+h.evt.errorCode.join(','):(tr.status==='Ready'?' — 정상':'')}"
        style="width:30px;height:20px;border-radius:4px;display:flex;align-items:center;justify-content:center;
        font-size:9px;font-weight:800;color:${!g.xid&&bad?'#241c05':'#fff'};background:${g.xid?'var(--red)':(bad?'#e8c66a':(tr.status==='Ready'?'#3e6b12':'#3a4a5c'))}">${g.xid?'✕':(bad?'!':'')}</div>`;
    }).join('');
    const stateLabel=tr.status.includes('NotReady')?`<span class="badge b-red">quarantined</span>`:
      (isEvNode?`<span class="badge b-amber">관찰</span>`:badge(tr.status==='Ready'?'Ready':tr.status));
    return `<div style="display:flex;align-items:center;gap:10px;padding:5px 0;border-bottom:1px solid var(--line-soft);${tr.status.includes('NotReady')?'background:var(--red-soft)':''}">
      <code class="small" style="width:126px">${tr.node.replace(rackId+'-','')}</code>
      <div style="display:flex;gap:4px">${gpus}</div>
      <div style="margin-left:auto">${stateLabel}</div></div>`;
  };
  document.getElementById('fleet-detail').innerHTML=`
    <div class="card"><div class="card-h">${rackId} <span class="chip">${esc(t.company)}</span>
      ${h?badge(h.sev):badge('Ready')}
      <div class="right small muted">18 tray × 4 GPU ${apiIcon('node-condition-xid')}</div></div>
      ${h?`<div class="card-b small" style="background:${h.sev==='critical'?'var(--red-soft)':'var(--amber-soft)'};border-bottom:1px solid var(--line-soft)">
        <b>${h.evt.errorCode.join(', ')}</b> · ${esc(h.evt.checkName)} · ${h.evt.node} ${h.evt.gpu?'· '+esc(h.evt.gpu):''}
        <div class="muted" style="margin-top:3px">${esc(h.evt.msg)}</div>
        ${h.evt.state?`<div style="margin-top:5px" class="mono small">nvsentinel-state: <b>${h.evt.state}</b> · eviction: ${h.evt.status.eviction}</div>`:''}
      </div>`:''}
      <div class="card-b" style="max-height:430px;overflow-y:auto">${rack.trays.map(trayRow).join('')}</div>
      <div class="card-b" style="display:flex;gap:8px;border-top:1px solid var(--line-soft)">
        ${h?`<button class="btn btn-sm" onclick="App.navigate('#/k8s/sentinel?tab=events')">이벤트 상세 →</button>`:''}
        <button class="btn btn-sm" onclick="App.navigate('#/k8s/monitoring/${tenantId}/${rackId}')">모니터링 (util) →</button>
      </div>
    </div>`;
}

/* ---------- 범위·역할 탭 (NVSentinel이 하는 것 / 안 하는 것 / 우리 개발분) ---------- */
function senTabScope(box){
  box.innerHTML=`
    <div class="grid" style="grid-template-columns:1fr 1fr;align-items:start;margin-bottom:14px">
      <div class="card"><div class="card-h" style="color:var(--green)">✓ NVSentinel이 하는 복구 (레퍼런스 구현 포함)</div>
        <table class="table">
          <tr><td><b class="small">GPU 리셋</b></td><td class="small">노드 무중단 개별 GPU 리셋 + 사후 헬스체크 (<code>gpu-reset</code> 완성 워크플로우)</td></tr>
          <tr><td><b class="small">노드 재부팅/교체 실행</b></td><td class="small">janitor + provider 7종 (AWS/GCP/Azure/OCI/Nebius/kind/<b>generic</b>) — generic = 노드에 privileged Job 스케줄 방식(온프레미스 동작)</td></tr>
          <tr><td><b class="small">격리 오케스트레이션</b></td><td class="small">cordon → drain → 실행 → 상태머신(<code>nvsentinel-state</code>) 전체 자동</td></tr>
          <tr><td><b class="small">사전 차단</b></td><td class="small">preflight — 불량 노드에 워크로드 배치 자체를 방지</td></tr>
          <tr><td><b class="small">안전장치</b></td><td class="small">circuit breaker · dryRun · 오탐 억제(OverrideTransformer) · 수동 취소(uncordon 감지)</td></tr>
        </table></div>
      <div class="card"><div class="card-h" style="color:var(--ink-3)">— 하지 않는 것 (의도적 범위 밖)</div>
        <table class="table">
          <tr><td><b class="small">HW 교체 실행</b></td><td class="small"><code>CONTACT_SUPPORT</code> 판정 → 티켓 CRD 발행까지만</td></tr>
          <tr><td><b class="small">Hot spare 용량 관리</b></td><td class="small">격리로 빠진 용량의 보충은 플랫폼 몫</td></tr>
          <tr><td><b class="small">워크로드 복구</b></td><td class="small">학습 잡 체크포인트 재시작 — Slurm/스케줄러 영역</td></tr>
          <tr><td><b class="small">펌웨어/드라이버 수리</b></td><td class="small">GPU Operator / NKD 트랙</td></tr>
          <tr><td><b class="small">BMC 전원 제어</b></td><td class="small">Redfish/IPMI provider 미구현 — OS 무응답 노드의 cold reboot 불가</td></tr>
        </table></div>
    </div>
    <div class="card"><div class="card-h">🔧 NeoCloud 자체 개발 3종 (NVSentinel 훅에 연결) <span class="chip">plan_r10 장애관리 자체 개발분과 일치</span></div>
      <table class="table"><tr><th>개발 항목</th><th>연결 지점 (NVSentinel 훅)</th><th>역할</th></tr>
        <tr><td><b class="small">① redfish provider</b></td><td class="mono small">janitor-provider 인터페이스 구현 (기존 7종이 템플릿)</td>
          <td class="small">OS 무응답 노드의 BMC 전원 사이클 — BMaaS Redfish 자동화 재사용</td></tr>
        <tr><td><b class="small">② ITSM 커넥터</b></td><td class="mono small">maintenance.template → BreakFixTicket CRD 소비 + event-exporter(CloudEvents) 구독</td>
          <td class="small">CONTACT_SUPPORT → 티켓 발행·HW 교체 워크플로우 (RACI: Break-fix·ITSM 연동)</td></tr>
        <tr><td><b class="small">③ Hot spare 오케스트레이터</b></td><td class="mono small">remediation-succeeded / -failed 이벤트 구독</td>
          <td class="small">복구 실패·장기 격리 시 Reserved 예비 tray 자동 투입 (NKD/Ansible)</td></tr>
      </table>
      <div class="card-b small muted">요약: NVSentinel = 노드/GPU 단위 탐지→격리→리셋/재부팅 자동화. 그 위(spare·교체·워크로드 재개)와 아래(BMC·펌웨어)는 훅(CRD·CloudEvents)만 제공 — 그 틈이 우리 개발 범위.</div>
    </div>`;
}

/* ---------- 이벤트 탭 ---------- */
function senTabEvents(box, p){
  const D=NEOCLOUD_DATA;
  const filter=p.sev||'all';
  const evts=D.sentinelEvents.filter(e=>filter==='all'||e.sev===filter);
  const stateChip=(s)=>{
    if(!s) return '';
    const flow=['quarantined','draining','drain-succeeded','remediating','remediation-succeeded'];
    return `<div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin:8px 0 2px">
      <span class="small muted mono">dgxc.nvidia.com/nvsentinel-state:</span>
      ${flow.map(f=>`<span class="chip" style="${f===s?'background:var(--accent);color:#07203a':(flow.indexOf(f)<flow.indexOf(s)?'background:var(--green-soft);color:var(--green-text)':'')}">${f}</span>`).join('<span class="muted">→</span>')}
    </div>`;
  };
  const evtCard=(e)=>{
    const t=D.tenant(e.tenantId);
    const rack=e.node.split('-t')[0];
    const statusRow=e.status?`
      <div class="small" style="display:flex;gap:18px;margin-top:8px;flex-wrap:wrap">
        <span>nodeQuarantined: <b>${e.status.nodeQuarantined}</b></span>
        <span>userPodsEviction: <b style="color:var(--accent)">${e.status.eviction}</b></span>
        <span>faultRemediated: <b>${e.status.faultRemediated}</b></span>
      </div>`:'';
    const rem=e.remediation?`
      <div class="timeline" style="margin-top:12px">
        ${e.remediation.map(s=>`<div class="tl-item ${s.status}"><b>${esc(s.step)}</b>
          <div class="small muted">${s.at||'대기'} · ${esc(s.by)}</div></div>`).join('')}
      </div>
      <div class="small muted">수동 취소 = <code>kubectl uncordon ${e.node}</code> → NVSentinel이 감지해 워크플로 중단·이벤트 Cancelled 처리 (annotation <code>quarantinedNodeUncordonedManually="True"</code>)</div>`:'';
    return `<div class="card" style="margin-bottom:12px">
      <div class="card-h">${badge(e.sev)} <b>${e.errorCode.join(', ')}</b>
        <span class="chip mono">${esc(e.checkName)}</span>
        <span class="mono small">${e.node} · ${esc(e.gpu)}</span>
        <div class="right small muted">${esc(t.company)} · ${e.at} ${apiIcon('node-condition-xid')}</div></div>
      <div class="card-b small">
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:6px" class="small muted">
          <span>agent: <code>${e.agent}</code></span><span>componentClass: <code>${e.componentClass}</code></span>
          <span>isFatal: <b style="color:${e.isFatal?'var(--red)':'var(--ink-3)'}">${e.isFatal}</b></span>
          <span>recommendedAction: <code>${e.recommendedAction}</code></span>
        </div>
        ${esc(e.msg)}
        ${stateChip(e.state)}
        ${statusRow}
        ${rem}
        <div style="margin-top:10px;display:flex;gap:8px">
          <button class="btn btn-sm" onclick="App.navigate('#/k8s/monitoring/${e.tenantId}/${rack}')">랙 드릴다운 →</button>
          ${e.isFatal?`<button class="btn btn-sm" onclick="openApiPanel('janitor-crd')">유지보수 CRD 보기</button>
          <button class="btn btn-sm" onclick="toast('event-exporter → ITSM INC-20791 (CloudEvents) 연동됨 (mock)')">ITSM 티켓</button>`:''}
        </div>
      </div></div>`;
  };
  box.innerHTML=`
    <div style="display:flex;gap:6px;margin-bottom:12px">
      ${['all','critical','warning','info'].map(s=>`<button class="btn btn-sm ${filter===s?'btn-primary':''}"
        onclick="App.navigate('#/k8s/sentinel?tab=events${s==='all'?'':'&sev='+s}')">${s==='all'?'전체':s} ${s==='all'?NEOCLOUD_DATA.sentinelEvents.length:NEOCLOUD_DATA.sentinelEvents.filter(e=>e.sev===s).length}</button>`).join('')}
      <span class="small muted" style="margin-left:auto;align-self:center">fatal → Node Condition · non-fatal → K8s Event(Warning) ${apiIcon('healthevent-schema')}</span>
    </div>
    <div class="grid" style="grid-template-columns:1.6fr 1fr;align-items:start">
      <div>${evts.map(evtCard).join('')||'<div class="card"><div class="empty">이벤트 없음</div></div>'}</div>
      <div class="grid">
        <div class="card"><div class="card-h">Hot Spare 현황 <span class="chip">자체 기능 (NKD/Ansible)</span></div>
          <table class="table"><tr><th>테넌트</th><th>가용</th><th>상태</th></tr>
          ${NEOCLOUD_DATA.hotSpare.map(h=>{ const t=NEOCLOUD_DATA.tenant(h.tenantId);
            return `<tr><td>${esc(t.company)}</td><td><b>${h.total-h.used}</b> / ${h.total} tray</td>
              <td>${h.used?`<span class="badge b-amber">${h.used} 투입됨</span>`:'<span class="badge b-green">대기</span>'}</td></tr>`;}).join('')}</table>
          <div class="card-b small muted">NVSentinel remediation 완료 이벤트(remediation-succeeded/-failed)를 구독해 자체 오케스트레이터가 예비 tray 투입 — NVSentinel 범위 밖(plan_r10 자체 개발 항목)</div></div>
        <div class="card"><div class="card-h">외부 연동 (event-exporter)</div>
          <div class="card-b small">
            <div style="margin-bottom:6px">CloudEvents <code>com.nvidia.nvsentinel.health.v1</code> → ITSM/DW sink</div>
            <div class="muted">멀티클러스터(테넌트 5) 이벤트를 포탈 백엔드가 이 스트림으로 집계 — 이 화면의 데이터 소스 ${apiIcon('event-exporter')}</div>
          </div></div>
      </div>
    </div>`;
}

/* ---------- 모듈·정책 탭 ---------- */
function senTabPolicy(box){
  const M=NEOCLOUD_DATA.sentinelModules;
  const modRow=(m, actionable)=>`
    <tr><td><b class="mono small">${m.name}</b><div class="small muted">${m.kind||'Deployment'} · ${esc(m.desc)}</div></td>
      <td>${m.enabled?'<span class="badge b-green">enabled</span>':'<span class="badge b-gray">disabled</span>'}</td>
      ${actionable?`<td>${m.dryRun?'<span class="badge b-amber">dryRun</span>':'<span class="small muted">off</span>'}</td>`:'<td class="small muted">—</td>'}
      <td>${actionable?actionBtn(m.enabled?'비활성':'활성','policy',`toast('helm upgrade — global.${m.name.split(' ')[0].replace(/-([a-z])/g,(_,c)=>c.toUpperCase())}.enabled=${!m.enabled} (mock)')`,{sm:true,secondary:true}):''}</td></tr>`;
  const cb=M.circuitBreaker;
  box.innerHTML=`
    <div class="card" style="background:var(--accent-soft);border-color:transparent;margin-bottom:14px"><div class="card-b small">
      ℹ️ NVSentinel upstream <b>기본 설치는 탐지/표시 전용</b>입니다 (조치 모듈 3종 모두 <code>enabled: false</code>).
      NeoCloud는 Acceptance 검증 후 조치 모듈을 활성화한 상태 — 신규 테넌트는 <code>dryRun: true</code>로 1주 관찰 후 전환하는 것이 운영 표준. ${apiIcon('sentinel-values')}</div></div>
    <div class="grid" style="grid-template-columns:1fr 1fr;align-items:start">
      <div class="grid">
        <div class="card"><div class="card-h">탐지 모듈 (관측 전용 — 안전)</div>
          <table class="table"><tr><th>모듈</th><th>상태</th><th>dryRun</th><th></th></tr>
          ${M.detection.map(m=>modRow(m,false)).join('')}</table></div>
        <div class="card"><div class="card-h">조치 모듈 (클러스터 상태 변경)</div>
          <table class="table"><tr><th>모듈</th><th>상태</th><th>dryRun</th><th></th></tr>
          ${M.action.map(m=>modRow(m,true)).join('')}</table>
          <div class="card-b small muted">이벤트→조치 매핑: fault-quarantine <code>ruleSets[]</code> (CEL) · fault-remediation <code>maintenance.actions</code> (RESTART_BM→RebootNode, COMPONENT_RESET→GPUReset) ${apiIcon('sentinel-values')}</div></div>
      </div>
      <div class="grid">
        <div class="card"><div class="card-h">Circuit Breaker <span class="badge ${cb.status==='CLOSED'?'b-green':'b-red'}">${cb.status}</span>
          <div class="right">${apiIcon('circuit-breaker')}</div></div>
          <div class="card-b small">
            <div style="display:flex;justify-content:space-between;margin-bottom:5px">
              <span>동시 격리 사용률</span><b>${cb.utilization}% / ${cb.percentage}% (${cb.duration} 윈도우)</b></div>
            ${bar(cb.utilization/cb.percentage*100)}
            <p class="muted" style="margin:10px 0 8px">최근 ${cb.duration} 내 격리 노드가 전체의 ${cb.percentage}%를 넘으면 <b>TRIPPED</b> — 신규 quarantine 전면 중단 (연쇄 오탐/광역 장애로부터 가용자원 보호).</p>
            <p class="muted" style="margin-bottom:10px">⚠️ <b>자동 리셋 없음</b> — TRIPPED 시 원인 확인 후 운영자가 수동 리셋해야 합니다 (ConfigMap <code>circuit-breaker</code> 삭제 + fault-quarantine 재시작).</p>
            ${actionBtn('브레이커 리셋','policy',`toast('상태가 CLOSED — 리셋 불필요')`,{sm:true,secondary:true})}
            <span class="small muted" style="margin-left:8px">메트릭: <code>fault_quarantine_breaker_state</code> · <code>_breaker_utilization</code></span>
          </div></div>
        <div class="card"><div class="card-h">수동 개입 · 예외</div>
          <div class="card-b small">
            <table class="table">
              <tr><td class="muted" style="width:150px">임시 취소</td><td><code>kubectl uncordon &lt;node&gt;</code> → 워크플로 자동 중단·정리, 이벤트 Cancelled</td></tr>
              <tr><td class="muted">노드 영구 제외</td><td>라벨 <code>k8saas.nvidia.com/ManagedByNVSentinel=false</code></td></tr>
              <tr><td class="muted">이벤트 override</td><td><code>OverrideTransformer.rules[]</code> CEL — 특정 XID isFatal/action 재정의 (예: XID-109 억제)</td></tr>
              <tr><td class="muted">drain 정책</td><td><code>userNamespaces[].mode</code>: Immediate / AllowCompletion / DeleteAfterTimeout · <code>drainGPUPods: false</code></td></tr>
            </table>
          </div></div>
      </div>
    </div>`;
}

/* ---------- Preflight 탭 ---------- */
function senTabPreflight(box){
  const P=NEOCLOUD_DATA.sentinelModules.preflight;
  box.innerHTML=`
    <div class="grid" style="grid-template-columns:1.2fr 1fr;align-items:start">
      <div class="card"><div class="card-h">Preflight 체크 (mutating admission webhook) ${badge(P.enabled?'Active':'Retired')}
        <div class="right">${apiIcon('preflight-spec')}</div></div>
        <div class="card-b small">
          <p style="margin-bottom:10px">GPU Pod 생성 시 <b>진단 init container를 자동 주입</b> — 워크로드가 불량 노드/패브릭에서 시작되는 것을 사전 차단. 정상이면 이벤트 없음, 실패 시에만 health event 발생 + Pod <code>Init:Error</code> 유지.</p>
          <table class="table"><tr><th>체크</th><th>범위</th><th>소요</th></tr>
            <tr><td class="mono small">preflight-dcgm-diag</td><td class="small">단일 노드 — ECC/PCIe/thermal/stress</td><td class="small">30s ~ 15m</td></tr>
            <tr><td class="mono small">preflight-nccl-loopback</td><td class="small">단일 노드 — NVLink/PCIe intra-node</td><td class="small">~5s</td></tr>
            <tr><td class="mono small">preflight-nccl-allreduce</td><td class="small">멀티 노드 gang — cross-node fabric (NVL72/RoCE)</td><td class="small">~30s + gang 대기</td></tr>
          </table>
          <p class="muted" style="margin-top:10px">gang 조정: Volcano/Run:ai/native <code>workloadRef</code> 지원 — Slurm(SUNK) 학습 잡의 대규모 gang과 호환.</p>
        </div></div>
      <div class="card"><div class="card-h">적용 범위 (Namespace opt-in)</div>
        <div class="card-b small">
          <p style="margin-bottom:8px">라벨 <code>nvsentinel.nvidia.com/preflight=enabled</code>가 붙은 NS에만 webhook 적용:</p>
          <table class="table"><tr><th>테넌트</th><th>NS</th><th>상태</th></tr>
            <tr><td>SKHynix</td><td class="mono small">slurm</td><td><span class="badge b-green">enabled</span></td></tr>
            <tr><td>SKHynix</td><td class="mono small">default · dynamo</td><td><span class="badge b-gray">off</span></td></tr>
            <tr><td>CLAUDE</td><td class="mono small">default · dynamo · slurm</td><td><span class="badge b-gray">off (추론 — 짧은 진단도 콜드스타트 지연)</span></td></tr>
          </table>
          <p class="muted" style="margin-top:10px">권장: 학습 테넌트(장시간 gang 잡)는 켜고, 추론 테넌트는 스케일아웃 지연을 고려해 선택 적용. ${actionBtn('NS 정책 변경','policy',`toast('NS 라벨 변경 (mock)')`,{sm:true,secondary:true})}</p>
        </div></div>
    </div>`;
}

/* ---------- API 스펙 (NVSentinel 실물) ---------- */
NEOCLOUD_DATA.apiSpecs['healthevent-schema']={
  title:'HealthEvent — 스키마 & 조회 (NVSentinel v1.11)',
  intro:'proto: <code>data-models/protobufs/health_event.proto</code> · 저장: MongoDB <code>HealthEventsDatabase.health_events</code> (change stream) · CRD 노출: <code>healthevents.dgxc.nvidia.com/HealthEventResource</code>',
  tabs:{
    'Event (Mongo doc)':
`{
  "_id": "68e1f...",
  "createdAt": "2026-07-09T06:12:31+09:00",
  "healthevent": {
    "agent": "syslog-health-monitor",
    "componentClass": "GPU",
    "checkName": "SysLogsGPUFallenOff",
    "nodeName": "vr72-a-017-t09",
    "isFatal": true,
    "isHealthy": false,
    "message": "GPU has fallen off the bus",
    "errorCode": ["XID-79"],
    "recommendedAction": 24,             # RESTART_BM
    "entitiesImpacted": [
      { "entityType": "GPU", "entityValue": "GPU-8f2a91c4-..." }
    ],
    "metadata": { "gpu_index": "2", "driver_version": "580.82", "severity": "CRITICAL" },
    "processingStrategy": 1              # EXECUTE_REMEDIATION (2=STORE_ONLY 관측전용)
  },
  "healtheventstatus": {
    "nodeQuarantined": "Quarantined",    # null|Quarantined|UnQuarantined|AlreadyQuarantined
    "quarantineFinishTimestamp": "...",
    "userPodsEvictionStatus": { "status": "InProgress" },
                              # NotStarted|InProgress|Failed|Succeeded|AlreadyDrained|Cancelled
    "faultRemediated": false
  }
}`,
    'RecommendedAction enum':
`NONE            = 0    # 조치 불필요 (관측)
COMPONENT_RESET = 2    # → GPUReset CR (janitor, 초 단위)
CONTACT_SUPPORT = 5    # → break-fix 티켓 (HW 교체)
RUN_FIELDDIAG   = 6    # 정밀 진단 실행
RESTART_VM      = 15
RESTART_BM      = 24   # → RebootNode CR (베어메탈 재부팅)
REPLACE_VM      = 25
RUN_DCGMEUD     = 26
CUSTOM          = 27

# DCGM 코드 → 액션 매핑: dcgmerrorsmapping.csv (121종)
# DCGM_FR_VOLATILE_DBE_DETECTED → COMPONENT_RESET
# DCGM_FR_FAULTY_MEMORY         → CONTACT_SUPPORT`,
    '조회 (포탈 백엔드)':
`# 방법 1 — K8s API (CRD)
GET /apis/healthevents.dgxc.nvidia.com/v1
    /namespaces/nvsentinel/healtheventresources?limit=50

# 방법 2 — event-exporter가 내보내는 CloudEvents 스트림 구독 (권장)
#   멀티클러스터 집계 · at-least-once · 포탈 백엔드가 sink 역할

# 방법 3 — MongoDB 직접 (인덱스: nodeName, agent, created_at, status)
db.health_events.find({"healthevent.nodeName": "vr72-a-017-t09"})
                 .sort({createdAt: -1})`,
  }
};
NEOCLOUD_DATA.apiSpecs['node-condition-xid']={
  title:'노드 상태 표현 — 라벨/어노테이션/Condition (실제 키)',
  intro:'상태머신의 진실원본은 노드 라벨 <code>dgxc.nvidia.com/nvsentinel-state</code>. fatal → Condition, non-fatal → K8s Event(Warning).',
  tabs:{
    'Node (발췌)':
`GET /api/v1/nodes/vr72-a-017-t09

metadata:
  labels:
    dgxc.nvidia.com/nvsentinel-state: "draining"
      # quarantined → draining → drain-succeeded|drain-failed
      # → remediating → remediation-succeeded|remediation-failed
      # healthy 이벤트/수동 uncordon 시 라벨 제거(=cancel)
  annotations:
    quarantineHealthEvent: '{"checkName":"SysLogsGPUFallenOff",...}'
    quarantineHealthEventIsCordoned: "True"
    quarantineHealthEventAppliedTaints: '[]'   # 기본은 cordon만 (taint는 ruleset opt-in)
spec:
  unschedulable: true
status:
  conditions:
  - type: SysLogsGPUFallenOff        # fatal check → Condition (PascalCase)
    status: "True"
    message: "[XID-79] GPU has fallen off the bus - RecommendedAction: RESTART_BM"`,
    'Condition 종류':
`# GPU (gpu-health-monitor)
GpuMemWatch, GpuThermalWatch, GpuPcieWatch, GpuPowerWatch,
GpuInforomWatch, GpuSmWatch, GpuNvlinkWatch, GpuDriverWatch, ...

# Syslog (syslog-health-monitor)
SysLogsXIDError, SysLogsSXIDError, SysLogsGPUFallenOff

# NVSwitch / 기타
NVSwitchFatalError, NVSwitchDown, NVSwitchNonFatalError,
DCGMError, CSPMaintenance

# PromQL (kube-state-metrics 필요):
kube_node_status_condition{condition=~"Gpu.*|SysLogs.*|NVSwitch.*",status="true"}`,
    '수동 개입':
`# 임시 취소 — NVSentinel이 감지해 자동 정리
kubectl uncordon vr72-a-017-t09
# → annotation quarantinedNodeUncordonedManually="True"
# → 이벤트 userPodsEvictionStatus: Cancelled

# 영구 제외 (opt-out)
kubectl label node vr72-a-017-t09 \\
  k8saas.nvidia.com/ManagedByNVSentinel=false`,
  }
};
NEOCLOUD_DATA.apiSpecs['sentinel-values']={
  title:'NVSentinel 정책 — Helm values (실제 키)',
  intro:'모듈 on/off는 <code>global.*.enabled</code>, 조치 모듈은 <code>dryRun</code> 지원. 이벤트→조치 매핑은 CEL ruleset + maintenance.actions.',
  tabs:{
    '모듈 활성화':
`global:
  dryRun: false                      # 전역 dry-run
  gpuHealthMonitor:    { enabled: true }    # upstream 기본 켜짐 (탐지)
  syslogHealthMonitor: { enabled: true }
  labeler:             { enabled: true }
  # ↓ upstream 기본 false — NeoCloud는 검증 후 활성
  faultQuarantine:     { enabled: true }
  nodeDrainer:         { enabled: true }
  faultRemediation:    { enabled: true }
  janitor:             { enabled: true }
  preflight:           { enabled: true }
  eventExporter:       { enabled: true }    # → 포탈/ITSM 집계

node-drainer:
  evictionTimeoutInSeconds: "60"
  deleteAfterTimeoutMinutes: 60
  drainGPUPods: false
  partialDrainEnabled: true
  userNamespaces:
  - { name: "default", mode: "Immediate" }
  - { name: "slurm",   mode: "AllowCompletion" }   # 학습 잡은 완주 허용
  - { name: "dynamo",  mode: "DeleteAfterTimeout" }`,
    'Quarantine ruleset (CEL)':
`fault-quarantine:
  circuitBreaker: { enabled: true, percentage: 50, duration: "5m" }
  ruleSets:
  - name: fatal-gpu-events
    match:
      all:
      - kind: HealthEvent
        expression: >
          event.agent == 'syslog-health-monitor'
          && event.isFatal == true
      - kind: Node                       # opt-out 라벨 체크
        expression: >
          !('k8saas.nvidia.com/ManagedByNVSentinel' in node.labels
            && node.labels['k8saas.nvidia.com/ManagedByNVSentinel'] == 'false')
    action:
      cordon: { shouldCordon: true }     # taint는 별도 opt-in`,
    'Remediation 매핑':
`fault-remediation:
  maintenance:
    actions:
      RESTART_BM:      { kind: RebootNode }     # 베어메탈 재부팅
      COMPONENT_RESET: { kind: GPUReset }       # GPU만 리셋 (초 단위)
      CONTACT_SUPPORT: { kind: BreakFixTicket } # 커스텀 CRD → ITSM
    template: |                                 # Go 템플릿 — 임의 CRD 발행
      apiVersion: janitor.dgxc.nvidia.com/v1alpha1
      kind: {{ .Kind }}
      metadata:
        name: "{{ .NodeName }}-{{ .HealthEventID }}"
      spec:
        nodeName: "{{ .NodeName }}"

# 이벤트 속성 재정의 (오탐 억제)
platformConnector:
  transformers:
    OverrideTransformer:
      rules:
      - expression: "event.errorCode.exists(c, c == 'XID-109')"
        override: { isFatal: false }`,
  }
};
NEOCLOUD_DATA.apiSpecs['circuit-breaker']={
  title:'Circuit Breaker — 대량 격리 방지',
  intro:'윈도우(5m) 내 격리 비율이 임계(50%) 초과 시 TRIPPED — 신규 quarantine 전면 중단. <b>자동 리셋 없음</b> (운영자 수동 재개).',
  tabs:{
    '상태 확인':
`# 상태는 ConfigMap에 저장
kubectl get configmap circuit-breaker -n nvsentinel -o yaml
# data:
#   status: CLOSED        # CLOSED(정상) | TRIPPED(차단)

# 메트릭
fault_quarantine_breaker_state{state="closed"} 1
fault_quarantine_breaker_utilization 0.02      # 현재 격리 비율`,
    '리셋 (TRIPPED 시)':
`# ① 원인 확인 — 진짜 광역 장애인지, 오탐 폭주인지
kubectl get nodes -l dgxc.nvidia.com/nvsentinel-state --show-labels

# ② 수동 리셋
kubectl delete configmap circuit-breaker -n nvsentinel
kubectl rollout restart deploy/fault-quarantine -n nvsentinel

# 포탈 [브레이커 리셋] 버튼 = 위 2단계를 Admin API로 래핑`,
  }
};
NEOCLOUD_DATA.apiSpecs['janitor-crd']={
  title:'유지보수 CRD — RebootNode / GPUReset (janitor)',
  intro:'fault-remediation이 생성 → janitor가 실행. MTTR 메트릭 <code>janitor_action_mttr_seconds</code>로 계측.',
  tabs:{
    'RebootNode':
`apiVersion: janitor.dgxc.nvidia.com/v1alpha1
kind: RebootNode
metadata:
  name: vr72-a-017-t09-68e1f
  namespace: nvsentinel
spec:
  nodeName: vr72-a-017-t09
status:
  phase: Pending          # → InProgress → Succeeded/Failed
  startedAt: null

# janitor가 BMC(Redfish) 또는 노드 명령으로 재부팅 실행
# 완료 시 상태머신: remediating → remediation-succeeded
# → 자체 오케스트레이터가 이 시점을 구독해 hot spare 투입 판단`,
    'GPUReset':
`apiVersion: janitor.dgxc.nvidia.com/v1alpha1
kind: GPUReset
metadata:
  name: vr72-a-088-t02-gpu3-reset
spec:
  nodeName: vr72-a-088-t02
  gpuIndex: 3             # 노드 재부팅 없이 해당 GPU만 리셋 (초 단위)

# COMPONENT_RESET 권고 시 사용 — 워크로드 영향 최소화`,
  }
};
NEOCLOUD_DATA.apiSpecs['preflight-spec']={
  title:'Preflight — admission webhook 사전 검증',
  intro:'파이프라인과 분리 — 정상이면 이벤트 없음. 실패 시에만 health event 발생 + Pod Init:Error.',
  tabs:{
    '활성화':
`# ① 전역 활성
global: { preflight: { enabled: true } }

# ② Namespace opt-in (라벨)
kubectl label ns slurm nvsentinel.nvidia.com/preflight=enabled

# ③ (선택) Pod 라벨 필터
preflight: { objectSelector: { matchLabels: { workload-type: training } } }`,
    '동작':
`Pod 생성 (GPU 요청)
  → mutating webhook이 init container 주입
  → preflight-nccl-loopback (~5s) / preflight-dcgm-diag /
    preflight-nccl-allreduce (멀티노드 gang — Volcano/Run:ai/workloadRef 조정)
  → PASS: init 종료, 본 컨테이너 시작 (이벤트 없음)
  → FAIL: Pod Init:Error 유지 + health event 발생
          → 일반 quarantine 경로 진입 (불량 노드 자동 격리)`,
  }
};
NEOCLOUD_DATA.apiSpecs['event-exporter']={
  title:'event-exporter — CloudEvents → ITSM/포탈 집계',
  intro:'datastore change stream을 CloudEvents v1.0으로 외부 sink에 전송 (at-least-once, resume token). 포탈 백엔드가 테넌트 5개 클러스터를 집계하는 표준 진입점.',
  tabs:{
    'CloudEvent':
`POST https://portal-backend.neocloud.skt.com/sinks/nvsentinel
ce-specversion: 1.0
ce-type: com.nvidia.nvsentinel.health.v1
ce-source: /clusters/tenant-alpha
Authorization: Bearer <oidc-token>

{
  "healthevent": { "checkName": "SysLogsGPUFallenOff",
                   "nodeName": "vr72-a-017-t09", "isFatal": true, ... },
  "healtheventstatus": { "nodeQuarantined": "Quarantined", ... },
  "metadata": { "cluster": "tenant-alpha", "region": "aidc-1" }
}`,
    '설정':
`event-exporter:
  exporter:
    sink:
      endpoint: https://portal-backend.neocloud.skt.com/sinks/nvsentinel
      oidc: { ... }               # 발신 인증
    backfill: { enabled: true }   # 과거 이벤트 백필
    metadata:                     # 클러스터 식별 태그
      cluster: tenant-alpha
      environment: production
      region: aidc-1`,
  }
};

/* ============================================================
 * 스토리지 (GDS) — 테넌트별 CSI/GDS 할당·사용량
 * ============================================================ */
App.register('#/k8s/storage', function(elm){
  const D=NEOCLOUD_DATA;
  const cards=D.storage.map(s=>{
    const t=D.tenant(s.tenantId);
    const pct=s.capacityTB?Math.round(s.usedTB/s.capacityTB*100):0;
    const vols=s.volumes.map(v=>`
      <tr><td class="mono small"><b>${v.pvc}</b></td><td class="mono small">${v.ns}</td>
        <td><span class="chip">${v.mode}</span></td><td class="small">${v.sizeTB.toLocaleString()} TB</td>
        <td>${v.gds?'<span class="badge b-green">GDS</span>':'<span class="badge b-gray">—</span>'}</td>
        <td class="mono small muted">${v.sc}</td></tr>`).join('');
    return `<div class="card" style="margin-bottom:14px">
      <div class="card-h">${esc(t.company)} <span class="chip">${esc(s.vendor)}</span>
        ${s.gds?'<span class="badge b-green">GDS 활성</span>':'<span class="badge b-gray">GDS 미사용</span>'}
        <div class="right small muted">${apiIcon('pvc-gds')}</div></div>
      <div class="card-b">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:${s.volumes.length?'12px':'0'}">
          <div style="flex:1">${bar(pct, pct>85?'var(--amber)':null)}</div>
          <span class="small"><b>${s.usedTB.toLocaleString()}</b> / ${s.capacityTB.toLocaleString()} TB (${pct}%)</span>
        </div>
        ${s.volumes.length?`<table class="table"><tr><th>PVC</th><th>Namespace</th><th>Mode</th><th>용량</th><th>GDS</th><th>StorageClass</th></tr>${vols}</table>`
          :'<div class="small muted">할당 볼륨 없음 (반납 시 회수 완료)</div>'}
      </div></div>`;
  }).join('');
  elm.innerHTML=`
    <div class="page-h"><div><h1>스토리지 (GDS)</h1>
      <div class="sub">벤더 CSI 하나로 block(RWO)·공유(RWX 병렬FS) 동적 프로비저닝 — GDS·RDMA는 성능 최적화 트랙 ${apiIcon('pvc-gds')}</div></div>
      <div class="right"><span class="chip">VAST 2식 · WEKA 1식 연동됨</span></div></div>
    ${cards}`;
});

/* ---------- API 스펙 ---------- */
NEOCLOUD_DATA.apiSpecs['pvc-gds']={
  title:'스토리지 — StorageClass + PVC (표준 CSI)',
  intro:'고객은 표준 PVC만 생성 — StorageClass가 벤더 CSI·GDS 여부를 캡슐화.',
  tabs:{
    'StorageClass':
`apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: vast-rwx-gds
provisioner: csi.vastdata.com
parameters:
  protocol: nfs4-rdma          # RDMA 경로 (GDS)
  vippool: pool-alpha
  qosPolicy: gold
allowVolumeExpansion: true
volumeBindingMode: Immediate`,
    'PVC (고객 생성)':
`apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: model-weights
  namespace: default
spec:
  accessModes: ["ReadWriteMany"]      # RWX — 병렬 FS
  storageClassName: vast-rwx-gds
  resources:
    requests:
      storage: 512Ti`,
    'Pod에서 GDS 사용':
`apiVersion: v1
kind: Pod
spec:
  containers:
  - name: vllm
    image: vllm/vllm-openai:v0.9.2
    env:
    - name: CUFILE_ENV_PATH_JSON      # GPUDirect Storage (cuFile)
      value: /etc/cufile.json
    volumeMounts:
    - { name: weights, mountPath: /models }
  volumes:
  - name: weights
    persistentVolumeClaim: { claimName: model-weights }`,
  }
};

/* ============================================================
 * 모니터링
 *   테넌트 그리드 → [클러스터(K8s) — Grafana embed 스타일 | GPU/랙 히트맵]
 *   → 랙 상세(18 tray) → Pod → 로그 스트리밍
 * ============================================================ */
App.register('#/k8s/monitoring', function(elm){
  const D=NEOCLOUD_DATA;
  const cards=D.tenants.map(t=>{
    const racks=genRacks(t.id);
    const act=racks.filter(r=>r.status==='active');
    const avg=act.length?Math.round(act.reduce((s,r)=>s+r.util,0)/act.length):0;
    const alarms=racks.filter(r=>r.alarm).length;
    const gauge=`<svg width="86" height="52" viewBox="0 0 86 52">
      <path d="M 8 48 A 35 35 0 0 1 78 48" fill="none" stroke="var(--line)" stroke-width="9" stroke-linecap="round"/>
      <path d="M 8 48 A 35 35 0 0 1 78 48" fill="none" stroke="${avg>85?'var(--green)':utilColor(avg)}" stroke-width="9" stroke-linecap="round"
        stroke-dasharray="${(avg/100*110).toFixed(0)} 200"/>
      <text x="43" y="46" text-anchor="middle" font-size="15" font-weight="800" fill="var(--ink)">${avg}%</text></svg>`;
    return `<div class="card" style="cursor:pointer" onclick="App.navigate('#/k8s/monitoring/${t.id}')">
      <div class="card-h">${esc(t.company)} ${badge(t.lifecycle)}
        <div class="right">${alarms?`<span class="badge b-red">알람 ${alarms}</span>`:''}</div></div>
      <div class="card-b" style="display:flex;gap:16px;align-items:center">
        ${gauge}
        <div class="small">
          <div><b>${act.length}</b>/100 랙 가동 · GPU ${(act.length*72).toLocaleString()}기</div>
          <div class="muted" style="margin-top:3px">평균 GPU Util ${avg}% · ${esc(t.workload)}</div>
          <div class="muted" style="margin-top:3px">${t.lifecycle==='Active'?'▲ SLO 99.9% 충족':esc(t.note||'—')}</div>
        </div>
      </div></div>`;
  }).join('');
  elm.innerHTML=`
    <div class="page-h"><div><h1>모니터링</h1>
      <div class="sub">멀티클러스터 통합 (Prometheus + Grafana + Loki) — 클러스터(K8s) 대시보드 + GPU/랙 드릴다운 ${apiIcon('promql')}</div></div>
      <div class="right"><span class="chip">scrape 15s · retention 30d</span><span class="chip">Grafana 11.x · Loki · Prometheus</span></div></div>
    <div class="grid" style="grid-template-columns:repeat(2,1fr)">${cards}</div>`;
});

/* ---------- 테넌트 모니터링 (탭: 클러스터 K8s | GPU/랙) ---------- */
App.register('#/k8s/monitoring/:tenantId', function(elm, p){
  const t=NEOCLOUD_DATA.tenant(p.tenantId);
  if(!t){ elm.innerHTML='<div class="empty">테넌트 없음</div>'; return; }
  const tab=p.tab||'k8s';
  const tabs=[['k8s','클러스터 (K8s)'],['racks','GPU / 랙']];
  if(t.dynamoDGDs && t.dynamoDGDs.length) tabs.splice(1,0,['dynamo','Dynamo (Inferium)']);
  elm.innerHTML=`
    <div class="page-h"><div><h1>${esc(t.company)} — 모니터링 ${badge(t.lifecycle)}</h1>
      <div class="sub">K8s ${t.k8sVersion} · 100 racks · GPU ${t.gpus.toLocaleString()} · NS ${t.nsList.join('/')} ${apiIcon('grafana-embed')}</div></div>
      <div class="right"><button class="btn" onclick="App.navigate('#/k8s/monitoring')">← 테넌트</button></div></div>
    <div class="tabs">${tabs.map(([k,l])=>`<button class="${tab===k?'on':''}" onclick="App.navigate('#/k8s/monitoring/${t.id}?tab=${k}')">${l}</button>`).join('')}</div>
    <div id="mon-tab"></div>`;
  const box=document.getElementById('mon-tab');
  if(tab==='k8s') monTabK8s(box, t);
  else if(tab==='dynamo' && t.dynamoDGDs) monTabDynamo(box, t);
  else monTabRacks(box, t);
});

/* ---------- 시계열 mock (시드 기반 — 리로드해도 동일) ---------- */
function monSeries(seed, n, base, amp, drift=0){
  const rnd=mulberry32(hashStr(seed)); let v=base; const out=[];
  for(let i=0;i<n;i++){ v=Math.max(0, v+(rnd()-0.5)*amp+drift); out.push(v); }
  return out;
}
function gLine(vals, opts={}){
  const w=opts.w||280, h=opts.h||62, c=opts.color||'#73BF69';
  const max=Math.max(...vals)*1.12, min=Math.min(...vals)*0.92;
  const pt=(v,i)=>`${(i/(vals.length-1)*w).toFixed(1)},${(h-(v-min)/(max-min)*h).toFixed(1)}`;
  const line=vals.map(pt).join(' ');
  return `<svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <polygon points="0,${h} ${line} ${w},${h}" fill="${c}" opacity="0.13"/>
    <polyline points="${line}" fill="none" stroke="${c}" stroke-width="1.6"/></svg>`;
}
function gPanel(title, bodyHtml, promql){
  return `<div class="gpanel"><div class="gp-h tip" ${promql?`data-tip="${esc(promql)}"`:''}>${esc(title)}</div>
    <div class="gp-b">${bodyHtml}</div></div>`;
}

/* ---------- 클러스터 (K8s) 탭 — Grafana embed 시뮬레이션 ---------- */
function monTabK8s(box, t){
  if(!['Active','Provisioned'].includes(t.lifecycle)){
    box.innerHTML='<div class="card"><div class="empty"><div class="big">⏳</div>클러스터 미개통 — 대시보드 없음</div></div>'; return;
  }
  const s=(m,b,a,d)=>monSeries(t.id+m, 48, b, a, d);
  const last=v=>v[v.length-1];
  const apiReq=s('apireq', 4200, 700), apiP99=s('apip99', 84, 26), pend=s('pend', 12, 8),
        restarts=s('rst', 2, 3), netRx=s('netrx', 62, 18), netTx=s('nettx', 48, 14),
        etcdFsync=s('etcd', 4.2, 1.6);
  const nsRows=[
    { ns:'default', run: t.id==='tenant-alpha'?4210:120, pen:3, fail:1, rst:4, cpu:'38%', mem:'52%', gpu:t.id==='tenant-alpha'?'6,912':'0' },
    { ns:'slurm', run: t.id==='tenant-epsilon'?1780:(t.id==='tenant-beta'?260:12), pen: t.id==='tenant-epsilon'?9:0, fail:0, rst:1, cpu:'71%', mem:'64%', gpu:t.id==='tenant-epsilon'?'7,104':'288' },
    { ns:'dynamo', run: t.id==='tenant-alpha'?730:8, pen:0, fail:0, rst:2, cpu:'22%', mem:'31%', gpu:t.id==='tenant-alpha'?'288':'0' },
    { ns:'kube-system', run:214, pen:0, fail:0, rst:0, cpu:'8%', mem:'14%', gpu:'—' },
    { ns:'monitoring', run:96, pen:0, fail:0, rst:1, cpu:'11%', mem:'26%', gpu:'—' },
    { ns:'gpu-operator', run:1832, pen:0, fail:0, rst:0, cpu:'4%', mem:'9%', gpu:'—' },
  ];
  const totRun=nsRows.reduce((x,r)=>x+r.run,0);
  const cps=[
    ['kube-apiserver ×3','ok','leaderless (LB)'],['etcd ×3','ok','leader: cp-2 · db 1.4 GiB'],
    ['kube-scheduler','ok','leader: cp-1'],['kube-controller-manager','ok','leader: cp-3'],
    ['coredns ×4','ok','cache hit 97%'],['NVSentinel platform-connectors','ok','change stream OK'],
  ];
  const pvcs=(NEOCLOUD_DATA.storage.find(x=>x.tenantId===t.id)||{volumes:[]}).volumes;
  box.innerHTML=`
    <div class="card" style="background:var(--accent-soft);border-color:transparent;margin-bottom:12px"><div class="card-b small">
      🖼 아래 영역은 <b>Grafana 대시보드 embed 시뮬레이션</b>입니다 — 실개발 시 이 자리에 Grafana iframe(kiosk 모드)이 들어갑니다. ${apiIcon('grafana-embed')}</div></div>
    <div class="gwrap">
      <div class="gbar">📊 <b>Grafana</b> · neocloud-${t.id} / <b>K8s Cluster Overview</b>
        <span class="gchip">⏱ Last 6h</span><span class="gchip">↻ 30s</span>
        <span class="gchip"><span id="g-live" style="color:#73BF69">●</span> live</span>
        <span class="gchip" style="margin-left:auto;cursor:pointer" onclick="toast('Grafana 새 창 열기 (mock) — /d/k8s-overview?orgId=${t.id}')">Open in Grafana ↗</span></div>

      <div class="ggrid" style="grid-template-columns:repeat(6,1fr)">
        ${gPanel('API Server 가용성 (30d)','<div class="gstat">99.99%</div><div class="gsub">SLO 99.9% ✓</div>','apiserver_request:availability30d')}
        ${gPanel('API p99 Latency','<div class="gstat" id="gs-p99">'+last(apiP99).toFixed(0)+' ms</div><div class="gsub">read: 41ms · write: 96ms</div>','histogram_quantile(0.99, apiserver_request_duration_seconds)')}
        ${gPanel('etcd fsync p99','<div class="gstat" id="gs-etcd">'+Math.max(1.2,last(etcdFsync)).toFixed(1)+' ms</div><div class="gsub">db 1.4 GiB · leader cp-2</div>','etcd_disk_wal_fsync_duration_seconds')}
        ${gPanel('Nodes Ready','<div class="gstat '+(t.id==='tenant-alpha'?'warn':'')+'">'+(t.id==='tenant-alpha'?'1,799':'1,800')+' / 1,800</div><div class="gsub">'+(t.id==='tenant-alpha'?'1 quarantined (XID-79)':'all ready')+'</div>','sum(kube_node_status_condition{condition="Ready",status="true"})')}
        ${gPanel('Running Pods','<div class="gstat blue">'+totRun.toLocaleString()+'</div><div class="gsub">pending '+last(pend).toFixed(0)+' · failed 1</div>','sum(kube_pod_status_phase{phase="Running"})')}
        ${gPanel('GPU 할당률','<div class="gstat">'+(t.id==='tenant-epsilon'?'98.7%':'93.4%')+'</div><div class="gsub">requests / allocatable (7,200 GPU)</div>','sum(kube_pod_container_resource_requests{resource="nvidia.com/gpu"}) / sum(kube_node_status_allocatable{resource="nvidia.com/gpu"})')}
      </div>

      <div class="ggrid" style="grid-template-columns:repeat(4,1fr);margin-top:8px">
        ${gPanel('API Server req/s (verb별)', '<div id="gc-apireq">'+gLine(apiReq)+'</div><div class="gsub" id="gt-apireq">'+last(apiReq).toFixed(0)+' req/s — GET 42% · LIST 18% · WATCH 22% · PATCH 11%</div>','sum(rate(apiserver_request_total[5m])) by (verb)')}
        ${gPanel('Scheduler — Pending Pods', '<div id="gc-pend">'+gLine(pend,{color:'#FADE2A'})+'</div><div class="gsub" id="gt-pend">'+last(pend).toFixed(0)+' pending · e2e p99 380ms</div>','scheduler_pending_pods · scheduler_e2e_scheduling_duration')}
        ${gPanel('Container Restarts (1h)', '<div id="gc-rst">'+gLine(restarts,{color:'#F2495C'})+'</div><div class="gsub">OOMKilled 0 · CrashLoop 1 (dynamo-worker)</div>','sum(increase(kube_pod_container_status_restarts_total[1h]))')}
        ${gPanel('Network RX/TX (Gbps, 노드 합산)', '<div id="gc-net">'+gLine(netRx,{color:'#5794F2'})+'</div><div class="gsub" id="gt-net">RX '+last(netRx).toFixed(0)+' · TX '+last(netTx).toFixed(0)+' Gbps (RoCE 별도)</div>','rate(node_network_receive_bytes_total[5m])')}
      </div>

      <div class="ggrid" style="grid-template-columns:1.5fr 1fr;margin-top:8px">
        ${gPanel('Namespace 워크로드', `<table class="gtable">
          <tr><th>NS</th><th>Running</th><th>Pend</th><th>Fail</th><th>Restarts(1h)</th><th>CPU</th><th>Mem</th><th>GPU req</th></tr>
          ${nsRows.map(r=>`<tr><td><b>${r.ns}</b></td><td>${r.run.toLocaleString()}</td>
            <td>${r.pen?`<span class="gbadge gb-warn">${r.pen}</span>`:'0'}</td>
            <td>${r.fail?`<span class="gbadge gb-red">${r.fail}</span>`:'0'}</td>
            <td>${r.rst}</td><td>${r.cpu}</td><td>${r.mem}</td><td>${r.gpu}</td></tr>`).join('')}
        </table>`,'kube_pod_status_phase / container_cpu_usage_seconds_total by (namespace)')}
        <div class="ggrid">
          ${gPanel('Control Plane', `<table class="gtable">
            ${cps.map(c=>`<tr><td>${c[0]}</td><td><span class="gbadge gb-ok">UP</span></td><td style="color:#7B8087">${c[2]}</td></tr>`).join('')}
          </table>`,'up{job=~"apiserver|etcd|kube-scheduler|kube-controller-manager"}')}
          ${gPanel('PVC 사용량 (CSI)', pvcs.length?pvcs.map(v=>{
            const pct=[78,64,41,88,72][pvcs.indexOf(v)%5];
            return `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:11px">
              <span style="width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v.ns}/${v.pvc}</span>
              <div style="flex:1;height:7px;background:#22252B;border-radius:4px"><div style="width:${pct}%;height:100%;border-radius:4px;background:${pct>85?'#F2495C':(pct>70?'#FADE2A':'#73BF69')}"></div></div>
              <span style="color:#7B8087">${pct}%</span></div>`;}).join('')
            :'<div class="gsub">PVC 없음</div>','kubelet_volume_stats_used_bytes / capacity_bytes')}
        </div>
      </div>
    </div>
    <p class="small muted" style="margin-top:10px">GPU 하드웨어 헬스(XID·격리·복구)는 <a href="#/k8s/sentinel">장애관리(NVSentinel)</a>, GPU 사용률/랙 히트맵은 <a href="#/k8s/monitoring/${t.id}?tab=racks">GPU/랙 탭</a> — 이 대시보드는 K8s 컨트롤플레인·워크로드 관점.</p>`;

  /* ── 라이브 틱: 2s마다 시계열 이동 + 스탯 갱신 (라우트 이탈 시 App.render가 정리) ── */
  if(window._monDashTimer) clearInterval(window._monDashTimer);
  const step=(arr,amp,min=0)=>{ arr.push(Math.max(min, last(arr)+(Math.random()-0.5)*amp)); arr.shift(); };
  window._monDashTimer=setInterval(()=>{
    const $=id=>document.getElementById(id);
    if(!$('gc-apireq')){ clearInterval(window._monDashTimer); window._monDashTimer=null; return; }
    step(apiReq,520); step(pend,6); step(restarts,2.2); step(netRx,14); step(netTx,10);
    step(apiP99,20,22); step(etcdFsync,1.1,1.2);
    $('gc-apireq').innerHTML=gLine(apiReq);
    $('gt-apireq').textContent=last(apiReq).toFixed(0)+' req/s — GET 42% · LIST 18% · WATCH 22% · PATCH 11%';
    $('gc-pend').innerHTML=gLine(pend,{color:'#FADE2A'});
    $('gt-pend').textContent=last(pend).toFixed(0)+' pending · e2e p99 380ms';
    $('gc-rst').innerHTML=gLine(restarts,{color:'#F2495C'});
    $('gc-net').innerHTML=gLine(netRx,{color:'#5794F2'});
    $('gt-net').textContent='RX '+last(netRx).toFixed(0)+' · TX '+last(netTx).toFixed(0)+' Gbps (RoCE 별도)';
    $('gs-p99').textContent=last(apiP99).toFixed(0)+' ms';
    $('gs-etcd').textContent=Math.max(1.2,last(etcdFsync)).toFixed(1)+' ms';
    const live=$('g-live'); if(live) live.style.opacity=(live.style.opacity==='0.25'?'1':'0.25');
  }, 2000);
}

/* ---------- GPU/랙 탭 (기존 히트맵) ---------- */
function monTabRacks(box, t){
  const racks=genRacks(t.id);
  const cells=racks.map(r=>{
    const bg=r.status==='active'?utilColor(r.util):(r.status==='provisioning'?'#28425e':'#223142');
    return `<div class="hm-cell ${r.alarm?'alarm':''}" style="background:${r.alarm?'var(--red)':bg}"
      title="${r.rack} — util ${r.util}% · ${r.temp}°C · ${r.status}${r.alarm?' · XID!':''}"
      onclick="App.navigate('#/k8s/monitoring/${t.id}/${r.rack}')">${r.idx}</div>`;
  }).join('');
  const legend=[['0%','#223142'],['<30','#173350'],['<55','#22507c'],['<75','#2f6ea8'],['<90','#3d8ad0'],['90+','#5aa7e8'],['알람','var(--red)']]
    .map(([l,c])=>`<span style="display:inline-flex;align-items:center;gap:4px" class="small muted"><i style="width:11px;height:11px;border-radius:3px;background:${c};display:inline-block"></i>${l}</span>`).join(' ');
  const act=racks.filter(r=>r.status==='active');
  box.innerHTML=`
    <div class="grid" style="grid-template-columns:1.5fr 1fr;align-items:start">
      <div class="card"><div class="card-h">랙 히트맵 — 셀 = VR NVL72 (18 tray · 72 GPU) · 색 = 평균 GPU Util ${apiIcon('promql')}</div>
        <div class="card-b">
        <div class="heatmap">${cells}</div>
        <div style="display:flex;gap:12px;margin-top:12px;flex-wrap:wrap">${legend}</div>
      </div></div>
      <div class="grid">
        <div class="card"><div class="card-h">클러스터 요약</div><div class="card-b small">
          <table class="table">
            <tr><td class="muted">가동 랙</td><td><b>${act.length}</b> / 100</td></tr>
            <tr><td class="muted">평균 Util / 온도</td><td>${Math.round(act.reduce((s,r)=>s+r.util,0)/Math.max(1,act.length))}% · ${Math.round(act.reduce((s,r)=>s+r.temp,0)/Math.max(1,act.length))}°C</td></tr>
            <tr><td class="muted">알람 랙</td><td>${racks.filter(r=>r.alarm).map(r=>`<a href="#/k8s/monitoring/${t.id}/${r.rack}" style="color:var(--red);font-weight:700">${r.rack}</a>`).join(', ')||'없음'}</td></tr>
            <tr><td class="muted">NVLink 도메인</td><td>랙 단위 NVL72 (tray 간 NVLink switch)</td></tr>
          </table></div></div>
        <div class="card"><div class="card-h">PromQL (이 화면의 쿼리) ${apiIcon('promql')}</div><div class="card-b">
          <code class="small" style="display:block;padding:6px 0;color:var(--ink-2)">avg by (rack) (DCGM_FI_DEV_GPU_UTIL{tenant="${t.id}"})</code>
          <code class="small" style="display:block;padding:6px 0;color:var(--ink-2)">max by (rack) (DCGM_FI_DEV_GPU_TEMP{tenant="${t.id}"})</code>
          <code class="small" style="display:block;padding:6px 0;color:var(--ink-2)">sum(kube_node_spec_unschedulable{tenant="${t.id}"})</code>
        </div></div>
      </div>
    </div>`;
}

/* ---------- 랙 상세 (트레이 → Pod → 로그) ---------- */
App.register('#/k8s/monitoring/:tenantId/:rack', function(elm, p){
  const t=NEOCLOUD_DATA.tenant(p.tenantId);
  const rack=genRacks(t.id).find(r=>r.rack===p.rack);
  if(!rack){ elm.innerHTML='<div class="empty">랙 없음</div>'; return; }
  const trayRow=(tr)=>{
    const gpuBars=tr.gpus.map(g=>`<div class="tip" data-tip="GPU ${g.idx}: ${g.xid?g.xid:g.util+'% · '+g.temp+'°C'}"
      style="width:26px;height:16px;border-radius:3px;background:${g.xid?'var(--red)':utilColor(g.util)}"></div>`).join('');
    const bad=tr.status.includes('NotReady');
    return `<tr class="click" onclick="monTray('${t.id}','${rack.rack}',${tr.tray})" ${bad?'style="background:var(--red-soft)"':''}>
      <td class="mono small"><b>${tr.node}</b></td>
      <td>${bad?'<span class="badge b-red">NotReady,SchedulingDisabled</span>':badge(tr.status==='Ready'?'Ready':tr.status)}</td>
      <td><div style="display:flex;gap:4px">${gpuBars}</div></td>
      <td class="small muted">${tr.pods.length} pods</td></tr>`;
  };
  elm.innerHTML=`
    <div class="page-h"><div><h1>${rack.rack} ${rack.alarm?'<span class="badge b-red">XID 79</span>':badge('Ready')}</h1>
      <div class="sub">${esc(t.company)} · Vera Rubin NVL72 — 18 compute tray × 4 GPU · util ${rack.util}% ${apiIcon('pods-list')}</div></div>
      <div class="right"><button class="btn" onclick="App.navigate('#/k8s/monitoring/${t.id}?tab=racks')">← 히트맵</button></div></div>
    <div class="grid" style="grid-template-columns:1fr 1.1fr;align-items:start">
      <div class="card"><div class="card-h">트레이 (노드)</div>
        <table class="table"><tr><th>노드</th><th>상태</th><th>GPU (4)</th><th>Pods</th></tr>
        ${rack.trays.map(trayRow).join('')}</table></div>
      <div id="mon-side"><div class="card"><div class="empty"><div class="big">👈</div>트레이를 선택하면 Pod 목록이 표시됩니다</div></div></div>
    </div>`;
  if(rack.alarm) monTray(t.id, rack.rack, 9);
});

function monTray(tenantId, rackId, trayNo){
  const rack=genRacks(tenantId).find(r=>r.rack===rackId);
  const tr=rack.trays[trayNo-1];
  const podRow=(pd,i)=>`
    <tr class="click" onclick="monLog('${tenantId}','${rackId}',${trayNo},${i})">
      <td class="mono small"><b>${pd.name}</b></td><td class="mono small">${pd.ns}</td>
      <td class="small">${tr.status.includes('NotReady')&&pd.kind!=='system'?'<span class="badge b-amber">Terminating</span>':'<span class="badge b-green">Running</span>'}</td>
      <td class="small">${pd.restarts}</td><td class="small muted">${pd.age}</td>
      <td><button class="btn btn-sm">로그 ▸</button></td></tr>`;
  document.getElementById('mon-side').innerHTML=`
    <div class="card"><div class="card-h">${tr.node} — Pods <span class="muted small">(${tr.pods.length})</span>
      <div class="right">${apiIcon('pods-list')}</div></div>
      ${tr.pods.length?`<table class="table"><tr><th>Pod</th><th>NS</th><th>상태</th><th>재시작</th><th>Age</th><th></th></tr>
        ${tr.pods.map(podRow).join('')}</table>`
        :'<div class="empty small">Pod 없음 (cordon/drain 완료 또는 미가동)</div>'}
    </div>
    <div id="mon-log"></div>`;
}

const MONLOG={ follow:true, tail:200, filter:'', ts:true, container:'main' };
function monLog(tenantId, rackId, trayNo, podIdx){
  const rack=genRacks(tenantId).find(r=>r.rack===rackId);
  const tr=rack.trays[trayNo-1];
  const pd=tr.pods[podIdx];
  MONLOG.pod=pd; MONLOG.ns=pd.ns; MONLOG.follow=true; MONLOG.filter='';
  MONLOG.container={vllm:'vllm', nccl:'trainer', system:pd.name.startsWith('dcgm')?'dcgm-exporter':'agent'}[pd.kind]||'main';
  monLogRender();
}
function monLogQuery(){
  return `GET /api/v1/namespaces/${MONLOG.ns}/pods/${MONLOG.pod.name}/log`+
    `?container=${MONLOG.container}&follow=${MONLOG.follow}&tailLines=${MONLOG.tail}${MONLOG.ts?'&timestamps=true':''}`;
}
function monLogRender(){
  const pd=MONLOG.pod;
  const box=document.getElementById('mon-log');
  const containers={vllm:['vllm'], nccl:['trainer','nccl-sidecar'], system:[MONLOG.container]}[pd.kind]||['main'];
  box.innerHTML=`
    <div class="card" style="margin-top:14px;display:flex;flex-direction:column">
      <div class="logctl">
        <b>${esc(pd.name)}</b>
        <select id="ml-c" onchange="MONLOG.container=this.value;monLogRender()">
          ${containers.map(c=>`<option ${MONLOG.container===c?'selected':''}>${c}</option>`).join('')}</select>
        <span class="switch ${MONLOG.follow?'on':''}" onclick="MONLOG.follow=!MONLOG.follow;monLogRender()"><span class="tr"></span> follow</span>
        <select id="ml-t" onchange="MONLOG.tail=+this.value;monLogRender()">
          ${[100,200,500].map(v=>`<option value="${v}" ${MONLOG.tail===v?'selected':''}>tail ${v}</option>`).join('')}</select>
        <input type="text" id="ml-f" placeholder="필터 (grep)" value="${esc(MONLOG.filter)}"
          onchange="MONLOG.filter=this.value;monLogRender()" style="width:120px">
        <span class="switch ${MONLOG.ts?'on':''}" onclick="MONLOG.ts=!MONLOG.ts;monLogRender()"><span class="tr"></span> ts</span>
        <span style="margin-left:auto">${apiIcon('pod-logs')}</span>
      </div>
      <div style="background:#1E293B;padding:5px 12px"><code class="small" style="color:#7DD3FC" id="ml-q">${esc(monLogQuery())}</code></div>
      <div class="logbox" id="ml-box" style="height:300px"></div>
    </div>`;
  const lines=NEOCLOUD_DATA.logs[pd.kind==='system'?'installer':pd.kind]||NEOCLOUD_DATA.logs.vllm;
  const src=MONLOG.ts?lines.map(l=>'2026-07-09T10:'+(40+Math.floor(Math.random()*19))+':'+String(Math.floor(Math.random()*60)).padStart(2,'0')+'Z '+l):lines;
  startLogStream(document.getElementById('ml-box'), src, {follow:MONLOG.follow, tail:MONLOG.tail, filter:MONLOG.filter});
  box.scrollIntoView({behavior:'smooth', block:'nearest'});
}

/* ---------- API 스펙 ---------- */
NEOCLOUD_DATA.apiSpecs['grafana-embed']={
  title:'Grafana 대시보드 embed — 실개발 방안',
  intro:'포탈에 Grafana 패널을 iframe으로 임베드. 인증은 auth proxy(권장) 또는 service account 토큰.',
  tabs:{
    'Embed URL':
`<!-- 대시보드 전체 (kiosk 모드 — 크롬 제거) -->
<iframe src="https://grafana.neocloud.skt.com/d/k8s-overview/k8s-cluster-overview
  ?orgId=2&var-tenant=tenant-alpha
  &from=now-6h&to=now&refresh=30s
  &kiosk" width="100%" height="900"></iframe>

<!-- 개별 패널만 (d-solo) -->
<iframe src="https://grafana.neocloud.skt.com/d-solo/k8s-overview
  ?orgId=2&var-tenant=tenant-alpha&panelId=12
  &from=now-6h&to=now" width="450" height="200"></iframe>

# grafana.ini 필수 설정
[security]
allow_embedding = true          # X-Frame-Options 해제
cookie_samesite = none          # cross-origin iframe 쿠키`,
    '인증 (auth proxy 권장)':
`# 포탈 백엔드가 리버스 프록시로 Grafana 앞단 —
# Keycloak SSO 세션을 헤더로 전달 (사용자에게 Grafana 로그인 안 보임)
[auth.proxy]
enabled = true
header_name = X-WEBAUTH-USER
header_property = username

# 테넌트 격리: Grafana Organization 분리 or
#   dashboard 변수 var-tenant + datasource 권한(label 기반)으로 제한
# 운영자 포탈 = 전체 org · 고객 포탈 = 테넌트 org (읽기전용 Viewer)`,
    '대시보드 구성 (PromQL)':
`# Control Plane
sum(rate(apiserver_request_total[5m])) by (verb)
histogram_quantile(0.99, apiserver_request_duration_seconds_bucket)
etcd_disk_wal_fsync_duration_seconds · etcd_mvcc_db_total_size_in_bytes
scheduler_pending_pods · scheduler_e2e_scheduling_duration_seconds

# 워크로드
sum(kube_pod_status_phase) by (namespace, phase)
sum(increase(kube_pod_container_status_restarts_total[1h])) by (namespace)
sum(kube_pod_container_resource_requests{resource="nvidia.com/gpu"})
  / sum(kube_node_status_allocatable{resource="nvidia.com/gpu"})

# 노드/네트워크/스토리지
sum(kube_node_status_condition{condition="Ready",status="true"})
rate(node_network_receive_bytes_total[5m])
kubelet_volume_stats_used_bytes / kubelet_volume_stats_capacity_bytes

# GPU (DCGM — GPU/랙 탭)
avg by (rack) (DCGM_FI_DEV_GPU_UTIL)`,
  }
};
NEOCLOUD_DATA.apiSpecs['promql']={
  title:'모니터링 쿼리 — PromQL (DCGM exporter)',
  intro:'히트맵/게이지가 사용하는 실제 쿼리. 테넌트 라벨은 remote-write 시 주입.',
  tabs:{
    'PromQL':
`# 랙별 평균 GPU 사용률 (히트맵 셀 색상)
avg by (rack) (DCGM_FI_DEV_GPU_UTIL{tenant="tenant-alpha"})

# 랙별 최고 GPU 온도
max by (rack) (DCGM_FI_DEV_GPU_TEMP{tenant="tenant-alpha"})

# XID 에러 발생 (알람 셀)
increase(DCGM_FI_DEV_XID_ERRORS{tenant="tenant-alpha"}[5m]) > 0

# 노드 Ready 비율 (SLO)
sum(kube_node_status_condition{condition="Ready",status="true"})
  / count(kube_node_info)

# NVLink 대역폭 (NVL72 도메인)
rate(DCGM_FI_PROF_NVLINK_TX_BYTES[1m])`,
  }
};
NEOCLOUD_DATA.apiSpecs['pods-list']={
  title:'Pod 목록 — 표준 K8s API',
  intro:'트레이(노드) 선택 시 fieldSelector로 해당 노드의 Pod만 조회.',
  tabs:{
    'Request':
`GET /api/v1/pods
    ?fieldSelector=spec.nodeName%3Dvr72-a-017-t09
    &limit=50`,
    'Response (발췌)':
`{
  "kind": "PodList",
  "items": [{
    "metadata": {
      "name": "vllm-inference-a8c2d",
      "namespace": "default",
      "labels": { "app": "vllm" }
    },
    "spec": {
      "nodeName": "vr72-a-017-t09",
      "containers": [{
        "name": "vllm",
        "resources": { "limits": { "nvidia.com/gpu": "4" } }
      }]
    },
    "status": {
      "phase": "Running",
      "containerStatuses": [{ "restartCount": 0, "ready": true }]
    }
  }]
}`,
  }
};
NEOCLOUD_DATA.apiSpecs['pod-logs']={
  title:'Pod 로그 스트리밍 — 표준 log API',
  intro:'로그 패널의 컨트롤(follow/tail/timestamps/container)이 <b>쿼리 파라미터와 1:1</b> 대응 — 상단 표시줄에서 실시간 확인.',
  tabs:{
    'Request':
`GET /api/v1/namespaces/default/pods/vllm-inference-a8c2d/log
    ?container=vllm          # 컨테이너 선택 셀렉트박스
    &follow=true             # follow 토글 (chunked 스트림 유지)
    &tailLines=200           # tail 셀렉트박스
    &timestamps=true         # ts 토글 (RFC3339 접두)

# 텍스트 필터(grep)는 서버 파라미터가 아니라 클라이언트 측 처리
# (Loki 사용 시: {pod="vllm-..."} |= "filter" 로 서버측 필터 가능)`,
    'Response':
`HTTP/1.1 200 OK
Transfer-Encoding: chunked        # follow=true → 연결 유지 스트림
Content-Type: text/plain

2026-07-09T10:43:19Z INFO 07-09 10:43:19 [metrics.py:341] Avg prompt
throughput: 8412.3 tokens/s, ...
2026-07-09T10:43:21Z INFO:  10.244.3.17:48166 - "POST /v1/chat/completions
HTTP/1.1" 200 OK
...(스트림 계속)`,
    'Loki (대안)':
`# 대량/장기 보관 로그는 Loki 경유 (Grafana 통합)
GET /loki/api/v1/query_range
    ?query={namespace="default",pod=~"vllm-inference-.*"} |= "ERROR"
    &start=1783990800000000000
    &limit=1000`,
  }
};

/* ============================================================
 * Dynamo (Inferium) 탭 — 사용자 제공 Grafana 대시보드
 * "Inferium | Platform Overview" (uid inferium-platform-overview) 재현
 * ============================================================ */
function gMulti(seriesArr, opts={}){
  const w=opts.w||280, h=opts.h||62;
  const all=seriesArr.flatMap(s=>s.vals);
  const max=Math.max(...all)*1.12, min=Math.min(0, Math.min(...all)*0.9);
  const lines=seriesArr.map(s=>{
    const pts=s.vals.map((v,i)=>`${(i/(s.vals.length-1)*w).toFixed(1)},${(h-(v-min)/(max-min)*h).toFixed(1)}`).join(' ');
    return `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="1.5" ${s.dash?'stroke-dasharray="5,4"':''}/>`;
  }).join('');
  return `<svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${lines}</svg>`;
}
function gLegend(seriesArr, fmt){
  return `<div class="gsub" style="display:flex;gap:12px;flex-wrap:wrap">${seriesArr.map(s=>
    `<span><span style="color:${s.color}">●</span> ${s.label} <b style="color:#D8D9DA">${(fmt||(v=>v.toFixed(0)))(s.vals[s.vals.length-1])}</b></span>`).join('')}</div>`;
}
function gHeat(seed, buckets, peakIdx, cols=22){
  const rnd=mulberry32(hashStr(seed));
  let html='<div style="display:grid;grid-template-columns:52px repeat('+cols+',1fr);gap:1px;align-items:stretch">';
  for(let b=buckets.length-1;b>=0;b--){
    html+=`<div class="gsub" style="align-self:center;text-align:right;padding-right:5px">${buckets[b]}</div>`;
    for(let c=0;c<cols;c++){
      const dist=Math.abs(b-peakIdx);
      const inten=Math.max(0, 1-dist*0.32)*(0.45+rnd()*0.55);
      const col=inten<0.06?'#1c1f24':`rgba(255,${Math.round(152-inten*90)},${Math.round(48-inten*30)},${(0.25+inten*0.75).toFixed(2)})`;
      html+=`<div style="height:13px;background:${col};border-radius:1px"></div>`;
    }
  }
  return html+'</div>';
}
const DY_COLORS=['#73BF69','#5794F2','#FF9830','#B877D9','#F2495C','#FADE2A'];

function monTabDynamo(box, t){
  const S=(m,b,a,min=0)=>{ const v=monSeries(t.id+'dy'+m, 40, b, a); return v.map(x=>Math.max(min,x)); };
  const last=v=>v[v.length-1];
  /* DGD별 시계열 — chat-maverick(대형 채팅) vs embed-bge(경량 임베딩) */
  const D={
    tok:  [ {label:'chat-maverick', color:DY_COLORS[0], vals:S('tok1', 41000, 6000, 5000)}, {label:'embed-bge', color:DY_COLORS[1], vals:S('tok2', 92000, 12000, 20000)} ],
    req:  [ {label:'chat-maverick', color:DY_COLORS[0], vals:S('req1', 380, 70, 50)}, {label:'embed-bge', color:DY_COLORS[1], vals:S('req2', 1240, 200, 300)} ],
    ttft: [ {label:'chat-maverick P70', color:DY_COLORS[0], vals:S('tt1', 148, 30, 60)}, {label:'embed-bge P70', color:DY_COLORS[1], vals:S('tt2', 34, 10, 12)} ],
    itl:  [ {label:'chat-maverick P70', color:DY_COLORS[0], vals:S('it1', 13.5, 3, 6)}, {label:'embed-bge P70', color:DY_COLORS[1], vals:S('it2', 4.2, 1.2, 1.5)} ],
    e2e:  [ {label:'chat-maverick P70', color:DY_COLORS[0], vals:S('e21', 2300, 500, 800)}, {label:'embed-bge P70', color:DY_COLORS[1], vals:S('e22', 240, 60, 90)} ],
    infl: [ {label:'chat Inflight', color:DY_COLORS[0], vals:S('if1', 38, 10, 4)}, {label:'embed Inflight', color:DY_COLORS[1], vals:S('if2', 9, 4, 1)},
            {label:'chat Queued', color:DY_COLORS[4], dash:true, vals:S('qu1', 2.5, 3, 0)} ],
    kv:   [ {label:'chat prefill', color:DY_COLORS[0], vals:S('kv1', 64, 10, 30)}, {label:'chat decode', color:DY_COLORS[2], vals:S('kv2', 71, 9, 35)},
            {label:'embed hybrid', color:DY_COLORS[1], vals:S('kv3', 32, 8, 10)} ],
    hit:  [ {label:'chat measured', color:DY_COLORS[0], vals:S('h1', 0.62, 0.08, 0.3).map(v=>Math.min(0.95,v))}, {label:'chat predicted', color:DY_COLORS[3], dash:true, vals:S('h2', 0.58, 0.08, 0.25).map(v=>Math.min(0.95,v))} ],
    gpu:  [ {label:'chat prefill', color:DY_COLORS[0], vals:S('g1', 78, 10, 40)}, {label:'chat decode', color:DY_COLORS[2], vals:S('g2', 84, 8, 50)},
            {label:'embed hybrid', color:DY_COLORS[1], vals:S('g3', 55, 12, 25)} ],
    pow:  [ {label:'chat-maverick', color:DY_COLORS[0], vals:S('p1', 168, 14, 100)}, {label:'embed-bge', color:DY_COLORS[1], vals:S('p2', 74, 8, 40)} ],
    proc: [ {label:'chat - prefill', color:DY_COLORS[0], vals:S('pr1', 210, 40, 90)}, {label:'chat - decode', color:DY_COLORS[2], vals:S('pr2', 1900, 380, 700)},
            {label:'embed - hybrid', color:DY_COLORS[1], vals:S('pr3', 95, 25, 35)} ],
  };
  const thr=(v,warn,red)=>v>=red?'red':(v>=warn?'warn':'');
  const thrBg=(cls)=>cls==='red'?'rgba(242,73,92,.14)':(cls==='warn'?'rgba(250,222,42,.10)':'rgba(115,191,105,.08)');
  const fmtStat=(v,unit)=>((unit===''||unit===' ')?Math.round(v):(v<10?v.toFixed(2):v.toFixed(0)))+unit;
  const stat=(id,title,val,unit,warn,red,sub,promql)=>{
    const cls=thr(val,warn,red);
    return `<div class="gpanel" style="background:${thrBg(cls)}"><div class="gp-h tip" ${promql?`data-tip="${esc(promql)}"`:''}>${esc(title)}</div>
      <div class="gp-b"><div class="gstat ${cls}" id="${id}">${fmtStat(val,unit)}</div><div class="gsub">${sub}</div></div></div>`;
  };
  const chart=(id,title,series,fmt,promql)=>gPanel(title,
    `<div id="gc-${id}">${gMulti(series)}</div><div id="gl-${id}">${gLegend(series,fmt)}</div>`, promql);

  box.innerHTML=`
    <div class="card" style="background:var(--accent-soft);border-color:transparent;margin-bottom:12px"><div class="card-b small">
      🖼 <b>Inferium | Platform Overview</b> — 고객 제공 Grafana 대시보드(ConfigMap <code>grafana_dashboard: '1'</code> 사이드카 프로비저닝) 재현.
      Dynamo(DGD)를 사용하는 테넌트에만 노출됩니다. ${apiIcon('dynamo-dashboard')}</div></div>
    <div class="gwrap">
      <div class="gbar">📊 <b>Grafana</b> · neocloud-${t.id} / <b>Inferium | Platform Overview</b>
        <span class="gchip">ns: dynamo</span><span class="gchip">⏱ Last 1h</span><span class="gchip">↻ 30s</span>
        <span class="gchip"><span id="g-live" style="color:#73BF69">●</span> live</span>
        <span class="gchip" style="margin-left:auto;cursor:pointer" onclick="toast('Grafana 새 창 (mock) — /d/inferium-platform-overview')">Open in Grafana ↗</span></div>

      <div class="ggrid" style="grid-template-columns:1.4fr 1.2fr 1fr 1fr 1fr">
        ${gPanel('Resource Count by State',`<div style="display:flex;gap:14px">
          <div><div class="gstat">2</div><div class="gsub">DGD · Ready</div></div>
          <div><div class="gstat warn">1</div><div class="gsub">DGDR · Pending</div></div></div>
          <div class="gsub">rag-qwen 배포 대기 (VIP 할당 중)</div>`,'dynamo_operator_resources_total{resource_type=~"DynamoGraphDeployment|...Request"}')}
        ${gPanel('Worker Pods',`<div style="display:flex;gap:14px">
          <div><div class="gstat" id="dy-wrun">46</div><div class="gsub">Running</div></div>
          <div><div class="gstat" id="dy-wbad">0</div><div class="gsub">Pending·Failed</div></div></div>`,'kube_pod_status_phase{pod=~".*frontend.*|.*prefillworker.*|.*decodeworker.*|.*hybridworker.*"}')}
        ${stat('dy-ttft','TTFT P95', last(D.ttft[0].vals)*1.35, ' ms', 200, 500,'SLA 200ms','histogram_quantile(0.95, rate(dynamo_frontend_time_to_first_token_seconds_bucket[30s]))')}
        ${stat('dy-itl','ITL P95', last(D.itl[0].vals)*1.3, ' ms', 20, 40,'SLA 20ms','histogram_quantile(0.95, rate(dynamo_frontend_inter_token_latency_seconds_bucket[30s]))')}
        ${stat('dy-e2e','E2E P95', last(D.e2e[0].vals)*1.4, ' ms', 3000, 6000,'decode 병목 시 상승','histogram_quantile(0.95, rate(dynamo_frontend_request_duration_seconds_bucket[1m]))')}
      </div>
      <div class="ggrid" style="grid-template-columns:repeat(5,1fr);margin-top:8px">
        ${stat('dy-infl','Inflight Req', last(D.infl[0].vals)+last(D.infl[1].vals), '', 100, 500,'처리 중 (전 DGD 합산)','sum(dynamo_frontend_inflight_requests)')}
        ${stat('dy-que','Queued Req', last(D.infl[2].vals), '', 10, 50,'대기 — 급증 = 과부하 조기신호','sum(dynamo_frontend_queued_requests)')}
        ${stat('dy-err','API Error Rate', 0.12, ' %', 0.5, 1,'0 유지가 정상','rate(dynamo_frontend_requests_total{status="error"}) / rate(...total)')}
        ${stat('dy-pre','Preemption Rate', 0.00, ' /s', 0.001, 0.01,'KV cache 포화 시 발생 → TTFT 스파이크','rate(vllm:num_preemptions_total[2m])')}
        ${gPanel('Active Alerts',`<div style="display:flex;gap:12px">
          <div><div class="gstat red" style="opacity:.45">0</div><div class="gsub">critical</div></div>
          <div><div class="gstat warn" id="dy-alert-w">1</div><div class="gsub">warning</div></div>
          <div><div class="gstat blue" style="opacity:.45">0</div><div class="gsub">info</div></div></div>`,'count(ALERTS{alertstate="firing", alertname!="Watchdog"}) by (severity)')}
      </div>

      <div class="ggrid" style="grid-template-columns:1fr 1fr;margin-top:8px">
        ${chart('tok','Token Throughput — sum by DGD (output tok/s)', D.tok, v=>(v/1000).toFixed(1)+'k','rate(dynamo_frontend_output_tokens_total[5m]) by (dynamo_namespace)')}
        ${chart('req','Request Rate — sum by DGD (req/s)', D.req, v=>v.toFixed(0),'rate(dynamo_frontend_requests_total[5m]) by (dynamo_namespace)')}
        ${chart('ttft2','TTFT — by DGD (P70, ms)', D.ttft, v=>v.toFixed(0)+'ms','histogram_quantile(0.7, rate(dynamo_frontend_time_to_first_token_seconds_bucket[1m]))')}
        ${chart('itl2','ITL — by DGD (P70, ms)', D.itl, v=>v.toFixed(1)+'ms','histogram_quantile(0.7, rate(dynamo_frontend_inter_token_latency_seconds_bucket[1m]))')}
        ${chart('infl2','Inflight / Queued — by DGD', D.infl, v=>v.toFixed(0),'dynamo_frontend_inflight_requests · dynamo_frontend_queued_requests')}
        ${chart('kv','KV Cache Usage — avg by DGD (%, prefill/decode 분리)', D.kv, v=>v.toFixed(0)+'%','avg(vllm:kv_cache_usage_perc{pod=~".*prefillworker.*|.*decodeworker.*"}) by (dynamo_namespace)')}
        ${chart('hit','KV Hit Rate — measured / predicted', D.hit, v=>(v*100).toFixed(0)+'%','rate(vllm:prefix_cache_hits_total[5m]) / rate(vllm:prefix_cache_queries_total[5m]) · dynamo_component_router_kv_hit_rate (--router-mode kv)')}
        ${chart('gpu','GPU Utilization — avg by DGD (%, prefill/decode)', D.gpu, v=>v.toFixed(0)+'%','avg(DCGM_FI_DEV_GPU_UTIL{exported_pod=~".*(prefill|decode|hybrid)worker.*"}) by (dgd)')}
        ${chart('pow','GPU Power — sum by DGD (kW)', D.pow, v=>v.toFixed(0)+' kW','sum(DCGM_FI_DEV_POWER_USAGE) by (dgd)')}
        ${chart('e2e2','E2E Latency — by DGD (P70, ms)', D.e2e, v=>v.toFixed(0)+'ms','histogram_quantile(0.7, rate(dynamo_frontend_request_duration_seconds_bucket[1m]))')}
      </div>

      <div class="ggrid" style="grid-template-columns:1fr 1fr;margin-top:8px">
        ${gPanel('ISL Distribution Heatmap (input tokens)', gHeat(t.id+'isl',['128','256','512','1k','2k','4k','8k','16k'],4)+'<div class="gsub">피크 1k–2k — RAG 프롬프트 패턴</div>','increase(dynamo_frontend_input_sequence_tokens_bucket[rate_interval]) by (le)')}
        ${gPanel('OSL Distribution Heatmap (output tokens)', gHeat(t.id+'osl',['128','256','512','1k','2k','4k','8k','16k'],2)+'<div class="gsub">피크 512 — 중간 길이 응답 위주</div>','increase(dynamo_frontend_output_sequence_tokens_bucket[rate_interval]) by (le)')}
      </div>
      <div class="ggrid" style="grid-template-columns:1fr;margin-top:8px">
        ${chart('proc','Worker Processing Time — weighted avg by DGD (ms) · 특정 컴포넌트 급등 = 해당 워커 병목', D.proc, v=>v.toFixed(0)+'ms','rate(dynamo_component_request_duration_seconds_sum{dynamo_component=~"prefill|hybrid|backend",dynamo_endpoint="generate"}[5m]) / rate(..._count[5m])')}
      </div>
    </div>
    <p class="small muted" style="margin-top:10px">DGD 구성: ${t.dynamoDGDs.map(d=>`<span class="chip">${d.name} — ${d.mode}</span>`).join(' ')} · DGDR <span class="chip">rag-qwen (Pending — 네트워킹 탭의 dynamo-frontend VIP 할당과 연동)</span></p>`;

  /* ── 라이브 틱 ── */
  if(window._monDashTimer) clearInterval(window._monDashTimer);
  const step=(s,ampRatio=0.06,min=0)=>{ const v=last(s.vals); s.vals.push(Math.max(min, v+(Math.random()-0.5)*Math.max(v,1)*ampRatio)); s.vals.shift(); };
  const charts=[['tok',D.tok,v=>(v/1000).toFixed(1)+'k'],['req',D.req,v=>v.toFixed(0)],['ttft2',D.ttft,v=>v.toFixed(0)+'ms'],
    ['itl2',D.itl,v=>v.toFixed(1)+'ms'],['infl2',D.infl,v=>v.toFixed(0)],['kv',D.kv,v=>v.toFixed(0)+'%'],
    ['hit',D.hit,v=>(v*100).toFixed(0)+'%'],['gpu',D.gpu,v=>v.toFixed(0)+'%'],['pow',D.pow,v=>v.toFixed(0)+' kW'],
    ['e2e2',D.e2e,v=>v.toFixed(0)+'ms'],['proc',D.proc,v=>v.toFixed(0)+'ms']];
  window._monDashTimer=setInterval(()=>{
    const $=id=>document.getElementById(id);
    if(!$('gc-tok')){ clearInterval(window._monDashTimer); window._monDashTimer=null; return; }
    charts.forEach(([id,series])=>series.forEach(s=>step(s, id==='infl2'?0.18:0.07)));
    charts.forEach(([id,series,fmt])=>{ $('gc-'+id).innerHTML=gMulti(series); $('gl-'+id).innerHTML=gLegend(series,fmt); });
    const setStat=(id,v,unit,warn,red)=>{ const el=$(id); if(!el) return;
      el.textContent=fmtStat(v,unit);
      el.className='gstat '+thr(v,warn,red);
      el.closest('.gpanel').style.background=thrBg(thr(v,warn,red)); };
    setStat('dy-ttft', last(D.ttft[0].vals)*1.35,' ms',200,500);
    setStat('dy-itl',  last(D.itl[0].vals)*1.3,' ms',20,40);
    setStat('dy-e2e',  last(D.e2e[0].vals)*1.4,' ms',3000,6000);
    setStat('dy-infl', last(D.infl[0].vals)+last(D.infl[1].vals),'',100,500);
    setStat('dy-que',  last(D.infl[2].vals),'',10,50);
    setStat('dy-err',  Math.max(0, 0.12+(Math.random()-0.5)*0.08),' %',0.5,1);
    const live=$('g-live'); if(live) live.style.opacity=(live.style.opacity==='0.25'?'1':'0.25');
  }, 2000);
}

NEOCLOUD_DATA.apiSpecs['dynamo-dashboard']={
  title:'Inferium 대시보드 — 프로비저닝 & 핵심 PromQL',
  intro:'고객 제공 대시보드 JSON을 ConfigMap(label <code>grafana_dashboard: "1"</code>)으로 배포하면 Grafana 사이드카가 자동 로드. 테넌트 조건부 노출은 포탈이 DGD 존재 여부로 판단.',
  tabs:{
    '프로비저닝 (ConfigMap)':
`apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-inferium-overview-dashboard
  namespace: monitoring
  labels:
    grafana_dashboard: "1"        # ← Grafana sidecar가 이 라벨을 watch
data:
  inferium-overview-dashboard.json: |
    { "title": "Inferium | Platform Overview",
      "uid": "inferium-platform-overview",
      "tags": ["inferium", "overview"],
      "refresh": "30s",
      "templating": ["namespace", "interval",
                     "sla_ttft=200ms", "sla_itl=20ms"], ... }

# 포탈 embed:
# /d/inferium-platform-overview?var-namespace=dynamo&kiosk`,
    '핵심 PromQL (SLA)':
`# TTFT P95 (SLA 200ms — 노랑 200 / 빨강 500)
histogram_quantile(0.95, sum by (le, dynamo_namespace)(
  rate(dynamo_frontend_time_to_first_token_seconds_bucket[30s]))) * 1000

# ITL P95 (SLA 20ms)
histogram_quantile(0.95, sum by (le, dynamo_namespace)(
  rate(dynamo_frontend_inter_token_latency_seconds_bucket[30s]))) * 1000

# 에러율 (0.5% 경고 / 1% 위험)
sum(rate(dynamo_frontend_requests_total{status="error"}[5m]))
  / sum(rate(dynamo_frontend_requests_total[5m]))

# Preemption — KV cache 포화로 강제 축출 (0이어야 정상)
# free blocks 소진 → evictable prefix cache 소진 → preemption → TTFT 스파이크
sum(rate(vllm:num_preemptions_total[2m]))`,
    '핵심 PromQL (KV/GPU)':
`# KV Cache 사용률 — prefill/decode 워커 분리 (70/90/95% 임계)
avg by(dynamo_namespace)(vllm:kv_cache_usage_perc{
  pod=~".*prefillworker.*|.*hybridworker.*"}) * 100

# KV Hit Rate — measured(vLLM prefix cache) vs
#               predicted(router, --router-mode kv 필요)
sum(rate(vllm:prefix_cache_hits_total[5m]))
  / sum(rate(vllm:prefix_cache_queries_total[5m]))
rate(dynamo_component_router_kv_hit_rate_sum[5m])
  / rate(dynamo_component_router_kv_hit_rate_count[5m])

# DGD별 GPU — exported_pod 정규식으로 워커 유형 분리
avg by(dgd)(label_replace(DCGM_FI_DEV_GPU_UTIL{
  exported_pod=~".*prefillworker.*|.*hybridworker.*"},
  "dgd","$1","exported_pod","(.*)-vllm(?:prefill|hybrid)worker.*"))`,
  }
};

/* ============================================================
 * 설정 (Day0) — Managed K8S 가동 전 초기 config / 수동 연동 (admin 전용)
 *   데이터 주도: NEOCLOUD_DATA.day0 — 카드별 [편집]으로 수기 입력 수정
 * ============================================================ */
NEOCLOUD_DATA.day0=[
  { id:'installer', ico:'⚙️', title:'설치 엔진 (NKD/NKE)', seq:1,
    desc:'클러스터 설치 자동화 — RACI Day0 "K8S Installer"',
    fields:[
      { k:'endpoint', label:'NKD API endpoint', v:'https://nkd.mgmt.neocloud.skt.com:8443', type:'text' },
      { k:'version', label:'NKD 버전 / 지원 K8s', v:'25.06.2 (v1.31.9 / v1.32.4 / v1.33.2)', type:'text' },
      { k:'batch', label:'랙 배치 정책', v:'batch 6개 병렬 · 실패 시 batch 단위 재시도', type:'text' },
      { k:'registry', label:'컨테이너 레지스트리 (AICR 미러)', v:'registry.neocloud.skt.com (NGC/DockerHub 미러 · 폐쇄망 대비)', type:'text' },
      { k:'token', label:'NKD API 토큰', v:'vault:secret/nkd/api-token', type:'secret' },
    ], verified:'2026-06-30 · 설치 파이프라인 E2E 시험 (DoD 통과)' },
  { id:'vault', ico:'🔐', title:'Vault / PKI', seq:2,
    desc:'kubeconfig 인증서 발급 + 플랫폼 시크릿 금고 (BUSL 이슈 시 OpenBao 전환)',
    fields:[
      { k:'addr', label:'Vault 주소', v:'https://vault.mgmt.neocloud.skt.com:8200 (HA ×3, Raft)', type:'text' },
      { k:'unseal', label:'Auto-unseal', v:'KMS (HSM 연동) — 재기동 시 수동 개입 불필요', type:'text' },
      { k:'pki', label:'PKI 엔진 규칙', v:'테넌트별 pki-<tenant> · role 3종(skt-admin/tenant-operator/tenant-user)', type:'text' },
      { k:'ttl', label:'kubeconfig 기본 TTL / 회전', v:'72h · 만료 24h 전 자동 재발급', type:'text' },
      { k:'token', label:'포탈 백엔드 토큰', v:'vault:auth/approle (portal-backend)', type:'secret' },
    ], verified:'2026-06-25 · 발급/회수 E2E 시험' },
  { id:'sso', ico:'🪪', title:'SSO (Keycloak)', seq:3,
    desc:'포탈 로그인 전용 — kube-apiserver 인증과 무관 (설계 합의)',
    fields:[
      { k:'realm', label:'Realm / 주소', v:'neocloud @ https://sso.neocloud.skt.com', type:'text' },
      { k:'client', label:'Client ID', v:'ops-portal (confidential)', type:'text' },
      { k:'secret', label:'Client Secret', v:'vault:secret/keycloak/ops-portal', type:'secret' },
      { k:'groups', label:'역할 그룹 매핑', v:'ops-admin → 관리자 · ops-operator → 운영자', type:'text' },
    ], verified:'2026-06-20 · 역할별 로그인 시험' },
  { id:'lb', ico:'🔗', title:'External LB (F5 BIG-IP)', seq:4,
    desc:'공인 VIP 발급 — VIP 소유=ADC, 컨트롤러는 read/write-back만',
    fields:[
      { k:'mgmt', label:'iControl 관리 endpoint', v:'https://f5-mgmt.neocloud.skt.com (AS3 3.50)', type:'text' },
      { k:'cred', label:'자격증명', v:'vault:secret/f5/as3-user', type:'secret' },
      { k:'pool', label:'공인 VIP Pool', v:'211.234.100.0/24 (가용 249 · 사용 3)', type:'text' },
      { k:'partition', label:'파티션 정책', v:'테넌트당 partition + route-domain 1개 (잔여 6 — 라이선스 한도 확인 필요)', type:'text' },
      { k:'apiserver', label:'apiserver 노출 규칙', v:'L4 passthrough + allowlist (AFM 라이선스 검토 중)', type:'text' },
    ], verified:'2026-06-28 · AS3 프로비저닝/write-back PoC' },
  { id:'dns', ico:'🌐', title:'DNS / 도메인', seq:5,
    desc:'ExternalDNS 자동 등록 기반 — DNS는 트래픽 경로 밖',
    fields:[
      { k:'provider', label:'Provider / Zone', v:'AWS Route53 · zone neocloud.skt.com', type:'text' },
      { k:'cred', label:'자격증명 방식', v:'AWS IAM Roles Anywhere (인증서 기반 — 키 회전 불필요)', type:'secret' },
      { k:'suffix', label:'테넌트 suffix 규칙', v:'<tenant>.neocloud.skt.com — prefix만 고객 자유', type:'text' },
      { k:'policy', label:'ExternalDNS 정책', v:'source=crd(DNSEndpoint 게이트) · upsert-only · TXT registry', type:'text' },
      { k:'admission', label:'Admission 게이트', v:'Kyverno — Ingress host suffix 강제', type:'text' },
    ], verified:'2026-06-27 · 와일드카드 등록/오삭제 방지 시험' },
  { id:'storage', ico:'💾', title:'스토리지 (CSI)', seq:6,
    desc:'벤더 CSI 하나로 RWO/RWX 동적 프로비저닝 · GDS 성능 트랙',
    fields:[
      { k:'vast', label:'VAST mgmt endpoint', v:'https://vast-mgmt.neocloud.skt.com (2식)', type:'text' },
      { k:'weka', label:'WEKA mgmt endpoint', v:'https://weka-mgmt.neocloud.skt.com (1식)', type:'text' },
      { k:'cred', label:'CSI 자격증명', v:'vault:secret/csi/{vast,weka}', type:'secret' },
      { k:'sc', label:'StorageClass 템플릿', v:'6종 (rwx-gds / rwo-gds / rwx / rwo × 벤더)', type:'text' },
    ], verified:'2026-06-24 · PVC 동적 프로비저닝 + GDS 벤치' },
  { id:'monitoring', ico:'📈', title:'모니터링 스택', seq:7,
    desc:'RACI Day0 "Monitoring 스택 (고객 Dashboard 포함)" — 기존 누락분 추가',
    fields:[
      { k:'prom', label:'Prometheus remote-write', v:'https://metrics.mgmt.neocloud.skt.com/api/v1/write (테넌트 라벨 주입)', type:'text' },
      { k:'grafana', label:'Grafana', v:'https://grafana.neocloud.skt.com · allow_embedding=true · auth proxy(SSO)', type:'text' },
      { k:'loki', label:'Loki (로그)', v:'https://loki.mgmt.neocloud.skt.com · retention 30d', type:'text' },
      { k:'alert', label:'AlertManager 라우팅', v:'critical → NOC 온콜(SMS+메일) · warning → 포탈 알림', type:'text' },
      { k:'dashboards', label:'대시보드 프로비저닝', v:'ConfigMap 라벨 grafana_dashboard:"1" 사이드카 (K8s Overview · Inferium)', type:'text' },
    ], verified:'2026-07-01 · 테넌트 라벨 격리 시험' },
  { id:'nvsentinel', ico:'🛡️', title:'NVSentinel 공통', seq:8,
    desc:'장애 탐지/복구 파이프라인 공통 설정 (모듈별 정책은 장애관리 탭)',
    fields:[
      { k:'store', label:'Datastore', v:'MongoDB HealthEventsDatabase (PSMDB ×3)', type:'text' },
      { k:'storecred', label:'DB 자격증명', v:'vault:secret/nvsentinel/mongodb (x509)', type:'secret' },
      { k:'sink', label:'event-exporter sink', v:'https://portal-backend.neocloud.skt.com/sinks/nvsentinel (CloudEvents · OIDC)', type:'text' },
      { k:'dryrun', label:'신규 테넌트 기본 정책', v:'조치 모듈 dryRun 1주 관찰 후 활성 (운영 표준)', type:'text' },
    ], verified:'2026-07-02 · XID 주입 시험 → 격리/복구 E2E' },
  { id:'rbac', ico:'📜', title:'RBAC · kubeconfig 템플릿', seq:9,
    desc:'테넌트 온보딩 시 자동 적용되는 권한 골격',
    fields:[
      { k:'roles', label:'역할 템플릿', v:'skt-admin / tenant-operator(NS 전체 CRUD) / tenant-user(선택 NS)', type:'text' },
      { k:'ns', label:'NS 템플릿', v:'default / slurm / dynamo + RoleBinding·nodes-reader 자동 생성', type:'text' },
      { k:'bastion', label:'Bastion', v:'공통 Login/Bastion 경유 · 세션 레코딩 ON', type:'text' },
    ], verified:'2026-06-26 · 역할별 kubectl 권한 매트릭스 시험', link:'#/k8s/access?tab=rbac' },
  { id:'biz', ico:'📨', title:'사업포탈 / ITSM 연동', seq:10,
    desc:'RACI Day0 "접수/승인 절차·채널" + "티켓(ITSM)/SLA 체계" — ITSM 기존 누락분 추가',
    fields:[
      { k:'webhook', label:'웹훅 수신 (Biz→운영)', v:'POST /admin/v1/requests:webhook', type:'text' },
      { k:'sign', label:'웹훅 서명키', v:'vault:secret/biz-portal/hmac', type:'secret' },
      { k:'callback', label:'상태 콜백 (운영→Biz)', v:'https://biz.neocloud.skt.com/api/v1/requests/{id}:status', type:'text' },
      { k:'itsm', label:'ITSM (티켓)', v:'https://itsm.sk.com/api — BreakFixTicket CRD 컨슈머 연동', type:'text' },
      { k:'esc', label:'에스컬레이션', v:'승인 대기 >24h → 메일+포탈 알림 · SLA 위반 → NOC', type:'text' },
    ], verified:'2026-06-29 · 접수→승인→콜백 왕복 시험' },
];

App.register('#/k8s/settings', function(elm){
  if(App.state.role!=='admin'){
    elm.innerHTML=`<div class="card"><div class="empty"><div class="big">🔒</div><b>관리자 전용</b>
      <p class="muted small" style="margin-top:6px">설정(Day0)은 관리자(플랫폼/제공) 역할만 접근할 수 있습니다.</p></div></div>`;
    return;
  }
  const secretView=v=>{
    const ref=v.startsWith('vault:')?v:'';
    return `<span class="mono">●●●●●●</span> <span class="muted small">${esc(ref||'(보관됨)')}</span>`;
  };
  const card=(s,idx)=>`
    <div class="card"><div class="card-h"><span class="chip" style="min-width:24px;text-align:center">${s.seq}</span> ${s.ico} ${esc(s.title)}
      ${s.modified?'<span class="badge b-amber">수정됨</span>':''}
      <div class="right">${s.link?`<a href="${s.link}" class="small">보기 →</a>`:''}
        ${actionBtn('✎ 편집','settings',`day0Edit(${idx})`,{sm:true,secondary:true})}</div></div>
      <div class="card-b small muted" style="padding-bottom:4px">${esc(s.desc)}</div>
      <table class="table">${s.fields.map(f=>`
        <tr><td class="muted small" style="width:190px">${esc(f.label)}</td>
        <td class="small">${f.type==='secret'?secretView(f.v):esc(f.v)}</td></tr>`).join('')}</table>
      <div class="card-b small" style="display:flex;gap:8px;align-items:center">
        <span class="badge b-green">✓ 검증</span><span class="muted">${esc(s.verified)}</span>
        ${s.modified?`<span class="muted" style="margin-left:auto">최종 수정 ${s.modified}</span>`:''}
      </div></div>`;
  elm.innerHTML=`
    <div class="page-h"><div><h1>설정 (Day0)</h1>
      <div class="sub">Managed K8S 가동 전 초기 config · 수동 연동 10종 — 가동 시퀀스 순 (RACI: 관리자 R/A · 운영자 C)</div></div>
      <div class="right">${dayChip(0)}
        ${actionBtn('전체 연동 헬스체크','settings',`toast('10개 연동 대상 헬스체크 시작 (mock) — 결과는 알림으로')`,{sm:true,secondary:true})}</div></div>
    <div class="card" style="background:var(--green-soft);border-color:transparent;margin-bottom:14px"><div class="card-b small">
      ✅ <b>Day0 완료 기준(DoD)</b> — 설치 파이프라인 동작 · LB/스토리지/DNS 연동 · RBAC/kubeconfig 템플릿 · 접수/승인 채널 · Monitoring 스택 · ITSM/SLA 체계 <b>— 10/10 검증 완료</b> (각 카드의 검증 일자 참조)</div></div>
    <div class="grid" style="grid-template-columns:1fr 1fr">${NEOCLOUD_DATA.day0.map(card).join('')}</div>`;
});

/* ---------- 편집 모달 ---------- */
function day0Edit(idx){
  const s=NEOCLOUD_DATA.day0[idx];
  const inp=(f,i)=>`
    <div style="margin-bottom:12px">
      <label class="small" style="font-weight:700;display:block;margin-bottom:4px">${esc(f.label)}
        ${f.type==='secret'?'<span class="chip" style="font-size:9.5px;background:#3a1a20;color:#f0a3b0">secret</span>':''}</label>
      ${f.type==='secret'
        ?`<input id="d0-${i}" type="text" placeholder="변경 시에만 입력 — 현재값은 Vault 참조 유지 (${esc(f.v)})"
            style="width:100%;padding:8px 11px;border:1px solid var(--line);border-radius:6px;font-family:var(--mono);font-size:12px">`
        :`<input id="d0-${i}" type="text" value="${esc(f.v)}"
            style="width:100%;padding:8px 11px;border:1px solid var(--line);border-radius:6px;font-size:12.5px">`}
    </div>`;
  openModal(`${s.ico} ${esc(s.title)} — 편집 <span class="chip">Day0 · seq ${s.seq}</span>`,
    `<p class="small muted" style="margin-bottom:14px">${esc(s.desc)}. 저장 시 변경 이력이 감사 로그에 기록되고, 관련 컨트롤러에 반영됩니다 (mock).</p>
     ${s.fields.map(inp).join('')}
     <p class="small muted">secret 필드는 값이 포탈에 저장되지 않고 Vault에 기록됩니다 — 입력 즉시 <code>vault kv put</code> 후 참조만 유지.</p>`,
    `<button class="btn" onclick="closeModal()">취소</button>`
    +actionBtn('저장','settings',`day0Save(${idx})`));
}
function day0Save(idx){
  const s=NEOCLOUD_DATA.day0[idx];
  let changed=0;
  s.fields.forEach((f,i)=>{
    const el=document.getElementById('d0-'+i);
    if(!el) return;
    if(f.type==='secret'){
      if(el.value.trim()){ f.v='vault:secret/'+s.id+'/updated'; changed++; toast(`${f.label} — Vault에 기록됨 (참조 갱신)`); }
    } else if(el.value.trim() && el.value!==f.v){ f.v=el.value.trim(); changed++; }
  });
  if(changed){ s.modified='2026-07-09 15:40 (dan.park)'; toast(`${s.title} — ${changed}개 필드 저장 · 감사 로그 기록 (mock)`); }
  else toast('변경 사항 없음');
  closeModal(); App.render();
}

App.init();
document.getElementById('mk8s-root').addEventListener('click',function(e){
  const a=e.target.closest('a[href^="#/"]'); if(!a) return;
  e.preventDefault(); App.navigate(a.getAttribute('href'));
});
