# 运行手册（微信端，2026-08-16）

> 这份文档回答：**这个游戏到底怎么跑起来**。
> 本仓库由抖音端（`sweetie-merge-douyin`）移植而来，工具认知与流程同构，平台工具换成微信系。
> 抖音端踩过的坑与认知复盘见该仓库的 `docs/RUNBOOK.md`，此处只保留对微信端仍然适用的部分。

## 一、当前状态（TL;DR）

| 环节 | 状态 |
|------|------|
| 代码移植（`tt.*` → `wx.*`、平台层 / API 层 / 接线） | ✅ 完成 |
| TypeScript 类型检查 | ✅ 通过（需先用 Cocos 打开工程生成 `temp/`） |
| 用 Cocos Creator 打开工程（生成 library/temp/meta） | ✅ 完成（CLI 构建时自动导入，2026-08-15） |
| Cocos 构建微信小游戏包 | ✅ 通过（CLI，产物在 `build/wechatgame/`；退出码 36 但日志全部 success，与抖音端怪象一致） |
| release 包体达标 | ✅ 整包 2.77MB / 30MB、主包 2.75MB / 4MB（2026-08-16 量化压图 + 裁引擎，见「三·八」） |
| 三个玩法分包（bakery / blindbox / collection） | ✅ 已落地（代码进分包，但资源仍在主包） |
| 浏览器实跑验证（web-mobile 包） | ✅ 画面完整、60 FPS、console 零报错（2026-08-16） |
| 微信开发者工具安装 + 导入验证 | ⬜ 未做（本机未安装；首次需微信扫码登录，只能人工操作） |
| 真实 AppID 申请 | ✅ 已有（存放在 `wechat/project.private.config.json`，gitignored；构建后跑 `npm run sync-appid` 注入产物，2026-08-15） |
| 服务端 `WECHAT_APPID` / `WECHAT_APP_SECRET` | ⬜ 未配（`.env` 里没有），`/auth/wechat` 返回 503，登录走降级 |

**下一步只有一件事**：安装微信开发者工具 → 导入 `build/wechatgame/`（选「小游戏」，可用测试号）→ 模拟器按「四」的标准验证。

> 这一步是当前最大的风险敞口：上表所有 ✅ **都只经过 type-check 与浏览器 web 包**，
> 微信端至今没在真实 `wx.*` 环境里跑过一次。

## 二、核心心智模型

### 0. 本机需要的三个软件

| 软件 | 它是什么 | 什么时候打开它 |
|------|----------|----------------|
| **CocosDashboard** | Cocos 的**启动器/版本管理器**。自己不能编辑场景也不能构建 | 安装/升级 Creator 版本时；日常可跳过 |
| **Cocos Creator 3.8.x** | **游戏编辑器 + 构建器**：写代码、摆场景、把源码工程构建成小游戏产物 | 改场景/UI/资源时；出包时（也可用 CLI） |
| **微信开发者工具** | 腾讯官方的**小游戏/小程序运行时**：模拟器跑构建产物、看日志、真机预览（扫码）、上传提审。**不能**编辑游戏源码 | 每次想「看游戏跑起来」时；上传版本时 |

一句话分工：**CocosDashboard 管版本 → Cocos Creator 造产物 → 微信开发者工具跑产物**。

### 1. 两个工具、两种目录，职责完全不同

| | Cocos Creator | 微信开发者工具 |
|---|---|---|
| 角色 | **编辑器 + 构建器** | **运行时 + 调试器** |
| 打开的目录 | 仓库根目录 `~/sweetie-merge-wechat`（源码工程） | `build/wechatgame/`（构建产物） |
| 「游戏跑起来了」发生在 | ❌ 永远不在这里 | ✅ 只在这里的模拟器里 |

```
源码工程（assets/*.ts + .scene）
        │  Cocos Creator 构建（菜单或 CLI）
        ▼
build/wechatgame/            ← game.json + game.js + 打包后的 JS/资源
        │  微信开发者工具导入
        ▼
模拟器运行 / 真机预览 / 上传审核
```

- **改了源码 → 必须重新构建**，开发者工具里的东西不会自己更新。
- Cocos 顶部的 ▶ 播放按钮是**浏览器预览**，没有 `wx.*` API，不能用来验证微信端行为。

