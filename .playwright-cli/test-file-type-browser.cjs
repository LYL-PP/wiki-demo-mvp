'use strict';
const {chromium} = require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../wiki-demo-mvp');
(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  try {
    const page = await browser.newPage(), errors = [], writes = [], promptWrites = [], tests = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const q = route.request(), url = new URL(q.url());
      if (!['GET', 'HEAD'].includes(q.method())) {writes.push(q.method() + ' ' + url.pathname); return route.abort();}
      if (url.hostname !== '127.0.0.1') return route.fulfill({contentType: 'application/javascript', body: ''});
      if (['/semantic-tags.js', '/pipeline.js', '/file-manager.js'].includes(url.pathname)) return route.fulfill({contentType: 'application/javascript', body: fs.readFileSync(root + url.pathname, 'utf8')});
      return route.fulfill({contentType: 'text/html', body: fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace('<script>init();</script>', '<script>initCloud=async()=>{};init();</script>')});
    });
    await page.exposeFunction('recordPromptWrite', key => promptWrites.push(key));
    await page.addInitScript(() => {
      const keys = ['wiki_preview_v1_prompts', 'wiki_preview_v1_baseline'];
      for (const key of keys) if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({step5: key + '自定义'}));
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {if (keys.includes(key)) window.recordPromptWrite(key); return original.call(this, key, value);};
    });
    await page.goto('http://127.0.0.1:18744/', {waitUntil: 'domcontentloaded'});
    tests.push(...await page.evaluate(() => {
      const tests = [], ok = (name, condition) => {if (!condition) throw Error(name); tests.push(name);};
      const row = (id, label, aliases = '') => [id, '测试', label, '定义', '示例', '边界', '单选', 'active', aliases];
      const workbook = {sheets: [
        {name: '实体类型标签', rows: [[], [], [], ['类型 ID', '管理分组', '正式标签', '定义', '包含示例', '排除与边界', '赋值规则', '状态', '同义词'], row('ET-WEAPON', '武器', 'weapon'), row('ET-SKILL', '技能', 'skill')]},
        {name: '业务分面', rows: [[], [], [], ['分面 ID', '分面名称', '正式取值', '值类型', '基数', '值来源', '主要用途', '未命中处理'], ['F1', '产品', '开放', '文本', '多值', '原文', '索引', '建议']]},
        {name: '赋值与治理规则', rows: [[], [], [], ['规则 ID', '场景', '规则', '程序门控', '处理方式'], ['G1', '测试', '单选', '校验', '复核']]}
      ]};
      savedWorkbook = workbook; draftWorkbook = structuredClone(workbook); workbookReady = true; workbookRowId = 1;
      ok('浏览器校验合法9列词表', validateWorkbook(workbook) === workbook);
      const make = (name, type, typeId, product, version) => {
        const text = `${product}${version}中银剑用于攻击。`, file = registerArchiveSource({name, text, size: text.length}), part = {index: 1, start: 0, end: text.length, text};
        const raw = {topics: [{id: 'T1', name: '银剑攻击设计', quote: text, scope: '攻击', object_anchor: '银剑', core_question: '攻击机制'}], entities: [{id: 'M1', name: '银剑', type, type_id: typeId, quote: text, definition: '共享银剑实体', topic_ids: ['T1'], anchors: {ontology_type: '武器', reality_domain: '虚构', product_ip_scope: '共同身份'}, facets: {product: [{value: product, basis: 'explicit', quote: text}], version: [{value: version, basis: 'explicit', quote: text}]}, candidate_tags: [], relations: []}], review: []};
        const groups = {topic_groups: [{id: 'GT1', members: ['P1-T1'], decision: 'keep', reason: '同问题'}], entity_groups: [{id: 'GE1', members: ['P1-M1'], decision: 'keep', reason: '独立身份', topics: ['GT1'], primary_topic: 'GT1'}]};
        const context = {parts: [part], snapshot: {workbook, revision: 1}, sourceName: name, sourceId: file.id, sourceRevision: file.revision, historySnapshot: {topics: [], entities: []}};
        const result = assembleIntegratedResult(validateChunkCandidates(raw, part, text, workbook), groups, text, context);
        result.source.file_id = file.id; result.source.file_revision = file.revision;
        addLocalPreview(result); return file.id;
      };
      const A = make('A.txt', '武器', 'ET-WEAPON', '星河', 'v1');
      const B = make('B.txt', null, null, '星海', 'v2');
      ok('完整整合与入库入口共享实体保留合法类型', state.previews.length === 1 && state.previews[0].fileContributions.length === 2 && state.previews[0].tags.typeId === 'ET-WEAPON');
      ok('缺失来源诊断与有效实体级类型分离', !state.previews[0].typeIssue && state.previews[0].typeSourceIssues.length === 1 && state.previews[0].typeSourceIssues[0].source.fileId === B);
      setPage('knowledge'); state.selectedEntity = state.previews[0].id; renderKnowledge();
      ok('真实页面合法共享类型不进入复核队列', typeReviewItems().length === 0 && !document.getElementById('entityDetail').textContent.includes('主类型待复核'));
      ok('两个来源分面均在筛选helper内', entityFilterValues(state.previews[0], 'product').join() === '星河,星海' && entityFilterValues(state.previews[0], 'version').join() === 'v1,v2');
      updateArchiveFile(B, 'B改名.txt', state.files.find(f => f.id === B).text);
      ok('缺类型来源改名重建诊断不影响合法类型', state.previews[0].tags.typeId === 'ET-WEAPON' && state.previews[0].typeSourceIssues[0].source.file === 'B改名.txt');
      const prior = JSON.stringify(state.previews); const missingPlan = planFileRemoval(A);
      ok('撤销唯一合法来源后剩余来源进入类型复核', entityTypeReviewNeeded(missingPlan.entities[0], workbook) && missingPlan.entities[0].typeIssue && missingPlan.entities[0].suggestedFacets.product.join() === '星海');
      ok('影响预览不改当前数据', JSON.stringify(state.previews) === prior);
      deleteArchiveFile(B, true);
      ok('实际删除缺类型来源清掉诊断与分面', state.previews[0].typeSourceIssues.length === 0 && !state.previews[0].typeIssue && entityFilterValues(state.previews[0], 'product').join() === '星河' && entityFilterValues(state.previews[0], 'version').join() === 'v1');
      const C = make('C.txt', '技能', 'ET-WEAPON', '星云', 'v3');
      ok('完整入口ID标签冲突不能被另一合法来源掩盖', state.previews.length === 1 && state.previews[0].tags.type.length === 0 && state.previews[0].typeIssue && typeReviewItems().length === 1);
      normalizeStoredPreviews();
      ok('再次归一后真正冲突仍复核', state.previews[0].tags.type.length === 0 && typeReviewItems().length === 1);
      deleteArchiveFile(C, true);
      ok('实际删除冲突来源后合法类型与筛选恢复', state.previews[0].tags.typeId === 'ET-WEAPON' && typeReviewItems().length === 0 && !JSON.stringify(state.previews).includes('星云'));
      setPage('workbook'); workbookSheet = 0; renderWorkbook();
      ok('第九列别名编辑器真实可见', document.querySelectorAll('#workbookTable [data-col="8"]').length === 2);
      return tests;
    }));
    await page.locator('#workbookTable [data-row="5"][data-col="8"]').fill('ｗｅａｐｏｎ');
    const rejected = await page.evaluate(() => {try {validateWorkbook(draftWorkbook); return false;} catch (error) {return /冲突/.test(error.message) && savedWorkbook.sheets[0].rows[5][8] === 'skill';}});
    assert(rejected); tests.push('真实第九列输入归一后冲突被拒绝，已保存词表未变');
    await page.reload({waitUntil: 'domcontentloaded'});
    assert(await page.evaluate(() => state.previews.length === 1 && state.previews[0].tags.typeId === 'ET-WEAPON' && !state.previews[0].typeIssue && state.previews[0].typeSourceIssues.length === 0));
    tests.push('刷新后文件贡献和合法主类型恢复无旧诊断');
    assert.deepEqual(errors, []); assert.deepEqual(writes, []); assert.deepEqual(promptWrites, []);
    tests.push('页面错误、网络写入、自定义Prompt覆写均为0');
    console.log(JSON.stringify({passed: tests.length, tests, pageErrors: errors, blockedWrites: writes, promptWrites,
      kind: '离线Playwright全请求拦截；真实加载和编辑、完整整合入库、改名删除及刷新；不连接云不发布'}, null, 2));
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
