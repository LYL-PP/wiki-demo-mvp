'use strict';

// 只编写、静态检查；主代理确认源码就绪后才使用 --source-ready。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const ROOT = 'C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25';
const APP = path.join(ROOT, 'wiki-demo-mvp');
const SELF = '.playwright-cli/test-knowledge-introduction.cjs';
const REPORT = 'outputs/wiki-knowledge-introduction-tests.json';
const SHOT = 'outputs/知识Wiki内容简介-本地.png';
const ORIGIN = 'http://127.0.0.1:19431';
const MODULES = ['index.html', 'semantic-tags.js', 'pipeline.js', 'file-manager.js', 'prompt-history.js'];
const OLD_TESTS = ['.playwright-cli/test-topic-product-gate.cjs', '.playwright-cli/test-run-timing.cjs'];
const OUTPUT_ALLOWLIST = new Set([REPORT, SHOT]);
const cases = [], network = [], pageErrors = [], dialogs = [], loaded = [], contexts = [];
const report = {
  kind: '知识库概览内容简介：真实五资源、隔离 SDK、人工浏览器内存夹具；非生成式推理',
  startedAt: new Date().toISOString(), modules: MODULES, script: SELF,
  tests: [], harnessErrors: [], network, pageErrors, dialogs, responsive: [], clickAudit: [], artifacts: [],
  node: { executable: process.execPath, version: process.version },
  isolation: {
    origin: ORIGIN, ephemeralContext: true, serviceWorkers: 'block', continuedRequests: 0,
    realCloudRequests: 0, realModelCalls: 0, oldTestsExecuted: 0,
    reusedHarness: '只读取旧文件，提取 test-run-timing.cjs 的纯 installMock；不 require、导入或执行旧专项',
    modelAttempts: 0, sdkWriteAttempts: 0, blockedWebSockets: 0
  },
  assumptions: [
    'knowledgeIntroduction 返回完整的未 HTML 编码数据；items 用稳定 ID 表示已保存实体，预览截短由 renderer 完成。',
    '同一实体跨话题只进入一个 section；同名不同稳定 ID 保留现有 disambiguator。',
    '未规定新 section/item 的 DOM 标签或 data 属性，测试从实际返回对象和正文内容核对，不猜新增选择器。',
    '预览最多三个内容组；超过三个组或长摘要需原生 details[data-introduction-expand] 展开全文。',
    '全文可同时包含前三组的重复预览，跨话题去重以实际函数中的精确 ID 为准，不把预览与全文两份 DOM 误判为重复实体。',
    '只使用当前已保存工作簿，夹具可补充 ET-PROD-GAME、ET-CONTENT-SKILL 两种 active 类型。'
  ]
};
let active = null, browser = null, page = null, sources = null, before = null;
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sorted = values => [...values].sort();
const items = model => model.sections.flatMap(section => section.items);
const ids = model => items(model).map(item => item.id);
const modelText = model => JSON.stringify(model);
const contains = (text, value) => String(text).includes(value);

// 不预加计划断言数：只在 Node assert 真正调用时递增，失败后未到达的断言不计数。
const A = new Proxy(assert, { get(target, key) {
  if (typeof target[key] !== 'function') return target[key];
  return (...args) => {
    if (!active) throw Error('断言必须属于已开始执行的场景');
    active.assertions++;
    try { const result = target[key](...args); active.passedAssertions++; return result; }
    catch (error) { active.failedAssertions++; throw error; }
  };
} });
function define(id, name, run, options = {}) { cases.push({ id, name, run, ...options }); }
function fingerprints(directory, excluded = new Set(), prefix = '') {
  const result = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix + entry.name, full = path.join(directory, entry.name);
    if (excluded.has(relative)) continue;
    if (entry.isSymbolicLink()) result[relative] = 'symlink:' + fs.readlinkSync(full);
    else if (entry.isDirectory()) Object.assign(result, fingerprints(full, excluded, relative + '/'));
    else if (entry.isFile()) result[relative] = sha(fs.readFileSync(full));
  }
  return result;
}
function captureFingerprints() {
  return {
    application: fingerprints(APP),
    oldTests: Object.fromEntries(OLD_TESTS.map(name => [name, sha(fs.readFileSync(path.join(ROOT, name)))])),
    protectedWorkspace: fingerprints(ROOT, OUTPUT_ALLOWLIST)
  };
}
function allowedOutput(relative) {
  if (!OUTPUT_ALLOWLIST.has(relative)) throw Error('拒绝写入非允许输出：' + relative);
  const absolute = path.join(ROOT, relative);
  if (!fs.statSync(path.dirname(absolute)).isDirectory()) throw Error('允许输出的父目录不存在');
  return absolute;
}
function shape(model) {
  A.equal(typeof model, 'object'); A.notEqual(model, null);
  A.equal(typeof model.lead, 'string'); A.ok(model.lead.trim().length > 0);
  A.ok(Array.isArray(model.sections));
  for (const section of model.sections) {
    A.equal(typeof section.title, 'string'); A.ok(section.title.trim().length > 0);
    A.equal(typeof section.description, 'string'); A.ok(Array.isArray(section.items));
    for (const item of section.items) for (const key of ['id', 'name', 'disambiguator', 'summary']) A.equal(typeof item[key], 'string', key);
  }
}
function exactCoverage(model, entities) {
  const unique = new Map(entities.map(entity => [entity.id, entity]));
  A.deepEqual(sorted(ids(model)), sorted(unique.keys()), '完整简介应覆盖已保存实体，稳定 ID 不遗漏、不重复');
  A.equal(new Set(ids(model)).size, ids(model).length, '跨内容组不重复稳定 ID');
  for (const item of items(model)) {
    const entity = unique.get(item.id);
    A.ok(entity, '不可编造实体 ID：' + item.id);
    A.equal(item.name, entity.name); A.equal(item.summary, entity.summary);
    A.equal(item.disambiguator, entity.disambiguator || '');
  }
}
const introLocator = p => p.locator('#entityDetail .overview-lead .overview-introduction, #entityDetail .overview-lead [data-knowledge-introduction]').first();
const expansionLocator = p => introLocator(p).locator('details[data-introduction-expand]').first();
async function seed(p, mode = 'full') { return p.evaluate(mode => knowledgeIntroductionFixtures.seed(mode), mode); }
async function inspect(p) { return p.evaluate(() => knowledgeIntroductionFixtures.inspect()); }
async function assertRendered(p, model, { full = true } = {}) {
  A.equal(await introLocator(p).count(), 1);
  if (full && await expansionLocator(p).count() && !await expansionLocator(p).evaluate(element => element.open)) {
    await expansionLocator(p).locator(':scope > summary').click();
    A.equal(await expansionLocator(p).evaluate(element => element.open), true);
  }
  const text = await introLocator(p).innerText();
  for (const section of model.sections) {
    A.ok(contains(text, section.title), '正文缺内容组标题：' + section.title);
    if (full && section.description) A.ok(contains(text, section.description), '全文缺话题描述');
    for (const item of section.items) {
      A.ok(contains(text, item.name), '正文缺实体名称：' + item.id);
      if (full && item.summary) A.ok(contains(text, item.summary), '全文缺实体摘要：' + item.id);
      if (item.disambiguator) A.ok(contains(text, item.disambiguator), '正文缺同名消歧：' + item.id);
    }
  }
  return text;
}
async function diagnostic(p) {
  if (!p || p.isClosed()) return null;
  return p.evaluate(() => ({
    intro: typeof knowledgeIntroduction === 'function' ? knowledgeIntroduction() : null,
    entities: allEntities().map(e => ({ id: e.id, name: e.name, topics: e.topics, primaryTopic: e.primaryTopic })),
    browseTopics: browseTopics().map(t => t.id), filters: knowledgeFilterKey(),
    detail: document.getElementById('entityDetail').innerText.slice(0, 6000),
    audit: window.knowledgeIntroductionAudit, width: innerWidth, documentWidth: document.documentElement.scrollWidth
  })).catch(error => ({ error: error.message }));
}
async function execute(test, p) {
  const entry = active = { id: test.id, name: test.name, executed: true, assertions: 0, passedAssertions: 0, failedAssertions: 0 };
  try {
    if (!test.noSeed) await seed(p, test.mode || 'full');
    const details = await test.run(p);
    entry.status = 'passed'; entry.pass = true;
    if (details !== undefined) entry.details = details;
  } catch (error) {
    entry.status = 'failed'; entry.pass = false; entry.reason = error.message; entry.stack = error.stack;
    entry.diagnostic = await diagnostic(p);
    console.error('失败 ' + entry.id + '：' + error.message);
  } finally { report.tests.push(entry); active = null; }
}

