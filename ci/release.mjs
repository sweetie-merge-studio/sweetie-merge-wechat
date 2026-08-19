#!/usr/bin/env node
/**
 * Sweetie Merge 小游戏发版编排脚本（仓库自适应：微信端 / 抖音端通用）
 *
 * 流程：preflight → type-check → Cocos CLI 出包（退出码 36 = 成功）→ 包体检查
 *       → 上传（微信 miniprogram-ci / 抖音 tma）→ 预览二维码
 *
 * 用法：
 *   node ci/release.mjs --check                 # 只做就绪度检查，不构建
 *   node ci/release.mjs --build-only            # 只出包（debug 包加 --debug）
 *   node ci/release.mjs -v 0.2.0 -c "改动说明"  # 完整发版：出包 + 上传 + 预览
 *   node ci/release.mjs -v 0.2.0 --skip-build   # 复用已有产物，只上传
 *
 * 凭证（都不入库）：
 *   微信：上传密钥文件 ~/.minigame-secrets/private.<appid>.key（或 WECHAT_KEY_PATH），
 *         另需在公众平台配置本机/CI 出口 IP 白名单
 *   抖音：tma login 登录态（或 tma set-app-config <appid> --token <token>）
 *   AppID：优先读环境变量 WECHAT_APPID / DOUYIN_APPID，缺省用 project.config.json 工作区值
 */

import { existsSync, readFileSync, statSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

// ---------- 常量 ----------

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COCOS_BIN =
  process.env.COCOS_CREATOR ??
  '/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator';
const COCOS_EXIT_SUCCESS = new Set([0, 36]); // 官方约定 36 = 构建成功
const COCOS_EXIT_HINTS = { 32: '构建参数不合法（查 platform 拼写 / configPath）', 34: '构建过程出错（查 temp/logs/project.log）' };
const BUILD_TIMEOUT_MS = 15 * 60 * 1000;

const PLATFORMS = {
  wechat: {
    label: '微信小游戏',
    cocosPlatform: 'wechatgame',
    configDir: 'wechat',
    totalLimitMB: 30,
    mainLimitMB: 4,
  },
  douyin: {
    label: '抖音小游戏',
    cocosPlatform: 'bytedance-mini-game',
    configDir: 'douyin',
    totalLimitMB: 20,
    mainLimitMB: 4,
  },
};

// ---------- 小工具 ----------

const log = (msg) => console.log(`[release] ${msg}`);
const fail = (msg) => {
  console.error(`\n[release] ❌ ${msg}`);
  process.exit(1);
};

function run(cmd, args, { timeout = 120_000, cwd = REPO_ROOT } = {}) {
  const r = spawnSync(cmd, args, { cwd, timeout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.error) return { code: -1, out: '', err: String(r.error.message ?? r.error) };
  return { code: r.status ?? -1, out: r.stdout ?? '', err: r.stderr ?? '' };
}

function dirSizeMB(dir) {
  // 不用 readdirSync 的 recursive/parentPath：那是 Node 20+ API，Node 16 会静默降级后在 join() 崩溃
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) bytes += dirSizeMB(full) * 1024 * 1024;
    else if (entry.isFile()) bytes += statSync(full).size;
  }
  return bytes / 1024 / 1024;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    fail(`读取 JSON 失败：${path}（${e.message}）`);
  }
}

// ---------- 平台识别与上下文 ----------

function detectPlatform() {
  for (const [key, p] of Object.entries(PLATFORMS)) {
    if (existsSync(join(REPO_ROOT, p.configDir, 'project.config.json'))) return key;
  }
  fail(`无法识别平台：${REPO_ROOT} 下既没有 wechat/ 也没有 douyin/ 平台配置目录`);
}

function buildContext(args) {
  const key = detectPlatform();
  const p = PLATFORMS[key];
  const projectConfig = readJson(join(REPO_ROOT, p.configDir, 'project.config.json'));
  const appid = (key === 'wechat' ? process.env.WECHAT_APPID : process.env.DOUYIN_APPID) || projectConfig.appid || '';
  return {
    key,
    ...p,
    appid,
    buildDir: join(REPO_ROOT, 'build', p.cocosPlatform),
    buildConfigPath: join(REPO_ROOT, 'ci', `buildConfig_${p.cocosPlatform}.json`),
    wechatKeyPath: process.env.WECHAT_KEY_PATH || join(homedir(), '.minigame-secrets', `private.${appid}.key`),
    version: args.version,
    desc: args.desc || `release ${args.version ?? ''}`.trim(),
    debug: args.debug,
  };
}

// ---------- 步骤 ----------

