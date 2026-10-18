'use strict';

// 本文件只编写与静态检查；主助手确认源码后，才可显式传入 --source-ready。
if (!process.argv.includes('--source-ready')) {
  console.error('未提供 --source-ready；不启动浏览器、不读取 workspace、不运行断言、不生成报告。静态检查请使用 node --check。');
  process.exitCode = 2;
}

const SCENARIOS = [
  '佛光玉：实体证据无产品，主话题与身份互证',
  '破竹樽：实体证据无产品，主话题与身份互证',
  '产品游戏锚点支持，无身份产品范围',
  '同主话题可信 explicit 实体提供产品角色',
  '当前章节标题兜底，产品不来自文件名',
  '缺产品证据拒绝',
  '缺实体逐字证据拒绝',
  '实体偏移不匹配拒绝',
  '主话题伪造 quote 拒绝',
  '直接 explicit 优先且不追加 contextual',
  '有效直接证据经真实抽取与 normalize 后保留 explicit',
  '直接证据未含产品，不放宽抽取门禁',
  '直接证据不在原文，不放宽抽取门禁',
  '直接证据偏移错误，不放宽抽取门禁',
  'inferred 产品与版本仍拒绝',
  '主话题游戏锚点有 explicit 版本也不得继承',
  '仅主话题，不从关联话题广播',
  '跨主话题同来源仍可互证产品',
  '多产品身份范围拒绝',
  '跨产品主话题拒绝',
  '同来源已确认产品冲突拒绝',
  '同来源身份与主话题冲突拒绝',
  '身份待复核拒绝',
  '不同来源贡献独立，坏来源不污染好来源',
  '同一实体多来源可分别得到不同产品',
  '纯投影删除来源立即失效',
  '纯投影 revision 变化立即失效',
  '纯投影删除主话题立即失效',
  '锚点删除立即失效，不读取上次派生缓存',
  '锚点 revision 失效不能继续支持',
  '无贡献历史：完整唯一来源但无正文诊断拒绝',
  '无贡献历史：有正文无 offsets 允许且不伪造偏移',
  '真实 migration：legacy 来源与空正文诊断拒绝',
  'legacy 文件即使有正文仍诊断拒绝',
  'legacy 贡献即使有正文仍诊断拒绝',
  '无贡献历史：多来源顶层范围拒绝',
  '旧无 fileId 安全拒绝',
  '旧无 revision 安全拒绝',
  '历史 sources 混有不完整来源拒绝',
  'contextual 缓存 normalize 后不能 legacy 复活',
  '贡献内 contextual 缓存 normalize 后不能 legacy 复活',
  '同值 contextual 缓存与独立 explicit 详情共存不误清',
  '同值 contextual 缓存与独立 legacy 详情共存不误清',
  '同一临时 context 重复读取一致且无持久副作用',
  'revision 撤回后新 context 不复用旧归属',
  '真实 addLocalPreview 同身份两组同来源聚合贡献保留补全',
  'resolver 读取旧同来源两条兼容贡献保留两 quotes 与补全',
  '同来源重复贡献发生身份冲突仍拒绝',
  'Halo 不得匹配 Halo 2 话题',
  'Halo 不得借 Halo 2 quote 与空格边界误归属',
  '中文产品不得匹配书名号外传',
  '中文产品不得匹配裸名称外传',
  'Halo 2 完整产品名正例',
  '奥日与黑暗森林完整产品名正例',
  '跨越星弧完整产品名正例',
  '错主话题 quote 加其他章节游戏锚点不得广播',
  '误标同主话题的跨章节游戏锚点仍不得广播',
  '标题不能跨越同级章节边界',
  '产品游戏锚点必须有效受控类型',
  '锚点只有候选或 legacy 产品不构成可信角色',
  'UI 详情、产品筛选、全库与筛选 snapshot 一致且保留隐藏锚点',
  '真实 xlsx 下载并读回 contextual 与证据',
  '1440 宽度布局与实际点击',
  '760 宽度布局与实际点击',
  '390 宽度布局与实际点击',
  '人工 fixture 截图',
  '真实来源删除仅撤销隔离 workspace 的对应贡献',
  '真实正文修改提升 revision 并撤销旧派生归属',
  '真实 topic 删除后不复用旧 contextual',
  '消费层投影、详情与导出无 storage 或业务副作用',
  '网络、SDK、模块、页面错误与保护 hash 收尾'
];

const HARNESS_ADJUSTMENTS = [
  { id: 'history-text', reason: '首次历史正例把 text 设为 null，与可验证正文门槛冲突；原 fixture 保留为诊断负例，另加有正文无 offsets 正例且不伪造定位。' },
  { id: 'write-aggregation', reason: '真实 addLocalPreview 写端已聚合同 source/revision 贡献；断言改为实体 1、贡献 1、两条准确 quotes 均保留、contextual 及不持久化仍严格检查。' },
  { id: 'legacy-read', reason: '写端聚合不替代存量兼容；另直接调用四字段合同 resolver 读取两条同来源兼容贡献，检查两 quotes、补全与输入无变更，保留身份冲突拒绝。' },
  { id: 'native-details', reason: '首次五项点击失败发生于原生 details 折叠；UI、xlsx 和每个布局各自保证页面可见，通过普通 summary 点击折叠再展开后点 chip，不使用 force 或 evaluate 点击。' },
  { id: 'download-dependency', reason: '下载为 0 的收尾是上游 xlsx 场景未到达下载的依赖结果；记录上游阶段和错误，仍失败并保留至少一次真实下载要求，先完成独立保护检查。' },
  { id: 'migration-gate', reason: '新增真实人工旧 workspace migration 的 legacy:true 与 text:null 诊断拒绝，并分别隔离有正文的 legacy 文件/贡献拒绝，不能按旧 quote 猜产品。' },
  { id: 'independent-facts', reason: '同值 contextual 缓存不得误清独立 explicit/legacy 事实；覆盖根容器和 tags 缓存位置，检查清理、normalize、存储投影及来源失效后的事实元数据保留。' },
  { id: 'temporary-cache', reason: '同一未变临时 context 重复 resolver/消费层读取应一致，缓存引用可复用但不写 storage；真实 revision 撤回后新 context 必须独立且不复用旧来源归属。' },
  { id: 'report-isolation', reason: '功能报告只写 recheck；首次报告及原字节备份继续纳入保护，截图和人工 xlsx 路径不变。本轮仅静态检查，所有修订版场景待主助手执行。' }
];

// 独立基础 SDK；不会抽取、require 或执行任何旧专项。
function installIsolation() {
  localStorage.clear(); sessionStorage.clear();
  window.productAudit = { sdkReads: [], sdkWrites: [], modelCalls: [], disabledInitCalls: 0, loaded: [] };
  const denied = operation => { productAudit.sdkWrites.push(operation); throw Error('专项禁止 SDK 写入：' + operation); };
  const database = { from(table) {
    productAudit.sdkReads.push(table);
    if (table !== 'wiki_prompt_versions') throw Error('专项禁止读取非人工 SDK 表：' + table);
    return {
      select() { return this; }, order() { return this; }, limit() { return this; }, eq() { return this; },
      insert() { return denied('insert'); }, update() { return denied('update'); },
      delete() { return denied('delete'); }, upsert() { return denied('upsert'); },
      then(resolve, reject) {
        const row = { revision: '1', parent_revision: '0', request_id: '人工提示词种子', action: 'initial',
          note: '仅本隔离 context', editor_label: '人工', changed_steps: [], restored_from: null,
          created_at: '2026-10-15T00:00:00.000Z',
          snapshot: { baseline: structuredClone(DEFAULT_PROMPTS), current: structuredClone(DEFAULT_PROMPTS) } };
        return Promise.resolve({ data: [row] }).then(resolve, reject);
      }
    };
  } };
  const modelDenied = operation => { productAudit.modelCalls.push(operation); throw Error('专项禁止模型操作：' + operation); };
  window.WorkBuddyCloud = { createWorkBuddyCloud: () => ({ database, llm: {
    models: { list: () => modelDenied('models.list') },
    chat: { completions: { create: () => modelDenied('chat.completions.create') } }
  } }) };
  window.productBootstrap = () => {
    cloud = WorkBuddyCloud.createWorkBuddyCloud();
    initCloud = async () => { productAudit.disabledInitCalls++; cloudLoading = false; };
    const headers = ['类型 ID', '管理分组', '正式标签', '定义', '包含示例', '排除与边界', '赋值规则', '状态', '同义名称'];
    const type = (id, label) => [id, '人工', label, '人工类型定义', label, '仅指定类型', '单选', 'active', ''];
    savedWorkbook = { sheets: [
      { name: '实体类型标签', rows: [['人工词表'], [], [], headers,
        type('ET-CONTENT-ITEM', '道具'), type('ET-PROD-GAME', '游戏产品'), type('ET-CONTENT-SKILL', '技能')] },
      { name: '业务分面', rows: [['人工分面'], [], [], ['分面 ID', '分面名称', '正式取值', '值类型', '基数', '值来源', '主要用途', '未命中处理'],
        ['F-PRODUCT', '所属产品', '开放值', 'string', 'multiple', '逐字证据', '检索', '建议']] },
      { name: '赋值与治理规则', rows: [['人工规则'], [], [], ['规则 ID', '场景', '规则', '程序门控', '处理方式'],
        ['R-1', '人工专项', '不保存派生', '启用', '隔离']] }, defaultRelationSheet()
    ] };
    draftWorkbook = structuredClone(savedWorkbook); assetWorkbook = structuredClone(savedWorkbook);
    workbookReady = true; workbookRowId = 1; workbookRevision = 1; workbookDraftRevision = 1;
    availableModels = [];
  };
}

