#!/usr/bin/env python3
"""managed-k8s.html(단독 목업) → 콘솔 인라인 통합 산출물 생성기.

iframe 임베드 대신 ops/index.html에 직접 삽입하기 위해
  - mk8s.css : 목업 CSS 전체를 #mk8s-root 네이티브 중첩(nesting)으로 스코프
  - mk8s.js  : 목업 JS를 내부 라우터(location.hash 미사용)로 패치
를 생성한다. 목업 원본 갱신 시 이 스크립트를 재실행하면 된다:
    python3 ops/build-mk8s-inline.py
"""
import re, pathlib

SRC = pathlib.Path(__file__).with_name("managed-k8s.html")
html = SRC.read_text(encoding="utf-8")

# ── ① CSS: 첫 <style> 블록 (다크 테마 본체) ──────────────────────────────
css = re.search(r"<style>(.*?)</style>", html, re.S).group(1)

# @keyframes 는 중첩 불가 → 최상위로 추출
keyframes = re.findall(r"@keyframes[^{]+\{(?:[^{}]*\{[^}]*\})+[^}]*\}", css)
for kf in keyframes:
    css = css.replace(kf, "")

css = css.replace(":root{", "&{")                 # 변수 → 컨테이너 스코프
css = re.sub(r"^html,body\{[^}]*\}", "", css, flags=re.M)
css = re.sub(r"^body\{", "&{", css, flags=re.M)   # body 폰트/배경 → 컨테이너

out_css = (
    "/* 자동 생성 — ops/build-mk8s-inline.py (원본: managed-k8s.html) · 수동 편집 금지 */\n"
    + "\n".join(keyframes) + "\n"
    + "#mk8s-root{\n" + css + "\n}\n"
    + """
/* ── 인라인 통합 레이아웃 (iframe 제거) — 콘솔이 네비·계정·알림 담당 ── */
#mk8s-root .sidebar,#mk8s-root .logo,#mk8s-root .gsearch,
#mk8s-root .whoami,#mk8s-root .avatar,#mk8s-root .bell{display:none}
#mk8s-root .topbar{height:auto;padding:6px 4px 10px;gap:12px;background:transparent;
  border-bottom:1px solid var(--line);margin-bottom:6px}
#mk8s-root .main{display:block;flex:none;min-width:auto;padding:12px 2px 4px;overflow:visible}
#mk8s-root{background:transparent}

/* ── 콘솔 전역 클래스 누출 차단 — shell.css/ops가 정의하고 목업이 미정의한
     속성만 원복 (.grid 열, .step 축·폭, .kpi 배경) ── */
#mk8s-root .grid{grid-template-columns:none}
#mk8s-root .step{flex-direction:row;width:auto;flex:initial}
#mk8s-root .kpi{background:transparent}
#mk8s-root .kpi .v{font-size:24px}
#mk8s-root .chip{cursor:default}
#mk8s-root .modal{max-width:92vw}
"""
)
pathlib.Path(__file__).with_name("mk8s.css").write_text(out_css, encoding="utf-8")

# ── ② JS: 본체 <script> (2번째 = 데이터+앱, 마지막 embed IIFE는 제외) ────
scripts = re.findall(r"<script>(.*?)</script>", html, re.S)
js = max(scripts, key=len)                        # 본체 스크립트

def patch(old, new, must=True):
    global js
    if must:
        assert old in js, f"패치 앵커 없음: {old[:60]!r}"
    js = js.replace(old, new)

# 컨테이너: #app → #mk8s-root (초기 마크업은 그대로 — 불필요 요소는 CSS로 숨김)
patch("document.getElementById('app').innerHTML=",
      "document.getElementById('mk8s-root').innerHTML=")

# 내부 라우터 — 콘솔 해시(#/mk8s?v=)와 분리, location.hash 미사용
patch("""    window.addEventListener('hashchange',()=>this.render());
    if(!location.hash) location.hash='#/k8s/overview';
    this.renderSidebar(); this.render();""",
      "    this.state.route=this.state.route||'#/k8s/overview';\n"
      "    this.renderSidebar(); this.render();")
patch("navigate(hash){ if(location.hash===hash){ this.render(); } else location.hash=hash; },",
      "navigate(hash){ this.state.route=hash; this.render(); },")
patch("""    const hash=location.hash||'#/k8s/overview';
    this.state.route=hash;""",
      """    const hash=this.state.route||'#/k8s/overview';
    this.state.route=hash;""")
patch("    const cur=location.hash||'#/k8s/overview';",
      "    const cur=this.state.route||'#/k8s/overview';")

# 데모 리셋 — 콘솔 전체 리로드 후 mk8s로 복귀
patch("""    location.hash='#/k8s/overview';
    location.reload();""",
      """    location.hash='#/mk8s?v=overview';
    location.reload();""")

# 발급 딥링크 정리 — history 대신 내부 상태만 갱신
patch("history.replaceState(null,'','#/k8s/access');",
      "App.state.route='#/k8s/access';")

# 모달/드로어/토스트 — 스코프된 스타일이 닿도록 mk8s 루트에 부착
js = js.replace("document.body.appendChild(",
                "(document.getElementById('mk8s-root')||document.body).appendChild(")

# 라우트 변경 훅 — 콘솔 서브메뉴 하이라이트/브레드크럼 동기화용
patch("""    else renderPlaceholder(main, hash);
    main.scrollTop=0;""",
      """    else renderPlaceholder(main, hash);
    main.scrollTop=0;
    if(window.__mk8sOnRoute) window.__mk8sOnRoute(hash);""")

# 콘텐츠 내 <a href="#/k8s/..."> — 콘솔 해시를 건드리지 않고 내부 네비게이션
patch("App.init();",
      """App.init();
document.getElementById('mk8s-root').addEventListener('click',function(e){
  const a=e.target.closest('a[href^="#/"]'); if(!a) return;
  e.preventDefault(); App.navigate(a.getAttribute('href'));
});""")

out_js = ("/* 자동 생성 — ops/build-mk8s-inline.py (원본: managed-k8s.html) · 수동 편집 금지\n"
          "   iframe 없이 콘솔에 인라인 통합: 내부 라우터(App.state.route), #mk8s-root 스코프 */\n"
          + js)
pathlib.Path(__file__).with_name("mk8s.js").write_text(out_js, encoding="utf-8")
print("generated: mk8s.css (%d B) · mk8s.js (%d B)" % (len(out_css), len(out_js)))
