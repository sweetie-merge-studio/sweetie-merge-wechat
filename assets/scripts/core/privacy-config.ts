/**
 * 隐私文档配置服务
 *
 * 隐私政策 / 用户协议的正文内容从后端服务获取，本地保留默认值作为 fallback。
 * 后端返回的 content 为 Cocos RichText 格式字符串（支持 <b> <color> <size> <br/> 等标签）。
 *
 * 后端 API 约定：
 *   GET /api/privacy/docs
 *   返回：{ success: true, data: { privacyPolicy: PrivacyDoc, userAgreement: PrivacyDoc, serviceTerms: PrivacyDoc, version: string } }
 *   serviceTerms 字段后端未返回时回退本地默认值（向后兼容）。
 */

import { get } from '../api/request';

export interface PrivacyDoc {
  /** 文档标题，如"隐私政策" */
  readonly title: string;
  /** 更新日期，如"2026年8月25日" */
  readonly updatedAt: string;
  /** RichText 格式正文（WebView 不可用时的降级展示） */
  readonly content: string;
  /** 可选：网页版 URL，配置后优先用 WebView 全屏打开 */
  readonly url?: string;
}

/** 弹窗主体简版摘要（三组列表，用户一眼能看懂的关键信息） */
export interface PrivacySummary {
  /** "我们收集的信息"列表项 */
  readonly collectItems: readonly string[];
  /** "我们不会"列表项 */
  readonly forbidItems: readonly string[];
  /** "您的权利"列表项 */
  readonly rightItems: readonly string[];
}

export interface PrivacyDocsConfig {
  readonly privacyPolicy: PrivacyDoc;
  readonly userAgreement: PrivacyDoc;
  readonly serviceTerms: PrivacyDoc;
  /** 弹窗主体简版摘要（可选，后端未返回时用本地默认值） */
  readonly summary?: PrivacySummary;
  /** 配置版本号，用于比对更新 */
  readonly version: string;
}

// ── 本地默认值（后端不可用时使用，RichText 格式） ──

const DEFAULT_PRIVACY: PrivacyDoc = {
  title: '隐私政策',
  updatedAt: '2026年8月25日',
  content: [
    '<color=#A0784C>更新日期：2026年8月25日</color><br/>',
    '<color=#6B4A2A>甜心合成乐园（以下简称"本游戏"）深知个人信息对您的重要性，我们将按照法律法规要求，采取相应安全保护措施，尽力保护您的个人信息安全可控。</color><br/>',
    '<b><color=#5C3A1E>一、我们收集的信息</color></b><br/>',
    '<color=#6B4A2A>1. 游戏存档数据：包括游戏进度、金币、钻石、物品收集等，存储于您的设备本地。</color><br/>',
    '<color=#6B4A2A>2. 设备与日志信息：包括设备型号、操作系统版本、游戏崩溃日志等，用于排查问题和优化体验。</color><br/>',
    '<color=#6B4A2A>3. 匿名行为数据：包括关卡完成、物品合成等游戏内操作统计，所有数据均经过匿名化处理。</color><br/>',
    '<b><color=#5C3A1E>二、信息的使用</color></b><br/>',
    '<color=#6B4A2A>我们仅将收集的信息用于：提供和维护游戏服务、优化游戏体验、排查技术问题、进行匿名数据分析。</color><br/>',
    '<b><color=#5C3A1E>三、信息的存储与保护</color></b><br/>',
    '<color=#6B4A2A>游戏存档数据存储于您的设备本地，我们不会将其上传至服务器。我们采用行业标准的安全措施保护您的信息。</color><br/>',
    '<b><color=#5C3A1E>四、您的权利</color></b><br/>',
    '<color=#6B4A2A>您有权随时访问、更正、删除您的个人信息，或撤回已给予的同意。您可以通过清除游戏数据来删除本地存档。</color><br/>',
    '<b><color=#5C3A1E>五、联系我们</color></b><br/>',
    '<color=#6B4A2A>如您对本隐私政策有任何疑问，请通过游戏内反馈渠道联系我们。</color>',
  ].join(''),
};

