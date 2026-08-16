# sweetie-merge-wechat

**甜心合成乐园 — 微信小游戏端**

## 这是个什么项目？

这是一款**合成类小游戏**的微信版本源码。

- **合成游戏**是什么：棋盘上有很多小物件，把两个相同的物件拖到一起，就合成一个更高级的物件。比如「面包 Lv1 + 面包 Lv1 = 面包 Lv2」。游戏里共有 8 个品类（面包、蛋糕、糖果、巧克力、饼干、饮料、水果、冰淇淋），每类最多 8 级。玩家一边合成，一边完成顾客订单换取金币和体力。
- **微信小游戏**是什么：一种跑在微信 App 里、不用下载安装、点开即玩的游戏形态。它不是网页也不是原生 App，要用微信官方的开发者工具打包上传、过审后才能被用户搜到。
- **这个仓库负责什么**：用 Cocos Creator（游戏引擎）+ TypeScript 写出游戏本体，构建成微信小游戏包。核心玩法逻辑与 Web H5 版（`sweetie-merge` 仓库）同源，本仓库在其上做微信平台适配。

> 如果你只是想「把游戏跑起来看看」，直接跳到 [快速开始](#快速开始)。

## 技术栈

| 层 | 选型 |
|----|------|
| 游戏引擎 | Cocos Creator **3.8.8**（`project.json` 里写 3.8.4 是旧值，装 3.8.8，构建已验证）·2D 模式·画布 720×1280 |
| 语言 | TypeScript 5.x |
| 平台目标 | 微信小游戏（wechatgame），单平台 |
| 状态管理 | 自建 EventBus + GameManager 单例（不引入 Redux/MobX） |
| 资源分包 | Cocos Bundle，主包目标 ≤ 4MB、总包 ≤ 30MB |

## 目录结构

先分清两类目录：**手写的源码**（需要你关心、会进 git）和**引擎自动生成的**（不进 git，删了也会重新长出来）。

```
sweetie-merge-wechat/
│
├── assets/                  ← ★ 游戏本体，绝大部分工作都在这里
│   ├── scenes/
│   │   └── Main.scene       # 目前唯一的场景，游戏从这里启动
│   ├── prefabs/             # 可复用的节点模板（Item.prefab、OrderCard.prefab）
│   ├── scripts/             # ★ 所有 TypeScript 代码（详见下方）
│   ├── sprites/             # 静态引用的图片（背景、道具、货币、UI）
│   ├── resources/           # 运行时动态加载的资源（resources.load 走这里）
│   ├── ui/                  # UI 相关资源
│   └── audio/               # 音效
│
├── wechat/                  ← 微信平台配置（构建时会被带进产物）
│   ├── game.json            # 屏幕方向、网络超时、分包声明
│   ├── project.config.json  # AppID（占位值，需替换成你自己的）
│   └── game.js              # 小游戏入口占位文件
│
├── docs/
│   └── SD.md                # 系统设计文档：数据流、分包策略、双工具完整工作流
│
├── settings/                # Cocos 工程设置（构建配置等，会进 git）
├── project.json             # Cocos 工程清单 + Bundle 声明
├── tsconfig.json            # TypeScript 配置
├── package.json             # 只有一个 type-check 脚本
│
└── （以下均由工具生成，已在 .gitignore，不用关心）
    library/  temp/  profiles/  build/  node_modules/
```

### `assets/scripts/` 代码分层

```
scripts/
├── core/          # ★ 纯 TypeScript 业务逻辑，共 24 个模块
│                  #   board / order / economy / energy / backpack / bakery /
│                  #   blindbox / collection / shop / season / daily / storage …
├── components/    # Cocos 视图组件，负责「显示」和「响应点击」
│                  #   BoardComponent、ItemComponent、OrderPanelComponent、StatusBarComponent
├── manager/       # GameManager 全局单例，持有游戏状态 + EventBus
├── api/           # 后端 HTTP 客户端（auth / player / order / economy / energy / rewards …）
├── data/          # items.ts — 物品配置表（8 类 × 8 级）
└── platform/      # 微信平台适配层（wechat.ts 封装 wx.xxx，offline-queue.ts 离线上报队列，wx.d.ts 是类型声明）
```

**最重要的一条约定**：`core/` 里**不允许**出现 `wx.`（微信 API）或 `cc.`（Cocos 引擎）依赖。它是纯函数式的业务逻辑，输入旧状态、输出新状态，因此可以被 Web H5 版仓库原样复用。要用平台能力，走 `platform/`；要操作画面，走 `components/`。

数据流大致是：

```
玩家点击 → components/ 发事件 → GameManager.events (EventBus)
                                      ↓
                            core/ 纯函数算出新状态
                                      ↓
                       组件重渲染 + platform/wechat.ts 存档
```

## 快速开始

### 你需要先装两个工具

| 工具 | 用途 | 下载 |
|------|------|------|
| **Cocos Dashboard**（内含 Cocos Creator 3.8.x） | 编辑场景、写代码、构建出小游戏包 | https://www.cocos.com/creator/download |
| **微信开发者工具** | 加载构建产物、模拟器调试、真机预览、上传审核 | [官方下载页](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html) |

在 Cocos Dashboard 的「编辑器」Tab 里安装 **3.8.8**。

> `project.json` 与 `package.json` 里写的是 `3.8.4`，那是旧值。实际用 3.8.8 构建已验证通过，不必回装旧版。

### 1. 拉代码

```bash
git clone https://github.com/sweetie-merge-studio/sweetie-merge-wechat.git
```

### 2. 用 Cocos Creator 打开工程

1. 打开 Cocos Dashboard → **项目** → **导入** → 选中刚 clone 下来的仓库根目录
2. 双击工程打开。首次打开引擎会做几件事，耐心等它跑完：
   - 生成 `library/`、`temp/`、`profiles/`（都不进 git）
   - 扫描 `assets/` 下所有资源，为每个文件生成 `.meta`
   - 解析 `cc` 模块并写出 `temp/tsconfig.cocos.json` —— 这一步完成后 IDE 才有代码补全

### 3. 在浏览器里预览（最快看到画面的方式）

编辑器里选中 `assets/scenes/Main.scene`，按顶部 **预览** 按钮（快捷键 `Cmd+P`）即可在浏览器跑起来。

注意这只是开发期的快速验证。最终以微信开发者工具里的表现为准 —— 浏览器里没有 `wx.` 环境，涉及微信登录、广告、存档的功能不会真正生效。

### 4. 检查类型（可选）

```bash
npm run type-check
```

等价于 `tsc --noEmit`。**必须先用 Cocos 打开过一次工程**，否则 `temp/tsconfig.cocos.json` 不存在，`cc` 模块解析不了会大量报错。

### 5. 构建微信小游戏包

1. 先去 [微信公众平台](https://mp.weixin.qq.com/) 注册小游戏账号 → 拿到 **AppID**
2. 把 `wechat/project.config.json` 里的占位值 `"appid": "wx0000000000000000"` 换成你自己的 AppID
3. Cocos 编辑器菜单 **项目 → 构建发布**
4. 平台选 **微信小游戏**，启动场景选 `Main`，填入 AppID
5. 点 **构建**，产物输出到 `build/wechatgame/`

### 6. 调试与发布（微信开发者工具）

1. 启动微信开发者工具 → **导入项目**
2. 项目目录填 `<仓库根目录>/build/wechatgame/`，AppID 填你的，类型选 **小游戏**（不是小程序）
3. 左侧**模拟器**本地跑；**调试器**看 Console / Network / Performance
4. 右上角 **预览** → 用微信扫码真机运行（需要账号已被加为体验成员）
5. **详情 → 基本信息**可看包体大小，主包必须 ≤ 4MB、总包 ≤ 30MB
6. 右上角 **上传** → 到小程序后台设为体验版或提交审核（审核一般 1–7 个工作日）

一句话概括两个工具的分工：**Cocos 负责「做」，微信开发者工具负责「跑 & 发」**，两者通过 `build/wechatgame/` 目录衔接。

> 更详细的工作流（含包体超限排查、分包策略、事件命名约定）见 [docs/SD.md](docs/SD.md)。

## 当前状态

这个工程仍在建设中，几处已知的「设计已定、代码未落地」：

- **资源分包**：bakery / blindbox / collection 三个分包的 Cocos 场景和目录尚未创建，`project.json` 目前只声明了 `main` 一个 Bundle。烘焙坊 / 盲盒 / 图鉴的**逻辑**已经写在 `assets/scripts/core/` 里，缺的是场景与资源。分包建好后再把 `subpackages` 声明加进 `wechat/game.json`（提前声明会让微信开发者工具报 root 不存在）。
- **场景**：目前只有 `Main.scene`。
- **美术资源**：部分品类的道具图还没补齐。
- **未在微信开发者工具中验证**：本仓库由抖音端（`sweetie-merge-douyin`）移植而来，代码层面已完成 `tt.*` → `wx.*` 适配，但尚未走完「构建 → 微信开发者工具导入 → 模拟器验证」全流程。

分包的目标设计见 [docs/SD.md](docs/SD.md) 第 4 节。

## core/ 同步机制（改业务逻辑前必读）

`assets/scripts/core/` 是三端共享的纯业务逻辑，**唯一真相源在 Web 端仓库** `sweetie-merge/src/core/`。

本仓库的 `core/` 是同步产物 —— 不要直接改它。要改业务逻辑：

1. 在 `sweetie-merge` 改 `src/core/`
2. 在那边跑 `node scripts/sync-core.mjs`
3. 三端一起提交

脚本会自动改写 import 路径、把 Web 的 i18n 调用降级成中文字面量（本端没有 i18n 层）。

**平台专属实现**用标记圈出，同步时脚本原样保留本端版本，不会被 Web 版覆盖：

```ts
// @platform-specific:start Web 按窗口高度动态定行数；Cocos 画布固定
export function getBoardRows(): number { return 8; }
// @platform-specific:end
```

本端已标记三处：`board.ts` 的棋盘行数、`config.ts` 的深拷贝（小游戏没有 `structuredClone`，用 JSON 兜底）、`tips.ts` 的提示池。`asset-url.ts` 与 `offline-queue.ts` 整份平台专属，不参与同步。

## UI 结构要点

- **商店页是并列双 Tab**（商店 / 盲盒）。盲盒用 `bundle-pages.mountBundleSection()` 动态挂载，保持独立分包、切过去才加载。**别改回「二选一落地页」**——那会顶掉精力钻石档位与装饰物入口。
- **用不了 Cocos 的 ScrollView**：本项目节点触摸命中链路失效（所有点击都走 `tap-zone.ts` 的全局 input 监听），ScrollView 依赖节点触摸事件收不到。要滚动用 `components/drag-scroll.ts` 的 `createScrollView()`。
- **弹窗**走 `modal-chrome.ts`，会自动处理触摸隔离。

## 功能开关

`core/config.ts` 的 `DEFAULT_CONFIG.features`。当前本端开启：`collectionRare`、`diamondSpend`、`blindbox`、`shopDeco` 及基础系统；关闭：`season`（数据过期）、`social`（分享奖励无校验）、`iap`（无支付代码，需版号资质）。

完整盘点见 Web 端仓库的 `docs/feature-flags-决策清单.md`。

**盲盒概率公示**只能取自 `core/blindbox.ts` 的 `getDropRates()`，不许在 UI 里另写 rate 文案——平台审核要求展示概率与实际一致。

## 关联仓库

| 仓库 | 说明 |
|------|------|
| [sweetie-merge-studio/.github](https://github.com/sweetie-merge-studio/.github) | 项目总览、架构文档、运维手册 |
| [sweetie-merge](https://github.com/sweetie-merge-studio/sweetie-merge) | 游戏前端（Web H5，Vue 3） |
| [sweetie-merge-server](https://github.com/sweetie-merge-studio/sweetie-merge-server) | 后端 API（NestJS + PostgreSQL） |
| [sweetie-merge-douyin](https://github.com/sweetie-merge-studio/sweetie-merge-douyin) | 抖音小游戏端（本仓库的移植来源） |
| [sweetie-merge-admin](https://github.com/sweetie-merge-studio/sweetie-merge-admin) | 运营管理后台（UmiJS） |
