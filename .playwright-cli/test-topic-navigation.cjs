'use strict';
const { chromium } = require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('node:assert/strict');

const root = 'C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25';
const app = root + '/wiki-demo-mvp';
const base = 'https://wiki-mvp-lab.app-tencent.workbuddy.host/';
const online = process.argv.includes('--online');
const reportPath = root + '/outputs/wiki-topic-navigation-' + (online ? 'online-' : '') + 'tests.json';
const screenshotPath = root + '/outputs/知识Wiki话题树-' + (online ? '线上' : '本地') + '.png';
const startup = '<script>wikiPromptHistory.init();init();</script>';
const html = fs.readFileSync(app + '/index.html', 'utf8');
const modules = ['/semantic-tags.js', '/pipeline.js', '/file-manager.js'];
const fingerprint = () => Object.fromEntries(fs.readdirSync(app).filter(name => fs.statSync(path.join(app, name)).isFile()).map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(app, name))).digest('hex')]));
const originalAssets = fingerprint();
const topicIds = Array.from({ length: 25 }, (_, i) => 'UI-TOPIC-' + String(i + 1).padStart(2, '0'));
const sharedId = 'UI-ENTITY-SHARED-STABLE';
const firstId = 'UI-ENTITY-ONLY-FIRST';
const secondId = 'UI-ENTITY-ONLY-SECOND';
const topics = topicIds.map((id, i) => ({
  id, name: `示意话题${String(i + 1).padStart(2, '0')}｜长名称下的话题树换行、稳定实体引用、浏览导航与筛选边界验证｜` + '仅用于本地界面测试不代表真实模型结果'.repeat(2),
  scope: '全部为人工构造的 UI_TEST_FIXTURE，仅验证交互与排版，不是真实知识或模型结果。',
  desc: `第 ${i + 1} 个人工示意话题：验证知识目录、独立实体统计与话题摘要。`,
  preview: true
}));
function entity(id, name, memberships, product, discipline, version, source) {
  const summary = '人工构造的界面测试示意实体，不代表任何真实模型解析结果。';
  return { id, name, summary, preview: true, primaryTopic: memberships[0], topics: memberships,
    tags: { type: [] }, suggestedFacets: { product: [product], discipline: [discipline], version: [version] },
    candidateTags: [], sources: [{ file: source, quote: summary }], facts: [summary], relations: [],
    reviewReasons: ['UI_TEST_FIXTURE'], identityAnchors: { ontologyType: '界面测试示意对象', realityDomain: '虚构测试', productIpScope: product } };
}
const entities = [
  entity(sharedId, '示意共享实体｜前两个话题引用同一稳定 ID', topicIds.slice(0, 2), '示意产品甲', '策划', '示意版本甲', '人工示意来源甲.txt'),
  entity(firstId, '示意首话题独有实体', [topicIds[0]], '示意产品甲', '程序', '示意版本乙', '人工示意来源甲.txt'),
  entity(secondId, '示意次话题独有实体', [topicIds[1]], '示意产品乙', '策划', '示意版本甲', '人工示意来源乙.txt')
];
entities[0].relations = [{ type: '示意关联', targetId: secondId, targetName: entities[2].name, strength: 'weak', evidence: '人工构造的关联，仅用于本地测试。' }];
const report = {
  mode: online ? 'online-resources-isolated-fixtures' : 'local', startedAt: new Date().toISOString(),
  onlineResourceMatches: {},
  runtime: { executable: process.execPath, playwright: require.resolve('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright') },
  isolation: { origin: base, realModules: modules, promptHistory: '隔离为空脚本', initCloud: '沿用参考测试，仅在路由 HTML 中禁用', network: '全部请求经本地路由，禁止实际云端与模型请求' },
  fixture: { note: '全为人工示意，不代表真实模型结果', topicCount: 25, entityCount: 3, topicIds, sharedId, memberships: entities.map(e => ({ id: e.id, topics: e.topics })) },
  tests: [], responsive: [], scroll: {}, pageErrors: [], dialogs: [], network: { localAssets: [], mockCloudReads: [], blockedCloudWrites: [], blockedModelCalls: [], unexpectedRequests: [], externalRequestsContinued: 0 },
  artifacts: []
};
let browser, page;
async function diagnostic() {
  if (!page || page.isClosed()) return null;
  return page.evaluate(() => ({
    navigation: { topicId: knowledgeNav.topicId, expanded: [...knowledgeNav.expanded], selectedEntity: state.selectedEntity, relatedDetailId: state.relatedDetailId },
    filterKey: knowledgeFilterKey(), entities: allEntities().map(e => ({ id: e.id, topics: e.topics })),
    rows: [...document.querySelectorAll('#entityRows [data-entity]')].map(el => el.dataset.entity),
    detailText: document.getElementById('entityDetail').innerText.slice(0, 1800),
    treeScroll: { top: document.getElementById('topicStrip').scrollTop, client: document.getElementById('topicStrip').clientHeight, height: document.getElementById('topicStrip').scrollHeight },
    documentWidth: document.documentElement.scrollWidth, viewport: innerWidth
  })).catch(error => ({ diagnosticError: error.message }));
}
async function test(name, run) {
  try {
    const details = await run();
    report.tests.push({ test: name, pass: true, ...(details === undefined ? {} : { details }) });
    console.log('通过 ' + name);
  } catch (error) {
    report.tests.push({ test: name, pass: false, error: error.message, stack: error.stack, diagnostic: await diagnostic() });
    console.error('失败 ' + name + '\n' + error.message);
  }
}
async function seed() {
  await page.evaluate(({ topics, entities }) => {
    commitFileWorkspace([], structuredClone(topics), structuredClone(entities));
    knowledgeNav.expanded.clear();
    clearFilters();
    openKnowledgeOverview();
    document.querySelector('details.browse-filters').open = false;
    document.getElementById('topicStrip').scrollTop = 0;
    window.scrollTo(0, 0);
  }, { topics, entities });
}
const navTopic = id => page.locator(`#topicStrip [data-nav-topic="${id}"]`);
const navEntity = (id, parent) => page.locator(`#topicStrip [data-nav-entity="${id}"][data-parent-topic="${parent}"]`);
const row = id => page.locator(`#entityRows [data-entity="${id}"]`);
const overview = () => page.locator('#topicStrip [data-overview]');
const rows = () => page.locator('#entityRows [data-entity]').evaluateAll(els => els.map(el => el.dataset.entity).sort());
const metrics = () => page.locator('#entityDetail .overview-metric strong').evaluateAll(els => els.map(el => Number(el.textContent)));
const stateNav = () => page.evaluate(() => ({ topicId: knowledgeNav.topicId, expanded: [...knowledgeNav.expanded].sort(), selected: state.selectedEntity, topicFilters: [...state.filters.topic] }));
const sorted = values => [...values].sort();
async function title(expected) { assert.equal(await page.locator('#entityDetail .detail-title').textContent(), expected); }
async function entityDetail(id, name) {
  await title(name);
  assert.equal(await page.evaluate(() => state.selectedEntity), id);
  assert.ok((await page.locator('#entityDetail').innerText()).includes(id + ' · 当前浏览器实体记录 ID'));
  assert.equal(await page.locator('#entityDetail .knowledge-overview').count(), 0);
}
async function chooseFacet(key, value) {
  await page.locator('details.browse-filters > summary').click();
  await page.locator(`details.browse-filters [data-filter-key="${key}"][data-filter-value="${value}"]`).click();
}
async function responsiveMetrics() {
  return page.evaluate(() => {
    const selectors = ['.browse-grid', '#topicStrip', '.entity-list', '#entityRows', '#entityDetail', 'details.browse-filters'];
    return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth,
      panels: selectors.map(selector => { const el = document.querySelector(selector), box = el.getBoundingClientRect(); return { selector, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, left: box.left, right: box.right }; }) };
  });
}
function noOverflow(measured) {
  assert.ok(measured.documentWidth <= measured.viewport, JSON.stringify(measured));
  assert.ok(measured.bodyWidth <= measured.viewport, JSON.stringify(measured));
  for (const panel of measured.panels) {
    assert.ok(panel.scrollWidth <= panel.clientWidth + 1, '面板横向溢出：' + JSON.stringify(panel));
    assert.ok(panel.left >= -1 && panel.right <= measured.viewport + 1, '面板超出视口：' + JSON.stringify(panel));
  }
}

