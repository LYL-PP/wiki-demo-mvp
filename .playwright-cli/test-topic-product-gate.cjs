'use strict';

// 首次读取源码未就绪时仅编写并做 node --check；收到源码就绪通知后才运行专项。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = 'C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25';
const app = path.join(root, 'wiki-demo-mvp');
const self = '.playwright-cli/test-topic-product-gate.cjs';
const reportName = 'outputs/wiki-topic-product-gate-tests.json';
const shotName = 'outputs/知识Wiki话题显示门槛-本地.png';
const origin = 'http://127.0.0.1:19431';
const modules = ['index.html', 'semantic-tags.js', 'pipeline.js', 'file-manager.js', 'prompt-history.js'];
const cases = [], contexts = [], loaded = [], network = [], errors = [], dialogs = [];
const report = {
  kind: '知识Wiki话题显示门槛专项；真实五资源、隔离SDK、人工夹具；不运行pipeline或模型',
  startedAt: new Date().toISOString(), modules, tests: [], harnessErrors: [], network, pageErrors: errors,
  dialogs, responsive: [], clickAudit: [], artifacts: [], snapshots: {},
  managedNode: process.execPath, nodeVersion: process.version,
  previousRuns: fs.existsSync(path.join(root, reportName)) ? (() => {
    const previous = JSON.parse(fs.readFileSync(path.join(root, reportName), 'utf8'));
    return [...(previous.previousRuns || []), { startedAt: previous.startedAt, finishedAt: previous.finishedAt,
      status: previous.status, total: previous.total, passed: previous.passed, failed: previous.failed, blocked: previous.blocked,
      assertions: previous.assertions, failures: (previous.tests || []).filter(t => t.status === 'failed').map(({ id, name, reason }) => ({ id, name, reason })),
      isolation: previous.isolation, applicationUnchanged: previous.applicationAssets?.unchanged, protectedUnchanged: previous.protectedTestsAndArtifacts?.unchanged }];
  })() : [],
  testAdjustments: ['概览统计措辞允许“符合显示规则的”，仍断言准确的3个话题和6个实体。',
    '760px初始中心命中采样受到前序保存词表的toast临时覆盖；采用Playwright无force的trial可点击性检查，再实际普通点击，保留覆盖节点、坐标及点击审计。'],
  isolation: { origin, serviceWorkers: 'block', realCloudRequests: 0, realModelCalls: 0,
    oldTestsExecuted: 0, continuedRequests: 0, mockModelAttempts: 0,
    reusedHarness: '只读取test-run-timing.cjs，提取installMock函数；不require或执行旧脚本' }
};
let active, browser, page, sources, beforeApp, beforeProtected;
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function fingerprints(directory, excluded = new Set(), prefix = '') {
  const result = {};
  for (const name of fs.readdirSync(directory).sort()) {
    const relative = prefix + name, full = path.join(directory, name);
    if (excluded.has(relative)) continue;
    if (fs.statSync(full).isDirectory()) Object.assign(result, fingerprints(full, excluded, relative + '/'));
    else result[relative] = sha(fs.readFileSync(full));
  }
  return result;
}
function protectedHashes() {
  return {
    tests: fingerprints(path.join(root, '.playwright-cli'), new Set(['test-topic-product-gate.cjs'])),
    outputs: fingerprints(path.join(root, 'outputs'), new Set(['wiki-topic-product-gate-tests.json', '知识Wiki话题显示门槛-本地.png']))
  };
}
// 每个断言在真正执行时计数；遇到失败后不计未执行的断言。
const A = new Proxy(assert, { get(target, key) {
  if (typeof target[key] !== 'function') return target[key];
  return (...args) => {
    active.assertions++;
    try { const value = target[key](...args); active.passedAssertions++; return value; }
    catch (error) { active.failedAssertions++; throw error; }
  };
} });
const sorted = values => [...values].sort();
const define = (id, name, run) => cases.push({ id, name, run });
const nav = (p, id) => p.locator(`#topicStrip [data-nav-topic="${id}"]`);
const child = (p, id, topic) => p.locator(`#topicStrip [data-nav-entity="${id}"][data-parent-topic="${topic}"]`);
const row = (p, id) => p.locator(`#entityRows [data-entity="${id}"]`);
const rows = p => p.locator('#entityRows [data-entity]').evaluateAll(nodes => nodes.map(n => n.dataset.entity).sort());
const metrics = p => p.locator('#entityDetail .overview-metric strong').evaluateAll(nodes => nodes.map(n => Number(n.textContent)));
const seed = (p, mode = 'full', options = {}) => p.evaluate(({ mode, options }) => productGateFixtures.seed(mode, options), { mode, options });
async function diagnostic(p) {
  if (!p || p.isClosed()) return null;
  return p.evaluate(() => ({
    nav: { topic: knowledgeNav.topicId, expanded: [...knowledgeNav.expanded], selected: state.selectedEntity, filters: [...state.filters.topic] },
    browse: browseTopics().map(t => t.id), bottom: allTopics().map(t => t.id),
    entities: allEntities().map(e => ({ id: e.id, tags: e.tags, topics: e.topics, primary: e.primaryTopic })),
    detail: document.getElementById('entityDetail').innerText.slice(0, 2000),
    workbook: document.getElementById('workbookStatus').textContent,
    width: innerWidth, documentWidth: document.documentElement.scrollWidth
  })).catch(error => ({ error: error.message }));
}
async function execute(test, p) {
  active = { id: test.id, name: test.name, assertions: 0, passedAssertions: 0, failedAssertions: 0 };
  const entry = active;
  try { const details = await test.run(p); entry.status = 'passed'; entry.pass = true; if (details !== undefined) entry.details = details; }
  catch (error) { entry.status = 'failed'; entry.pass = false; entry.reason = error.message; entry.stack = error.stack; entry.diagnostic = await diagnostic(p); console.error('失败 ' + entry.id + '：' + error.message); }
  report.tests.push(entry); active = null;
}

