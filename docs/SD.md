# 甜心合成乐园 — System Design

> 微信小游戏（Cocos Creator 3.8.4 LTS）系统设计与开发者工具工作流。

## 1. 技术栈

| 层 | 选型 | 备注 |
|---|---|---|
| 引擎 | Cocos Creator 3.8.4 LTS | 2D 模式，画布 720×1280 |
| 语言 | TypeScript 5.x | `tsc --noEmit` 仅在 Cocos 导入后通过 `temp/tsconfig.cocos.json` 解析 `cc` 模块 |
| 平台 | wechatgame | 微信小游戏单平台 |
| 状态管理 | 自建 EventBus + GameManager 单例 | 避免引入 Redux/MobX |
| 资源分包 | Cocos Bundle（subpackage 模式）| 主包 ≤ 4MB，总包 ≤ 30MB |

## 2. 目录结构

```
sweetie-merge-wechat/
├── assets/                  # 主 Bundle（当前唯一 Bundle）
│   ├── scenes/Main.scene
│   ├── prefabs/{Item,OrderCard}.prefab
│   ├── scripts/             # TS 源（编译时由 Cocos 注入 cc）
│   │   ├── core/            # 纯逻辑（24 个模块）：bakery/blindbox/collection/economy/...
│   │   ├── components/      # 视图组件：Board/Item/OrderPanel/StatusBar
│   │   ├── manager/GameManager.ts
│   │   ├── data/items.ts    # 64 个物品定义（8 类 × 8 级）
│   │   ├── api/             # HTTP 客户端封装
│   │   └── platform/{wechat.ts, offline-queue.ts, wx.d.ts}
│   ├── resources/           # 运行时动态加载资源
│   └── sprites/  ui/  audio/
├── wechat/                  # 微信平台配置：game.json / project.config.json / game.js
├── docs/                    # 设计文档、Plan、操作手册
├── settings/                # Cocos 工程设置（追踪进 git）
├── project.json             # Cocos 工程清单 + bundles 声明
└── package.json             # 仅含 type-check 脚本
```

> **分包目录尚未创建**：下文第 4 节的 bakery / blindbox / collection 三个 Bundle 是**目标设计**，`wechat/game.json` 已声明，但 Cocos 侧场景与目录还没建，`project.json` 目前只有 `main` 一个 Bundle。三个玩法的逻辑已在 `assets/scripts/core/` 中。

## 3. 数据流

```
用户操作 → Component (cc.Component)
              ↓ events.emit
       GameManager.events (EventBus)
              ↓ events.on
        Component 重渲染
              ↓
   core/* 纯函数（输入 state → 输出新 state）
              ↓
        save:* 事件 → platform/wechat.ts 持久化（wx.setStorageSync）
```

事件名约定：`<domain>:<verb>` —— `save:loaded` / `bakery:changed` / `collection:changed` / `blindbox:opened`。

## 4. 分包策略

> 以下为**目标设计**。当前 `project.json` 只声明了 `main`，bakery / blindbox / collection 三个 Bundle 待创建。

| Bundle | 计划路径 | 优先级 | 微信压缩 | 状态 |
|---|---|---|---|---|
| main | `assets/` | 1 | none | ✅ 已配置 |
| bakery | `assets/bundles/bakery/` | 2 | subpackage | ⬜ 待创建 |
| blindbox | `assets/bundles/blindbox/` | 2 | subpackage | ⬜ 待创建 |
| collection | `assets/bundles/collection/` | 2 | subpackage | ⬜ 待创建 |

进入对应玩法时通过 `assetManager.loadBundle('bakery', cb)` 按需加载，初次加载完成后 Cocos 会缓存。

## 5. 状态约定

- **immutable（推荐）**：`assets/scripts/core/blindbox.ts`、`economy.ts` 返回新对象。
- **mutating（历史遗留）**：`assets/scripts/core/collection.ts` 直接 `Set.add()`，组件订阅 `collection:changed` 全量重渲染规避脏读。
- 后续 P3 阶段会在 GameManager 上挂 `bakery / blindbox / collection` 状态，统一收口。

## 6. 持久化

平台读写在 `assets/scripts/platform/wechat.ts` 的 `save() / load()`：`wx.setStorageSync / wx.getStorageSync`，存档 key 为 `sweetie_merge_save`。

`assets/scripts/core/storage.ts` 保持平台无关，只负责 `serialize() / deserialize()` 与存档结构校验（Web H5 版复用同一套逻辑，平台层各自实现读写）。

GameManager 启动时调用 `platform.load()` 恢复状态并发出 `save:loaded`；写入走 1.5s 防抖（`scheduleSave()` 合并高频调用，销毁时 `flushSave()` 兜底）。

---

## 7. 开发者工具工作流（重点）

本节回答用户原始疑问：**「这个项目怎么在 Cocos Dashboard 和微信开发者工具里跑起来？」**

### 7.1 Cocos Dashboard（编辑器侧）

**用途**：导入工程 → 编辑场景 / Prefab → 写 .meta → 构建发布包。