// 与 installMock 在同一条 init script 顺序安装，避免多个 addInitScript 的执行顺序未定义。
function installIntroductionIsolation() {
  const audit = window.knowledgeIntroductionAudit = {
    factories: 0, readQueries: [], sdkWriteAttempts: [], modelAttempts: [], modelCatalogueReads: 0,
    deniedWorkers: [], forbiddenFetches: [], wsAttempts: [], fetches: []
  };
  const factory = WorkBuddyCloud.createWorkBuddyCloud;
  WorkBuddyCloud.createWorkBuddyCloud = function (...args) {
    audit.factories++;
    const client = factory(...args), from = client.database.from.bind(client.database);
    client.llm.chat.completions.create = function () {
      audit.modelAttempts.push({ method: 'chat.completions.create', at: performance.now() });
      throw Error('本专项禁止模型调用，模拟模型也不得运行');
    };
    client.llm.models.list = async () => {
      audit.modelCatalogueReads++;
      return [{ id: 'mock-introduction', name: 'GLM 5.3 Flash', enabled: true }];
    };
    client.database.from = table => {
      audit.readQueries.push({ table, at: performance.now() });
      const query = from(table);
      for (const operation of ['insert', 'update', 'upsert', 'delete']) query[operation] = function () {
        audit.sdkWriteAttempts.push({ table, operation, at: performance.now() });
        throw Error('本专项禁止 SDK 写入：' + table + '.' + operation);
      };
      return query;
    };
    return client;
  };
  const originalFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, location.href);
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    audit.fetches.push({ url: url.href, method });
    if (url.origin !== location.origin || method !== 'GET') {
      audit.forbiddenFetches.push({ url: url.href, method });
      return Promise.reject(Error('本专项禁止外部 fetch 或写请求'));
    }
    return originalFetch(input, init);
  };
  for (const name of ['Worker', 'SharedWorker']) if (typeof window[name] === 'function') window[name] = class {
    constructor() { audit.deniedWorkers.push(name); throw Error('本专项禁止启动未隔离 worker'); }
  };
}

function installIntroductionFixtures() {
  const f = window.knowledgeIntroductionFixtures = {};
  f.baseWorkbook = structuredClone(savedWorkbook);
  f.topic = (id, name, desc) => ({ id, name, desc, scope: '人工本地隔离范围｜' + id, preview: true });
  f.detail = (dimension, value, quote, extra = {}) => ({
    dimension, value, basis: 'explicit', quote, reason: '',
    evidences: [{ exact_quote: quote, start: 0, end: quote.length }], ...extra
  });
  f.entity = (id, name, topic = null, extra = {}) => ({
    id, name, disambiguator: '', summary: '人工实体摘要｜' + id + '｜保存知识的具体说明。',
    aliases: [], primaryTopic: topic, topics: topic ? [topic] : [], preview: true,
    tags: { type: ['技能'], typeId: 'ET-CONTENT-SKILL' }, candidateTags: [], reviewReasons: [],
    suggestedFacets: { product: [], discipline: [], version: [] }, semanticFacetDetails: [], semanticFacetsRecognized: true,
    sources: [{ fileId: 'F-' + id, file: '人工隔离来源.txt', revision: 1, quote: '人工具名对象的来源证据｜' + id }],
    facts: ['人工具名对象来源｜' + id], relations: [], ...extra
  });
  f.pack = mode => {
    if (mode === 'empty') return { topics: [], entities: [] };
    if (mode === 'orphan-only') return { topics: [f.topic('T-EMPTY', '孤立话题不可进入简介', '孤立描述不可进入简介｜ORPHAN-DESC')], entities: [] };
    if (mode === 'games') return {
      topics: [f.topic('T-GAMES', '人工游戏专属话题', '有游戏实体的话题描述｜GAMES-DESC')],
      entities: [f.entity('G-ONLY1', '人工游戏甲', 'T-GAMES', { tags: { type: ['游戏产品'], typeId: 'ET-PROD-GAME' } }),
        f.entity('G-ONLY2', '人工游戏乙', 'T-GAMES', { tags: { type: ['游戏产品'], typeId: 'ET-PROD-GAME' } })]
    };
    if (mode === 'no-topics') return { topics: [], entities: [f.entity('E-NOTOPIC1', '无话题人工实体甲'), f.entity('E-NOTOPIC2', '无话题人工实体乙')] };
    if (mode === 'invalid-topics') return {
      topics: [f.topic('T-EMPTY', '无有效引用的孤立话题', '无有效引用的孤立摘要')],
      entities: [f.entity('E-INVALID', '仅无效话题引用的人工实体', 'T-UNKNOWN', { topics: ['T-UNKNOWN', 'T-MISSING'] })]
    };
    if (mode === 'unconfirmed') return {
      topics: [f.topic('T-PENDING', '人工待确认类型话题', '有实体但不可浏览的话题摘要｜PENDING-DESC')],
      entities: [f.entity('E-PENDING', '人工未确认类型对象', 'T-PENDING', { tags: { type: [], typeId: null }, typeIssue: { reason: '主类型待确认' } })]
    };
    const topics = [
      f.topic('T-COMBAT', '人工战斗机制内容组', '人工话题摘要｜COMBAT-DESC｜技能效果与战斗反馈。'),
      f.topic('T-GROWTH', '人工成长机制内容组', '人工话题摘要｜GROWTH-DESC｜能力成长与资源消耗。'),
      f.topic('T-WORLD', '人工世界交互内容组', '人工话题摘要｜WORLD-DESC｜对象交互与场景探索。'),
      f.topic('T-CRAFT', '人工制作机制内容组', '人工话题摘要｜CRAFT-DESC｜材料与制作动作。'),
      f.topic('T-HIDDEN', '人工游戏及待确认话题', '存在成员的非浏览话题摘要｜HIDDEN-DESC'),
      f.topic('T-EMPTY', '孤立话题不可进入简介', '孤立描述不可进入简介｜ORPHAN-DESC')
    ];
    const product = '人工产品证据甲KI', quote = product + '包含此具名能力。';
    const entities = [
      f.entity('E-A', '人工战斗能力甲', 'T-COMBAT', {
        semanticFacetDetails: [f.detail('product', product, quote), f.detail('discipline', '策划', '策划描述此具名能力。'), f.detail('version', '人工版本V9', '人工版本V9适用此能力。')],
        suggestedFacets: { product: [product], discipline: ['策划'], version: ['人工版本V9'] },
        relations: [{ type: '人工关联', targetId: 'E-B', targetName: '人工成长能力乙', strength: 'weak', evidence: '人工关系证据' }]
      }),
      f.entity('E-B', '人工成长能力乙', 'T-GROWTH'), f.entity('E-C', '人工世界能力丙', 'T-WORLD'), f.entity('E-D', '人工制作能力丁', 'T-CRAFT'),
      f.entity('E-CROSS', '人工跨话题唯一对象', 'T-COMBAT', { topics: ['T-COMBAT', 'T-GROWTH', 'T-COMBAT'] }),
      f.entity('E-SAME1', '人工同名能力', 'T-COMBAT', { disambiguator: '人工身份甲｜近战能力' }),
      f.entity('E-SAME2', '人工同名能力', 'T-GROWTH', { disambiguator: '人工身份乙｜成长能力' }),
      f.entity('G-HIDDEN', '人工保留游戏产品', 'T-HIDDEN', { tags: { type: ['游戏产品'], typeId: 'ET-PROD-GAME' } }),
      f.entity('E-PREFER', '人工优先浏览主题对象', 'T-HIDDEN', { topics: ['T-HIDDEN', 'T-COMBAT'], tags: { type: [], typeId: null }, typeIssue: { reason: '主类型待确认' } }),
      f.entity('E-FALLBACK', '人工无有效话题对象', 'T-UNKNOWN', { topics: ['T-UNKNOWN'] })
    ];
    if (mode === 'long') {
      for (let n = 0; n < 5; n++) {
        const id = 'T-LONG' + n;
        topics.push(f.topic(id, '人工超长组' + n + '｜' + 'LongUnbrokenTopicTitle'.repeat(9), '长话题开始｜' + n + '｜' + '原文说明与边界。'.repeat(65) + '｜长话题结尾标记' + n));
        for (let i = 0; i < 4; i++) entities.push(f.entity('E-LONG' + n + '-' + i, '人工超长实体' + n + '-' + i + '｜' + 'UnbrokenEntityName'.repeat(8), id, {
          summary: '长实体摘要开始｜' + n + '-' + i + '｜' + 'LongUnbrokenSummary'.repeat(42) + '｜长实体结尾标记' + n + '-' + i,
          disambiguator: '人工超长消歧｜' + 'UnbrokenIdentity'.repeat(10)
        }));
      }
    }
    return { topics, entities };
  };
  f.commit = pack => {
    const topics = structuredClone(pack.topics), entities = structuredClone(pack.entities), files = [];
    const owners = new Map();
    for (const entity of entities) for (const source of entity.sources || []) {
      const key = source.fileId;
      if (!owners.has(key)) owners.set(key, []);
      owners.get(key).push(entity);
    }
    for (const [id, owned] of owners) {
      const text = owned.flatMap(e => [e.summary, ...e.sources.map(s => s.quote), ...semanticFacetStorage(e).facetDetails.map(d => d.quote)]).filter(Boolean).join('\n');
      files.push({ id, name: '人工隔离来源｜' + id + '.txt', originalName: '人工隔离来源｜' + id + '.txt', text, size: text.length,
        revision: 1, createdAt: '2026-10-14T00:00:00Z', updatedAt: '2026-10-14T00:00:00Z', status: '已解析' });
    }
    if (!files.length && topics.length) files.push({ id: 'F-ORPHAN', name: '人工孤立话题来源.txt', originalName: '人工孤立话题来源.txt', text: '人工孤立话题', size: 8, revision: 1, status: '已解析' });
    for (const topic of topics) {
      const ownerIds = [...new Set(entities.filter(e => [...(e.topics || []), e.primaryTopic].includes(topic.id)).flatMap(e => e.sources.map(s => s.fileId)))];
      const data = structuredClone(topic); delete data.fileContributions;
      topic.fileContributions = (ownerIds.length ? ownerIds : files.slice(0, 1).map(file => file.id)).map(fileId => ({ fileId, revision: 1, data: structuredClone(data) }));
    }
    for (const entity of entities) {
      const data = structuredClone(entity); delete data.fileContributions;
      entity.fileContributions = [...new Set(entity.sources.map(source => source.fileId))].map(fileId => ({ fileId, revision: 1, data: structuredClone(data) }));
    }
    commitFileWorkspace(files, topics, entities);
    renderKnowledge(); renderFiles();
    return { topics: structuredClone(allTopics()), entities: structuredClone(allEntities()) };
  };
  f.seed = (mode = 'full') => {
    savedWorkbook = structuredClone(f.baseWorkbook); draftWorkbook = structuredClone(f.baseWorkbook);
    workbookReady = true; workbookRowId = 1; workbookRevision = 1; workbookDraftRevision = 1;
    workbookDirty = false; workbookBusy = false;
    knowledgeNav.topicId = null; knowledgeNav.expanded.clear(); state.selectedEntity = null; state.relatedDetailId = null;
    for (const key of ['topic', 'type', 'product', 'discipline', 'version', 'candidate']) state.filters[key].clear();
    state.filters.relation = ''; document.getElementById('entitySearch').value = '';
    const result = f.commit(f.pack(mode));
    setPage('knowledge'); openKnowledgeOverview();
    document.querySelector('details.browse-filters').open = false;
    document.getElementById('topicStrip').scrollTop = 0; window.scrollTo(0, 0);
    return result;
  };
  f.replaceEntity = (id, changes) => {
    const entities = structuredClone(allEntities()), target = entities.find(entity => entity.id === id);
    Object.assign(target, structuredClone(changes));
    const data = structuredClone(target); delete data.fileContributions;
    target.fileContributions = target.fileContributions.map(contribution => ({ ...contribution, data: structuredClone(data) }));
    commitFileWorkspace(state.files, state.previewTopics, entities); renderKnowledge();
  };
  f.memory = () => ({
    files: JSON.stringify(state.files), topics: JSON.stringify(state.previewTopics), entities: JSON.stringify(state.previews),
    workspace: fileWorkspaceRaw, savedWorkbook: JSON.stringify(savedWorkbook), draftWorkbook: JSON.stringify(draftWorkbook),
    promptState: JSON.stringify([state.baselinePrompts, state.prompts]), promptRows: JSON.stringify(timingMock.promptRows),
    storage: Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]))
  });
  f.inspect = () => {
    const model = knowledgeIntroduction(), html = renderKnowledgeIntroduction();
    const root = document.querySelector('#entityDetail .overview-lead .overview-introduction') || document.querySelector('#entityDetail .overview-lead [data-knowledge-introduction]');
    const preview = root?.cloneNode(true); preview?.querySelectorAll('details[data-introduction-expand]').forEach(node => node.remove());
    const template = document.createElement('template'); template.innerHTML = html;
    return {
      model, html, renderedText: root?.textContent || '', previewText: preview?.querySelector('.introduction-preview')?.textContent || '',
      renderedHTML: root?.innerHTML || '', pureHTMLText: template.content.textContent,
      entities: structuredClone(allEntities()), topics: structuredClone(allTopics()), browse: browseTopics().map(t => t.id),
      rows: [...document.querySelectorAll('#entityRows [data-entity]')].map(node => node.dataset.entity),
      filters: knowledgeFilterKey(), expansionCount: root?.querySelectorAll('details[data-introduction-expand]').length || 0
    };
  };
}