function installIsolationExtension() {
  const m = window.productGateMock = { book: null, revision: 1, writes: [], reads: 0, modelAttempts: 0 };
  const factory = WorkBuddyCloud.createWorkBuddyCloud;
  WorkBuddyCloud.createWorkBuddyCloud = function (...args) {
    const client = factory(...args), from = client.database.from.bind(client.database);
    client.llm.chat.completions.create = async function* () {
      m.modelAttempts++; throw Error('本专项禁止调用模型，包括模拟推理');
    };
    client.database.from = table => {
      if (table !== 'wiki_shared_tag_workbook') return from(table);
      const q = { filters: [], payload: null, select() { return this; }, eq(k, v) { this.filters.push([k, v]); return this; },
        maybeSingle() { return this; }, single() { return this; },
        update(value) { this.payload = structuredClone(value); return this; },
        insert() { throw Error('本专项禁止初始化写入'); },
        then(resolve, reject) { return (async () => {
          if (this.payload) {
            if (!m.book || !this.filters.some(([k, v]) => k === 'id' && v === 1) || !this.filters.some(([k, v]) => k === 'revision' && v === m.revision)) return { data: [] };
            m.book = structuredClone(this.payload.workbook); m.revision = this.payload.revision;
            m.writes.push({ table, revision: m.revision, workbook: structuredClone(m.book), isolated: true });
            return { data: [{ id: 1, revision: m.revision }] };
          }
          m.reads++;
          if (!m.book) { const result = await from(table).select().eq('id', 1).maybeSingle(); m.book = structuredClone(result.data.workbook); m.revision = result.data.revision; }
          return { data: { id: 1, revision: m.revision, workbook: structuredClone(m.book) } };
        })().then(resolve, reject); }
      };
      return q;
    };
    return client;
  };
}

function installFixtures() {
  const f = window.productGateFixtures = {};
  f.base = structuredClone(savedWorkbook);
  f.topic = id => ({ id, name: '人工本地专项｜' + id + '｜醉拳操作反馈与资源消耗', desc: '人工夹具，非真实模型结果；验证只显示合格话题，不删除底层记录。', scope: '仅本地隔离测试', preview: true });
  f.entity = (id, game = false, topic = 'T1', extra = {}) => ({
    id, name: game ? (id === 'G2' ? '第二个游戏产品' : '燕云十六声') : '醉拳', summary: '人工夹具：具名对象与逐字来源，非真实模型结果。',
    primaryTopic: topic, topics: [topic], preview: true, aliases: [],
    tags: { type: [game ? '游戏产品' : '技能'], typeId: game ? 'ET-PROD-GAME' : 'ET-CONTENT-SKILL' },
    candidateTags: [], reviewReasons: [], suggestedFacets: { product: ['燕云十六声'], discipline: [], version: [] },
    semanticFacetDetails: [], semanticFacetsRecognized: true,
    sources: [{ file: game ? '人工游戏来源.txt' : '人工技能来源.txt', fileId: game ? 'F1' : 'F2', quote: game ? '燕云十六声是游戏产品。' : '醉拳是一个具体技能。' }],
    facts: [game ? '燕云十六声是游戏产品。' : '醉拳是一个具体技能。'], relations: [], ...extra
  });
  f.pack = mode => {
    if (mode === 'full') {
      const topics = ['T-GAME', 'T-TWO', 'T-SKILL', 'T-MIX', 'T-EMPTY', 'T-PENDING', 'T-PRIMARY'].map(f.topic);
      return { topics, entities: [
        f.entity('G1', true, 'T-GAME', { topics: ['T-GAME', 'T-MIX'] }),
        f.entity('G-TWO1', true, 'T-TWO'), f.entity('G-TWO2', true, 'T-TWO'),
        f.entity('E1', false, 'T-SKILL', { topics: ['T-SKILL', 'T-MIX'] }),
        f.entity('E-PENDING', false, 'T-PENDING', { tags: { type: [], typeId: null }, typeIssue: { reason: '主类型待确认' } }),
        f.entity('E-PRIMARY', false, 'T-PRIMARY', { topics: [] })
      ] };
    }
    const entities = mode === 'empty' ? [] : mode === 'game' ? [f.entity('G1', true)] : mode === 'two-games' ? [f.entity('G1', true), f.entity('G2', true)] : mode === 'mixed' ? [f.entity('G1', true), f.entity('E1')] : [f.entity('E1')];
    return { topics: [f.topic('T1')], entities };
  };
  f.seed = (mode = 'full', options = {}) => {
    savedWorkbook = structuredClone(f.base); draftWorkbook = structuredClone(f.base);
    workbookReady = true; workbookRowId = 1; workbookRevision = 1; workbookDraftRevision = 1; workbookDirty = false; workbookBusy = false;
    productGateMock.book = structuredClone(f.base); productGateMock.revision = 1;
    const pack = f.pack(mode);
    if (Object.hasOwn(options, 'tags')) pack.entities[pack.entities.length - 1].tags = structuredClone(options.tags);
    if (Object.hasOwn(options, 'extra')) Object.assign(pack.entities[pack.entities.length - 1], structuredClone(options.extra));
    if (options.status) savedWorkbook.sheets[0].rows.find(r => r[0] === 'ET-CONTENT-SKILL')[7] = options.status;
    if (options.noWorkbook) savedWorkbook = null;
    if (options.duplicateId) savedWorkbook.sheets[0].rows.push(structuredClone(savedWorkbook.sheets[0].rows.find(r => r[0] === 'ET-CONTENT-SKILL')));
    if (options.ambiguousAlias) {
      savedWorkbook.sheets[0].rows.find(r => r[0] === 'ET-CONTENT-SKILL')[8] += ';共用歧义别名';
      savedWorkbook.sheets[0].rows.find(r => r[0] === 'ET-CHAR-PLAYABLE')[8] += ';共用歧义别名';
    }
    if (savedWorkbook) draftWorkbook = structuredClone(savedWorkbook);
    const files = ['F1', 'F2'].map((id, i) => ({ id, name: i ? '人工技能来源.txt' : '人工游戏来源.txt', originalName: i ? '人工技能来源.txt' : '人工游戏来源.txt',
      text: i ? '醉拳是一个具体技能。' : '燕云十六声是游戏产品。', size: 64, revision: 1, createdAt: '2026-10-14T00:00:00Z', updatedAt: '2026-10-14T00:00:00Z', status: '已解析' }));
    for (const t of pack.topics) t.fileContributions = [{ fileId: 'F1', revision: 1, data: structuredClone(t) }];
    for (const e of pack.entities) e.fileContributions = [{ fileId: e.sources[0].fileId, revision: 1, data: structuredClone(e) }];
    commitFileWorkspace(files, pack.topics, pack.entities);
    knowledgeNav.topicId = null; knowledgeNav.expanded.clear(); state.selectedEntity = null; state.relatedDetailId = null;
    for (const key of ['topic', 'type', 'product', 'discipline', 'version', 'candidate']) state.filters[key].clear();
    state.filters.relation = ''; document.getElementById('entitySearch').value = '';
    setPage('knowledge'); openKnowledgeOverview(); document.querySelector('details.browse-filters').open = false;
    document.getElementById('topicStrip').scrollTop = 0; window.scrollTo(0, 0);
    return pack;
  };
  f.snapshot = () => ({ memory: JSON.stringify([state.files, state.previewTopics, state.previews]), workspace: fileWorkspaceRaw,
    workbook: JSON.stringify(savedWorkbook), storage: Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])) });
  f.inspect = () => ({ all: allTopics().map(t => t.id), browse: browseTopics().map(t => t.id),
    directory: [...document.querySelectorAll('#topicStrip [data-nav-topic]')].map(n => n.dataset.navTopic),
    summary: [...document.querySelectorAll('#entityDetail [data-overview-topic]')].map(n => n.dataset.overviewTopic),
    entities: allEntities().map(e => e.id), helper: allEntities().map(e => topicHasNonGameEntity(e)),
    counts: [...document.querySelectorAll('#entityDetail .overview-metric strong')].map(n => Number(n.textContent)) });
}