### 2. 小游戏 vs 小程序：看文件就能判定

入口是 `game.json` + `game.js` → 小游戏（本项目 ✅）；`app.json` + `app.js` → 小程序。微信开发者工具是两者共用的同一个工具，导入时读到 `game.json` 自动按小游戏处理。**只存在「目录选错」的问题，不存在「工具用错」的问题。**

### 3. 新建 vs 导入

- **新建**：往目录里生成模板代码，选了仓库根 = 污染源码。
- **导入/打开**：加载已含 `game.json` + `project.config.json` 的现成项目。**永远走这条。**
- 导入的目录**只能是 `build/wechatgame/`**（构建产物）。仓库里的 `wechat/` 只是开发期配置参考，不是可运行的小游戏工程——导进去会拿占位 `game.json` 编译，报「subpackages root 不存在」这类错（已实测踩过）。

### 4. 日志来源判别

| 日志出现在 | 它说的是谁的事 |
|---|---|
| Cocos Creator 控制台 | 编辑器自己（加载引擎、场景、插件） |
| Cocos「服务」面板的 `login server` 报错 | Cocos 官方增值服务连不上，**与游戏无关，可永久无视** |
| 微信开发者工具「调试器 Console」 | **游戏本体**——判断运行状态的唯一依据 |

## 三、标准运行流程（每次改完代码后）

```bash
# 1. 类型检查（可选但推荐；需先用 Cocos 打开过工程一次）
npm run type-check

# 2. 命令行构建（不用打开 Cocos 界面）
/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator \
  --project ~/sweetie-merge-wechat \
  --build "platform=wechatgame;debug=true"
```

3. 构建完成后跑 `npm run sync-appid`：把真实 AppID 从 `wechat/project.private.config.json`（gitignored）注入 `build/wechatgame/project.config.json`。Cocos 每次构建都会把产物 appid 重置为其默认测试值 `wx6ac3f5090a6b99c5`，忘了这步，开发者工具会报 `webapi_getwxaasyncsecinfo:fail`（查询不属于本账号的 appid）。
4. 微信开发者工具里项目会自动检测变更重新编译（没反应就点「编译」按钮）。
   ⚠️ 工具可能在**构建进行中**就自动编译——此时 `build/wechatgame/` 是半成品
   （game.json 缺失 / appid 是 Cocos 默认值），会黑屏并卡在错误态（2026-08-16 实证）。
   **构建 + sync-appid 全部完成后，务必手动再点一次「编译」**。
5. 首次使用：导入 → 小游戏 → 目录 `build/wechatgame` → 测试号（工具支持「使用测试号」免注册体验）→ 不使用云服务。

> 抖音端已知怪象（微信端待验证）：CLI 构建退出码非 0（抖音端为 36），但日志显示全部任务 success、产物完整可用。**以日志和产物为准**。

### 三·五、浏览器快速验证（不开微信开发者工具）

UI/布局/核心逻辑改动可以先出 web 包在浏览器里验证，迭代快得多：

```bash
# 1. 出 web-mobile 包
/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator \
  --project ~/sweetie-merge-wechat \
  --build "platform=web-mobile;debug=true"

# 2. 无头/内嵌浏览器环境要打 shim（页面被判 hidden 时 rAF 被节流，主循环饿死）
bash scripts/patch-web-preview.sh

# 3. 起禁缓存静态服务器（Cocos 产物同名无 hash，普通静态服务器必踩缓存坑）
python3 scripts/dev-server.py 8931
```

平台层已做非微信环境降级（`platform/wechat.ts` 的 `hasWx`）：存档走 localStorage、
广告直接放行、登录走离线，浏览器里能跑完整游戏主循环。

### 三·六、已踩过的坑（微信端实证）

- **`[...someSet]` 是雷**：Cocos 构建的 Babel 是 loose 模式，Set/Map 展开会被编译成
  `[].concat(set)`（不展开、把 Set 当单元素塞进数组）。写 `Array.from(set)`。
  2026-08-16 已修 6 处（storage×3 / shard×2 / blindbox×1），曾导致存档图鉴字段损坏。
