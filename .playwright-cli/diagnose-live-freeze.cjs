// 只读诊断：在线上页面内注入多种历史知识结构，检查渲染链路是否抛错/卡住。
// 不点击运行、不调用模型、不写 storage、不修改共享配置。
const {chromium} = require('C:/Users/louisxzlu/.workbuddy/binaries/node/workspace/node_modules/playwright');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const URL_BASE = process.argv[2] || 'https://wiki-mvp-lab.app-tencent.workbuddy.host/';

const FIXTURE = `
(function build(variant, scale){
  const lines = scale.lines, topicCount = scale.topics, entityCount = scale.entities, product = '燕云十六声';
  const body = ['# ' + product + ' 最新版本攻略：从入门到精通'];
  for (let i = 1; i < lines; i++) body.push('第' + i + '段：本段介绍' + product + '中的战斗与探索内容，包含若干机制说明与操作建议。');
  const text = variant.fileTextNull ? null : body.join('\\n');
  const offsets = []; let cursor = 0;
  for (const line of body) { offsets.push([cursor, cursor + line.length]); cursor += line.length + 1; }
  const quoteAt = i => ({exact_quote: body[i], start: offsets[i][0], end: offsets[i][1]});
  const withId = i => variant.noFileId ? {exact_quote: body[i], start: offsets[i][0], end: offsets[i][1], file: product + '攻略.pdf'} : {...quoteAt(i), fileId: 'F1', revision: 1, file: product + '攻略.pdf'};
  const file = {id: 'F1', name: product + '攻略.pdf', revision: 1, size: body.join('\\n').length, text};
  const topics = [];
  for (let t = 0; t < topicCount; t++) {
    const name = product + '的' + ['江湖弈玩法', '流派选择', '武学修炼与搭配', '家园建设与庄客招募', '开荒顺序与任务探索'][t % 5] + (t >= 5 ? '·' + t : '');
    const idx = 1 + (t * 7) % (lines - 2);
    const data = {name, primaryTopic: 'PT-' + t, topics: ['PT-' + t], evidences: variant.topicNoEvidence ? [] : [withId(idx)], sources: [withId(idx)], quote: body[idx]};
    const topic = {id: 'PT-' + t, name, desc: name + '的范围', scope: '范围覆盖', object_anchor: product + '中的相关内容', core_question: '问题', includes: [], excludes: [], quote: body[idx], evidences: variant.topicNoEvidence ? [] : [withId(idx)], sources: [withId(idx)]};
    if (!variant.legacySchema) topic.fileContributions = [{fileId: 'F1', revision: 1, data}];
    if (variant.topicLegacy) topic.fileContributions = [{fileId: 'F1', revision: 1, legacy: true, data}];
    topics.push(topic);
  }
  const gameIdx = 3;
  const gameData = {name: product, primaryTopic: 'PT-0', topics: ['PT-0'], tags: {type: ['游戏产品'], typeId: 'ET-PROD-GAME'}, identityAnchors: {ontologyType: '产品', realityDomain: '现实产品', productIpScope: product}, sources: [withId(gameIdx)], summary: '一款开放世界武侠游戏'};
  const game = {...gameData, id: 'EN-GAME', aliases: [], facts: [], relations: []};
  if (!variant.legacySchema) game.fileContributions = [{fileId: 'F1', revision: 1, data: gameData}];
  const entities = [game];
  for (let i = 0; i < entityCount; i++) {
    const idx = 10 + (i * 11) % (lines - 12), topic = topics[i % topicCount], name = '佛光玉' + i;
    const data = {name, primaryTopic: topic.id, topics: [topic.id], tags: {type: ['道具'], typeId: 'ET-ITEM-PROP'}, identityAnchors: {ontologyType: '虚构对象', realityDomain: '虚构世界', productIpScope: product}, sources: [withId(idx)], summary: name + '是' + product + '中的道具。'};
    const entity = {id: 'EN-' + i, name, primaryTopic: topic.id, topics: [topic.id], summary: data.summary, tags: {type: ['道具'], typeId: 'ET-ITEM-PROP'}, aliases: [], facts: [], relations: [], identityAnchors: data.identityAnchors, sources: [withId(idx)]};
    if (!variant.legacySchema) entity.fileContributions = [{fileId: 'F1', revision: 1, data}];
    if (variant.contributionDataMissing) entity.fileContributions = [{fileId: 'F1', revision: 1}];
    entities.push(entity);
  }
  return {file, topics, entities};
})
`;

