'use strict';

// 只允许在收到明确的源码就绪通知后执行；node --check 不会执行本文件。
if (process.argv.length !== 3 || process.argv[2] !== '--source-ready') {
  console.error('专项尚未获准运行。收到“源码就绪”通知后，使用 --source-ready 执行。');
  process.exit(2);
}

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const root = 'C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25';
const app = path.join(root, 'wiki-demo-mvp');
const reportPath = path.join(root, 'outputs/wiki-topic-integrity-tests.json');
const screenshotPath = path.join(root, 'outputs/知识Wiki空话题修复-本地.png');
const origin = 'http://127.0.0.1:19431';
const modules = ['index.html', 'semantic-tags.js', 'pipeline.js', 'file-manager.js', 'prompt-history.js'];
const cases = [], contexts = [], sessionInfo = new Map();
const report = {
  kind: '空话题完整性专项：真实五模块 + 隔离模拟SDK；人工夹具，非真实模型结果',
  startedAt: new Date().toISOString(), modules, tests: [], harnessErrors: [], pageErrors: [], dialogs: [],
  network: [], responsive: [], artifacts: [], snapshots: {},
  previousRuns: fs.existsSync(reportPath) ? (() => { const previous = JSON.parse(fs.readFileSync(reportPath, 'utf8')); return [...(previous.previousRuns || []), { startedAt: previous.startedAt, finishedAt: previous.finishedAt, status: previous.status, total: previous.total, passed: previous.passed, failed: previous.failed, blocked: previous.blocked, assertions: previous.assertions, failures: previous.tests.filter(t => !t.pass).map(({ id, name, reason }) => ({ id, name, reason })), applicationUnchanged: previous.applicationAssets?.unchanged, protectedUnchanged: previous.protectedTestsAndArtifacts?.unchanged }]; })() : [],
  testAdjustments: ['每次浏览夹具初始化后清零页面及目录滚动，避免不同视口用例继承之前详情跳转的滚动位置；不使用force点击，不修改应用DOM或样式', '失败诊断增加按钮中心命中栈、遮挡对象旋转与尺寸，确认应用原因后记录明确归因；检查项和原断言期望保持不变', '主代理修复后在原C07和L-760-话题展开内补充未知primary-only隔离诊断、箭头31px命中范围及普通点击断言，检查项总数仍为67'],
  isolation: { origin, serviceWorkers: 'block', realModelCalls: 0, productionCloudWrites: 0, continuedRequests: 0,
    oldTestsExecuted: 0, reusedHarness: '只读取 test-run-timing.cjs 并提取 installMock 函数，不执行旧脚本' },
  runtime: { node: process.execPath, playwright: require.resolve('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright') }
};
let activeCase, browser, sources, sourceHashes, protectedHashes;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function applicationHashes() {
  return Object.fromEntries(fs.readdirSync(app).filter(n => fs.statSync(path.join(app, n)).isFile()).sort().map(n => [n, hash(fs.readFileSync(path.join(app, n)))]));
}
function completedTestHashes() {
  return Object.fromEntries([
    ...fs.readdirSync(path.join(root, '.playwright-cli')).filter(n => n !== 'test-topic-integrity.cjs' && fs.statSync(path.join(root, '.playwright-cli', n)).isFile()).map(n => '.playwright-cli/' + n),
    ...fs.readdirSync(path.join(root, 'outputs')).filter(n => !['wiki-topic-integrity-tests.json', '知识Wiki空话题修复-本地.png'].includes(n) && fs.statSync(path.join(root, 'outputs', n)).isFile()).map(n => 'outputs/' + n)
  ].sort().map(n => [n, hash(fs.readFileSync(path.join(root, n)))]));
}
// JSON 同时记录检查项数量和实际执行的底层 assert 数量，失败后不虚报未执行断言。
const A = new Proxy(assert, { get(target, key) {
  const fn = target[key];
  if (typeof fn !== 'function') return fn;
  return (...args) => {
    activeCase.assertions++;
    try { const result = fn(...args); activeCase.passedAssertions++; return result; }
    catch (error) { activeCase.failedAssertions++; throw error; }
  };
} });
const sorted = values => [...values].sort();
function define(id, name, group, run) { cases.push({ id, name, group, run }); }
async function evaluate(page, fn, argument) { return page.evaluate(fn, argument); }
async function diagnostic(page) {
  if (!page || page.isClosed()) return null;
  return page.evaluate(() => ({
    nav: { topicId: knowledgeNav.topicId, expanded: [...knowledgeNav.expanded], selected: state.selectedEntity, related: state.relatedDetailId, topicFilters: [...state.filters.topic] },
    bottomTopics: allTopics().map(t => t.id), entities: allEntities().map(e => ({ id: e.id, topics: e.topics, primaryTopic: e.primaryTopic })),
    rows: [...document.querySelectorAll('#entityRows [data-entity]')].map(e => e.dataset.entity),
    detail: document.getElementById('entityDetail').innerText.slice(0, 2400),
    layout: { width: innerWidth, scrollY, topbar: document.querySelector('.topbar').getBoundingClientRect().toJSON(), firstTopic: (() => { const el = document.querySelector('#topicStrip [data-nav-topic]'); if (!el) return null; const box = el.getBoundingClientRect(), x = box.x + box.width / 2, y = Math.max(0, Math.min(innerHeight - 1, box.y + box.height / 2)); return { box: box.toJSON(), hitAtCenter: document.elementsFromPoint(x, y).slice(0, 5).map(n => ({ tag: n.tagName, className: n.className, id: n.id, box: n.getBoundingClientRect().toJSON(), transform: getComputedStyle(n).transform, layoutWidth: n.offsetWidth, layoutHeight: n.offsetHeight })) }; })() }
  })).catch(error => ({ diagnosticError: error.message }));
}
async function execute(test, page) {
  activeCase = { id: test.id, name: test.name, group: test.group, status: 'running', assertions: 0, passedAssertions: 0, failedAssertions: 0 };
  const item = activeCase;
  try { const details = await test.run(page); item.status = 'passed'; item.pass = true; if (details !== undefined) item.details = details; }
  catch (error) {
    item.status = 'failed'; item.pass = false; item.reason = error.message; item.stack = error.stack;
    item.failureKind = item.failedAssertions ? '断言失败，需按证据核对应用契约' : '执行异常，需区分应用与测试自身问题';
    item.diagnostic = await diagnostic(page);
    if (item.id.startsWith('L-760-') && /intercepts pointer events/.test(error.message) && item.diagnostic?.layout?.firstTopic?.hitAtCenter[0]?.className === 'map-arrow') {
      item.failureKind = '应用布局交互错误';
      item.rootCause = { summary: '760px下示意图箭头覆盖首个话题按钮中心，普通鼠标点击被拦截；清零夹具滚动后仍复现。箭头在窄屏按90度旋转，横向网格占满宽度后旋转边界形成大面积纵向覆盖。',
        source: ['wiki-demo-mvp/index.html:12', 'wiki-demo-mvp/index.html:16', 'wiki-demo-mvp/index.html:36'],
        evidence: item.diagnostic.layout, layoutMeasurementsReached: false, forcedClickUsed: false };
    }
    console.error('失败 ' + item.id + ' ' + item.name + '：' + error.message);
  }
  report.tests.push(item); activeCase = null;
}
function assertResultReferences(result) {
  const ids = new Set(result.topics.map(t => t.id)), referenced = new Set();
  for (const entity of result.steps.step3.accepted) {
    A.ok(ids.has(entity.primary_topic_id), '主话题必须存在于可浏览结果');
    A.ok(entity.topic_ids.includes(entity.primary_topic_id), '主话题必须包含在 topic_ids');
    A.equal(entity.topic_ids.length, new Set(entity.topic_ids).size, '话题引用应去重');
    for (const id of entity.topic_ids) { A.ok(ids.has(id), '关联话题不得悬空'); referenced.add(id); }
  }
  A.deepEqual(sorted(ids), sorted(referenced), '新结果中不能存在无成员话题');
  A.equal(result.metrics.topics, ids.size);
}

function installFlowMock() {
  const mock = window.topicIntegrityMock = { mode: 'primary-only', calls: [] };
  const factory = WorkBuddyCloud.createWorkBuddyCloud;
  WorkBuddyCloud.createWorkBuddyCloud = function (...args) {
    const client = factory(...args);
    client.llm.chat.completions.create = async function* (options) {
      if (options.signal?.aborted) throw new DOMException('模拟取消', 'AbortError');
      if (options.messages[0].role !== 'system' || !options.stream) throw Error('模拟模型协议错误');
      const input = options.messages[1].content, phase = input.includes('\n全局整合规则：') ? 'integration' : 'extraction';
      mock.calls.push({ phase, mode: mock.mode, inputChars: input.length });
      const f = window.topicIntegrityFixtures;
      let raw;
      if (phase === 'extraction') {
        raw = f.raw(mock.mode === 'no-entities' ? [] : [f.entity('M1', { topic_ids: [], primary_topic_id: 'T1' })]);
      } else {
        const topics = JSON.parse(input.split('全部有效话题候选：')[1].split('\n全部有效实体候选：')[0]);
        const entities = JSON.parse(input.split('全部有效实体候选：')[1].split('\n冻结历史话题')[0]);
        raw = {
          topic_groups: topics.map((t, i) => ({ id: 'GT' + (i + 1), members: [t.id], name: t.name, decision: 'keep', reason: '独立问题保留' })),
          entity_groups: entities.length ? [{ id: 'GE1', members: entities.map(e => e.id), name: entities[0].name, topics: ['GT2', 'MODEL-UNKNOWN'], primary_topic: 'GT2', decision: 'keep', reason: '模拟无支持建议应被隔离' }] : []
        };
      }
      const text = JSON.stringify(raw), middle = Math.floor(text.length / 2);
      yield { choices: [{ delta: { content: text.slice(0, middle) }, finish_reason: null }] };
      yield { choices: [{ delta: { content: text.slice(middle) }, finish_reason: 'stop' }], usage: { total_tokens: 25 } };
    };
    return client;
  };
}

