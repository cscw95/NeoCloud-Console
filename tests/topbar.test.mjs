// Topbar must not overflow at narrow desktop widths / long EN labels (shared/shell.css, shared/blueprint.css).
// Live check (CDP, EN+KO at 1440/1100/390, ops/customer/biz): no document-level horizontal scroll from the topbar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = p => readFileSync(path.join(ROOT, p), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

test("topbar wraps instead of overflowing; right-hand group may shrink and wrap", () => {
  const s = css("shared/shell.css");
  assert.match(s, /\.topbar\{flex-wrap:wrap;/);
  assert.match(s, /\.topbar:not\(#mk8s-root \*\)\{height:auto;min-height:50px;/);
  assert.match(s, /\.tb-right\{flex:0 1 auto;min-width:0;flex-wrap:wrap;/);
  const b = css("shared/blueprint.css");
  assert.match(b, /body\[data-design="blueprint"\] \.topbar:not\(#mk8s-root \*\)\{min-height:48px\}/);
  /* the old fixed rule (.tb-right{...flex:none}) must be overridden later in the file */
  assert.ok(s.lastIndexOf(".tb-right{flex:0 1 auto") > s.indexOf(".tb-right{margin-left:auto"));
});