// 所有文本均人工构造，不读取磁盘用户资料或浏览器真实 profile。
function installFixtures() {
  const clone = value => structuredClone(value);
  const f = window.productFixtures = {};
  f.workbook = clone(savedWorkbook);
  f.proof = (file, quote, offsets = true) => {
    const start = file.text.indexOf(quote);
    if (start < 0) throw Error('人工 fixture quote 未在人工正文内：' + quote);
    return { exact_quote: quote, fileId: file.id, revision: file.revision, file: file.name,
      ...(offsets ? { start, end: start + quote.length } : {}) };
  };
  f.bindEntity = (data, file) => ({ ...clone(data), fileContributions: [{ fileId: file.id, revision: file.revision, data: clone(data) }] });
  f.bindTopic = (data, file) => ({ ...clone(data), fileContributions: [{ fileId: file.id, revision: file.revision, data: clone(data) }] });
  f.make = (options = {}) => {
    const product = options.product || '燕云十六声', name = options.name || '佛光玉', id = options.fileId || 'PC-F-A';
    const topicId = options.topicId || 'PC-T-A', entityId = options.entityId || 'PC-E-A';
    const topicQuote = options.topicQuote || `《${product}》是一款游戏，本节介绍道具玩法。`;
    const entityQuote = options.entityQuote || `${name}可以提升角色的战斗能力。`;
    const anchorQuote = `《${product}》提供角色成长玩法。`;
    const text = options.text || [options.title || `# ${product}：道具研究`, topicQuote, entityQuote, anchorQuote].join('\n');
    const file = { id, name: '人工无产品文件名-' + id + '.txt', originalName: '人工-' + id + '.txt',
      text, size: text.length * 3, revision: 1, status: '已解析', legacy: false,
      createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T00:00:00.000Z' };
    const evidence = f.proof(file, entityQuote);
    const topicData = { id: topicId, name: options.topicName || `${product}：道具玩法`, object_anchor: options.objectAnchor || product,
      definition: '人工话题定义', desc: '人工话题摘要', scope: '当前产品道具', core_question: '道具如何生效',
      includes: ['人工道具'], excludes: ['其他章节'], evidences: options.noTopicEvidence ? [] : [f.proof(file, topicQuote)] };
    const data = { id: entityId, name, summary: '人工道具说明', aliases: [], disambiguator: '',
      identityAnchors: { ontologyType: '具名道具', realityDomain: '游戏虚构',
        productIpScope: Object.hasOwn(options, 'scope') ? options.scope : product, version: null, identityAttributes: {} },
      identityDecision: 'confirmed', primaryTopic: topicId, topics: [topicId],
      tags: { type: ['道具'], typeId: 'ET-CONTENT-ITEM' }, typeIssue: null, reviewReasons: [],
      semanticFacetsRecognized: true, suggestedFacets: { product: [], discipline: [], version: [] },
      semanticFacetDetails: [], candidateTags: [], sources: [{ ...evidence, quote: entityQuote }], facts: [entityQuote], relations: [] };
    const entity = f.bindEntity(data, file), topic = f.bindTopic(topicData, file);
    const anchorData = { ...clone(data), id: 'PC-G-' + id, name: product, summary: '人工游戏锚点',
      identityAnchors: { ...clone(data.identityAnchors), ontologyType: '游戏产品', productIpScope: product },
      tags: { type: ['游戏产品'], typeId: 'ET-PROD-GAME' }, sources: [{ ...f.proof(file, anchorQuote), quote: anchorQuote }], facts: [anchorQuote] };
    const anchor = f.bindEntity(anchorData, file);
    return { entity, topics: [topic], entities: [entity, ...(options.anchor ? [anchor] : [])], files: [file],
      workbook: clone(f.workbook), anchor, quotes: { entityQuote, topicQuote, anchorQuote }, product };
  };
  f.project = fixture => entitySemanticFacets(fixture.entity, fixture);
  f.data = entity => entity.fileContributions[0].data;
  f.topicData = fixture => fixture.topics[0].fileContributions[0].data;
  f.multi = (differentProducts = false) => {
    const a = f.make(), b = f.make({ fileId: 'PC-F-B', topicId: 'PC-T-B', product: differentProducts ? '人工游戏乙' : '燕云十六声' });
    a.entity.fileContributions.push(clone(b.entity.fileContributions[0]));
    a.entity.sources.push(...clone(b.entity.sources)); a.entity.topics.push('PC-T-B');
    a.topics.push(...b.topics); a.files.push(...b.files); return a;
  };
  f.seed = fixture => {
    const x = fixture || f.make({ scope: null, anchor: true }); f.current = clone(x);
    savedWorkbook = clone(f.workbook); workbookReady = true;
    // 使用真实事务函数，但只写此非持久 browser context 的人工 workspace。
    commitFileWorkspace(clone(x.files), clone(x.topics), clone(x.entities));
    state.source = null; state.current = null; state.baseline = null; state.selectedEntity = null;
    state.relatedDetailId = null; state.relatedFilterKey = null; knowledgeNav.topicId = null; knowledgeNav.expanded = new Set();
    for (const key of ['topic', 'type', 'product', 'discipline', 'version', 'candidate']) state.filters[key] = new Set();
    state.filters.relation = ''; document.getElementById('entitySearch').value = '';
    document.getElementById('knowledgeExportScope').value = 'all'; setPage('knowledge'); renderFiles();
  };
  f.currentProjection = id => entitySemanticFacets(allEntities().find(e => e.id === (id || 'PC-E-A')), knowledgeSemanticContexts());
  f.signature = () => JSON.stringify({ files: state.files, entities: state.previews, topics: state.previewTopics,
    workbook: savedWorkbook, draftWorkbook, prompts: state.prompts, baseline: state.baselinePrompts,
    source: state.source, current: state.current, baselineResult: state.baseline,
    filters: Object.fromEntries(Object.entries(state.filters).map(([k, v]) => [k, v instanceof Set ? [...v] : v])),
    selected: state.selectedEntity, related: [state.relatedDetailId, state.relatedFilterKey],
    nav: { topicId: knowledgeNav.topicId, expanded: [...knowledgeNav.expanded] },
    local: Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])),
    session: Object.fromEntries(Object.keys(sessionStorage).sort().map(k => [k, sessionStorage.getItem(k)])) });
  f.previewInput = fixture => {
    const file = fixture.files[0], topic = clone(f.topicData(fixture)), data = f.data(fixture.entity);
    const secondQuote = '佛光玉也可以用于另一种战斗组合。';
    const mentions = [fixture.quotes.entityQuote, secondQuote].map((quote, i) => ({
      mention_local_id: 'PC-M-' + i, name: '佛光玉', definition: '人工同身份道具', aliases: [],
      member_ids: ['PC-MEMBER-' + i], topic_ids: [topic.id], primary_topic_id: topic.id, evidences: [f.proof(file, quote)]
    }));
    return { preview_eligible: true, source: { file_id: file.id, file_revision: file.revision, file_name: file.name },
      model: { id: '禁止调用的人工模型占位' }, workbook: clone(savedWorkbook), workbook_revision: 1, topics: [topic],
      steps: { step3: { accepted: mentions }, step4: { normalization_results: mentions.map(m => ({
        mention_local_id: m.mention_local_id, decision: 'confirmed', disambiguation_label: '', identity_anchors: {
          ontology_type: data.identityAnchors.ontologyType, reality_domain: data.identityAnchors.realityDomain,
          product_ip_scope: data.identityAnchors.productIpScope, version: null, identity_attributes: {} } })) },
        step5: { entity_results: mentions.map(m => ({ mention_local_id: m.mention_local_id,
          tags: { entity_type: '道具', entity_type_id: 'ET-CONTENT-ITEM', semantic_facets: [], semanticFacetsRecognized: true, candidate_tags: [] }, relations: [] })) },
        step6: { hard_failures: [] } }
    };
  };
  f.seed();
}