function installFixtures() {
  const source = '巫师3角色入门介绍新手可玩角色。巫师3战斗基础介绍基本战斗操作。巫师3装备选择介绍装备边界。杰洛特是巫师3中玩家可以操控的猎魔人。杰洛特使用银剑。';
  const quotes = ['巫师3角色入门介绍新手可玩角色。', '巫师3战斗基础介绍基本战斗操作。', '巫师3装备选择介绍装备边界。'];
  const f = window.topicIntegrityFixtures = {};
  f.source = source;
  f.topic = (id, index) => ({ id, name: ['角色入门', '战斗基础', '装备选择'][index], definition: '人工专项：' + quotes[index], scope: ['新手角色', '基础战斗', '装备边界'][index], object_anchor: '巫师3', core_question: ['角色如何入门', '战斗如何操作', '装备如何选择'][index], includes: ['仅限' + index], excludes: ['其他问题' + index], quote: quotes[index] });
  f.entity = (id, extra = {}) => ({ id, name: '杰洛特', definition: '人工专项具名角色', quote: '杰洛特是巫师3中玩家可以操控的猎魔人。', aliases: [], anchors: { ontology_type: '可玩角色', reality_domain: '虚构', product_ip_scope: '巫师3', identity_attributes: {} }, type_id: 'ET-CHAR-PLAYABLE', type: '可玩角色', topic_ids: ['T1'], primary_topic_id: 'T1', facets: [], candidate_tags: [], relations: [], ...extra });
  f.raw = (entities = [f.entity('M1')]) => ({ topics: [f.topic('T1', 0), f.topic('T2', 1), f.topic('T3', 2)], entities, review: [] });
  f.part = () => ({ index: 1, text: source, start: 0, end: source.length });
  f.context = (extra = {}) => ({ modelId: 'mock-timing', sourceName: '人工空话题专项.txt', snapshot: { revision: workbookRevision, workbook: savedWorkbook }, parts: [f.part()], historySnapshot: { topics: [], entities: [] }, runControl: { cancelled: false }, ...extra });
  f.validate = raw => validateChunkCandidates(raw, f.part(), source);
  f.mapping = candidates => ({
    topic_groups: candidates.topics.map((t, i) => ({ id: 'GT' + (i + 1), members: [t.id], name: t.name, decision: 'keep', reason: '独立具体问题，保持边界' })),
    entity_groups: candidates.entities.length ? [{ id: 'GE1', members: candidates.entities.map(e => e.id), name: candidates.entities[0].name, topics: ['GT1'], primary_topic: 'GT1', decision: 'keep', reason: '同一具名可玩角色，多证据汇集' }] : []
  });
  f.assemble = (raw = f.raw(), change) => {
    const candidates = f.validate(raw), mapping = f.mapping(candidates);
    if (change) change(candidates, mapping);
    return assembleIntegratedResult(candidates, mapping, source, f.context());
  };
  f.validResult = () => f.assemble(f.raw([f.entity('M1', { topic_ids: ['T1', 'T2'], primary_topic_id: 'T2' })]));
  f.snapshot = () => ({ memory: JSON.stringify([state.files, state.previewTopics, state.previews]), workspaceRaw: fileWorkspaceRaw, storage: [STORE + 'files', STORE + 'topics', STORE + 'previews', FILE_WORKSPACE_KEY].map(k => ({ key: k, value: localStorage.getItem(k) })) });
  f.reset = () => { commitFileWorkspace([], [], []); knowledgeNav.expanded.clear(); knowledgeNav.topicId = null; state.selectedEntity = null; state.relatedDetailId = null; clearFilters(); };
  f.fault = (key, action) => {
    const before = f.snapshot(), original = Storage.prototype.setItem;
    let triggered = 0, error = '';
    Storage.prototype.setItem = function (name, value) { if (name === key && !triggered) { triggered++; throw new DOMException('专项模拟空间不足', 'QuotaExceededError'); } return original.call(this, name, value); };
    try { action(); } catch (e) { error = e.message; } finally { Storage.prototype.setItem = original; }
    return { before, after: f.snapshot(), triggered, error };
  };
  f.file = id => ({ id, name: '人工来源-' + id + '.txt', originalName: '人工来源-' + id + '.txt', text: source, size: source.length * 3, revision: 1, createdAt: '2026-10-12T00:00:00Z', updatedAt: '2026-10-12T00:00:00Z', status: '待解析' });
  f.storedEntity = (id, primary, topics, fileId = 'F1') => ({ id, name: '人工稳定实体', summary: '人工专项，不代表真实知识。', primaryTopic: primary, topics, preview: true, aliases: [], tags: { type: ['可玩角色'], typeId: 'ET-CHAR-PLAYABLE' }, candidateTags: [], reviewReasons: [], suggestedFacets: { product: ['示意产品'], discipline: [], version: [] }, semanticFacetDetails: [], semanticFacetsRecognized: true, sources: [{ file: '人工来源-' + fileId + '.txt', fileId, quote: '人工来源证据-' + fileId }], facts: ['人工来源证据-' + fileId], relations: [] });
  f.stagePack = () => {
    const result = f.validResult(); result.source.file_id = 'F1'; result.source.file_revision = 1;
    commitFileWorkspace([f.file('F1')], [], []);
    const topicMap = new Map(result.topics.map((t, i) => [t.id, 'PT-STAGE-' + i]));
    const entityMap = new Map([['GE1', 'PE-STAGE']]);
    return { result, topicMap, entityMap, topics: result.topics.map(t => ({ ...structuredClone(t), id: topicMap.get(t.id), preview: true, fileContributions: [] })), entities: [f.storedEntity('PE-STAGE', topicMap.get(result.steps.step3.accepted[0].primary_topic_id), result.steps.step3.accepted[0].topic_ids.map(id => topicMap.get(id)))] };
  };
  f.stage = p => stageWikiFileResult(p.result, p.topics, p.entities, p.topicMap, p.entityMap);
  f.contributions = () => {
    const topic = (id, fileId) => { const data = { id, name: '人工话题-' + id, scope: '人工边界-' + id, evidences: [{ exact_quote: '人工话题证据-' + id }] }; return { ...data, fileContributions: [{ fileId, revision: 1, data: structuredClone(data) }] }; };
    const a = f.storedEntity('E-SHARED', 'TA', [], 'F1'), b = f.storedEntity('E-SHARED', 'TB', ['TB', 'BAD', 'TB'], 'F2');
    return { files: ['F1', 'F2', 'FH'].map(f.file), topics: [topic('TA', 'F1'), topic('TB', 'F2'), topic('TH', 'FH')], entities: [{ ...structuredClone(a), fileContributions: [{ fileId: 'F1', revision: 1, data: a }, { fileId: 'F2', revision: 1, data: b }] }] };
  };
  f.seedContributions = () => { const pack = f.contributions(), rebuilt = rebuildFileKnowledge(pack.topics, pack.entities); commitFileWorkspace(pack.files, rebuilt.topics, rebuilt.entities); return rebuilt; };
  f.browseFixture = () => {
    const topics = Array.from({ length: 25 }, (_, i) => ({ id: 'UI-T' + String(i + 1).padStart(2, '0'), name: '人工示意话题' + (i + 1) + '｜长名称与稳定实体、多话题引用以及历史空话题兼容测试｜' + '仅用于本地专项，不代表真实模型结果'.repeat(2), desc: '人工话题摘要-' + (i + 1), scope: '人工界面测试边界', preview: true }));
    const shared = f.storedEntity('UI-SHARED', 'UI-T02', ['UI-T01', 'UI-T01', 'UI-UNKNOWN'], 'UI-A');
    shared.name = '人工共享实体｜一个稳定ID由两个话题引用'; shared.suggestedFacets.product = ['示意产品甲'];
    const only = f.storedEntity('UI-ONLY', 'UI-T01', ['UI-T01'], 'UI-A'); only.name = '人工首话题独有实体'; only.suggestedFacets.product = ['示意产品甲'];
    const legacy = f.storedEntity('UI-LEGACY', 'UI-T03', [], 'UI-B'); legacy.name = '人工旧数据仅有主话题'; legacy.suggestedFacets.product = ['示意产品乙'];
    shared.relations = [{ type: '人工关联', targetId: legacy.id, targetName: legacy.name, strength: 'weak', evidence: '人工关联证据，仅用于界面测试' }];
    return { topics, entities: [shared, only, legacy] };
  };
  f.seedBrowse = () => {
    const fixture = f.browseFixture(); commitFileWorkspace([], fixture.topics, fixture.entities);
    knowledgeNav.expanded.clear(); knowledgeNav.topicId = null; state.selectedEntity = null; state.relatedDetailId = null;
    clearFilters(); setPage('knowledge'); openKnowledgeOverview(); document.querySelector('details.browse-filters').open = false;
    document.getElementById('topicStrip').scrollTop = 0; window.scrollTo(0, 0);
    return fixture;
  };
}