function stepPreflight(ctx, { forUpload }) {
  const problems = [];
  if (!existsSync(COCOS_BIN)) problems.push(`Cocos Creator 不存在：${COCOS_BIN}（可用环境变量 COCOS_CREATOR 覆盖）`);

  if (forUpload) {
    if (!ctx.appid) problems.push('AppID 为空：设置 WECHAT_APPID / DOUYIN_APPID 环境变量，或补齐 project.config.json');
    if (/^(wx|tt)0+$/.test(ctx.appid)) problems.push(`AppID 仍是占位值（${ctx.appid}），无法上传`);
    if (ctx.key === 'wechat') {
      if (!existsSync(ctx.wechatKeyPath)) problems.push(`微信上传密钥不存在：${ctx.wechatKeyPath}`);
      const probe = run('node', ['-e', "import('miniprogram-ci').then(()=>process.exit(0),()=>process.exit(1))"]);
      if (probe.code !== 0) problems.push('miniprogram-ci 未安装：npm i -D miniprogram-ci');
    } else {
      const probe = run('tma', ['--version']);
      if (probe.code !== 0) problems.push('tma（tt-ide-cli）不可用：npm i -g tt-ide-cli 并 tma login');
    }
  }
  return problems;
}

function stepTypeCheck() {
  if (!existsSync(join(REPO_ROOT, 'temp', 'tsconfig.cocos.json'))) {
    log('⚠️ 跳过 type-check：temp/tsconfig.cocos.json 不存在（构建时会自动生成）');
    return;
  }
  log('type-check…');
  const r = run('npm', ['run', 'type-check'], { timeout: 180_000 });
  if (r.code !== 0) fail(`type-check 未通过：\n${(r.out + r.err).split('\n').slice(-30).join('\n')}`);
  log('type-check ✅');
}

function stepBuild(ctx) {
  // release 包必须开 md5Cache（微信 CDN 缓存按文件名失效，不开会导致热更后玩家拿到旧资源）；
  // debug 包保持原文件名便于对着源码断点。用 buildConfig 文件时以该文件里的配置为准。
  const buildArg = existsSync(ctx.buildConfigPath)
    ? `configPath=${ctx.buildConfigPath}`
    : `platform=${ctx.cocosPlatform};debug=${ctx.debug}${ctx.debug ? '' : ';md5Cache=true'}`;
  log(`Cocos 出包（${buildArg}）… 预计 1-5 分钟`);
  const r = run(COCOS_BIN, ['--project', REPO_ROOT, '--build', buildArg], { timeout: BUILD_TIMEOUT_MS });
  if (!COCOS_EXIT_SUCCESS.has(r.code)) {
    const hint = COCOS_EXIT_HINTS[r.code] ?? '未知退出码';
    fail(`构建失败（exit ${r.code}：${hint}）\n最后输出：\n${(r.out + r.err).split('\n').slice(-15).join('\n')}`);
  }
  if (!existsSync(join(ctx.buildDir, 'game.json'))) {
    fail(`退出码 ${r.code} 但产物不完整：${ctx.buildDir} 缺 game.json`);
  }
  stripMiniprogramRoot(ctx);
  log(`构建 ✅（exit ${r.code}，产物 ${ctx.buildDir}）`);
}

// Cocos 生成的产物 project.config.json 会带 miniprogramRoot: ""，
// 微信开发者工具见到它就按小程序解析、去找 app.json，模拟器直接「启动失败」
// （实测 2026-08-19，Stable 1.06.2402040）。构建后一律剔除。
function stripMiniprogramRoot(ctx) {
  const configPath = join(ctx.buildDir, 'project.config.json');
  if (!existsSync(configPath)) return;
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  if (!('miniprogramRoot' in config)) return;
  const { miniprogramRoot, ...rest } = config;
  writeFileSync(configPath, JSON.stringify(rest, null, 2) + '\n');
  log('已剔除产物 project.config.json 的 miniprogramRoot（防开发者工具误判为小程序）');
}

/**
 * 包体检查：整包与主包分别判定。
 *
 * 主包（总包减去 subpackages/）才是卡提审的那条线——两端都是 4MB。
 * 只看整包会漏判：分包没装资源时，整包很宽松而主包早已超限。
 * 抖音特例：game.json 未声明分包时只有「整包 20MB」一条线，
 * 所以主包判线仅在产物存在 subpackages/ 时执行（微信必分包，不受影响）。
 */