const VARIANTS = [
  {name: 'A 新协议·干净', variant: {}, scale: {lines: 1500, topics: 30, entities: 200}},
  {name: 'B 旧 schema·无贡献结构', variant: {legacySchema: true}, scale: {lines: 1500, topics: 30, entities: 200}},
  {name: 'C 来源缺 fileId', variant: {noFileId: true}, scale: {lines: 1500, topics: 30, entities: 200}},
  {name: 'D 历史文件无原文', variant: {fileTextNull: true}, scale: {lines: 1500, topics: 30, entities: 200}},
  {name: 'E 话题无证据', variant: {topicNoEvidence: true}, scale: {lines: 1500, topics: 30, entities: 200}},
  {name: 'F 贡献缺 data', variant: {contributionDataMissing: true}, scale: {lines: 1500, topics: 30, entities: 200}},
  {name: 'G 历史话题旧引用', variant: {topicLegacy: true}, scale: {lines: 1500, topics: 30, entities: 200}},
  {name: 'H 大库 1200 实体', variant: {}, scale: {lines: 3000, topics: 60, entities: 1200}}
];

(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  const report = {url: URL_BASE, variants: [], pageErrors: []};
  try {
    const context = await browser.newContext({serviceWorkers: 'block'});
    const page = await context.newPage();
    page.on('pageerror', e => report.pageErrors.push(e.message));
    await page.goto(URL_BASE, {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => typeof state !== 'undefined' && typeof renderKnowledge === 'function', null, {timeout: 60000});
    const baseline = await page.evaluate(() => ({files: state.files?.length || 0, entities: state.previews.length, topics: state.previewTopics.length}));
    report.baseline = baseline;

    for (const item of VARIANTS) {
      const result = await page.evaluate(async ([fixtureSource, variant, scale]) => {
        const build = eval(fixtureSource);
        const fixture = build(variant, scale);
        const errors = [];
        const timings = {};
        const run = (label, fn) => {const t0 = performance.now(); try {fn(); timings[label] = Math.round(performance.now() - t0); return null;} catch (e) {timings[label] = Math.round(performance.now() - t0); errors.push(label + ': ' + (e && e.message || String(e)) + ' @ ' + (e && e.stack || '').split('\\n')[1]); return e;}};
        window.__fixture = fixture;
        state.files = [fixture.file];
        state.previewTopics = fixture.topics;
        state.previews = fixture.entities;
        run('renderTopics', () => renderTopics());
        run('renderKnowledge', () => renderKnowledge());
        run('setPageKnowledge', () => setPage('knowledge'));
        run('openTopic', () => openKnowledgeTopic('PT-1'));
        run('entityDetail', () => openKnowledgeEntity('EN-5'));
        run('exportSnapshot', () => {const snap = knowledgeExportSnapshot('all'); timings.exportRows = snap.sheets.map(s => s.rows.length);});
        // 还原为空库
        state.files = []; state.previewTopics = []; state.previews = [];
        return {errors, timings};
      }, [FIXTURE, item.variant, item.scale]);
      report.variants.push({name: item.name, ...result});
      console.log(JSON.stringify({name: item.name, ...result}));
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(root, 'outputs/wiki-live-freeze-diagnosis.json'), JSON.stringify(report, null, 2));
  console.log('PAGE_ERRORS=' + JSON.stringify(report.pageErrors));
})().catch(e => {console.error('FATAL', e); process.exitCode = 1;});