async function hidden(p, mode, options = {}) {
  await seed(p, mode, options); const d = await p.evaluate(() => productGateFixtures.inspect());
  A.deepEqual(d.browse, []); A.deepEqual(d.directory, []); A.deepEqual(d.summary, []);
  A.deepEqual(d.all, ['T1']); A.equal(d.counts[0], 0); A.equal(d.counts[1], d.entities.length);
  A.ok(d.helper.every(value => value === false)); return d;
}

define('H01', '本轮词表夹具通过真实校验，游戏及醉拳选择有效唯一active稳定ID', async p => {
  const d = await p.evaluate(() => ({ valid: !!validateWorkbook(savedWorkbook), rows: savedWorkbook.sheets[0].rows.filter(r => ['ET-PROD-GAME', 'ET-CONTENT-SKILL'].includes(r[0])),
    game: resolveTagType({ tags: { type: ['游戏产品'], typeId: 'ET-PROD-GAME' } }, savedWorkbook), skill: resolveTagType({ tags: { type: ['技能'], typeId: 'ET-CONTENT-SKILL' } }, savedWorkbook) }));
  A.equal(d.valid, true); A.equal(d.rows.length, 2); A.ok(d.rows.every(r => r[7] === 'active'));
  A.equal(d.game.id, 'ET-PROD-GAME'); A.equal(d.skill.id, 'ET-CONTENT-SKILL'); A.equal(d.skill.reason, ''); report.snapshots.validTypes = d;
});
define('H02', 'helper接受当前存储单个非空技能标签、匹配ID和唯一别名', async p => {
  await seed(p, 'skill'); const d = await p.evaluate(() => ['技能', '具体技能', '具名能力'].flatMap(label => [false, true].map(withId => {
    const e = productGateFixtures.entity('E1'); e.tags = { type: [label], ...(withId ? { typeId: 'ET-CONTENT-SKILL' } : {}) };
    return { resolved: resolveTagType({ tags: e.tags }, savedWorkbook), accepted: topicHasNonGameEntity(e) };
  })));
  for (const item of d) { A.equal(item.resolved.id, 'ET-CONTENT-SKILL'); A.equal(item.accepted, true); }
});
define('H03', '游戏按ET-PROD-GAME排除，与实体名称及别名无关', async p => {
  await seed(p, 'game'); const d = await p.evaluate(() => ['燕云十六声', '醉拳', '完全改名的产品'].map(name => topicHasNonGameEntity({ ...productGateFixtures.entity('G1', true), name, aliases: ['技能', '具体技能'] })));
  A.deepEqual(d, [false, false, false]);
});
define('D01', '燕云单游戏话题隐藏但底层话题、实体仍在', p => hidden(p, 'game'));
define('D02', '两个游戏实体也不能撑目录', p => hidden(p, 'two-games'));
define('D03', '仅一个已确认醉拳技能即可显示，不要求两个实体', async p => {
  await seed(p, 'skill'); const d = await p.evaluate(() => productGateFixtures.inspect());
  A.deepEqual(d.browse, ['T1']); A.deepEqual(d.directory, ['T1']); A.deepEqual(d.summary, ['T1']); A.deepEqual(d.counts, [1, 1, 0, 1]); A.deepEqual(d.helper, [true]);
});
define('D04', '燕云加醉拳显示，成员列表与总数包含游戏', async p => {
  await seed(p, 'mixed'); A.deepEqual(await p.evaluate(() => browseTopics().map(t => t.id)), ['T1']);
  A.equal(await nav(p, 'T1').locator('.tree-count').textContent(), '2'); await nav(p, 'T1').click();
  A.deepEqual(await rows(p), ['E1', 'G1']); A.equal(await child(p, 'G1', 'T1').count(), 1); A.equal(await child(p, 'E1', 'T1').count(), 1); A.deepEqual(await metrics(p), [1, 2, 0, 2]);
});
define('D05', '无实体话题隐藏，底层记录保留', p => hidden(p, 'empty'));
const invalidTypes = [
  ['D06', '待确认空类型不撑目录', { tags: { type: [], typeId: null } }],
  ['D07', '待确认占位标签不撑目录', { tags: { type: ['待确认'], typeId: null } }],
  ['D08', '两个不同类型不撑目录', { tags: { type: ['技能', '可玩角色'], typeId: null } }],
  ['D09', '重复同类型仍不是单选存储，不撑目录', { tags: { type: ['技能', '技能'], typeId: 'ET-CONTENT-SKILL' } }],
  ['D10', '游戏ID与技能标签冲突不撑目录', { tags: { type: ['技能'], typeId: 'ET-PROD-GAME' } }],
  ['D11', '多个ID相互冲突不撑目录', { tags: { type: ['技能'], typeId: 'ET-CONTENT-SKILL', type_id: 'ET-CHAR-PLAYABLE' } }],
  ['D12', '失效未知稳定ID不能借合法标签通过', { tags: { type: ['技能'], typeId: 'ET-UNKNOWN' } }],
  ['D13', 'deprecated技能标签和ID不撑目录', { status: 'deprecated' }],
  ['D14', '词表draft类型不撑目录', { status: 'draft' }],
  ['D15', '只有有效技能ID但未选择标签不撑目录', { tags: { type: [], typeId: 'ET-CONTENT-SKILL' } }],
  ['D16', '合法标签加空标签仍是多选，不撑目录', { tags: { type: ['技能', ''], typeId: 'ET-CONTENT-SKILL' } }],
  ['D17', '仅空白标签不撑目录', { tags: { type: ['  '], typeId: 'ET-CONTENT-SKILL' } }],
  ['D18', 'tags缺标签，不从顶层类型或身份锚点补填', { tags: {}, extra: { type: '技能', type_id: 'ET-CONTENT-SKILL', anchors: { ontology_type: '技能' } } }],
  ['D19', '歧义同义标签不能解析唯一类型', { ambiguousAlias: true, tags: { type: ['共用歧义别名'] } }],
  ['D20', '重复稳定ID导致解析失效，不撑目录', { duplicateId: true }],
  ['D21', '无已保存云词表不能确认技能类型，不撑目录', { noWorkbook: true }]
];
for (const [id, name, options] of invalidTypes) define(id, name, p => hidden(p, 'skill', options));