function extractMock() {
  const old = fs.readFileSync(path.join(ROOT, OLD_TESTS[1]), 'utf8');
  const start = old.indexOf('function installMock(){'), end = old.indexOf('\nlet browser,shotPage;', start);
  if (start < 0 || end <= start) throw Error('installMock 提取边界失效；拒绝执行旧脚本');
  let code = old.slice(start, end).trimEnd();
  if (!code.endsWith('}') || /\brequire\s*\(|chromium\s*\.\s*launch|process\.|child_process/.test(code)) throw Error('提取内容不再是纯 installMock 函数');
  const validation = new vm.Script('(' + code + '\n)', { filename: '只读提取的-installMock' });
  const extractedFunction = validation.runInNewContext(Object.create(null), { timeout: 1000 });
  if (typeof extractedFunction !== 'function' || extractedFunction.toString().trim() !== code.trim()) throw Error('提取范围存在额外顶层执行内容');
  const needle = "'active','玩家角色']]},";
  if (code.split(needle).length !== 2) throw Error('词表 fixture 插入边界不唯一；不修改旧文件');
  const rows = [
    ['ET-PROD-GAME', '产品', '游戏产品', '可独立指代的交互游戏作品。', '人工游戏甲', '具体能力不属于游戏产品本体。', '按具名产品身份赋值', 'active', '交互游戏作品'],
    ['ET-CONTENT-SKILL', '玩法内容', '技能', '可施放的具体具名能力。', '人工战斗能力甲', '能力管理系统与游戏产品本体不属于具体能力。', '按最具体具名能力赋值', 'active', '具体技能;具名能力']
  ];
  code = code.replace(needle, "'active','玩家角色']," + rows.map(row => JSON.stringify(row)).join(',') + ']},');
  code += '\ninstallMock();\n(' + installIntroductionIsolation.toString() + ')();';
  new vm.Script(code, { filename: '新专项隔离初始化' });
  report.harnessExtraction = { oldFile: OLD_TESTS[1], sourceHash: sha(old), extractedHash: sha(code), pureFunctionOnly: true, oldScriptExecuted: false };
  return code;
}
async function session(mockCode) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, serviceWorkers: 'block', acceptDownloads: false });
  contexts.push(context);
  if (typeof context.routeWebSocket !== 'function') throw Error('Playwright 不支持 WebSocket route，无法保证全网络隔离；拒绝启动页面');
  await context.addInitScript({ content: mockCode });
  await context.routeWebSocket('**/*', socket => { report.isolation.blockedWebSockets++; socket.close(); });
  const workbookMatch = sources['index.html'].match(/const\s+WORKBOOK_ASSET\s*=\s*['"]([^'"]+)['"]/);
  if (!workbookMatch) throw Error('无法识别词表资产路径；不猜测真实资源');
  const workbookPath = new URL(workbookMatch[1], ORIGIN + '/').pathname;
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    const entry = { method: request.method(), url: request.url(), resourceType: request.resourceType(), action: '' }; network.push(entry);
    if (request.method() === 'GET' && url.origin === ORIGIN) {
      const name = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      if (Object.hasOwn(sources, name)) {
        entry.action = '真实五资源'; loaded.push(name);
        return route.fulfill({ contentType: name.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript; charset=utf-8', body: sources[name] });
      }
      if (url.pathname === workbookPath) {
        entry.action = '人工词表资产';
        return route.fulfill({ contentType: 'application/octet-stream', body: Buffer.from('mock-workbook') });
      }
    }
    if (request.method() === 'GET' && url.origin !== ORIGIN && request.resourceType() === 'script') {
      entry.action = '外部脚本空替身'; return route.fulfill({ contentType: 'application/javascript', body: '' });
    }
    if (request.method() === 'GET' && url.origin === ORIGIN && url.pathname === '/favicon.ico') {
      entry.action = '本地空图标'; return route.fulfill({ status: 204, body: '' });
    }
    entry.action = '禁止网络'; return route.abort('blockedbyclient');
  });
  const p = await context.newPage(); p.setDefaultTimeout(10000);
  p.on('pageerror', error => pageErrors.push(error.message));
  p.on('dialog', async dialog => { dialogs.push({ type: dialog.type(), message: dialog.message(), allowed: false }); await dialog.dismiss(); });
  await p.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => workbookReady && !cloudLoading && fileManagerReady && wikiPromptHistory.getController().status().ready);
  await p.evaluate(installIntroductionFixtures);
  return p;
}