- **手写场景的 Canvas 节点必须挂 Widget**（alignFlags 45 全边对齐）：引擎的
  `alignCanvasWithScreen` 只调相机不改节点尺寸，编辑器默认场景是靠 Canvas 上的
  Widget 把节点拉到可视尺寸的。漏挂 = 高于 16:9 的机型上下黑边。
- **`createRoundRectNode` 已占用宿主节点的 Graphics**：想在圆角矩形上再画线条
  （「+」十字、箭头折线等），必须新建子节点挂自己的 Graphics，复用同一实例会让
  圆底 fill 与线条 stroke 互相干扰，线条画不出来。
- **贴图不能用 WebP**：微信小游戏不解 WebP，贴图**静默不显示**——资源确实打进包了、
  `config.json` 注册正常、console 零报错、`spriteFrame` 也非空，纯粹渲染不出来。
  2026-08-16 实证：9 张 WebP 让背景/木托盘/订单卡底/货币图标在微信里全部消失，
  **而浏览器 web-mobile 包完全正常**——所以只在浏览器验证会漏掉。已全转回 PNG。
  压缩改用 `pngquant` 8bit 量化，见「三·八」。**贴图格式必须在微信开发者工具里验。**
- **裁引擎模块时 `sorting-2d` 不能关**：关掉后**整屏黑屏**，但场景正常加载、
  节点树完整构建、console 零报错、`cc.director.getScene()` 一切正常——
  静态检查完全看不出来，只有出 web 包实跑才暴露。2026-08-16 实证，回补即恢复。
  推论：裁模块**必须**每裁一轮就实跑一次，不能只看构建成功与包体数字。

### 三·七、美术素材现状（2026-08-16）

**阿里云图床已停服，原始美术源文件可能已丢失。** 仓库内 `assets/resources/sprites/`
的 75 张图是全部家底，均已入 git，代码零远程图片依赖（`resources.load` 全走本地包），
所以停服不影响现有画面运行。

现有资产：物品图 53 张（8 品类）、母体 8 张、导航图标 5 张、
背景/木托盘/订单卡底/金币/钻石/精力/锁/齿轮各 1 张。
**全部 75 张均为 PNG 且已做 8bit 量化**（见「三·八」）——曾有 9 张转过 WebP，
因微信不解 WebP 导致贴图不显示，2026-08-16 已全数转回。**不要再转 WebP。**

设计稿里仍缺、且**无法用现有素材近似**的：收银机贴图、吊灯装饰。
已用现有素材近似还原的：顾客头像（复用品类拟人角色图）、营业中标（纯 Graphics）。

新增 UI 时优先考虑 Graphics 绘制或复用现有贴图，避免依赖拿不到的素材。

### 三·八、包体瘦身（2026-08-16 实测，release 15.0MB → 2.77MB）

**卡提审的是主包 4MB，不是整包 30MB。** 两者能差很远：分包没装资源时整包很宽松，
主包早已超限。压图前主包约 15.9MB（4 倍于限额），而 `ci/release.mjs` 当时只校验
整包，一路报「包体 ✅ 15.0MB / 30MB」，毫无预警——脚本已修，现在两条线分开判。

```bash
node ci/release.mjs --build-only   # 出 release 包 + 整包/主包双重校验
```

主包 = 总包 − `subpackages/`。手动量：

```bash
python3 - <<'PY'
import subprocess
k=lambda p:int(subprocess.run(['du','-sk',p],capture_output=True,text=True).stdout.split()[0])
t,s=k('build/wechatgame'),k('build/wechatgame/subpackages')
print(f'总包 {t/1024:.2f}MB / 主包 {(t-s)/1024:.2f}MB（限额 4MB）')
PY
```

#### 两个有效手段（按收益排序）

**1. 裁引擎模块**（`settings/v2/packages/engine.json`）——收益最大

该文件初始是空的 `{"__version__": "1.0.12"}`，等于**打包全量引擎**：bullet（3D 物理）、
spine、dragon-bones、particle、terrain、tiled-map、physics-2d、rich-text、video、
webview 全都进包，而本项目是纯 2D UI，一个都没用到。裁到 13 个模块后
`cocos-js` **3.6MB → 1.4MB**、`assets/internal` 676KB → 168KB。

当前保留：`2d` / `ui` / `base` / `gfx-webgl` / `graphics` / `audio` / `tween` /
`profiler`（GameManager 调 `hideStats`）/ `affine-transform` / `ui-skew` /
`custom-pipeline` / `sorting-2d` / `intersection-2d`。