define('N01', '游戏标准名、内置别名与词表别名，无ID时也按稳定类型排除', async p => {
  for (const label of ['游戏产品', '游戏', '游戏作品', '交互游戏作品']) {
    await hidden(p, 'game', { tags: { type: [label] } });
    A.equal(await p.evaluate(() => resolveTagType({ tags: allEntities()[0].tags }, savedWorkbook).id), 'ET-PROD-GAME');
  }
});
define('N02', '游戏正式标签改名但ID保持，旧别名和新标准名仍排除', async p => {
  await seed(p, 'game'); const d = await p.evaluate(() => {
    const r = savedWorkbook.sheets[0].rows.find(r => r[0] === 'ET-PROD-GAME'); r[2] = '交互娱乐成品'; r[8] += ';游戏产品';
    const base = productGateFixtures.entity('G1', true);
    const entries = ['交互娱乐成品', '游戏产品', '游戏作品'].map(label => ({ resolved: resolveTagType({ tags: { type: [label], typeId: 'ET-PROD-GAME' } }, savedWorkbook).id,
      accepted: topicHasNonGameEntity({ ...base, tags: { type: [label], typeId: 'ET-PROD-GAME' } }) }));
    allEntities()[0].tags.type = ['交互娱乐成品']; renderKnowledge(); return { entries, browse: browseTopics().map(t => t.id) };
  });
  for (const entry of d.entries) { A.equal(entry.resolved, 'ET-PROD-GAME'); A.equal(entry.accepted, false); } A.deepEqual(d.browse, []); A.equal(await nav(p, 'T1').count(), 0);
});
define('N03', '实体名称叫游戏但当前唯一主类型是技能，仍可撑目录', async p => {
  await seed(p, 'skill', { extra: { name: '游戏产品', aliases: ['燕云十六声'] } });
  A.deepEqual(await p.evaluate(() => browseTopics().map(t => t.id)), ['T1']); A.equal(await p.evaluate(() => topicHasNonGameEntity(allEntities()[0])), true);
});
define('M01', 'primaryTopic-only旧记录以有效主话题归属撑目录', async p => {
  await seed(p, 'skill', { extra: { topics: [] } }); A.deepEqual(await p.evaluate(() => entityTopicIds(allEntities()[0])), ['T1']);
  A.deepEqual(await p.evaluate(() => browseTopics().map(t => t.id)), ['T1']); await nav(p, 'T1').click(); A.deepEqual(await rows(p), ['E1']); A.equal(await child(p, 'E1', 'T1').count(), 1);
});
define('M02', '同稳定醉拳多话题引用不复制实体，primary与topics去重并集', async p => {
  await seed(p, 'skill'); await p.evaluate(() => {
    const f = productGateFixtures, e = structuredClone(allEntities()[0]); e.topics = ['T1', 'T1', 'UNKNOWN']; e.primaryTopic = 'T2';
    commitFileWorkspace(state.files, [f.topic('T1'), f.topic('T2'), f.topic('T-EMPTY')], [e]); renderKnowledge();
  });
  A.deepEqual(sorted(await p.evaluate(() => entityTopicIds(allEntities()[0]))), ['T1', 'T2']); A.deepEqual(await p.evaluate(() => browseTopics().map(t => t.id)), ['T1', 'T2']);
  await nav(p, 'T1').click(); await nav(p, 'T2').click(); A.equal(await p.locator('#topicStrip [data-nav-entity="E1"]').count(), 2);
  for (const topic of ['T1', 'T2']) { await child(p, 'E1', topic).click(); A.equal(await p.evaluate(() => state.selectedEntity), 'E1'); }
  A.equal(await p.evaluate(() => allEntities().length), 1);
});
define('M03', '只有无效引用不制造话题，未确认主类型的primary-only也不撑目录', async p => {
  await hidden(p, 'skill', { extra: { topics: ['UNKNOWN'], primaryTopic: 'UNKNOWN' }, tags: { type: [] } });
  A.deepEqual(await p.evaluate(() => entityTopicIds(allEntities()[0])), []);
  await hidden(p, 'skill', { extra: { topics: [] }, tags: { type: [], typeId: 'ET-CONTENT-SKILL' } });
});

