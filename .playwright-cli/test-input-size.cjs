'use strict';
// Measure model input size before/after the two-stage split, using the real cloud vocabulary.
// Read-only: no model call, no cloud write.
const fs = require('node:fs'), path = require('node:path');
const {chromium} = require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const root = 'C:/Users/louisxzlu/WorkBuddy/2026-09-18-16-22-25';
(async () => {
  let browser;
  try {
    browser = await chromium.launch({channel: 'chrome', headless: true});
    const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
    const writes = [];
    page.on('request', r => { if (['POST','PATCH','PUT','DELETE'].includes(r.method())) writes.push(r.method() + ' ' + new URL(r.url()).pathname); });
    await page.goto('https://wiki-mvp-lab.app-tencent.workbuddy.host/', {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => typeof savedWorkbook !== 'undefined' && savedWorkbook && String(workbookRevision) !== '0', null, {timeout: 60000});
    const out = await page.evaluate(() => {
      const source = JSON.parse(window.__pdfText || 'null') || '第二章 核心系统\n1. 武学系统\n武学是燕云十六声的核心战斗系统。\n2. 家园系统\n家园可以招募庄客。\n佛光玉可以提升战斗能力。';
      const cleaned = wikiCleanSourceNoise(source);
      const parts = splitSourceForModel(cleaned);
      const snapshot = {revision: workbookRevision, workbook: savedWorkbook};
      const ctx = i => ({snapshot, sourceName: 'x.pdf', modelId: 'test', documentContext: wikiDocumentContext(cleaned, 'x.pdf'),
        historySnapshot: {topics: [], entities: []}, segmentIndex: i + 1, segmentCount: parts.length, part: parts[i]});
      const single = parts.map((p, i) => buildModelInput(DEFAULT_PROMPTS, p.text, snapshot, ctx(i)).length);
      const topic = parts.map((p, i) => buildTopicStageInput(DEFAULT_PROMPTS, p.text, snapshot, ctx(i)).length);
      // Simulate 6 confirmed topics for the entity stage.
      const fakeTopics = Array.from({length: 6}, (_, n) => ({local_id: 'T' + (n + 1), id: 'P1-T' + (n + 1), name: '燕云十六声的示例话题' + (n + 1), scope: '范围' + n}));
      const entity = parts.map((p, i) => buildEntityStageInput(DEFAULT_PROMPTS, p.text, snapshot, ctx(i), fakeTopics).length);
      const sample = buildEntityStageInput(DEFAULT_PROMPTS, parts[0].text, snapshot, ctx(0), fakeTopics);
      const single0 = buildModelInput(DEFAULT_PROMPTS, parts[0].text, snapshot, ctx(0));
      return {
        cleanedChars: cleaned.length, partCount: parts.length, typeCount: controlledTypes().length, workbookRevision: String(workbookRevision),
        single, topic, entity,
        singleTotal: single.reduce((a, b) => a + b, 0),
        twoStageTotal: topic.reduce((a, b) => a + b, 0) + entity.reduce((a, b) => a + b, 0),
        entityVsSingle: entity.map((v, i) => v - single[i]),
        entityHasTopicsSchema: /只输出完整JSON：\{"topics":/.test(sample),
        entitySchemaHead: sample.slice(sample.indexOf('只输出完整JSON：'), sample.indexOf('只输出完整JSON：') + 40),
        entityHasRelations: sample.includes('relation_type_id') && sample.includes('RT-'),
        entityHasTypes: sample.includes('ET-'),
        entityHasStep2: sample.includes(String(DEFAULT_PROMPTS.step2).slice(0, 60)),
        singleHasRelations: single0.includes('relation_type_id') && single0.includes('RT-'),
        singleHasTopicsSchema: /只输出完整JSON：\{"topics":/.test(single0),
        timeouts: {idle: WIKI_IDLE_TIMEOUT_MS, total: WIKI_TOTAL_TIMEOUT_MS}
      };
    });
    console.log(JSON.stringify({...out, writes}, null, 1));
  } catch (error) {
    console.log(JSON.stringify({error: String(error.message || error)}));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
})();