async function main() {
  const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), vm = require('node:vm');
  const nativeAssert = require('node:assert/strict');
  const root = path.resolve(__dirname, '..'), app = path.join(root, 'wiki-demo-mvp'), outputs = path.join(root, 'outputs');
  const origin = 'http://127.0.0.1:19434';
  const names = ['index.html', 'semantic-tags.js', 'pipeline.js', 'file-manager.js', 'prompt-history.js'];
  const reportPath = path.join(outputs, 'wiki-product-context-tests-recheck.json');
  const screenshotPath = path.join(outputs, '知识Wiki产品归属修复-本地.png');
  const xlsxPath = path.join(outputs, 'wiki-product-context-fixture.xlsx');
  const allowed = new Set([__filename, reportPath, screenshotPath, xlsxPath].map(p => path.resolve(p)));
  const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  function inventory() {
    const result = {};
    const walk = dir => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, e.name);
        if (e.isDirectory()) walk(file);
        else if (e.isFile() && !allowed.has(path.resolve(file))) result[path.relative(root, file).replace(/\\/g, '/')] = hash(file);
      }
    };
    for (const dir of [app, __dirname, outputs]) walk(dir);
    return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b, 'en')));
  }
  const report = { kind: '产品上下文专项：真实本地五模块、全网络拦截、人工隔离数据、禁云与模型',
    status: 'running', sourceReady: true, startedAt: new Date().toISOString(), modules: names,
    assertions: 0, assertionResults: [], scenarios: [], network: [], pageErrors: [], layouts: [],
    downloads: 0, screenshot: null, oldTestsExecuted: 0, realNetworkRequests: 0,
    deferredToMainAssistant: [], harnessErrors: [], dependencyFailures: [], protection: {},
    firstRunEvidence: { report: 'outputs/wiki-product-context-tests.json', backup: 'outputs/wiki-product-context-tests-first-failed.json' },
    harnessAdjustments: HARNESS_ADJUSTMENTS };
  let browser, context, page, current, before;
  const A = new Proxy(nativeAssert, { get(target, key) {
    if (typeof target[key] !== 'function') return target[key];
    return (...args) => {
      const entry = { scenario: current?.name || '收尾', method: String(key), status: 'failed' };
      report.assertions++; report.assertionResults.push(entry); if (current) current.assertions++;
      try { const result = target[key](...args); entry.status = 'passed'; return result; }
      catch (error) { entry.error = error.message; throw error; }
    };
  } });
  async function test(name, fn) {
    if (!SCENARIOS.includes(name) || report.scenarios.some(s => s.name === name)) throw Error('场景清单不一致：' + name);
    current = { name, status: 'running', assertions: 0 };
    try { await page.evaluate(() => productFixtures.seed()); await fn(); current.status = 'passed'; }
    catch (error) { current.status = 'failed'; current.error = error.stack || error.message; console.error(name + '：' + error.message); }
    finally { report.scenarios.push(current); current = null; }
  }
  const evaluate = (fn, arg) => page.evaluate(fn, arg);
  const productDetails = projection => projection.facetDetails.filter(d => d.dimension === 'product');
  const expectContext = (result, value = '燕云十六声', source = 'PC-F-A') => {
    A.deepEqual(result.suggestedFacets.product, [value]);
    const details = productDetails(result); A.ok(details.length > 0);
    A.ok(details.every(d => d.basis === 'contextual')); A.ok(details.some(d => d.source.fileId === source));
    for (const d of details) { A.ok(d.quote); A.ok(d.entityQuote); A.ok(d.context.topicId); A.ok(d.evidences.length); A.ok(d.context.topicEvidences.length); }
    A.deepEqual(result.suggestedFacets.version, []);
  };
  const expectReject = result => { A.deepEqual(result.suggestedFacets.product, []); A.equal(productDetails(result).length, 0); A.ok(result.productContextIssues.length > 0); };
  const rows = (snapshot, name) => { const s = snapshot.sheets.find(s => s.name === name); if (!s) throw Error('缺工作表：' + name); return s.rows.map(row => Object.fromEntries(s.headers.map((h, i) => [h, row[i]]))); };
  const snapshot = scope => evaluate(scope => knowledgeExportSnapshot(scope), scope || 'all');
  const rowFor = s => rows(s, '实体清单').find(row => row['实体ID'] === 'PC-E-A');
  const openProductFilters = async () => {
    await page.bringToFront();
    await page.locator('#knowledgePage').waitFor({ state: 'visible' });
    A.equal(await page.locator('#knowledgePage').isVisible(), true);
    const card = page.locator('#knowledgePage details.browse-filters');
    const summary = card.locator('summary');
    await summary.waitFor({ state: 'visible' });
    // 每个调用先独立回到折叠态，再按普通用户路径展开，不依赖前一场景。
    if (await card.getAttribute('open') !== null) await summary.click();
    A.equal(await card.getAttribute('open'), null);
    await summary.click();
    A.notEqual(await card.getAttribute('open'), null);
    const chip = card.locator('[data-filter-key="product"][data-filter-value="燕云十六声"]');
    await chip.waitFor({ state: 'visible' });
    A.equal(await chip.isVisible(), true);
  };

  try {
    before = inventory(); report.protection.before = before;
    const source = Object.fromEntries(names.map(name => [name, fs.readFileSync(path.join(app, name), 'utf8')]));
    const initializer = '<script>wikiPromptHistory.init();init();</script>';
    if (source['index.html'].split(initializer).length !== 2) throw Error('初始化边界已改变，请主助手检查，禁止静默绕过');
    for (const match of source['index.html'].matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
    for (const name of names.slice(1)) new vm.Script(source[name]);
    // 只替换内存中的初始化响应，不改磁盘源码；先禁用原 initCloud，再让真实 prompt-history 包装它。
    const html = source['index.html'].replace(initializer, '<script>productBootstrap();wikiPromptHistory.init();init();</script>');
    const parserFile = path.join(__dirname, 'xlsx-0.18.5-export-test.min.js');
    const parserBytes = fs.readFileSync(parserFile), XLSX = require(parserFile);
    const sdkUrls = new Set([...source['index.html'].matchAll(/<script[^>]*src=['"](https?:\/\/[^'"]+)['"]/g)].map(m => m[1]));
    const { chromium } = require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', acceptDownloads: true });
    await context.addInitScript(installIsolation);
    if (typeof context.routeWebSocket !== 'function') throw Error('Playwright 不支持 WebSocket 拦截，禁止不完整隔离运行');
    await context.routeWebSocket('**/*', socket => { report.network.push({ url: socket.url(), action: 'websocket-close' }); socket.close(); });
    await context.route('**/*', route => {
      const req = route.request(), url = new URL(req.url());
      const entry = { method: req.method(), url: req.url(), action: 'abort' }; report.network.push(entry);
      if (req.method() === 'GET' && url.origin === origin) {
        const name = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
        if (Object.hasOwn(source, name)) { entry.action = 'local-fulfill'; entry.module = name; return route.fulfill({ contentType: name.endsWith('.html') ? 'text/html' : 'application/javascript', body: name === 'index.html' ? html : source[name] }); }
        if (url.pathname === '/favicon.ico') { entry.action = 'empty-fulfill'; return route.fulfill({ status: 204 }); }
      }
      if (req.method() === 'GET' && req.resourceType() === 'script' && url.pathname.endsWith('/xlsx.full.min.js')) {
        entry.action = 'local-xlsx-fulfill'; return route.fulfill({ contentType: 'application/javascript', body: parserBytes });
      }
      if (req.method() === 'GET' && sdkUrls.has(req.url())) {
        entry.action = 'sdk-empty-fulfill'; return route.fulfill({ contentType: 'application/javascript', body: '' });
      }
      return route.abort('blockedbyclient');
    });
    page = await context.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', error => report.pageErrors.push(error.message));
    page.on('download', () => report.downloads++); page.on('dialog', dialog => dialog.dismiss());
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => fileManagerReady && workbookReady && !cloudLoading && wikiPromptHistory.getController()?.status().ready);
    await evaluate(installFixtures);
    await page.addScriptTag({ content: parserBytes.toString('utf8') });

    for (const name of ['佛光玉', '破竹樽']) await test(`${name}：实体证据无产品，主话题与身份互证`, async () => {
      const r = await evaluate(name => { const x = productFixtures.make({ name }); return { p: productFixtures.project(x), own: x.quotes.entityQuote }; }, name);
      A.equal(r.own.includes('燕云十六声'), false); expectContext(r.p);
      A.equal(productDetails(r.p)[0].context.roles[0].kind, 'identity-product-scope');
    });
    await test('产品游戏锚点支持，无身份产品范围', async () => {
      const r = await evaluate(() => productFixtures.project(productFixtures.make({ scope: null, anchor: true })));
      expectContext(r); A.ok(productDetails(r).some(d => d.context.roles.some(role => role.kind === 'confirmed-game-entity')));
    });
    await test('同主话题可信 explicit 实体提供产品角色', async () => {
      const r = await evaluate(() => {
        const f = productFixtures, x = f.make({ scope: null, anchor: true }), a = f.data(x.anchor);
        a.tags = { type: ['道具'], typeId: 'ET-CONTENT-ITEM' }; a.identityAnchors.productIpScope = null;
        const q = a.sources[0]; a.semanticFacetDetails = [{ dimension: 'product', value: x.product, basis: 'explicit', quote: q.quote, evidences: [q], source: { fileId: x.files[0].id, revision: 1 } }];
        return f.project(x);
      }); expectContext(r); A.ok(productDetails(r)[0].context.roles.some(role => role.kind === 'direct-explicit-product'));
    });
    await test('当前章节标题兜底，产品不来自文件名', async () => {
      const r = await evaluate(() => {
        const f = productFixtures, x = f.make({ noTopicEvidence: true, topicQuote: '本节讨论人工道具。' });
        return { p: f.project(x), fileName: x.files[0].name };
      }); expectContext(r.p); A.equal(r.fileName.includes('燕云十六声'), false);
      A.ok(productDetails(r.p)[0].context.topicEvidences.some(q => q.kind === 'source-title-scope'));
    });
    await test('缺产品证据拒绝', async () => expectReject(await evaluate(() => {
      const f = productFixtures, x = f.make({ title: '# 人工章节', noTopicEvidence: true, topicQuote: '人工话题没有产品名。' }); return f.project(x);
    })));
    await test('缺实体逐字证据拒绝', async () => expectReject(await evaluate(() => { const f = productFixtures, x = f.make(); f.data(x.entity).sources = []; return f.project(x); })));
    await test('实体偏移不匹配拒绝', async () => expectReject(await evaluate(() => { const f = productFixtures, x = f.make(); f.data(x.entity).sources[0].start++; return f.project(x); })));
    await test('主话题伪造 quote 拒绝', async () => expectReject(await evaluate(() => {
      const f = productFixtures, x = f.make({ title: '# 人工章节', topicQuote: '当前章节没有产品名。' });
      f.topicData(x).evidences[0].exact_quote = '《燕云十六声》伪造话题证据。'; return f.project(x);
    })));
    await test('直接 explicit 优先且不追加 contextual', async () => {
      const r = await evaluate(() => {
        const f = productFixtures, x = f.make({ entityQuote: '佛光玉属于《人工游戏乙》，可以提升战斗能力。' });
        const d = f.data(x.entity), q = d.sources[0]; d.semanticFacetDetails = [{ dimension: 'product', value: '人工游戏乙', basis: 'explicit', quote: q.quote,
          evidences: [q], source: { fileId: x.files[0].id, revision: 1 } }]; return f.project(x);
      }); A.deepEqual(r.suggestedFacets.product, ['人工游戏乙']); A.ok(productDetails(r).every(d => d.basis === 'explicit'));
    });
    await test('有效直接证据经真实抽取与 normalize 后保留 explicit', async () => {
      const r = await evaluate(() => {
        const f = productFixtures, x = f.make({ entityQuote: '佛光玉属于《燕云十六声》，可以提升战斗能力。' }), d = f.data(x.entity);
        const extracted = extractSemanticFacets({ facets: { product: [{ value: '燕云十六声', basis: 'explicit', quote: x.quotes.entityQuote }] } }, x.files[0].text);
        d.semanticFacetDetails = extracted.facetDetails.map(detail => ({ ...detail, source: { fileId: x.files[0].id, revision: 1 } }));
        normalizeStoredEntityTags(d, savedWorkbook); return { extracted, p: f.project(x) };
      }); A.equal(r.extracted.issues.length, 0); A.equal(r.extracted.facetDetails.length, 1);
      A.deepEqual(r.p.suggestedFacets.product, ['燕云十六声']); A.ok(productDetails(r.p).every(d => d.basis === 'explicit'));
    });
    for (const [name, change] of [
      ['直接证据未含产品，不放宽抽取门禁', 'missing-value'],
      ['直接证据不在原文，不放宽抽取门禁', 'missing-quote'],
      ['直接证据偏移错误，不放宽抽取门禁', 'wrong-offset']
    ]) await test(name, async () => {
      const r = await evaluate(change => {
        const text = '佛光玉属于《燕云十六声》。佛光玉可以提升战斗能力。', good = '佛光玉属于《燕云十六声》。';
        const entry = { value: '燕云十六声', basis: 'explicit', quote: change === 'missing-value' ? '佛光玉可以提升战斗能力。' : change === 'missing-quote' ? '不存在的产品说明燕云十六声' : good };
        if (change === 'wrong-offset') { entry.start = 1; entry.end = 1 + entry.quote.length; }
        return extractSemanticFacets({ facets: { product: [entry] } }, text);
      }, change); A.equal(r.facetDetails.length, 0); A.ok(r.issues.length > 0);
    });
    await test('inferred 产品与版本仍拒绝', async () => {
      const r = await evaluate(() => extractSemanticFacets({ facets: {
        product: [{ value: '燕云十六声', basis: 'inferred', quote: '燕云十六声 v1', reason: '人工推断' }],
        version: [{ value: 'v1', basis: 'inferred', quote: '燕云十六声 v1', reason: '人工推断' }]
      } }, '燕云十六声 v1')); A.equal(r.facetDetails.length, 0); A.equal(r.issues.length, 2);
    });
    await test('主话题游戏锚点有 explicit 版本也不得继承', async () => {
      const r = await evaluate(() => {
        const f = productFixtures, x = f.make({ scope: null, anchor: true }), a = f.data(x.anchor);
        const quote = '《燕云十六声》在 v9 提供角色成长玩法。'; x.files[0].text += '\n' + quote;
        const proof = f.proof(x.files[0], quote); a.sources.push({ ...proof, quote });
        a.semanticFacetDetails = [{ dimension: 'version', value: 'v9', basis: 'explicit', quote, evidences: [proof], source: { fileId: x.files[0].id, revision: 1 } }];
        return f.project(x);
      }); expectContext(r); A.deepEqual(r.suggestedFacets.version, []); A.equal(r.facetDetails.some(d => d.dimension === 'version'), false);
    });
    await test('仅主话题，不从关联话题广播', async () => expectReject(await evaluate(() => {
      const f = productFixtures, x = f.make({ scope: null, anchor: true }), d = f.data(x.entity);
      d.primaryTopic = 'PC-T-NONE'; d.topics.push('PC-T-NONE');
      const neutral = { ...structuredClone(f.topicData(x)), id: 'PC-T-NONE', name: '人工通用机制', object_anchor: '人工通用机制' };
      x.topics.push(f.bindTopic(neutral, x.files[0])); return f.project(x);
    })));
    await test('多产品身份范围拒绝', async () => expectReject(await evaluate(() => productFixtures.project(productFixtures.make({ scope: '燕云十六声、人工游戏乙' })))));
    await test('跨产品主话题拒绝', async () => expectReject(await evaluate(() => productFixtures.project(productFixtures.make({ topicName: '跨产品道具对比', objectAnchor: '跨游戏比较' })))));
    await test('跨主话题同来源仍可互证产品', async () => {
      // 攻略里产品名常只出现在标题与个别词条，"游戏本体"实体常挂在另一个主话题下；
      // 按主话题分组会让资源/机制类实体永远拿不到确认角色。确认角色应覆盖同来源全部话题。
      const r = await evaluate(() => {
        const f = productFixtures, x = f.make({ scope: null, anchor: true });
        const gameTopicId = 'PC-T-GAME', anchor = f.data(x.anchor);
        anchor.primaryTopic = gameTopicId; anchor.topics = [gameTopicId];
        x.topics.push(f.bindTopic({ id: gameTopicId, name: '人工游戏本体的独立话题', object_anchor: x.product,
          definition: '游戏本体话题', scope: '游戏本体', core_question: '这是一款什么游戏',
          includes: ['游戏本体'], excludes: [], evidences: [] }, x.files[0]));
        return f.project(x);
      }); expectContext(r);
    });
    await test('同来源已确认产品冲突拒绝', async () => expectReject(await evaluate(() => {
      const f = productFixtures, x = f.make({ anchor: true });
      const quote = '《人工游戏乙》提供角色成长玩法。'; x.files[0].text += '\n' + quote;
      const other = structuredClone(f.data(x.anchor)); other.id = 'PC-G-CONFLICT'; other.name = '人工游戏乙';
      other.identityAnchors.productIpScope = '人工游戏乙'; other.sources = [{ ...f.proof(x.files[0], quote), quote }];
      x.entities.push(f.bindEntity(other, x.files[0])); return f.project(x);
    })));
    await test('同来源身份与主话题冲突拒绝', async () => expectReject(await evaluate(() => productFixtures.project(productFixtures.make({ scope: '人工游戏乙' })))));
    await test('身份待复核拒绝', async () => expectReject(await evaluate(() => { const f = productFixtures, x = f.make(); f.data(x.entity).identityDecision = 'review'; return f.project(x); })));
    await test('不同来源贡献独立，坏来源不污染好来源', async () => {
      const r = await evaluate(() => { const f = productFixtures, x = f.multi(); x.entity.fileContributions[1].data.identityAnchors.productIpScope = '冲突产品'; return f.project(x); });
      expectContext(r); A.equal(productDetails(r).filter(d => d.source.fileId === 'PC-F-B').length, 0);
    });
    await test('同一实体多来源可分别得到不同产品', async () => {
      const r = await evaluate(() => productFixtures.project(productFixtures.multi(true)));
      A.deepEqual(r.suggestedFacets.product.slice().sort(), ['人工游戏乙', '燕云十六声'].sort());
      A.ok(productDetails(r).some(d => d.basis === 'contextual' && d.value === '人工游戏乙' && d.source.fileId === 'PC-F-B'));
      A.ok(productDetails(r).some(d => d.basis === 'contextual' && d.value === '燕云十六声' && d.source.fileId === 'PC-F-A'));
    });
    for (const [name, mutation] of [
      ['纯投影删除来源立即失效', 'file'], ['纯投影 revision 变化立即失效', 'revision'], ['纯投影删除主话题立即失效', 'topic']
    ]) await test(name, async () => {
      const r = await evaluate(mutation => {
        const f = productFixtures, x = f.make(), before = f.project(x);
        if (mutation === 'file') x.files = []; if (mutation === 'revision') x.files[0].revision++; if (mutation === 'topic') x.topics = [];
        return { before, after: f.project(x) };
      }, mutation); expectContext(r.before); expectReject(r.after);
    });
    await test('锚点删除立即失效，不读取上次派生缓存', async () => {
      const r = await evaluate(() => { const f = productFixtures, x = f.make({ scope: null, anchor: true }), before = f.project(x); x.entities = [x.entity]; return { before, after: f.project(x) }; });
      expectContext(r.before); expectReject(r.after);
    });
    await test('锚点 revision 失效不能继续支持', async () => expectReject(await evaluate(() => { const f = productFixtures, x = f.make({ scope: null, anchor: true }); x.anchor.fileContributions[0].revision++; return f.project(x); })));
    await test('无贡献历史：完整唯一来源但无正文诊断拒绝', async () => {
      const r = await evaluate(() => {
        const f = productFixtures, x = f.make(); x.entity = structuredClone(f.data(x.entity)); x.entities = [x.entity];
        x.topics = [{ ...structuredClone(f.topicData(x)), fileId: x.files[0].id, revision: 1 }];
        for (const q of [...x.entity.sources, ...x.topics[0].evidences]) { delete q.start; delete q.end; }
        x.files[0].text = null; return f.project(x);
      }); expectReject(r); A.ok(r.productContextIssues.some(i => i.code === 'PRODUCT_CONTEXT_EVIDENCE_UNVERIFIABLE'));
    });
    await test('无贡献历史：有正文无 offsets 允许且不伪造偏移', async () => {
      const r = await evaluate(() => {
        const f = productFixtures, x = f.make(); x.entity = structuredClone(f.data(x.entity)); x.entities = [x.entity];
        x.topics = [{ ...structuredClone(f.topicData(x)), fileId: x.files[0].id, revision: 1 }];
        for (const q of [...x.entity.sources, ...x.topics[0].evidences]) { delete q.start; delete q.end; }
        return { p: f.project(x), text: x.files[0].text };
      }); expectContext(r.p);
      for (const d of productDetails(r.p)) for (const q of [...d.evidences, ...d.context.entityEvidences, ...d.context.topicEvidences]) {
        A.equal(q.start, undefined); A.equal(q.end, undefined); A.ok(r.text.includes(q.exact_quote));
      }
    });
    await test('真实 migration：legacy 来源与空正文诊断拒绝', async () => {
      const r = await evaluate(() => {
        const f = productFixtures, x = f.make(), entity = structuredClone(f.data(x.entity));
        entity.sources = [{ file: x.files[0].name, quote: x.quotes.entityQuote }];
        state.previews = [entity]; state.previewTopics = [structuredClone(f.topicData(x))]; state.files = [];
        // 仅清除隔离 context 的新版事务键，让真实 migration 读取人工旧记录。
        localStorage.removeItem(FILE_WORKSPACE_KEY); fileWorkspaceRaw = null; migrateFileWorkspace();
        return { p: f.currentProjection(), files: state.files, entity: allEntities()[0],
          stored: JSON.parse(localStorage.getItem(FILE_WORKSPACE_KEY)) };
      }); expectReject(r.p); A.equal(r.files.length, 1); A.equal(r.files[0].legacy, true); A.equal(r.files[0].text, null);
      A.equal(r.entity.fileContributions.length, 1); A.equal(r.entity.fileContributions[0].legacy, true);
      A.equal(r.entity.fileContributions[0].fileId, r.files[0].id); A.equal(r.entity.fileContributions[0].revision, 1);
      A.ok(r.p.productContextIssues.some(i => i.code === 'PRODUCT_CONTEXT_EVIDENCE_UNVERIFIABLE' && i.source.fileId === r.files[0].id));
      A.deepEqual(r.stored.entities[0].suggestedFacets.product, []);
      A.equal(r.stored.entities[0].semanticFacetDetails.some(d => d.basis === 'contextual'), false);
    });
    for (const [name, legacy] of [['legacy 文件即使有正文仍诊断拒绝', 'file'], ['legacy 贡献即使有正文仍诊断拒绝', 'contribution']]) await test(name, async () => {
      const r = await evaluate(legacy => {
        const f = productFixtures, x = f.make();
        if (legacy === 'file') x.files[0].legacy = true; else x.entity.fileContributions[0].legacy = true;
        return { p: f.project(x), text: x.files[0].text };
      }, legacy); A.equal(typeof r.text, 'string'); expectReject(r.p);
      A.ok(r.p.productContextIssues.some(i => i.code === 'PRODUCT_CONTEXT_EVIDENCE_UNVERIFIABLE'));
    });
    await test('无贡献历史：多来源顶层范围拒绝', async () => expectReject(await evaluate(() => { const f = productFixtures, x = f.multi(); delete x.entity.fileContributions; return f.project(x); })));
    for (const [name, key] of [['旧无 fileId 安全拒绝', 'fileId'], ['旧无 revision 安全拒绝', 'revision']]) await test(name, async () => expectReject(await evaluate(key => {
      const f = productFixtures, x = f.make(); x.entity = structuredClone(f.data(x.entity)); x.entities = [x.entity];
      for (const q of x.entity.sources) delete q[key]; return f.project(x);
    }, key)));
    await test('历史 sources 混有不完整来源拒绝', async () => expectReject(await evaluate(() => {
      const f = productFixtures, x = f.make(); x.entity = structuredClone(f.data(x.entity)); x.entity.sources.push({ file: '只有文件名', quote: x.quotes.entityQuote }); return f.project(x);
    })));
    for (const [name, contribution] of [['contextual 缓存 normalize 后不能 legacy 复活', false], ['贡献内 contextual 缓存 normalize 后不能 legacy 复活', true]]) await test(name, async () => {
      const r = await evaluate(contribution => {
        const f = productFixtures, x = f.make(), cached = f.project(x);
        const data = contribution ? f.data(x.entity) : x.entity;
        data.semanticFacetDetails = structuredClone(cached.facetDetails); data.suggestedFacets = structuredClone(cached.suggestedFacets);
        if (!contribution) { delete x.entity.fileContributions; x.entities = [x.entity]; }
        normalizeStoredEntityTags(data, savedWorkbook); x.files = []; x.topics = [];
        return { p: f.project(x), stored: semanticFacetStorage(data) };
      }, contribution); A.deepEqual(r.p.suggestedFacets.product, []); A.equal(productDetails(r.p).length, 0);
      A.deepEqual(r.stored.suggestedFacets.product, []); A.equal(productDetails(r.stored).length, 0);
    });
    for (const basis of ['explicit', 'legacy']) await test(`同值 contextual 缓存与独立 ${basis} 详情共存不误清`, async () => {
      const cases = await evaluate(basis => {
        const f = productFixtures;
        return ['root', 'tags'].map(container => {
          const x = f.make(), cached = f.project(x), data = f.data(x.entity);
          const quote = '佛光玉属于《燕云十六声》，这是独立保存的产品事实。'; x.files[0].text += '\n' + quote;
          const independent = { dimension: 'product', value: x.product, basis, quote, reason: '人工独立事实',
            evidences: [f.proof(x.files[0], quote)], source: { fileId: x.files[0].id, revision: 1, file: x.files[0].name } };
          data.suggestedFacets = structuredClone(cached.suggestedFacets);
          data.semanticFacetDetails = [independent];
          if (container === 'root') data.semanticFacetDetails.push(...structuredClone(cached.facetDetails));
          else data.tags.semanticFacetDetails = structuredClone(cached.facetDetails);
          const clean = clearDerivedSemanticStorage(data);
          normalizeStoredEntityTags(data, savedWorkbook);
          const active = f.project(x);
          x.files = []; x.topics = [];
          return { container, cached, independent, clean, active, normalized: structuredClone(data), stored: semanticFacetStorage(data), p: f.project(x) };
        });
      }, basis); A.equal(cases.length, 2);
      for (const r of cases) {
        expectContext(r.cached);
        A.deepEqual(r.clean.suggestedFacets.product, ['燕云十六声']);
        A.deepEqual(r.clean.semanticFacetDetails, [r.independent]);
        A.equal((r.clean.tags.semanticFacetDetails || []).some(d => d.basis === 'contextual'), false);
        A.deepEqual(r.normalized.suggestedFacets.product, ['燕云十六声']);
        A.deepEqual(r.normalized.semanticFacetDetails, [r.independent]);
        A.deepEqual(r.active.suggestedFacets.product, ['燕云十六声']);
        A.ok(productDetails(r.active).some(d => d.basis === basis && d.quote === r.independent.quote));
        if (basis === 'explicit') A.equal(productDetails(r.active).some(d => d.basis === 'contextual'), false);
        else A.ok(productDetails(r.active).some(d => d.basis === 'contextual'));
        for (const p of [r.stored, r.p]) {
          A.deepEqual(p.suggestedFacets.product, ['燕云十六声']); A.equal(productDetails(p).length, 1);
          A.equal(productDetails(p)[0].basis, basis); A.equal(productDetails(p)[0].quote, r.independent.quote);
          A.deepEqual(productDetails(p)[0].evidences, r.independent.evidences);
          A.deepEqual(productDetails(p)[0].source, r.independent.source);
          A.equal(p.facetDetails.some(d => d.basis === 'contextual'), false);
        }
      }
    });
    await test('同一临时 context 重复读取一致且无持久副作用', async () => {
      const r = await evaluate(() => {
        const f = productFixtures, before = f.signature(), context = knowledgeSemanticContexts(), e = allEntities().find(e => e.id === 'PC-E-A');
        const direct = entitySemanticFacets(e, context), cached = knowledgeEntitySemanticFacets(e, context);
        const sizes = () => Object.fromEntries(Object.entries(context.productContextIndex).filter(([, v]) => v instanceof Map).map(([k, v]) => [k, v.size]));
        const initialSizes = sizes(), repeated = [], references = [];
        for (let i = 0; i < 3; i++) {
          repeated.push(entitySemanticFacets(e, context));
          references.push(knowledgeEntitySemanticFacets(e, context) === cached);
          entityFilterValues(e, 'product', context); renderSemanticFacetRows(e, context);
        }
        return { direct, cached, repeated, references, initialSizes, finalSizes: sizes(),
          projectionSize: context.semanticProjection.size, before, after: f.signature(),
          stored: JSON.parse(localStorage.getItem(FILE_WORKSPACE_KEY)) };
      }); expectContext(r.direct); A.deepEqual(r.cached, r.direct); A.equal(r.repeated.length, 3);
      for (const p of r.repeated) A.deepEqual(p, r.direct);
      A.deepEqual(r.references, [true, true, true]); A.ok(r.initialSizes.files > 0); A.ok(r.initialSizes.records > 0);
      A.deepEqual(r.finalSizes, r.initialSizes); A.equal(r.projectionSize, 1); A.equal(r.after, r.before);
      A.equal(JSON.stringify(r.stored).includes('productContextIndex'), false);
      for (const e of r.stored.entities) { A.deepEqual(e.suggestedFacets.product, []); A.equal(e.semanticFacetDetails.some(d => d.basis === 'contextual'), false); }
    });
    await test('revision 撤回后新 context 不复用旧归属', async () => {
      const r = await evaluate(() => {
        const f = productFixtures; f.seed(f.multi(true));
        const oldContext = knowledgeSemanticContexts(), oldEntity = allEntities().find(e => e.id === 'PC-E-A');
        const oldProjection = knowledgeEntitySemanticFacets(oldEntity, oldContext), oldSnapshot = JSON.stringify(oldProjection);
        const changed = updateArchiveFile('PC-F-A', '人工 revision 撤回.txt', '新正文不再保留旧实体与产品证据。', 90, true);
        const newContext = knowledgeSemanticContexts(), freshBeforeRead = newContext.semanticProjection.size;
        const e = allEntities().find(e => e.id === 'PC-E-A'), after = knowledgeEntitySemanticFacets(e, newContext);
        return { oldProjection, after, directOldEntity: entitySemanticFacets(oldEntity, newContext), changed, freshBeforeRead,
          separate: oldContext !== newContext && oldContext.productContextIndex !== newContext.productContextIndex && oldContext.semanticProjection !== newContext.semanticProjection,
          oldUnchanged: JSON.stringify(oldProjection) === oldSnapshot, revision: state.files.find(f => f.id === 'PC-F-A').revision,
          contributionIds: e.fileContributions.map(c => c.fileId), stored: JSON.parse(localStorage.getItem(FILE_WORKSPACE_KEY)) };
      }); A.equal(r.changed, true); A.equal(r.revision, 2); A.equal(r.separate, true); A.equal(r.freshBeforeRead, 0); A.equal(r.oldUnchanged, true);
      A.deepEqual(r.oldProjection.suggestedFacets.product.slice().sort(), ['燕云十六声', '人工游戏乙'].sort());
      A.ok(productDetails(r.oldProjection).some(d => d.source.fileId === 'PC-F-A'));
      expectContext(r.after, '人工游戏乙', 'PC-F-B'); expectContext(r.directOldEntity, '人工游戏乙', 'PC-F-B');
      for (const p of [r.after, r.directOldEntity]) A.equal(productDetails(p).some(d => d.source.fileId === 'PC-F-A'), false);
      A.deepEqual(r.contributionIds, ['PC-F-B']); A.deepEqual(r.stored.entities[0].suggestedFacets.product, []);
      A.equal(r.stored.entities[0].semanticFacetDetails.some(d => d.basis === 'contextual'), false);
    });
    await test('真实 addLocalPreview 同身份两组同来源聚合贡献保留补全', async () => {
      const r = await evaluate(() => {
        const f = productFixtures, x = f.make(); x.files[0].text += '\n佛光玉也可以用于另一种战斗组合。';
        commitFileWorkspace(x.files, [], []); const input = f.previewInput(x); addLocalPreview(input);
        const e = allEntities().find(e => e.name === '佛光玉');
        return { count: allEntities().length, contributions: e.fileContributions, p: entitySemanticFacets(e, knowledgeSemanticContexts()),
          stored: JSON.parse(localStorage.getItem(FILE_WORKSPACE_KEY)), topics: allTopics().length };
      }); A.equal(r.count, 1); A.equal(r.contributions.length, 1); A.equal(r.topics, 1);
      A.deepEqual(r.contributions.map(c => [c.fileId, c.revision]), [['PC-F-A', 1]]);
      const expectedQuotes = ['佛光玉可以提升角色的战斗能力。', '佛光玉也可以用于另一种战斗组合。'];
      A.deepEqual(r.contributions[0].data.sources.map(q => q.quote).sort(), expectedQuotes.slice().sort());
      A.equal(new Set(r.contributions.flatMap(c => c.data.sources.map(q => q.quote))).size, 2); expectContext(r.p);
      A.ok(productDetails(r.p).some(d => expectedQuotes.every(q => d.context.entityEvidences.some(e => e.exact_quote === q))));
      A.equal(r.stored.entities.length, 1); A.equal(r.stored.entities[0].fileContributions.length, 1);
      A.deepEqual(r.stored.entities[0].fileContributions[0].data.sources.map(q => q.quote).sort(), expectedQuotes.slice().sort());
      for (const c of r.stored.entities[0].fileContributions) { A.deepEqual(c.data.suggestedFacets.product, []); A.equal(c.data.semanticFacetDetails.some(d => d.basis === 'contextual'), false); }
    });
    await test('resolver 读取旧同来源两条兼容贡献保留两 quotes 与补全', async () => {
      const r = await evaluate(() => {
        const f = productFixtures, x = f.make(), secondQuote = '佛光玉也可以用于另一种战斗组合。';
        x.files[0].text += '\n' + secondQuote;
        const second = structuredClone(x.entity.fileContributions[0]);
        second.data.sources = [{ ...f.proof(x.files[0], secondQuote), quote: secondQuote }]; second.data.facts = [secondQuote];
        x.entity.fileContributions.push(second);
        const before = JSON.stringify(x), p = entitySemanticFacets(x.entity, { topics: x.topics, entities: x.entities, files: x.files, workbook: x.workbook });
        return { p, contributions: x.entity.fileContributions, before, after: JSON.stringify(x), quotes: [x.quotes.entityQuote, secondQuote] };
      }); A.equal(r.contributions.length, 2);
      A.deepEqual(r.contributions.map(c => [c.fileId, c.revision]), [['PC-F-A', 1], ['PC-F-A', 1]]);
      A.deepEqual(r.contributions.flatMap(c => c.data.sources.map(q => q.quote)).sort(), r.quotes.slice().sort());
      expectContext(r.p); A.equal(r.p.productContextIssues.some(i => i.code === 'PRODUCT_CONTEXT_CONTRIBUTION_AMBIGUOUS'), false);
      A.ok(productDetails(r.p).some(d => r.quotes.every(q => d.context.entityEvidences.some(e => e.exact_quote === q))));
      A.equal(r.after, r.before);
    });
    await test('同来源重复贡献发生身份冲突仍拒绝', async () => expectReject(await evaluate(() => {
      const f = productFixtures, x = f.make(), bad = structuredClone(x.entity.fileContributions[0]); bad.data.identityAnchors.productIpScope = '人工游戏乙';
      x.entity.fileContributions.push(bad); return f.project(x);
    })));
    for (const [name, options] of [
      ['Halo 不得匹配 Halo 2 话题', { product: 'Halo', title: '# 人工章节', topicName: 'Halo 2：道具', objectAnchor: 'Halo 2', topicQuote: '《Halo 2》介绍道具玩法。' }],
      ['Halo 不得借 Halo 2 quote 与空格边界误归属', { product: 'Halo', title: '# 人工章节', topicQuote: 'Halo 2 提供道具玩法。' }],
      ['中文产品不得匹配书名号外传', { product: '仙剑奇侠传', title: '# 人工章节', topicName: '《仙剑奇侠传外传》：道具', objectAnchor: '《仙剑奇侠传外传》', topicQuote: '《仙剑奇侠传外传》介绍道具玩法。' }],
      ['中文产品不得匹配裸名称外传', { product: '仙剑奇侠传', title: '# 人工章节', topicQuote: '仙剑奇侠传外传提供道具玩法。' }]
    ]) await test(name, async () => expectReject(await evaluate(options => productFixtures.project(productFixtures.make(options)), options)));
    for (const [name, product] of [['Halo 2 完整产品名正例', 'Halo 2'], ['奥日与黑暗森林完整产品名正例', '奥日与黑暗森林'], ['跨越星弧完整产品名正例', '跨越星弧']]) await test(name, async () => {
      expectContext(await evaluate(product => productFixtures.project(productFixtures.make({ product })), product), product);
    });
    await test('错主话题 quote 加其他章节游戏锚点不得广播', async () => expectReject(await evaluate(() => {
      const f = productFixtures, x = f.make({ scope: null, anchor: true, title: '# 人工目录', topicQuote: '本章节只讨论人工机制。' });
      const anchorQuote = x.quotes.anchorQuote, otherQuote = '《燕云十六声》是另一章节的游戏。';
      x.files[0].text = '# 人工目录\n## 燕云十六声：游戏章节\n' + otherQuote + '\n' + anchorQuote + '\n## 人工机制\n' + x.quotes.topicQuote + '\n' + x.quotes.entityQuote;
      f.data(x.entity).sources = [{ ...f.proof(x.files[0], x.quotes.entityQuote), quote: x.quotes.entityQuote }];
      f.topicData(x).evidences = [f.proof(x.files[0], x.quotes.topicQuote)];
      f.data(x.anchor).sources = [{ ...f.proof(x.files[0], anchorQuote), quote: anchorQuote }];
      f.data(x.anchor).primaryTopic = 'PC-T-OTHER'; f.data(x.anchor).topics = ['PC-T-OTHER'];
      x.topics.push(f.bindTopic({ ...structuredClone(f.topicData(x)), id: 'PC-T-OTHER', evidences: [f.proof(x.files[0], otherQuote)] }, x.files[0]));
      return f.project(x);
    })));
    await test('误标同主话题的跨章节游戏锚点仍不得广播', async () => expectReject(await evaluate(() => {
      const f = productFixtures, x = f.make({ scope: null, anchor: true, topicQuote: '本节只讨论人工机制。' });
      x.files[0].text = '# 人工目录\n## 燕云十六声：游戏章节\n' + x.quotes.anchorQuote + '\n## 人工机制\n' + x.quotes.topicQuote + '\n' + x.quotes.entityQuote;
      f.data(x.entity).sources = [{ ...f.proof(x.files[0], x.quotes.entityQuote), quote: x.quotes.entityQuote }];
      f.topicData(x).evidences = [f.proof(x.files[0], x.quotes.topicQuote)];
      f.data(x.anchor).sources = [{ ...f.proof(x.files[0], x.quotes.anchorQuote), quote: x.quotes.anchorQuote }];
      // 故意保持同 primaryTopic 的坏映射；章节证据仍不能从其他章节广播。
      return f.project(x);
    })));
    await test('标题不能跨越同级章节边界', async () => expectReject(await evaluate(() => {
      const f = productFixtures, x = f.make({ noTopicEvidence: true });
      x.files[0].text = '# 人工目录\n## 燕云十六声：其他章节\n其他内容。\n## 人工目标章节\n' + x.quotes.entityQuote;
      f.data(x.entity).sources = [{ ...f.proof(x.files[0], x.quotes.entityQuote), quote: x.quotes.entityQuote }]; return f.project(x);
    })));
    await test('产品游戏锚点必须有效受控类型', async () => expectReject(await evaluate(() => {
      const f = productFixtures, x = f.make({ scope: null, anchor: true }); f.data(x.anchor).tags = { type: ['游戏产品'], typeId: 'ET-CONTENT-ITEM' }; return f.project(x);
    })));
    await test('锚点只有候选或 legacy 产品不构成可信角色', async () => expectReject(await evaluate(() => {
      const f = productFixtures, x = f.make({ scope: null, anchor: true }), a = f.data(x.anchor);
      a.tags = { type: ['道具'], typeId: 'ET-CONTENT-ITEM' }; a.identityAnchors.productIpScope = null;
      a.suggestedFacets.product = ['燕云十六声']; a.candidateTags = ['产品:燕云十六声']; return f.project(x);
    })));

    await test('UI 详情、产品筛选、全库与筛选 snapshot 一致且保留隐藏锚点', async () => {
      await openProductFilters();
      await page.locator('[data-entity="PC-E-A"]').click();
      const text = await page.locator('#entityDetail').innerText(); A.ok(text.includes('主话题上下文')); A.ok(text.includes('燕云十六声'));
      A.ok(text.includes('产品证据：')); A.ok(text.includes('实体证据：')); A.equal(text.includes('旧值未验证'), false);
      const all = await snapshot(), allRow = rowFor(all); A.equal(allRow['产品'], '燕云十六声');
      A.ok(JSON.parse(allRow['分面依据详情JSON']).some(d => d.basis === 'contextual'));
      await page.locator('[data-filter-key="product"][data-filter-value="燕云十六声"]').click();
      await page.locator('#entitySearch').fill('佛光玉');
      const ids = await evaluate(() => knowledgeScopedEntities().map(e => e.id)); A.deepEqual(ids, ['PC-E-A']);
      const filtered = await snapshot('filtered'), filteredRow = rowFor(filtered);
      A.equal(filtered.counts.entities, 1); A.equal(all.counts.entities, 2); A.equal(filteredRow['产品'], allRow['产品']);
      A.deepEqual(JSON.parse(filteredRow['分面依据详情JSON']), JSON.parse(allRow['分面依据详情JSON']));
      A.equal(rows(filtered, '实体清单').some(r => r['主类型ID'] === 'ET-PROD-GAME'), false);
      A.ok(JSON.parse(filteredRow['分面依据详情JSON']).some(d => d.context.roles.some(role => role.kind === 'confirmed-game-entity')));
      A.equal(await page.locator('#entityRows [data-entity="PC-E-A"]').count(), 1);
    });
    await test('真实 xlsx 下载并读回 contextual 与证据', async () => {
      current.phase = '筛选与导出准备';
      await openProductFilters();
      await page.locator('[data-filter-key="product"][data-filter-value="燕云十六声"]').click();
      await page.locator('#entitySearch').fill('佛光玉'); await page.locator('#knowledgeExportScope').selectOption('filtered');
      const expected = await snapshot('filtered'), signature = await evaluate(() => productFixtures.signature());
      current.phase = '真实下载';
      const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#knowledgeExportBtn').click()]);
      await download.saveAs(xlsxPath); await page.waitForFunction(() => !knowledgeExportBusy);
      current.phase = 'xlsx 读回与副作用检查';
      A.equal(await download.failure(), null); A.ok(download.suggestedFilename().endsWith('.xlsx'));
      const bytes = fs.readFileSync(xlsxPath); A.equal(bytes.subarray(0, 2).toString(), 'PK');
      const book = XLSX.read(bytes, { type: 'buffer', cellFormula: true });
      A.deepEqual(book.SheetNames, expected.sheets.map(s => s.name));
      const readRows = XLSX.utils.sheet_to_json(book.Sheets['实体清单'], { defval: '' });
      A.equal(readRows.length, 1); A.equal(readRows[0]['实体ID'], 'PC-E-A'); A.equal(readRows[0]['产品'], '燕云十六声');
      A.deepEqual(JSON.parse(readRows[0]['分面依据详情JSON']), JSON.parse(rowFor(expected)['分面依据详情JSON']));
      const evidenceRows = XLSX.utils.sheet_to_json(book.Sheets['来源证据'], { defval: '' });
      for (const kind of ['产品上下文产品证据', '产品上下文实体证据', '产品上下文主话题证据']) A.ok(evidenceRows.some(r => r['证据类型'] === kind));
      for (const s of Object.values(book.Sheets)) { A.ok(s['!autofilter']); for (const [address, cell] of Object.entries(s)) if (!address.startsWith('!')) { A.equal(cell.t, 's'); A.equal(cell.f, undefined); A.equal(cell.l, undefined); } }
      A.equal(await evaluate(() => productFixtures.signature()), signature); report.artificialXlsx = path.relative(root, xlsxPath).replace(/\\/g, '/');
    });
    for (const width of [1440, 760, 390]) await test(`${width} 宽度布局与实际点击`, async () => {
      await page.setViewportSize({ width, height: 1000 });
      await openProductFilters();
      await page.locator('[data-filter-key="product"][data-filter-value="燕云十六声"]').click();
      A.deepEqual(await evaluate(() => [...state.filters.product]), ['燕云十六声']);
      await page.locator('[data-entity="PC-E-A"]').click(); A.ok((await page.locator('#entityDetail').innerText()).includes('主话题上下文'));
      await page.locator('#clearFiltersBtn').click(); A.deepEqual(await evaluate(() => [...state.filters.product]), []);
      await page.locator('[data-entity="PC-E-A"]').focus(); await page.locator('[data-entity="PC-E-A"]').press('Enter');
      A.equal(await evaluate(() => state.selectedEntity), 'PC-E-A');
      const layout = await evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        panels: ['topicStrip', 'entityRows', 'entityDetail'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return { id, left: r.left, right: r.right, width: r.width }; }) }));
      A.ok(layout.scrollWidth <= layout.width + 1, '页面出现横向溢出');
      for (const panel of layout.panels) { A.ok(panel.width > 0); A.ok(panel.left >= -1); A.ok(panel.right <= width + 1); }
      await page.locator('#knowledgeExportBtn').click({ trial: true }); report.layouts.push(layout);
    });
    await test('人工 fixture 截图', async () => {
      await page.setViewportSize({ width: 1440, height: 1000 }); await page.locator('[data-entity="PC-E-A"]').click();
      await evaluate(() => { scrollTo(0, 0); document.getElementById('toast').classList.remove('show'); });
      await page.screenshot({ path: screenshotPath, fullPage: true });
      A.ok(fs.statSync(screenshotPath).size > 0); report.screenshot = path.relative(root, screenshotPath).replace(/\\/g, '/');
    });
    await test('真实来源删除仅撤销隔离 workspace 的对应贡献', async () => {
      const r = await evaluate(() => {
        const f = productFixtures; f.seed(f.multi(true)); const before = f.currentProjection();
        const deleted = deleteArchiveFile('PC-F-A', true), e = allEntities().find(e => e.id === 'PC-E-A');
        return { before, deleted, after: f.currentProjection(), files: state.files.map(f => f.id), contributions: e.fileContributions.map(c => c.fileId),
          stored: JSON.parse(localStorage.getItem(FILE_WORKSPACE_KEY)).entities[0].suggestedFacets.product };
      }); A.equal(r.deleted, true); A.equal(r.before.suggestedFacets.product.length, 2);
      expectContext(r.after, '人工游戏乙', 'PC-F-B'); A.deepEqual(r.files, ['PC-F-B']); A.deepEqual(r.contributions, ['PC-F-B']); A.deepEqual(r.stored, []);
    });
    await test('真实正文修改提升 revision 并撤销旧派生归属', async () => {
      const r = await evaluate(() => {
        const f = productFixtures; f.seed(f.multi(true)); const before = f.currentProjection();
        const changed = updateArchiveFile('PC-F-A', '人工修改文件.txt', '全新的人工正文，旧证据已经删除。', 80, true);
        return { before, changed, after: f.currentProjection(), revision: state.files.find(f => f.id === 'PC-F-A').revision,
          contributions: allEntities()[0].fileContributions.map(c => c.fileId) };
      }); A.equal(r.changed, true); A.equal(r.before.suggestedFacets.product.length, 2); A.equal(r.revision, 2);
      A.deepEqual(r.contributions, ['PC-F-B']); expectContext(r.after, '人工游戏乙', 'PC-F-B');
    });
    await test('真实 topic 删除后不复用旧 contextual', async () => {
      const r = await evaluate(() => {
        const f = productFixtures; f.seed(f.make()); const before = f.currentProjection();
        // 应用没有独立 topic 删除 API；用真实 workspace 提交删除话题，保留原实体用于失效验证。
        commitFileWorkspace(state.files, [], state.previews); renderKnowledge(); return { before, after: f.currentProjection(), storedTopics: JSON.parse(localStorage.getItem(FILE_WORKSPACE_KEY)).topics };
      }); expectContext(r.before); expectReject(r.after); A.deepEqual(r.storedTopics, []);
    });
    await test('消费层投影、详情与导出无 storage 或业务副作用', async () => {
      const r = await evaluate(() => {
        const f = productFixtures, before = f.signature();
        for (let i = 0; i < 3; i++) {
          for (const e of allEntities()) { entitySemanticFacets(e, knowledgeSemanticContexts()); entityFilterValues(e, 'product'); renderSemanticFacetRows(e); }
          knowledgeExportSnapshot('all'); knowledgeExportSnapshot('filtered'); knowledgeExportWorkbook(knowledgeExportSnapshot(), XLSX);
          renderKnowledge();
        }
        return { before, after: f.signature(), stored: JSON.parse(localStorage.getItem(FILE_WORKSPACE_KEY)) };
      }); A.equal(r.after, r.before);
      for (const e of r.stored.entities) { A.equal(e.semanticFacetDetails.some(d => d.basis === 'contextual'), false); A.deepEqual(e.suggestedFacets.product, []); }
    });
    await test('网络、SDK、模块、页面错误与保护 hash 收尾', async () => {
      const audit = await evaluate(() => productAudit);
      A.deepEqual(audit.modelCalls, []); A.deepEqual(audit.sdkWrites, []); A.ok(audit.disabledInitCalls > 0);
      A.ok(audit.sdkReads.every(t => t === 'wiki_prompt_versions')); A.deepEqual(report.pageErrors, []);
      A.deepEqual([...new Set(report.network.filter(n => n.module).map(n => n.module))].sort(), names.slice().sort());
      A.ok(report.network.every(n => ['local-fulfill', 'empty-fulfill', 'local-xlsx-fulfill', 'sdk-empty-fulfill', 'abort', 'websocket-close'].includes(n.action)));
      A.equal(report.realNetworkRequests, 0); A.equal(report.oldTestsExecuted, 0);
      const after = inventory(); report.protection.after = after; A.deepEqual(after, before); report.protection.unchanged = true;
      report.sdkAudit = audit;
      const downloadScenario = report.scenarios.find(s => s.name === '真实 xlsx 下载并读回 contextual 与证据');
      let downloadReason = '必须至少完成一次真实人工 xlsx 下载';
      if (report.downloads < 1 && downloadScenario?.status !== 'passed') {
        downloadReason = `上游 xlsx 场景失败或未执行，下载前置未完成；不能据此判定应用下载缺陷（阶段：${downloadScenario?.phase || '未到达'}）`;
        current.attribution = 'upstream-dependency';
        report.dependencyFailures.push({ scenario: current.name, dependsOn: downloadScenario?.name || '真实 xlsx 下载并读回 contextual 与证据',
          phase: downloadScenario?.phase || '未到达', reason: downloadReason, upstreamError: downloadScenario?.error || downloadScenario?.reason || '未执行' });
      }
      // 保留真实下载要求；依赖失败仍报告失败，但不挡住独立保护检查。
      A.ok(report.downloads >= 1, downloadReason);
    });
  } catch (error) {
    report.harnessErrors.push(error.stack || error.message); console.error(error.stack || error.message);
  } finally {
    // 未到达场景不是通过；逐项列出阻塞与主助手待处理项。
    for (const name of SCENARIOS) if (!report.scenarios.some(s => s.name === name)) {
      report.scenarios.push({ name, status: 'blocked', assertions: 0, reason: 'harness 提前失败，未执行' });
      report.deferredToMainAssistant.push(name);
    }
    if (browser) try { await browser.close(); } catch (error) { report.harnessErrors.push('浏览器关闭失败：' + error.message); }
    if (before) try {
      report.protection.after = inventory();
      report.protection.unchanged = JSON.stringify(before) === JSON.stringify(report.protection.after);
      if (!report.protection.unchanged) report.harnessErrors.push('源码、旧脚本或旧输出保护 hash 变化；不覆盖、不回滚，请主助手排查并发修改');
    } catch (error) { report.harnessErrors.push('保护 hash 核验失败：' + error.message); }
    report.scenarioCount = SCENARIOS.length;
    report.passed = report.scenarios.filter(s => s.status === 'passed').length;
    report.failed = report.scenarios.filter(s => s.status === 'failed').length;
    report.blocked = report.scenarios.filter(s => s.status === 'blocked').length;
    report.failures = report.scenarios.filter(s => s.status !== 'passed').map(s => ({ name: s.name, status: s.status,
      error: s.error || s.reason, ...(s.phase ? { phase: s.phase } : {}), ...(s.attribution ? { attribution: s.attribution } : {}) }));
    report.status = report.harnessErrors.length || report.failed || report.blocked ? 'failed' : 'passed';
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ status: report.status, scenarios: report.scenarioCount, passed: report.passed,
      failed: report.failed, blocked: report.blocked, assertions: report.assertions, downloads: report.downloads }));
    if (report.status !== 'passed') process.exitCode = 1;
  }
}

// 必须在常量初始化之后调用，避免 main() 在首次 await 之前遇到 TDZ。
if (process.argv.includes('--source-ready')) {
  main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
}
