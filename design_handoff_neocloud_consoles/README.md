# Handoff: NeoCloud 콘솔 3종 (Ops · Customer · Biz) 리디자인

## Overview
GPU 클라우드(NeoCloud)의 3개 웹 콘솔 — 운영(Ops/SRE·NOC), 고객(Customer Portal), 사업(Biz/영업·경영) — 의 리디자인 프로토타입. "Blueprint" 디자인 방향(코발트 제도/도면 감성, 모눈 배경, 각진 프레임, FIG./TBL. 번호 체계, 모노스페이스 데이터 타이포)으로 통일. 다크/라이트 모드, ⌘K 커맨드 팔레트, 콘솔 간 상태 연동 포함.

## About the Design Files
이 번들의 `*-console.html` 3개 파일은 **HTML로 제작된 디자인 레퍼런스(인터랙티브 프로토타입)** 입니다. 프로덕션 코드가 아니며 그대로 배포하는 용도가 아닙니다. 과제는 이 디자인을 **대상 코드베이스의 기존 환경(React/Vue 등)과 패턴으로 재구현**하는 것입니다. 기존 환경이 없다면 React + TypeScript + 해시/파일 라우팅 SPA를 권장합니다.

각 HTML은 오프라인 단일 파일(폰트·스크립트 인라인, ~5MB)로, 브라우저에서 바로 열면 동작합니다.
- `ops-console.html` — 21개 화면 (해시 라우팅 `#/overview` … `#/obs-trayops`)
- `customer-console.html` — 14개 화면 (`#/dashboard` … `#/settings`)
- `biz-console.html` — 11개 화면 (`#/dashboard` … `#/channel`)

주의: 하단 푸터의 콘솔 간 이동 링크는 원본 프로젝트 파일명(`Ops Console.dc.html` 등)을 가리키므로 번들 단독 실행에서는 동작하지 않습니다. 재구현 시에는 각 콘솔의 라우트로 연결하세요.

## Fidelity
**High-fidelity (hifi)** — 색·타이포·간격·상태·카피가 최종 의도입니다. 코드베이스의 컴포넌트 라이브러리를 사용하되 시각 결과는 픽셀 수준으로 재현해 주세요.

## Design Tokens (라이트 / 다크)
CSS 변수로 정의됨 — 각 HTML `<style>` 상단 `:root` 및 `body[data-theme="dark"]` 참조.

| 토큰 | Light | Dark | 용도 |
|---|---|---|---|
| --bg | #eef2f8 | #0b1220 | 페이지 배경 (+24px 모눈 격자 오버레이) |
| --cd / --cd2 | #ffffff / #f7f9fc | #101a30 / #0d1526 | 카드 / 보조 배경 |
| --ln / --lnS | #c3cede / #dde5ef | #243456 / #1b2740 | 테두리 강/약 |
| --tx / --mu / --mu2 | #141c2e / #5a6a85 / #8c9ab2 | #dbe4f5 / #8ea1c2 / #5c6f92 | 텍스트 강/중/약 |
| --acc / --accS / --accL | #2458d6 / #e3ebfa / #b9cdf0 | #5b8af5 / #15264a / #2c4478 | 프라이머리(코발트) |
| --grn / --grnS | #0e8a5f / #e0f2ea | #34c98e / #0d2b21 | 성공 (Biz 브랜드 색) |
| --amb / --ambS | #b45309 / #f8ecdb | #e0a04a / #33260f | 경고 |
| --red / --redS | #d1242f / #fbe7e9 | #f0637a / #33141c | 위험 |
| --blu / --purp / --teal | #1f6feb / #7048b6 / #0e8a8a | #5aa7f0 / #a883e8 / #3ec9c9 | 보조 (Customer 브랜드=blu) |

- 폰트: 본문 `IBM Plex Sans KR`, 데이터/숫자/코드 `IBM Plex Mono` (Google Fonts)
- 모서리: **0 (각진 프레임)** — 토스트/모달 포함. 원형은 상태 도트·뱃지 카운터만
- KPI 카드 시그니처: 좌상단 7×7px 코너 틱(2px 테두리 L자) + 8.5px letter-spacing .11em 대문자 모노 라벨 + 22px 모노 수치 + 64×22 스파크라인
- 패널 헤더: `FIG.01 / TBL.01 / LOG / CAL …` 모노 9px 컬러 태그 + 12.5px 볼드 제목
- 그림자 없음(플랫), 모달/토스트만 `0 6–20px … var(--ovl)`

## Screens / Views (요약)
전체 레이아웃 공통: 좌측 212px 사이드바(접기 시 56px, `body[data-sb="min"]`로 라벨 숨김) + 48px 스티키 톱바 + 콘텐츠(max-width 1340px, padding 16/20) + 26px 스티키 푸터 상태바.

**Ops (21)**: 관제 Overview(KPI 6·랙맵·INC 타임라인·스트래글러·테넌트 테이블·이벤트 피드), 자산 CMDB(필터·정렬·페이징), 용량, 프로비저닝(7게이트 스텝퍼 + X-QUEUE), 네트워크 IB/NVLink, 전력 DCIM, 텔레메트리, 인시던트, 성능 SLA/MFU, 보안 Sanitization(7단계), 변경 CAB, 오케스트레이션(P2), Observability 9종(종합·GPU·패브릭·랙전력 히트맵·DLC·RCA 체인·SLO·알림·트레이 수명주기).

**Customer (14)**: 대시보드, 클러스터(사이즈 조정·콘솔 접속·회수), 노드(검색·필터·페이징·재부팅), 이미지, 스토리지(QoS·스냅샷), 네트워크 VPC(읽기 전용 IB), 모니터링(6h/24h/7d), 알림·룰, 빌링, 지원 티켓, 보안·감사, API 키/CLI, 마켓플레이스(P2), 설정(테마·멤버).

