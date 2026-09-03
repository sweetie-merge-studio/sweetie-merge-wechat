#!/usr/bin/env bash
# 微信小游戏构建后修补：
# 1. engine-adapter.js 的 loadFont 加 try-catch，避免 wx.loadFont 抛
#    "loadFont:fail no permission" 时中断 Cocos 资源管线。
# 2. 把源码里归一化名称后的字体同步到构建产物（字体内部 Full Name 去空格）。
# 每次 Cocos 重新构建会重置这两个文件，构建后重跑本脚本即可。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ADAPTER="$ROOT/build/wechatgame/engine-adapter.js"
FONT_SRC="$ROOT/assets/resources/fonts/ZCOOLKuaiLe.ttf"
FONT_DST_DIR=$(find "$ROOT/build/wechatgame/assets" -type d -name '7a9ba883*' 2>/dev/null | head -1)

# --- 1. 修补 engine-adapter.js ---
if [ ! -f "$ADAPTER" ]; then
  echo "未找到 $ADAPTER，请先在 Cocos Creator 中构建微信小游戏"
  exit 1
fi

if grep -q '__wechat_loadfont_patch__' "$ADAPTER"; then
  echo "engine-adapter.js 已修补，跳过"
else
  python3 - "$ADAPTER" <<'PY'
import sys
path = sys.argv[1]
src = open(path, encoding='utf8').read()

old = """function loadFont(url, options, onComplete) {
  var fontFamily = __globalAdapter.loadFont(url);
  onComplete(null, fontFamily || 'Arial');
}"""

new = """function loadFont(url, options, onComplete) { /* __wechat_loadfont_patch__ */
  var fontFamily;
  try {
    fontFamily = __globalAdapter.loadFont(url);
  } catch (e) {
    // 微信开发者工具模拟器已知 bug：wx.loadFont 偶发抛 "loadFont:fail no permission"，
    // 真机上通常正常。此处兜底：从 URL 推断字体名（与 ttf 内部 Family Name 一致），
    // 避免抛错中断 Cocos 资源管线导致后续资源全部加载失败。
    console.warn('[engine-adapter] loadFont 抛错，已降级:', e && e.message ? e.message : e);
    var m = /([^/]+)\\.(ttf|otf|woff2?)$/i.exec(url);
    fontFamily = m ? m[1] : 'Arial';
  }
  onComplete(null, fontFamily || 'Arial');
}"""

if old not in src:
  print('警告：未找到原始 loadFont 函数，可能已被修改或构建版本不同')
  sys.exit(1)

src = src.replace(old, new, 1)
open(path, 'w', encoding='utf8').write(src)
print('已修补 engine-adapter.js loadFont')
PY
fi

# --- 2. 同步字体文件 ---
if [ -n "$FONT_DST_DIR" ] && [ -f "$FONT_SRC" ]; then
  cp "$FONT_SRC" "$FONT_DST_DIR/ZCOOLKuaiLe.ttf"
  echo "已同步字体到 $FONT_DST_DIR/ZCOOLKuaiLe.ttf"
else
  echo "警告：未找到构建产物中的字体目录，跳过字体同步"
  echo "  源码字体: $FONT_SRC"
  echo "  搜索目录: $ROOT/build/wechatgame/assets"
fi

echo "完成。在微信开发者工具中点击「编译」刷新即可生效。"