const DEFAULT_TERMS: PrivacyDoc = {
  title: '用户协议',
  updatedAt: '2026年8月25日',
  content: [
    '<color=#A0784C>更新日期：2026年8月25日</color><br/>',
    '<b><color=#5C3A1E>一、服务说明</color></b><br/>',
    '<color=#6B4A2A>甜心合成乐园是一款休闲合成类游戏。在使用本游戏前，请您仔细阅读本用户协议。</color><br/>',
    '<b><color=#5C3A1E>二、用户行为规范</color></b><br/>',
    '<color=#6B4A2A>1. 您承诺不利用本游戏进行任何违法违规活动。</color><br/>',
    '<color=#6B4A2A>2. 您不得通过外挂、作弊等不正当手段获取游戏资源。</color><br/>',
    '<color=#6B4A2A>3. 您不得干扰、破坏游戏的正常运行。</color><br/>',
    '<b><color=#5C3A1E>三、知识产权</color></b><br/>',
    '<color=#6B4A2A>本游戏的所有内容（包括但不限于美术资源、音乐、代码、游戏设计）均受知识产权法律保护，未经授权不得复制、传播或用于商业用途。</color><br/>',
    '<b><color=#5C3A1E>四、免责声明</color></b><br/>',
    '<color=#6B4A2A>因不可抗力、网络故障、设备问题等非我方原因导致的游戏中断或数据丢失，我方不承担责任。</color><br/>',
    '<b><color=#5C3A1E>五、协议变更</color></b><br/>',
    '<color=#6B4A2A>我们可能适时修订本协议，修订后的协议将在游戏内公布。继续使用游戏即视为您同意修订后的协议。</color>',
  ].join(''),
};

const DEFAULT_SERVICE_TERMS: PrivacyDoc = {
  title: '服务条款',
  updatedAt: '2026年8月27日',
  content: [
    '<color=#A0784C>更新日期：2026年8月27日</color><br/>',
    '<b><color=#5C3A1E>一、服务说明</color></b><br/>',
    '<color=#6B4A2A>甜心合成乐园是一款免费休闲合成游戏，通过微信小游戏平台提供，内容可能随版本调整。</color><br/>',
    '<b><color=#5C3A1E>二、使用规则</color></b><br/>',
    '<color=#6B4A2A>1. 请符合适用法律要求的年龄，未成年人请在监护人陪同下使用。</color><br/>',
    '<color=#6B4A2A>2. 本游戏不注册独立账号，身份信息由微信平台管理，我们不收集账号密码。</color><br/>',
    '<color=#6B4A2A>3. 请遵守微信平台规则，不得用于违法违规用途。</color><br/>',
    '<b><color=#5C3A1E>三、费用说明</color></b><br/>',
    '<color=#6B4A2A>1. 基础玩法完全免费。</color><br/>',
    '<color=#6B4A2A>2. 广告、钻石等辅助功能为可选项，非通关必需。</color><br/>',
    '<color=#6B4A2A>3. 钻石可免费获得，当前未开放真实货币内购。</color><br/>',
    '<b><color=#5C3A1E>四、变更与终止</color></b><br/>',
    '<color=#6B4A2A>1. 我们有权更新或下线游戏内容，将尽量提前公告。</color><br/>',
    '<color=#6B4A2A>2. 因维护、故障等原因可能暂停服务，将尽快修复。</color><br/>',
    '<color=#6B4A2A>3. 您可随时停止使用，清除本地数据可在设置中操作。</color><br/>',
    '<b><color=#5C3A1E>五、争议解决</color></b><br/>',
    '<color=#6B4A2A>本条款适用中国法律。因本条款或游戏产生的争议，双方优先协商；协商不成的，可向我方所在地法院提起诉讼。</color>',
  ].join(''),
};

// ── 弹窗主体简版摘要（用户一眼能看懂的关键信息，与完整文档保持一致） ──

