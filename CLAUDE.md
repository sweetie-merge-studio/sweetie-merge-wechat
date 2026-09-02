# CLAUDE.md

给 Claude Code 的项目约定。通用信息见 [README.md](README.md)（含目录结构、core/ 同步机制、
功能开关），这里只记**容易踩坑、光看代码看不出来**的部分。

## 仓库自带 Claude Code hooks，会拦你

`.claude/hooks/` 三个脚本随仓库入库，改代码时会自动触发：

| 时机 | 脚本 | 作用 |
|------|------|------|
| Edit/Write 前 | `guard-appid.sh` | 拦截把真实 AppID 写进 `project.config.json` |
| Edit/Write 后 | `check-scripts.sh` | 改了 `core/` 就查平台无关约束；打标记待 type-check |
| 回合结束前 | `stop-typecheck.sh` | 改过 `assets/scripts/**.ts` 就强制 `npm run type-check`，不过不让结束 |

被拦住时看提示改，别绕过——下面两条就是它们守的规则。

type-check 依赖 `temp/tsconfig.cocos.json`，**这个文件由 Cocos Creator 打开工程时生成**、不入库。
没生成时 hook 会跳过检查并给出提示——刚 clone 完还没用 Cocos 打开过工程，
type-check 是静默跳过的，别以为"通过了"。

## AppID：不要写进 `project.config.json`

`wechat/project.config.json` 里的 appid **只能保持 git HEAD 里那个占位值**。
真实 AppID 走 `wechat/project.private.config.json`（已 gitignore）。

要同步真实 AppID 用脚本，不要手改：

```bash
pnpm sync-appid      # scripts/sync-appid.sh
```

## `core/` 必须保持平台无关

`assets/scripts/core/` 是从主仓 `sweetie-merge` 同构移植过来的纯逻辑，
**禁止出现 `wx.` / `tt.` / `cc.` 依赖**（hook 会当场报错）。

平台 API 一律走平台层封装。这条不是洁癖——抖音端 `sweetie-merge-douyin` 复制的就是同一份
`core/`，掺了 `wx.` 进去那边直接跑不起来。

改 `core/` 里的业务逻辑前先读 README 的「core/ 同步机制」一节，两端要一起改。

## Cocos 编辑器会偷偷重写 `settings/v2/packages/information.json`

Cocos Creator 打开工程时，若本机校验不过，会把 `customSplash.enable` 重置为 `false`
并抹掉表单 URL 里的 `sid` 参数。**这种 diff 一律 `git checkout --` 丢弃、不要提交**——
sid 是提交 Cocos 官方表单才拿到的凭证，提交这个"改动"等于把它弄丢。

## 不能用 Cocos 的 ScrollView

本项目相机/适配调整后**节点触摸命中链路失效**（全项目点击都走
`assets/scripts/components/tap-zone.ts` 的全局 input 监听），
而 ScrollView 依赖节点触摸事件驱动，收不到事件。

要滚动区用 `assets/scripts/components/drag-scroll.ts` 的 `DragScrollComponent`。
详见 `drag-scroll.ts` 头部注释与 `docs/RUNBOOK.md`。

## Mask.Type.GRAPHICS_RECT 在微信灰度基础库下抛 3804

2026-09-02 踩坑：隐私协议弹窗只有标题、内容和按钮全空白。控制台报
`TypeError: Error 3804`，堆栈落在 `createScrollView` 的 `view.addComponent(Mask)`。

根因：`Mask.Type.GRAPHICS_RECT` 的 onLoad 会 `getComponent(Graphics) || addComponent(Graphics)`，
在微信小游戏灰度基础库 **3.17.1** 下 `addComponent(Graphics)` 这一步抛 3804，
导致整个 `addComponent(Mask)` 失败，`_buildContent` 中断，后续按钮也没渲染。

修复（已落地 `drag-scroll.ts`）：**添加 Mask 之前先给节点挂一个 Graphics 组件并画好透明矩形**，
这样 Mask onLoad 时 `getComponent(Graphics)` 直接拿到已有实例，不再触发 `addComponent`，绕过 3804。

```typescript
// 正确顺序：先 Graphics，再 Mask
const g = view.addComponent(Graphics);
g.fillColor = new Color(0, 0, 0, 0);
g.rect(-width / 2, -height / 2, width, height);
g.fill();

const mask = view.addComponent(Mask);
mask.type = Mask.Type.GRAPHICS_RECT;
```

注意：Cocos Creator 3.8.x 的 `Mask.Type` **没有 `RECT` / `ELLIPSE` 枚举值**
（只有 `GRAPHICS_RECT` / `GRAPHICS_ELLIPSE`），别想当然换成 `RECT` + Sprite，类型检查会报错。

附带防御（已落地 `PrivacyConsentModal.ts` / `privacy-config.ts`）：
- `_buildContent` 包 try-catch，内容区构建失败时按钮仍能渲染，用户至少可以点同意进游戏
- `getPrivacySummary()` 做字段级 `Array.isArray` 校验，后端返回不完整 summary 时逐项回退默认值
- `_buildSection` 内部 `Array.isArray(items)` 双保险

## 构建：退出码 36 是成功

Cocos CLI 官方约定 **exit code 36 = 构建成功**（`ci/release.mjs` 里 `COCOS_EXIT_SUCCESS = {0, 36}`）。
看到 36 别当失败去"修"。

```bash
node ci/release.mjs --build-only --debug     # 出 debug 包（会先跑 type-check）
```

也可以直接调 Cocos Creator CLI，跳过 release.mjs 的前置检查，构建更快：

```bash
"/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator" \
  --project /Users/liumengdie/sweetie-merge-wechat \
  --build "platform=wechatgame;debug=true"
```

Cocos Creator 安装路径以本机实际为准（Dashboard → 偏好设置 → 编辑器位置可查）。
debug 包产物主脚本是 `build/wechatgame/assets/main/index.js`（无 md5 后缀），
release 包会带 md5 缓存后缀（如 `index.f2a4d.js`）。

产物在 `build/wechatgame/`，用**微信开发者工具**导入（选「小游戏」，可用测试号免注册）。
判定「跑起来了」的标准见 `docs/RUNBOOK.md`。

构建真失败时丢给 **cocos-build-resolver** agent 排障——构建日志又长又脏，别整段读进上下文。

## 上传用 miniprogram-ci，需要 IP 白名单

`miniprogram-ci` 上传要求调用方 IP 在微信后台白名单里，且需要上传密钥。
**提审和「发布」仍然要人工去微信后台点**，脚本只到上传体验版为止。

完整发版流程见 **noya-minigame-release** skill。

## Git

- 提交信息用中文，格式 `<type>: <描述>`（feat / fix / refactor / test / chore / perf / ci / docs）
- 与抖音端 `sweetie-merge-douyin` 改同一件事时，commit message 里互相引用对方 sha
- 这个仓库在 `sweetie-merge-studio` org 下。本机 gh 唯一账号就是 `Noya-oneone`，
  **不需要切账号**（原 KKday 工作账号 `noya-liu` 的登录态已于 2026-08 离职时清除）。
  remote 走 SSH。若 push 报 `Repository not found`，先查 `gh auth status` 和 SSH key，
  别误判成 repo 名写错。