async function createSession(group, mockCode) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, serviceWorkers: 'block' });
  contexts.push(context);
  await context.addInitScript({ content: mockCode });
  await context.addInitScript(installFlowMock);
  const info = { loaded: [], writes: [], queries: [] }; sessionInfo.set(group, info);
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    const entry = { group, method: request.method(), url: request.url(), action: '' }; report.network.push(entry);
    if (request.method() !== 'GET' || url.pathname.startsWith('/.cloud/')) { entry.action = '禁止云接口或非GET'; return route.abort('blockedbyclient'); }
    if (url.origin === origin) {
      const name = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      if (Object.hasOwn(sources, name)) { info.loaded.push(name); entry.action = '真实本地模块'; return route.fulfill({ contentType: name.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript; charset=utf-8', body: sources[name] }); }
      if (name.endsWith('.xlsx')) { entry.action = '模拟工作簿'; return route.fulfill({ contentType: 'application/octet-stream', body: Buffer.from('mock-workbook') }); }
      entry.action = '禁止未知本地资源'; return route.abort('blockedbyclient');
    }
    if (request.resourceType() === 'script') { entry.action = '空外部脚本'; return route.fulfill({ contentType: 'application/javascript', body: '' }); }
    entry.action = '禁止外部资源'; return route.abort('blockedbyclient');
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => report.pageErrors.push({ group, message: error.message }));
  page.on('dialog', async dialog => { report.dialogs.push({ group, type: dialog.type(), message: dialog.message() }); await dialog.dismiss(); });
  await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => wikiPromptHistory.getController().status().ready && workbookReady && !cloudLoading && fileManagerReady);
  await page.evaluate(installFixtures);
  return { context, page, info };
}
const nav = (p, id) => p.locator(`#topicStrip [data-nav-topic="${id}"]`);
const navEntity = (p, id, topic) => p.locator(`#topicStrip [data-nav-entity="${id}"][data-parent-topic="${topic}"]`);
const row = (p, id) => p.locator(`#entityRows [data-entity="${id}"]`);
const rows = p => p.locator('#entityRows [data-entity]').evaluateAll(nodes => nodes.map(n => n.dataset.entity).sort());
const metrics = p => p.locator('#entityDetail .overview-metric strong').evaluateAll(nodes => nodes.map(n => Number(n.textContent)));
const seedBrowse = p => evaluate(p, () => topicIntegrityFixtures.seedBrowse());

// 候选校验与整合，全部直接调用真实函数，不启动旧测试。
define('C01', '候选仅有效primary：并入topic_ids，不依赖单话题兜底', 'pipeline', async p => {
  const e = await evaluate(p, () => { const f = topicIntegrityFixtures; return f.validate(f.raw([f.entity('M1', { topic_ids: [], primary_topic_id: 'T2' })])).entities[0]; });
  A.deepEqual(e.topic_ids, ['P1-T2']); A.equal(e.primary_topic_id, 'P1-T2');
});
define('C02', '重复topics与primary去重；无效topics不能进入有效引用', 'pipeline', async p => {
  const e = await evaluate(p, () => { const f = topicIntegrityFixtures; return f.validate(f.raw([f.entity('M1', { topic_ids: ['T1', 'T1', 'T2', 'T2', 'BAD'], primary_topic_id: 'T3' })])).entities[0]; });
  A.deepEqual(sorted(e.topic_ids), ['P1-T1', 'P1-T2', 'P1-T3']); A.equal(e.topic_ids.length, 3); A.equal(e.primary_topic_id, 'P1-T3');
});
define('C03', '无效primary不得保留；已有有效引用成为primary', 'pipeline', async p => {
  const e = await evaluate(p, () => { const f = topicIntegrityFixtures; return f.validate(f.raw([f.entity('M1', { topic_ids: ['T2'], primary_topic_id: 'BAD' })])).entities[0]; });
  A.deepEqual(e.topic_ids, ['P1-T2']); A.equal(e.primary_topic_id, 'P1-T2');
});
define('C04', '全部引用无效且存在多个话题时，不造兜底引用', 'pipeline', async p => {
  const e = await evaluate(p, () => { const f = topicIntegrityFixtures; return f.validate(f.raw([f.entity('M1', { topic_ids: ['BAD'], primary_topic_id: 'BAD' })])).entities[0]; });
  A.deepEqual(e.topic_ids, []); A.equal(e.primary_topic_id, null); A.ok(e.evidences.length > 0);
});
define('C05', '整合直接兼容各成员的primary-only引用，并汇集全部来源', 'pipeline', async p => {
  const r = await evaluate(p, () => { const f = topicIntegrityFixtures; return f.assemble(f.raw([f.entity('M1'), f.entity('M2', { quote: '杰洛特使用银剑。' })]), c => { c.entities[0].topic_ids = ['P1-T1']; c.entities[0].primary_topic_id = 'P1-T2'; c.entities[1].topic_ids = []; c.entities[1].primary_topic_id = 'P1-T3'; }); });
  A.equal(r.steps.step3.accepted.length, 1); A.deepEqual(sorted(r.steps.step3.accepted[0].topic_ids), ['GT1', 'GT2', 'GT3']); assertResultReferences(r);
});
define('C06', '多话题下同身份实体归一为一个实体，汇集证据且不漏话题', 'pipeline', async p => {
  const r = await evaluate(p, () => { const f = topicIntegrityFixtures; return f.assemble(f.raw([f.entity('M1'), f.entity('M2', { quote: '杰洛特使用银剑。', topic_ids: ['T2'], primary_topic_id: 'T2' })])); });
  A.equal(r.metrics.entities, 1); A.equal(r.integration.entity_merges, 1); A.equal(r.steps.step3.accepted[0].evidences.length, 2);
  A.deepEqual(sorted(r.steps.step3.accepted[0].topic_ids), ['GT1', 'GT2']); assertResultReferences(r);
});
define('C07', '未知或无支持整合建议不补挂，不借建议制造话题成员', 'pipeline', async p => {
  const r = await evaluate(p, () => { const f = topicIntegrityFixtures; return f.assemble(f.raw(), (_, m) => Object.assign(m.entity_groups[0], { topics: ['GT2', 'MODEL-UNKNOWN'], primary_topic: 'GT3' })); });
  A.deepEqual(r.steps.step3.accepted[0].topic_ids, ['GT1']); A.equal(r.steps.step3.accepted[0].primary_topic_id, 'GT1');
  A.deepEqual(r.topics.map(t => t.id), ['GT1']); A.deepEqual(sorted(r.isolated_topics.map(t => t.id)), ['GT2', 'GT3']);
  A.ok(r.steps.diagnostics.candidate_issues.some(x => /话题归属|支持.*话题|话题.*支持/.test(x.reason))); assertResultReferences(r);
  const primaryOnly = await evaluate(p, () => { const f = topicIntegrityFixtures; return f.assemble(f.raw(), (_, m) => Object.assign(m.entity_groups[0], { topics: ['GT1'], primary_topic: 'MODEL-UNKNOWN' })); });
  A.deepEqual(primaryOnly.steps.step3.accepted[0].topic_ids, ['GT1']); A.equal(primaryOnly.steps.step3.accepted[0].primary_topic_id, 'GT1');
  A.ok(primaryOnly.steps.diagnostics.candidate_issues.some(x => /话题归属|支持.*话题|话题.*支持/.test(x.reason)), '仅primary建议无支持时也必须记录隔离原因'); assertResultReferences(primaryOnly);
});
define('C08', '实体证据隔离后，无成员话题从新可浏览结果移除且不造实体', 'pipeline', async p => {
  const data = await evaluate(p, () => { const f = topicIntegrityFixtures; const raw = f.raw([f.entity('M1', { topic_ids: ['T1', 'T2'] }), f.entity('BAD', { name: '无证据人工对象', quote: '不存在的实体证据', topic_ids: ['T3'], primary_topic_id: 'T3' })]); const c = f.validate(raw), r = assembleIntegratedResult(c, f.mapping(c), f.source, f.context()); return { c, r }; });
  A.equal(data.c.entities.length, 1); A.equal(data.r.metrics.entities, 1); A.deepEqual(sorted(data.r.topics.map(t => t.id)), ['GT1', 'GT2']);
  A.deepEqual(data.r.isolated_topics.map(t => t.id), ['GT3']); A.ok(!data.r.steps.step3.accepted.some(e => e.name === '无证据人工对象')); assertResultReferences(data.r);
  report.snapshots.evidenceIsolation = data;
});
define('C09', '孤立话题保留完整边界、成员ID、逐字证据、诊断和候选审计', 'pipeline', async p => {
  const { c, r } = await evaluate(p, () => { const f = topicIntegrityFixtures; const c = f.validate(f.raw([f.entity('BAD', { quote: '无效证据', topic_ids: ['T3'], primary_topic_id: 'T3' })])); return { c, r: assembleIntegratedResult(c, f.mapping(c), f.source, f.context()) }; });
  A.deepEqual(r.steps.diagnostics.isolated_topics, r.isolated_topics); A.deepEqual(r.candidate_audit, c); A.equal(r.isolated_topics.length, 3);
  for (const t of r.isolated_topics) {
    for (const key of ['id', 'name', 'definition', 'scope', 'object_anchor', 'core_question', 'includes', 'excludes', 'evidences', 'member_ids', 'decision', 'reason']) A.ok(Object.hasOwn(t, key), '孤立话题缺少完整字段 ' + key);
    A.match(t.reason, /无有效实体关联/); const input = c.topics.find(x => t.member_ids.includes(x.id));
    A.deepEqual(t.evidences, input.evidences); A.deepEqual(t.includes, input.includes); A.deepEqual(t.excludes, input.excludes);
    A.equal(t.scope, input.scope); A.equal(t.name, input.name);
    for (const q of t.evidences) A.equal(await evaluate(p, ({ start, end }) => topicIntegrityFixtures.source.slice(start, end), q), q.exact_quote);
  }
  A.ok(r.steps.diagnostics.candidate_issues.some(x => /实体证据无法定位/.test(x.reason)));
});
define('C10', '归并数与隔离数分列：隔离两个话题不能被计为两个归并', 'pipeline', async p => {
  const r = await evaluate(p, () => topicIntegrityFixtures.assemble());
  A.equal(r.metrics.topics, 1); A.equal(r.integration.topic_candidates, 3); A.equal(r.integration.topic_merges, 0); A.equal(r.integration.isolated_topic_count, 2); A.equal(r.isolated_topics.length, 2);
});
define('C11', '实际归并一个孤立话题组：候选数减全部组数，而非浏览话题数', 'pipeline', async p => {
  const r = await evaluate(p, () => { const f = topicIntegrityFixtures, raw = f.raw(); raw.topics[2] = { ...structuredClone(raw.topics[1]), id: 'T3', quote: raw.topics[2].quote }; const c = f.validate(raw), m = f.mapping(c); m.topic_groups = [m.topic_groups[0], { ...m.topic_groups[1], members: ['P1-T2', 'P1-T3'] }]; return assembleIntegratedResult(c, m, f.source, f.context()); });
  A.equal(r.topics.length, 1); A.equal(r.isolated_topics.length, 1); A.equal(r.isolated_topics[0].member_ids.length, 2); A.equal(r.isolated_topics[0].evidences.length, 2);
  A.equal(r.integration.topic_merges, 1); A.equal(r.integration.isolated_topic_count, 1); assertResultReferences(r);
});
define('C12', '有效实体证据却没有有效话题链：结果不可预览且知识不落盘', 'pipeline', async p => {
  const data = await evaluate(p, () => { const f = topicIntegrityFixtures; f.reset(); const r = f.assemble(f.raw([f.entity('M1', { topic_ids: ['BAD'], primary_topic_id: 'BAD' })])); const before = f.snapshot(); addLocalPreview(r); return { r, before, after: f.snapshot() }; });
  A.equal(data.r.preview_eligible, false); A.equal(data.r.metrics.entities, 0); A.equal(data.r.metrics.topics, 0); A.equal(data.r.isolated_topics.length, 3); A.deepEqual(data.after, data.before);
  A.equal(data.r.candidate_audit.entities.length, 1); A.ok(data.r.steps.diagnostics.candidate_issues.some(x => /没有有效话题|话题.*无效/.test(x.reason))); assertResultReferences(data.r);
});
define('C13', '没有实体候选：孤立话题保留在诊断，零实体零浏览话题且不存知识', 'pipeline', async p => {
  const data = await evaluate(p, () => { const f = topicIntegrityFixtures; f.reset(); const r = f.assemble(f.raw([])), before = f.snapshot(); addLocalPreview(r); return { r, before, after: f.snapshot() }; });
  A.equal(data.r.preview_eligible, false); A.equal(data.r.metrics.entities, 0); A.deepEqual(data.r.topics, []); A.equal(data.r.isolated_topics.length, 3);
  A.equal(data.r.integration.topic_merges, 0); A.equal(data.r.integration.isolated_topic_count, 3); A.deepEqual(data.after, data.before); assertResultReferences(data.r);
});
define('C14', '完全空候选：空数组而非伪造默认话题、实体或预览结果', 'pipeline', async p => {
  const r = await evaluate(p, () => { const f = topicIntegrityFixtures; return assembleIntegratedResult(f.validate({ topics: [], entities: [], review: [] }), { topic_groups: [], entity_groups: [] }, f.source, f.context()); });
  A.equal(r.preview_eligible, false); A.deepEqual(r.topics, []); A.deepEqual(r.isolated_topics, []); A.equal(r.integration.isolated_topic_count, 0); assertResultReferences(r);
});

