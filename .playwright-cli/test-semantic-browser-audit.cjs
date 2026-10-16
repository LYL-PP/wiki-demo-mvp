'use strict';
const {chromium} = require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../wiki-demo-mvp');
(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  try {
    const page = await browser.newPage(), errors = [], blocked = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      if (url.hostname !== '127.0.0.1') return route.fulfill({contentType: 'application/javascript', body: ''});
      if (request.method() !== 'GET') {blocked.push(request.method() + ' ' + url.pathname); return route.abort();}
      if (['/semantic-tags.js', '/pipeline.js', '/file-manager.js'].includes(url.pathname)) return route.fulfill({contentType: 'application/javascript', body: fs.readFileSync(root + url.pathname, 'utf8')});
      return route.fulfill({contentType: 'text/html', body: fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace('<script>init();</script>', '<script>initCloud=async()=>{};init();</script>')});
    });
    await page.addInitScript(() => {
      localStorage.setItem('wiki_preview_v1_prompts', JSON.stringify({step5: '新版自定义保真'}));
      localStorage.setItem('wiki_preview_v1_baseline', JSON.stringify({step5: '基线自定义保真'}));
    });
    await page.goto('http://127.0.0.1:18743/', {waitUntil: 'domcontentloaded'});
    const tests = await page.evaluate(() => {
      const tests = [], ok = (name, condition) => {if (!condition) throw Error(name); tests.push(name);};
      const workbook = {sheets: [{name: '实体类型标签', rows: [[], [], [], [], ['ET-WEAPON', '对象', '武器', '武器定义', '', '', '', 'active', '兵器'], ['ET-SKILL', '玩法', '技能', '技能定义', '', '', '', 'active']]}, {name: '业务分面', rows: []}, {name: '赋值与治理规则', rows: []}, defaultRelationSheet()]};
      savedWorkbook = workbook; draftWorkbook = structuredClone(workbook); workbookReady = true;
      ok('浏览器真实加载semantic helper与pipeline覆盖函数', typeof extractSemanticFacets === 'function' && normalizeControlledRelation({predicate: ' 采 用 ', strength: 'strong'}, workbook).ok);
      ok('浏览器两套自定义Prompt未覆写', state.prompts.step5 === '新版自定义保真' && state.baselinePrompts.step5 === '基线自定义保真');
      const source = '星河v2中银剑使用着色器。', part = {index: 1, start: 0, end: source.length, text: source};
      const raw = {topics: [{id: 'T1', name: '星河银剑着色器', quote: source, scope: '着色器', object_anchor: '星河', core_question: '着色器'}], entities: [{id: 'M1', name: '银剑', quote: source, type_id: 'ET-WEAPON', type: '兵器', definition: '离线专项样本', topic_ids: ['T1'], anchors: {ontology_type: '武器', reality_domain: '虚构', product_ip_scope: '星河'}, facets: {product: [{value: '星河', basis: 'explicit', quote: source}], discipline: [{value: '图形渲染', basis: 'inferred', quote: source, reason: '着色器实现属于图形渲染'}], version: [{value: 'v2', basis: 'explicit', quote: source}]}, candidate_tags: ['产品:污染产品', '版本:污染版本', '专业:污染专业', '探索词'], relations: [null]}], review: []};
      const mapping = {topic_groups: [{id: 'GT1', members: ['P1-T1'], decision: 'keep', reason: '独立问题'}], entity_groups: [{id: 'GE1', members: ['P1-M1'], decision: 'keep', reason: '独立身份', topics: ['GT1'], primary_topic: 'GT1'}]};
      const context = {parts: [part], snapshot: {workbook, revision: 1}, sourceName: '离线专项样本.txt', historySnapshot: {topics: [], entities: []}};
      const result = assembleIntegratedResult(validateChunkCandidates(raw, part, source, workbook), mapping, source, context);
      ok('误放candidate和异常Relation只诊断，不增加主类型复核', result.metrics.reviews === 0 && result.steps.step6.decision === 'ready' && result.steps.diagnostics.candidate_issues.length === 3 && result.steps.diagnostics.isolated_relations.length === 1);
      const poisoned = {semanticFacetDetails: [], candidateTags: ['产品:污染产品', '版本:污染版本'], tags: {type: ['武器'], typeId: 'ET-WEAPON'}};
      ok('正式筛选helper不吸收新协议candidate前缀', entityFilterValues(poisoned, 'product').length === 0 && entityFilterValues(poisoned, 'version').length === 0);
      const legacy = {candidateTags: ['产品:旧产品', '版本:v1']};
      ok('旧存量可legacy显示且不伪造证据', semanticFacetStorage(legacy).facetDetails.every(detail => detail.basis === 'legacy' && detail.evidences.length === 0));
      renderResult(document.getElementById('currentResult'), result);
      ok('对比渲染展示专业推断理由和逐字证据', document.getElementById('currentResult').textContent.includes('语义推断') && document.getElementById('currentResult').textContent.includes('着色器实现属于图形渲染') && document.getElementById('currentResult').textContent.includes('原文字符'));
      commitFileWorkspace([], [], []);
      const file = registerArchiveSource({name: context.sourceName, text: source, size: source.length});
      result.source.file_id = file.id; result.source.file_revision = file.revision;
      addLocalPreview(result);
      ok('文件贡献链路保存合法分面，不保存candidate污染', state.previews.length === 1 && state.previews[0].semanticFacetDetails.length === 3 && state.previews[0].candidateTags.join() === '探索词' && !JSON.stringify(state.previews[0]).includes('污染'));
      ok('文件贡献保留证据和全局offset', state.previews[0].fileContributions[0].data.semanticFacetDetails.every(detail => detail.evidences.every(q => source.slice(q.start, q.end) === q.exact_quote)));
      ok('文件贡献筛选维度仍为product/discipline/version开放值', entityFilterValues(state.previews[0], 'product').join() === '星河' && entityFilterValues(state.previews[0], 'discipline').join() === '图形渲染' && entityFilterValues(state.previews[0], 'version').join() === 'v2');
      setPage('knowledge'); state.selectedEntity = state.previews[0].id; renderKnowledge();
      ok('知识浏览筛选没有污染值', !document.getElementById('filterGroups').textContent.includes('污染'));
      ok('详情保留专业reason与证据', document.getElementById('entityDetail').textContent.includes('着色器实现属于图形渲染') && document.getElementById('entityDetail').textContent.includes(source));
      ok('合法主类型不被分面异常送入复核', typeReviewItems().length === 0);
      const original = JSON.stringify(result), before = structuredClone(result); before.steps.step5.entity_results[0].tags.facets = ['产品:旧产品', '版本:v1']; before.steps.step5.entity_results[0].tags.semantic_facets = [];
      ok('浏览器旧字符串facets对比兼容', diffSummary(before, result).some(diff => diff.text.includes('分面语义识别')) && JSON.stringify(result) === original);
      for (const entity of state.previews) normalizeStoredEntityTags(entity, workbook);
      ok('再次旧存量归一不引入污染并保留证据', state.previews[0].semanticFacetDetails.length === 3 && !JSON.stringify(state.previews).includes('污染'));
      return tests;
    });
    assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
    console.log(JSON.stringify({passed: tests.length, tests, pageErrors: errors, blockedWrites: blocked, kind: '离线Playwright本地资源回归；全部请求拦截、不连接云、不发布'}, null, 2));
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