// 函数对象和渲染都来自真实源码；人工夹具只给已保存数据，不代写简介逻辑。
define('H01', '真实函数契约、五资源与人工 active 类型词表有效', async p => {
  const result = await p.evaluate(() => ({
    helper: typeof knowledgeIntroduction, renderer: typeof renderKnowledgeIntroduction,
    model: knowledgeIntroduction(), explicit: knowledgeIntroduction(allEntities(), allTopics()),
    workbookValid: !!validateWorkbook(savedWorkbook), types: ['ET-PROD-GAME', 'ET-CONTENT-SKILL'].map(id => tagTypeDefinition(id, savedWorkbook)),
    initialTopics: TOPICS.length, promptReady: wikiPromptHistory.getController().status().ready
  }));
  A.equal(result.helper, 'function'); A.equal(result.renderer, 'function'); shape(result.model);
  A.deepEqual(result.model, result.explicit); A.equal(result.workbookValid, true); A.equal(result.initialTopics, 0);
  for (const [index, id] of ['ET-PROD-GAME', 'ET-CONTENT-SKILL'].entries()) { A.equal(result.types[index].id, id); A.equal(result.types[index].status, 'active'); }
  A.equal(result.promptReady, true); A.deepEqual(sorted(new Set(loaded)), sorted(MODULES));
  return { sectionCount: result.model.sections.length, itemIds: ids(result.model) };
});
define('C01', '简介正文位于概览标题后、指标前且在 overview-lead 内', async p => {
  const position = await p.evaluate(() => {
    const lead = document.querySelector('#entityDetail .overview-lead');
    const node = lead?.querySelector('.overview-introduction') || lead?.querySelector('[data-knowledge-introduction]');
    const heading = document.querySelector('#entityDetail .detail-title'), metrics = document.querySelector('#entityDetail .overview-metrics');
    return { present: !!node, inLead: !!node && lead.contains(node),
      afterHeading: !!node && !!(heading.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING),
      beforeMetrics: !!node && !!(node.compareDocumentPosition(metrics) & Node.DOCUMENT_POSITION_FOLLOWING),
      headingCount: document.querySelectorAll('#entityDetail .detail-title').length };
  });
  A.equal(position.present, true); A.equal(position.inLead, true); A.equal(position.afterHeading, true); A.equal(position.beforeMetrics, true); A.equal(position.headingCount, 1);
  return position;
});
define('C02', '实际 topic 摘要、entity summary 与全部稳定 ID 进入简介', async p => {
  const result = await inspect(p); shape(result.model); exactCoverage(result.model, result.entities);
  for (const topic of result.topics.filter(topic => result.browse.includes(topic.id))) {
    const group = result.model.sections.find(section => contains(section.title, topic.name));
    A.ok(group, '可浏览话题应优先形成内容组：' + topic.id);
    A.ok(contains(group.description, topic.desc), '话题有实体才使用真实话题摘要：' + topic.id);
  }
  await assertRendered(p, result.model); return { groups: result.model.sections.map(section => section.title), itemIds: ids(result.model) };
});
define('C03', '孤立 topic 名称和摘要均不出现但底层记录不删', async p => {
  const result = await inspect(p), orphan = result.topics.find(topic => topic.id === 'T-EMPTY');
  A.ok(orphan); A.equal(result.entities.some(entity => entityTopicIdsForFixture(entity).includes(orphan.id)), false);
  for (const text of [modelText(result.model), result.pureHTMLText, result.renderedText]) {
    A.equal(contains(text, orphan.name), false); A.equal(contains(text, orphan.desc), false);
  }
});
function entityTopicIdsForFixture(entity) { return [...new Set([...(entity.topics || []), entity.primaryTopic].filter(Boolean))]; }
define('C04', '跨话题同稳定 ID 去重，优先可浏览主题而非不可浏览主主题', async p => {
  const result = await inspect(p);
  A.equal(ids(result.model).filter(id => id === 'E-CROSS').length, 1);
  A.equal(ids(result.model).filter(id => id === 'E-PREFER').length, 1);
  A.equal(result.entities.filter(entity => entity.id === 'E-CROSS').length, 1);
  A.equal(result.browse.includes('T-HIDDEN'), false); A.equal(result.browse.includes('T-COMBAT'), true);
  const preferred = result.model.sections.find(section => section.items.some(item => item.id === 'E-PREFER'));
  A.ok(preferred); A.ok(contains(preferred.title, result.topics.find(topic => topic.id === 'T-COMBAT').name));
  return { crossGroup: result.model.sections.find(section => section.items.some(item => item.id === 'E-CROSS')).title, preferredGroup: preferred.title };
});
define('C05', '输入数组重复同 ID 不重复举例，同名不同 ID 不按名字合并', async p => {
  const result = await p.evaluate(() => {
    const entities = allEntities(), first = entities.find(entity => entity.id === 'E-CROSS');
    return { model: knowledgeIntroduction([...entities, structuredClone(first), structuredClone(first)], allTopics()), all: structuredClone(entities) };
  });
  exactCoverage(result.model, result.all);
  const same = items(result.model).filter(item => item.name === '人工同名能力');
  A.deepEqual(sorted(same.map(item => item.id)), ['E-SAME1', 'E-SAME2']);
  A.equal(new Set(same.map(item => item.disambiguator)).size, 2); A.ok(same.every(item => item.disambiguator.trim()));
  await assertRendered(p, (await inspect(p)).model);
});
define('C06', '无副作用与无缓存：重复函数和 renderer 不改保存数据、Prompt 或存储', async p => {
  const result = await p.evaluate(() => {
    const f = knowledgeIntroductionFixtures, before = f.memory(), first = knowledgeIntroduction();
    const calls = [];
    for (let i = 0; i < 8; i++) { calls.push(knowledgeIntroduction()); renderKnowledgeIntroduction(); renderKnowledge(); }
    return { before, after: f.memory(), first, calls, timing: wikiRunTiming.current() };
  });
  A.deepEqual(result.after, result.before); for (const model of result.calls) A.deepEqual(model, result.first); A.equal(result.timing, null);
});
define('C07', '显式 entities/topics 参数与当前全库独立，不偷用已缓存全库', async p => {
  const result = await p.evaluate(() => {
    const f = knowledgeIntroductionFixtures, e = f.entity('PARAM-ONLY', '人工显式参数对象', 'PARAM-TOPIC');
    const t = f.topic('PARAM-TOPIC', '人工显式参数话题', '人工显式参数摘要');
    return { model: knowledgeIntroduction([e], [t]), entity: e, topic: t, empty: knowledgeIntroduction([], []), global: knowledgeIntroduction() };
  });
  shape(result.model); exactCoverage(result.model, [result.entity]);
  A.ok(contains(modelText(result.model), result.topic.desc)); A.equal(contains(modelText(result.model), 'COMBAT-DESC'), false);
  A.deepEqual(ids(result.empty), []); A.equal(contains(modelText(result.empty), 'PARAM-ONLY'), false);
  A.equal(ids(result.global).includes('PARAM-ONLY'), false);
});
define('C08', '话题页沿用原有简介，全库简介组件不侵入话题页', async p => {
  await p.locator('#topicStrip [data-nav-topic="T-COMBAT"]').click();
  const beforeLead = await p.locator('#entityDetail .overview-lead').innerText();
  const topic = await p.evaluate(() => allTopics().find(t => t.id === 'T-COMBAT'));
  A.ok(contains(beforeLead, topic.desc)); A.equal(await introLocator(p).count(), 0);
  await p.evaluate(() => { knowledgeIntroductionFixtures.replaceEntity('E-C', { summary: '与当前话题无关的新人工摘要' }); renderKnowledge(); });
  A.equal(await p.locator('#entityDetail .overview-lead').innerText(), beforeLead);
  A.equal(await p.locator('#entityDetail .detail-title').textContent(), topic.name);
  A.equal(await introLocator(p).count(), 0);
});

