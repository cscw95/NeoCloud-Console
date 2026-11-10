/* 셀프 가입 페이지 (F07) — 가입 → 사업자 확인 대기 → (운영자 확인) → 활성 → OIDC 로그인.
   POST /api/v1/signup {org_name, business_reg_no, admin_email, admin_name, payment_method_token?, public_sector}
   → {tenant_id, status:"pending_verification"}. 공공 테넌트는 가드 정책 enforce 자동(F03). */
(function () {
  var NC = window.NC = window.NC || {};
  var A = NC.v2, U = NC.v2ui;
  if (!A || !U) return;
  var L = U.L, esc = U.esc, $ = U.$;
  var S = { res: null, f: { org_name: "", business_reg_no: "", admin_email: "", admin_name: "", public_sector: false, payment_method_token: "" } };

  function render() {
    var root = $("su-root"); if (!root) return;
    var st = S.res && S.res.data ? S.res.data.status : null;
    var steps = [["가입 신청", "Apply", "POST /api/v1/signup", "POST /api/v1/signup"], ["사업자 확인 대기", "Awaiting verification", "운영자 확인 · 주문 403", "operator check · orders 403"],
      ["활성", "Active", "테넌트 · IAM realm · 관리자", "tenant · IAM realm · admin"], ["OIDC 로그인", "OIDC sign-in", "SSO · API 키 → 계약 · 청구서", "SSO · API keys → contract · invoice"]];
    var at = !st ? 0 : st === "pending_verification" ? 1 : st === "active" ? 2 : 0;
    var f = S.f;
    root.innerHTML = "<h1>" + esc(L("NeoCloud 조직 가입", "Sign up your organization")) + '</h1><p class="lead">' +
      esc(L("사업자 정보로 가입하면 테넌트·IAM realm·관리자 계정이 만들어집니다. 운영자가 사업자 확인을 마치면 활성화됩니다.",
        "Sign up with your business details to create a tenant, IAM realm and admin account. It activates once an operator verifies the business.")) + "</p>" +
      (NC.billingViz ? NC.billingViz.stepper(steps.map(function (s, i) {   // customer/billing-viz.js — IAM 온보딩과 같은 단계 표시
        return { label: L(s[0], s[1]), sub: L(s[2], s[3]), state: i < at ? "done" : i === at ? "current" : "todo" };
      }), L("진행 단계", "Progress")) :
      '<ol class="su-steps" aria-label="' + esc(L("진행 단계", "Progress")) + '">' + steps.map(function (s, i) {
        return '<li class="' + (i <= at && (st || i === 0) ? "on" : "") + '"' + (i === at ? ' aria-current="step"' : "") + ">" + (i + 1) + ". " + esc(L(s[0], s[1])) + "</li>";
      }).join("") + "</ol>") +
      (st ? '<section class="panel"><div class="ph"><span class="tick"></span><h2 class="t v2-h">' + esc(L("접수 완료", "Submitted")) + '</h2><span class="c">' + U.src(S.res) + "</span></div>" +
        '<dl class="v2-kv"><dt>tenant_id</dt><dd class="id">' + esc(S.res.data.tenant_id) + "</dd><dt>status</dt><dd>" + U.st(st) + "</dd></dl>" +
        '<p class="v2-note">' + esc(L("확인 전에는 주문이 403 으로 거부됩니다. 확인 후 고객 콘솔에서 SSO·API 키를 설정하세요.",
          "Orders return 403 until verified. After verification, set up SSO and API keys in the customer console.")) + ' <a href="index.html#/iam">' + esc(L("조직 · IAM →", "Organization · IAM →")) + "</a></p></section>"
      : '<form class="panel" id="su-form" novalidate><div class="su-form">' +
        U.field("su-org", L("조직 이름", "Organization name"), '<input id="su-org" required autocomplete="organization" value="' + esc(f.org_name) + '">') +
        U.field("su-brn", L("사업자등록번호", "Business registration no."), '<input id="su-brn" required inputmode="numeric" placeholder="000-00-00000" value="' + esc(f.business_reg_no) + '">') +
        U.field("su-name", L("관리자 이름", "Admin name"), '<input id="su-name" autocomplete="name" value="' + esc(f.admin_name) + '">') +
        U.field("su-email", L("관리자 이메일", "Admin email"), '<input id="su-email" type="email" required autocomplete="email" value="' + esc(f.admin_email) + '">') +
        U.field("su-pm", L("결제 수단 토큰 (선택)", "Payment method token (optional)"), '<input id="su-pm" autocomplete="off" placeholder="tok_…" value="' + esc(f.payment_method_token) + '">') +
        '<div class="v2-f"><label for="su-pub">' + esc(L("공공기관", "Public sector")) + '</label><input type="checkbox" id="su-pub"' + (f.public_sector ? " checked" : "") + "></div></div>" +
        '<p class="v2-note">' + esc(L("공공기관은 입력·출력 안전 가드가 enforce 로 고정됩니다.", "Public-sector tenants get the input/output guard fixed to enforce.")) + "</p>" +
        (S.res && S.res.error ? '<p class="v2-note" role="alert">' + U.st("failed", String(S.res.status || "")) + " " + esc(S.res.error) + "</p>" : "") +
        '<div class="v2-row" style="margin-top:10px"><button type="submit" class="btn">' + esc(L("가입 신청", "Sign up")) + "</button></div></form>");
  }
  document.addEventListener("submit", async function (e) {
    if (e.target.id !== "su-form") return;
    e.preventDefault();
    var f = S.f;
    f.org_name = $("su-org").value.trim(); f.business_reg_no = $("su-brn").value.trim(); f.admin_name = $("su-name").value.trim();
    f.admin_email = $("su-email").value.trim(); f.payment_method_token = $("su-pm").value.trim(); f.public_sector = $("su-pub").checked;
    if (!f.org_name || !f.business_reg_no || !/^[^@\s]+@[^@\s]+$/.test(f.admin_email)) {
      S.res = { error: L("조직 이름·사업자등록번호·이메일을 확인하세요", "Check organization name, registration no. and email"), status: 422 };
      return render();
    }
    var body = { org_name: f.org_name, business_reg_no: f.business_reg_no, admin_email: f.admin_email, admin_name: f.admin_name, public_sector: f.public_sector };
    if (f.payment_method_token) body.payment_method_token = f.payment_method_token;
    S.res = await A.signup(body);
    render();
  });
  U.onRoute({ "*": render });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render); else render();
})();