// 存储门禁及事务回滚，故障只注入隔离浏览器的 localStorage。
define('S01', '合法多话题结果保存与重复保存：稳定ID不复制实体、不保存孤立话题', 'storage', async p => {
  const data = await evaluate(p, () => { const f = topicIntegrityFixtures; f.reset(); const r = f.validResult(); addLocalPreview(r); const first = structuredClone(state.previews); addLocalPreview(r); return { r, first, topics: state.previewTopics, entities: state.previews }; });
  A.equal(data.topics.length, 2); A.equal(data.entities.length, 1); A.equal(data.first[0].id, data.entities[0].id); A.equal(data.entities[0].topics.length, 2);
  A.ok(data.entities[0].topics.includes(data.entities[0].primaryTopic)); A.ok(!data.topics.some(t => t.name === '装备选择')); assertResultReferences(data.r);
});
define('S02', 'addLocalPreview拒绝primary不在topic_ids的直接坏结果且零副作用', 'storage', async p => {
  const data = await evaluate(p, () => { const f = topicIntegrityFixtures; f.reset(); const r = f.validResult(), e = r.steps.step3.accepted[0]; e.topic_ids = e.topic_ids.filter(id => id !== e.primary_topic_id); const before = f.snapshot(); let error = ''; try { addLocalPreview(r); } catch (x) { error = x.message; } return { before, after: f.snapshot(), error }; });
  A.match(data.error, /话题|引用/); A.deepEqual(data.after, data.before);
});
define('S03', 'addLocalPreview拒绝未知关联话题，不能写入undefined映射', 'storage', async p => {
  const data = await evaluate(p, () => { const f = topicIntegrityFixtures; f.reset(); const r = f.validResult(); r.steps.step3.accepted[0].topic_ids.push('MODEL-UNKNOWN'); const before = f.snapshot(); let error = ''; try { addLocalPreview(r); } catch (x) { error = x.message; } return { before, after: f.snapshot(), error }; });
  A.match(data.error, /话题|引用/); A.deepEqual(data.after, data.before);
});
define('S04', 'stage直接拒绝primary不包含在topic_ids，不能借rebuild悄悄修复坏结果', 'storage', async p => {
  const data = await evaluate(p, () => { const f = topicIntegrityFixtures, pack = f.stagePack(), e = pack.result.steps.step3.accepted[0]; e.topic_ids = e.topic_ids.filter(id => id !== e.primary_topic_id); const before = f.snapshot(); let error = ''; try { f.stage(pack); } catch (x) { error = x.message; } return { before, after: f.snapshot(), error }; });
  A.match(data.error, /话题|引用/); A.deepEqual(data.after, data.before);
});
define('S05', 'stage直接拒绝缺失topicMap项，持久化外键不得被过滤后冒充成功', 'storage', async p => {
  const data = await evaluate(p, () => { const f = topicIntegrityFixtures, pack = f.stagePack(); pack.topicMap.delete(pack.result.steps.step3.accepted[0].primary_topic_id); const before = f.snapshot(); let error = ''; try { f.stage(pack); } catch (x) { error = x.message; } return { before, after: f.snapshot(), error }; });
  A.match(data.error, /话题|引用/); A.deepEqual(data.after, data.before);
});
define('S06', 'stage直接拒绝映射至不存在的底层话题对象', 'storage', async p => {
  const data = await evaluate(p, () => { const f = topicIntegrityFixtures, pack = f.stagePack(); pack.topics.pop(); const before = f.snapshot(); let error = ''; try { f.stage(pack); } catch (x) { error = x.message; } return { before, after: f.snapshot(), error }; });
  A.match(data.error, /话题|引用/); A.deepEqual(data.after, data.before);
});
define('S07', 'stage合法保存：来源贡献topics包含primary且没有悬空外键', 'storage', async p => {
  const data = await evaluate(p, () => { const f = topicIntegrityFixtures, pack = f.stagePack(); const saved = f.stage(pack); return { saved, files: state.files, topics: state.previewTopics, entities: state.previews, storage: JSON.parse(localStorage.getItem(FILE_WORKSPACE_KEY)) }; });
  A.equal(data.saved, true); A.equal(data.files[0].status, '已解析'); A.equal(data.entities.length, 1); A.equal(data.topics.length, 2);
  const e = data.entities[0], c = e.fileContributions[0]; A.equal(c.fileId, 'F1'); A.ok(c.data.topics.includes(c.data.primaryTopic)); A.deepEqual(sorted(c.data.topics), sorted(data.topics.map(t => t.id))); A.deepEqual(data.storage.entities, data.entities);
});
define('S08', '无来源fallback第二键写入失败：内存与所有相关存储键回滚', 'storage', async p => {
  const d = await evaluate(p, () => { const f = topicIntegrityFixtures; f.reset(); const r = f.validResult(); return f.fault(STORE + 'previews', () => addLocalPreview(r)); });
  A.equal(d.triggered, 1); A.ok(d.error); A.deepEqual(d.after, d.before);
});
define('S09', 'stage最终workspace键失败：四键和内存完整回滚，重试仍可成功', 'storage', async p => {
  const d = await evaluate(p, () => { const f = topicIntegrityFixtures, pack = f.stagePack(); const fault = f.fault(FILE_WORKSPACE_KEY, () => f.stage(pack)); const retry = f.stage(pack); return { ...fault, retry, topics: state.previewTopics.length, entities: state.previews.length }; });
  A.equal(d.triggered, 1); A.match(d.error, /保存|空间/); A.deepEqual(d.after, d.before); A.equal(d.retry, true); A.equal(d.topics, 2); A.equal(d.entities, 1);
});
define('S10', '来源模式addLocalPreview部分提交失败：四键和实体状态全量回滚', 'storage', async p => {
  const d = await evaluate(p, () => { const f = topicIntegrityFixtures, pack = f.stagePack(); return f.fault(STORE + 'topics', () => addLocalPreview(pack.result)); });
  A.equal(d.triggered, 1); A.match(d.error, /保存|空间/); A.deepEqual(d.after, d.before);
});

