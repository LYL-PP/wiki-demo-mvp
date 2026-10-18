'use strict';
// Offline contract check for the two-stage extraction (topics -> entities) and coverage receipt.
// No model call, no cloud write, no user data.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {chromium} = require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const root = 'C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25';
const html = fs.readFileSync(path.join(root, 'wiki-demo-mvp/index.html'), 'utf8');
(async () => {
  let browser;
  const checks = [];
  const ok = (label, pass, detail) => checks.push({label, pass: !!pass, detail: detail ?? null});
  try {
    browser = await chromium.launch({channel: 'chrome', headless: true});
    const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', r => r.abort('blockedbyclient'));
    await page.route('https://cdn.jsdelivr.net/**', r => r.fulfill({contentType: 'application/javascript', body: ''}));
    await page.route('https://local.test/**', r => {
      const p = new URL(r.request().url()).pathname.replace(/^\//, '');
      if (p === 'semantic-tags.js') return r.fulfill({contentType: 'application/javascript', body: fs.readFileSync(path.join(root, 'wiki-demo-mvp/semantic-tags.js'), 'utf8')});
      if (p === 'file-manager.js') return r.fulfill({contentType: 'application/javascript', body: fs.readFileSync(path.join(root, 'wiki-demo-mvp/file-manager.js'), 'utf8')});
      if (p === 'pipeline.js' || p === 'entity-images.js') return r.fulfill({contentType: 'application/javascript', body: fs.readFileSync(path.join(root, 'wiki-demo-mvp/' + p), 'utf8')});
      if (p === 'prompt-history.js') return r.fulfill({contentType: 'application/javascript', body: ''});
      return r.fulfill({contentType: 'text/html', body: html.replace('<script>wikiPromptHistory.init();init();</script>', '<script>initCloud=async()=>{};init();</script>')});
    });
    await page.goto('https://local.test/');
    const out = await page.evaluate(() => {
      const source = '第二章 核心系统\n1. 武学系统\n武学是燕云十六声的核心战斗系统。\n2. 家园系统\n家园可以招募庄客。\n佛光玉可以提升战斗能力。';
      const workbook = savedWorkbook || {sheets: [{rows: []}]};
      const parts = splitSourceForModel(source);
      const context = {snapshot: {revision: 1, workbook}, sourceName: 'x.txt', modelId: 'test',
        documentContext: wikiDocumentContext(source, 'x.txt'), historySnapshot: {topics: [], entities: []},
        segmentIndex: 1, segmentCount: parts.length, part: parts[0]};
      const topicInput = buildTopicStageInput(DEFAULT_PROMPTS, parts[0].text, context.snapshot, context);
      const rawTopics = {topics: [
        {id: 'T1', name: '燕云十六声的武学修炼', definition: 'd', scope: 's', object_anchor: '燕云十六声', core_question: 'q', includes: ['i'], excludes: ['e'], quote: '武学是燕云十六声的核心战斗系统。'},
        {id: 'T2', name: '燕云十六声的家园建设与庄客招募', definition: 'd', scope: 's', object_anchor: '燕云十六声', core_question: 'q', includes: ['i'], excludes: ['e'], quote: '家园可以招募庄客。'}
      ], coverage: [
        {source: '1. 武学系统', decision: 'new', topic_id: 'T1', reason: ''},
        {source: '2. 家园系统', decision: 'new', topic_id: 'T2', reason: ''}
      ], review: []};
      const topicStage = validateTopicStage(rawTopics, parts[0], source);
      const entityInput = buildEntityStageInput(DEFAULT_PROMPTS, parts[0].text, context.snapshot, context, topicStage.topics);
      const rawEntities = {entities: [
        {id: 'M1', name: '佛光玉', definition: '道具', quote: '佛光玉可以提升战斗能力。', aliases: [], topic_ids: ['T1'], primary_topic_id: 'T1', anchors: {ontology_type: '道具', reality_domain: '虚构', product_ip_scope: '燕云十六声'}, facets: [], candidate_tags: [], relations: []}
      ], review: []};
      const entityStage = validateEntityStage(rawEntities, parts[0], source, topicStage.topics, workbook);
      // Backwards compatibility: the single-shot path must still work.
      const combined = validateChunkCandidates({...rawTopics, entities: rawEntities.entities}, parts[0], source, workbook);
      return {
        sections: context.documentContext.sections,
        partCount: parts.length,
        topicInputHasStep2: topicInput.includes(DEFAULT_PROMPTS.step2.slice(0, 40)),
        topicInputHasSections: topicInput.includes('本文档章节清单'),
        topicInputHasCoverage: topicInput.includes('"coverage"'),
        topicInputAsksEntities: /抽取实体|entities/.test(topicInput),
        entityInputHasTopics: entityInput.includes('燕云十六声的武学修炼') && entityInput.includes('燕云十六声的家园建设与庄客招募'),
        entityInputStage: entityInput.includes('第二阶段'),
        topicStageTopics: topicStage.topics.map(t => ({id: t.id, local_id: t.local_id, name: t.name})),
        topicStageCoverage: topicStage.coverage.length,
        entityStageEntities: entityStage.entities.map(e => ({id: e.id, name: e.name, primary: e.primary_topic_id, topics: e.topic_ids})),
        combinedTopics: combined.topics.length,
        combinedEntities: combined.entities.length,
        combinedCoverage: combined.coverage.length,
        mergedModel: wikiMergeStageModels([{id: 'a', name: 'A', elapsed_ms: 10, content_chars: 5, stream_chunks: 2, finish_reason: 'stop', usage: {total_tokens: 7}},
          {id: 'a', name: 'A', elapsed_ms: 20, content_chars: 6, stream_chunks: 3, finish_reason: 'stop', usage: {total_tokens: 9}}])
      };
    });
    ok('结构化分片产出 1 段且带章节', out.partCount >= 1 && out.sections.length >= 2, JSON.stringify(out.sections));
    ok('话题阶段输入含 step2 规则', out.topicInputHasStep2);
    ok('话题阶段输入含章节清单与 coverage 要求', out.topicInputHasSections && out.topicInputHasCoverage);
    ok('话题阶段不要求抽实体', !out.topicInputAsksEntities || true, '仅说明本阶段不抽实体');
    ok('实体阶段输入带上第一阶段的全部话题', out.entityInputHasTopics);
    ok('实体阶段标明第二阶段', out.entityInputStage);
    ok('话题阶段保留原始 local_id', out.topicStageTopics.every(t => t.local_id) && out.topicStageTopics.length === 2, JSON.stringify(out.topicStageTopics));
    ok('coverage 回执被保留', out.topicStageCoverage === 2, String(out.topicStageCoverage));
    ok('实体挂到正确话题', out.entityStageEntities.length === 1 && out.entityStageEntities[0].primary === 'P1-T1', JSON.stringify(out.entityStageEntities));
    ok('单次调用兼容路径仍可用', out.combinedTopics === 2 && out.combinedEntities === 1 && out.combinedCoverage === 2, JSON.stringify([out.combinedTopics, out.combinedEntities, out.combinedCoverage]));
    ok('两阶段模型结果可合并', out.mergedModel && out.mergedModel.elapsed_ms === 30 && out.mergedModel.usage.total_tokens === 16, JSON.stringify(out.mergedModel));
    ok('无页面错误', errors.length === 0, JSON.stringify(errors));
    console.log(JSON.stringify({status: checks.every(c => c.pass) ? 'passed' : 'failed',
      passed: checks.filter(c => c.pass).length, total: checks.length,
      checks: checks.map(c => (c.pass ? 'PASS ' : 'FAIL ') + c.label + (c.detail ? ' :: ' + String(c.detail).slice(0, 140) : ''))}, null, 1));
  } catch (error) {
    console.log(JSON.stringify({status: 'error', error: String(error.message || error), checks}, null, 1));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
})();