(async () => {
  try {
    assert.equal(html.split(startup).length - 1, 1, '隔离入口必须与参考测试精确一致');
    for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
    for (const name of modules) new vm.Script(fs.readFileSync(app + name, 'utf8'));
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, serviceWorkers: 'block' });
    page = await context.newPage();
    page.setDefaultTimeout(7000);
    page.on('pageerror', error => report.pageErrors.push(error.message));
    page.on('dialog', async dialog => { report.dialogs.push({ type: dialog.type(), message: dialog.message() }); await dialog.dismiss(); });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), method = request.method();
      if (url.pathname.startsWith('/.cloud/llm/')) { report.network.blockedModelCalls.push({ url: request.url(), method }); return route.abort('blockedbyclient'); }
      if (url.pathname.startsWith('/.cloud/') && !['GET', 'HEAD', 'OPTIONS'].includes(method)) { report.network.blockedCloudWrites.push({ url: request.url(), method }); return route.abort('blockedbyclient'); }
      if (url.origin === new URL(base).origin && method === 'GET') {
        if (url.pathname.startsWith('/.cloud/')) { report.network.mockCloudReads.push(request.url()); return route.fulfill({ contentType: 'application/json', body: '{"data":[]}' }); }
        if (url.pathname === '/prompt-history.js') { report.network.localAssets.push({ name: url.pathname, isolated: true }); return route.fulfill({ contentType: 'application/javascript', body: '' }); }
        if (modules.includes(url.pathname)) {
          const local = fs.readFileSync(app + url.pathname, 'utf8');
          if (online) { const response = await route.fetch(); assert.equal(response.status(), 200); const actual = await response.text(); assert.equal(actual.replace(/\r\n/g, '\n'), local.replace(/\r\n/g, '\n')); report.onlineResourceMatches[url.pathname] = true; report.network.localAssets.push({ name: url.pathname, realLocal: true, realOnline: true }); return route.fulfill({ response }); }
          report.network.localAssets.push({ name: url.pathname, realLocal: true }); return route.fulfill({ contentType: 'application/javascript', body: local });
        }
        if (url.pathname === '/' || url.pathname === '/index.html') {
          let actual = html;
          if (online) { const response = await route.fetch(); assert.equal(response.status(), 200); actual = await response.text(); assert.equal(actual.replace(/\r\n/g, '\n'), html.replace(/\r\n/g, '\n')); report.onlineResourceMatches['/index.html'] = true; }
          report.network.localAssets.push({ name: '/index.html', realLocal: true, realOnline: online, isolatedStartup: true }); return route.fulfill({ contentType: 'text/html', body: actual.replace(startup, '<script>initCloud=async()=>{};init();</script>') });
        }
      }
      if (url.origin === 'https://cdn.jsdelivr.net' && method === 'GET') return route.fulfill({ contentType: 'application/javascript', body: '' });
      report.network.unexpectedRequests.push({ url: request.url(), method });
      return route.abort('blockedbyclient');
    });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof commitFileWorkspace === 'function' && typeof renderKnowledgeOverview === 'function' && fileManagerReady);

    await test('真实本地模块加载；默认概览；25 话题与 3 个去重实体', async () => {
      await page.evaluate(({ topics, entities }) => { commitFileWorkspace([], topics, entities); setPage('knowledge'); }, { topics, entities });
      assert.deepEqual(await stateNav(), { topicId: null, expanded: [], selected: null, topicFilters: [] });
      await title('知识库概览');
      assert.equal(await overview().getAttribute('aria-current'), 'page');
      assert.equal(await page.locator('#topicStrip [data-nav-topic]').count(), 25);
      assert.equal(await page.locator('#topicNavCount').textContent(), '25 话题');
      assert.deepEqual(await rows(), sorted([sharedId, firstId, secondId]));
      assert.deepEqual(await metrics(), [25, 3, 1, 2]);
      assert.ok((await page.locator('#entityDetail').innerText()).includes('3 个独立实体'));
      for (const name of modules) assert.ok(report.network.localAssets.some(asset => asset.name === name && asset.realLocal));
      assert.equal(await page.evaluate(() => typeof window.wikiPromptHistory), 'undefined');
    });
    await test('顶部横向 topic-card 已移除；搜索和折叠多维筛选位于中间栏', async () => {
      assert.equal(await page.locator('#knowledgePage .topic-card, #knowledgePage .topic-strip').count(), 0);
      assert.equal(await page.locator('.knowledge-nav #topicStrip').count(), 1);
      assert.equal(await page.locator('.entity-list #entitySearch').count(), 1);
      assert.equal(await page.locator('.entity-list #entityRows').count(), 1);
      assert.equal(await page.locator('.entity-list details.browse-filters #filterGroups').count(), 1);
      assert.equal(await page.locator('.knowledge-nav #filterGroups').count(), 0);
      assert.equal(await page.locator('details.browse-filters').getAttribute('open'), null);
    });
    await test('鼠标进入话题，展开实体、成员列表及话题总览一致', async () => {
      await seed(); await navTopic(topicIds[0]).click();
      assert.equal(await navTopic(topicIds[0]).getAttribute('aria-expanded'), 'true');
      assert.deepEqual(await rows(), sorted([sharedId, firstId]));
      assert.deepEqual(await navTopic(topicIds[0]).locator('..').locator('[data-nav-entity]').evaluateAll(els => els.map(el => el.dataset.navEntity).sort()), sorted([sharedId, firstId]));
      await title(topics[0].name); assert.deepEqual(await metrics(), [1, 2, 1, 1]);
      assert.ok((await page.locator('#entityDetail').innerText()).includes('话题总览'));
      assert.equal(await page.locator('#entityListTitle').textContent(), '本话题实体');
      assert.deepEqual((await stateNav()).topicFilters, []);
    });
    await test('再次点击话题收起，仅折叠子树，不丢失话题范围或话题总览', async () => {
      await seed(); await navTopic(topicIds[0]).click(); await navTopic(topicIds[0]).click();
      assert.equal(await navTopic(topicIds[0]).getAttribute('aria-expanded'), 'false');
      assert.equal(await navEntity(sharedId, topicIds[0]).count(), 0);
      assert.deepEqual(await rows(), sorted([sharedId, firstId])); await title(topics[0].name);
      assert.deepEqual(await stateNav(), { topicId: topicIds[0], expanded: [], selected: null, topicFilters: [] });
    });
    await test('话题切换与 Enter 操作保留多个展开分支', async () => {
      await seed(); await navTopic(topicIds[0]).click(); await navTopic(topicIds[1]).focus(); await page.keyboard.press('Enter');
      assert.equal(await navTopic(topicIds[0]).getAttribute('aria-expanded'), 'true');
      assert.equal(await navTopic(topicIds[1]).getAttribute('aria-expanded'), 'true');
      assert.deepEqual(await rows(), sorted([sharedId, secondId])); await title(topics[1].name);
      assert.deepEqual((await stateNav()).expanded, sorted(topicIds.slice(0, 2)));
    });
    await test('左树实体鼠标点击显示正确名称、稳定 ID，并聚焦详情', async () => {
      await seed(); await navTopic(topicIds[0]).click(); await navEntity(sharedId, topicIds[0]).click();
      await entityDetail(sharedId, entities[0].name);
      assert.equal(await navEntity(sharedId, topicIds[0]).getAttribute('aria-current'), 'page');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'entityDetail');
      assert.equal(await page.evaluate(() => document.getElementById('entityDetail').scrollTop), 0);
    });
    await test('左树实体 Enter 显示对应实体及稳定 ID', async () => {
      await seed(); await navTopic(topicIds[1]).click(); await navEntity(secondId, topicIds[1]).focus(); await page.keyboard.press('Enter');
      await entityDetail(secondId, entities[2].name); assert.equal((await stateNav()).topicId, topicIds[1]);
    });
    await test('中间实体列表鼠标与 Enter 均打开对应详情及 ID', async () => {
      await seed(); await row(firstId).click(); await entityDetail(firstId, entities[1].name);
      assert.equal(await row(secondId).getAttribute('role'), 'button');
      assert.equal(await row(secondId).getAttribute('tabindex'), '0');
      await row(secondId).focus(); await page.keyboard.press('Enter'); await entityDetail(secondId, entities[2].name);
      assert.equal((await stateNav()).topicId, null);
    });
    await test('多个话题引用同一实体，反复点击及渲染不产生数据副本', async () => {
      await seed();
      const before = await page.evaluate(() => ({ memory: JSON.stringify(allEntities()), workspace: localStorage.getItem(FILE_WORKSPACE_KEY) }));
      await navTopic(topicIds[0]).click(); await navTopic(topicIds[1]).click();
      assert.equal(await page.locator(`#topicStrip [data-nav-entity="${sharedId}"]`).count(), 2);
      for (let i = 0; i < 3; i++) {
        await navEntity(sharedId, topicIds[0]).click(); await entityDetail(sharedId, entities[0].name);
        await navEntity(sharedId, topicIds[1]).click(); await entityDetail(sharedId, entities[0].name);
        await page.evaluate(() => renderKnowledge());
      }
      assert.equal(await page.evaluate(id => allEntities().filter(e => e.id === id).length, sharedId), 1);
      assert.deepEqual(await page.evaluate(() => ({ memory: JSON.stringify(allEntities()), workspace: localStorage.getItem(FILE_WORKSPACE_KEY) })), before);
      await overview().click(); assert.deepEqual(await metrics(), [25, 3, 1, 2]);
    });
    await test('全库概览统计不受搜索、多维筛选或关系筛选影响', async () => {
      await seed(); const before = await metrics();
      await page.fill('#entitySearch', '示意共享实体');
      await chooseFacet('product', '示意产品甲');
      await page.locator('[data-filter-key="discipline"][data-filter-value="策划"]').click();
      await page.locator('#relationFilter').selectOption('示意关联');
      assert.deepEqual(await rows(), [sharedId]); await title('知识库概览');
      assert.deepEqual(await metrics(), before);
      assert.ok((await page.locator('#entityDetail').innerText()).includes('全库总结 · 不受筛选影响'));
      await page.fill('#entitySearch', '绝不匹配的人工测试查询');
      assert.deepEqual(await rows(), []); assert.deepEqual(await metrics(), [25, 3, 1, 2]); await title('知识库概览');
    });
    await test('筛选与话题展开相互独立，topicId 不写入 state.filters.topic', async () => {
      await seed(); await chooseFacet('product', '示意产品乙');
      const filterBefore = await page.evaluate(() => knowledgeFilterKey());
      await navTopic(topicIds[0]).click();
      assert.deepEqual(await rows(), []);
      assert.equal(await navTopic(topicIds[0]).getAttribute('aria-expanded'), 'true');
      assert.equal(await navTopic(topicIds[0]).locator('.tree-count').textContent(), '0/2');
      await navTopic(topicIds[1]).click(); assert.deepEqual(await rows(), [secondId]);
      assert.equal(await navTopic(topicIds[0]).getAttribute('aria-expanded'), 'true');
      assert.equal(await navTopic(topicIds[1]).getAttribute('aria-expanded'), 'true');
      assert.equal(await page.evaluate(() => knowledgeFilterKey()), filterBefore);
      assert.deepEqual((await stateNav()).topicFilters, []);
      await page.locator('[data-filter-key="product"][data-filter-value="示意产品乙"]').click();
      assert.deepEqual((await stateNav()).expanded, sorted(topicIds.slice(0, 2)));
      assert.equal((await stateNav()).topicId, topicIds[1]);
      assert.deepEqual(await rows(), sorted([sharedId, secondId]));
    });
    await test('实体被搜索筛选隐藏时有明确空结果反馈，不保留悬空实体详情', async () => {
      await seed(); await navTopic(topicIds[0]).click(); await navEntity(sharedId, topicIds[0]).click();
      await page.fill('#entitySearch', '不存在的示意实体检索值');
      assert.deepEqual(await rows(), []); assert.equal(await page.locator('#entityCount').textContent(), '0');
      assert.equal(await navTopic(topicIds[0]).locator('.tree-count').textContent(), '0/2');
      assert.ok((await navTopic(topicIds[0]).locator('..').locator('.tree-children .empty').innerText()).includes('没有符合筛选的实体'));
      assert.ok((await page.locator('#entityRows .empty').innerText()).includes('没有符合当前筛选条件的实体'));
      assert.equal(await page.locator('#entityDetail .detail-title').count(), 0);
      assert.ok((await page.locator('#entityDetail .empty').innerText()).includes('选择一个实体'));
      assert.equal((await stateNav()).selected, null); assert.equal((await stateNav()).topicId, topicIds[0]);
      assert.equal(await navTopic(topicIds[0]).getAttribute('aria-expanded'), 'true');
    });
    await test('关联实体在话题或筛选外仍显示提示，返回原筛选不清条件', async () => {
      await seed(); await navTopic(topicIds[0]).click(); await navEntity(sharedId, topicIds[0]).click();
      await page.fill('#entitySearch', '示意共享实体');
      const filterBefore = await page.evaluate(() => knowledgeFilterKey());
      await page.locator(`#entityDetail [data-jump="${secondId}"]`).click(); await entityDetail(secondId, entities[2].name);
      assert.equal(await page.locator('#entityDetail .detail-filter-notice').isVisible(), true);
      assert.equal(await page.evaluate(() => knowledgeFilterKey()), filterBefore);
      assert.equal((await stateNav()).topicId, topicIds[0]);
      await page.locator('#entityDetail [data-return-filter]').click();
      assert.equal(await page.evaluate(() => state.relatedDetailId), null);
      assert.equal(await page.evaluate(() => knowledgeFilterKey()), filterBefore);
      assert.deepEqual(await rows(), [sharedId]);
    });
    await test('返回概览保留搜索、多维筛选及展开状态，恢复全库去重统计', async () => {
      await seed(); await chooseFacet('product', '示意产品甲'); await page.fill('#entitySearch', '示意共享实体');
      await navTopic(topicIds[0]).click(); await navEntity(sharedId, topicIds[0]).click();
      const before = await page.evaluate(() => ({ filter: knowledgeFilterKey(), expanded: [...knowledgeNav.expanded] }));
      await overview().focus(); await page.keyboard.press('Enter');
      assert.equal((await stateNav()).topicId, null); assert.equal((await stateNav()).selected, null);
      assert.deepEqual(await page.evaluate(() => ({ filter: knowledgeFilterKey(), expanded: [...knowledgeNav.expanded] })), before);
      assert.deepEqual(await rows(), [sharedId]); await title('知识库概览'); assert.deepEqual(await metrics(), [25, 3, 1, 2]);
    });
    await test('概览话题摘要按钮进入对应话题总览与成员列表', async () => {
      await seed(); await page.locator(`#entityDetail [data-overview-topic="${topicIds[1]}"]`).click();
      assert.equal((await stateNav()).topicId, topicIds[1]);
      assert.equal(await navTopic(topicIds[1]).getAttribute('aria-expanded'), 'true');
      assert.deepEqual(await rows(), sorted([sharedId, secondId])); await title(topics[1].name);
    });
    await test('无成员话题仍可展开并给出空话题反馈与零实体话题总览', async () => {
      await seed(); await navTopic(topicIds[24]).click();
      assert.equal(await navTopic(topicIds[24]).getAttribute('aria-expanded'), 'true');
      assert.ok((await navTopic(topicIds[24]).locator('..').locator('.tree-children .empty').innerText()).includes('该话题暂无实体'));
      assert.deepEqual(await rows(), []); await title(topics[24].name); assert.deepEqual(await metrics(), [1, 0, 0, 0]);
    });
    await test('25 个长话题真实形成垂直 overflow，可用鼠标滚动', async () => {
      await seed(); await page.setViewportSize({ width: 1440, height: 1080 });
      await page.locator('#topicStrip').scrollIntoViewIfNeeded();
      const before = await page.locator('#topicStrip').evaluate(el => ({ height: el.scrollHeight, client: el.clientHeight, top: el.scrollTop, overflowY: getComputedStyle(el).overflowY }));
      assert.ok(before.client > 0 && before.height > before.client + 100, JSON.stringify(before));
      assert.ok(['auto', 'scroll'].includes(before.overflowY));
      await page.locator('#topicStrip').hover(); await page.mouse.wheel(0, 600);
      await page.waitForFunction(() => document.getElementById('topicStrip').scrollTop > 100);
      report.scroll.realWheel = { before, after: await page.locator('#topicStrip').evaluate(el => el.scrollTop) };
      return report.scroll.realWheel;
    });
    await test('renderKnowledge 刷新与搜索/筛选重渲染保持目录 scrollTop', async () => {
      await seed(); await navTopic(topicIds[0]).click(); await navTopic(topicIds[1]).click();
      await page.locator('#topicStrip').evaluate(el => { el.scrollTop = Math.min(480, el.scrollHeight - el.clientHeight - 50); });
      const before = await page.locator('#topicStrip').evaluate(el => el.scrollTop);
      assert.ok(before > 100);
      await page.evaluate(() => renderKnowledge());
      const afterRender = await page.locator('#topicStrip').evaluate(el => el.scrollTop);
      assert.equal(afterRender, before);
      await page.fill('#entitySearch', '示意共享实体');
      const afterSearch = await page.locator('#topicStrip').evaluate(el => el.scrollTop);
      assert.equal(afterSearch, before);
      await page.evaluate(() => toggleFilter('product', '示意产品甲'));
      const afterFilter = await page.locator('#topicStrip').evaluate(el => el.scrollTop);
      assert.equal(afterFilter, before);
      assert.deepEqual((await stateNav()).expanded, sorted(topicIds.slice(0, 2)));
      report.scroll.renderPersistence = { before, afterRender, afterSearch, afterFilter }; return report.scroll.renderPersistence;
    });
    await test('删除当前话题后 renderKnowledge 清除悬空 topicId 与 expanded，保留共享实体', async () => {
      await seed(); await navTopic(topicIds[0]).click(); await navTopic(topicIds[1]).click();
      await page.evaluate(id => {
        const remaining = state.previews.map(entity => ({ ...entity, topics: entity.topics.filter(topic => topic !== id), primaryTopic: entity.primaryTopic === id ? entity.topics.find(topic => topic !== id) || null : entity.primaryTopic }));
        commitFileWorkspace([], state.previewTopics.filter(topic => topic.id !== id), remaining); renderKnowledge();
      }, topicIds[1]);
      assert.equal((await stateNav()).topicId, null);
      assert.deepEqual((await stateNav()).expanded, [topicIds[0]]);
      assert.equal(await navTopic(topicIds[1]).count(), 0); assert.equal(await navEntity(sharedId, topicIds[1]).count(), 0);
      assert.equal(await page.evaluate(id => allEntities().filter(entity => entity.id === id).length, sharedId), 1);
      assert.deepEqual(await rows(), sorted([sharedId, firstId, secondId])); await title('知识库概览');
      assert.deepEqual(await metrics(), [24, 3, 1, 2]);
    });
    await test('删除当前实体后 renderKnowledge 清除悬空选择及所有重复导航引用', async () => {
      await seed(); await navTopic(topicIds[0]).click(); await navTopic(topicIds[1]).click(); await navEntity(sharedId, topicIds[1]).click();
      await page.evaluate(id => { commitFileWorkspace([], state.previewTopics, state.previews.filter(entity => entity.id !== id)); renderKnowledge(); }, sharedId);
      assert.equal(await page.locator(`#topicStrip [data-nav-entity="${sharedId}"]`).count(), 0);
      assert.equal(await row(sharedId).count(), 0); assert.notEqual((await stateNav()).selected, sharedId);
      assert.equal(await page.evaluate(id => state.relatedDetailId === id, sharedId), false);
      assert.deepEqual(await rows(), [secondId]); await entityDetail(secondId, entities[2].name);
      await page.evaluate(id => { commitFileWorkspace([], state.previewTopics, state.previews.filter(entity => entity.id !== id)); renderKnowledge(); }, secondId);
      assert.equal((await stateNav()).selected, null); assert.deepEqual(await rows(), []);
      assert.equal(await page.locator('#entityDetail .detail-title').count(), 0);
      await overview().click(); await title('知识库概览'); assert.deepEqual(await metrics(), [25, 1, 0, 1]);
    });
    await test('删除关联查看的实体后 renderKnowledge 清除悬空 relatedDetailId', async () => {
      await seed(); await page.evaluate(id => openRelatedEntity(id), sharedId);
      assert.equal(await page.evaluate(() => state.relatedDetailId), sharedId);
      await page.evaluate(id => { commitFileWorkspace([], state.previewTopics, state.previews.filter(entity => entity.id !== id)); renderKnowledge(); }, sharedId);
      assert.equal(await page.evaluate(() => state.relatedDetailId), null);
      assert.notEqual((await stateNav()).selected, sharedId);
      assert.equal(await page.locator(`#topicStrip [data-nav-entity="${sharedId}"]`).count(), 0);
    });
    await test('恶意话题及实体名称在左树、中间列表、概览和详情均转义', async () => {
      await seed();
      const evilTopic = '示意恶意话题 <img src=x onerror="window.__topicXss=1"> & "\' <script>window.__topicXss=2</script>';
      const evilEntity = '示意恶意实体 <svg onload="window.__entityXss=1"></svg> & "\' <img src=x onerror="window.__entityXss=2">';
      await page.evaluate(({ evilTopic, evilEntity }) => {
        const topics = structuredClone(state.previewTopics), entities = structuredClone(state.previews);
        topics[0].name = evilTopic; entities[0].name = evilEntity;
        commitFileWorkspace([], topics, entities); renderKnowledge();
      }, { evilTopic, evilEntity });
      assert.equal(await navTopic(topicIds[0]).locator('.tree-label').textContent(), evilTopic);
      assert.equal(await page.locator(`#entityDetail [data-overview-topic="${topicIds[0]}"]`).textContent(), evilTopic);
      assert.equal(await row(sharedId).locator('strong').textContent(), evilEntity);
      const safe = async () => {
        assert.equal(await page.locator('#topicStrip img, #topicStrip svg, #topicStrip script, #entityRows img, #entityRows svg, #entityRows script, #entityDetail img, #entityDetail svg, #entityDetail script').count(), 0);
        assert.deepEqual(await page.evaluate(() => [window.__topicXss || 0, window.__entityXss || 0]), [0, 0]);
      };
      await safe(); await navTopic(topicIds[0]).click(); await title(evilTopic); await safe();
      assert.equal(await navEntity(sharedId, topicIds[0]).locator('.tree-label').textContent(), evilEntity);
      await navEntity(sharedId, topicIds[0]).click(); await entityDetail(sharedId, evilEntity); await safe();
      assert.ok((await page.locator('#entityDetail').innerText()).includes(evilTopic));
    });
    await test('空库概览与空导航正常，统计为零并清理全部悬空导航', async () => {
      await seed(); await navTopic(topicIds[0]).click(); await navEntity(sharedId, topicIds[0]).click();
      await page.evaluate(() => { commitFileWorkspace([], [], []); renderKnowledge(); });
      assert.deepEqual(await stateNav(), { topicId: null, expanded: [], selected: null, topicFilters: [] });
      await title('知识库概览'); assert.deepEqual(await metrics(), [0, 0, 0, 0]);
      assert.equal(await page.locator('#topicStrip [data-nav-topic], #topicStrip [data-nav-entity]').count(), 0);
      assert.equal(await overview().getAttribute('aria-current'), 'page');
      assert.ok((await page.locator('#topicStrip').innerText()).includes('暂无话题'));
      assert.ok((await page.locator('#entityRows').innerText()).includes('暂无实体结果'));
      assert.ok((await page.locator('#entityDetail').innerText()).includes('当前知识库还没有实体'));
    });
    for (const width of [1440, 960, 390]) {
      await test(`${width} 宽度：概览、展开话题、实体详情及多维筛选均无横向 overflow`, async () => {
        await seed(); await page.setViewportSize({ width, height: 1080 });
        for (const scene of ['概览', '展开话题', '实体详情', '多维筛选']) {
          if (scene === '展开话题') { await navTopic(topicIds[0]).click(); await navTopic(topicIds[1]).click(); }
          if (scene === '实体详情') await navEntity(sharedId, topicIds[1]).click();
          if (scene === '多维筛选') await page.locator('details.browse-filters > summary').click();
          const measured = await responsiveMetrics(); report.responsive.push({ scene, ...measured }); noOverflow(measured);
        }
      });
    }
    await test('桌面概览截图保存到指定路径，画面仍为人工示意夹具', async () => {
      await page.setViewportSize({ width: 1440, height: 1080 }); await seed();
      await navTopic(topicIds[0]).click(); await navTopic(topicIds[1]).click(); await overview().click();
      await page.evaluate(() => { document.getElementById('topicStrip').scrollTop = 0; document.getElementById('entityDetail').scrollTop = 0; window.scrollTo(0, 0); });
      await title('知识库概览'); assert.deepEqual(await metrics(), [25, 3, 1, 2]);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      assert.ok(fs.statSync(screenshotPath).size > 0); report.artifacts.push(screenshotPath);
    });
    await test('本地工作区持久化：浏览器页面刷新恢复同一 25 话题与 3 稳定实体，默认仍为概览', async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => fileManagerReady && state.previewTopics.length === 25);
      assert.deepEqual(await stateNav(), { topicId: null, expanded: [], selected: null, topicFilters: [] });
      assert.deepEqual(await rows(), sorted([sharedId, firstId, secondId]));
      assert.deepEqual(await page.evaluate(() => allEntities().map(entity => ({ id: entity.id, topics: entity.topics }))), entities.map(entity => ({ id: entity.id, topics: entity.topics })));
      await title('知识库概览'); assert.deepEqual(await metrics(), [25, 3, 1, 2]);
    });
    await test('无浏览器运行错误、恶意弹窗、模型请求、云写入或未隔离网络请求', async () => {
      assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.dialogs, []);
      assert.deepEqual(report.network.blockedModelCalls, []); assert.deepEqual(report.network.blockedCloudWrites, []);
      assert.deepEqual(report.network.unexpectedRequests, []); assert.equal(report.network.externalRequestsContinued, 0);
    });
  } catch (error) {
    report.fatalError = { message: error.message, stack: error.stack, diagnostic: await diagnostic() };
    console.error(error.stack);
  } finally {
    if (browser) await browser.close().catch(error => { report.closeError = error.message; });
    try {
      const after = fingerprint();
      const unchanged = JSON.stringify(originalAssets) === JSON.stringify(after);
      report.applicationAssets = { unchanged, before: originalAssets, after };
      report.tests.push({ test: '应用所有文件内容保持不变', pass: unchanged });
    } catch (error) { report.tests.push({ test: '应用所有文件内容保持不变', pass: false, error: error.message }); }
    report.finishedAt = new Date().toISOString();
    report.passed = report.tests.filter(test => test.pass).length;
    report.failed = report.tests.filter(test => !test.pass).length;
    report.total = report.tests.length;
    report.success = !report.fatalError && !report.closeError && report.failed === 0;
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ success: report.success, passed: report.passed, failed: report.failed, total: report.total, fatalError: report.fatalError?.message, reportPath, artifacts: report.artifacts }, null, 2));
    if (!report.success) process.exitCode = 1;
  }
})();