define('C09', '已保存数组重复稳定 ID 时默认函数与 renderer 仍去重', async p => {
  await p.evaluate(() => {
    const f = knowledgeIntroductionFixtures, pack = f.pack('full');
    pack.entities.push(structuredClone(pack.entities.find(entity => entity.id === 'E-CROSS')));
    f.commit(pack);
  });
  const result = await inspect(p);
  A.equal(result.entities.filter(entity => entity.id === 'E-CROSS').length, 2, '反例须真实保存在隔离工作区中');
  A.equal(ids(result.model).filter(id => id === 'E-CROSS').length, 1);
  exactCoverage(result.model, result.entities); await assertRendered(p, result.model);
});

define('P-NFKC', '全角产品值按存储格式归一，逐字证据保持原文且仍可展示', async p => {
  const result = await p.evaluate(() => {
    const f=knowledgeIntroductionFixtures,value='人工产品｜全角KI',quote=value+'包含该能力。';
    const e=f.entity('E-NFKC','人工全角产品证据对象','T-NFKC',{semanticFacetDetails:[f.detail('product',value,quote)]});
    f.commit({topics:[f.topic('T-NFKC','人工格式兼容话题','人工格式兼容摘要')],entities:[e]});
    return {...f.inspect(),stored:semanticFacetStorage(allEntities()[0]).facetDetails,quote};
  });
  A.ok(result.model.lead.includes('人工产品|全角KI')); A.ok(result.renderedText.includes('人工产品|全角KI'));
  A.equal(result.stored[0].quote,result.quote); A.equal(result.stored[0].evidences[0].exact_quote,result.quote);
});
// 产品标记只放在元数据/证据，不放实体名称、摘要或话题摘要，避免“正文没显示来源”造成假阳性。
const productCases = [
  ['P01', '有效 explicit 产品及匹配 exact_quote 可撑产品范围', 'valid', true],
  ['P02', '从 tags 内详情经 semanticFacetStorage 取得有效产品', 'nested', true],
  ['P03', '多份证据中有一份匹配 exact_quote 即可', 'some-match', true],
  ['P04', '只有 suggestedFacets legacy 值不撑范围', 'suggested', false],
  ['P05', 'legacy 详情即使有 quote 和证据也不撑范围', 'legacy', false],
  ['P06', 'candidate 标签不撑产品范围', 'candidate', false],
  ['P07', 'candidate basis 不撑产品范围', 'candidate-basis', false],
  ['P08', 'explicit 空白 quote 不撑范围', 'blank-quote', false],
  ['P09', 'quote 不含产品值但证据一致仍不撑范围', 'quote-misses-value', false],
  ['P10', '无 evidences 的 explicit 不撑范围', 'no-evidence', false],
  ['P11', 'exact_quote 与 quote 不一致不撑范围', 'wrong-exact', false],
  ['P12', '证据只有偏移、没有 exact_quote 不撑范围', 'missing-exact', false],
  ['P13', 'evidences 非空但成员空值不撑范围', 'null-evidence', false],
  ['P14', '空产品值不撑范围', 'blank-value', false],
  ['P15', '产品前缀旧字符串不撑范围', 'legacy-string', false],
  ['P17', '不是 product 维度的详情不撑产品范围', 'wrong-dimension', false],
  ['P18', 'inferred 产品详情不撑产品范围', 'inferred', false]
];
for (const [id, name, mode, positive] of productCases) define(id, name, async p => {
  const value = '产品范围专用标记|' + id + '|KI', quote = value + '中存在此具名能力。';
  const result = await p.evaluate(({ mode, value, quote }) => {
    const f = knowledgeIntroductionFixtures, e = f.entity('E-PRODUCT', '人工产品证据测试对象', 'T-PRODUCT');
    let detail = f.detail('product', value, quote);
    if (mode === 'legacy') detail.basis = 'legacy';
    if (mode === 'candidate-basis') detail.basis = 'candidate';
    if (mode === 'inferred') { detail.basis = 'inferred'; detail.reason = '人工推断不可作为产品明示证据'; }
    if (mode === 'wrong-dimension') detail.dimension = 'discipline';
    if (mode === 'blank-quote') detail.quote = '   ';
    if (mode === 'quote-misses-value') { detail.quote = '此来源没有声明任何产品归属。'; detail.evidences = [{ exact_quote: detail.quote }]; }
    if (mode === 'no-evidence') detail.evidences = [];
    if (mode === 'wrong-exact') detail.evidences = [{ exact_quote: '不一致的逐字证据' }];
    if (mode === 'missing-exact') detail.evidences = [{ start: 0, end: quote.length }];
    if (mode === 'null-evidence') detail.evidences = [null];
    if (mode === 'blank-value') detail.value = '   ';
    if (mode === 'some-match') detail.evidences = [{ exact_quote: '不匹配' }, { exact_quote: quote }];
    if (mode === 'suggested') e.suggestedFacets.product = [value];
    else if (mode === 'candidate') e.candidateTags = ['产品:' + value];
    else if (mode === 'legacy-string') e.tags.facets = ['产品:' + value];
    else if (mode === 'nested') e.tags.facetDetails = [detail];
    else e.semanticFacetDetails = [detail];
    f.commit({ topics: [f.topic('T-PRODUCT', '人工产品归属验证话题', '人工产品归属话题摘要')], entities: [e] });
    return { ...f.inspect(), stored: semanticFacetStorage(allEntities()[0]).facetDetails };
  }, { mode, value, quote });
  shape(result.model); exactCoverage(result.model, result.entities);
  A.equal(contains(modelText(result.model), value), positive, '只允许可追溯的产品证据撑简介范围');
  A.equal(contains(result.pureHTMLText, value), positive); A.equal(contains(result.renderedText, value), positive);
  if (positive) A.ok(result.stored.some(detail => detail.dimension === 'product' && detail.basis === 'explicit' && detail.quote === quote && detail.evidences.some(evidence => evidence?.exact_quote === quote)));
  if (['wrong-exact', 'missing-exact', 'null-evidence', 'quote-misses-value'].includes(mode)) A.ok(result.stored.some(detail => detail.basis === 'explicit'), '反例须真正保留在 semanticFacetStorage 后，不能只测试被存储层提前丢弃的值');
  return { mode, positive, stored: result.stored, model: result.model };
});
define('P16', '多个合法产品分别保留，混合 legacy/candidate 产品不混入范围', async p => {
  const values = ['合法产品甲KI', '合法产品乙KI'], forbidden = ['旧产品KI', '候选产品KI'];
  const result = await p.evaluate(({ values, forbidden }) => {
    const f = knowledgeIntroductionFixtures;
    const e = f.entity('E-MULTIPRODUCT', '人工多产品对象', 'T-MULTIPRODUCT', {
      semanticFacetDetails: values.map(value => f.detail('product', value, value + '包含此能力。')),
      suggestedFacets: { product: [forbidden[0]], discipline: [], version: [] }, candidateTags: ['产品:' + forbidden[1]]
    });
    f.commit({ topics: [f.topic('T-MULTIPRODUCT', '人工多产品话题', '人工多产品摘要')], entities: [e] });
    return f.inspect();
  }, { values, forbidden });
  for (const value of values) { A.ok(contains(modelText(result.model), value)); A.ok(contains(result.renderedText, value)); }
  for (const value of forbidden) { A.equal(contains(modelText(result.model), value), false); A.equal(contains(result.renderedText, value), false); }
  exactCoverage(result.model, result.entities);
});