// 多来源重建与历史兼容。
define('F01', '重建每份contribution.data：有效primary并入topics，去重且过滤坏ID', 'contributions', async p => {
  const d = await evaluate(p, () => { const f = topicIntegrityFixtures, x = f.contributions(); return rebuildFileKnowledge(x.topics, x.entities); });
  const e = d.entities[0]; A.deepEqual(sorted(e.topics), ['TA', 'TB']); A.equal(e.fileContributions.length, 2);
  A.deepEqual(e.fileContributions[0].data.topics, ['TA']); A.deepEqual(e.fileContributions[1].data.topics, ['TB']);
  for (const c of e.fileContributions) A.ok(c.data.topics.includes(c.data.primaryTopic)); A.ok(e.topics.includes(e.primaryTopic));
});
define('F02', '来源顺序变化不会遗漏后续来源的primary引用', 'contributions', async p => {
  const d = await evaluate(p, () => { const f = topicIntegrityFixtures, x = f.contributions(); x.entities[0].fileContributions.reverse(); return rebuildFileKnowledge(x.topics, x.entities).entities[0]; });
  A.deepEqual(sorted(d.topics), ['TA', 'TB']); A.ok(d.topics.includes(d.primaryTopic)); A.deepEqual(d.fileContributions.map(c => c.data.primaryTopic), ['TB', 'TA']);
});
define('F03', '仍有来源但无人引用的历史话题保留完整底层贡献，不出现在浏览集合', 'contributions', async p => {
  const d = await evaluate(p, () => { const f = topicIntegrityFixtures; f.seedContributions(); return { all: allTopics(), browse: browseTopics(), historical: state.previewTopics.find(t => t.id === 'TH') }; });
  A.deepEqual(sorted(d.all.map(t => t.id)), ['TA', 'TB', 'TH']); A.deepEqual(sorted(d.browse.map(t => t.id)), ['TA', 'TB']);
  A.equal(d.historical.fileContributions[0].fileId, 'FH'); A.equal(d.historical.evidences[0].exact_quote, '人工话题证据-TH');
});
define('F04', '撤回首来源：共享实体保留第二来源primary、事实和成员；规划无副作用', 'contributions', async p => {
  const d = await evaluate(p, () => { const f = topicIntegrityFixtures; f.seedContributions(); const before = f.snapshot(), plan = planFileRemoval('F1'); return { plan, before, after: f.snapshot() }; });
  A.deepEqual(d.before, d.after); A.deepEqual(sorted(d.plan.topics.map(t => t.id)), ['TB', 'TH']); A.equal(d.plan.entities.length, 1);
  const e = d.plan.entities[0]; A.deepEqual(e.topics, ['TB']); A.equal(e.primaryTopic, 'TB'); A.deepEqual(e.fileContributions.map(c => c.fileId), ['F2']);
  A.deepEqual(e.facts, ['人工来源证据-F2']); A.equal(d.plan.sharedEntities.length, 1); A.equal(d.plan.deletedEntities.length, 0);
});
define('F05', '实际撤回来源后浏览与底层保持分离，继续撤回最后实体来源不删历史孤立话题', 'contributions', async p => {
  const d = await evaluate(p, () => { const f = topicIntegrityFixtures; f.seedContributions(); deleteArchiveFile('F1', true); const first = { all: allTopics().map(t => t.id), browse: browseTopics().map(t => t.id), entities: structuredClone(allEntities()) }; deleteArchiveFile('F2', true); return { first, all: allTopics(), browse: browseTopics(), entities: allEntities(), files: state.files }; });
  A.deepEqual(sorted(d.first.all), ['TB', 'TH']); A.deepEqual(d.first.browse, ['TB']); A.equal(d.first.entities.length, 1);
  A.deepEqual(d.all.map(t => t.id), ['TH']); A.deepEqual(d.browse, []); A.deepEqual(d.entities, []); A.deepEqual(d.files.map(f => f.id), ['FH']);
});
define('F06', '旧无contributions且仅primary数据：重建保留有效成员引用，不制造未知话题', 'contributions', async p => {
  const d = await evaluate(p, () => { const f = topicIntegrityFixtures; const e = f.storedEntity('LEGACY', 'TA', []); const r = rebuildFileKnowledge([{ id: 'TA', name: '旧话题' }, { id: 'TH', name: '旧孤立话题' }], [e]); commitFileWorkspace([], r.topics, r.entities); return { r, ids: entityTopicIds(r.entities[0]), browse: browseTopics() }; });
  A.equal(d.r.topics.length, 2); A.equal(d.r.entities[0].primaryTopic, 'TA'); A.deepEqual(d.ids, ['TA']); A.deepEqual(d.browse.map(t => t.id), ['TA']);
});
define('F07', '旧schema迁移primary-only实体，历史孤立话题拥有独立来源并继续保留', 'contributions', async p => {
  const d = await evaluate(p, () => { const f = topicIntegrityFixtures; commitFileWorkspace([], [{ id: 'TA', name: '旧主话题' }, { id: 'TH', name: '旧孤立话题', scope: '历史证据边界' }], [f.storedEntity('LEGACY', 'TA', [])]); localStorage.removeItem(FILE_WORKSPACE_KEY); fileWorkspaceRaw = null; migrateFileWorkspace(); return { topics: allTopics(), browse: browseTopics(), entities: allEntities(), files: state.files }; });
  A.deepEqual(sorted(d.topics.map(t => t.id)), ['TA', 'TH']); A.deepEqual(d.browse.map(t => t.id), ['TA']); A.deepEqual(d.entities[0].fileContributions[0].data.topics, ['TA']);
  const h = d.topics.find(t => t.id === 'TH'); A.equal(h.scope, '历史证据边界'); A.ok(h.fileContributions.length > 0); A.ok(d.files.some(f => f.name === '历史话题来源待核对'));
});
define('F08', '无效primary贡献不会复活未知话题；有效关联引用仍保留', 'contributions', async p => {
  const d = await evaluate(p, () => { const f = topicIntegrityFixtures, x = f.contributions(); x.entities[0].fileContributions[0].data.primaryTopic = 'BAD'; x.entities[0].fileContributions[0].data.topics = ['TA', 'BAD']; return rebuildFileKnowledge(x.topics, x.entities); });
  A.deepEqual(sorted(d.entities[0].topics), ['TA', 'TB']); A.deepEqual(d.entities[0].fileContributions[0].data.topics, ['TA']);
  A.ok(!d.topics.some(t => t.id === 'BAD')); A.ok(d.entities[0].topics.includes(d.entities[0].primaryTopic));
});

