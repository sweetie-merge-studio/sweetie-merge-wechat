#!/bin/bash
# 构建后处理：把真实 AppID 从 wechat/project.private.config.json（已 gitignore）
# 注入构建产物 build/wechatgame/project.config.json。
# 产物目录 build/ 不进 git，因此不违反「真实 AppID 不入库」护栏；
# 本脚本自身不含任何 AppID，可安全提交。
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
priv="$root/wechat/project.private.config.json"
target="$root/build/wechatgame/project.config.json"

if [ ! -f "$priv" ]; then
  echo "❌ 缺少 $priv —— 先把真实 AppID 写进该文件（gitignored）" >&2
  exit 1
fi
if [ ! -f "$target" ]; then
  echo "❌ 缺少 $target —— 先跑 Cocos CLI 构建（退出码 36 = 成功）" >&2
  exit 1
fi

appid=$(jq -r '.appid // empty' "$priv")
if [ -z "$appid" ]; then
  echo "❌ $priv 里没有 appid 字段" >&2
  exit 1
fi

tmp=$(mktemp)
jq --arg appid "$appid" '.appid = $appid' "$target" > "$tmp"
mv "$tmp" "$target"
echo "✅ 已把私有 AppID 注入 $target"