> ⚠️ 改法：**不要手写整个文件**。Cocos 构建时会把它重写成带 `cache` 块的完整结构，
> 真正生效的是 `modules.configs.default.cache.<模块>._value`，`includeModules`
> 只是列表。正确顺序是：先随便构建一次让 Cocos 生成 `cache` 骨架，再把不要的
> 模块 `_value` 改成 `false`。
>
> ⚠️ **关 `sorting-2d` 会整屏黑屏**，且无任何报错——详见「三·六」。裁完必须实跑。

**2. 压图**——把超大原图按「实际渲染尺寸 ×2」重采样，**保持 PNG 并做 8bit 量化**

> 🚨 **禁止用 WebP。微信小游戏不解 WebP，贴图会静默不显示。**
> 2026-08-16 实证：`main_bg` / `board-tray` / `order-card` / 四个图标共 9 张转 WebP 后，
> **微信里整片背景、棋盘木框、订单卡底、金币钻石图标全部消失**，
> 但**浏览器 web-mobile 包完全正常**——所以「压图后实跑验证」当时在浏览器里做，
> 没能暴露问题。console 零报错、`config.json` 注册正常、资源也确实打进包了，
> 纯粹是运行时解码不出来。已全部转回 PNG。
>
> 教训：**贴图格式的验证必须在微信开发者工具里做，浏览器不算数。**
> 这条和「裁引擎模块必须实跑」是同一类坑——静态检查与浏览器都看不出来。

正确做法是 PNG + `pngquant` 8bit 量化，压缩率接近 WebP 且微信原生支持：

```bash
sips -Z <目标长边> in.png --out tmp.png          # 等比缩到实际渲染尺寸 ×2
pngquant --quality=65-92 --speed 1 --strip \
  --force --output out.png tmp.png              # 8bit 调色板，保留 alpha
```

量化对本项目这种扁平卡通色几乎无损。2026-08-16 把 64 张 items/mothers/nav
贴图量化（此前从未压过），**1543KB → 573KB**，一次省出 969KB——
远超 9 张 WebP 转回 PNG 多付的 249KB，主包反而更小了。

已处理 7 张（原图尺寸远超渲染尺寸是通病，`energy_bolt` 尤其离谱——
2048×2048 只为渲染 30pt 图标）：

这 9 张先被缩到合理尺寸（原图尺寸远超渲染尺寸是通病，`energy_bolt` 尤其离谱——
2048×2048 只为渲染 30pt 图标），当时转成了 WebP，**2026-08-16 因微信不解 WebP
已全部转回 PNG 并量化**。末列是转回 PNG 后的最终体积：

| 图 | 原图 | 渲染 | 原始 → 现在（量化 PNG） |
|---|---|---|---|
| `main_bg` | 1536×2752 | 720×1280 | 4.8MB → 168KB |
| `order-card` | 928×1152 | 160×214 | 972KB → 17KB |
| `board-tray` | 677×965 | ~660×930 | 640KB → 102KB |
| `coin_single` | — | 图鉴 | — → 28KB |
| `energy_bolt` | 2048×2048 | 30 / 56 | 928KB → 2KB |
| `settings` | 1024×1024 | 44 | 640KB → 2KB |
| `lock` | 728×910 | 未引用 | 528KB → 3KB |
| `coin` | 768×768 | 30 / 56 | 456KB → 2KB |
| `diamond` | 768×768 | 30 / 56 | 148KB → 3KB |

改尺寸前先查代码里的实际渲染值（`ICON_SIZE` / `CARD_WIDTH` / `ITEM_BASE_SIZE` 等），
别照原图尺寸留余量。改大 UI 尺寸时记得回头重压对应贴图，否则会糊。

#### 当前水位与下一步

```
整包 2.77MB / 30MB ✅     主包 2.75MB / 4MB ✅（余量约 1.25MB）
```

余量已从 0.05MB 拉到 **1.25MB**——2026-08-16 把 64 张 items/mothers/nav 贴图
做 8bit 量化（此前从未压过）省下 969KB，同时 9 张 WebP 转回 PNG 多付 249KB，
净省约 720KB。**全项目已无 WebP。**