// 界面夹具包含25个底层话题，但只有3个有成员，不能照搬旧空入口期望。
define('U01', 'allTopics保留25底层话题；entityTopicIds默认有效全集及显式validIds去重并集', 'browse', async p => {
  await seedBrowse(p);
  const d = await evaluate(p, () => ({ all: allTopics().map(t => t.id), ids: entityTopicIds(allEntities()[0]), restricted: entityTopicIds(allEntities()[0], new Set(['UI-T01'])), invalid: entityTopicIds({ topics: ['UI-UNKNOWN'], primaryTopic: 'UI-UNKNOWN' }) }));
  A.equal(d.all.length, 25); A.deepEqual(sorted(d.ids), ['UI-T01', 'UI-T02']); A.equal(d.ids.length, 2); A.deepEqual(d.restricted, ['UI-T01']); A.deepEqual(d.invalid, []);
});
define('U02', '目录、概览与browseTopics一致：3有成员话题、3去重实体，22个底层空话题不生成入口', 'browse', async p => {
  await seedBrowse(p);
  const d = await evaluate(p, () => ({ all: allTopics().length, browse: browseTopics().map(t => t.id), directory: [...document.querySelectorAll('#topicStrip [data-nav-topic]')].map(n => n.dataset.navTopic), overview: [...document.querySelectorAll('#entityDetail [data-overview-topic]')].map(n => n.dataset.overviewTopic), members: [...document.querySelectorAll('#entityDetail .overview-topic .small')].map(n => n.textContent) }));
  A.equal(d.all, 25); A.deepEqual(sorted(d.browse), ['UI-T01', 'UI-T02', 'UI-T03']); A.deepEqual(sorted(d.directory), sorted(d.browse)); A.deepEqual(sorted(d.overview), sorted(d.browse));
  A.deepEqual(await metrics(p), [3, 3, 1, 2]); A.deepEqual(d.members, ['2 个关联实体', '1 个关联实体', '1 个关联实体']);
  A.equal(await p.locator('#topicNavCount').textContent(), '3 话题'); report.snapshots.browseOverview = d;
});
define('U03', 'primary-only旧实体可从话题目录进入，成员列表与话题总览一致', 'browse', async p => {
  await seedBrowse(p); await nav(p, 'UI-T03').click();
  A.deepEqual(await rows(p), ['UI-LEGACY']); A.equal(await navEntity(p, 'UI-LEGACY', 'UI-T03').count(), 1); A.deepEqual(await metrics(p), [1, 1, 0, 1]);
  await navEntity(p, 'UI-LEGACY', 'UI-T03').focus(); await p.keyboard.press('Enter'); A.equal(await evaluate(p, () => state.selectedEntity), 'UI-LEGACY');
  A.ok((await p.locator('#entityDetail').innerText()).includes('UI-LEGACY · 当前浏览器实体记录 ID'));
});
define('U04', 'topic筛选与候选值使用有效引用helper：primary-only成员可筛选且未知ID不外泄', 'browse', async p => {
  await seedBrowse(p); await evaluate(p, () => toggleFilter('topic', 'UI-T02'));
  A.deepEqual(await rows(p), ['UI-SHARED']); A.deepEqual(sorted(await evaluate(p, () => filterValues('topic'))), ['UI-T01', 'UI-T02', 'UI-T03']);
  A.deepEqual(sorted(await evaluate(p, () => entityFilterValues(allEntities()[0], 'topic'))), ['UI-T01', 'UI-T02']);
  A.equal(await nav(p, 'UI-T02').locator('.tree-count').textContent(), '1');
});
define('U05', '多维筛选0/N仍保留有成员话题，目录集合与全库概览不受筛选影响', 'browse', async p => {
  await seedBrowse(p); await p.locator('details.browse-filters > summary').click(); await p.locator('[data-filter-key="product"][data-filter-value="示意产品乙"]').click();
  const before = await evaluate(p, () => knowledgeFilterKey()); await nav(p, 'UI-T01').click();
  A.deepEqual(await rows(p), []); A.equal(await nav(p, 'UI-T01').locator('.tree-count').textContent(), '0/2'); A.equal(await nav(p, 'UI-T02').locator('.tree-count').textContent(), '0/1');
  A.equal(await p.locator('#topicStrip [data-nav-topic]').count(), 3); A.deepEqual(await evaluate(p, () => browseTopics().map(t => t.id)), ['UI-T01', 'UI-T02', 'UI-T03']);
  A.equal(await evaluate(p, () => knowledgeFilterKey()), before); A.deepEqual(await evaluate(p, () => [...state.filters.topic]), []);
  await p.locator('#topicStrip [data-overview]').click(); A.deepEqual(await metrics(p), [3, 3, 1, 2]);
});
define('U06', '搜索零结果不把话题误判为空话题；概览仍按未筛选成员统计', 'browse', async p => {
  await seedBrowse(p); await p.fill('#entitySearch', '不可能命中的人工检索');
  A.deepEqual(await rows(p), []); A.equal(await p.locator('#topicStrip [data-nav-topic]').count(), 3); A.deepEqual(await metrics(p), [3, 3, 1, 2]);
  await nav(p, 'UI-T02').click(); A.equal(await nav(p, 'UI-T02').locator('.tree-count').textContent(), '0/1'); A.deepEqual(await metrics(p), [1, 1, 1, 1]);
  A.match(await nav(p, 'UI-T02').locator('..').innerText(), /没有符合筛选的实体/);
});
define('U07', '同一稳定实体可从两个分支进入；反复渲染不复制实体或写入知识', 'browse', async p => {
  await seedBrowse(p); const before = await evaluate(p, () => topicIntegrityFixtures.snapshot());
  await nav(p, 'UI-T01').click(); await nav(p, 'UI-T02').click(); A.equal(await p.locator('#topicStrip [data-nav-entity="UI-SHARED"]').count(), 2);
  for (const topic of ['UI-T01', 'UI-T02']) { await navEntity(p, 'UI-SHARED', topic).click(); A.equal(await evaluate(p, () => state.selectedEntity), 'UI-SHARED'); }
  await evaluate(p, () => renderKnowledge()); A.equal(await evaluate(p, () => allEntities().filter(e => e.id === 'UI-SHARED').length), 1); A.deepEqual(await evaluate(p, () => topicIntegrityFixtures.snapshot()), before);
});
define('U08', '概览话题按钮进入primary-only分支；再点击只折叠，不更改筛选', 'browse', async p => {
  await seedBrowse(p); await p.locator('#entityDetail [data-overview-topic="UI-T02"]').click(); A.deepEqual(await rows(p), ['UI-SHARED']);
  A.equal(await nav(p, 'UI-T02').getAttribute('aria-expanded'), 'true'); await nav(p, 'UI-T02').click();
  A.equal(await nav(p, 'UI-T02').getAttribute('aria-expanded'), 'false'); A.equal(await evaluate(p, () => knowledgeNav.topicId), 'UI-T02'); A.deepEqual(await rows(p), ['UI-SHARED']);
});
define('U09', '失去最后成员但底层保留的话题：清理展开、当前范围及悬空topic筛选', 'browse', async p => {
  await seedBrowse(p); await nav(p, 'UI-T01').click(); await nav(p, 'UI-T02').click();
  const d = await evaluate(p, () => { knowledgeNav.expanded.add('UI-GHOST'); state.filters.topic = new Set(['UI-T02', 'UI-GHOST']); commitFileWorkspace([], state.previewTopics, state.previews.filter(e => e.id !== 'UI-SHARED')); renderKnowledge(); return { topic: knowledgeNav.topicId, expanded: [...knowledgeNav.expanded], filters: [...state.filters.topic], all: allTopics().map(t => t.id), browse: browseTopics().map(t => t.id) }; });
  A.ok(d.all.includes('UI-T02')); A.equal(d.topic, null); A.deepEqual(d.expanded, ['UI-T01']); A.deepEqual(d.filters, []); A.deepEqual(d.browse, ['UI-T01', 'UI-T03']); A.equal(await nav(p, 'UI-T02').count(), 0);
});
define('U10', '实体撤回后清理悬空selectedEntity和relatedDetailId，不保留重复导航引用', 'browse', async p => {
  await seedBrowse(p); await evaluate(p, () => openRelatedEntity('UI-SHARED'));
  await evaluate(p, () => { commitFileWorkspace([], state.previewTopics, state.previews.filter(e => e.id !== 'UI-SHARED')); renderKnowledge(); });
  A.equal(await evaluate(p, () => state.relatedDetailId), null); A.notEqual(await evaluate(p, () => state.selectedEntity), 'UI-SHARED'); A.equal(await p.locator('#topicStrip [data-nav-entity="UI-SHARED"]').count(), 0);
  A.equal(await row(p, 'UI-SHARED').count(), 0); A.equal(await nav(p, 'UI-T02').count(), 0);
});
define('U11', '详情只显示有效话题：primary与关联一致，重复及未知引用不显示待确认占位', 'browse', async p => {
  await seedBrowse(p); await row(p, 'UI-SHARED').click();
  const d = await evaluate(p, () => ({ title: document.querySelector('#entityDetail .detail-title').textContent, topicRows: [...document.querySelectorAll('#entityDetail .detail-section')].find(n => n.textContent.includes('话题归属')).textContent, names: state.previewTopics.slice(0, 2).map(t => t.name) }));
  A.match(d.title, /人工共享实体/); for (const name of d.names) A.ok(d.topicRows.includes(name)); A.ok(!d.topicRows.includes('待确认')); A.ok(!d.topicRows.includes('UI-UNKNOWN'));
  A.equal(await evaluate(p, () => document.activeElement.id), 'entityDetail');
});
define('U12', '关联实体在当前范围外仍可查看，返回筛选保持原条件和有效主话题', 'browse', async p => {
  await seedBrowse(p); await nav(p, 'UI-T02').click(); await navEntity(p, 'UI-SHARED', 'UI-T02').click(); const before = await evaluate(p, () => knowledgeFilterKey());
  await p.locator('#entityDetail [data-jump="UI-LEGACY"]').click(); A.equal(await evaluate(p, () => state.relatedDetailId), 'UI-LEGACY'); A.equal(await p.locator('#entityDetail .detail-filter-notice').isVisible(), true);
  A.equal(await evaluate(p, () => knowledgeFilterKey()), before); await p.locator('#entityDetail [data-return-filter]').click(); A.equal(await evaluate(p, () => state.relatedDetailId), null); A.deepEqual(await rows(p), ['UI-SHARED']);
});
define('U13', '搜索隐藏已选实体：清理悬空详情但保留0/N目录入口', 'browse', async p => {
  await seedBrowse(p); await nav(p, 'UI-T02').click(); await navEntity(p, 'UI-SHARED', 'UI-T02').click(); await p.fill('#entitySearch', '不可能命中的人工检索');
  A.equal(await evaluate(p, () => state.selectedEntity), null); A.equal(await evaluate(p, () => state.relatedDetailId), null); A.equal(await evaluate(p, () => knowledgeNav.topicId), 'UI-T02');
  A.equal(await nav(p, 'UI-T02').locator('.tree-count').textContent(), '0/1'); A.equal(await p.locator('#entityDetail .detail-title').count(), 0);
});
define('U14', '只有底层孤立话题而无实体时：零浏览目录、零概览话题，原底层不删除', 'browse', async p => {
  await seedBrowse(p); await evaluate(p, () => { knowledgeNav.topicId = 'UI-T01'; knowledgeNav.expanded.add('UI-T01'); state.selectedEntity = 'UI-SHARED'; state.filters.topic.add('UI-T01'); commitFileWorkspace([], state.previewTopics, []); renderKnowledge(); });
  A.equal(await evaluate(p, () => allTopics().length), 25); A.deepEqual(await evaluate(p, () => browseTopics()), []); A.equal(await p.locator('#topicStrip [data-nav-topic]').count(), 0); A.deepEqual(await metrics(p), [0, 0, 0, 0]);
  A.deepEqual(await evaluate(p, () => ({ topic: knowledgeNav.topicId, expanded: [...knowledgeNav.expanded], selected: state.selectedEntity, filters: [...state.filters.topic] })), { topic: null, expanded: [], selected: null, filters: [] });
});
define('U15', '话题与实体恶意名称、摘要、证据在目录、概览、列表和详情均按安全文本展示', 'browse', async p => {
  await seedBrowse(p);
  const evil = { topic: '人工话题 <img src=x onerror="window.__integrityXss=1"> & <script>window.__integrityXss=2</script>', entity: '人工实体 <svg onload="window.__integrityXss=3"></svg> & "\'', text: '</textarea><img src=x onerror="window.__integrityXss=4">' };
  await evaluate(p, values => { const topics = structuredClone(state.previewTopics), entities = structuredClone(state.previews); topics[1].name = values.topic; topics[1].desc = values.text; entities[0].name = values.entity; entities[0].summary = values.text; entities[0].sources[0].quote = values.text; commitFileWorkspace([], topics, entities); renderKnowledge(); }, evil);
  A.equal(await nav(p, 'UI-T02').locator('.tree-label').textContent(), evil.topic); A.equal(await p.locator('#entityDetail [data-overview-topic="UI-T02"]').textContent(), evil.topic); A.equal(await row(p, 'UI-SHARED').locator('strong').textContent(), evil.entity);
  await nav(p, 'UI-T02').click(); await navEntity(p, 'UI-SHARED', 'UI-T02').click(); A.equal(await p.locator('#entityDetail .detail-title').textContent(), evil.entity);
  A.ok((await p.locator('#entityDetail').innerText()).includes(evil.topic)); A.ok((await p.locator('#entityDetail').innerText()).includes(evil.text));
  A.equal(await p.locator('#topicStrip img, #topicStrip svg, #topicStrip script, #entityRows img, #entityRows svg, #entityRows script, #entityDetail img, #entityDetail svg, #entityDetail script').count(), 0); A.equal(await evaluate(p, () => window.__integrityXss || 0), 0);
});
define('U16', '页面刷新恢复底层25话题与3稳定实体，浏览集合仍只有3话题', 'browse', async p => {
  await seedBrowse(p); const before = await evaluate(p, () => allEntities().map(e => ({ id: e.id, topics: entityTopicIds(e).sort(), primaryTopic: e.primaryTopic })));
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => fileManagerReady && workbookReady && !cloudLoading && wikiPromptHistory.getController().status().ready); await p.evaluate(installFixtures); await evaluate(p, () => setPage('knowledge'));
  A.equal(await evaluate(p, () => allTopics().length), 25); A.deepEqual(await evaluate(p, () => allEntities().map(e => ({ id: e.id, topics: entityTopicIds(e).sort(), primaryTopic: e.primaryTopic }))), before);
  A.deepEqual(await evaluate(p, () => browseTopics().map(t => t.id)), ['UI-T01', 'UI-T02', 'UI-T03']); A.deepEqual(await metrics(p), [3, 3, 1, 2]);
});

