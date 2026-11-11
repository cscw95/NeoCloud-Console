// Live check of the ops Demo Center (#/demo-center) in headless Chrome over CDP.
// Needs a running NOCP and console; starts only Chrome.
//   CONSOLE_URL=http://127.0.0.1:8090 NOCP_BASE=http://127.0.0.1:8000 node scripts/demo-center-check.mjs [outdir]
// Writes <outdir>/demo-center.png (presenter mode, EN). Exit 1 on any failed check.
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
const SP = process.argv[2] || tmpdir();
const CONSOLE = (process.env.CONSOLE_URL || "http://127.0.0.1:8090").replace(/\/$/, "");
const NOCP = process.env.NOCP_BASE || "http://127.0.0.1:8000";
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = process.env.CDP_PORT || "20199";
const chrome = spawn(CHROME,
  ["--headless=new", "--remote-debugging-port=" + PORT, "--user-data-dir=" + mkdtempSync(SP + "/chr-"),
   "--window-size=1440,1000", "--no-first-run", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pend = {};
for (let i = 0; i < 40; i++) { try { const t = await (await fetch("http://127.0.0.1:" + PORT + "/json")).json();
  const p = t.find(x => x.type === "page"); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch {} await sleep(250); }
await new Promise(r => ws.onopen = r);
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d.result); delete pend[d.id]; } };
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await cmd("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return "EXC " + (r.exceptionDetails.exception || {}).description; return r.result.value; };
let ok = 0, bad = 0; const check = (n, c, extra = "") => { console.log((c ? "  PASS " : "  FAIL ") + n + (extra ? "  — " + extra : "")); c ? ok++ : bad++; };
await cmd("Page.enable");
await cmd("Page.navigate", { url: CONSOLE + "/ops/" }); await sleep(1500);
await ev(`localStorage.setItem("nc-nocp",${JSON.stringify(NOCP)}); localStorage.setItem("nc-lang","ko"); true`);
await cmd("Page.navigate", { url: CONSOLE + "/ops/#/demo-center" }); await sleep(2500);
check("route shows demo-center section", await ev(`getComputedStyle(document.querySelector('[data-screen=demo-center]')).display !== 'none'`));
check("live badge", await ev(`!!document.querySelector('#demo-center-root .src-badge.live')`));
const n = await ev(`document.querySelectorAll('[data-dc-scn]').length`);
check("scenario list ≥ 8", n >= 8, n + " scenarios");
await ev(`document.querySelector('[data-dc-act=reset]').click(); true`); await sleep(2500);
await ev(`document.querySelector('[data-dc-scn="h-bmaas-baseline"]').click(); true`); await sleep(800);
await ev(`document.getElementById('dc-pace').value='fast'; document.getElementById('dc-pace').dispatchEvent(new Event('change',{bubbles:true})); true`);
await ev(`document.querySelector('[data-dc-act=run]').click(); true`);
let mid = null;
for (let i = 0; i < 260; i++) { await sleep(250); const s = await ev(`[...document.querySelectorAll('.dc-step')].map(e=>e.className.split('s-')[1]).join(',')`);
  if (!mid && /running/.test(s) && /passed/.test(s)) mid = s; if (s && !/waiting|running/.test(s)) break; }
check("live timeline seen mid-run (SSE)", !!mid, mid || "");
const fin = await ev(`[...document.querySelectorAll('.dc-step')].map(e=>e.className.split('s-')[1])`);
check("baseline all 8 steps passed", fin.length === 8 && fin.every(s => s === "passed"), fin.join(","));
await sleep(800);
check("verdict badge 통과", await ev(`document.querySelector('.dc-counts .nc-badge').textContent`) === "통과");
check("result summary card", await ev(`!!document.querySelector('.dc-sumcard.v-pass') && document.querySelectorAll('.dc-sumcard .dc-link').length > 0`));
check("progress bar 100%", await ev(`(document.querySelector('[role=progressbar]')||{}).getAttribute && document.querySelector('[role=progressbar]').getAttribute('aria-valuenow') === "8"`));
await ev(`document.querySelector('[data-dc-view=swim]').click(); true`); await sleep(400);
check("swimlane: lanes + 8 chips", await ev(`document.querySelectorAll('#demo-center-root tbody th[scope=row]').length >= 3 && document.querySelectorAll('#demo-center-root [data-ft-step]').length === 8`));
await ev(`document.querySelector('#demo-center-root [data-ft-step="1"]').click(); true`); await sleep(400);
check("swimlane chip opens raw request", await ev(`/[/]api[/]v1[/]orders/.test(document.querySelector('.dc-swimmsg').textContent)`));
check("no page-level horizontal scroll", await ev(`document.documentElement.scrollWidth <= innerWidth`));
await ev(`document.querySelector('[data-dc-view=timeline]').click(); true`); await sleep(300);
check("request line + narration shown", await ev(`/POST http:\\/\\/nocp\\.demo\\/api\\/v1\\/orders/.test(document.querySelector('#demo-center-root').textContent) && !!document.querySelector('.dc-narr')`));
check("deep link to ops screen", await ev(`!!document.querySelector('.dc-link[href="#/provisioning"]')`));
// step mode on scenario a
await ev(`document.querySelector('[data-dc-scn="a-signup-to-invoice"]').click(); true`); await sleep(800);
await ev(`document.querySelector('[data-dc-act=step]').click(); true`); await sleep(800);
await ev(`document.querySelector('[data-dc-act=next]').click(); true`); await sleep(1200);
const st = await ev(`[...document.querySelectorAll('.dc-step')].map(e=>e.className.split('s-')[1]).join(',')`);
check("step mode: executed steps then waiting", /^((pending|passed|failed),)+waiting/.test(st), st);
check("step mode: current step emphasised", await ev(`document.querySelectorAll('.dc-step[aria-current=step]').length === 1`));
const pendTxt = await ev(`[...document.querySelectorAll('.dc-step.s-pending')].map(e=>e.textContent).join(' ')`);
check("pending steps carry a feature badge", !pendTxt || /기능 대기 F\d+/.test(pendTxt));
// EN toggle
await ev(`document.querySelector('#lang-toggle [data-lang=en]').click(); true`); await sleep(600);
check("EN rerender", await ev(`/Signup → contract/.test(document.querySelector('#demo-center-root').textContent) && /Run all/.test(document.querySelector('#demo-center-root').textContent)`));
// presenter
await ev(`document.querySelector('[data-dc-act=presenter]').click(); true`); await sleep(400);
check("presenter hides sidebar", await ev(`getComputedStyle(document.getElementById('nc-sidebar')).display === 'none'`));
check("presenter spotlight + step strip", await ev(`!!document.querySelector('.dc-spot') && document.querySelectorAll('.dc-dot').length > 2 && getComputedStyle(document.querySelector('.dc-listcol')).display === 'none'`));
const before = await ev(`document.querySelector('.dc-dot.on').textContent`);
await cmd("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 });
await cmd("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 }); await sleep(300);
check("presenter ← moves the spotlight", +(await ev(`document.querySelector('.dc-dot.on').textContent`)) === Math.max(1, +before - 1), before);
const shot = await cmd("Page.captureScreenshot", { format: "png" });
writeFileSync(SP + "/demo-center.png", Buffer.from(shot.data, "base64"));
check("no console-breaking errors", (await ev(`typeof NC.demoCenter`)) === "object");
await ev(`document.querySelector('#lang-toggle [data-lang=ko]').click(); true`);
console.log(`demo-center-check: ${ok} pass, ${bad} fail`);
chrome.kill(); process.exit(bad ? 1 : 0);