define('U01', '目录、概览、摘要统一三个合格话题；全库实体总数含隐藏话题游戏', async p => {
  await seed(p); const d = await p.evaluate(() => productGateFixtures.inspect());
  A.equal(d.all.length, 7); A.deepEqual(d.browse, ['T-SKILL', 'T-MIX', 'T-PRIMARY']); A.deepEqual(d.directory, d.browse); A.deepEqual(d.summary, d.browse);
  A.deepEqual(d.counts, [3, 6, 0, 2]); A.equal(await p.locator('#topicNavCount').textContent(), '3 话题');
  A.deepEqual(await p.locator('#entityDetail .overview-topic .small').allTextContents(), ['1 个关联实体', '2 个关联实体', '1 个关联实体']);
  const lead = await p.locator('#entityDetail .overview-lead').innerText(); A.match(lead, /3 个(?:符合显示规则的)?语义话题/); A.match(lead, /6 个独立实体/); report.snapshots.overview = d;
});
define('U02', '普通类型筛选只剩游戏，合格混合话题仍有1/2入口，门槛不依赖筛选', async p => {
  await seed(p, 'mixed'); await p.locator('details.browse-filters > summary').click();
  await p.locator('[data-filter-key="type"][data-filter-value="游戏产品"]').click(); const key = await p.evaluate(() => knowledgeFilterKey());
  await nav(p, 'T1').click(); A.deepEqual(await rows(p), ['G1']); A.equal(await nav(p, 'T1').locator('.tree-count').textContent(), '1/2');
  A.deepEqual(await p.evaluate(() => browseTopics().map(t => t.id)), ['T1']); A.equal(await p.evaluate(() => knowledgeFilterKey()), key);
  A.deepEqual(await metrics(p), [1, 2, 0, 2]); A.equal(await child(p, 'E1', 'T1').count(), 0); await child(p, 'G1', 'T1').click(); A.equal(await p.evaluate(() => state.selectedEntity), 'G1');
});
define('U03', '普通搜索筛选0/N仍保留混合话题，概览总数不变', async p => {
  await seed(p, 'mixed'); await p.fill('#entitySearch', '专项绝不命中的检索码'); await nav(p, 'T1').click();
  A.deepEqual(await rows(p), []); A.equal(await nav(p, 'T1').locator('.tree-count').textContent(), '0/2'); A.deepEqual(await p.evaluate(() => browseTopics().map(t => t.id)), ['T1']);
  A.deepEqual(await metrics(p), [1, 2, 0, 2]); await p.locator('#topicStrip [data-overview]').click(); A.equal(await p.locator('#entityDetail [data-overview-topic="T1"]').count(), 1); A.deepEqual(await metrics(p), [1, 2, 0, 2]);
});
define('U04', 'topic筛选与browseTopics独立，导航不改筛选，合格话题0/N仍保留', async p => {
  await seed(p); await p.evaluate(() => toggleFilter('topic', 'T-PRIMARY')); const key = await p.evaluate(() => knowledgeFilterKey()); await nav(p, 'T-MIX').click();
  A.deepEqual(await rows(p), []); A.equal(await nav(p, 'T-MIX').locator('.tree-count').textContent(), '0/2');
  A.deepEqual(await p.evaluate(() => browseTopics().map(t => t.id)), ['T-SKILL', 'T-MIX', 'T-PRIMARY']); A.equal(await p.evaluate(() => knowledgeFilterKey()), key);
});
define('U05', '最后非游戏类型失效后清理当前话题、展开和topicfilter，不删底层', async p => {
  await seed(p, 'mixed'); await nav(p, 'T1').click(); const d = await p.evaluate(() => {
    knowledgeNav.expanded.add('GHOST'); state.filters.topic = new Set(['T1', 'GHOST']);
    savedWorkbook.sheets[0].rows.find(r => r[0] === 'ET-CONTENT-SKILL')[7] = 'deprecated'; renderKnowledge();
    return { topic: knowledgeNav.topicId, expanded: [...knowledgeNav.expanded], filters: [...state.filters.topic], all: allTopics().map(t => t.id), ids: allEntities().map(e => e.id) };
  });
  A.equal(d.topic, null); A.deepEqual(d.expanded, []); A.deepEqual(d.filters, []); A.deepEqual(d.all, ['T1']); A.deepEqual(d.ids, ['G1', 'E1']); A.equal(await nav(p, 'T1').count(), 0);
});
define('U06', '话题隐藏后已选游戏实体仍保留有效详情，全部实体可普通点击查阅', async p => {
  await seed(p, 'mixed'); await nav(p, 'T1').click(); await child(p, 'G1', 'T1').click();
  await p.evaluate(() => { savedWorkbook.sheets[0].rows.find(r => r[0] === 'ET-CONTENT-SKILL')[7] = 'deprecated'; renderKnowledge(); });
  A.equal(await p.evaluate(() => knowledgeNav.topicId), null); A.equal(await p.evaluate(() => state.selectedEntity), 'G1'); A.equal(await nav(p, 'T1').count(), 0);
  A.deepEqual(await rows(p), ['E1', 'G1']); await row(p, 'G1').click(); A.match(await p.locator('#entityDetail .detail-title').textContent(), /燕云/); A.match(await p.locator('#entityDetail').innerText(), /ET-PROD-GAME/);
});
define('U07', '全库只有游戏：零目录不等于零实体，两个游戏仍能逐个查阅', async p => {
  await hidden(p, 'two-games'); A.deepEqual(await metrics(p), [0, 2, 0, 1]); A.deepEqual(await rows(p), ['G1', 'G2']);
  for (const id of ['G1', 'G2']) { await row(p, id).click(); A.equal(await p.evaluate(() => state.selectedEntity), id); A.ok((await p.locator('#entityDetail').innerText()).includes(id + ' · 当前浏览器实体记录 ID')); }
});
define('U08', '显示helper、browseTopics及反复render不修改底层来源和全部localStorage', async p => {
  await seed(p); const d = await p.evaluate(() => {
    const before = productGateFixtures.snapshot();
    for (let i = 0; i < 12; i++) { allEntities().forEach(e => topicHasNonGameEntity(e)); browseTopics(); renderTopics(); renderKnowledge(); }
    return { before, after: productGateFixtures.snapshot(), sources: allEntities().flatMap(e => e.sources), contributions: allEntities().map(e => e.fileContributions.length) };
  });
  A.deepEqual(d.after, d.before); A.equal(d.sources.length, 6); A.deepEqual(d.contributions, [1, 1, 1, 1, 1, 1]); report.snapshots.displayPurity = d;
});
define('U09', '词表草稿停用技能不影响已保存词表门槛，显式workbook参数独立生效', async p => {
  await seed(p, 'skill'); const d = await p.evaluate(() => {
    draftWorkbook.sheets[0].rows.find(r => r[0] === 'ET-CONTENT-SKILL')[7] = 'deprecated'; workbookDirty = true; renderWorkbook(); renderKnowledge();
    return { default: topicHasNonGameEntity(allEntities()[0]), draft: topicHasNonGameEntity(allEntities()[0], draftWorkbook), saved: topicHasNonGameEntity(allEntities()[0], savedWorkbook), browse: browseTopics().map(t => t.id) };
  });
  A.equal(d.default, true); A.equal(d.saved, true); A.equal(d.draft, false); A.deepEqual(d.browse, ['T1']);
});
async function saveDraftByClick(p, status) {
  await p.evaluate(status => {
    productGateMock.book = structuredClone(savedWorkbook); productGateMock.revision = workbookRevision;
    draftWorkbook = structuredClone(savedWorkbook); draftWorkbook.sheets[0].rows.find(r => r[0] === 'ET-CONTENT-SKILL')[7] = status;
    workbookDirty = true; workbookDraftRevision = workbookRevision; setPage('workbook'); renderWorkbook();
  }, status);
  const previous = await p.evaluate(() => productGateMock.writes.length);
  await p.locator('#saveWorkbookBtn').click();
  await p.waitForFunction(n => productGateMock.writes.length > n && !workbookBusy && !workbookDirty, previous);
  const result = await p.evaluate(() => ({ writes: productGateMock.writes.length, revision: workbookRevision, status: savedWorkbook.sheets[0].rows.find(r => r[0] === 'ET-CONTENT-SKILL')[7] }));
  A.equal(result.writes, previous + 1); A.equal(result.status, status); A.equal(result.revision, 2); await p.evaluate(() => setPage('knowledge')); return result;
}
define('U10', '真实保存词表按钮走隔离mock并读回，技能停用后话题隐藏', async p => {
  await seed(p, 'mixed'); const d = await saveDraftByClick(p, 'deprecated');
  A.deepEqual(await p.evaluate(() => browseTopics().map(t => t.id)), []); A.equal(await nav(p, 'T1').count(), 0); A.equal(await p.evaluate(() => allTopics().length), 1); A.equal(await p.evaluate(() => allEntities().length), 2); return d;
});
define('U11', '保存词表将原draft技能变active，重审与render后话题显示', async p => {
  await seed(p, 'skill', { status: 'draft' }); A.deepEqual(await p.evaluate(() => browseTopics()), []); const d = await saveDraftByClick(p, 'active');
  A.deepEqual(await p.evaluate(() => browseTopics().map(t => t.id)), ['T1']); A.equal(await nav(p, 'T1').count(), 1); A.equal(await p.evaluate(() => resolveTagType({ tags: allEntities()[0].tags }, savedWorkbook).id), 'ET-CONTENT-SKILL'); return d;
});
define('U12', '当前存储类型重审确认或置空后render显隐，不运行pipeline、不借历史贡献撑目录', async p => {
  await hidden(p, 'mixed', { tags: { type: [], typeId: 'ET-CONTENT-SKILL' } });
  await p.evaluate(() => { const e = structuredClone(state.previews); e[1].tags = { type: ['技能'], typeId: 'ET-CONTENT-SKILL' }; commitFileWorkspace(state.files, state.previewTopics, e); renderKnowledge(); });
  A.deepEqual(await p.evaluate(() => browseTopics().map(t => t.id)), ['T1']); await nav(p, 'T1').click();
  await p.evaluate(() => { const e = structuredClone(state.previews); e[1].tags = { type: [], typeId: null }; commitFileWorkspace(state.files, state.previewTopics, e); renderKnowledge(); });
  A.deepEqual(await p.evaluate(() => browseTopics()), []); A.equal(await p.evaluate(() => knowledgeNav.topicId), null);
  A.equal(await p.evaluate(() => allEntities()[1].fileContributions[0].data.tags.typeId), 'ET-CONTENT-SKILL');
});
define('U13', '恶意名称、摘要和证据按安全文本显示，不执行HTML或注入事件', async p => {
  await seed(p, 'mixed'); const evil = { topic: '<img src=x onerror="window.__productGateXss=1"> & 话题', entity: '<svg onload="window.__productGateXss=2"></svg> 醉拳', text: '</textarea><script>window.__productGateXss=3</script>' };
  await p.evaluate(v => { const t = structuredClone(state.previewTopics), e = structuredClone(state.previews); t[0].name = v.topic; t[0].desc = v.text; e[1].name = v.entity; e[1].summary = v.text; e[1].sources[0].quote = v.text; commitFileWorkspace(state.files, t, e); renderKnowledge(); }, evil);
  A.equal(await nav(p, 'T1').locator('.tree-label').textContent(), evil.topic); A.equal(await p.locator('#entityDetail [data-overview-topic="T1"]').textContent(), evil.topic);
  A.equal(await row(p, 'E1').locator('strong').textContent(), evil.entity); await nav(p, 'T1').click(); await child(p, 'E1', 'T1').click();
  A.equal(await p.locator('#entityDetail .detail-title').textContent(), evil.entity); A.ok((await p.locator('#entityDetail').innerText()).includes(evil.text));
  A.equal(await p.locator('#topicStrip img,#topicStrip svg,#topicStrip script,#entityRows img,#entityRows svg,#entityRows script,#entityDetail img,#entityDetail svg,#entityDetail script').count(), 0); A.equal(await p.evaluate(() => window.__productGateXss || 0), 0);
});