#### 安装
1. 下载安装 [Cocos Dashboard](https://www.cocos.com/creator/download)。
2. 在 Dashboard 内通过 **「编辑器」** Tab 安装 **Cocos Creator 3.8.4**（必须与 `project.json` 内 `creator.version` 一致，否则首次导入会触发版本迁移）。

#### 导入工程
1. Dashboard → **项目** → **导入** → 选择本仓库根目录 `/Users/noyaliu/sweetie-merge-wechat`。
2. 双击工程，Cocos Creator 启动后会：
   - 生成 `library/`、`temp/`、`profiles/`（已在 `.gitignore`）。
   - 自动扫描 `assets/` 下的 `.scene / .prefab / .ts`，为每个文件生成 `*.meta`。
   - 解析 `cc` 模块并写出 `temp/tsconfig.cocos.json`，IDE 才能正确补全。
3. **创建分包时要做的事**（当前三个分包目录尚未建立，属于后续步骤）：
   1. 资源管理器 → 在 `assets/bundles/` 下新建 `bakery` 目录 → 属性检查器勾选「配置为 Bundle」→ Bundle 名 `bakery`，压缩类型 `subpackage`。
   2. 同上配置 `blindbox` / `collection`。
   3. 每个 Bundle 平台过滤仅勾选 `wechatgame`。
   4. **Ctrl+S** 写盘，确认对应 `.meta` 出现 `isBundle: true / bundleName / compressionType.wechatgame = subpackage`，`project.json` 的 `bundles` 也会多出三项。

#### 场景预览
- 顶部工具栏 → 选择 `Main.scene` → **预览（Cmd+P）**：浏览器快速调试主流程（仅作为开发期辅助，最终目标平台为微信小游戏，需以微信开发者工具实机为准）。
- 进入 Bakery / Blindbox / Collection：`Main` 场景内的入口按钮触发 `assetManager.loadBundle` → `director.loadScene`。

#### 构建微信小游戏包
1. 菜单 **项目 → 构建发布**。
2. 平台选 **微信小游戏**。
3. 关键参数：
   - 主包压缩 `none`（已在 `project.json` 声明）。
   - 三个分包压缩 `subpackage`（分包创建后才需要，当前只有 `main`）。
   - 启动场景 `Main`。
   - **AppID** 微信公众平台申请（见 7.2）。
4. 点击 **构建**，产物输出到 `build/wechatgame/`。

### 7.2 微信开发者工具（运行 / 调试 / 上传）

**用途**：把 Cocos 构建产物当作 mini-game 工程加载、本地调试、真机预览、上传审核。

#### 安装
1. 下载 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)（macOS / Windows）。
2. 注册 / 登录 [微信公众平台](https://mp.weixin.qq.com/)，**创建小游戏 → 拿到 AppID**（必填到 Cocos 构建步骤）。

#### 加载 Cocos 产物
1. 启动微信开发者工具 → **导入项目**。
2. 项目目录填 `/Users/noyaliu/sweetie-merge-wechat/build/wechatgame/`。
3. AppID 填刚申请的 mini-game AppID。
4. 类型选 **小游戏**（不是小程序）。

#### 本地调试
- 左侧 **模拟器**：720×1280 默认机型，可切换分辨率与机型。
- **调试器**：Console / Sources / Network / Performance；分包建好后，按需加载会让对应分包资源在 Network 面板出现一次。
- **真机预览**：右上角 **预览** → 微信扫码 → 实机加载。第一次扫码需要登录微信账号且账号在小程序后台被加为体验成员。

#### 性能与包体校验
- 工具内 **详情 → 基本信息**：主包大小（必须 ≤ 4MB）、总包大小（≤ 30MB）。
- 若主包超限：先查 `assets/sprites/` 图片体积，必要时把只在单个玩法用到的场景 / 大图迁到对应分包 Bundle 目录下。

#### 上传与审核
1. 工具右上角 **上传** → 填版本号（建议 `0.1.0` 起步）+ 备注。
2. 跳转小游戏后台 → **版本管理** → 把刚上传的版本设为「体验版」或提交审核。
3. 审核 1–3 工作日；首版需补充类目、隐私政策、广告资质等材料。

### 7.3 双工具协作摘要

```
┌────────────────────────┐        ┌─────────────────────────────┐
│  Cocos Dashboard       │        │  微信开发者工具              │
│  - 导入工程             │        │  - 加载 build/ 产物          │
│  - 编辑场景/Prefab      │  ───►  │  - 本地模拟 / 真机预览        │
│  - 配置 Bundle          │        │  - 包体校验                  │
│  - 构建 build/          │        │  - 上传 + 提审               │
└────────────────────────┘        └─────────────────────────────┘
        ▲                                         │
        │           源码 + 资源                    │
        └──────── git pull / push ────────────────┘
```

简言之：**Cocos 负责"做"，微信工具负责"跑 & 发"**，两者通过 `build/wechatgame/` 目录串联。

---

## 8. 接下来要补完的部分

- **分包落地**：`wechat/game.json` 已声明 bakery / blindbox / collection，但 Cocos 侧场景与 Bundle 目录尚未创建（见第 4 节与 7.1 步骤 3）。
- **场景**：目前只有 `Main.scene`，三个玩法场景待补。
- **美术资源**：部分品类的道具图未补齐。
- **状态收口**：把 `bakery / blindbox / collection` 状态统一挂到 GameManager（见第 5 节）。