for (const width of [1440, 760, 390]) {
  for (const scene of ['概览', '话题展开', '实体详情', '筛选展开']) {
    define(`L-${width}-${scene}`, `${width}px ${scene}：全页面和浏览面板无横向溢出`, 'browse', async p => {
      await p.setViewportSize({ width, height: 1080 }); await seedBrowse(p);
      if (width === 760 && scene === '话题展开') {
        const arrows = await evaluate(p, () => [...document.querySelectorAll('#knowledgePage .map-arrow')].map(el => ({ box: el.getBoundingClientRect().toJSON(), width: el.offsetWidth, height: el.offsetHeight, pointerEvents: getComputedStyle(el).pointerEvents, justifySelf: getComputedStyle(el).justifySelf })));
        A.equal(arrows.length, 3);
        for (const arrow of arrows) { A.ok(arrow.width <= 32 && arrow.height <= 32, '箭头布局应限制在31px附近'); A.ok(arrow.box.width <= 32 && arrow.box.height <= 32, '旋转后不能形成整行长度命中区域'); A.equal(arrow.pointerEvents, 'none'); A.equal(arrow.justifySelf, 'center'); }
        await nav(p, 'UI-T01').scrollIntoViewIfNeeded();
        const hit = await nav(p, 'UI-T01').evaluate(el => { const r = el.getBoundingClientRect(), target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { topicHit: !!target && el.contains(target), tag: target?.tagName, className: target?.className }; });
        A.equal(hit.topicHit, true, '普通点击位置应命中首话题而非箭头'); report.snapshots.resolved760Occlusion = { arrows, hit, forcedClickUsed: false };
      }
      if (scene !== '概览') { await nav(p, 'UI-T01').click(); await nav(p, 'UI-T02').click(); }
      if (width === 760 && scene === '话题展开') { A.equal(await nav(p, 'UI-T01').getAttribute('aria-expanded'), 'true'); A.equal(await nav(p, 'UI-T02').getAttribute('aria-expanded'), 'true'); }
      if (scene === '实体详情' || scene === '筛选展开') await navEntity(p, 'UI-SHARED', 'UI-T02').click();
      if (scene === '筛选展开') await p.locator('details.browse-filters > summary').click();
      const measurement = await evaluate(p, () => ({ viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, panels: ['.browse-grid', '#topicStrip', '.entity-list', '#entityRows', '#entityDetail', 'details.browse-filters'].map(selector => { const el = document.querySelector(selector), box = el.getBoundingClientRect(); return { selector, client: el.clientWidth, scroll: el.scrollWidth, left: box.left, right: box.right }; }) }));
      report.responsive.push({ scene, width, ...measurement }); A.ok(measurement.documentWidth <= width + 2); A.ok(measurement.bodyWidth <= width + 2);
      for (const panel of measurement.panels) { A.ok(panel.scroll <= panel.client + 2, '面板溢出：' + JSON.stringify(panel)); A.ok(panel.left >= -2 && panel.right <= width + 2, '面板越界：' + JSON.stringify(panel)); }
      return measurement;
    });
  }
}
define('U17', '指定截图生成：只写空话题修复专项PNG，画面标明人工夹具', 'browse', async p => {
  await p.setViewportSize({ width: 1440, height: 1080 });
  try { await seedBrowse(p); await nav(p, 'UI-T01').click(); await nav(p, 'UI-T02').click(); await p.locator('#topicStrip [data-overview]').click(); }
  finally { await p.screenshot({ path: screenshotPath, fullPage: true }); report.artifacts.push(screenshotPath); }
  A.ok(fs.statSync(screenshotPath).size > 0); A.deepEqual(await metrics(p), [3, 3, 1, 2]);
});