for (const [id, name, mode] of [
  ['E01', '空库有非空说明且无实体、话题或产品编造', 'empty'],
  ['E02', '只有孤立话题的空库不引用孤立描述', 'orphan-only'],
  ['E03', '仅游戏而零可浏览话题，仍保留游戏内容', 'games'],
  ['E04', '无任何 topic 的实体仍有实体内容', 'no-topics'],
  ['E05', '只持有无效 topic 引用的实体仍有内容', 'invalid-topics'],
  ['E06', '所有类型未确认、无可浏览话题时仍有内容', 'unconfirmed']
]) define(id, name, async p => {
  const result = await inspect(p); shape(result.model); exactCoverage(result.model, result.entities);
  A.deepEqual(result.browse, []); A.ok(result.renderedText.trim());
  if (!result.entities.length) {
    A.equal(items(result.model).length, 0); A.ok(contains(result.pureHTMLText, result.model.lead));
    for (const marker of ['人工战斗能力甲', 'COMBAT-DESC', '人工产品证据甲KI', '孤立话题不可进入简介', 'ORPHAN-DESC']) {
      A.equal(contains(modelText(result.model), marker), false); A.equal(contains(result.renderedText, marker), false);
    }
  } else {
    A.ok(result.model.sections.length > 0); await assertRendered(p, result.model);
    if (mode === 'invalid-topics') for (const topic of result.topics) { A.equal(contains(modelText(result.model), topic.name), false); A.equal(contains(modelText(result.model), topic.desc), false); }
  }
  return { itemIds: ids(result.model), lead: result.model.lead, groups: result.model.sections.map(section => section.title) };
}, { mode });

define('F01', '普通输入搜索为零结果，简介仍覆盖全部已保存实体', async p => {
  const before = await inspect(p);
  await p.fill('#entitySearch', '人工检索绝不命中KI-ZERO');
  const after = await inspect(p);
  A.deepEqual(after.rows, []); A.notEqual(after.filters, before.filters);
  A.deepEqual(after.model, before.model); A.equal(after.html, before.html); A.equal(after.renderedText, before.renderedText);
  exactCoverage(after.model, before.entities);
});
for (const [key, value] of [['type', '游戏产品'], ['product', '人工产品证据甲KI'], ['discipline', '策划'], ['version', '人工版本V9'], ['topic', 'T-WORLD'], ['relation', '人工关联']]) {
  define('F-' + key, key + ' 真实筛选生效但不改变全库内容简介', async p => {
    const before = await inspect(p);
    if (key === 'topic') await p.evaluate(value => toggleFilter('topic', value), value);
    else {
      await p.locator('details.browse-filters > summary').click();
      if (key === 'relation') await p.locator('#relationFilter').selectOption(value);
      else await p.locator(`[data-filter-key="${key}"][data-filter-value="${value}"]`).click();
    }
    const after = await inspect(p), selected = await p.evaluate(key => key === 'relation' ? state.filters.relation : [...state.filters[key]], key);
    A.deepEqual(selected, key === 'relation' ? value : [value]); A.notEqual(after.filters, before.filters);
    A.ok(after.rows.length < before.rows.length); A.ok(after.rows.length > 0, '筛选须真正产生匹配成员');
    A.deepEqual(after.model, before.model); A.equal(after.html, before.html); A.equal(after.renderedText, before.renderedText);
    exactCoverage(after.model, before.entities); return { key, value, matchingIds: after.rows };
  });
}
define('F02', '搜索与所有分面叠加为零结果，简介及 ID 仍不受影响', async p => {
  const before = await inspect(p);
  await p.evaluate(() => {
    for (const [key, value] of [['topic', 'T-WORLD'], ['type', '游戏产品'], ['product', '人工产品证据甲KI'], ['discipline', '策划'], ['version', '人工版本V9']]) toggleFilter(key, value);
    state.filters.relation = '人工关联'; renderKnowledge();
  });
  await p.fill('#entitySearch', '人工组合筛选零匹配');
  const after = await inspect(p);
  A.deepEqual(after.rows, []); A.notEqual(after.filters, before.filters); A.deepEqual(after.model, before.model);
  A.equal(after.html, before.html); A.equal(after.renderedText, before.renderedText); exactCoverage(after.model, before.entities);
});

define('M01', '真实删除来源后即时重渲染，旧实体摘要及独有产品范围消失', async p => {
  const original = await inspect(p), removed = original.entities.find(entity => entity.id === 'E-A');
  const deleted = await p.evaluate(() => deleteArchiveFile('F-E-A', true));
  A.equal(deleted, true);
  const after = await inspect(p);
  A.equal(ids(after.model).includes(removed.id), false); A.equal(after.entities.some(entity => entity.id === removed.id), false);
  A.deepEqual(sorted(ids(after.model)), sorted(original.entities.filter(entity => entity.id !== removed.id).map(entity => entity.id)));
  for (const text of [modelText(after.model), after.pureHTMLText, after.renderedText]) {
    A.equal(contains(text, removed.summary), false); A.equal(contains(text, removed.name), false); A.equal(contains(text, '人工产品证据甲KI'), false);
  }
  exactCoverage(after.model, after.entities); return { beforeIds: ids(original.model), afterIds: ids(after.model) };
});
define('M02', '真实替换来源正文撤回旧版本知识，不把未解析的新正文编成简介', async p => {
  const before = await inspect(p), old = before.entities.find(entity => entity.id === 'E-D');
  const text = '人工来源替换正文KI，尚未解析也未生成任何新实体。';
  const changed = await p.evaluate(text => updateArchiveFile('F-E-D', '人工替换后的来源.txt', text, text.length, true), text);
  A.equal(changed, true);
  const after = await inspect(p);
  A.equal(ids(after.model).includes(old.id), false); A.equal(contains(modelText(after.model), old.summary), false);
  A.equal(contains(after.renderedText, old.summary), false); A.equal(contains(after.renderedText, text), false);
  const file = await p.evaluate(() => state.files.find(file => file.id === 'F-E-D'));
  A.equal(file.text, text); A.equal(file.revision, 2); A.equal(file.status, '待解析'); exactCoverage(after.model, after.entities);
});
define('M03', '同 ID 保存数据替换后名称摘要产品即时更新，不复用旧缓存', async p => {
  const before = await inspect(p), old = before.entities.find(entity => entity.id === 'E-A');
  const value = '人工替换新产品KI', quote = value + '包含已替换能力。';
  await p.evaluate(({ value, quote }) => knowledgeIntroductionFixtures.replaceEntity('E-A', {
    name: '人工替换后能力甲', summary: '人工替换后实体摘要｜NEW-SUMMARY',
    semanticFacetDetails: [knowledgeIntroductionFixtures.detail('product', value, quote)],
    suggestedFacets: { product: [value], discipline: [], version: [] }
  }), { value, quote });
  const after = await inspect(p), current = items(after.model).find(item => item.id === old.id);
  A.deepEqual(sorted(ids(after.model)), sorted(ids(before.model))); A.equal(current.name, '人工替换后能力甲'); A.equal(current.summary, '人工替换后实体摘要｜NEW-SUMMARY');
  for (const text of [modelText(after.model), after.pureHTMLText, after.renderedText]) {
    A.equal(contains(text, old.summary), false); A.equal(contains(text, old.name), false); A.equal(contains(text, '人工产品证据甲KI'), false); A.ok(contains(text, value));
  }
  exactCoverage(after.model, after.entities);
});
define('M04', '整库清空再换入另一批知识，不残留上一批话题实体或产品', async p => {
  const before = await inspect(p); await seed(p, 'empty');
  const empty = await inspect(p); A.deepEqual(ids(empty.model), []);
  await seed(p, 'no-topics'); const after = await inspect(p);
  exactCoverage(after.model, after.entities); A.notDeepEqual(after.model, before.model);
  for (const text of [modelText(empty.model), empty.renderedText, modelText(after.model), after.renderedText]) {
    for (const entity of before.entities) { A.equal(contains(text, entity.summary), false); A.equal(contains(text, entity.name), false); }
    for (const topic of before.topics) A.equal(contains(text, topic.desc), false);
    A.equal(contains(text, '人工产品证据甲KI'), false);
  }
});

