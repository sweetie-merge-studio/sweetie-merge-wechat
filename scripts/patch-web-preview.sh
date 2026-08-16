#!/usr/bin/env bash
# 给 build/web-mobile/index.html 注入 headless 预览 shim：
# Browser pane / 无头环境里页面被判 hidden，rAF 与 timer 被 Chrome 节流，
# Cocos 主循环与资源管线饿死。MessageChannel 不受节流影响，用它驱动 rAF。
# 每次 Cocos 构建会重置 index.html，构建后重跑本脚本即可。
set -euo pipefail
HTML="$(dirname "$0")/../build/web-mobile/index.html"
grep -q "__headless_shim__" "$HTML" && { echo "already patched"; exit 0; }
python3 - "$HTML" <<'PY'
import sys
path = sys.argv[1]
html = open(path, encoding='utf8').read()
shim = """<script>/* __headless_shim__ */
(function () {
  if (document.visibilityState === 'visible') return; // 正常前台环境不干预
  Object.defineProperty(document, 'hidden', { get: function () { return false; } });
  Object.defineProperty(document, 'visibilityState', { get: function () { return 'visible'; } });
  document.addEventListener('visibilitychange', function (e) { e.stopImmediatePropagation(); }, true);
  var mc = new MessageChannel();
  var cbs = [];
  var last = performance.now();
  mc.port1.onmessage = function () {
    var now = performance.now();
    if (now - last < 16) { mc.port2.postMessage(0); return; } // 限速 ~60fps，防空转
    last = now;
    var list = cbs; cbs = [];
    for (var i = 0; i < list.length; i++) list[i](now);
  };
  window.requestAnimationFrame = function (cb) { cbs.push(cb); mc.port2.postMessage(0); return cbs.length; };
  window.cancelAnimationFrame = function () {};
})();
</script>"""
html = html.replace('<head>', '<head>' + shim, 1)
open(path, 'w', encoding='utf8').write(html)
print('patched', path)
PY