async function uploadFixture(p, filename) {
  await evaluate(p, () => setPage('lab'));
  const source = await evaluate(p, () => topicIntegrityFixtures.source);
  await p.locator('#fileInput').setInputFiles({ name: filename, mimeType: 'text/plain', buffer: Buffer.from(source) });
  await p.waitForFunction(() => !!state.source?.id && !fileReading);
}
async function runFlow(p) {
  const previousId = await evaluate(p, () => wikiRunTiming.current()?.id || 0);
  await p.locator('#runBtn').click();
  await p.waitForFunction(id => wikiRunTiming.current()?.id > id && wikiRunTiming.current()?.end != null && !isRunning, previousId);
  return evaluate(p, () => ({ current: state.current, baseline: state.baseline, topics: state.previewTopics, entities: state.previews, files: state.files, timing: wikiRunTiming.current(), calls: topicIntegrityMock.calls, pending: wikiRequests.size, cache: [...wikiCandidateCache.values()].map(c => ({ parts: c.parts.size, rawSaved: Object.hasOwn(c.integration || {}, 'raw_response') })) }));
}
define('K01', '完整模拟运行：primary-only有效实体保存；无支持建议隔离；孤立话题不入浏览', 'cache', async p => {
  await uploadFixture(p, '人工专项-primary-only.txt'); const d = await runFlow(p);
  A.equal(d.timing.status, 'success'); A.ok(d.current); A.equal(d.current.preview_eligible, true); assertResultReferences(d.current);
  A.equal(d.current.isolated_topics.length, 2); A.equal(d.current.integration.topic_merges, 0); A.equal(d.current.integration.isolated_topic_count, 2);
  A.equal(d.topics.length, 1); A.equal(d.entities.length, 1); A.deepEqual(d.current.steps.step3.accepted[0].topic_ids, ['GT1']);
  A.equal(d.entities[0].fileContributions.length, 1); A.ok(d.entities[0].topics.includes(d.entities[0].primaryTopic)); A.equal(d.pending, 0); A.equal(d.calls.length, 2);
  report.snapshots.fullFlow = d;
});
define('K02', '缓存暖机后严格命中：不重新调模拟模型，不复制实体，保留隔离诊断与计数', 'cache', async p => {
  // 成功写入会改变冻结历史快照，先暖机，再比较完全相同缓存键。
  await uploadFixture(p, '人工专项-primary-only.txt'); await runFlow(p); await runFlow(p);
  const before = await evaluate(p, () => ({ calls: topicIntegrityMock.calls.length, ids: state.previews.map(e => e.id) })); const d = await runFlow(p);
  A.equal(d.timing.status, 'success'); A.equal(d.calls.length, before.calls); A.deepEqual(d.entities.map(e => e.id), before.ids); A.equal(d.entities.length, 1);
  A.equal(d.current.isolated_topics.length, 2); A.equal(d.current.integration.topic_merges, 0); A.equal(d.current.integration.isolated_topic_count, 2);
  A.ok(d.timing.caches.baseline.extraction > 0); A.ok(d.timing.caches.baseline.integration > 0); A.ok(d.timing.caches.current.baseline > 0);
  A.ok(d.cache.every(c => !c.rawSaved)); assertResultReferences(d.current); report.snapshots.cacheHit = { before, data: d };
});
define('K03', '完整无实体模拟运行：解析成功但不写知识，档案注明无有效知识', 'empty-flow', async p => {
  await evaluate(p, () => { topicIntegrityMock.mode = 'no-entities'; }); await uploadFixture(p, '人工专项-无实体.txt'); const d = await runFlow(p);
  A.equal(d.timing.status, 'success'); A.equal(d.current.preview_eligible, false); A.equal(d.current.metrics.entities, 0); A.equal(d.current.metrics.topics, 0);
  A.deepEqual(d.topics, []); A.deepEqual(d.entities, []); A.equal(d.current.isolated_topics.length, 3); A.equal(d.current.integration.topic_merges, 0); A.equal(d.current.integration.isolated_topic_count, 3);
  A.equal(d.files[0].status, '已解析 · 无有效知识'); A.equal(d.pending, 0); assertResultReferences(d.current); report.snapshots.emptyFlow = d;
});

define('Z01', '每个场景真实加载全部五模块，提示词历史与词表只访问隔离mock', 'final', async () => {
  A.equal(sessionInfo.size, 6);
  for (const [group, info] of sessionInfo) {
    A.deepEqual(sorted(new Set(info.loaded)), sorted(modules), group + '模块不完整'); A.equal(info.writes.length, 0, group + '不应修改提示词历史');
    A.ok(info.queries.length > 0); A.ok(info.queries.every(q => ['wiki_prompt_versions', 'wiki_shared_tag_workbook'].includes(q.table) && !q.write));
  }
});
define('Z02', '无真实模型/生产云写/放行网络请求，且没有页面异常或意外弹窗', 'final', async () => {
  A.ok(report.network.length > 0); A.ok(report.network.every(n => n.method === 'GET' && ['真实本地模块', '模拟工作簿', '空外部脚本'].includes(n.action)), JSON.stringify(report.network.filter(n => !['真实本地模块', '模拟工作簿', '空外部脚本'].includes(n.action))));
  A.equal(report.isolation.continuedRequests, 0); A.equal(report.isolation.oldTestsExecuted, 0); A.deepEqual(report.pageErrors, []); A.deepEqual(report.dialogs, []);
});
define('Z03', '应用文件、其他测试及既有专项产物指纹保持不变', 'final', async () => {
  const afterApp = applicationHashes(), afterTests = completedTestHashes();
  report.applicationAssets = { before: sourceHashes, after: afterApp, unchanged: JSON.stringify(sourceHashes) === JSON.stringify(afterApp) };
  report.protectedTestsAndArtifacts = { before: protectedHashes, after: afterTests, unchanged: JSON.stringify(protectedHashes) === JSON.stringify(afterTests) };
  A.deepEqual(afterApp, sourceHashes); A.deepEqual(afterTests, protectedHashes);
});

(async () => {
  report.planned = cases.map(({ id, name, group }) => ({ id, name, group }));
  try {
    sourceHashes = applicationHashes(); protectedHashes = completedTestHashes();
    sources = Object.fromEntries(modules.map(n => [n, fs.readFileSync(path.join(app, n), 'utf8')]));
    for (const match of sources['index.html'].matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
    for (const n of modules.slice(1)) new vm.Script(sources[n], { filename: n });
    const old = fs.readFileSync(path.join(root, '.playwright-cli/test-run-timing.cjs'), 'utf8');
    const start = old.indexOf('function installMock(){'), end = old.indexOf('\nlet browser,shotPage;');
    if (start < 0 || end <= start || old.slice(start, end).includes('chromium.launch')) throw Error('旧harness提取边界不合法，未执行旧脚本');
    const mockCode = old.slice(start, end) + '\ninstallMock();'; new vm.Script(mockCode);
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    for (const group of ['pipeline', 'storage', 'contributions', 'browse', 'cache', 'empty-flow']) {
      let session;
      try {
        session = await createSession(group, mockCode);
        for (const test of cases.filter(c => c.group === group)) await execute(test, session.page);
      } catch (error) {
        report.harnessErrors.push({ group, reason: error.message, stack: error.stack });
      } finally {
        if (session && !session.page.isClosed()) {
          try { Object.assign(session.info, await evaluate(session.page, () => ({ writes: timingMock.writes, queries: timingMock.queries }))); }
          catch (error) { report.harnessErrors.push({ group, reason: '读取隔离mock日志失败：' + error.message }); }
          await session.context.close().catch(error => report.harnessErrors.push({ group, reason: error.message }));
        }
      }
    }
    for (const test of cases.filter(c => c.group === 'final')) await execute(test, null);
  } catch (error) { report.harnessErrors.push({ group: '启动', reason: error.message, stack: error.stack }); }
  finally {
    for (const context of contexts) await context.close().catch(() => {});
    if (browser) await browser.close().catch(error => report.harnessErrors.push({ group: '关闭', reason: error.message }));
    const executedIds = new Set(report.tests.map(t => t.id));
    for (const test of cases) if (!executedIds.has(test.id)) report.tests.push({ id: test.id, name: test.name, group: test.group, status: 'blocked', pass: false, assertions: 0, passedAssertions: 0, failedAssertions: 0, reason: '场景初始化或启动失败，未执行；详见harnessErrors' });
    report.finishedAt = new Date().toISOString(); report.total = cases.length;
    report.passed = report.tests.filter(t => t.status === 'passed').length; report.failed = report.tests.filter(t => t.status === 'failed').length; report.blocked = report.tests.filter(t => t.status === 'blocked').length;
    report.assertions = { total: report.tests.reduce((n, t) => n + t.assertions, 0), passed: report.tests.reduce((n, t) => n + t.passedAssertions, 0), failed: report.tests.reduce((n, t) => n + t.failedAssertions, 0) };
    report.status = report.failed || report.blocked || report.harnessErrors.length ? 'failed' : 'passed';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ status: report.status, total: report.total, passed: report.passed, failed: report.failed, blocked: report.blocked, assertions: report.assertions, failures: report.tests.filter(t => !t.pass).map(t => ({ id: t.id, name: t.name, reason: t.reason })), harnessErrors: report.harnessErrors, reportPath, artifacts: report.artifacts }, null, 2));
    if (report.status !== 'passed') process.exitCode = 1;
  }
})();