async function exerciseExpansion(p, label) {
  const result = await inspect(p), details = expansionLocator(p);
  A.ok(result.model.sections.length > 3, '人工夹具必须真正超过三组'); A.equal(result.expansionCount, 1);
  const previewTitles = result.model.sections.filter(section => contains(result.previewText, section.title)).map(section => section.title);
  A.ok(previewTitles.length > 0 && previewTitles.length <= 3, '预览只可显示最多三组，实际=' + previewTitles.length);
  A.deepEqual(previewTitles, result.model.sections.slice(0, previewTitles.length).map(section => section.title), '预览顺序应来自真实函数返回的前几个内容组');
  A.equal(await details.evaluate(element => element.open), false);
  const summary = details.locator(':scope > summary'); A.equal(await summary.count(), 1); A.equal(await summary.isVisible(), true);
  await summary.click({ trial: true }); await summary.click(); A.equal(await details.evaluate(element => element.open), true);
  await assertRendered(p, result.model);
  await summary.click(); A.equal(await details.evaluate(element => element.open), false);
  await summary.focus(); A.equal(await summary.evaluate(element => document.activeElement === element), true);
  await summary.press('Enter'); A.equal(await details.evaluate(element => element.open), true);
  await summary.press('Space'); A.equal(await details.evaluate(element => element.open), false);
  await summary.press('Space'); A.equal(await details.evaluate(element => element.open), true);
  const focus = await summary.evaluate(element => ({ tag: element.tagName, focused: document.activeElement === element, rect: element.getBoundingClientRect().toJSON() }));
  report.clickAudit.push({ label, previewTitles, ordinaryClick: true, force: false, keyboard: ['Enter', 'Space'], focus });
  return { previewTitles, sectionCount: result.model.sections.length };
}
define('U01', '超过三组的简介可普通点击及键盘展开全文', p => exerciseExpansion(p, '多内容组'));
define('U02', '超长话题与实体摘要展开后保留完整尾部、不截断全文', async p => {
  const result = await inspect(p); exactCoverage(result.model, result.entities);
  await exerciseExpansion(p, '超长全文');
  const fullText = await introLocator(p).innerText();
  for (let n = 0; n < 5; n++) {
    A.ok(contains(fullText, '长话题结尾标记' + n));
    for (let i = 0; i < 4; i++) A.ok(contains(fullText, '长实体结尾标记' + n + '-' + i));
  }
}, { mode: 'long' });
define('U03', '不足三组但单条摘要超长，仍提供全文展开入口', async p => {
  await p.evaluate(() => {
    const f = knowledgeIntroductionFixtures, topic = f.topic('T-ONE-LONG', '人工单组长摘要话题', '人工单组摘要开始｜' + '超长话题说明。'.repeat(130) + '｜单组话题结尾KI');
    const entity = f.entity('E-ONE-LONG', '人工单组长摘要实体', topic.id, { summary: '人工单实体长摘要｜' + '超长实体说明。'.repeat(150) + '｜单实体结尾KI' });
    f.commit({ topics: [topic], entities: [entity] });
  });
  const result = await inspect(p); A.ok(result.model.sections.length <= 3); A.equal(result.expansionCount, 1);
  A.equal(await expansionLocator(p).evaluate(element => element.open), false);
  await expansionLocator(p).locator(':scope > summary').click(); A.equal(await expansionLocator(p).evaluate(element => element.open), true);
  const text = await assertRendered(p, result.model);
  A.ok(contains(text, '单组话题结尾KI')); A.ok(contains(text, '单实体结尾KI')); exactCoverage(result.model, result.entities);
});

define('X01', '名称摘要消歧和稳定 ID 的 HTML 注入安全，真实返回字符串已转义', async p => {
  const evil = {
    id: 'E-XSS-\"<>&', name: '<img src=x onerror="window.__introductionXss=1"> & 人工名称',
    title: '<svg onload="window.__introductionXss=2"></svg> & 人工话题',
    summary: '</p><script>window.__introductionXss=3</script> & 人工实体摘要',
    description: '</div><iframe srcdoc="<script>parent.__introductionXss=4</script>"></iframe> & 人工话题描述',
    disambiguator: '\" autofocus onfocus="window.__introductionXss=5" <b> & 人工消歧'
  };
  const result = await p.evaluate(evil => {
    const f = knowledgeIntroductionFixtures, t = f.topic('T-XSS-\"<>&', evil.title, evil.description);
    const e = f.entity(evil.id, evil.name, t.id, { summary: evil.summary, disambiguator: evil.disambiguator });
    f.commit({ topics: [t], entities: [e] });
    const result = f.inspect(), template = document.createElement('template'); template.innerHTML = result.html;
    const root = document.querySelector('#entityDetail .overview-lead .overview-introduction') || document.querySelector('#entityDetail .overview-lead [data-knowledge-introduction]');
    const dangerous = fragment => ({ nodes: fragment.querySelectorAll('script,img,svg,iframe,object,embed,style,link').length,
      eventAttributes: [...fragment.querySelectorAll('*')].flatMap(node => [...node.attributes].filter(attribute => /^on/i.test(attribute.name)).map(attribute => attribute.name)) });
    return { ...result, pure: dangerous(template.content), live: dangerous(root), executed: window.__introductionXss || 0 };
  }, evil);
  exactCoverage(result.model, result.entities); A.deepEqual(ids(result.model), [evil.id]);
  for (const field of ['name', 'summary', 'disambiguator']) A.equal(items(result.model)[0][field], evil[field]);
  A.ok(contains(modelText(result.model), '人工话题描述')); A.equal(result.pure.nodes, 0); A.deepEqual(result.pure.eventAttributes, []);
  A.equal(result.live.nodes, 0); A.deepEqual(result.live.eventAttributes, []); A.equal(result.executed, 0);
  for (const value of [evil.name, evil.title, evil.summary, evil.description, evil.disambiguator]) A.ok(contains(result.pureHTMLText, value), 'renderer 应保留原文字面值并转义');
  await assertRendered(p, result.model);
  A.equal(await p.evaluate(() => window.__introductionXss || 0), 0);
  A.equal(contains(result.html, '<script>window.__introductionXss'), false);
  A.equal(contains(result.html, '<img src=x'), false);
});