下一步仍建议把玩法专属资源挪进 bakery / blindbox / collection 三个分包——
目前分包只有几十 KB 代码、**零资源**，分包机制还没真正起作用。不过在那之前，
当前余量已足够支撑常规迭代。

> ⚠️ **量包体前必须用 CLI 重新构建一次**（`node ci/release.mjs --build-only`）。
> 用 Cocos 编辑器界面出的包**不吃 `engine.json` 的模块裁剪**——2026-08-16 实测，
> GUI 产物 `cocos-js` 仍是 3.4MB、主包 6.40MB，而同一份配置 CLI 出包只有 1.4MB /
> 3.44MB。看到主包突然变大，先确认产物是谁出的，别急着以为改动回退了。

## 四、判定「跑起来了」的标准

看微信开发者工具的**模拟器屏幕**：

- ✅ 成功：烘焙主题背景 ＋ 顶部金币 / 钻石 / 体力状态栏 ＋ 中间 7×9 棋盘（含母体物品）＋ 底部订单面板。点母体产出物品、拖同级物品合成，有反应即为活的。
- ❌ 失败：白屏/黑屏，或调试器 Console 出现**红色**报错（黄色 warning 通常不致命）。

真机预览（工具顶部「预览」→ 微信扫码）用于验证字体渲染、触感、性能、分享/广告。

**继承自抖音端的已验证经验**（大概率同样适用）：
- 小游戏 canvas **不渲染彩色 emoji**（显示成 `?`），UI 文案一律用文本/贴图（已按此实现）。
- 手写场景/prefab 的组件 `__type__` 必须用脚本 UUID 压缩 cid，不能用类名。

## 五、后续 TODO（按优先级）

1. ✅ CLI 构建已通过（资源导入无报错、type-check 全绿、`build/wechatgame/` 产物完整，Main.scene 在主包）。
2. ⬜ 安装微信开发者工具 → 导入 `build/wechatgame/` → 模拟器按「四」的标准验证主流程。
3. ✅ 服务端 `/auth/wechat` 登录接口已补（sweetie-merge-server 359c1fd）：jscode2session 换 openid → JWT，`deviceId = wx_${openid}`。服务端还需配置 `WECHAT_APPID` / `WECHAT_APP_SECRET` 环境变量才生效，未配置时返回 503、客户端降级用 code 作临时标识。
4. ✅ 真实 AppID 已落位：存放在 `wechat/project.private.config.json`（gitignored），`wechat/project.config.json` 保持占位值 `wx0000000000000000` 不动；每次构建后跑 `npm run sync-appid` 注入产物（脚本 `scripts/sync-appid.sh`，自身不含 AppID）。
5. ✅ bakery / blindbox / collection 三个分包已落地（2026-08-16）：`assets/bundles/` 下三个页面 + `project.json` Bundle 声明 + `builder.json` 的 `bundleConfig.custom.minigame_subpackage`，构建产物含 `subpackages/`。
   ⬜ **但分包目前只有代码、零资源**（各约 12KB），玩法专属贴图仍压在主包里——分包机制尚未真正发挥作用，见「三·八」。
6. ⬜ 广告位 ID（`setRewardedAdId` / `setInterstitialAdId`）与后端 API 地址（`setApiBaseUrl`）目前均未注入，广告与云存档在拿到配置前是降级状态；微信广告位需在公众平台开通流量主后创建。三个 setter 定义在 `platform/wechat.ts`，**当前全项目无人调用**。
7. ✅ release 包体已达标（2026-08-16）：整包 2.77MB / 30MB、主包 2.75MB / 4MB，手段见「三·八」。
   ✅ 主包余量 1.25MB（贴图量化后从 0.05MB 拉开）；把玩法资源挪进分包仍是后续优化项。
   ⬜ 上线前仍需确认 release 构建勾了 MD5 Cache。

> ⚠️ 以上「已完成」项**全部只经过 type-check 与浏览器 web 包验证**。
> 微信端至今**没有在真实 `wx.*` 环境里跑过一次**（第 2 项未做）。
> 抖音端的触摸失效、上下黑边、存档损坏三个坑都是模拟器实跑才暴露的——
> 引擎裁剪这类改动尤其需要在模拟器上复验一遍。