function stepSizeCheck(ctx) {
  const totalMB = dirSizeMB(ctx.buildDir);
  const subDir = join(ctx.buildDir, 'subpackages');
  const hasSubpackages = existsSync(subDir);
  const subMB = hasSubpackages ? dirSizeMB(subDir) : 0;
  const mainMB = totalMB - subMB;

  const totalMsg = `整包 ${totalMB.toFixed(1)}MB / ${ctx.totalLimitMB}MB`;
  if (totalMB > ctx.totalLimitMB) {
    log(`⚠️ 整包超限：${totalMsg} — 查 assets/resources/ 与分包配置；debug 包偏大属正常`);
  } else {
    log(`整包 ✅ ${totalMsg}`);
  }

  if (!hasSubpackages) return log(`主包判线跳过：未配置分包，按整包 ${ctx.totalLimitMB}MB 一条线`);

  const mainMsg = `主包 ${mainMB.toFixed(2)}MB / ${ctx.mainLimitMB}MB（分包 ${subMB.toFixed(2)}MB）`;
  if (mainMB > ctx.mainLimitMB) {
    log(`⚠️ 主包超限：${mainMsg} — 提审会被拒。压图 / 裁引擎模块（settings/v2/packages/engine.json）/ 把玩法资源挪进分包`);
  } else {
    log(`主包 ✅ ${mainMsg}`);
  }
}

async function stepUploadWechat(ctx) {
  const ci = (await import('miniprogram-ci')).default;
  const project = new ci.Project({
    appid: ctx.appid,
    type: 'miniGame',
    projectPath: ctx.buildDir,
    privateKeyPath: ctx.wechatKeyPath,
    ignores: ['node_modules/**/*'],
  });
  log(`miniprogram-ci upload v${ctx.version}…`);
  await ci.upload({ project, version: ctx.version, desc: ctx.desc, robot: 1 });
  log('上传 ✅（小程序后台「版本管理」可见体验版）');
  const qr = join(ctx.buildDir, `preview-${ctx.version}.png`);
  await ci.preview({ project, qrcodeFormat: 'image', qrcodeOutputDest: qr, desc: ctx.desc });
  log(`预览二维码 ✅ ${qr}`);
}

function stepUploadDouyin(ctx) {
  log(`tma upload v${ctx.version}…`);
  let r = run('tma', ['upload', ctx.buildDir, '-v', ctx.version, '-c', ctx.desc], { timeout: 300_000 });
  if (r.code !== 0) fail(`tma upload 失败：\n${(r.out + r.err).slice(-1500)}\n（401/未登录先 tma logout 再 tma login）`);
  log('上传 ✅');
  r = run('tma', ['preview', ctx.buildDir], { timeout: 300_000 });
  if (r.code !== 0) log(`⚠️ tma preview 失败（上传不受影响）：${(r.out + r.err).slice(-500)}`);
  else console.log(r.out); // 二维码直接打在终端
}

// ---------- 参数解析与主流程 ----------

function parseArgs(argv) {
  const args = { debug: false, check: false, buildOnly: false, skipBuild: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-v' || a === '--version') args.version = argv[++i];
    else if (a === '-c' || a === '--desc') args.desc = argv[++i];
    else if (a === '--debug') args.debug = true;
    else if (a === '--check') args.check = true;
    else if (a === '--build-only') args.buildOnly = true;
    else if (a === '--skip-build') args.skipBuild = true;
    else if (a === '-h' || a === '--help') { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0] + '*/'); process.exit(0); }
    else fail(`未知参数：${a}（--help 查看用法）`);
  }
  if (!args.check && !args.buildOnly) {
    if (!args.version) fail('缺少版本号：-v 0.2.0（只想出包用 --build-only）');
    if (!/^\d+\.\d+\.\d+$/.test(args.version)) fail(`版本号格式应为 x.y.z：${args.version}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const ctx = buildContext(args);
  const forUpload = !args.buildOnly; // --check 也按完整发版口径体检

  log(`平台：${ctx.label}（${REPO_ROOT}）`);

  const problems = stepPreflight(ctx, { forUpload });
  if (args.check) {
    if (problems.length === 0) return log('就绪度 ✅ 构建与上传条件全部满足');
    console.log('\n[release] 就绪度检查发现以下缺口：');
    problems.forEach((p) => console.log(`  - ${p}`));
    process.exit(1);
  }
  if (problems.length > 0) fail(`前置条件不满足：\n  - ${problems.join('\n  - ')}\n（node ci/release.mjs --check 可单独体检）`);

  if (!args.skipBuild) {
    stepTypeCheck();
    stepBuild(ctx);
  } else if (!existsSync(join(ctx.buildDir, 'game.json'))) {
    fail(`--skip-build 但产物不存在：${ctx.buildDir}`);
  }
  stepSizeCheck(ctx);

  if (args.buildOnly) return log('done（--build-only，未上传）');
  if (ctx.key === 'wechat') await stepUploadWechat(ctx);
  else stepUploadDouyin(ctx);
  log(`done ✅ v${ctx.version} — 剩余人工环节：${ctx.key === 'wechat' ? '后台提审 + 发布' : '（可 tma audit 提审）后台发布'}`);
}

main().catch((e) => fail(e.stack ?? String(e)));