for (const width of [1440, 760, 390]) for (const open of [false, true]) {
  define(`L-${width}-${open ? 'open' : 'closed'}`, `${width}px 超长简介${open ? '全文展开' : '收起预览'}无横向溢出`, async p => {
    await p.setViewportSize({ width, height: 1080 });
    if (open) {
      const summary = expansionLocator(p).locator(':scope > summary');
      await summary.click({ trial: true }); await summary.click();
      A.equal(await expansionLocator(p).evaluate(element => element.open), true);
      report.clickAudit.push({ width, ordinaryClick: true, force: false, scene: '响应式全文展开' });
    }
    const layout = await p.evaluate(() => {
      const root = document.querySelector('#entityDetail .overview-lead .overview-introduction') || document.querySelector('#entityDetail .overview-lead [data-knowledge-introduction]');
      const nodes = ['.browse-grid', '#entityDetail', '.overview-lead', 'details[data-introduction-expand]'].map(selector => [selector, document.querySelector(selector)]);
      nodes.push(['introduction', root]);
      return { width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth,
        panels: nodes.filter(([, node]) => node).map(([selector, node]) => {
          const rect = node.getBoundingClientRect(); return { selector, client: node.clientWidth, scroll: node.scrollWidth, left: rect.left, right: rect.right };
        }) };
    });
    report.responsive.push({ ...layout, expanded: open });
    A.equal(layout.width, width); A.ok(layout.document <= width + 2, 'document 横溢出：' + JSON.stringify(layout)); A.ok(layout.body <= width + 2);
    A.equal(layout.panels.length, 5);
    for (const panel of layout.panels) {
      A.ok(panel.scroll <= panel.client + 2, '内部横溢出：' + JSON.stringify(panel));
      A.ok(panel.left >= -2 && panel.right <= width + 2, '面板越界：' + JSON.stringify(panel));
    }
    return layout;
  }, { mode: 'long' });
}
define('S01', '只生成指定本地截图，画面为真实应用与人工隔离内容', async p => {
  await p.setViewportSize({ width: 1440, height: 1080 });
  const result = await inspect(p); await assertRendered(p, result.model);
  await p.screenshot({ path: allowedOutput(SHOT), fullPage: true });
  const size = fs.statSync(path.join(ROOT, SHOT)).size; A.ok(size > 0);
  report.artifacts.push({ path: path.join(ROOT, SHOT), bytes: size, kind: '人工内存夹具，不调用模型或真实云' });
});
define('Z01', 'SDK 零模型零写尝试，源码数据和 Prompt 仅读取，未运行流水线', async p => {
  const audit = await p.evaluate(() => ({
    guard: structuredClone(knowledgeIntroductionAudit), mockQueries: structuredClone(timingMock.queries),
    writes: structuredClone(timingMock.writes), calls: structuredClone(timingMock.calls), record: wikiRunTiming.current(),
    active: isRunning, promptDirty: wikiPromptHistory.getController().status().dirty
  }));
  report.sdkAudit = audit; report.isolation.modelAttempts = audit.guard.modelAttempts.length; report.isolation.sdkWriteAttempts = audit.guard.sdkWriteAttempts.length;
  A.equal(audit.guard.factories, 1); A.deepEqual(audit.guard.modelAttempts, []); A.deepEqual(audit.guard.sdkWriteAttempts, []);
  A.deepEqual(audit.writes, []); A.deepEqual(audit.calls, []); A.equal(audit.record, null); A.equal(audit.active, false); A.equal(audit.promptDirty, false);
  A.ok(audit.mockQueries.length > 0); A.ok(audit.mockQueries.every(query => !query.write && ['wiki_shared_tag_workbook', 'wiki_prompt_versions'].includes(query.table)));
  A.ok(audit.guard.readQueries.length > 0); A.ok(audit.guard.readQueries.every(query => ['wiki_shared_tag_workbook', 'wiki_prompt_versions'].includes(query.table)));
  A.deepEqual(audit.guard.forbiddenFetches, []); A.deepEqual(audit.guard.deniedWorkers, []); A.ok(audit.guard.modelCatalogueReads > 0);
}, { noSeed: true });
define('Z02', '所有请求在本地 route 完结，零云网络写入、零模型、零旧测试执行', async () => {
  A.deepEqual(sorted(new Set(loaded)), sorted(MODULES)); A.ok(network.length > 0);
  A.ok(network.every(entry => ['真实五资源', '人工词表资产', '外部脚本空替身', '本地空图标'].includes(entry.action)), '发现非白名单网络尝试');
  A.ok(network.every(entry => entry.method === 'GET')); A.equal(report.isolation.continuedRequests, 0);
  A.equal(report.isolation.realCloudRequests, 0); A.equal(report.isolation.realModelCalls, 0); A.equal(report.isolation.oldTestsExecuted, 0);
  A.equal(report.isolation.blockedWebSockets, 0); A.deepEqual(pageErrors, []); A.deepEqual(dialogs, []);
  const cachedOld = Object.keys(require.cache).filter(name => OLD_TESTS.some(relative => path.resolve(name) === path.resolve(ROOT, relative)));
  A.deepEqual(cachedOld, []); A.equal(report.harnessExtraction.oldScriptExecuted, false); A.equal(report.harnessExtraction.pureFunctionOnly, true);
}, { noSeed: true });
define('Z03', '关闭浏览器后源码、云配置、Prompt、旧专项及全部用户文件指纹不变', async () => {
  const after = captureFingerprints();
  report.fingerprints = { before, after,
    applicationUnchanged: JSON.stringify(before.application) === JSON.stringify(after.application),
    oldTestsUnchanged: JSON.stringify(before.oldTests) === JSON.stringify(after.oldTests),
    protectedWorkspaceUnchanged: JSON.stringify(before.protectedWorkspace) === JSON.stringify(after.protectedWorkspace),
    excludedOutputsOnly: [...OUTPUT_ALLOWLIST] };
  A.deepEqual(after.application, before.application); A.deepEqual(after.oldTests, before.oldTests); A.deepEqual(after.protectedWorkspace, before.protectedWorkspace);
}, { noSeed: true, afterClose: true });

function finish() {
  const executed = new Set(report.tests.map(test => test.id));
  for (const test of cases) if (!executed.has(test.id)) report.tests.push({
    id: test.id, name: test.name, executed: false, status: 'blocked', pass: false,
    assertions: 0, passedAssertions: 0, failedAssertions: 0, reason: report.blockReason || 'harness 启动失败，场景未执行'
  });
  report.finishedAt = new Date().toISOString(); report.plannedScenarios = cases.length;
  report.executedScenarios = report.tests.filter(test => test.executed).length;
  report.passed = report.tests.filter(test => test.status === 'passed').length;
  report.failed = report.tests.filter(test => test.status === 'failed').length;
  report.blocked = report.tests.filter(test => test.status === 'blocked').length;
  report.assertions = {
    total: report.tests.reduce((count, test) => count + test.assertions, 0),
    passed: report.tests.reduce((count, test) => count + test.passedAssertions, 0),
    failed: report.tests.reduce((count, test) => count + test.failedAssertions, 0), basis: '真正进入 assert 调用的次数，非计划数'
  };
  report.status = report.blockReason ? 'blocked' : report.failed || report.blocked || report.harnessErrors.length ? 'failed' : 'passed';
  fs.writeFileSync(allowedOutput(REPORT), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, executedScenarios: report.executedScenarios, plannedScenarios: report.plannedScenarios,
    passed: report.passed, failed: report.failed, blocked: report.blocked, assertions: report.assertions,
    failures: report.tests.filter(test => test.status === 'failed').map(({ id, name, reason }) => ({ id, name, reason })),
    blockReason: report.blockReason, harnessErrors: report.harnessErrors, reportPath: path.join(ROOT, REPORT), artifacts: report.artifacts }, null, 2));
  if (report.status !== 'passed') process.exitCode = report.status === 'blocked' ? 2 : 1;
}
async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--source-ready') {
    console.error('仅编写阶段：主代理确认源码就绪后使用 --source-ready；未读取应用、未启动浏览器、未运行测试、未写输出。');
    process.exitCode = 2; return;
  }
  report.planned = cases.map(({ id, name }) => ({ id, name }));
  try {
    // 运行时快照而非编写时快照，允许主代理先完成源码；之后任何漂移只报告、不代改或恢复。
    before = captureFingerprints();
    sources = Object.fromEntries(MODULES.map(name => [name, fs.readFileSync(path.join(APP, name), 'utf8')]));
    if (!/function\s+knowledgeIntroduction\s*\(/.test(sources['index.html']) || !/function\s+renderKnowledgeIntroduction\s*\(/.test(sources['index.html'])) {
      report.blockReason = '源码尚未满足 knowledgeIntroduction/renderKnowledgeIntroduction 契约；未启动浏览器，不轮询、不改应用'; return;
    }
    for (const match of sources['index.html'].matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1], { filename: 'index.html-inline' });
    for (const name of MODULES.slice(1)) new vm.Script(sources[name], { filename: name });
    const mockCode = extractMock();
    const { chromium } = require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    page = await session(mockCode);
    for (const test of cases.filter(test => !test.afterClose)) await execute(test, page);
  } catch (error) { report.harnessErrors.push({ reason: error.message, stack: error.stack }); }
  finally {
    for (const context of contexts) await context.close().catch(error => report.harnessErrors.push({ reason: '关闭 context：' + error.message }));
    if (browser) await browser.close().catch(error => report.harnessErrors.push({ reason: '关闭 browser：' + error.message }));
    if (before) for (const test of cases.filter(test => test.afterClose)) await execute(test, null);
    finish();
  }
}
main().catch(error => { console.error('专项报告无法完成：' + error.stack); process.exitCode = 1; });