**Biz (11)**: 임원 대시보드(월간/분기/연간 환산 토글), 파이프라인 보드(4레인 + 딜 상세), 견적·RFQ(자동산정: 랙×단가×720h, TCV), 계약, 매출 분석, 가격 정책(할인 승인 큐), 수요·공급 계획(발주 트래커), 파트너, 컴플라이언스(CSAP 체크리스트), 시장/채널(P2).

정확한 레이아웃·수치·카피는 HTML 파일이 원본 스펙입니다 — 화면별 마크업을 직접 참조하세요 (`data-screen-label` 속성으로 화면 탐색 가능).

## Interactions & Behavior
- **라우팅**: `location.hash = "#/route"` + hashchange 리스너. 사이드바 활성 항목: 좌측 2px 코발트 바 + accS 배경
- **테마**: 톱바 ☀/☾ 토글 + 설정 모달. `document.body.dataset.theme` 전환, `localStorage["nc2a-theme"]` 저장 — 3개 콘솔 공유
- **⌘K 팔레트**: 화면 이동 + 리소스 + 액션(승인/해결/테마 전환) 검색 실행. ESC 닫기, Enter 첫 항목 실행
- **모달**: 오버레이 클릭/ESC 닫기, 확인 버튼은 상태 변경 + 우하단 토스트(4.2s 자동 소멸, 종류별 좌측 3px 컬러 바)
- **시나리오 상태 머신** (콘솔 내): Ops — ord-9 7게이트 진행→DELIVERED, INC-0412 해결, CAB-88/89 승인, Sanitization 1→7단계, 트레이 재기동(2클릭 암 확인, 3s 타임아웃); Customer — 클러스터 주문, 티켓 생성, QoS 변경, API 키 발급; Biz — 리드 등록(보드 즉시 반영), delta-corp 계약 전환, 할인 승인/반려, CSAP 증빙 업로드, 증설 발주 상신
- **라이브 갱신**: Ops 시계·전력 스파크라인 4s 인터벌

## Cross-Console State (핵심 요구사항)
`localStorage["nc2a-x"]` JSON + `window "storage"` 이벤트로 콘솔(탭) 간 실시간 동기화. 재구현 시 공유 백엔드/이벤트 버스로 대체.

| 키 | 발생 (writer) | 반영 (reader) |
|---|---|---|
| `ord10: true` | Biz — delta-corp "계약 전환 + 개통 요청" | Ops 프로비저닝 X-QUEUE에 ord-10 카드 + 메뉴 뱃지 증가 |
| `ord11: true` | Customer — "+ 클러스터 생성" 주문 제출 | Ops X-QUEUE에 ord-11 카드 + 뱃지 |
| `ord9: "delivered"` | Ops — ord-9 게이트 7/7 통과 | Biz 계약 목록 gamma-labs ONBOARD → ACTIVE |
| `inc0412: "resolved"` | Ops — INC-0412 "해결 처리" | Customer TCK-1204 해결됨 · 대시보드 RECOVERY→RESOLVED 배너 · 피드 항목 추가 |

테스트: 두 콘솔을 별도 탭으로 열고 위 액션 실행 → 다른 탭 즉시 반영.

## State Management (재구현 가이드)
- 콘솔별 단일 스토어(라우트, 테마, 필터/정렬/페이지, 시나리오 플래그, 토스트 큐)
- 크로스 상태는 별도 채널(위 표) — 낙관적 UI + 이벤트 구독
- 데이터는 현재 전부 mock 상수. 실연동 대상: 원본 PoC의 `shared/mock-api.js` / `nocp-api.js` 계약 참조 (원 소스 폴더 `neocloud-consoles/`)

## Assets
외부 이미지 없음. Google Fonts(IBM Plex Sans KR, IBM Plex Mono)만 사용. 차트/스파크라인/랙맵은 전부 인라인 SVG·div — 재구현 시 경량 차트 컴포넌트로 대체 가능하되 1.4~1.8px 스트로크, 격자 최소화 스타일 유지.

## Files
- `ops-console.html` / `customer-console.html` / `biz-console.html` — 오프라인 단일 파일 프로토타입 (원본 스펙)
- `README.md` — 본 문서

## Claude Code 사용 가이드
번들 폴더를 대상 리포에 두고 (예: `docs/design_handoff_neocloud_consoles/`) 아래처럼 시작:

```bash
cd <your-repo>
claude
```

첫 프롬프트 예시:
```
docs/design_handoff_neocloud_consoles/README.md 를 읽고,
ops-console.html 을 열어 구조를 파악한 뒤(HTML은 디자인 레퍼런스임),
우리 코드베이스의 React + 기존 컴포넌트 패턴으로 Ops 콘솔의
"관제 Overview" 화면부터 재구현해줘.
디자인 토큰은 README의 표를 CSS 변수(라이트/다크)로 먼저 세팅하고,
다크/라이트 전환과 해시 라우팅 셸(사이드바+톱바)을 만든 다음 화면을 채워줘.
```

권장 작업 순서 (화면이 많으므로 단계 분할):
1. 토큰/테마 셸 — `claude "README의 Design Tokens로 theme.css와 다크모드 토글 구현"`
2. 레이아웃 셸 — 사이드바(접기)+톱바+푸터+라우팅
3. 공용 컴포넌트 — KPI 카드(코너 틱), 패널(FIG. 헤더), 테이블, 토스트, 모달, ⌘K 팔레트
4. 화면 단위 이식 — `claude "ops-console.html의 #/incidents 화면을 재구현"` 식으로 화면별 반복
5. 크로스 상태 — README의 nc2a-x 표를 이벤트 버스/API로 구현
