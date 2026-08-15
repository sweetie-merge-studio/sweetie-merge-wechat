# 运行手册（微信端，2026-08-15）

> 这份文档回答：**这个游戏到底怎么跑起来**。
> 本仓库由抖音端（`sweetie-merge-douyin`）移植而来，工具认知与流程同构，平台工具换成微信系。
> 抖音端踩过的坑与认知复盘见该仓库的 `docs/RUNBOOK.md`，此处只保留对微信端仍然适用的部分。

## 一、当前状态（TL;DR）

| 环节 | 状态 |
|------|------|
| 代码移植（`tt.*` → `wx.*`、平台层 / API 层 / 接线） | ✅ 完成 |
| TypeScript 类型检查 | ✅ 通过（需先用 Cocos 打开工程生成 `temp/`） |
| 用 Cocos Creator 打开工程（生成 library/temp/meta） | ✅ 完成（CLI 构建时自动导入，2026-08-15） |
| Cocos 构建微信小游戏包 | ✅ 通过（CLI，debug 包 19MB，产物在 `build/wechatgame/`；退出码 36 但日志全部 success，与抖音端怪象一致） |
| 微信开发者工具安装 + 导入验证 | ⬜ 未做（本机未安装；首次需微信扫码登录，只能人工操作） |
| 真实 AppID 申请 | ⬜ 未做（Cocos 构建产物暂用其默认测试 appid `wx6ac3f5090a6b99c5`） |

**下一步只有一件事**：安装微信开发者工具 → 导入 `build/wechatgame/`（选「小游戏」，可用测试号）→ 模拟器按「四」的标准验证。

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

3. 微信开发者工具里项目会自动检测变更重新编译（没反应就点「编译」按钮）。
4. 首次使用：导入 → 小游戏 → 目录 `build/wechatgame` → 测试号（工具支持「使用测试号」免注册体验）→ 不使用云服务。

> 抖音端已知怪象（微信端待验证）：CLI 构建退出码非 0（抖音端为 36），但日志显示全部任务 success、产物完整可用。**以日志和产物为准**。

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
4. ⬜ 申请真实 AppID 后替换 `wechat/project.config.json` 占位值（**不要 commit 真实 AppID**）。
5. ⬜ `wechat/game.json` 声明的 bakery / blindbox / collection 三个分包，Cocos 侧场景与 Bundle 尚未创建（逻辑已在 `core/`），不阻塞运行。
6. ⬜ 广告位 ID（`setRewardedAdId` / `setInterstitialAdId`）与后端 API 地址（`setApiBaseUrl`）目前均未注入，广告与云存档在拿到配置前是降级状态；微信广告位需在公众平台开通流量主后创建。
7. ⬜ 上线前改 release 构建（勾 MD5 + 压缩引擎）；主包 ≤ 4MB、总包 ≤ 30MB，超限先查 `assets/sprites/` 与分包配置。
