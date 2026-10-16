'use strict';
// The output schema handed to the model must itself be parseable JSON.
const {chromium} = require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
(async () => {
  let browser;
  try {
    browser = await chromium.launch({channel: 'chrome', headless: true});
    const page = await browser.newPage();
    await page.goto('https://wiki-mvp-lab.app-tencent.workbuddy.host/', {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => typeof savedWorkbook !== 'undefined' && savedWorkbook && typeof buildEntityStageInput === 'function', null, {timeout: 60000});
    const out = await page.evaluate(() => {
      const grab = input => {
        const at = input.indexOf('只输出完整JSON：');
        const end = input.indexOf('。每条证据');
        return at < 0 || end < 0 ? null : input.slice(at + '只输出完整JSON：'.length, end);
      };
      const parse = text => { try { const v = JSON.parse(text); return {ok: true, keys: Object.keys(v)}; } catch (e) { return {ok: false, error: e.message, head: text.slice(0, 60)}; } };
      const source = '第二章 核心系统\n1. 武学系统\n武学是燕云十六声的核心战斗系统。';
      const parts = splitSourceForModel(source);
      const snapshot = {revision: workbookRevision, workbook: savedWorkbook};
      const ctx = {snapshot, sourceName: 'x', modelId: 't', documentContext: wikiDocumentContext(source, 'x'),
        historySnapshot: {topics: [{name: '旧话题', scope: 's', object_anchor: 'a', core_question: 'q'}], entities: [{name: '旧实体', disambiguator: '', anchors: {}}]},
        segmentIndex: 1, segmentCount: parts.length, part: parts[0]};
      const single = grab(buildModelInput(DEFAULT_PROMPTS, source, snapshot, ctx));
      const topic = grab(buildTopicStageInput(DEFAULT_PROMPTS, source, snapshot, ctx));
      const entity = grab(buildEntityStageInput(DEFAULT_PROMPTS, source, snapshot, ctx, [{local_id: 'T1', id: 'P1-T1', name: '话题一', scope: 's'}]));
      return {single: parse(single), topic: parse(topic), entity: parse(entity),
        entityHasHistoryEntities: buildEntityStageInput(DEFAULT_PROMPTS, source, snapshot, ctx, []).includes('旧实体'),
        entityHasHistoryTopics: buildEntityStageInput(DEFAULT_PROMPTS, source, snapshot, ctx, []).includes('旧话题'),
        singleHasHistoryTopics: buildModelInput(DEFAULT_PROMPTS, source, snapshot, ctx).includes('旧话题')};
    });
    const pass = out.single.ok && out.topic.ok && out.entity.ok;
    console.log(JSON.stringify({status: pass ? 'passed' : 'failed', ...out}, null, 1));
  } catch (e) { console.log(JSON.stringify({status: 'error', error: String(e.message || e)})); }
  finally { if (browser) await browser.close().catch(() => {}); }
})();