const DEFAULT_SUMMARY: PrivacySummary = {
  collectItems: [
    '游戏进度与存档数据（本地存储）',
    '设备信息与性能数据（用于优化体验）',
    '匿名游戏行为统计（用于改进玩法）',
  ],
  forbidItems: [
    '收集您的真实姓名、手机号等身份信息',
    '向第三方出售您的个人数据',
    '在未经授权的情况下使用您的信息',
  ],
  rightItems: [
    '随时在设置中查看和管理数据偏好',
    '清除本地存档数据',
    '撤回已给予的同意',
  ],
};

const DEFAULT_CONFIG: PrivacyDocsConfig = {
  privacyPolicy: DEFAULT_PRIVACY,
  userAgreement: DEFAULT_TERMS,
  serviceTerms: DEFAULT_SERVICE_TERMS,
  summary: DEFAULT_SUMMARY,
  version: 'local-default',
};

// ── 运行时状态 ──

let _cached: PrivacyDocsConfig = DEFAULT_CONFIG;
let _fetching: Promise<PrivacyDocsConfig> | null = null;
let _fetched = false;

/** 是否已从后端成功获取过配置 */
export function isPrivacyConfigFetched(): boolean {
  return _fetched;
}

/** 获取当前隐私文档配置（优先使用已缓存的后端数据，否则返回本地默认值） */
export function getPrivacyDocs(): PrivacyDocsConfig {
  return _cached;
}

/** 获取指定类型的隐私文档 */
export function getPrivacyDoc(type: 'privacy' | 'terms' | 'service'): PrivacyDoc {
  if (type === 'privacy') return _cached.privacyPolicy;
  if (type === 'service') return _cached.serviceTerms;
  return _cached.userAgreement;
}

/** 获取弹窗主体简版摘要（后端未配置或字段不完整时回退本地默认值） */
export function getPrivacySummary(): PrivacySummary {
  const s = _cached.summary;
  if (!s) return DEFAULT_SUMMARY;
  // 防御：后端可能返回部分字段缺失的 summary 对象（如 {}），
  // ?? 只判空不判字段完整性，这里逐项校验，缺哪项补哪项，
  // 避免下游 _buildSection 中 items.forEach 抛 TypeError 导致整个弹窗内容+按钮渲染中断。
  const collectItems = Array.isArray(s.collectItems) ? s.collectItems : DEFAULT_SUMMARY.collectItems;
  const forbidItems = Array.isArray(s.forbidItems) ? s.forbidItems : DEFAULT_SUMMARY.forbidItems;
  const rightItems = Array.isArray(s.rightItems) ? s.rightItems : DEFAULT_SUMMARY.rightItems;
  if (
    collectItems === s.collectItems &&
    forbidItems === s.forbidItems &&
    rightItems === s.rightItems
  ) {
    return s;
  }
  return { collectItems, forbidItems, rightItems };
}

/**
 * 从后端获取隐私文档配置。
 * - 成功：缓存并返回新配置
 * - 失败：静默降级到本地默认值，不抛出异常
 * - 并发调用共享同一个 Promise
 */
export function fetchPrivacyDocs(): Promise<PrivacyDocsConfig> {
  if (_fetching) return _fetching;

  _fetching = get<PrivacyDocsConfig>('/privacy/docs', {
    noAuth: true,
    timeout: 8000,
    offlineSilent: true,
  })
    .then(data => {
      if (data && data.privacyPolicy && data.userAgreement) {
        // 显式构造缓存对象：后端未返回的字段回退本地默认值（向后兼容）
        _cached = {
          privacyPolicy: data.privacyPolicy,
          userAgreement: data.userAgreement,
          serviceTerms: data.serviceTerms ?? DEFAULT_SERVICE_TERMS,
          summary: data.summary ?? DEFAULT_SUMMARY,
          version: data.version,
        };
        _fetched = true;
      }
      _fetching = null;
      return _cached;
    })
    .catch(() => {
      // 后端不可用，保持本地默认值
      _fetching = null;
      return _cached;
    });

  return _fetching;
}