for (const width of [1440, 760, 390]) for (const scene of ['概览', '话题展开', '实体详情', '筛选展开']) {
  define(`L-${width}-${scene}`, `${width}px ${scene}普通点击且页面、浏览面板无横向溢出`, async p => {
    await p.setViewportSize({ width, height: 1080 }); await seed(p);
    await p.evaluate(() => {
      const t = structuredClone(state.previewTopics), e = structuredClone(state.previews);
      t.forEach(t => t.name += '｜本地稳定ID、显示门槛、混合成员与长名称布局验证'.repeat(3));
      e[3].name += '｜多话题引用的唯一实体长名称'.repeat(3); commitFileWorkspace(state.files, t, e); renderKnowledge();
    });
    if (scene !== '概览') {
      await nav(p, 'T-MIX').scrollIntoViewIfNeeded();
      const hit = await nav(p, 'T-MIX').evaluate(el => {
        const r = el.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2, n = document.elementFromPoint(x, y);
        return { centerHit: !!n && el.contains(n), rectangle: r.toJSON(), point: { x, y }, hitNode: n?.outerHTML.slice(0, 350) || null,
          viewport: { width: innerWidth, height: innerHeight }, scroll: { x: scrollX, y: scrollY } };
      });
      await nav(p, 'T-MIX').click({ trial: true });
      report.clickAudit.push({ width, scene, beforeActionability: hit, ordinaryClickTrialPassed: true, force: false });
      A.equal(await nav(p, 'T-MIX').isVisible(), true); await nav(p, 'T-MIX').click(); A.equal(await nav(p, 'T-MIX').getAttribute('aria-expanded'), 'true');
    }
    if (scene === '实体详情' || scene === '筛选展开') { await child(p, 'E1', 'T-MIX').click(); A.equal(await p.evaluate(() => state.selectedEntity), 'E1'); }
    if (scene === '筛选展开') { await p.locator('details.browse-filters > summary').click(); A.equal(await p.locator('details.browse-filters').evaluate(el => el.open), true); }
    const measurement = await p.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth,
      panels: ['.browse-grid', '#topicStrip', '.entity-list', '#entityRows', '#entityDetail', 'details.browse-filters'].map(selector => {
        const el = document.querySelector(selector), r = el.getBoundingClientRect(); return { selector, client: el.clientWidth, scroll: el.scrollWidth, left: r.left, right: r.right };
      }) }));
    report.responsive.push({ width, scene, ...measurement }); A.ok(measurement.document <= width + 2); A.ok(measurement.body <= width + 2);
    for (const panel of measurement.panels) { A.ok(panel.scroll <= panel.client + 2, '面板内部溢出：' + JSON.stringify(panel)); A.ok(panel.left >= -2 && panel.right <= width + 2, '面板越界：' + JSON.stringify(panel)); }
    return measurement;
  });
}
define('S01', '生成指定本地截图，画面显示人工夹具及游戏仍在全部实体', async p => {
  await p.setViewportSize({ width: 1440, height: 1080 }); await seed(p);
  await nav(p, 'T-MIX').click(); await p.locator('#topicStrip [data-overview]').click();
  await p.screenshot({ path: path.join(root, shotName), fullPage: true }); report.artifacts.push(path.join(root, shotName));
  A.ok(fs.statSync(path.join(root, shotName)).size > 0); A.deepEqual(await metrics(p), [3, 6, 0, 2]); A.equal(await row(p, 'G1').count(), 1);
});
define('Z01', '真正五资源全部加载；SDK与词表始终隔离模拟', async p => {
  A.deepEqual(sorted(new Set(loaded)), sorted(modules)); const d = await p.evaluate(() => ({ queries: timingMock.queries, writes: timingMock.writes, calls: timingMock.calls, reads: productGateMock.reads, saves: productGateMock.writes }));
  A.ok(d.queries.length > 0); A.ok(d.queries.every(q => ['wiki_prompt_versions', 'wiki_shared_tag_workbook'].includes(q.table) && !q.write));
  A.deepEqual(d.writes, []); A.deepEqual(d.calls, []); A.equal(d.saves.length, 2); A.ok(d.saves.every(s => s.isolated && s.table === 'wiki_shared_tag_workbook')); A.ok(d.reads >= 3); report.snapshots.mockAudit = d;
});
define('Z02', '所有请求都在route处理，无真实云、模型、旧测试或意外页面异常', async p => {
  const attempts = await p.evaluate(() => productGateMock.modelAttempts); report.isolation.mockModelAttempts = attempts;
  A.equal(attempts, 0); A.ok(network.length > 0); A.ok(network.every(n => ['真实本地资源', '模拟词表资产', '拦截外部脚本为空', '拦截其他网络'].includes(n.action)));
  A.equal(report.isolation.continuedRequests, 0); A.equal(report.isolation.oldTestsExecuted, 0); A.deepEqual(errors, []);
  A.ok(dialogs.every(d => d.type === 'confirm' && d.allowed)); A.equal(dialogs.length, 2);
});
define('Z03', '应用、旧测试和其他输出前后指纹不变，本专项只写三个允许路径', async () => {
  const afterApp = fingerprints(app), afterProtected = protectedHashes();
  report.applicationAssets = { before: beforeApp, after: afterApp, unchanged: JSON.stringify(beforeApp) === JSON.stringify(afterApp) };
  report.protectedTestsAndArtifacts = { before: beforeProtected, after: afterProtected, unchanged: JSON.stringify(beforeProtected) === JSON.stringify(afterProtected) };
  A.deepEqual(afterApp, beforeApp); A.deepEqual(afterProtected, beforeProtected);
});

