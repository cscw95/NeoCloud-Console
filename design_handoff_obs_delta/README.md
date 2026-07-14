# Delta Handoff — Ops 콘솔 통합 Observability 4종 개선

로컬 저장소 `neocloud-consoles/` 에 적용하는 **델타 패치 가이드**입니다.
이 폴더에는 개선이 이미 반영된 완성본 2개 파일이 들어 있습니다:

- `ops/index.html` (완성본)
- `ops/app.js` (완성본)

## 적용 방법 A — 파일 교체 (권장, 가장 확실)
변경은 이 두 파일에만 있습니다. `shared/`, `customer/`, `biz/`는 건드리지 않았습니다.

```bash
cp design_handoff_obs_delta/ops/index.html  <repo>/neocloud-consoles/ops/index.html
cp design_handoff_obs_delta/ops/app.js      <repo>/neocloud-consoles/ops/app.js
```

로컬에서 두 파일을 개선 이후 별도로 수정했다면 방법 B(Claude Code diff 적용)를 사용하세요.

## 적용 방법 B — Claude Code 지시 (diff 병합)
repo 루트에서 `claude` 실행 후:

> `design_handoff_obs_delta/README.md`를 읽고, 동봉된 `ops/index.html`·`ops/app.js` 완성본과 현재 `neocloud-consoles/ops/`의 같은 파일을 diff 비교해서, 아래 "변경 목록"에 해당하는 블록만 현재 코드에 병합해줘. 내 로컬의 다른 수정사항은 유지해.

## 변경 목록 (리뷰 체크리스트)

### 1. GPU 플릿 감시 효율화 — `#/obs-gpu`
- index.html: 필터 바에 `#obs-gf-sort` 셀렉트(위치순/온도↓/util↓/ECC↓/전력↓) + `#obs-gf-attn` 칩("예외만") 추가
- app.js: `obsGpuIsAttn()` / `obsGpuSort()` 헬퍼 신규 · `renderObsGpu()`의 live/mock 분기 양쪽에 필터·정렬 적용 · 셀렉트 바인딩 배열에 `["obs-gf-sort","sort"]` 추가 · 클릭 위임에 `#obs-gf-attn` 토글 추가
- 예외 판정: faulted · throttled · temp≥78°C · ecc_uncorr>0 · pcie_replay≥3

### 2. GPU 패브릭 (UFM) 메뉴 신설 — `#/obs-fabtopo`
- index.html: 사이드바 obs-gpu 아래 링크 추가 · `<section data-screen="obs-fabtopo">` 신규 (KPI 밴드 `#obs-ft-kpi` · 토폴로지 `#obs-ft-topo` · 이상 링크 테이블 `#obs-ft-links`) · CSS `.ft-site .ft-sp .ftc .ft-su` 추가
- app.js: `renderObsFabTopo()` 신규 (mock 전용 — UFM twin API 미구현) · 라우트 맵에 `"obs-fabtopo"` 등록 · 장애 시드 `OBS_FT_FAULTS` / `OBS_FT_SPFAULTS`
- 실연동 시: UFM Telemetry REST(`/ufm/switches`, `/ufm/links`)로 셀 상태·SymbolErr·flap 바인딩

### 3. 랙 · 전력 (DCIM) 개선 — `#/obs-rack`
- index.html: KPI 밴드 `#obs-rack-kpi` + 추이 패널(가산 `#obs-pwr-ga`, 안산 `#obs-pwr-an`, 전체 `#obs-pwr-tot` polyline + `-v` 값 + `#obs-pwr-caps`) 추가
- app.js: `obsPwrHist` 전역(72샘플 링버퍼) · `obsRackPower(racks)` 신규 · `renderObsRack()`에서 `obsSrc(...)` 직후 호출
- 전력 캡 상수: 가산 6,700 / 안산 19,400 / 전체 26,200 kW · PUE 1.18 환산 표기 — 실값과 다르면 `capRow()` 호출부 수정

### 4. 크로스 상관 (RCA) 구체화 — `#/obs-fabric`
- index.html: 메뉴명 "패브릭 상관" → "크로스 상관 (RCA)" · 상관 체인 패널 `#obs-fab-chain` 신규 · RCA 테이블 타이틀 "냉각 → GPU → 패브릭 상관 RCA"
- app.js: `obsFabChain(rows)` 신규 — `renderObsFabric()` 내 `setTxt("obs-fab-c"...)` 직전 호출. finding 있으면 해당 CDU·랙으로 체인 채움, 없으면 최근 확정 사례(R13) 표시
- 체인 5단계(COOLING→RACK→GPU→FABRIC→TENANT) + 신뢰도 구성 바 + 자동 그룹화/권고 — 실연동 시 `/correlate/cooling` 응답에 `chain[]`·`evidence[]` 필드 확장 권장

## 검증
`./run.sh` 또는 정적 서빙 후 ops 콘솔에서:
1. `#/obs-gpu` — 정렬 셀렉트·예외만 토글 동작, 페이지네이션 유지
2. `#/obs-fabtopo` — 가산/안산 카드, an su-6 rail-A 셀 amber 테두리, 이상 링크 3행
3. `#/obs-rack` — KPI 6칸, 스파크라인이 5s마다 점 추가, 캡 바 3줄
4. `#/obs-fabric` — 체인 5카드 + 화살표, 신뢰도 바 4줄
콘솔 에러 0 확인.