function extractMock() {
  const old = fs.readFileSync(path.join(root, '.playwright-cli/test-run-timing.cjs'), 'utf8');
  const start = old.indexOf('function installMock(){'), end = old.indexOf('\nlet browser,shotPage;');
  if (start < 0 || end <= start) throw Error('旧harness提取边界失效；拒绝执行旧脚本');
  let code = old.slice(start, end);
  if (!code.trimEnd().endsWith('}') || /chromium\.launch|require\(/.test(code)) throw Error('提取范围不只是installMock函数');
  const needle = "'active','玩家角色']]},";
  if (code.split(needle).length !== 2) throw Error('词表夹具插入边界不唯一');
  const rows = [
    ['ET-PROD-GAME', '产品', '游戏产品', '可独立指代的交互游戏作品。', '燕云十六声', '具体技能与玩法系统不属于游戏产品。', '按具名产品身份赋值', 'active', '交互游戏作品'],
    ['ET-CONTENT-SKILL', '玩法内容', '技能', '角色、装备或单位可施放的具名能力。', '醉拳', '技能或武学管理系统、游戏产品本体不属于具体技能。', '按最具体具名能力赋值', 'active', '具体技能;具名能力']
  ];
  code = code.replace(needle, "'active','玩家角色']," + rows.map(r => JSON.stringify(r)).join(',') + ']},');
  code += '\ninstallMock();'; new vm.Script(code); return code;
}
async function session(mockCode) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, serviceWorkers: 'block', acceptDownloads: false }); contexts.push(context);
  await context.addInitScript({ content: mockCode }); await context.addInitScript(installIsolationExtension);
  if (typeof context.routeWebSocket === 'function') await context.routeWebSocket('**/*', socket => socket.close());
  const workbookMatch = sources['index.html'].match(/const WORKBOOK_ASSET=['"]([^'"]+)['"]/);
  if (!workbookMatch) throw Error('无法识别真实词表资产路径');
  const workbookPath = new URL(workbookMatch[1], origin + '/').pathname;
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), entry = { method: request.method(), url: request.url(), action: '' }; network.push(entry);
    if (request.method() === 'GET' && url.origin === origin) {
      const name = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      if (Object.hasOwn(sources, name)) { entry.action = '真实本地资源'; loaded.push(name); return route.fulfill({ contentType: name.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript; charset=utf-8', body: sources[name] }); }
      if (url.pathname === workbookPath) { entry.action = '模拟词表资产'; return route.fulfill({ contentType: 'application/octet-stream', body: Buffer.from('mock-workbook') }); }
    }
    if (request.method() === 'GET' && url.origin !== origin && request.resourceType() === 'script') { entry.action = '拦截外部脚本为空'; return route.fulfill({ contentType: 'application/javascript', body: '' }); }
    entry.action = '拦截其他网络'; return route.abort('blockedbyclient');
  });
  const p = await context.newPage(); p.setDefaultTimeout(10000);
  p.on('pageerror', e => errors.push(e.message));
  p.on('dialog', async d => { const allowed = d.type() === 'confirm' && d.message().includes('确认将草稿保存到共享词表'); dialogs.push({ type: d.type(), message: d.message(), allowed }); if (allowed) await d.accept(); else await d.dismiss(); });
  await p.goto(origin + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => workbookReady && !cloudLoading && fileManagerReady && wikiPromptHistory.getController().status().ready);
  await p.evaluate(installFixtures); return p;
}
function finish() {
  const executed = new Set(report.tests.map(t => t.id));
  for (const test of cases) if (!executed.has(test.id)) report.tests.push({ id: test.id, name: test.name, status: 'blocked', pass: false, assertions: 0, passedAssertions: 0, failedAssertions: 0, reason: report.blockReason || '启动或场景初始化失败，未执行' });
  report.finishedAt = new Date().toISOString(); report.total = cases.length;
  report.passed = report.tests.filter(t => t.status === 'passed').length; report.failed = report.tests.filter(t => t.status === 'failed').length; report.blocked = report.tests.filter(t => t.status === 'blocked').length;
  report.assertions = { total: report.tests.reduce((n, t) => n + t.assertions, 0), passed: report.tests.reduce((n, t) => n + t.passedAssertions, 0), failed: report.tests.reduce((n, t) => n + t.failedAssertions, 0) };
  report.status = report.blockReason ? 'blocked' : report.failed || report.blocked || report.harnessErrors.length ? 'failed' : 'passed';
  fs.writeFileSync(path.join(root, reportName), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, total: report.total, passed: report.passed, failed: report.failed, blocked: report.blocked, assertions: report.assertions,
    failures: report.tests.filter(t => t.status === 'failed').map(({ id, name, reason }) => ({ id, name, reason })), harnessErrors: report.harnessErrors, reportPath: path.join(root, reportName), artifacts: report.artifacts }, null, 2));
  if (report.status !== 'passed') process.exitCode = report.status === 'blocked' ? 2 : 1;
}
(async () => {
  report.planned = cases.map(({ id, name }) => ({ id, name }));
  try {
    if (process.argv.length !== 3 || process.argv[2] !== '--source-ready') { report.blockReason = '只能在主代理通知源码就绪后使用--source-ready；未启动浏览器或测试'; return; }
    sources = Object.fromEntries(modules.map(n => [n, fs.readFileSync(path.join(app, n), 'utf8')]));
    // 只检查一次，不轮询、不sleep，不代改源码。
    if (!/function\s+topicHasNonGameEntity\s*\(/.test(sources['index.html'])) { report.blockReason = '首次读取源码尚无topicHasNonGameEntity，未启动浏览器或测试'; return; }
    beforeApp = fingerprints(app); beforeProtected = protectedHashes();
    for (const match of sources['index.html'].matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
    for (const n of modules.slice(1)) new vm.Script(sources[n], { filename: n });
    const mockCode = extractMock();
    const { chromium } = require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
    browser = await chromium.launch({ channel: 'chrome', headless: true }); page = await session(mockCode);
    for (const test of cases) await execute(test, page);
  } catch (error) { report.harnessErrors.push({ reason: error.message, stack: error.stack }); }
  finally {
    for (const context of contexts) await context.close().catch(() => {});
    if (browser) await browser.close().catch(error => report.harnessErrors.push({ reason: error.message }));
    finish();
  }
})();
